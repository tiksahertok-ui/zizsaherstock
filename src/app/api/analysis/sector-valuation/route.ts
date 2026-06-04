import { NextRequest, NextResponse } from 'next/server';
import { calculateFairValueV3 } from '@/lib/fair-value-engine-v3';
import {
  getSectorValuationProfile,
  computeSectorAverages,
  SECTOR_VALUATION_PROFILES,
  EGYPT_MARKET_AVG,
  type SectorBenchmark,
  type SectorValuationProfile,
} from '@/lib/egx-sectors';
import { calculateEgyptianWACC } from '@/lib/egypt-wacc-engine';
import { fetchFundamentals, filterEGPOnly } from '@/lib/fundamentals';
import { EGX_STOCKS } from '@/lib/egx-stocks';
import type { WACCResult } from '@/lib/egypt-wacc-engine';
import type { FairValueResultV3 } from '@/lib/fair-value-engine-v3';

// ══════════════════════════════════════════════════════════════════════
// Types
// ══════════════════════════════════════════════════════════════════════

/** Compact stock valuation summary used in sector overview lists. */
interface StockValuation {
  symbol: string;
  name: string;
  price: number;
  fairValue: number;
  upside: number;
  status: 'Undervalued' | 'Fairly Valued' | 'Overvalued' | 'N/A';
}

/** Sector-level WACC summary returned in sector response. */
interface SectorWACC {
  costOfEquity: number;
  costOfDebt: number;
  wacc: number;
  riskFreeRate: number;
  beta: number;
  countryRiskPremium: number;
}

/** Sector summary response shape. */
interface SectorSummaryResponse {
  sector: string;
  totalStocks: number;
  avgPE: number;
  avgPB: number;
  avgEV_EBITDA: number;
  avgROE: number;
  avgDividendYield: number;
  undervaluedCount: number;
  overvaluedCount: number;
  topUndervalued: StockValuation[];
  topOvervalued: StockValuation[];
  sectorModels: string[];
  sectorWACC: SectorWACC;
}

/** Selected model breakdown for stock sector valuation. */
interface SelectedModelBreakdown {
  model: string;
  fairValue: number;
  weight: number;
  confidence: number;
  assumptions: Record<string, number>;
}

/** Valuation confidence summary. */
interface ValuationConfidenceSummary {
  level: string;
  score: number;
}

/** Transparent assumptions summary for a stock. */
interface TransparentAssumptionsSummary {
  discountRate: { value: number; source: string };
  growthRate: { value: number; source: string };
  terminalGrowth: { value: number; source: string };
  countryRiskPremium: { value: number; source: string };
}

/** Stock-level sector valuation response shape. */
interface StockSectorValuationResponse {
  symbol: string;
  name: string;
  sector: string;
  selectedModels: SelectedModelBreakdown[];
  compositeFairValue: number;
  upside: number;
  valuationConfidence: ValuationConfidenceSummary;
  transparentAssumptions: TransparentAssumptionsSummary;
  waccDetails: WACCResult;
  sectorBenchmark: SectorBenchmark;
}

// ══════════════════════════════════════════════════════════════════════
// In-memory Cache (120 seconds)
// ══════════════════════════════════════════════════════════════════════

interface CacheEntry {
  data: unknown;
  ts: number;
}

const responseCache = new Map<string, CacheEntry>();
const CACHE_TTL = 120_000; // 120 seconds

function getCached<T>(key: string): T | null {
  const entry = responseCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.ts > CACHE_TTL) {
    responseCache.delete(key);
    return null;
  }
  return entry.data as T;
}

function setCache(key: string, data: unknown): void {
  responseCache.set(key, { data, ts: Date.now() });
}

// ══════════════════════════════════════════════════════════════════════
// Helpers
// ══════════════════════════════════════════════════════════════════════

/**
 * Build a list of valid EGX sector names from the SECTOR_VALUATION_PROFILES
 * keys plus any additional sectors present in EGX_STOCKS.
 */
function getAllKnownSectors(): string[] {
  const fromProfile = Object.keys(SECTOR_VALUATION_PROFILES);
  const fromStocks = new Set(EGX_STOCKS.map((s) => s.sector));
  for (const s of fromStocks) {
    if (!fromProfile.includes(s)) {
      fromProfile.push(s);
    }
  }
  return fromProfile;
}

/**
 * Determine valuation status from upside percentage.
 */
function valuationStatus(upside: number): 'Undervalued' | 'Fairly Valued' | 'Overvalued' | 'N/A' {
  if (upside > 15) return 'Undervalued';
  if (upside < -15) return 'Overvalued';
  if (upside === 0) return 'N/A';
  return 'Fairly Valued';
}

/**
 * Round a number to the specified number of decimal places.
 */
function round(value: number, decimals = 2): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

// ══════════════════════════════════════════════════════════════════════
// GET Handler
// ══════════════════════════════════════════════════════════════════════

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const sectorParam = searchParams.get('sector')?.trim();
    const symbolParam = searchParams.get('symbol')?.toUpperCase().trim();

    if (!sectorParam && !symbolParam) {
      return NextResponse.json(
        {
          error:
            'Provide either "sector" or "symbol" query parameter.',
          availableSectors: getAllKnownSectors(),
        },
        { status: 400 },
      );
    }

    // ── Branch 1: Sector Summary ──────────────────────────────────
    if (sectorParam) {
      return handleSectorSummary(sectorParam);
    }

    // ── Branch 2: Stock Sector Valuation ──────────────────────────
    if (symbolParam) {
      return handleStockSectorValuation(symbolParam);
    }

    // Should not reach here
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  } catch (error) {
    console.error('[sector-valuation] Unhandled error:', error);
    return NextResponse.json(
      { error: 'Internal server error. Please try again later.' },
      { status: 500 },
    );
  }
}

// ══════════════════════════════════════════════════════════════════════
// Sector Summary Handler
// ══════════════════════════════════════════════════════════════════════

async function handleSectorSummary(sector: string) {
  // Validate sector name (allow any string — getSectorValuationProfile handles unknown)
  const cacheKey = `sector:${sector}`;
  const cached = getCached<SectorSummaryResponse>(cacheKey);
  if (cached) {
    return NextResponse.json(cached, {
      headers: { 'Cache-Control': 'public, max-age=120, s-maxage=120' },
    });
  }

  // Get all stocks in this sector
  const sectorStocks = EGX_STOCKS.filter(
    (s) => s.sector.toLowerCase() === sector.toLowerCase(),
  );

  if (sectorStocks.length === 0) {
    return NextResponse.json(
      {
        error: `No stocks found in sector "${sector}".`,
        availableSectors: getAllKnownSectors(),
      },
      { status: 404 },
    );
  }

  // Fetch fundamentals for all stocks in the sector (batched)
  const symbols = sectorStocks.map((s) => s.symbol);
  const fundamentals = await fetchFundamentals(symbols);

  // Filter to EGP only
  const { filtered } = filterEGPOnly(fundamentals);

  // Get sector valuation profile
  const profile: SectorValuationProfile = getSectorValuationProfile(sector);

  // Build peer fundamentals for dynamic sector averages
  const peerFundamentals: Record<
    string,
    {
      sector?: string;
      pe: number;
      pb: number;
      evEbitda: number;
      ps: number;
      roe: number;
      debtEquity: number;
      grossMargin: number;
      netMargin: number;
      dividendYield: number;
      revenueGrowth: number;
    }
  > = {};

  for (const [sym, fd] of Object.entries(filtered)) {
    peerFundamentals[sym] = {
      sector,
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

  const dynamicBenchmarks = computeSectorAverages(peerFundamentals);
  const benchmark = dynamicBenchmarks[sector] ?? profile;

  // Compute averages across valid stocks
  const validStocks = Object.values(filtered).filter(
    (f) => f.hasData && f.price > 0,
  );

  const avgPE =
    validStocks.length > 0
      ? validStocks.reduce((s, f) => s + (f.pe > 0 ? f.pe : 0), 0) /
        Math.max(validStocks.filter((f) => f.pe > 0).length, 1)
      : benchmark.avgPE;

  const avgPB =
    validStocks.length > 0
      ? validStocks.reduce((s, f) => s + (f.pb > 0 ? f.pb : 0), 0) /
        Math.max(validStocks.filter((f) => f.pb > 0).length, 1)
      : benchmark.avgPB;

  const avgEV_EBITDA =
    validStocks.length > 0
      ? validStocks.reduce((s, f) => s + (f.evEbitda > 0 ? f.evEbitda : 0), 0) /
        Math.max(validStocks.filter((f) => f.evEbitda > 0).length, 1)
      : benchmark.avgEV_EBITDA;

  const avgROE =
    validStocks.length > 0
      ? validStocks.reduce((s, f) => s + (f.roe > 0 ? f.roe : 0), 0) /
        Math.max(validStocks.filter((f) => f.roe > 0).length, 1)
      : benchmark.avgROE;

  const avgDividendYield =
    validStocks.length > 0
      ? validStocks.reduce((s, f) => s + (f.dividendYield > 0 ? f.dividendYield : 0), 0) /
        Math.max(validStocks.filter((f) => f.dividendYield > 0).length, 1)
      : benchmark.avgDividendYield;

  // Calculate fair values for each stock in the sector
  const stockValuations: StockValuation[] = [];
  let undervaluedCount = 0;
  let overvaluedCount = 0;

  // Sort by market cap descending for priority (process larger stocks first)
  const sortedByCap = [...validStocks].sort((a, b) => b.marketCap - a.marketCap);

  // Limit to top 30 stocks by market cap to avoid timeouts
  const topStocks = sortedByCap.slice(0, 30);

  for (const f of topStocks) {
    try {
      const result: FairValueResultV3 = calculateFairValueV3(f, sector, {
        sectorBenchmarks: dynamicBenchmarks,
        includeAuditTrail: false,
      });

      const fv = result.v3FairValue;
      const upside =
        f.price > 0 ? round(((fv - f.price) / f.price) * 100) : 0;
      const status = valuationStatus(upside);

      stockValuations.push({
        symbol: f.symbol,
        name: f.name,
        price: round(f.price),
        fairValue: round(fv),
        upside,
        status,
      });

      if (status === 'Undervalued') undervaluedCount++;
      if (status === 'Overvalued') overvaluedCount++;
    } catch {
      // Skip stocks that fail valuation
    }
  }

  // Sort and pick top undervalued / overvalued
  const topUndervalued = stockValuations
    .filter((v) => v.status === 'Undervalued')
    .sort((a, b) => b.upside - a.upside)
    .slice(0, 5);

  const topOvervalued = stockValuations
    .filter((v) => v.status === 'Overvalued')
    .sort((a, b) => a.upside - b.upside)
    .slice(0, 5);

  // Determine which models are primary for this sector
  const sectorModels: string[] = profile.notes
    ? Object.keys(profile.modelWeights)
    : ['dcf', 'relative', 'ddm', 'asset'];

  // Calculate sector-level WACC
  const sectorWACCResult = calculateEgyptianWACC({ sector });
  const sectorWACC: SectorWACC = {
    costOfEquity: round(sectorWACCResult.costOfEquity * 100, 2),
    costOfDebt: round(sectorWACCResult.costOfDebt * 100, 2),
    wacc: round(sectorWACCResult.wacc * 100, 2),
    riskFreeRate: round(sectorWACCResult.riskFreeRate * 100, 2),
    beta: round(sectorWACCResult.beta, 2),
    countryRiskPremium: round(sectorWACCResult.countryRiskPremium * 100, 2),
  };

  const response: SectorSummaryResponse = {
    sector: profile.sector || sector,
    totalStocks: sectorStocks.length,
    avgPE: round(avgPE, 1),
    avgPB: round(avgPB, 2),
    avgEV_EBITDA: round(avgEV_EBITDA, 1),
    avgROE: round(avgROE, 1),
    avgDividendYield: round(avgDividendYield, 1),
    undervaluedCount,
    overvaluedCount,
    topUndervalued,
    topOvervalued,
    sectorModels,
    sectorWACC,
  };

  setCache(cacheKey, response);

  return NextResponse.json(response, {
    headers: { 'Cache-Control': 'public, max-age=120, s-maxage=120' },
  });
}

// ══════════════════════════════════════════════════════════════════════
// Stock Sector Valuation Handler
// ══════════════════════════════════════════════════════════════════════

async function handleStockSectorValuation(symbol: string) {
  const cacheKey = `symbol:${symbol}`;
  const cached = getCached<StockSectorValuationResponse>(cacheKey);
  if (cached) {
    return NextResponse.json(cached, {
      headers: { 'Cache-Control': 'public, max-age=120, s-maxage=120' },
    });
  }

  // Look up stock in EGX_STOCKS
  const stockEntry = EGX_STOCKS.find(
    (s) => s.symbol === symbol,
  );

  if (!stockEntry) {
    return NextResponse.json(
      { error: `Unknown symbol: ${symbol}` },
      { status: 404 },
    );
  }

  const sector = stockEntry.sector || 'Other';

  // Fetch fundamentals for the stock and its sector peers
  const sectorPeers = EGX_STOCKS
    .filter((s) => s.sector === sector && s.symbol !== symbol)
    .slice(0, 10)
    .map((s) => s.symbol);

  const allSymbols = [symbol, ...sectorPeers];
  const fundData = await fetchFundamentals(allSymbols);

  const f = fundData[symbol];
  if (!f || !f.hasData) {
    return NextResponse.json(
      { error: `No fundamental data available for ${symbol}` },
      { status: 404 },
    );
  }

  // Build peer fundamentals for dynamic sector averages
  const peerFundamentals: Record<
    string,
    {
      sector?: string;
      pe: number;
      pb: number;
      evEbitda: number;
      ps: number;
      roe: number;
      debtEquity: number;
      grossMargin: number;
      netMargin: number;
      dividendYield: number;
      revenueGrowth: number;
    }
  > = {};

  for (const [sym, fd] of Object.entries(fundData)) {
    if (!fd.hasData) continue;
    const peerSector = EGX_STOCKS.find((s) => s.symbol === sym)?.sector || 'Other';
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

  const dynamicBenchmarks = computeSectorAverages(peerFundamentals);

  // Calculate V3 fair value with full sector awareness
  const result: FairValueResultV3 = calculateFairValueV3(f, sector, {
    sectorBenchmarks: dynamicBenchmarks,
    includeAuditTrail: true,
  });

  // Build selectedModels breakdown from sectorSpecificModels
  const selectedModels: SelectedModelBreakdown[] =
    result.sectorSpecificModels.map((m) => ({
      model: m.modelName,
      fairValue: round(m.fairValue),
      weight: round(m.weight * 100, 1), // Convert to percentage
      confidence: round(m.confidence * 100, 1),
      assumptions: Object.fromEntries(
        Object.entries(m.assumptions).map(([k, v]) => [k, round(v, 4)]),
      ),
    }));

  const compositeFairValue = round(result.v3FairValue);
  const upside =
    f.price > 0 ? round(((result.v3FairValue - f.price) / f.price) * 100) : 0;

  // Build valuation confidence
  const valuationConfidence: ValuationConfidenceSummary = {
    level: result.valuationConfidence.level,
    score: round(result.valuationConfidence.score),
  };

  // Build transparent assumptions summary
  const transparentAssumptions: TransparentAssumptionsSummary = {
    discountRate: {
      value: round(result.transparentAssumptions.discountRate.value * 100, 2),
      source: result.transparentAssumptions.discountRate.source,
    },
    growthRate: {
      value: round(result.transparentAssumptions.growthRate.value * 100, 2),
      source: result.transparentAssumptions.growthRate.source,
    },
    terminalGrowth: {
      value: round(result.transparentAssumptions.terminalGrowth.value * 100, 2),
      source: result.transparentAssumptions.terminalGrowth.source,
    },
    countryRiskPremium: {
      value: round(result.transparentAssumptions.countryRiskPremium.value * 100, 2),
      source: result.transparentAssumptions.countryRiskPremium.source,
    },
  };

  // Get sector benchmark
  const sectorBenchmark: SectorBenchmark = dynamicBenchmarks[sector] ?? {
    sector,
    avgPE: EGYPT_MARKET_AVG.avgPE,
    avgPB: EGYPT_MARKET_AVG.avgPB,
    avgEV_EBITDA: EGYPT_MARKET_AVG.avgEV_EBITDA,
    avgPS: 1.5,
    avgROE: EGYPT_MARKET_AVG.avgROE,
    avgDebtEquity: EGYPT_MARKET_AVG.avgDebtEquity,
    avgGrossMargin: 30,
    avgNetMargin: 10,
    avgDividendYield: EGYPT_MARKET_AVG.avgDividendYield,
    avgRevenueGrowth: 10,
    count: 0,
  };

  const response: StockSectorValuationResponse = {
    symbol,
    name: stockEntry.name,
    sector,
    selectedModels,
    compositeFairValue,
    upside,
    valuationConfidence,
    transparentAssumptions,
    waccDetails: result.waccDetails,
    sectorBenchmark,
  };

  setCache(cacheKey, response);

  return NextResponse.json(response, {
    headers: { 'Cache-Control': 'public, max-age=120, s-maxage=120' },
  });
}
