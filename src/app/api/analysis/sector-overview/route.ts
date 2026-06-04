import { NextRequest, NextResponse } from "next/server";
import { EGX_STOCKS } from "@/lib/egx-stocks";
import { fetchFundamentals } from "@/lib/fundamentals";

/**
 * GET /api/analysis/sector-overview
 * Returns sector-level aggregated data with avg change%, top performer, etc.
 * Cache: 120s
 */
export async function GET() {
  try {
    const symbols = EGX_STOCKS.map(s => s.symbol);
    const fundData = await fetchFundamentals(symbols);

    // Group by sector
    const sectorMap = new Map<string, {
      stocks: Array<{
        symbol: string;
        name: string;
        price: number;
        change: number;
        marketCap: number;
        pe: number;
        roe: number;
      }>;
    }>();

    for (const stock of EGX_STOCKS) {
      const f = fundData[stock.symbol];
      if (!f || f.price <= 0) continue;

      const sector = stock.sector;
      if (!sectorMap.has(sector)) {
        sectorMap.set(sector, { stocks: [] });
      }

      sectorMap.get(sector)!.stocks.push({
        symbol: stock.symbol,
        name: f.name || stock.name,
        price: f.price,
        change: f.change,
        marketCap: f.marketCap,
        pe: f.pe,
        roe: f.roe,
      });
    }

    // Build sector summary
    const sectors = Array.from(sectorMap.entries()).map(([sector, data]) => {
      const stocks = data.stocks;
      const avgChange = stocks.reduce((sum, s) => sum + s.change, 0) / stocks.length;
      const validPEs = stocks.filter(s => s.pe > 0 && s.pe < 200);
      const avgPE = validPEs.length > 0 ? validPEs.reduce((sum, s) => sum + s.pe, 0) / validPEs.length : 0;
      const validROEs = stocks.filter(s => s.roe > 0 && s.roe < 100);
      const avgROE = validROEs.length > 0 ? validROEs.reduce((sum, s) => sum + s.roe, 0) / validROEs.length : 0;
      const totalMcap = stocks.reduce((sum, s) => sum + s.marketCap, 0);
      const topPerformer = stocks.reduce((best, s) => s.change > best.change ? s : best, stocks[0]);
      const worstPerformer = stocks.reduce((worst, s) => s.change < worst.change ? s : worst, stocks[0]);

      return {
        sector,
        stockCount: stocks.length,
        avgChange,
        avgPE,
        avgROE,
        totalMarketCap: totalMcap,
        topPerformer: {
          symbol: topPerformer.symbol,
          name: topPerformer.name,
          change: topPerformer.change,
        },
        worstPerformer: {
          symbol: worstPerformer.symbol,
          name: worstPerformer.name,
          change: worstPerformer.change,
        },
      };
    });

    // Sort by stock count descending
    sectors.sort((a, b) => b.stockCount - a.stockCount);

    return NextResponse.json({ sectors }, {
      headers: { "Cache-Control": "public, max-age=120, stale-while-revalidate=30" },
    });
  } catch (error) {
    console.error("Sector overview error:", error);
    return NextResponse.json({ error: "Failed to fetch sector overview" }, { status: 503 });
  }
}
