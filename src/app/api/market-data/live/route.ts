import { NextRequest, NextResponse } from "next/server";
import { fetchQuotesLive } from "@/lib/market-data";
import { getMarketStatus } from "@/utils/market-status";

/**
 * /api/market-data/live — Unified real-time endpoint (1s shared cache)
 *
 * Accepts: ?symbols=COMI,HDBK,EGX30,EGX70_EWI,EGX100_EWI
 * Always includes: Gold (XAUUSD) + USD/EGP
 *
 * Client polls this every 1 second for ALL live price updates.
 * The underlying shared cache ensures TradingView is only hit once per cycle.
 *
 * Response:
 * {
 *   stocks: { COMI: { price, changePercent, changeAbs, volume }, ... },
 *   gold: { usdPrice, changePercent, changeAbs },
 *   usdEgp: { rate, changePercent, changeAbs },
 *   marketStatus: { egx, gold, globalGold, forex },
 *   timestamp: "..."
 * }
 */

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const symbolsParam = searchParams.get("symbols") || "";

    // Parse requested symbols
    const requestedSymbols = symbolsParam
      .split(",")
      .map((s) => s.trim().toUpperCase())
      .filter(Boolean);

    // Always include gold + USD/EGP
    const allSymbols = [...new Set([...requestedSymbols, "XAUUSD", "USDEGP"])];

    // Fetch all symbols using shared 1s live cache
    const quotes = await fetchQuotesLive(allSymbols);

    // Build response
    const stocks: Record<string, {
      price: number;
      changePercent: number;
      changeAbs: number;
      volume: number;
    }> = {};

    let goldUsdPrice = 0;
    let goldChangePercent = 0;
    let goldChangeAbs = 0;
    let usdEgpRate = 0;
    let usdEgpChangePercent = 0;
    let usdEgpChangeAbs = 0;

    for (const [sym, q] of Object.entries(quotes)) {
      if (sym === "XAUUSD") {
        goldUsdPrice = q.close;
        goldChangePercent = q.changePercent;
        goldChangeAbs = q.changeAbs;
      } else if (sym === "USDEGP") {
        usdEgpRate = q.close;
        usdEgpChangePercent = q.changePercent;
        usdEgpChangeAbs = q.changeAbs;
      } else {
        // Regular stock/index
        stocks[sym] = {
          price: q.close,
          changePercent: q.changePercent,
          changeAbs: q.changeAbs,
          volume: q.volume,
        };
      }
    }

    return NextResponse.json({
      stocks,
      gold: {
        usdPrice: goldUsdPrice,
        changePercent: goldChangePercent,
        changeAbs: goldChangeAbs,
      },
      usdEgp: {
        rate: usdEgpRate,
        changePercent: usdEgpChangePercent,
        changeAbs: usdEgpChangeAbs,
      },
      marketStatus: getMarketStatus(),
      timestamp: new Date().toISOString(),
    }, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    console.error("Live endpoint error:", error);
    return NextResponse.json({ error: "Failed" }, { status: 503 });
  }
}
