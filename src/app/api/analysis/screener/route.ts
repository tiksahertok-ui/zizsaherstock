import { NextRequest, NextResponse } from "next/server";
import { fetchFundamentals } from "@/lib/fundamentals";
import { calculateFairValue } from "@/lib/fair-value-engine";
import { EGX_STOCKS } from "@/lib/egx-stocks";

/**
 * GET /api/analysis/screener?sector=Financials&status=Undervalued&sort=upside&limit=50
 * Returns fair value analysis for EGX stocks with filtering & sorting.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const sector = searchParams.get("sector");
    const status = searchParams.get("status");
    const sort = searchParams.get("sort") || "upside"; // upside, quality, marketcap, pe
    const minQuality = parseInt(searchParams.get("minQuality") || "0");
    const limit = Math.min(100, parseInt(searchParams.get("limit") || "50"));

    // Filter stocks
    let stocks = [...EGX_STOCKS];
    if (sector) {
      stocks = stocks.filter(s => s.sector === sector);
    }

    // Fetch fundamentals (batched, max 100)
    const batchSymbols = stocks.slice(0, limit).map(s => s.symbol);
    const fundData = await fetchFundamentals(batchSymbols);

    // Calculate fair value for each
    const results = stocks
      .filter(s => fundData[s.symbol]?.hasData)
      .map(s => calculateFairValue(fundData[s.symbol], s.sector));

    // Apply filters
    let filtered = results;
    if (status && status !== 'All') {
      filtered = filtered.filter(r => r.status === status);
    }
    if (minQuality > 0) {
      filtered = filtered.filter(r => r.dataQuality >= minQuality);
    }

    // Sort
    switch (sort) {
      case 'upside':
        filtered.sort((a, b) => b.weightedUpside - a.weightedUpside);
        break;
      case 'quality':
        filtered.sort((a, b) => b.dataQuality - a.dataQuality);
        break;
      case 'marketcap':
        filtered.sort((a, b) => {
          // Use market cap from fundamental data (approximate)
          const aMcap = a.currentPrice * (a.dcf?.assumptions?.projectionYears || 1) * 1000000;
          const bMcap = b.currentPrice * (b.dcf?.assumptions?.projectionYears || 1) * 1000000;
          return bMcap - aMcap;
        });
        break;
      case 'pe':
        filtered.sort((a, b) => {
          const aPE = a.dcf?.assumptions?.revenueGrowthBase || 0;
          const bPE = b.dcf?.assumptions?.revenueGrowthBase || 0;
          return aPE - bPE;
        });
        break;
      case 'confidence':
        filtered.sort((a, b) => {
          const confMap: Record<string, number> = { 'High': 3, 'Medium': 2, 'Low': 1 };
          return (confMap[b.confidence] || 0) - (confMap[a.confidence] || 0);
        });
        break;
    }

    // Summary stats
    const summary = {
      total: results.length,
      undervalued: results.filter(r => r.status === 'Undervalued').length,
      fairlyValued: results.filter(r => r.status === 'Fairly Valued').length,
      overvalued: results.filter(r => r.status === 'Overvalued').length,
      highConfidence: results.filter(r => r.confidence === 'High').length,
    };

    return NextResponse.json({ results: filtered, summary }, {
      headers: { "Cache-Control": "public, max-age=300, stale-while-revalidate=60" },
    });
  } catch (error) {
    console.error("Screener error:", error);
    return NextResponse.json({ error: "Failed to run screener" }, { status: 503 });
  }
}
