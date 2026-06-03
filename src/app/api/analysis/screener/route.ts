import { NextRequest, NextResponse } from "next/server";
import { fetchFundamentals, filterEGPOnly } from "@/lib/fundamentals";
import { calculateFairValueV3 } from "@/lib/fair-value-engine-v3";
import { EGX_STOCKS } from "@/lib/egx-stocks";
import { computeSectorAverages } from "@/lib/egx-sectors";

/**
 * GET /api/analysis/screener?sector=...&status=...&sort=...&limit=...&minPrice=...&maxPrice=...&minMarketCap=...&maxMarketCap=...&minPE=...&maxPE=...&minROE=...&maxDebtEquity=...&minDividendYield=...&minRevenueGrowth=...&minUpside=...&maxUpside=...&minQuality=...&market_breadth=true&includeAuditTrail=true
 *
 * Returns V3 fair value analysis for EGX stocks with filtering, sorting,
 * sector-specific model results, confidence scoring, transparent assumptions,
 * and optional audit trail.
 *
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
    const includeAuditTrail = searchParams.get("includeAuditTrail") === "true";

    // Text search (symbol or name)
    const search = (searchParams.get("search") || "").trim().toUpperCase();

    // Advanced filters
    const minPrice = parseFloat(searchParams.get("minPrice") || "0");
    const maxPrice = parseFloat(searchParams.get("maxPrice") || "0");
    const minMarketCap = parseFloat(searchParams.get("minMarketCap") || "0");
    const maxMarketCap = parseFloat(searchParams.get("maxMarketCap") || "0");
    const minPE = parseFloat(searchParams.get("minPE") || "0");
    const maxPE = parseFloat(searchParams.get("maxPE") || "0");
    const minPB = parseFloat(searchParams.get("minPB") || "0");
    const maxPB = parseFloat(searchParams.get("maxPB") || "0");
    const minROE = parseFloat(searchParams.get("minROE") || "0");
    const minROA = parseFloat(searchParams.get("minROA") || "0");
    const maxDebtEquity = parseFloat(searchParams.get("maxDebtEquity") || "0");
    const minDividendYield = parseFloat(searchParams.get("minDividendYield") || "0");
    const minRevenueGrowth = parseFloat(searchParams.get("minRevenueGrowth") || "0");
    const minUpside = parseFloat(searchParams.get("minUpside") || "0");
    const maxUpside = parseFloat(searchParams.get("maxUpside") || "0");
    const marketBreadth = searchParams.get("market_breadth") === "true";

    // Filter stocks by sector and search text first
    let stocks = [...EGX_STOCKS];
    if (sector && sector !== "All") {
      stocks = stocks.filter(s => s.sector === sector);
    }
    if (search) {
      stocks = stocks.filter(s =>
        s.symbol.toUpperCase().includes(search) ||
        s.name.toUpperCase().includes(search)
      );
    }

    // Fetch fundamentals for ALL stocks in filtered set
    const allSymbols = stocks.map(s => s.symbol);
    const rawFundData = await fetchFundamentals(allSymbols);

    // Filter to EGP-only stocks and log removed non-EGP entries
    const totalStocksBeforeEGP = Object.keys(rawFundData).length;
    const { filtered: egpFiltered, removedCount, removedSymbols } = filterEGPOnly(rawFundData);
    if (removedCount > 0) {
      console.log(`[Screener V3] Removed ${removedCount} non-EGP stock(s): ${removedSymbols.join(', ')}`);
    }
    const fundData = egpFiltered;

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

    // Calculate V3 fair value for each stock
    const results = stocks
      .filter(s => fundData[s.symbol]?.hasData)
      .map(s => {
        const f = fundData[s.symbol];
        const v3Result = calculateFairValueV3(f, s.sector, {
          sectorBenchmarks,
          includeAuditTrail,
        });

        return {
          ...v3Result,
          // Fundamental fields needed for filters
          marketCap: f.marketCap,
          pe: f.pe,
          roe: f.roe,
          roa: f.roa,
          pb: f.pb,
          debtEquity: f.debtEquity,
          dividendYield: f.dividendYield,
          revenueGrowth: f.revenueGrowth,
          change: f.change,
          // Data quality & validation info
          isEGP: f.isEGP,
          currency: f.currency,
        };
      })
      .filter(r => {
        // Accept V3 fair value if positive, otherwise fall back to V2 weighted
        const hasValidV3 = r.v3FairValue > 0 && r.modelSelection.selectedModels.length > 0;
        const hasValidV2 = r.weightedFairValue > 0 && r.activeModels > 0;
        return hasValidV3 || hasValidV2;
      });

    // Apply filters
    let filtered = results;
    if (status && status !== 'All') {
      // Filter on V3 status first, fall back to V2 status
      filtered = filtered.filter(r => {
        const effectiveStatus = r.v3Status !== 'N/A' ? r.v3Status : r.status;
        return effectiveStatus === status;
      });
    }
    if (minQuality > 0) {
      filtered = filtered.filter(r => {
        // Use V3 data quality overall score, fall back to legacy dataQuality
        const effectiveQuality = r.v3DataQuality?.overall ?? r.dataQuality;
        return effectiveQuality >= minQuality;
      });
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
      filtered = filtered.filter(r => r.marketCap >= minMarketCap);
    }
    if (maxMarketCap > 0) {
      filtered = filtered.filter(r => r.marketCap <= maxMarketCap);
    }
    // PE filters
    if (minPE > 0) {
      filtered = filtered.filter(r => r.pe >= minPE);
    }
    if (maxPE > 0) {
      filtered = filtered.filter(r => r.pe <= maxPE);
    }
    // Upside filters (prefer V3 upside, fall back to V2)
    if (minUpside > 0) {
      filtered = filtered.filter(r => {
        const effectiveUpside = r.v3Upside ?? r.weightedUpside;
        return effectiveUpside >= minUpside;
      });
    }
    if (maxUpside > 0) {
      filtered = filtered.filter(r => {
        const effectiveUpside = r.v3Upside ?? r.weightedUpside;
        return effectiveUpside <= maxUpside;
      });
    }
    // ROE filter
    if (minROE > 0) {
      filtered = filtered.filter(r => r.roe >= minROE);
    }
    // Debt/Equity filter
    if (maxDebtEquity > 0) {
      filtered = filtered.filter(r => r.debtEquity <= maxDebtEquity);
    }
    // Dividend Yield filter
    if (minDividendYield > 0) {
      filtered = filtered.filter(r => r.dividendYield >= minDividendYield);
    }
    // Revenue Growth filter
    if (minRevenueGrowth > 0) {
      filtered = filtered.filter(r => r.revenueGrowth >= minRevenueGrowth);
    }
    // PB filters
    if (minPB > 0) {
      filtered = filtered.filter(r => r.pb > 0 && r.pb >= minPB);
    }
    if (maxPB > 0) {
      filtered = filtered.filter(r => r.pb > 0 && r.pb <= maxPB);
    }
    // ROA filter
    if (minROA > 0) {
      filtered = filtered.filter(r => r.roa >= minROA);
    }

    // Sort
    switch (sort) {
      case 'upside':
        filtered.sort((a, b) => {
          const aUpside = a.v3Upside ?? a.weightedUpside;
          const bUpside = b.v3Upside ?? b.weightedUpside;
          return bUpside - aUpside;
        });
        break;
      case 'top_gainers':
        filtered.sort((a, b) => {
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
        filtered.sort((a, b) => {
          const aQ = a.v3DataQuality?.overall ?? a.dataQuality;
          const bQ = b.v3DataQuality?.overall ?? b.dataQuality;
          return bQ - aQ;
        });
        break;
      case 'marketcap':
        filtered.sort((a, b) => b.marketCap - a.marketCap);
        break;
      case 'pe':
        filtered.sort((a, b) => a.pe - b.pe);
        break;
      case 'confidence':
        filtered.sort((a, b) => {
          const confMap: Record<string, number> = {
            'Very High': 5, 'High': 4, 'Moderate': 3, 'Medium': 3, 'Low': 2, 'Very Low': 1,
          };
          const aLevel = a.valuationConfidence?.level || a.confidence;
          const bLevel = b.valuationConfidence?.level || b.confidence;
          return (confMap[bLevel] || 0) - (confMap[aLevel] || 0);
        });
        break;
    }

    // Apply limit
    const limited = filtered.slice(0, limit);

    // Build response items with V3 enrichment
    const responseItems = limited.map(r => {
      const item: Record<string, unknown> = {
        symbol: r.symbol,
        name: r.name,
        sector: r.sector,
        currentPrice: r.currentPrice,
        marketCap: r.marketCap,
        pe: r.pe,
        pb: r.pb,
        roe: r.roe,
        roa: r.roa,
        debtEquity: r.debtEquity,
        dividendYield: r.dividendYield,
        revenueGrowth: r.revenueGrowth,
        change: r.change,

        // V2 fields (backward compatible)
        weightedFairValue: r.weightedFairValue,
        weightedUpside: r.weightedUpside,
        status: r.status,
        confidence: r.confidence,
        activeModels: r.activeModels,
        totalModels: r.totalModels,
        modelWeights: r.modelWeights,
        modelWarnings: r.modelWarnings,
        dataQuality: r.dataQuality,
        dataSource: r.dataSource,
        dataFetchedAt: r.dataFetchedAt,
        missingFields: r.missingFields,
        bullishTarget: r.bullishTarget,
        baseTarget: r.baseTarget,
        bearishTarget: r.bearishTarget,
        riskScore: r.riskScore,
        marginOfSafety: r.marginOfSafety,

        // V2 advanced models
        multiStageDCF: r.multiStageDCF,
        monteCarlo: r.monteCarlo,
        liquidation: r.liquidation,
        scenarioAnalysis: r.scenarioAnalysis,
        multiStageDDM: r.multiStageDDM,

        // V1 individual models
        dcf: r.dcf,
        relative: r.relative,
        ddm: r.ddm,
        asset: r.asset,

        // V3 fields
        v3FairValue: r.v3FairValue,
        v3Upside: r.v3Upside,
        v3Status: r.v3Status,

        // Valuation confidence (V3)
        valuationConfidence: r.valuationConfidence ? {
          level: r.valuationConfidence.level,
          score: r.valuationConfidence.score,
          factors: r.valuationConfidence.factors,
          explanation: r.valuationConfidence.explanation,
        } : undefined,

        // Data quality (V3 enhanced)
        dataQualityV3: r.v3DataQuality ? {
          overall: r.v3DataQuality.overall,
          grade: r.v3DataQuality.grade,
          completeness: r.v3DataQuality.completeness,
          consistency: r.v3DataQuality.consistency,
          timeliness: r.v3DataQuality.timeliness,
          accuracy: r.v3DataQuality.accuracy,
        } : undefined,

        // Model selection (which models were used and their weights)
        modelSelection: r.modelSelection ? {
          selectedModels: r.modelSelection.selectedModels,
          weights: r.modelSelection.weights,
          reason: r.modelSelection.reason,
          sectorProfile: r.modelSelection.sectorProfile,
        } : undefined,

        // Sector-specific model results
        sectorSpecificModels: r.sectorSpecificModels || [],

        // Transparent assumptions
        transparentAssumptions: r.transparentAssumptions || undefined,

        // WACC details
        waccDetails: r.waccDetails ? {
          wacc: r.waccDetails.wacc,
          costOfEquity: r.waccDetails.costOfEquity,
          costOfDebt: r.waccDetails.costOfDebt,
          riskFreeRate: r.waccDetails.riskFreeRate,
          beta: r.waccDetails.beta,
          equityRiskPremium: r.waccDetails.equityRiskPremium,
          sizePremium: r.waccDetails.sizePremium,
          countryRiskPremium: r.waccDetails.countryRiskPremium,
          assumptions: r.waccDetails.assumptions,
        } : undefined,

        // Metadata
        calculatedAt: r.calculatedAt,
        isEGP: r.isEGP,
        currency: r.currency,
      };

      // Conditionally include audit trail
      if (includeAuditTrail && r.auditTrail) {
        item.auditTrail = r.auditTrail;
      }

      return item;
    });

    // Summary stats
    const summary = {
      total: results.length,
      undervalued: results.filter(r => {
        const s = r.v3Status !== 'N/A' ? r.v3Status : r.status;
        return s === 'Undervalued';
      }).length,
      fairlyValued: results.filter(r => {
        const s = r.v3Status !== 'N/A' ? r.v3Status : r.status;
        return s === 'Fairly Valued';
      }).length,
      overvalued: results.filter(r => {
        const s = r.v3Status !== 'N/A' ? r.v3Status : r.status;
        return s === 'Overvalued';
      }).length,
      highConfidence: results.filter(r => {
        const level = r.valuationConfidence?.level || r.confidence;
        return level === 'High' || level === 'Very High';
      }).length,
      filteredTotal: filtered.length,
      source: "TradingView Scanner",
      engineVersion: "V3",
      generatedAt: new Date().toISOString(),
      coverageNote: "Stocks without enough real source fields for at least one valuation model are excluded from valuation-ranked results.",
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
        const effectiveStatus = r.v3Status !== 'N/A' ? r.v3Status : r.status;
        if (effectiveStatus === 'Undervalued') entry.undervalued++;
        if (effectiveStatus === 'Overvalued') entry.overvalued++;
        entry.totalMcap += r.marketCap;
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

    // Data validation summary
    const egpStocksCount = results.length;
    const avgDataQuality = egpStocksCount > 0
      ? Math.round(results.reduce((sum, r) => sum + (r.v3DataQuality?.overall ?? r.dataQuality), 0) / egpStocksCount)
      : 0;

    const dataValidation = {
      totalStocks: totalStocksBeforeEGP,
      egpStocks: egpStocksCount,
      nonEgpRemoved: removedCount,
      avgDataQuality,
      dataSource: "tradingview+validation" as const,
      engineVersion: "V3",
    };

    return NextResponse.json(
      { results: responseItems, summary, marketBreadth: breadthData, dataValidation },
      { headers: { "Cache-Control": "public, max-age=120, stale-while-revalidate=30" } },
    );
  } catch (error) {
    console.error("Screener V3 error:", error);
    return NextResponse.json({ error: "Failed to run screener" }, { status: 503 });
  }
}
