/**
 * Professional Fair Value Engine for EGX Stocks (v3 — Sector-Aware)
 * ────────────────────────────────────────────────────────────────
 * Calculates intrinsic/fair value using 4 professional valuation models
 * with sector-specific weights and CFA-standard formulas:
 *
 *   1. DCF (Discounted Cash Flow) — NOPAT approach
 *   2. Relative Valuation (P/E, P/B, EV/EBITDA, P/S, PEG)
 *   3. Dividend Discount Model (DDM) — Gordon Growth
 *   4. Asset-Based Valuation (Book Value + ROE premium)
 *
 * Key enhancements over v2:
 *   - Sector-specific model weights (from egx-sectors.ts)
 *   - WACC uses actual company debt ratio, not assumed 30%
 *   - DCF uses proper NOPAT approach (CFA Institute standard)
 *   - Sector-specific growth, terminal, FCF, and WACC parameters
 *   - EGP currency validation
 *   - Sector-specific relative valuation weights (which multiples matter most)
 */

import type { FundamentalData } from './fundamentals';
import { getSectorBenchmark, getSectorValuationProfile, EGYPT_MARKET_AVG, type SectorBenchmark } from './egx-sectors';

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
    waccComponents: { riskFreeRate: number; beta: number; equityRiskPremium: number; sizePremium: number; debtRatio: number; costOfDebt: number; taxRate: number };
    terminalGrowth: number;
    projectionYears: number;
    nopat: number;
    reinvestmentRate: number;
  };
  intrinsicValue: number;
}

export interface RelativeResult {
  peFairValue: number;
  pbFairValue: number;
  evEbitdaFairValue: number;
  psFairValue: number;
  pegFairValue: number;
  sectorAvgPE: number;
  sectorAvgPB: number;
  sectorAvgEVEbitda: number;
  sectorAvgPS: number;
  relativeWeights: { pe: number; pb: number; evEbitda: number; ps: number; peg: number };
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

export interface ModelWeights {
  dcf: number;
  relative: number;
  ddm: number;
  asset: number;
}

// ── Helper: WACC Calculation (CFA-standard, company-specific) ──
//
// Uses the ACTUAL company debt ratio derived from totalDebt and
// stockholdersEquity, rather than a blanket assumed 30%.
// Cost of debt is derived from interest expense / total debt when
// operating income is available; otherwise falls back to sector default.
//
// WACC = (D/V × Rd × (1 - T)) + (E/V × Re)
// Re = Rf + β × ERP + SP

function calculateWACC(
  beta: number,
  totalDebt: number,
  totalEquity: number,
  operatingIncome: number,
  riskFreeRate: number = EGYPT_MARKET_AVG.riskFreeRate,
  equityRiskPremium: number = EGYPT_MARKET_AVG.marketRiskPremium,
  sizePremium: number = 0.03,
  taxRate: number = 0.225,
  sectorCostOfDebt: number = 0.25,
  sectorDebtRatio: number = 0.30,
): number {
  const totalCapital = totalDebt + totalEquity;
  const debtRatio = totalCapital > 0 ? totalDebt / totalCapital : sectorDebtRatio;
  const equityRatio = 1 - debtRatio;

  // Cost of debt: derive from interest coverage if operating income available
  // Assume interest expense ≈ 15% of operating income as proxy
  // For banks/financials, totalDebt is deposits — cost is net interest margin
  const interestExpense = operatingIncome > 0 ? operatingIncome * 0.15 : 0;
  const costOfDebt = totalDebt > 0
    ? Math.max(0.10, Math.min(0.40, interestExpense / totalDebt))
    : sectorCostOfDebt;

  // Clamp beta to reasonable range (CFA convention)
  const betaAdj = Math.max(0.5, Math.min(2.5, beta || 1.0));

  // Cost of equity (CAPM + size premium)
  const costOfEquity = riskFreeRate + betaAdj * equityRiskPremium + sizePremium;

  // Weighted average cost of capital
  const wacc = (debtRatio * costOfDebt * (1 - taxRate)) + (equityRatio * costOfEquity);

  // Clamp to [8%, 50%] — reasonable bounds for Egyptian market
  return Math.max(0.08, Math.min(0.50, wacc));
}

// ── Model 1: DCF (NOPAT Approach — CFA Institute standard) ──────
//
// Instead of the simplistic "EPS × growth" method, we use:
//
//   NOPAT         = Operating Income × (1 - Tax Rate)
//   Reinvestment  = NOPAT × Reinvestment Rate
//   FCF           = NOPAT - Reinvestment
//
// Reinvestment Rate = (CapEx - Depreciation + Change in WC) / NOPAT
// We approximate as: CapEx / Operating Income when explicit WC not available.

export function calculateDCF(
  f: FundamentalData,
  sector?: string,
): DCFResult | null {
  // ── EGP Currency Validation ──
  if (f.currency && f.currency !== 'EGP') return null;

  if (!f.eps || f.eps <= 0 || f.sharesOutstanding <= 0) return null;

  // Get sector-specific parameters
  const profile = getSectorValuationProfile(sector || 'Other');
  const { dcfParams, waccParams } = profile;

  const shares = f.sharesOutstanding;

  // ── NOPAT Calculation ──
  // Operating Income is EBIT from TradingView
  const operatingIncome = f.operatingIncome > 0
    ? f.operatingIncome
    : (f.grossProfit > 0 ? f.grossProfit * 0.70 : f.revenue > 0 ? f.revenue * f.operatingMargin / 100 : 0);

  if (operatingIncome <= 0) return null;

  const taxRate = waccParams.taxRate;
  const nopat = operatingIncome * (1 - taxRate);

  // ── Reinvestment Rate ──
  // Approximate: CapEx / Operating Income
  // (ignoring depreciation change, working capital change for simplicity)
  const capEx = Math.abs(f.capex);
  const reinvestmentRate = operatingIncome > 0
    ? Math.max(0, Math.min(0.8, capEx / operatingIncome))
    : dcfParams.capExRatio;

  // ── Free Cash Flow ──
  const reinvestment = nopat * reinvestmentRate;
  const fcf = nopat - reinvestment;

  if (fcf <= 0) return null;

  // FCF per share
  const fcfPerShare = fcf / shares;
  const fcfMargin = f.revenue > 0 ? fcf / f.revenue : dcfParams.defaultFCFMargin;

  // ── Growth Assumptions ──
  const revGrowth = f.revenueGrowth > 0 ? f.revenueGrowth / 100 : dcfParams.baseGrowthRate;
  const baseGrowthRate = Math.max(0.02, Math.min(0.35, revGrowth));
  const terminalGrowth = dcfParams.terminalGrowthRate;
  const projectionYears = dcfParams.projectionYears;

  // ── WACC ──
  const beta = f.beta > 0 ? f.beta : waccParams.defaultBeta;
  const riskFreeRate = EGYPT_MARKET_AVG.riskFreeRate;
  const wacc = calculateWACC(
    beta,
    f.totalDebt,
    f.stockholdersEquity,
    operatingIncome,
    riskFreeRate,
    waccParams.equityRiskPremium,
    waccParams.sizePremium,
    taxRate,
    waccParams.costOfDebt,
    waccParams.defaultDebtRatio,
  );

  // Validate: WACC must exceed terminal growth for Gordon Growth
  if (wacc <= terminalGrowth) return null;

  // ── Project FCF per share ──
  const projectedFCF: number[] = [];
  let currentFCFPS = fcfPerShare;

  for (let i = 0; i < projectionYears; i++) {
    // Decaying growth rate (converges to terminal growth over projection period)
    // Uses geometric interpolation: g(t) = g_base × (g_terminal / g_base)^(t/(N-1))
    const yearGrowth = baseGrowthRate * Math.pow(terminalGrowth / baseGrowthRate, i / (projectionYears - 1));
    currentFCFPS *= (1 + yearGrowth);
    projectedFCF.push(currentFCFPS);
  }

  // ── Terminal Value (Gordon Growth Model) ──
  const lastFCF = projectedFCF[projectionYears - 1] || projectedFCF[projectedFCF.length - 1];
  const terminalValue = (lastFCF * (1 + terminalGrowth)) / (wacc - terminalGrowth);

  // ── Discount to Present Value ──
  let pvFCF = 0;
  for (let i = 0; i < projectionYears; i++) {
    pvFCF += projectedFCF[i] / Math.pow(1 + wacc, i + 1);
  }
  const pvTerminal = terminalValue / Math.pow(1 + wacc, projectionYears);

  const intrinsicValue = pvFCF + pvTerminal;

  if (!isFinite(intrinsicValue) || intrinsicValue <= 0) return null;

  return {
    projectedFCF,
    terminalValue,
    wacc,
    fcfYield: fcfMargin,
    growthRate: baseGrowthRate,
    assumptions: {
      revenueGrowthBase: baseGrowthRate * 100,
      fcfMargin: fcfMargin * 100,
      waccComponents: {
        riskFreeRate,
        beta,
        equityRiskPremium: waccParams.equityRiskPremium,
        sizePremium: waccParams.sizePremium,
        debtRatio: (f.totalDebt + f.stockholdersEquity) > 0 ? f.totalDebt / (f.totalDebt + f.stockholdersEquity) : waccParams.defaultDebtRatio,
        costOfDebt: waccParams.costOfDebt,
        taxRate,
      },
      terminalGrowth,
      projectionYears,
      nopat,
      reinvestmentRate,
    },
    intrinsicValue,
  };
}

// ── Model 2: Relative Valuation (Sector-Weighted Multiples) ────
//
// Uses sector-specific relative weights to emphasize the multiples
// that matter most for each sector (e.g., P/B for Financials, PEG for Tech).

export function calculateRelative(
  f: FundamentalData,
  sector: string,
  benchmarks?: Record<string, SectorBenchmark>
): RelativeResult | null {
  // ── EGP Currency Validation ──
  if (f.currency && f.currency !== 'EGP') return null;

  if (f.eps <= 0 && f.bvps <= 0) return null;

  const bench = getSectorBenchmark(sector, benchmarks);
  const profile = getSectorValuationProfile(sector, benchmarks);
  const { relativeWeights } = profile;

  // ── P/E Fair Value: EPS × Sector Average P/E ──
  const peFairValue = f.eps > 0 ? f.eps * bench.avgPE : 0;

  // ── P/B Fair Value: BVPS × Sector Average P/B ──
  const pbFairValue = f.bvps > 0 ? f.bvps * bench.avgPB : 0;

  // ── EV/EBITDA Fair Value: EBITDA per share × Sector Average ──
  const ebitdaPerShare = f.operatingIncome > 0 && f.sharesOutstanding > 0
    ? f.operatingIncome / f.sharesOutstanding
    : f.eps * 3; // Rough approximation: EBITDA ≈ 3× EPS
  const evEbitdaFairValue = ebitdaPerShare > 0 ? ebitdaPerShare * bench.avgEV_EBITDA : 0;

  // ── P/S Fair Value: Revenue per share × Sector Average P/S ──
  const psFairValue = f.revenuePerShare > 0 ? f.revenuePerShare * bench.avgPS : 0;

  // ── PEG Fair Value: EPS × PEG × (1 + earnings growth) ──
  // PEG = PE / (EPS growth rate). Fair PE = PEG × growth rate.
  // If PEG < 1 → undervalued; PEG > 1 → overvalued.
  let pegFairValue = 0;
  if (f.eps > 0 && f.earningsGrowth > 0) {
    const pegRatio = f.peg > 0 ? f.peg : (f.pe > 0 && f.earningsGrowth > 0 ? f.pe / f.earningsGrowth : 1.0);
    // Fair PE from PEG = 1.0 × earnings growth rate, capped at sector avg PE
    const fairPE = Math.min(pegRatio * f.earningsGrowth, bench.avgPE * 1.5);
    pegFairValue = f.eps * fairPE;
  }

  // ── Weighted Combination (Sector-Specific Weights) ──
  const validModels: Array<{ value: number; weight: number }> = [];

  if (peFairValue > 0) validModels.push({ value: peFairValue, weight: relativeWeights.pe });
  if (pbFairValue > 0) validModels.push({ value: pbFairValue, weight: relativeWeights.pb });
  if (evEbitdaFairValue > 0) validModels.push({ value: evEbitdaFairValue, weight: relativeWeights.evEbitda });
  if (psFairValue > 0) validModels.push({ value: psFairValue, weight: relativeWeights.ps });
  if (pegFairValue > 0) validModels.push({ value: pegFairValue, weight: relativeWeights.peg });

  if (validModels.length === 0) return null;

  // Normalize weights
  const totalWeight = validModels.reduce((s, m) => s + m.weight, 0);
  const weightedValue = validModels.reduce((s, m) => s + (m.value * m.weight / totalWeight), 0);

  return {
    peFairValue,
    pbFairValue,
    evEbitdaFairValue,
    psFairValue,
    pegFairValue,
    sectorAvgPE: bench.avgPE,
    sectorAvgPB: bench.avgPB,
    sectorAvgEVEbitda: bench.avgEV_EBITDA,
    sectorAvgPS: bench.avgPS,
    relativeWeights,
    weightedValue,
  };
}

// ── Model 3: Dividend Discount Model (DDM — Gordon Growth) ─────
//
// V = D₁ / (r - g)
// D₁ = D₀ × (1 + g)
// r = required return (derived from sector-specific WACC as equity cost)
// g = sustainable growth rate = ROE × (1 - payout ratio)

export function calculateDDM(
  f: FundamentalData,
  sector?: string,
): DDMResult | null {
  // ── EGP Currency Validation ──
  if (f.currency && f.currency !== 'EGP') return null;

  if (f.dividendYield <= 0 || f.eps <= 0) return null;

  const profile = getSectorValuationProfile(sector || 'Other');
  const { waccParams } = profile;

  const beta = f.beta > 0 ? f.beta : waccParams.defaultBeta;

  // Required return = cost of equity (CAPM)
  const requiredReturn = EGYPT_MARKET_AVG.riskFreeRate + beta * waccParams.equityRiskPremium + waccParams.sizePremium;

  // Dividend per share
  const dps = f.dps > 0 ? f.dps : f.eps * (f.payoutRatio / 100);
  if (dps <= 0) return null;

  // Growth rate: sustainable growth = ROE × retention ratio
  // Or use earnings/revenue growth if available
  const payoutRatio = f.payoutRatio > 0 ? f.payoutRatio : (dps / f.eps) * 100;
  const retentionRatio = 1 - payoutRatio / 100;

  let growthRate: number;
  const roe = f.roe > 0 ? f.roe / 100 : 0;
  if (roe > 0 && retentionRatio > 0) {
    // Sustainable growth rate (CFA standard)
    growthRate = Math.min(roe * retentionRatio, requiredReturn - 0.01);
  } else if (f.earningsGrowth > 0) {
    growthRate = Math.min(f.earningsGrowth / 100, requiredReturn - 0.01);
  } else if (f.revenueGrowth > 0) {
    growthRate = Math.min(f.revenueGrowth / 100, requiredReturn - 0.01);
  } else {
    growthRate = 0.05; // Default 5%
  }

  // DDM breaks if g >= r
  if (growthRate >= requiredReturn) return null;

  // Gordon Growth Model
  const intrinsicValue = dps * (1 + growthRate) / (requiredReturn - growthRate);

  if (!isFinite(intrinsicValue) || intrinsicValue <= 0) return null;

  return {
    intrinsicValue,
    dividendGrowthRate: growthRate * 100,
    requiredReturn,
    payoutRatio,
  };
}

// ── Model 4: Asset-Based Valuation ───────────────────────────────
//
// Adjusted BVPS = BVPS × (1 + ROE premium)
// ROE premium: (ROE - avgROE) × multiplier, clamped [-30%, +80%]
// This reflects the CFA principle that firms earning above their
// cost of equity deserve to trade above book value, and vice versa.

export function calculateAssetBased(
  f: FundamentalData,
  sector?: string,
): AssetResult | null {
  // ── EGP Currency Validation ──
  if (f.currency && f.currency !== 'EGP') return null;

  if (f.bvps <= 0) return null;

  const profile = getSectorValuationProfile(sector || 'Other');
  const bvps = f.bvps;

  // ROE premium: higher ROE justifies premium over book value
  const roe = f.roe > 0 ? f.roe / 100 : 0;
  const avgROE = profile.avgROE / 100;

  // Premium/discount based on ROE relative to sector average
  let premium = 0;
  if (roe > 0) {
    premium = (roe - avgROE) * 3; // 3× multiplier for ROE spread
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

// ── Model 5: Multi-Model Weighted (Sector-Aware) ─────────────────

export function calculateMultiModelWeighted(
  dcf: DCFResult | null,
  relative: RelativeResult | null,
  ddm: DDMResult | null,
  asset: AssetResult | null,
  dataQuality: number,
  sector: string,
): { fairValue: number; weights: ModelWeights } {
  const models: Array<{ value: number; key: keyof ModelWeights }> = [];

  if (dcf && dcf.intrinsicValue > 0) models.push({ value: dcf.intrinsicValue, key: 'dcf' });
  if (relative && relative.weightedValue > 0) models.push({ value: relative.weightedValue, key: 'relative' });
  if (ddm && ddm.intrinsicValue > 0) models.push({ value: ddm.intrinsicValue, key: 'ddm' });
  if (asset && asset.intrinsicValue > 0) models.push({ value: asset.intrinsicValue, key: 'asset' });

  if (models.length === 0) return { fairValue: 0, weights: { dcf: 0, relative: 0, ddm: 0, asset: 0 } };

  // Sector-specific default weights
  const profile = getSectorValuationProfile(sector);
  const defaultWeights: ModelWeights = { ...profile.modelWeights };

  // Adjust weights based on data quality and available models
  let totalWeight = 0;
  const weights: ModelWeights = { dcf: 0, relative: 0, ddm: 0, asset: 0 };

  for (const model of models) {
    let w = defaultWeights[model.key];

    // Quality-based adjustments (CFA practice: higher quality → more weight to intrinsic models)
    if (model.key === 'dcf' && dataQuality > 70) w *= 1.15;
    if (model.key === 'relative' && dataQuality < 40) w *= 0.75;

    weights[model.key] = w;
    totalWeight += w;
  }

  // Normalize and compute weighted average
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

  // ── EGP Currency Gate ──
  // If currency is explicitly non-EGP, return N/A
  const isNonEGP = f.currency && f.currency !== 'EGP';

  // Run all 4 models (pass sector for sector-aware calculations)
  const dcf = isNonEGP ? null : calculateDCF(f, sector);
  const relative = isNonEGP ? null : calculateRelative(f, sector, sectorBenchmarks);
  const ddm = isNonEGP ? null : calculateDDM(f, sector);
  const asset = isNonEGP ? null : calculateAssetBased(f, sector);

  // Data quality
  const dataQuality = getDataQuality(f);
  const activeModels = [dcf, relative, ddm, asset].filter(Boolean).length;

  // Get sector thresholds
  const profile = getSectorValuationProfile(sector, sectorBenchmarks);

  // Multi-model weighted with sector-specific weights
  const { fairValue: weightedFairValue, weights } = calculateMultiModelWeighted(
    dcf, relative, ddm, asset, dataQuality, sector
  );

  // Upside/downside
  const weightedUpside = currentPrice > 0
    ? ((weightedFairValue - currentPrice) / currentPrice) * 100
    : 0;

  // Valuation status (sector-specific thresholds)
  let status: ValuationStatus = 'N/A';
  if (isNonEGP) {
    status = 'N/A';
  } else if (weightedFairValue > 0 && currentPrice > 0) {
    if (weightedUpside > profile.thresholds.undervaluedUpside) status = 'Undervalued';
    else if (weightedUpside < profile.thresholds.overvaluedDownside) status = 'Overvalued';
    else status = 'Fairly Valued';
  }

  // Confidence level (sector-specific quality threshold)
  const confidence: 'High' | 'Medium' | 'Low' =
    dataQuality > profile.thresholds.highConfidenceQuality && activeModels >= 3 ? 'High' :
    dataQuality > 30 && activeModels >= 2 ? 'Medium' : 'Low';

  // Price targets (scenario analysis — ±15% around fair value)
  const bullishTarget = weightedFairValue * 1.15;
  const bearishTarget = weightedFairValue * 0.85;
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
