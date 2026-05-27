import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { fetchQuotesLive } from "@/lib/market-data";
import { getAuthenticatedUser, unauthorizedResponse } from "@/lib/auth";

interface RouteParams {
  params: Promise<{ id: string }>;
}

// GET /api/holdings/[id] — Get a single holding by ID
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const authUser = await getAuthenticatedUser(request);
    if (!authUser) {
      return unauthorizedResponse();
    }

    const { id } = await params;

    const { data: holding, error } = await supabase
      .from("holding")
      .select("*")
      .eq("id", id)
      .eq("user_id", authUser.userId)
      .single();

    if (error || !holding) {
      return NextResponse.json(
        { error: "Holding not found" },
        { status: 404 }
      );
    }

    // Fetch transactions
    const { data: transactions } = await supabase
      .from("transaction")
      .select("*")
      .eq("holding_id", id)
      .order("date", { ascending: false });

    // Try to get current market price from TradingView
    const holdingAvgCost = Number(holding.avg_cost);
    let currentPrice = holdingAvgCost;
    let change = 0;
    let changePercent = 0;

    try {
      const quotes = await fetchQuotesLive([holding.symbol]);
      const quote = quotes[holding.symbol];
      if (quote) {
        currentPrice = quote.close || holdingAvgCost;
        change = quote.changeAbs || 0;
        changePercent = quote.changePercent || 0;
      }
    } catch {
      // Market data unavailable, use avgCost as fallback
    }

    const marketValue = holding.shares * currentPrice;
    const costBasis = holding.shares * holdingAvgCost;
    const pnl = marketValue - costBasis;
    const pnlPercent =
      holdingAvgCost > 0
        ? ((currentPrice - holdingAvgCost) / holdingAvgCost) * 100
        : 0;

    return NextResponse.json({
      id: holding.id,
      symbol: holding.symbol,
      name: holding.name,
      shares: holding.shares,
      avgCost: holdingAvgCost,
      purchaseDate: holding.purchase_date
        ? new Date(holding.purchase_date).toISOString()
        : new Date(holding.created_at).toISOString(),
      createdAt: new Date(holding.created_at).toISOString(),
      updatedAt: new Date(holding.updated_at).toISOString(),
      transactions: (transactions ?? []).map((t) => ({
        id: t.id,
        holdingId: t.holding_id,
        type: t.type,
        shares: t.shares,
        price: Number(t.price),
        total: Number(t.total),
        date: new Date(t.date).toISOString(),
        notes: t.notes,
        createdAt: new Date(t.created_at).toISOString(),
      })),
      currentPrice,
      marketValue,
      costBasis,
      pnl,
      pnlPercent,
      dayChange: change * holding.shares,
      dayChangePercent: changePercent,
    });
  } catch (error) {
    console.error("Error fetching holding:", error);
    const msg = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { error: `Failed to fetch holding: ${msg}` },
      { status: 500 }
    );
  }
}

// PUT /api/holdings/[id] — Update a holding
export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
    const authUser = await getAuthenticatedUser(request);
    if (!authUser) {
      return unauthorizedResponse();
    }

    const { id } = await params;
    const body = await request.json();
    const { shares, avgCost, name, purchaseDate } = body;

    // Check holding exists and belongs to user
    const { data: existing, error: checkError } = await supabase
      .from("holding")
      .select("*")
      .eq("id", id)
      .eq("user_id", authUser.userId)
      .single();

    if (checkError || !existing) {
      return NextResponse.json(
        { error: "Holding not found" },
        { status: 404 }
      );
    }

    // Build update data with snake_case column names
    const updateData: Record<string, unknown> = {};
    if (name !== undefined) {
      if (typeof name !== "string" || name.trim().length === 0) {
        return NextResponse.json(
          { error: "name must be a non-empty string" },
          { status: 400 }
        );
      }
      updateData.name = name.trim();
    }
    if (shares !== undefined) {
      if (typeof shares !== "number" || shares <= 0) {
        return NextResponse.json(
          { error: "shares must be a positive whole number" },
          { status: 400 }
        );
      }
      updateData.shares = Math.round(shares);
    }
    if (avgCost !== undefined) {
      if (typeof avgCost !== "number" || avgCost <= 0) {
        return NextResponse.json(
          { error: "avgCost must be a positive number" },
          { status: 400 }
        );
      }
      updateData.avg_cost = avgCost;
    }
    if (purchaseDate !== undefined) {
      const d = new Date(purchaseDate);
      if (!isNaN(d.getTime())) {
        updateData.purchase_date = d.toISOString();
      }
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json(
        { error: "No fields to update" },
        { status: 400 }
      );
    }

    const { data: holding, error: updateError } = await supabase
      .from("holding")
      .update(updateData)
      .eq("id", id)
      .select("*")
      .single();

    if (updateError) {
      console.error("Supabase error updating holding:", updateError);
      return NextResponse.json(
        { error: `Failed to update holding: ${updateError.message}` },
        { status: 500 }
      );
    }

    return NextResponse.json({
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
    });
  } catch (error) {
    console.error("Error updating holding:", error);
    const msg = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { error: `Failed to update holding: ${msg}` },
      { status: 500 }
    );
  }
}

// DELETE /api/holdings/[id] — Delete a holding (transactions cascade)
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const authUser = await getAuthenticatedUser(request);
    if (!authUser) {
      return unauthorizedResponse();
    }

    const { id } = await params;

    // Check holding exists and belongs to user
    const { data: existing, error: checkError } = await supabase
      .from("holding")
      .select("symbol")
      .eq("id", id)
      .eq("user_id", authUser.userId)
      .single();

    if (checkError || !existing) {
      return NextResponse.json(
        { error: "Holding not found" },
        { status: 404 }
      );
    }

    // Delete the holding (transactions cascade via ON DELETE CASCADE)
    const { error: deleteError } = await supabase
      .from("holding")
      .delete()
      .eq("id", id)
      .eq("user_id", authUser.userId);

    if (deleteError) {
      console.error("Supabase error deleting holding:", deleteError);
      return NextResponse.json(
        { error: `Failed to delete holding: ${deleteError.message}` },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, deleted: existing.symbol });
  } catch (error) {
    console.error("Error deleting holding:", error);
    const msg = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { error: `Failed to delete holding: ${msg}` },
      { status: 500 }
    );
  }
}
