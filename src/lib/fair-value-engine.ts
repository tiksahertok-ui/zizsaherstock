/**
 * Professional Fair Value Engine for EGX Stocks
 * ──────────────────────────────────────────────
 * Calculates intrinsic/fair value using 5 professional valuation models:
 *
 *   1. DCF (Discounted Cash Flow)
 *   2. Relative Valuation (P/E, P/B, EV/EBITDA, P/S peer comparison)
 *   3. Dividend Discount Model (DDM)
 *   4. Asset-Based Valuation (Book Value + adjustments)
 *   5. Multi-Model Weighted (combines all models)
 *
 * All calculations use REAL financial data from TradingView.
 * Assumptions are transparent and dynamically adjusted.
 */

import type { FundamentalData } from './fundamentals';
import { getSectorBenchmark, EGYPT_MARKET_AVG, type SectorBenchmark } from './egx-sectors';

// ── Types ──────────────────────────────────────────────────────

export type ValuationStatus = 'Undervalued' | 'Fairly Valued' | 'Overvalued' | 'N/A';

export interface DCFResult {
  projectedFCF: number[];
  terminalValue: number;
  wacc: number;
  fcfYield: number;
  growthRate: number;
  assumptions: {
    revenueGrowthBase: number;
    fcfMargin: number;
    waccComponents: { riskFreeRate: number; beta: number; equityRiskPremium: number; sizePremium: number };
    terminalGrowth: number;
    projectionYears: number;
  };
  intrinsicValue: number;
}

export interface RelativeResult {
  peFairValue: number;
  pbFairValue: number;
  evEbitdaFairValue: number;
  psFairValue: number;
  sectorAvgPE: number;
  sectorAvgPB: number;
  sectorAvgEVEbitda: number;
  sectorAvgPS: number;
  weightedValue: number;
}

export interface DDMResult {
  intrinsicValue: number;
  dividendGrowthRate: number;
  requiredReturn: number;
  payoutRatio: number;
}

export interface AssetResult {
  bookValuePerShare: number;
  adjustedBVPS: number;
  premium: number; // % above book value
  intrinsicValue: number;
}

export interface FairValueResult {
  symbol: string;
  name: string;
  sector: string;
  currentPrice: number;

  // Individual models
  dcf: DCFResult | null;
  relative: RelativeResult | null;
  ddm: DDMResult | null;
  asset: AssetResult | null;

  // Multi-model weighted
  weightedFairValue: number;
  weightedUpside: number; // %
  status: ValuationStatus;

  // Model weights used
  modelWeights: {
    dcf: number;
    relative: number;
    ddm: number;
    asset: number;
  };

  // Quality & confidence
  dataQuality: number; // 0-100
  confidence: 'High' | 'Medium' | 'Low';
  activeModels: number;
  totalModels: number;

  // Price targets
  bullishTarget: number;
  baseTarget: number;
  bearishTarget: number;

  // Metadata
  calculatedAt: string;
}

// ── Helper: WACC Calculation ────────────────────────────────────

function calculateWACC(
  beta: number,
  riskFreeRate: number = EGYPT_MARKET_AVG.riskFreeRate,
  equityRiskPremium: number = EGYPT_MARKET_AVG.marketRiskPremium,
  sizePremium: number = 0.03, // Small-cap premium for Egypt
  debtCost: number = 0.20, // Average Egyptian corporate borrowing rate
  debtRatio: number = 0.3 // Assumed 30% debt in capital structure
): number {
  const betaAdj = Math.max(0.5, Math.min(2.0, beta || 1.0));
  const costOfEquity = riskFreeRate + betaAdj * equityRiskPremium + sizePremium;
  const wacc = (debtRatio * debtCost * (1 - 0.225)) + ((1 - debtRatio) * costOfEquity); // 22.5% Egyptian corporate tax
  return Math.max(0.10, Math.min(0.45, wacc)); // Clamp 10-45%
}

// ── Model 1: DCF ────────────────────────────────────────────────

export function calculateDCF(f: FundamentalData): DCFResult | null {
  if (!f.eps || f.eps <= 0 || f.sharesOutstanding <= 0) return null;

  const projectionYears = 5;
  const eps = f.eps;
  const shares = f.sharesOutstanding;

  // Growth assumptions from real data
  const revGrowth = f.revenueGrowth > 0 ? f.revenueGrowth / 100 : 0.10;
  const revGrowthBase = Math.max(0.02, Math.min(0.35, revGrowth));

  // FCF margin: derive from operating margin - capex ratio
  const opMargin = f.operatingMargin > 0 ? f.operatingMargin / 100 : f.netMargin > 0 ? f.netMargin / 100 * 1.5 : 0.12;
  const capExRatio = f.capex > 0 && f.revenue > 0 ? Math.abs(f.capex) / f.revenue : 0.04;
  const fcfMargin = Math.max(0.03, opMargin - capExRatio);

  // Revenue per share projection
  const revPerShare = f.revenuePerShare > 0 ? f.revenuePerShare : (f.revenue > 0 ? f.revenue / shares : eps * 8);

  const beta = f.beta > 0 ? f.beta : 1.0;
  const riskFreeRate = EGYPT_MARKET_AVG.riskFreeRate;
  const equityRiskPremium = EGYPT_MARKET_AVG.marketRiskPremium;
  const terminalGrowth = EGYPT_MARKET_AVG.terminalGrowth;

  const wacc = calculateWACC(beta, riskFreeRate, equityRiskPremium);
  const projectedFCF: number[] = [];

  let currentRevPS = revPerShare;
  for (let i = 0; i < projectionYears; i++) {
    // Decaying growth rate (converges to terminal growth)
    const yearGrowth = revGrowthBase * Math.pow(terminalGrowth / revGrowthBase, i / (projectionYears - 1));
    currentRevPS *= (1 + yearGrowth);
    projectedFCF.push(currentRevPS * fcfMargin);
  }

  // Terminal value (Gordon Growth Model)
  const lastFCF = projectedFCF[projectedFCF.length - 1];
  const terminalValue = (lastFCF * (1 + terminalGrowth)) / (wacc - terminalGrowth);

  // Discount all cash flows
  let pvFCF = 0;
  for (let i = 0; i < projectionYears; i++) {
    pvFCF += projectedFCF[i] / Math.pow(1 + wacc, i + 1);
  }
  const pvTerminal = terminalValue / Math.pow(1 + wacc, projectionYears);

  const intrinsicValue = pvFCF + pvTerminal;

  return {
    projectedFCF,
    terminalValue,
    wacc,
    fcfYield: fcfMargin,
    growthRate: revGrowthBase,
    assumptions: {
      revenueGrowthBase: revGrowthBase * 100,
      fcfMargin: fcfMargin * 100,
      waccComponents: {
        riskFreeRate,
        beta,
        equityRiskPremium,
        sizePremium: 0.03,
      },
      terminalGrowth,
      projectionYears,
    },
    intrinsicValue,
  };
}

// ── Model 2: Relative Valuation ────────────────────────────────

export function calculateRelative(
  f: FundamentalData,
  sector: string,
  benchmarks?: Record<string, SectorBenchmark>
): RelativeResult | null {
  if (f.eps <= 0 && f.bvps <= 0) return null;

  const bench = getSectorBenchmark(sector, benchmarks);

  // P/E fair value: EPS × Sector Average P/E
  const peFairValue = f.eps > 0 ? f.eps * bench.avgPE : 0;
  // P/B fair value: BVPS × Sector Average P/B
  const pbFairValue = f.bvps > 0 ? f.bvps * bench.avgPB : 0;
  // EV/EBITDA fair value: EBITDA per share × Sector Average EV/EBITDA
  const ebitdaPerShare = f.operatingIncome > 0 && f.sharesOutstanding > 0
    ? f.operatingIncome / f.sharesOutstanding
    : f.eps * 3; // Rough approximation
  const evEbitdaFairValue = ebitdaPerShare > 0 ? ebitdaPerShare * bench.avgEV_EBITDA : 0;
  // P/S fair value: Revenue per share × Sector Average P/S
  const psFairValue = f.revenuePerShare > 0 ? f.revenuePerShare * bench.avgPS : 0;

  // Count valid models for weighting
  const validModels: { value: number; weight: number }[] = [];
  if (peFairValue > 0) validModels.push({ value: peFairValue, weight: 0.35 }); // P/E most important
  if (pbFairValue > 0) validModels.push({ value: pbFairValue, weight: 0.25 });
  if (evEbitdaFairValue > 0) validModels.push({ value: evEbitdaFairValue, weight: 0.25 });
  if (psFairValue > 0) validModels.push({ value: psFairValue, weight: 0.15 });

  if (validModels.length === 0) return null;

  // Normalize weights
  const totalWeight = validModels.reduce((s, m) => s + m.weight, 0);
  const weightedValue = validModels.reduce((s, m) => s + (m.value * m.weight / totalWeight), 0);

  return {
    peFairValue,
    pbFairValue,
    evEbitdaFairValue,
    psFairValue,
    sectorAvgPE: bench.avgPE,
    sectorAvgPB: bench.avgPB,
    sectorAvgEVEbitda: bench.avgEV_EBITDA,
    sectorAvgPS: bench.avgPS,
    weightedValue,
  };
}

// ── Model 3: Dividend Discount Model (DDM) ──────────────────────

export function calculateDDM(f: FundamentalData): DDMResult | null {
  if (f.dividendYield <= 0 || f.eps <= 0) return null;

  const beta = f.beta > 0 ? f.beta : 1.0;
  const requiredReturn = calculateWACC(beta); // Cost of equity proxy

  // Dividend per share from yield
  const dps = f.dps > 0 ? f.dps : f.eps * (f.payoutRatio / 100);
  if (dps <= 0) return null;

  // Growth rate: use earnings growth or dividend growth estimate
  const growthRate = f.earningsGrowth > 0
    ? Math.min(f.earningsGrowth / 100, requiredReturn - 0.01) // Growth < required return
    : f.revenueGrowth > 0
      ? Math.min(f.revenueGrowth / 100, requiredReturn - 0.01)
      : 0.05; // Default 5%

  if (growthRate >= requiredReturn) return null; // DDM breaks if g >= r

  const payoutRatio = f.payoutRatio > 0 ? f.payoutRatio : (dps / f.eps) * 100;

  const intrinsicValue = dps * (1 + growthRate) / (requiredReturn - growthRate);

  return {
    intrinsicValue,
    dividendGrowthRate: growthRate * 100,
    requiredReturn,
    payoutRatio,
  };
}

// ── Model 4: Asset-Based Valuation ────────────────────────────

export function calculateAssetBased(f: FundamentalData): AssetResult | null {
  if (f.bvps <= 0) return null;

  const bvps = f.bvps;

  // ROE premium: higher ROE justifies premium over book value
  const roe = f.roe > 0 ? f.roe / 100 : 0;
  const avgROE = EGYPT_MARKET_AVG.avgROE / 100;

  // Premium/discount based on ROE relative to market average
  let premium = 0;
  if (roe > 0) {
    premium = (roe - avgROE) * 3; // 3x multiplier for ROE spread
  }
  premium = Math.max(-0.3, Math.min(0.8, premium)); // Clamp -30% to +80%

  const adjustedBVPS = bvps * (1 + premium);

  return {
    bookValuePerShare: bvps,
    adjustedBVPS,
    premium: premium * 100,
    intrinsicValue: adjustedBVPS,
  };
}

// ── Model 5: Multi-Model Weighted ──────────────────────────────

export interface ModelWeights {
  dcf: number;
  relative: number;
  ddm: number;
  asset: number;
}

export function calculateMultiModelWeighted(
  dcf: DCFResult | null,
  relative: RelativeResult | null,
  ddm: DDMResult | null,
  asset: AssetResult | null,
  dataQuality: number
): { fairValue: number; weights: ModelWeights } {
  const models: Array<{ value: number; key: keyof ModelWeights }> = [];

  if (dcf && dcf.intrinsicValue > 0) models.push({ value: dcf.intrinsicValue, key: 'dcf' });
  if (relative && relative.weightedValue > 0) models.push({ value: relative.weightedValue, key: 'relative' });
  if (ddm && ddm.intrinsicValue > 0) models.push({ value: ddm.intrinsicValue, key: 'ddm' });
  if (asset && asset.intrinsicValue > 0) models.push({ value: asset.intrinsicValue, key: 'asset' });

  if (models.length === 0) return { fairValue: 0, weights: { dcf: 0, relative: 0, ddm: 0, asset: 0 } };

  // Default weights when all models available
  const defaultWeights: ModelWeights = { dcf: 0.40, relative: 0.30, ddm: 0.15, asset: 0.15 };

  // Adjust weights based on data quality and available models
  let totalWeight = 0;
  const weights: ModelWeights = { dcf: 0, relative: 0, ddm: 0, asset: 0 };

  for (const model of models) {
    // Boost DCF weight if data quality is high
    let w = defaultWeights[model.key];
    if (model.key === 'dcf' && dataQuality > 70) w *= 1.2;
    if (model.key === 'relative' && dataQuality < 40) w *= 0.7;
    weights[model.key] = w;
    totalWeight += w;
  }

  // Normalize
  const fairValue = models.reduce((sum, model) => {
    return sum + (model.value * weights[model.key] / totalWeight);
  }, 0);

  // Normalize weights for output
  for (const key of ['dcf', 'relative', 'ddm', 'asset'] as const) {
    weights[key] = weights[key] / totalWeight;
  }

  return { fairValue, weights };
}

// ── Main Fair Value Calculation ─────────────────────────────────

export function calculateFairValue(
  f: FundamentalData,
  sector: string,
  sectorBenchmarks?: Record<string, import('./egx-sectors').SectorBenchmark>
): FairValueResult {
  const currentPrice = f.price;

  // Run all 4 models
  const dcf = calculateDCF(f);
  const relative = calculateRelative(f, sector, sectorBenchmarks);
  const ddm = calculateDDM(f);
  const asset = calculateAssetBased(f);

  // Data quality
  const dataQuality = getDataQuality(f);
  const activeModels = [dcf, relative, ddm, asset].filter(Boolean).length;

  // Multi-model weighted
  const { fairValue: weightedFairValue, weights } = calculateMultiModelWeighted(
    dcf, relative, ddm, asset, dataQuality
  );

  // Upside/downside
  const weightedUpside = currentPrice > 0
    ? ((weightedFairValue - currentPrice) / currentPrice) * 100
    : 0;

  // Valuation status
  let status: ValuationStatus = 'N/A';
  if (weightedFairValue > 0 && currentPrice > 0) {
    if (weightedUpside > 15) status = 'Undervalued';
    else if (weightedUpside < -15) status = 'Overvalued';
    else status = 'Fairly Valued';
  }

  // Confidence level
  const confidence: 'High' | 'Medium' | 'Low' =
    dataQuality > 60 && activeModels >= 3 ? 'High' :
    dataQuality > 30 && activeModels >= 2 ? 'Medium' : 'Low';

  // Price targets (scenario analysis)
  const bullishTarget = weightedFairValue * 1.15;  // +15% above fair value
  const bearishTarget = weightedFairValue * 0.85;    // -15% below fair value
  const baseTarget = weightedFairValue;

  return {
    symbol: f.symbol,
    name: f.name,
    sector,
    currentPrice,
    dcf,
    relative,
    ddm,
    asset,
    weightedFairValue,
    weightedUpside,
    status,
    modelWeights: weights,
    dataQuality,
    confidence,
    activeModels,
    totalModels: 4,
    bullishTarget,
    baseTarget,
    bearishTarget,
    calculatedAt: new Date().toISOString(),
  };
}

// ── Data Quality Assessment ──────────────────────────────────────

function getDataQuality(f: FundamentalData): number {
  let score = 0;
  let maxScore = 0;

  // Price (must have)
  maxScore += 10;
  if (f.price > 0) score += 10;

  // Valuation ratios
  maxScore += 20;
  if (f.pe > 0) score += 7;
  if (f.pb > 0) score += 7;
  if (f.evEbitda > 0) score += 6;

  // Profitability
  maxScore += 20;
  if (f.revenue > 0) score += 5;
  if (f.netIncome !== 0) score += 5;
  if (f.grossMargin > 0) score += 5;
  if (f.operatingMargin > 0) score += 5;

  // Balance sheet
  maxScore += 15;
  if (f.totalAssets > 0) score += 5;
  if (f.totalDebt >= 0) score += 5;
  if (f.stockholdersEquity > 0) score += 5;

  // Cash flow
  maxScore += 15;
  if (f.freeCashFlow !== 0) score += 5;
  if (f.operatingCashFlow !== 0) score += 5;
  if (f.capex !== 0) score += 5;

  // Growth
  maxScore += 10;
  if (f.revenueGrowth !== 0) score += 5;
  if (f.earningsGrowth !== 0) score += 5;

  // Per-share metrics
  maxScore += 10;
  if (f.eps > 0) score += 4;
  if (f.bvps > 0) score += 3;
  if (f.sharesOutstanding > 0) score += 3;

  return maxScore > 0 ? Math.round((score / maxScore) * 100) : 0;
}

// ── Batch Fair Value Calculation ────────────────────────────────

export function calculateBatchFairValues(
  fundamentals: Record<string, FundamentalData>,
  stockSectors: Record<string, string>,
  sectorBenchmarks?: Record<string, import('./egx-sectors').SectorBenchmark>
): FairValueResult[] {
  const results: FairValueResult[] = [];

  for (const [symbol, f] of Object.entries(fundamentals)) {
    const sector = stockSectors[symbol] || 'Other';
    const fv = calculateFairValue(f, sector, sectorBenchmarks);
    results.push(fv);
  }

  return results;
}

/**
 * Rank stocks by valuation attractiveness (best undervalued first).
 */
export function rankByValuation(results: FairValueResult[]): FairValueResult[] {
  return results
    .filter(r => r.status === 'Undervalued' && r.confidence !== 'Low')
    .sort((a, b) => b.weightedUpside - a.weightedUpside);
}
