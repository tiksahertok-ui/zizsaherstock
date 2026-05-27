import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { fetchQuotesLive } from "@/lib/market-data";
import { getAuthenticatedUser, unauthorizedResponse } from "@/lib/auth";

// GET /api/holdings — Return all holdings enriched with LIVE market data
export async function GET(request: NextRequest) {
  try {
    const authUser = await getAuthenticatedUser(request);
    if (!authUser) {
      return unauthorizedResponse();
    }

    const { data: holdings, error } = await supabase
      .from("holding")
      .select("*")
      .eq("user_id", authUser.userId)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Supabase error fetching holdings:", error);
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }

    if (!holdings || holdings.length === 0) {
      return NextResponse.json({
        holdings: [],
        totals: {
          totalInvestment: 0,
          totalMarketValue: 0,
          totalPnL: 0,
          totalPnLPercent: 0,
        },
      });
    }

    // Fetch transactions for each holding
    const holdingsWithTransactions = await Promise.all(
      holdings.map(async (h) => {
        const { data: transactions } = await supabase
          .from("transaction")
          .select("*")
          .eq("holding_id", h.id)
          .order("date", { ascending: false });
        return { ...h, transactions: transactions ?? [] };
      })
    );

    // Fetch LIVE market data from TradingView (shared 1s cache)
    const symbols = holdings.map((h) => h.symbol);
    let quotesMap: Record<string, {
      symbol: string;
      close: number;
      open: number;
      high: number;
      low: number;
      volume: number;
      changePercent: number;
      changeAbs: number;
      name: string;
      prevClose: number;
    }> = {};

    try {
      quotesMap = await fetchQuotesLive(symbols);
    } catch {
      console.warn("Market data unavailable, using fallback prices");
    }

    // Enrich each holding
    const enriched = holdingsWithTransactions.map((h) => {
      const quote = quotesMap[h.symbol];
      const currentPrice = quote?.close ?? Number(h.avg_cost);
      const change = quote?.changeAbs ?? 0;
      const changePercent = quote?.changePercent ?? 0;
      const marketValue = h.shares * currentPrice;
      const costBasis = h.shares * Number(h.avg_cost);
      const pnl = marketValue - costBasis;
      const pnlPercent =
        Number(h.avg_cost) > 0
          ? ((currentPrice - Number(h.avg_cost)) / Number(h.avg_cost)) * 100
          : 0;
      const dayChange = change * h.shares;

      return {
        id: h.id,
        symbol: h.symbol,
        name: h.name,
        shares: h.shares,
        avgCost: Number(h.avg_cost),
        purchaseDate: h.purchase_date
          ? new Date(h.purchase_date).toISOString()
          : new Date(h.created_at).toISOString(),
        createdAt: new Date(h.created_at).toISOString(),
        updatedAt: new Date(h.updated_at).toISOString(),
        currentPrice,
        marketValue,
        costBasis,
        pnl,
        pnlPercent,
        dayChange,
        dayChangePercent: changePercent,
      };
    });

    // Sort by marketValue descending
    enriched.sort((a, b) => b.marketValue - a.marketValue);

    // Compute totals
    const totalInvestment = enriched.reduce((s, h) => s + h.costBasis, 0);
    const totalMarketValue = enriched.reduce((s, h) => s + h.marketValue, 0);
    const totalPnL = totalMarketValue - totalInvestment;
    const totalPnLPercent =
      totalInvestment > 0 ? (totalPnL / totalInvestment) * 100 : 0;

    return NextResponse.json({
      holdings: enriched,
      totals: {
        totalInvestment,
        totalMarketValue,
        totalPnL,
        totalPnLPercent,
      },
    });
  } catch (error) {
    console.error("Error fetching holdings:", error);
    const msg = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { error: `Failed to fetch holdings: ${msg}` },
      { status: 500 }
    );
  }
}

// POST /api/holdings — Add a new holding
export async function POST(request: NextRequest) {
  try {
    const authUser = await getAuthenticatedUser(request);
    if (!authUser) {
      return unauthorizedResponse();
    }

    const body = await request.json();
    const { symbol, name, shares, avgCost, purchaseDate } = body;

    if (!symbol || typeof symbol !== "string" || symbol.trim().length === 0) {
      return NextResponse.json({ error: "symbol is required" }, { status: 400 });
    }
    if (!name || typeof name !== "string" || name.trim().length === 0) {
      return NextResponse.json({ error: "name is required" }, { status: 400 });
    }
    // Ensure shares is a valid positive integer
    const intShares = Math.round(shares);
    if (isNaN(intShares) || intShares <= 0) {
      return NextResponse.json({ error: "shares must be a positive whole number" }, { status: 400 });
    }
    if (typeof avgCost !== "number" || avgCost <= 0) {
      return NextResponse.json({ error: "avgCost must be a positive number" }, { status: 400 });
    }

    // Parse purchase date (optional, defaults to today)
    let parsedPurchaseDate = new Date();
    if (purchaseDate) {
      const d = new Date(purchaseDate);
      if (!isNaN(d.getTime())) {
        parsedPurchaseDate = d;
      }
    }

    const upperSymbol = symbol.trim().toUpperCase();

    // Check if symbol already exists for this user
    const { data: existing, error: checkError } = await supabase
      .from("holding")
      .select("id")
      .eq("symbol", upperSymbol)
      .eq("user_id", authUser.userId)
      .single();

    if (checkError && checkError.code !== "PGRST116") {
      console.error("Supabase error checking existing holding:", checkError);
      return NextResponse.json({ error: checkError.message }, { status: 500 });
    }
    if (existing) {
      return NextResponse.json(
        { error: `Holding with symbol "${symbol}" already exists` },
        { status: 409 }
      );
    }

    // Insert holding
    const { data: holding, error: insertError } = await supabase
      .from("holding")
      .insert({
        symbol: upperSymbol,
        name: name.trim(),
        shares: intShares,
        avg_cost: avgCost,
        purchase_date: parsedPurchaseDate.toISOString(),
        user_id: authUser.userId,
      })
      .select("*")
      .single();

    if (insertError) {
      console.error("Supabase error inserting holding:", insertError);
      return NextResponse.json(
        { error: `Failed to create holding: ${insertError.message}` },
        { status: 500 }
      );
    }

    // Insert a BUY transaction for the initial purchase
    const { error: txError } = await supabase.from("transaction").insert({
      holding_id: holding.id,
      type: "BUY",
      shares: intShares,
      price: avgCost,
      total: intShares * avgCost,
      date: parsedPurchaseDate.toISOString(),
    });

    if (txError) {
      console.error("Supabase error inserting transaction:", txError);
      // Holding was created but transaction failed — non-fatal, log warning
      console.warn("Holding created but initial transaction failed");
    }

    // Return the created holding in the same format the frontend expects
    const response = {
      id: holding.id,
      symbol: holding.symbol,
      name: holding.name,
      shares: holding.shares,
      avgCost: Number(holding.avg_cost),
      purchaseDate: holding.purchase_date
        ? new Date(holding.purchase_date).toISOString()
        : new Date(holding.created_at).toISOString(),
      createdAt: new Date(holding.created_at).toISOString(),
      updatedAt: new Date(holding.updated_at).toISOString(),
    };

    return NextResponse.json(response, { status: 201 });
  } catch (error) {
    console.error("Error creating holding:", error);
    const msg = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: `Failed to create holding: ${msg}` }, { status: 500 });
  }
}
