import { NextRequest, NextResponse } from "next/server";
import { fetchFundamentals } from "@/lib/fundamentals";
import { calculateFairValue } from "@/lib/fair-value-engine";
import { EGX_STOCKS } from "@/lib/egx-stocks";
import { computeSectorAverages } from "@/lib/egx-sectors";

/**
 * GET /api/analysis/screener?sector=...&status=...&sort=...&limit=...&minPrice=...&maxPrice=...&minMarketCap=...&maxMarketCap=...&minPE=...&maxPE=...&minROE=...&maxDebtEquity=...&minDividendYield=...&minRevenueGrowth=...&minUpside=...&maxUpside=...&minQuality=...&market_breadth=true
 * Returns fair value analysis for EGX stocks with filtering & sorting.
 * Cache: 120s
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const sector = searchParams.get("sector");
    const status = searchParams.get("status");
    const sort = searchParams.get("sort") || "upside";
    const minQuality = parseInt(searchParams.get("minQuality") || "0");
    const limit = Math.min(260, parseInt(searchParams.get("limit") || "260"));

    // Advanced filters
    const minPrice = parseFloat(searchParams.get("minPrice") || "0");
    const maxPrice = parseFloat(searchParams.get("maxPrice") || "0");
    const minMarketCap = parseFloat(searchParams.get("minMarketCap") || "0");
    const maxMarketCap = parseFloat(searchParams.get("maxMarketCap") || "0");
    const minPE = parseFloat(searchParams.get("minPE") || "0");
    const maxPE = parseFloat(searchParams.get("maxPE") || "0");
    const minROE = parseFloat(searchParams.get("minROE") || "0");
    const maxDebtEquity = parseFloat(searchParams.get("maxDebtEquity") || "0");
    const minDividendYield = parseFloat(searchParams.get("minDividendYield") || "0");
    const minRevenueGrowth = parseFloat(searchParams.get("minRevenueGrowth") || "0");
    const minUpside = parseFloat(searchParams.get("minUpside") || "0");
    const maxUpside = parseFloat(searchParams.get("maxUpside") || "0");
    const marketBreadth = searchParams.get("market_breadth") === "true";

    // Filter stocks by sector first
    let stocks = [...EGX_STOCKS];
    if (sector && sector !== "All") {
      stocks = stocks.filter(s => s.sector === sector);
    }

    // Fetch fundamentals for ALL stocks in filtered set
    const allSymbols = stocks.map(s => s.symbol);
    const fundData = await fetchFundamentals(allSymbols);

    // Build a stock sectors map for sector average computation
    const stockSectorsMap: Record<string, string> = {};
    for (const s of stocks) {
      stockSectorsMap[s.symbol] = s.sector;
    }

    // Compute dynamic sector averages from fundamentals data
    const enrichedFundData: Record<string, typeof fundData[string] & { sector?: string }> = {};
    for (const [sym, f] of Object.entries(fundData)) {
      enrichedFundData[sym] = { ...f, sector: stockSectorsMap[sym] };
    }
    const sectorBenchmarks = computeSectorAverages(enrichedFundData as Parameters<typeof computeSectorAverages>[0]);

    // Calculate fair value for each stock
    const results = stocks
      .filter(s => fundData[s.symbol]?.hasData)
      .map(s => {
        const f = fundData[s.symbol];
        return { ...calculateFairValue(f, s.sector, sectorBenchmarks), marketCap: f.marketCap, pe: f.pe };
      });

    // Apply filters
    let filtered = results;
    if (status && status !== 'All') {
      filtered = filtered.filter(r => r.status === status);
    }
    if (minQuality > 0) {
      filtered = filtered.filter(r => r.dataQuality >= minQuality);
    }
    // Price filters
    if (minPrice > 0) {
      filtered = filtered.filter(r => r.currentPrice >= minPrice);
    }
    if (maxPrice > 0) {
      filtered = filtered.filter(r => r.currentPrice <= maxPrice);
    }
    // Market cap filters
    if (minMarketCap > 0) {
      filtered = filtered.filter(r => (r as unknown as { marketCap: number }).marketCap >= minMarketCap);
    }
    if (maxMarketCap > 0) {
      filtered = filtered.filter(r => (r as unknown as { marketCap: number }).marketCap <= maxMarketCap);
    }
    // PE filters
    if (minPE > 0) {
      filtered = filtered.filter(r => (r as unknown as { pe: number }).pe >= minPE);
    }
    if (maxPE > 0) {
      filtered = filtered.filter(r => (r as unknown as { pe: number }).pe <= maxPE);
    }
    // Upside filters
    if (minUpside > 0) {
      filtered = filtered.filter(r => r.weightedUpside >= minUpside);
    }
    if (maxUpside > 0) {
      filtered = filtered.filter(r => r.weightedUpside <= maxUpside);
    }

    // Sort
    const sortDir = sort === 'pe' || sort === 'marketcap' ? 1 : -1; // asc for PE/mcap
    switch (sort) {
      case 'upside':
        filtered.sort((a, b) => b.weightedUpside - a.weightedUpside);
        break;
      case 'top_gainers':
        filtered.sort((a, b) => b.currentPrice * (1 + b.weightedUpside / 100) - a.currentPrice * (1 + a.weightedUpside / 100));
        // Use actual change% from fundamental data if available
        filtered.sort((a, b) => {
          // Get actual change from fundData
          const aChange = fundData[a.symbol]?.change || 0;
          const bChange = fundData[b.symbol]?.change || 0;
          return bChange - aChange;
        });
        break;
      case 'top_losers':
        filtered.sort((a, b) => {
          const aChange = fundData[a.symbol]?.change || 0;
          const bChange = fundData[b.symbol]?.change || 0;
          return aChange - bChange;
        });
        break;
      case 'quality':
        filtered.sort((a, b) => b.dataQuality - a.dataQuality);
        break;
      case 'marketcap':
        filtered.sort((a, b) => (b as unknown as { marketCap: number }).marketCap - (a as unknown as { marketCap: number }).marketCap);
        break;
      case 'pe':
        filtered.sort((a, b) => (a as unknown as { pe: number }).pe - (b as unknown as { pe: number }).pe);
        break;
      case 'confidence':
        filtered.sort((a, b) => {
          const confMap: Record<string, number> = { 'High': 3, 'Medium': 2, 'Low': 1 };
          return (confMap[b.confidence] || 0) - (confMap[a.confidence] || 0);
        });
        break;
    }

    // Apply limit
    const limited = filtered.slice(0, limit);

    // Summary stats
    const summary = {
      total: results.length,
      undervalued: results.filter(r => r.status === 'Undervalued').length,
      fairlyValued: results.filter(r => r.status === 'Fairly Valued').length,
      overvalued: results.filter(r => r.status === 'Overvalued').length,
      highConfidence: results.filter(r => r.confidence === 'High').length,
      filteredTotal: filtered.length,
    };

    // Market breadth data if requested
    let breadthData: Record<string, { sector: string; count: number; avgChange: number; avgChangePct: number; undervalued: number; overvalued: number; totalMcap: number }> | null = null;
    if (marketBreadth) {
      const sectorMap = new Map<string, { count: number; avgChange: number; undervalued: number; overvalued: number; totalMcap: number }>();
      for (const r of results) {
        const s = r.sector;
        if (!sectorMap.has(s)) {
          sectorMap.set(s, { count: 0, avgChange: 0, undervalued: 0, overvalued: 0, totalMcap: 0 });
        }
        const entry = sectorMap.get(s)!;
        entry.count++;
        entry.avgChange += fundData[r.symbol]?.change || 0;
        if (r.status === 'Undervalued') entry.undervalued++;
        if (r.status === 'Overvalued') entry.overvalued++;
        entry.totalMcap += (r as unknown as { marketCap: number }).marketCap;
      }
      breadthData = {};
      for (const [sec, data] of sectorMap) {
        breadthData[sec] = {
          sector: sec,
          count: data.count,
          avgChange: data.avgChange,
          avgChangePct: data.count > 0 ? data.avgChange / data.count : 0,
          undervalued: data.undervalued,
          overvalued: data.overvalued,
          totalMcap: data.totalMcap,
        };
      }
    }

    return NextResponse.json({ results: limited, summary, marketBreadth: breadthData }, {
      headers: { "Cache-Control": "public, max-age=120, stale-while-revalidate=30" },
    });
  } catch (error) {
    console.error("Screener error:", error);
    return NextResponse.json({ error: "Failed to run screener" }, { status: 503 });
  }
}
