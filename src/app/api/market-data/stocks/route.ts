import { NextRequest, NextResponse } from "next/server";
import { EGX_STOCKS } from "@/lib/egx-stocks";
import { fetchQuotesLive } from "@/lib/market-data";

/**
 * GET /api/market-data/stocks
 *
 * Returns all EGX-listed stocks. By default, returns the full list
 * with symbol, name, and sector (fast, no TradingView calls).
 *
 * Query params:
 *  - q: Search query (filters by symbol/name, returns up to 20)
 *  - live=true: Also fetch live prices for returned stocks
 *  - symbols=COMI,TMGH: Only return specific symbols with live prices
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q") || "";
  const wantLive = searchParams.get("live") === "true";
  const symbolsParam = searchParams.get("symbols");

  try {
    // ── Mode 1: Specific symbols with live prices ──
    if (symbolsParam) {
      const requestedSymbols = symbolsParam
        .toUpperCase()
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);

      const stocks = requestedSymbols
        .map((sym) => EGX_STOCKS.find((s) => s.symbol === sym))
        .filter(Boolean) as (typeof EGX_STOCKS)[number][];

      if (stocks.length === 0) {
        return NextResponse.json([]);
      }

      // Fetch live prices for requested symbols
      const quotes = await fetchQuotesLive(stocks.map((s) => s.symbol));

      const enriched = stocks.map((stock) => {
        const q = quotes[stock.symbol];
        return {
          symbol: stock.symbol,
          name: stock.name,
          sector: stock.sector,
          ...(q
            ? {
                currentPrice: q.close,
                changePercent: q.changePercent,
                changeAbs: q.changeAbs,
              }
            : {}),
        };
      });

      return NextResponse.json(enriched);
    }

    // ── Mode 2: Search query ──
    if (query) {
      const q = query.toUpperCase().trim();
      const filtered = EGX_STOCKS.filter(
        (s) =>
          s.symbol.includes(q) ||
          s.name.toUpperCase().includes(q)
      ).slice(0, 20);

      if (!wantLive) {
        return NextResponse.json(filtered);
      }

      // Fetch live prices for search results
      const quotes = await fetchQuotesLive(filtered.map((s) => s.symbol));

      const enriched = filtered.map((stock) => {
        const q = quotes[stock.symbol];
        return {
          symbol: stock.symbol,
          name: stock.name,
          sector: stock.sector,
          ...(q
            ? {
                currentPrice: q.close,
                changePercent: q.changePercent,
                changeAbs: q.changeAbs,
              }
            : {}),
        };
      });

      return NextResponse.json(enriched);
    }

    // ── Mode 3: Full list (no live prices) ──
    return NextResponse.json(EGX_STOCKS);
  } catch (error) {
    console.error("Error fetching stocks:", error);
    return NextResponse.json(
      { error: "Failed to fetch stock data" },
      { status: 503 }
    );
  }
}
