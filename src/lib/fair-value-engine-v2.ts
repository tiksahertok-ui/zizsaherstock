/**
 * Fair Value Engine V2 — Enhanced Valuation for EGX Stocks
 * ══════════════════════════════════════════════════════════════════
 * A SUPERSET of the original fair-value-engine.ts with advanced models:
 *
 *   1. Multi-Stage DCF (3-stage: High Growth → Transition → Terminal)
 *   2. Monte Carlo Simulation (10 000 runs with seeded PRNG)
 *   3. Multi-Stage Gordon Growth DDM (2-stage + terminal)
 *   4. Liquidation Analysis (NAV with asset haircuts)
 *   5. Scenario Analysis (Bull / Base / Bear)
 *   6. Composite Risk Score (0-100)
 *   7. Margin of Safety calculation
 *
 * All original exports are preserved for backward compatibility.
 * Uses 22.5 % Egyptian corporate tax throughout.
 */

import type { FundamentalData } from './fundamentals';
import { getSectorBenchmark, EGYPT_MARKET_AVG, type SectorBenchmark } from './egx-sectors';

// ── Re-export everything from V1 for backward compatibility ─────
export {
  type ValuationStatus,
  type DCFResult,
  type RelativeResult,
  type DDMResult,
  type AssetResult,
  type FairValueResult,
  type ModelWeights,
  calculateDCF,
  calculateRelative,
  calculateDDM,
  calculateAssetBased,
  calculateMultiModelWeighted,
  calculateFairValue,
  calculateBatchFairValues,
  rankByValuation,
} from './fair-value-engine';

import {
  calculateDCF as v1CalculateDCF,
  calculateRelative as v1CalculateRelative,
  calculateDDM as v1CalculateDDM,
  calculateAssetBased as v1CalculateAssetBased,
  calculateMultiModelWeighted as v1CalculateMultiModelWeighted,
  calculateFairValue as v1CalculateFairValue,
  type FairValueResult,
  type ValuationStatus,
  type DCFResult,
  type RelativeResult,
  type DDMResult,
  type AssetResult,
  type ModelWeights,
} from './fair-value-engine';

// ══════════════════════════════════════════════════════════════════
// Constants
// ══════════════════════════════════════════════════════════════════

/** Egyptian corporate income tax rate — 22.5 % */
const EGYPT_TAX_RATE = 0.225;

/** Default number of Monte Carlo simulations */
const MC_SIMULATIONS = 10_000;

/** High-growth stage duration (years) */
const STAGE1_YEARS = 3;

/** Transition stage duration (years) */
const STAGE2_YEARS = 4;

/** DDM Stage 1 high-growth duration (years) */
const DDM_STAGE1_YEARS = 5;

/** DDM Stage 2 stable-growth duration (years) */
const DDM_STAGE2_YEARS = 5;

/** Minimum WACC clamp */
const WACC_MIN = 0.10;

/** Maximum WACC clamp */
const WACC_MAX = 0.45;

/** Default working-capital-to-revenue ratio */
const WC_REV_RATIO = 0.10;

// ══════════════════════════════════════════════════════════════════
// V2 Type Definitions
// ══════════════════════════════════════════════════════════════════

// ── Multi-Stage DCF ───────────────────────────────────────────

/** Single year projection in the multi-stage DCF */
export interface MultiStageDCFYear {
  year: number;
  stage: 'high-growth' | 'transition' | 'terminal';
  revenue: number;
  revenueGrowth: number;
  operatingMargin: number;
  ebit: number;
  tax: number;
  nopat: number;
  capEx: number;
  workingCapitalChange: number;
  freeCashFlow: number;
  discountFactor: number;
  presentValue: number;
}

/** Result of the 3-stage DCF model */
export interface MultiStageDCFResult {
  projections: MultiStageDCFYear[];
  terminalValue: number;
  pvTerminalValue: number;
  pvFreeCashFlows: number;
  enterpriseValue: number;
  equityValue: number;
  intrinsicValuePerShare: number;
  wacc: number;
  stage1Growth: number;
  stage2GrowthStart: number;
  stage2GrowthEnd: number;
  terminalGrowth: number;
  initialOperatingMargin: number;
  terminalOperatingMargin: number;
  assumptions: {
    taxRate: number;
    capExRatioInitial: number;
    capExRatioTerminal: number;
    wcRatio: number;
  };
}

// ── Monte Carlo Simulation ──────────────────────────────────────

/** Configuration for Monte Carlo input distributions */
export interface MonteCarloConfig {
  /** Number of simulation runs (default 10 000) */
  iterations?: number;
  /** PRNG seed for deterministic results */
  seed?: number;
  /** Custom volatility multipliers per input parameter */
  volMultipliers?: {
    wacc?: number;
    growth?: number;
    margin?: number;
  };
}

/** Distribution of simulated fair values */
export interface MonteCarloResult {
  mean: number;
  median: number;
  stdDev: number;
  min: number;
  max: number;
  percentiles: {
    p5: number;
    p10: number;
    p25: number;
    p50: number;
    p75: number;
    p90: number;
    p95: number;
  };
  confidenceIntervals: {
    ci90: [number, number];
    ci95: [number, number];
  };
  probabilityOfUpside: number;
  currentPrice: number;
  iterations: number;
  seed: number;
}

// ── Enhanced Multi-Stage DDM ───────────────────────────────────

/** Result of the 2-stage + terminal DDM */
export interface MultiStageDDMResult {
  stage1Dividends: number[];
  stage2Dividends: number[];
  stage1GrowthRate: number;
  stage2GrowthRate: number;
  terminalGrowthRate: number;
  requiredReturn: number;
  payoutRatio: number;
  terminalValue: number;
  pvDividends: number;
  pvTerminalValue: number;
  intrinsicValuePerShare: number;
  dividendPerShare: number;
}

// ── Liquidation Analysis ───────────────────────────────────────

/** Breakdown of asset haircuts in liquidation */
export interface LiquidationAssetBreakdown {
  cash: number;
  cashHaircut: number;
  cashAfterHaircut: number;
  receivables: number;
  receivablesHaircut: number;
  receivablesAfterHaircut: number;
  inventory: number;
  inventoryHaircut: number;
  inventoryAfterHaircut: number;
  propertyPlantEquipment: number;
  ppeHaircut: number;
  ppeAfterHaircut: number;
  intangibles: number;
  intangiblesHaircut: number;
  intangiblesAfterHaircut: number;
}

/** Result of the liquidation analysis */
export interface LiquidationResult {
  /** Estimated liquidation value of total assets after haircuts */
  totalAssetsAfterHaircuts: number;
  /** Total liabilities assumed in liquidation */
  totalLiabilities: number;
  /** Net Asset Value (NAV) in liquidation */
  netAssetValue: number;
  /** Liquidation value per share */
  perShareValue: number;
  /** Detailed asset breakdown with haircuts */
  breakdown: LiquidationAssetBreakdown;
}

// ── Scenario Analysis ──────────────────────────────────────────

/** Fair value under a single scenario */
export interface ScenarioResult {
  label: string;
  description: string;
  fairValue: number;
  upside: number;
  assumptions: {
    wacc: number;
    revenueGrowth: number;
    operatingMargin: number;
    terminalGrowth: number;
  };
}

/** Bull / Base / Bear scenario comparison */
export interface ScenarioAnalysisResult {
  bull: ScenarioResult;
  base: ScenarioResult;
  bear: ScenarioResult;
  spread: number; // Difference between bull and bear fair values
}

// ── Composite V2 Result ─────────────────────────────────────────

/**
 * FairValueResultV2 extends the V1 result with all advanced models.
 * Every V1 field is present; V2 fields are nullable so the object
 * can be progressively enriched.
 */
export interface FairValueResultV2 extends FairValueResult {
  /** Multi-stage DCF (3-stage high-growth → transition → terminal) */
  multiStageDCF: MultiStageDCFResult | null;
  /** Monte Carlo simulation percentiles & confidence intervals */
  monteCarlo: MonteCarloResult | null;
  /** Liquidation NAV with asset haircuts */
  liquidation: LiquidationResult | null;
  /** Bull / Base / Bear scenario comparison */
  scenarioAnalysis: ScenarioAnalysisResult | null;
  /** Enhanced 2-stage DDM */
  multiStageDDM: MultiStageDDMResult | null;
  /** Composite risk score 0 (safest) – 100 (riskiest) */
  riskScore: number;
  /** Margin of safety as a positive percentage */
  marginOfSafety: number;
}

// ══════════════════════════════════════════════════════════════════
// Seeded Pseudo-Random Number Generator (Mulberry32)
// ══════════════════════════════════════════════════════════════════

/**
 * Mulberry32 — a fast 32-bit PRNG with a single uint32 seed.
 * Produces deterministic output for the same seed.
 */
function createPRNG(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Generate a normally-distributed sample using the Box-Muller transform.
 */
function normalRandom(rng: () => number, mean: number = 0, stdDev: number = 1): number {
  const u1 = Math.max(1e-10, rng());
  const u2 = rng();
  const z0 = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  return mean + z0 * stdDev;
}

/**
 * Generate a lognormally-distributed sample.
 * Returns exp(normal(μ, σ)) where μ and σ are the *log-space* parameters.
 */
function lognormalRandom(rng: () => number, logMean: number, logStdDev: number): number {
  return Math.exp(normalRandom(rng, logMean, logStdDev));
}

// ══════════════════════════════════════════════════════════════════
// Internal Helpers
// ══════════════════════════════════════════════════════════════════

/**
 * Calculate WACC (Weighted Average Cost of Capital) with Egyptian market defaults.
 * Mirrors the V1 helper but is duplicated here to avoid circular imports.
 */
function calculateWACC(
  beta: number,
  riskFreeRate: number = EGYPT_MARKET_AVG.riskFreeRate,
  equityRiskPremium: number = EGYPT_MARKET_AVG.marketRiskPremium,
  sizePremium: number = 0.03,
  debtCost: number = 0.20,
  debtRatio: number = 0.3,
): number {
  const betaAdj = Math.max(0.5, Math.min(2.0, beta || 1.0));
  const costOfEquity = riskFreeRate + betaAdj * equityRiskPremium + sizePremium;
  const wacc = (debtRatio * debtCost * (1 - EGYPT_TAX_RATE)) + ((1 - debtRatio) * costOfEquity);
  return Math.max(WACC_MIN, Math.min(WACC_MAX, wacc));
}

/**
 * Derive sensible base values from FundamentalData.
 * Returns normalised rates (not percentages).
 */
function deriveBaseAssumptions(f: FundamentalData) {
  const revGrowth = f.revenueGrowth > 0
    ? Math.max(0.02, Math.min(0.35, f.revenueGrowth / 100))
    : 0.10;

  const opMargin = f.operatingMargin > 0
    ? f.operatingMargin / 100
    : f.netMargin > 0
      ? f.netMargin / 100 * 1.5
      : 0.12;

  const capExRatio = f.capex !== 0 && f.revenue > 0
    ? Math.abs(f.capex) / f.revenue
    : 0.04;

  const beta = f.beta > 0 ? f.beta : 1.0;

  const revPerShare = f.revenuePerShare > 0
    ? f.revenuePerShare
    : f.revenue > 0 && f.sharesOutstanding > 0
      ? f.revenue / f.sharesOutstanding
      : f.eps > 0 ? f.eps * 8 : 0;

  return { revGrowth, opMargin, capExRatio, beta, revPerShare };
}

/**
 * Estimate receivables, inventory, PP&E, and intangibles from
 * available FundamentalData fields.
 *
 * These aren't directly exposed by TradingView's scanner API, so
 * we derive reasonable proxies from the balance-sheet totals.
 */
function estimateAssetBreakdown(f: FundamentalData) {
  const totalAssets = Math.max(f.totalAssets, 0);
  const cash = Math.max(f.cash, 0);
  const equity = Math.max(f.stockholdersEquity, 0);
  const nonCashNonEquity = Math.max(totalAssets - cash - equity, 0);

  // Approximate breakdown of non-cash, non-equity assets
  // (receivables + inventory + PP&E + intangibles ≈ total assets – cash)
  // We use rough sector-agnostic rules:
  const receivables = nonCashNonEquity * 0.25;
  const inventory = nonCashNonEquity * 0.15;
  const ppe = nonCashNonEquity * 0.50;
  const intangibles = Math.max(nonCashNonEquity - receivables - inventory - ppe, 0);

  return { cash, receivables, inventory, ppe, intangibles };
}

/**
 * Compute percentile from a sorted array using linear interpolation.
 */
function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  if (sorted.length === 1) return sorted[0];
  const idx = (p / 100) * (sorted.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

// ══════════════════════════════════════════════════════════════════
// Model: Multi-Stage DCF (3-Stage)
// ══════════════════════════════════════════════════════════════════

/**
 * Calculate the 3-stage Discounted Cash Flow intrinsic value.
 *
 * **Stage 1 (Years 1-3):** High-growth phase using the company's
 * actual revenue growth rate. Operating margin is held near current levels.
 *
 * **Stage 2 (Years 4-7):** Transition phase where revenue growth
 * linearly converges from the high-growth rate to the terminal growth
 * rate. Operating margin gradually improves.
 *
 * **Stage 3 (Terminal):** Gordon Growth Model applied to the final
 * projected FCF with Egypt's long-run growth rate (5 %).
 *
 * Each year's FCF is calculated as:
 *   FCF = NOPAT − CapEx − ΔWC
 * where NOPAT = Revenue × OpMargin × (1 − Tax).
 *
 * @param f  — Fundamental data for the stock
 * @returns  MultiStageDCFResult or null if data is insufficient
 */
export function calculateMultiStageDCF(f: FundamentalData): MultiStageDCFResult | null {
  if (f.eps <= 0 || f.sharesOutstanding <= 0) return null;

  const { revGrowth, opMargin: baseOpMargin, capExRatio: baseCapExRatio, beta, revPerShare } = deriveBaseAssumptions(f);
  if (revPerShare <= 0) return null;

  const wacc = calculateWACC(beta);
  const terminalGrowth = EGYPT_MARKET_AVG.terminalGrowth;
  const wcRatio = WC_REV_RATIO;

  // Terminal assumptions: margins stabilise, CapEx drops to maintenance
  const terminalOpMargin = Math.min(baseOpMargin * 1.05, 0.50);
  const terminalCapExRatio = Math.max(baseCapExRatio * 0.7, 0.02);

  const totalYears = STAGE1_YEARS + STAGE2_YEARS;
  const projections: MultiStageDCFYear[] = [];

  let currentRev = revPerShare;
  let prevRev = revPerShare;

  for (let yr = 1; yr <= totalYears; yr++) {
    const stage: MultiStageDCFYear['stage'] =
      yr <= STAGE1_YEARS ? 'high-growth' : 'transition';

    // Revenue growth rate interpolation
    let yrGrowth: number;
    if (stage === 'high-growth') {
      yrGrowth = revGrowth;
    } else {
      // Linear interpolation from stage1 growth to terminal growth over stage2
      const t = (yr - STAGE1_YEARS) / STAGE2_YEARS; // 0→1 over transition
      yrGrowth = revGrowth * (1 - t) + terminalGrowth * t;
    }

    currentRev *= (1 + yrGrowth);

    // Operating margin progression: margin improves slightly during transition
    const marginT = stage === 'high-growth' ? 0 : (yr - STAGE1_YEARS) / STAGE2_YEARS;
    const yrMargin = baseOpMargin + (terminalOpMargin - baseOpMargin) * marginT;

    // EBIT
    const ebit = currentRev * yrMargin;

    // NOPAT (Net Operating Profit After Tax)
    const nopat = ebit * (1 - EGYPT_TAX_RATE);

    // CapEx (declines during transition to maintenance)
    const capExT = stage === 'high-growth' ? 0 : marginT;
    const yrCapExRatio = baseCapExRatio + (terminalCapExRatio - baseCapExRatio) * capExT;
    const capEx = currentRev * yrCapExRatio;

    // Working capital change (proportional to revenue change)
    const deltaRev = currentRev - prevRev;
    const wcChange = deltaRev * wcRatio;
    prevRev = currentRev;

    // FCF
    const freeCashFlow = nopat - capEx - wcChange;

    // Discount factor
    const discountFactor = 1 / Math.pow(1 + wacc, yr);
    const presentValue = freeCashFlow * discountFactor;

    projections.push({
      year: yr,
      stage,
      revenue: currentRev,
      revenueGrowth: yrGrowth,
      operatingMargin: yrMargin,
      ebit,
      tax: ebit * EGYPT_TAX_RATE,
      nopat,
      capEx,
      workingCapitalChange: wcChange,
      freeCashFlow,
      discountFactor,
      presentValue,
    });
  }

  // Terminal value via Gordon Growth on last year's FCF
  const lastFCF = projections[projections.length - 1].freeCashFlow;
  const terminalValue = lastFCF > 0
    ? (lastFCF * (1 + terminalGrowth)) / (wacc - terminalGrowth)
    : 0;

  const pvTerminalValue = terminalValue / Math.pow(1 + wacc, totalYears);
  const pvFreeCashFlows = projections.reduce((s, y) => s + y.presentValue, 0);
  const enterpriseValue = pvFreeCashFlows + pvTerminalValue;

  // Subtract net debt to get equity value
  const netDebt = Math.max(f.totalDebt - f.cash, 0);
  const equityValue = enterpriseValue - (netDebt / f.sharesOutstanding);
  const intrinsicValuePerShare = Math.max(equityValue, 0);

  // Determine stage2 growth range for reporting
  const stage2StartGrowth = projections[STAGE1_YEARS]?.revenueGrowth ?? revGrowth;
  const stage2EndGrowth = projections[projections.length - 1]?.revenueGrowth ?? terminalGrowth;

  return {
    projections,
    terminalValue,
    pvTerminalValue,
    pvFreeCashFlows,
    enterpriseValue,
    equityValue,
    intrinsicValuePerShare,
    wacc,
    stage1Growth: revGrowth,
    stage2GrowthStart: stage2StartGrowth,
    stage2GrowthEnd: stage2EndGrowth,
    terminalGrowth,
    initialOperatingMargin: baseOpMargin,
    terminalOperatingMargin: terminalOpMargin,
    assumptions: {
      taxRate: EGYPT_TAX_RATE,
      capExRatioInitial: baseCapExRatio,
      capExRatioTerminal: terminalCapExRatio,
      wcRatio,
    },
  };
}

// ══════════════════════════════════════════════════════════════════
// Model: Multi-Stage Gordon Growth DDM
// ══════════════════════════════════════════════════════════════════

/**
 * Calculate the 2-stage + terminal Dividend Discount Model.
 *
 * **Stage 1 (Years 1-5):** High dividend growth based on earnings
 * or revenue growth, capped below the required return.
 *
 * **Stage 2 (Years 6-10):** Stable growth that linearly converges
 * to the terminal growth rate.
 *
 * **Terminal:** Gordon Growth Model on the final dividend.
 *
 * @param f  — Fundamental data for the stock
 * @returns  MultiStageDDMResult or null if dividend data is insufficient
 */
export function calculateMultiStageDDM(f: FundamentalData): MultiStageDDMResult | null {
  if (f.dividendYield <= 0 || f.eps <= 0) return null;

  const beta = f.beta > 0 ? f.beta : 1.0;
  const requiredReturn = calculateWACC(beta);

  // Dividend per share
  const dps = f.dps > 0
    ? f.dps
    : f.eps * (f.payoutRatio / 100);
  if (dps <= 0) return null;

  const payoutRatio = f.payoutRatio > 0 ? f.payoutRatio / 100 : dps / f.eps;

  // Stage 1 growth: use earnings growth or revenue growth, capped
  const rawGrowth = f.earningsGrowth > 0
    ? f.earningsGrowth / 100
    : f.revenueGrowth > 0
      ? f.revenueGrowth / 100
      : 0.05;
  const stage1Growth = Math.min(Math.max(rawGrowth, 0.02), requiredReturn - 0.03);

  // Stage 2 growth converges to terminal
  const terminalGrowth = EGYPT_MARKET_AVG.terminalGrowth;

  // ── Stage 1 projections ──
  const stage1Dividends: number[] = [];
  let currentDPS = dps;

  for (let yr = 1; yr <= DDM_STAGE1_YEARS; yr++) {
    currentDPS *= (1 + stage1Growth);
    stage1Dividends.push(currentDPS);
  }

  // ── Stage 2 projections ──
  const stage2Dividends: number[] = [];
  for (let yr = 1; yr <= DDM_STAGE2_YEARS; yr++) {
    const t = yr / DDM_STAGE2_YEARS; // 0→1
    const yrGrowth = stage1Growth * (1 - t) + terminalGrowth * t;
    currentDPS *= (1 + yrGrowth);
    stage2Dividends.push(currentDPS);
  }

  // ── Terminal value ──
  const lastDPS = currentDPS;
  if (terminalGrowth >= requiredReturn) return null;
  const terminalValue = (lastDPS * (1 + terminalGrowth)) / (requiredReturn - terminalGrowth);

  // ── Present values ──
  let pvDividends = 0;
  for (let i = 0; i < stage1Dividends.length; i++) {
    pvDividends += stage1Dividends[i] / Math.pow(1 + requiredReturn, i + 1);
  }
  for (let i = 0; i < stage2Dividends.length; i++) {
    const yr = DDM_STAGE1_YEARS + i + 1;
    pvDividends += stage2Dividends[i] / Math.pow(1 + requiredReturn, yr);
  }

  const totalYears = DDM_STAGE1_YEARS + DDM_STAGE2_YEARS;
  const pvTerminalValue = terminalValue / Math.pow(1 + requiredReturn, totalYears);

  const intrinsicValuePerShare = pvDividends + pvTerminalValue;

  return {
    stage1Dividends,
    stage2Dividends,
    stage1GrowthRate: stage1Growth,
    stage2GrowthRate: (stage1Growth + terminalGrowth) / 2,
    terminalGrowthRate: terminalGrowth,
    requiredReturn,
    payoutRatio,
    terminalValue,
    pvDividends,
    pvTerminalValue,
    intrinsicValuePerShare,
    dividendPerShare: dps,
  };
}

// ══════════════════════════════════════════════════════════════════
// Model: Monte Carlo Simulation
// ══════════════════════════════════════════════════════════════════

/**
 * Run a Monte Carlo simulation of the DCF-based fair value.
 *
 * For each iteration the engine randomly varies:
 *   - **WACC** — normally distributed around the base WACC
 *   - **Revenue growth rate** — lognormally distributed (must stay positive)
 *   - **Operating margin** — normally distributed with a floor at 2 %
 *
 * The DCF model is re-run with each set of inputs and the resulting
 * per-share intrinsic values are collected. Percentile statistics
 * and a probability-of-upside figure are computed.
 *
 * @param f       — Fundamental data for the stock
 * @param config  — Optional seed, iteration count, volatility multipliers
 * @returns       MonteCarloResult with full statistical breakdown
 */
export function calculateMonteCarlo(
  f: FundamentalData,
  config?: MonteCarloConfig,
): MonteCarloResult | null {
  if (f.eps <= 0 || f.sharesOutstanding <= 0) return null;

  const { revGrowth, opMargin, capExRatio, beta, revPerShare } = deriveBaseAssumptions(f);
  if (revPerShare <= 0) return null;

  const baseWACC = calculateWACC(beta);
  const terminalGrowth = EGYPT_MARKET_AVG.terminalGrowth;
  const iterations = config?.iterations ?? MC_SIMULATIONS;
  const seed = config?.seed ?? 42;

  const rng = createPRNG(seed);
  const volMul = {
    wacc: config?.volMultipliers?.wacc ?? 1.0,
    growth: config?.volMultipliers?.growth ?? 1.0,
    margin: config?.volMultipliers?.margin ?? 1.0,
  };

  const values: number[] = [];

  for (let i = 0; i < iterations; i++) {
    // Sample randomised inputs
    const sampleWACC = Math.max(
      WACC_MIN,
      Math.min(WACC_MAX, normalRandom(rng, baseWACC, 0.03 * volMul.wacc)),
    );

    const sampleGrowth = Math.max(
      0.005,
      lognormalRandom(
        rng,
        Math.log(Math.max(revGrowth, 0.01)),
        0.30 * volMul.growth,
      ),
    );

    const sampleMargin = Math.max(
      0.02,
      Math.min(0.80, normalRandom(rng, opMargin, 0.05 * volMul.margin)),
    );

    const sampleCapEx = Math.max(0.01, normalRandom(rng, capExRatio, 0.01));

    // ── Run simplified 7-year DCF with the sampled inputs ──
    const totalYears = STAGE1_YEARS + STAGE2_YEARS;
    let pv = 0;
    let curRev = revPerShare;
    let prevRev = revPerShare;

    for (let yr = 1; yr <= totalYears; yr++) {
      const isHighGrowth = yr <= STAGE1_YEARS;
      const t = isHighGrowth ? 0 : (yr - STAGE1_YEARS) / STAGE2_YEARS;
      const yrGrowth = sampleGrowth * (1 - t) + terminalGrowth * t;
      curRev *= (1 + yrGrowth);

      const yrMargin = sampleMargin;
      const ebit = curRev * yrMargin;
      const nopat = ebit * (1 - EGYPT_TAX_RATE);
      const capEx = curRev * sampleCapEx;
      const wcChange = (curRev - prevRev) * WC_REV_RATIO;
      prevRev = curRev;
      const fcf = nopat - capEx - wcChange;

      pv += fcf / Math.pow(1 + sampleWACC, yr);
    }

    // Terminal value — project one more year at terminal growth to get FCF_{N+1}
    // Gordon Growth Model: TV_N = FCF_{N+1} / (WACC - g)
    const termRev = curRev * (1 + terminalGrowth);
    const termNOPAT = (termRev * sampleMargin) * (1 - EGYPT_TAX_RATE);
    const termCapEx = termRev * sampleCapEx;
    const termWC = (termRev - curRev) * WC_REV_RATIO;
    const lastFCF = termNOPAT - termCapEx - termWC;
    if (lastFCF > 0 && sampleWACC > terminalGrowth) {
      const tv = lastFCF / (sampleWACC - terminalGrowth);
      pv += tv / Math.pow(1 + sampleWACC, totalYears);
    }

    values.push(pv);
  }

  // ── Compute statistics ──
  const sorted = [...values].sort((a, b) => a - b);
  const n = sorted.length;
  const mean = values.reduce((a, b) => a + b, 0) / n;
  const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / n;
  const stdDev = Math.sqrt(variance);

  const percentiles = {
    p5: percentile(sorted, 5),
    p10: percentile(sorted, 10),
    p25: percentile(sorted, 25),
    p50: percentile(sorted, 50),
    p75: percentile(sorted, 75),
    p90: percentile(sorted, 90),
    p95: percentile(sorted, 95),
  };

  // Probability that the fair value exceeds the current price
  const upsideCount = values.filter(v => v > f.price).length;
  const probabilityOfUpside = upsideCount / n;

  return {
    mean,
    median: percentile(sorted, 50),
    stdDev,
    min: sorted[0],
    max: sorted[n - 1],
    percentiles,
    confidenceIntervals: {
      ci90: [percentile(sorted, 5), percentile(sorted, 95)],
      ci95: [percentile(sorted, 2.5), percentile(sorted, 97.5)],
    },
    probabilityOfUpside,
    currentPrice: f.price,
    iterations,
    seed,
  };
}

// ══════════════════════════════════════════════════════════════════
// Model: Liquidation Analysis
// ══════════════════════════════════════════════════════════════════

/**
 * Calculate the liquidation (break-up) value per share.
 *
 * Asset haircuts applied:
 *   - Cash & equivalents  → 100 % (full recovery assumed)
 *   - Receivables         → 80 %
 *   - Inventory           → 60 %
 *   - PP&E                → 70 %
 *   - Intangibles         → 0 % (written off entirely)
 *
 * Total liabilities are deducted at book value, and the remainder
 * is divided by shares outstanding.
 *
 * @param f  — Fundamental data for the stock
 * @returns  LiquidationResult or null if balance-sheet data is missing
 */
export function calculateLiquidation(f: FundamentalData): LiquidationResult | null {
  if (f.sharesOutstanding <= 0) return null;

  const assets = estimateAssetBreakdown(f);

  const haircuts = {
    cash: 1.00,
    receivables: 0.80,
    inventory: 0.60,
    ppe: 0.70,
    intangibles: 0.00,
  };

  const cashAfterHaircut = assets.cash * haircuts.cash;
  const receivablesAfterHaircut = assets.receivables * haircuts.receivables;
  const inventoryAfterHaircut = assets.inventory * haircuts.inventory;
  const ppeAfterHaircut = assets.ppe * haircuts.ppe;
  const intangiblesAfterHaircut = assets.intangibles * haircuts.intangibles;

  const totalAssetsAfterHaircuts =
    cashAfterHaircut +
    receivablesAfterHaircut +
    inventoryAfterHaircut +
    ppeAfterHaircut +
    intangiblesAfterHaircut;

  const totalLiabilities = Math.max(f.totalLiabilities, 0);
  const netAssetValue = Math.max(totalAssetsAfterHaircuts - totalLiabilities, 0);
  const perShareValue = netAssetValue / f.sharesOutstanding;

  return {
    totalAssetsAfterHaircuts,
    totalLiabilities,
    netAssetValue,
    perShareValue,
    breakdown: {
      cash: assets.cash,
      cashHaircut: haircuts.cash,
      cashAfterHaircut,
      receivables: assets.receivables,
      receivablesHaircut: haircuts.receivables,
      receivablesAfterHaircut,
      inventory: assets.inventory,
      inventoryHaircut: haircuts.inventory,
      inventoryAfterHaircut,
      propertyPlantEquipment: assets.ppe,
      ppeHaircut: haircuts.ppe,
      ppeAfterHaircut,
      intangibles: assets.intangibles,
      intangiblesHaircut: haircuts.intangibles,
      intangiblesAfterHaircut,
    },
  };
}

// ══════════════════════════════════════════════════════════════════
// Model: Scenario Analysis (Bull / Base / Bear)
// ══════════════════════════════════════════════════════════════════

/**
 * Internal helper: run a scenario-adjusted DCF to produce a fair value.
 */
function runScenarioDCF(
  f: FundamentalData,
  assumptions: { wacc: number; revenueGrowth: number; operatingMargin: number; terminalGrowth: number },
): number {
  const { revPerShare } = deriveBaseAssumptions(f);
  if (revPerShare <= 0 || f.sharesOutstanding <= 0) return 0;

  const { wacc, revenueGrowth, operatingMargin, terminalGrowth } = assumptions;
  const capExRatio = f.capex !== 0 && f.revenue > 0
    ? Math.abs(f.capex) / f.revenue
    : 0.04;

  const totalYears = STAGE1_YEARS + STAGE2_YEARS;
  let pv = 0;
  let curRev = revPerShare;
  let prevRev = revPerShare;

  for (let yr = 1; yr <= totalYears; yr++) {
    const isHighGrowth = yr <= STAGE1_YEARS;
    const t = isHighGrowth ? 0 : (yr - STAGE1_YEARS) / STAGE2_YEARS;
    const yrGrowth = revenueGrowth * (1 - t) + terminalGrowth * t;
    curRev *= (1 + yrGrowth);

    const ebit = curRev * operatingMargin;
    const nopat = ebit * (1 - EGYPT_TAX_RATE);
    const capEx = curRev * capExRatio;
    const wcChange = (curRev - prevRev) * WC_REV_RATIO;
    prevRev = curRev;
    const fcf = nopat - capEx - wcChange;

    pv += fcf / Math.pow(1 + wacc, yr);
  }

  // Terminal value — project one more year at terminal growth to get FCF_{N+1}
  // Gordon Growth Model: TV_N = FCF_{N+1} / (WACC - g)
  const termRev = curRev * (1 + terminalGrowth);
  const termNOPAT = (termRev * operatingMargin) * (1 - EGYPT_TAX_RATE);
  const termCapEx = termRev * capExRatio;
  const termWC = (termRev - curRev) * WC_REV_RATIO;
  const lastFCF = termNOPAT - termCapEx - termWC;
  if (lastFCF > 0 && wacc > terminalGrowth) {
    const tv = lastFCF / (wacc - terminalGrowth);
    pv += tv / Math.pow(1 + wacc, totalYears);
  }

  const netDebt = Math.max(f.totalDebt - f.cash, 0);
  return Math.max(pv - netDebt / f.sharesOutstanding, 0);
}

/**
 * Perform Bull / Base / Bear scenario analysis.
 *
 * - **Bull:**  20 % higher growth, 1pp lower WACC, 2pp higher margin
 * - **Base:**  Current company metrics (no adjustment)
 * - **Bear:**  20 % lower growth, 1pp higher WACC, 2pp lower margin
 *
 * @param f  — Fundamental data for the stock
 * @returns  ScenarioAnalysisResult or null if data is insufficient
 */
export function calculateScenarioAnalysis(f: FundamentalData): ScenarioAnalysisResult | null {
  if (f.eps <= 0 || f.sharesOutstanding <= 0) return null;

  const { revGrowth, opMargin, beta } = deriveBaseAssumptions(f);
  const baseWACC = calculateWACC(beta);
  const terminalGrowth = EGYPT_MARKET_AVG.terminalGrowth;

  // ── Bull scenario ──
  const bullWACC = Math.max(WACC_MIN, baseWACC - 0.01);
  const bullGrowth = Math.min(revGrowth * 1.20, 0.40);
  const bullMargin = Math.min(opMargin + 0.02, 0.80);
  const bullFV = runScenarioDCF(f, { wacc: bullWACC, revenueGrowth: bullGrowth, operatingMargin: bullMargin, terminalGrowth });

  // ── Base scenario ──
  const baseFV = runScenarioDCF(f, { wacc: baseWACC, revenueGrowth: revGrowth, operatingMargin: opMargin, terminalGrowth });

  // ── Bear scenario ──
  const bearWACC = Math.min(WACC_MAX, baseWACC + 0.01);
  const bearGrowth = Math.max(revGrowth * 0.80, 0.01);
  const bearMargin = Math.max(opMargin - 0.02, 0.02);
  const bearFV = runScenarioDCF(f, { wacc: bearWACC, revenueGrowth: bearGrowth, operatingMargin: bearMargin, terminalGrowth });

  return {
    bull: {
      label: 'Bull',
      description: 'Optimistic: higher growth, lower discount rate, improved margins',
      fairValue: bullFV,
      upside: f.price > 0 ? ((bullFV - f.price) / f.price) * 100 : 0,
      assumptions: { wacc: bullWACC, revenueGrowth: bullGrowth, operatingMargin: bullMargin, terminalGrowth },
    },
    base: {
      label: 'Base',
      description: 'Current metrics with no adjustment',
      fairValue: baseFV,
      upside: f.price > 0 ? ((baseFV - f.price) / f.price) * 100 : 0,
      assumptions: { wacc: baseWACC, revenueGrowth: revGrowth, operatingMargin: opMargin, terminalGrowth },
    },
    bear: {
      label: 'Bear',
      description: 'Conservative: lower growth, higher discount rate, compressed margins',
      fairValue: bearFV,
      upside: f.price > 0 ? ((bearFV - f.price) / f.price) * 100 : 0,
      assumptions: { wacc: bearWACC, revenueGrowth: bearGrowth, operatingMargin: bearMargin, terminalGrowth },
    },
    spread: bullFV - bearFV,
  };
}

// ══════════════════════════════════════════════════════════════════
// Composite Risk Score (0-100)
// ══════════════════════════════════════════════════════════════════

/**
 * Calculate a composite risk score from 0 (safest) to 100 (riskiest).
 *
 * Components:
 *   - **Leverage risk** — higher debt / equity → higher score
 *   - **Volatility risk** — higher beta → higher score
 *   - **Valuation dispersion** — wider Monte Carlo spread → higher score
 *   - **Profitability risk** — lower / negative margins → higher score
 *   - **Liquidity risk** — low trading volume → higher score
 *   - **Size risk** — smaller market cap → higher score
 */
function calculateRiskScore(
  f: FundamentalData,
  mc: MonteCarloResult | null,
): number {
  let score = 0;
  let maxScore = 0;

  // ── Leverage (0-20) ──
  maxScore += 20;
  const de = f.debtEquity;
  if (de > 5) score += 20;
  else if (de > 3) score += 15;
  else if (de > 1) score += 10;
  else if (de > 0) score += 5;

  // ── Beta / volatility (0-20) ──
  maxScore += 20;
  const b = f.beta > 0 ? f.beta : 1.0;
  if (b > 1.8) score += 20;
  else if (b > 1.4) score += 15;
  else if (b > 1.0) score += 10;
  else if (b > 0.7) score += 5;

  // ── Valuation dispersion from Monte Carlo (0-20) ──
  maxScore += 20;
  if (mc && mc.mean > 0) {
    const cv = mc.stdDev / mc.mean; // Coefficient of variation
    if (cv > 1.0) score += 20;
    else if (cv > 0.6) score += 15;
    else if (cv > 0.3) score += 10;
    else if (cv > 0.15) score += 5;
  } else {
    score += 10; // No MC data → moderate uncertainty
  }

  // ── Profitability (0-15) ──
  maxScore += 15;
  const nm = f.netMargin;
  if (nm <= 0) score += 15;
  else if (nm < 3) score += 10;
  else if (nm < 8) score += 5;

  // ── Liquidity (0-15) ──
  maxScore += 15;
  // Proxy: compare market cap to a threshold
  const mcUSD = f.marketCap * 0.032; // rough EGP → USD (subjective)
  if (mcUSD < 50_000_000) score += 15;
  else if (mcUSD < 200_000_000) score += 10;
  else if (mcUSD < 1_000_000_000) score += 5;

  // ── FCF health (0-10) ──
  maxScore += 10;
  if (f.freeCashFlow < 0) score += 10;
  else if (f.operatingCashFlow > 0 && f.freeCashFlow < f.operatingCashFlow * 0.3) score += 5;

  return maxScore > 0 ? Math.round((score / maxScore) * 100) : 50;
}

// ══════════════════════════════════════════════════════════════════
// Margin of Safety
// ══════════════════════════════════════════════════════════════════

/**
 * Calculate the margin of safety as a percentage.
 *
 * MoS = ((Fair Value − Price) / Fair Value) × 100
 *
 * A positive MoS means the stock is trading below fair value
 * (providing a "cushion"). A negative MoS means the stock is
 * overpriced relative to the estimate.
 */
function calculateMarginOfSafety(fairValue: number, currentPrice: number): number {
  if (fairValue <= 0) return 0;
  return ((fairValue - currentPrice) / fairValue) * 100;
}

// ══════════════════════════════════════════════════════════════════
// V2 Main: calculateFairValueV2
// ══════════════════════════════════════════════════════════════════

/**
 * Calculate the full V2 fair value for a single stock.
 *
 * Runs all V1 models (DCF, Relative, DDM, Asset-Based, Weighted) and
 * all V2 advanced models (Multi-Stage DCF, Monte Carlo, Multi-Stage
 * DDM, Liquidation, Scenario Analysis). Produces a composite risk
 * score and margin of safety.
 *
 * @param f                — Fundamental data for the stock
 * @param sector           — EGX sector name
 * @param sectorBenchmarks — Optional pre-computed sector benchmarks
 * @param mcConfig         — Optional Monte Carlo configuration
 * @returns                FairValueResultV2 with all models populated
 */
export function calculateFairValueV2(
  f: FundamentalData,
  sector: string,
  sectorBenchmarks?: Record<string, SectorBenchmark>,
  mcConfig?: MonteCarloConfig,
): FairValueResultV2 {
  // ── V1 base result ──
  const v1 = v1CalculateFairValue(f, sector, sectorBenchmarks);

  // ── V2 advanced models ──
  const multiStageDCF = calculateMultiStageDCF(f);
  const monteCarlo = calculateMonteCarlo(f, mcConfig);
  const multiStageDDM = calculateMultiStageDDM(f);
  const liquidation = calculateLiquidation(f);
  const scenarioAnalysis = calculateScenarioAnalysis(f);

  // ── Risk & safety ──
  const riskScore = calculateRiskScore(f, monteCarlo);
  const marginOfSafety = calculateMarginOfSafety(v1.weightedFairValue, f.price);

  return {
    // V1 fields
    symbol: v1.symbol,
    name: v1.name,
    sector: v1.sector,
    currentPrice: v1.currentPrice,
    dcf: v1.dcf,
    relative: v1.relative,
    ddm: v1.ddm,
    asset: v1.asset,
    weightedFairValue: v1.weightedFairValue,
    weightedUpside: v1.weightedUpside,
    status: v1.status,
    modelWeights: v1.modelWeights,
    dataQuality: v1.dataQuality,
    confidence: v1.confidence,
    activeModels: v1.activeModels,
    totalModels: v1.totalModels,
    bullishTarget: v1.bullishTarget,
    baseTarget: v1.baseTarget,
    bearishTarget: v1.bearishTarget,
    calculatedAt: v1.calculatedAt,
    modelWarnings: v1.modelWarnings,
    dataSource: v1.dataSource,
    dataFetchedAt: v1.dataFetchedAt,
    missingFields: v1.missingFields,

    // V2 fields
    multiStageDCF,
    monteCarlo,
    liquidation,
    scenarioAnalysis,
    multiStageDDM,
    riskScore,
    marginOfSafety,
  };
}

// ══════════════════════════════════════════════════════════════════
// V2 Batch Calculation
// ══════════════════════════════════════════════════════════════════

/**
 * Calculate V2 fair values for a batch of stocks.
 *
 * @param fundamentals      — Map of symbol → FundamentalData
 * @param stockSectors      — Map of symbol → sector name
 * @param sectorBenchmarks  — Optional pre-computed sector benchmarks
 * @param mcConfig          — Optional Monte Carlo configuration
 * @returns                 Array of FairValueResultV2 sorted by risk score (best first)
 */
export function calculateBatchFairValuesV2(
  fundamentals: Record<string, FundamentalData>,
  stockSectors: Record<string, string>,
  sectorBenchmarks?: Record<string, SectorBenchmark>,
  mcConfig?: MonteCarloConfig,
): FairValueResultV2[] {
  const results: FairValueResultV2[] = [];

  for (const [symbol, f] of Object.entries(fundamentals)) {
    const sector = stockSectors[symbol] || 'Other';
    const fv2 = calculateFairValueV2(f, sector, sectorBenchmarks, mcConfig);
    results.push(fv2);
  }

  // Sort by risk score ascending (lowest risk first)
  return results.sort((a, b) => a.riskScore - b.riskScore);
}

/**
 * Rank stocks by V2 valuation attractiveness.
 * Considers V2 upside, risk score, and Monte Carlo confidence.
 */
export function rankByValuationV2(results: FairValueResultV2[]): FairValueResultV2[] {
  return results
    .filter(r => {
      // Must have some indication of undervaluation
      const hasUpside = r.weightedUpside > 10 || r.marginOfSafety > 10;
      const notLowConfidence = r.confidence !== 'Low';
      return hasUpside && notLowConfidence;
    })
    .sort((a, b) => {
      // Primary sort: margin of safety (higher = more attractive)
      const mosDiff = b.marginOfSafety - a.marginOfSafety;
      if (Math.abs(mosDiff) > 1) return mosDiff;
      // Secondary sort: lower risk score
      return a.riskScore - b.riskScore;
    });
}
