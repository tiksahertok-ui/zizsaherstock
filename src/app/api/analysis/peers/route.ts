import { NextRequest, NextResponse } from "next/server";
import { EGX_STOCKS } from "@/lib/egx-stocks";
import { fetchFundamentals } from "@/lib/fundamentals";

/**
 * GET /api/analysis/peers?symbol=COMI
 * Returns peer comparison data for a stock (same sector).
 * Max 15 peers.
 * Cache: 120s
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const symbol = searchParams.get("symbol")?.toUpperCase().trim();

    if (!symbol) {
      return NextResponse.json({ error: "symbol parameter required" }, { status: 400 });
    }

    // Find stock and sector
    const stock = EGX_STOCKS.find(s => s.symbol === symbol);
    if (!stock) {
      return NextResponse.json({ error: `Stock ${symbol} not found` }, { status: 404 });
    }

    const sector = stock.sector;

    // Get peers from same sector
    const peers = EGX_STOCKS
      .filter(s => s.sector === sector)
      .slice(0, 16); // 15 peers + the stock itself

    const symbols = peers.map(s => s.symbol);
    const fundData = await fetchFundamentals(symbols);

    // Build peer comparison data
    const comparison = peers.map(s => {
      const f = fundData[s.symbol];
      if (!f || !f.hasData) {
        return {
          symbol: s.symbol,
          name: s.name,
          sector: s.sector,
          isTarget: s.symbol === symbol,
          price: 0,
          marketCap: 0,
          pe: 0,
          pb: 0,
          evEbitda: 0,
          roe: 0,
          netMargin: 0,
          revenueGrowth: 0,
          dividendYield: 0,
        };
      }

      return {
        symbol: s.symbol,
        name: f.name || s.name,
        sector: s.sector,
        isTarget: s.symbol === symbol,
        price: f.price,
        marketCap: f.marketCap,
        pe: f.pe,
        pb: f.pb,
        evEbitda: f.evEbitda,
        roe: f.roe,
        netMargin: f.netMargin,
        revenueGrowth: f.revenueGrowth,
        dividendYield: f.dividendYield,
      };
    }).filter(p => p.price > 0);

    return NextResponse.json({ symbol, sector, peers: comparison }, {
      headers: { "Cache-Control": "public, max-age=120, stale-while-revalidate=30" },
    });
  } catch (error) {
    console.error("Peers error:", error);
    return NextResponse.json({ error: "Failed to fetch peer data" }, { status: 503 });
  }
}
