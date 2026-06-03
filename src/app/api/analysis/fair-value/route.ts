import { NextRequest, NextResponse } from "next/server";
import { fetchFundamentals } from "@/lib/fundamentals";
import { calculateFairValue } from "@/lib/fair-value-engine";
import { computeSectorAverages, getSectorValuationProfile } from "@/lib/egx-sectors";
import { EGX_STOCKS } from "@/lib/egx-stocks";

/**
 * GET /api/analysis/fair-value?symbol=COMI
 * Calculates fair value using 4 models for a single stock.
 *
 * Uses sector-specific valuation profiles, dynamic sector benchmarks
 * from peer data, and includes EGP currency validation with full
 * data source / quality metadata in the response.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const symbol = searchParams.get("symbol")?.toUpperCase().trim();

    if (!symbol) {
      return NextResponse.json({ error: "symbol parameter required" }, { status: 400 });
    }

    // ── Look up sector and gather peer symbols ──
    const stockEntry = EGX_STOCKS.find(s => s.symbol === symbol);
    if (!stockEntry) {
      return NextResponse.json({ error: `Unknown symbol: ${symbol}` }, { status: 404 });
    }

    const sector = stockEntry.sector || "Other";
    const sectorPeers = EGX_STOCKS
      .filter(s => s.sector === sector && s.symbol !== symbol)
      .slice(0, 10)
      .map(s => s.symbol);

    const allSymbols = [symbol, ...sectorPeers];
    const fundData = await fetchFundamentals(allSymbols);

    const f = fundData[symbol];
    if (!f || !f.hasData) {
      return NextResponse.json({ error: `No fundamental data for ${symbol}` }, { status: 404 });
    }

    // ── Compute dynamic sector benchmarks from peer fundamentals ──
    const peerFundamentals: Record<string, {
      sector?: string;
      pe: number; pb: number; evEbitda: number; ps: number;
      roe: number; debtEquity: number; grossMargin: number; netMargin: number;
      dividendYield: number; revenueGrowth: number;
    }> = {};

    for (const [sym, fd] of Object.entries(fundData)) {
      if (!fd.hasData) continue;
      const peerSector = EGX_STOCKS.find(s => s.symbol === sym)?.sector || "Other";
      peerFundamentals[sym] = {
        sector: peerSector,
        pe: fd.pe,
        pb: fd.pb,
        evEbitda: fd.evEbitda,
        ps: fd.ps,
        roe: fd.roe,
        debtEquity: fd.debtEquity,
        grossMargin: fd.grossMargin,
        netMargin: fd.netMargin,
        dividendYield: fd.dividendYield,
        revenueGrowth: fd.revenueGrowth,
      };
    }

    const sectorBenchmarks = computeSectorAverages(peerFundamentals);

    // ── Calculate fair value with sector benchmarks ──
    const fairValueResult = calculateFairValue(f, sector, sectorBenchmarks);

    // ── Build sector profile for response ──
    const sectorProfile = getSectorValuationProfile(sector, sectorBenchmarks);

    // ── EGP validation ──
    const isEGP = f.isEGP;
    const currency = f.currency || "Unknown";
    const warnings: string[] = [];

    if (!isEGP) {
      warnings.push(
        `Currency is ${currency}, not EGP. Valuation models assume EGP-denominated inputs. Results may be unreliable.`
      );
    }

    if (f.dataQualityScore < 40) {
      warnings.push(
        `Low data quality score (${f.dataQualityScore}/100). Valuation confidence may be limited.`
      );
    }

    if (sectorPeers.length === 0) {
      warnings.push(
        `No sector peers found for "${sector}". Sector benchmarks use static defaults.`
      );
    }

    // ── Enriched response ──
    return NextResponse.json({
      symbol,
      fairValue: fairValueResult,
      sectorProfile: {
        sector: sectorProfile.sector,
        modelWeights: sectorProfile.modelWeights,
        waccParams: sectorProfile.waccParams,
        peerCount: sectorBenchmarks[sector]?.count ?? 0,
      },
      validation: {
        isEGP,
        currency,
        dataQualityScore: f.dataQualityScore,
        dataSource: f.dataSource,
        validatedAt: f.validatedAt,
        warnings,
      },
    }, {
      headers: { "Cache-Control": "public, max-age=300, stale-while-revalidate=60" },
    });
  } catch (error) {
    console.error("Fair value error:", error);
    return NextResponse.json({ error: "Failed to calculate fair value" }, { status: 503 });
  }
}
