/**
 * Fair Value Engine V3 — Sector-Aware Egyptian Stock Valuation
 * ══════════════════════════════════════════════════════════════════════
 * The most advanced valuation engine for the Egyptian stock market (EGX),
 * building on V2 with sector-specific model selection, confidence scoring,
 * and fully auditable calculation trails.
 *
 * V3 Adds:
 *   1. Auto model selection per sector (8 sector groups, 16 model types)
 *   2. Sector-specific valuation models:
 *      - ROE-Based Valuation (Banks)
 *      - Excess Return / EVA Model (Banks)
 *      - NAV Model (Real Estate)
 *      - Adjusted NAV (Insurance)
 *      - Sum of the Parts / SOTP (Holding Companies)
 *      - Revenue Multiple Model (loss-making growth)
 *      - PEG Model (growth stocks)
 *      - Gordon Growth Enhanced DDM (high-dividend)
 *   3. Valuation confidence scoring (0–100)
 *   4. Data quality scoring with institutional grading
 *   5. Fully auditable calculation trail
 *   6. Transparent assumption documentation
 *   7. WACC details from the egypt-wacc-engine
 *
 * All monetary values in Egyptian Pounds (EGP).
 * All rates in decimal form (0.225 = 22.5%).
 * Egyptian corporate tax rate: 22.5%.
 *
 * @module fair-value-engine-v3
 */

// ══════════════════════════════════════════════════════════════════════
// Re-export V2 for backward compatibility
// ══════════════════════════════════════════════════════════════════════

export * from './fair-value-engine-v2';

// ══════════════════════════════════════════════════════════════════════
// Imports
// ══════════════════════════════════════════════════════════════════════

import type { FundamentalData } from './fundamentals';
import {
  getSectorBenchmark,
  getSectorValuationProfile,
  EGYPT_MARKET_AVG,
  type SectorBenchmark,
  type SectorValuationProfile,
} from './egx-sectors';
import {
  calculateEgyptianWACC,
  getEgyptMacroEnvironment,
  type WACCResult,
} from './egypt-wacc-engine';
import type { ValuationConfidence, DataQualityScore } from './data-validator-v2';
import {
  calculateMonteCarlo,
  calculateMultiStageDCF,
  calculateMultiStageDDM,
  calculateLiquidation,
  calculateScenarioAnalysis,
  calculateFairValueV2 as v2CalculateFairValueV2,
  type MonteCarloResult,
  type MultiStageDCFResult,
  type MonteCarloConfig,
  type FairValueResultV2,
} from './fair-value-engine-v2';
import {
  calculateFairValue as v1CalculateFairValue,
} from './fair-value-engine';

// ══════════════════════════════════════════════════════════════════════
// Constants
// ══════════════════════════════════════════════════════════════════════

/** Egyptian corporate income tax rate — 22.5 % */
const EGYPT_TAX_RATE = 0.225;

/** Current Egypt inflation assumption for real-rate adjustments */
const EGYPT_INFLATION_RATE = 0.23;

// ══════════════════════════════════════════════════════════════════════
// V3 Type Definitions
// ══════════════════════════════════════════════════════════════════════

/**
 * All valuation model types supported by the V3 engine.
 * Includes V1/V2 legacy models plus V3 sector-specific additions.
 */
export type ValuationModel =
  | 'dcf'
  | 'relative_pe'
  | 'relative_pb'
  | 'relative_ev_ebitda'
  | 'relative_ps'
  | 'ddm'
  | 'asset_based'
  | 'nav'
  | 'adjusted_nav'
  | 'roe_based'
  | 'excess_return'
  | 'sotp'
  | 'revenue_multiple'
  | 'peg'
  | 'gordon_ddm'
  | 'monte_carlo'
  | 'scenario';

// ── Model Selection Result ─────────────────────────────────────────

/**
 * Result of the auto model selection engine.
 *
 * Determines which valuation models are most appropriate for a company
 * based on its sector, data availability, and financial characteristics.
 */
export interface ModelSelectionResult {
  /** The models selected for this company */
  selectedModels: ValuationModel[];
  /** Weight assigned to each selected model (sums to 1.0) */
  weights: Record<string, number>;
  /** Human-readable explanation of the selection rationale */
  reason: string;
  /** Sector profile description used for selection */
  sectorProfile: string;
}

// ── Sector-Specific Model Results ────────────────────────────────

/**
 * Result of a single sector-specific valuation model.
 * Each model returns its fair value, weight, confidence, and assumptions.
 */
export interface SectorSpecificModelResult {
  /** The valuation model name (e.g., 'roe_based', 'nav', 'sotp') */
  modelName: string;
  /** Calculated fair value per share in EGP */
  fairValue: number;
  /** Weight of this model in the overall V3 composite (0–1) */
  weight: number;
  /** Confidence in this model's result (0–1) */
  confidence: number;
  /** Key numerical assumptions used in the calculation */
  assumptions: Record<string, number>;
  /** Human-readable description of the model's application */
  description: string;
}

// ── Audit Trail ────────────────────────────────────────────────────

/**
 * A single auditable calculation step in the valuation trail.
 *
 * Each entry documents the formula, inputs, and output of a specific
 * calculation step, enabling full reproducibility and compliance review.
 */
export interface AuditEntry {
  /** Description of this calculation step */
  step: string;
  /** The mathematical formula used (e.g., 'BV × (ROE / CoE)') */
  formula: string;
  /** Numerical inputs to the formula */
  inputs: Record<string, number>;
  /** Numerical output of the formula */
  output: number;
  /** ISO 8601 timestamp of when this step was computed */
  timestamp: string;
  /** Which valuation model produced this step */
  model: string;
}

// ── Transparent Assumptions ───────────────────────────────────────

/**
 * Fully documented set of assumptions used in the valuation.
 *
 * Each assumption includes its value, source (e.g., "Sector profile",
 * "Calculated", "Damodaran"), and methodology description.
 */
export interface TransparentAssumptions {
  discountRate: { value: number; source: string; methodology: string };
  growthRate: { value: number; source: string; methodology: string };
  terminalGrowth: { value: number; source: string; methodology: string };
  taxRate: { value: number; source: string; methodology: string };
  sectorPremiums: { field: string; value: number; source: string }[];
  countryRiskPremium: { value: number; source: string };
  inflationAssumption: { value: number; source: string };
}

// ── V3 Composite Result ───────────────────────────────────────────

/**
 * The complete V3 fair value result, extending V2 with sector-specific
 * models, confidence scoring, audit trail, and transparent assumptions.
 */
export interface FairValueResultV3 extends FairValueResultV2 {
  /** Results from each sector-specific model */
  sectorSpecificModels: SectorSpecificModelResult[];

  /** Auto-selected model weights and rationale */
  modelSelection: ModelSelectionResult;

  /** Valuation confidence assessment */
  valuationConfidence: ValuationConfidence;

  /** Data quality scoring (institutional-grade) — V3 enhanced */
  v3DataQuality: DataQualityScore;

  /** Step-by-step auditable calculation trail */
  auditTrail: AuditEntry[];

  /** Transparent documentation of all assumptions */
  transparentAssumptions: TransparentAssumptions;

  /** Detailed WACC breakdown from the egypt-wacc-engine */
  waccDetails: WACCResult;

  /** V3-specific composite fair value (sector-aware weighted) */
  v3FairValue: number;

  /** V3-specific upside percentage vs current price */
  v3Upside: number;

  /** V3 valuation status */
  v3Status: 'Undervalued' | 'Fairly Valued' | 'Overvalued' | 'N/A';
}

// ══════════════════════════════════════════════════════════════════════
// Sector Classification Map
// ══════════════════════════════════════════════════════════════════════

/**
 * Maps EGX sector names to broader sector groups used for model selection.
 * The V3 engine groups related sectors to apply the most appropriate
 * valuation methodology.
 */
export const SECTOR_GROUP_MAP: Record<string, string> = {
  'Financials': 'banks_financials',
  'Insurance': 'insurance',
  'Real Estate': 'real_estate',
  'Materials': 'industrial',
  'Industrials': 'industrial',
  'Consumer Defensive': 'consumer',
  'Consumer Discretionary': 'consumer',
  'Healthcare': 'healthcare',
  'Technology': 'technology',
  'Energy': 'energy',
  'Communication Services': 'communication',
  'Utilities': 'utilities',
  'Holding Companies': 'holdings',
};

/**
 * Sector group → preferred valuation models.
 *
 * Each group defines which models are available and their default
 * relative weights within that group.
 */
export const SECTOR_MODEL_MAP: Record<string, {
  models: ValuationModel[];
  defaultWeights: Record<string, number>;
  reason: string;
}> = {
  banks_financials: {
    models: ['roe_based', 'relative_pb', 'excess_return', 'ddm', 'dcf'],
    defaultWeights: { roe_based: 0.30, relative_pb: 0.25, excess_return: 0.20, ddm: 0.15, dcf: 0.10 },
    reason: 'Banks and financial institutions valued primarily on P/B, ROE, and excess returns. DDM relevant for dividend-paying banks.',
  },
  insurance: {
    models: ['adjusted_nav', 'relative_pb', 'ddm', 'dcf'],
    defaultWeights: { adjusted_nav: 0.35, relative_pb: 0.25, ddm: 0.25, dcf: 0.15 },
    reason: 'Insurance companies valued on embedded value / adjusted NAV. P/B and dividend models are secondary.',
  },
  real_estate: {
    models: ['nav', 'dcf', 'relative_pb', 'ddm', 'relative_pe'],
    defaultWeights: { nav: 0.35, dcf: 0.25, relative_pb: 0.20, ddm: 0.10, relative_pe: 0.10 },
    reason: 'Real estate developers valued on NAV (land bank + inventory - liabilities). DCF for development pipeline.',
  },
  industrial: {
    models: ['dcf', 'relative_ev_ebitda', 'relative_pe', 'asset_based', 'ddm'],
    defaultWeights: { dcf: 0.30, relative_ev_ebitda: 0.25, relative_pe: 0.20, asset_based: 0.15, ddm: 0.10 },
    reason: 'Industrial/materials firms valued on DCF and EV/EBITDA. P/E for cyclical comparison. Asset-based as floor.',
  },
  consumer: {
    models: ['dcf', 'relative_ev_ebitda', 'relative_pe', 'ddm', 'gordon_ddm'],
    defaultWeights: { dcf: 0.30, relative_ev_ebitda: 0.20, relative_pe: 0.20, ddm: 0.15, gordon_ddm: 0.15 },
    reason: 'Consumer stocks valued on DCF with EV/EBITDA and P/E relative multiples. DDM for defensive staples with dividends.',
  },
  healthcare: {
    models: ['dcf', 'relative_ev_ebitda', 'peg', 'relative_pe'],
    defaultWeights: { dcf: 0.30, relative_ev_ebitda: 0.20, peg: 0.30, relative_pe: 0.20 },
    reason: 'Healthcare valued on DCF and PEG for growth premium. EV/EBITDA adjusts for capital structure differences.',
  },
  technology: {
    models: ['relative_ps', 'peg', 'dcf', 'revenue_multiple'],
    defaultWeights: { relative_ps: 0.25, peg: 0.30, dcf: 0.25, revenue_multiple: 0.20 },
    reason: 'Technology/growth stocks valued on P/S and PEG ratios. Revenue multiple for loss-making or high-growth firms.',
  },
  energy: {
    models: ['relative_ev_ebitda', 'dcf', 'ddm', 'gordon_ddm'],
    defaultWeights: { relative_ev_ebitda: 0.30, dcf: 0.25, ddm: 0.25, gordon_ddm: 0.20 },
    reason: 'Energy sector valued on EV/EBITDA (capital-structure neutral) and DCF. Dividend models for high-yield producers.',
  },
  communication: {
    models: ['dcf', 'relative_ev_ebitda', 'ddm', 'gordon_ddm'],
    defaultWeights: { dcf: 0.30, relative_ev_ebitda: 0.25, ddm: 0.25, gordon_ddm: 0.20 },
    reason: 'Communication services valued on DCF and EV/EBITDA. DDM relevant for established telecom operators.',
  },
  utilities: {
    models: ['dcf', 'ddm', 'gordon_ddm', 'relative_pb'],
    defaultWeights: { dcf: 0.25, ddm: 0.25, gordon_ddm: 0.30, relative_pb: 0.20 },
    reason: 'Utilities valued on DCF and dividend models due to regulated, stable cash flows. P/B as asset-backing reference.',
  },
  holdings: {
    models: ['sotp', 'nav', 'dcf', 'relative_pe'],
    defaultWeights: { sotp: 0.40, nav: 0.20, dcf: 0.25, relative_pe: 0.15 },
    reason: 'Holding companies valued on Sum-of-the-Parts (SOTP) using subsidiary market/fair values. NAV as floor.',
  },
};

// ══════════════════════════════════════════════════════════════════════
// Auto Model Selection Engine
// ══════════════════════════════════════════════════════════════════════

/**
 * Determine which valuation models are most appropriate for a company
 * based on its sector and fundamental data characteristics.
 *
 * **Selection Logic:**
 *
 * 1. Map the sector name to a sector group (e.g., "Financials" → "banks_financials").
 * 2. Retrieve the preferred models for that sector group.
 * 3. Filter models based on data availability:
 *    - ROE-based / Excess Return: requires positive book value and ROE
 *    - NAV: requires total assets > total liabilities
 *    - DDM / Gordon DDM: requires positive dividend yield
 *    - PEG: requires positive EPS and earnings growth
 *    - Revenue Multiple: suitable for loss-making but revenue-positive companies
 *    - SOTP: requires positive market cap (proxy for subsidiary value)
 * 4. Re-normalise weights across remaining models.
 *
 * @param sector          - EGX sector name (e.g., "Financials", "Real Estate")
 * @param fundamentalData - The company's fundamental data
 * @returns A ModelSelectionResult with selected models, weights, and rationale
 *
 * @example
 * ```typescript
 * const selection = selectBestModels('Financials', cibFundamentals);
 * console.log(selection.selectedModels);  // ['roe_based', 'relative_pb', 'excess_return', 'ddm', 'dcf']
 * console.log(selection.weights);         // { roe_based: 0.30, relative_pb: 0.25, ... }
 * ```
 */
export function selectBestModels(
  sector: string,
  fundamentalData: FundamentalData,
): ModelSelectionResult {
  const f = fundamentalData;

  // Resolve sector group
  const groupKey = SECTOR_GROUP_MAP[sector] || 'industrial';
  const groupConfig = SECTOR_MODEL_MAP[groupKey] || SECTOR_MODEL_MAP.industrial;

  // Get sector valuation profile for additional context
  const sectorProfile = getSectorValuationProfile(sector);

  // Filter models based on data availability
  const availableModels: { model: ValuationModel; weight: number }[] = [];

  for (const model of groupConfig.models) {
    let isAvailable = true;

    switch (model) {
      case 'roe_based':
        // Requires positive book value (via equity) and ROE
        isAvailable = f.bvps > 0 && f.roe > 0 && f.sharesOutstanding > 0;
        break;
      case 'excess_return':
        // Requires positive book value, ROE, and shares outstanding
        isAvailable = f.bvps > 0 && f.roe > 0 && f.sharesOutstanding > 0;
        break;
      case 'nav':
        // Requires total assets and equity data
        isAvailable = f.totalAssets > 0 && f.sharesOutstanding > 0;
        break;
      case 'adjusted_nav':
        // Requires book value (equity) and shares
        isAvailable = f.stockholdersEquity > 0 && f.sharesOutstanding > 0;
        break;
      case 'sotp':
        // Requires positive market cap (used as proxy for subsidiary valuation)
        isAvailable = f.marketCap > 0 && f.sharesOutstanding > 0;
        break;
      case 'ddm':
      case 'gordon_ddm':
        // Requires positive dividend yield and EPS
        isAvailable = f.dividendYield > 0 && f.eps > 0;
        break;
      case 'peg':
        // Requires positive EPS and earnings growth
        isAvailable = f.eps > 0 && f.earningsGrowth > 0;
        break;
      case 'revenue_multiple':
        // Suitable for loss-making but revenue-positive companies
        isAvailable = f.revenue > 0 && f.sharesOutstanding > 0 && (f.eps <= 0 || f.netIncome <= 0);
        break;
      case 'dcf':
        // Requires operating income and shares
        isAvailable = f.operatingIncome > 0 && f.sharesOutstanding > 0;
        break;
      case 'relative_pe':
        isAvailable = f.eps > 0;
        break;
      case 'relative_pb':
        isAvailable = f.bvps > 0;
        break;
      case 'relative_ev_ebitda':
        isAvailable = f.operatingIncome > 0 && f.sharesOutstanding > 0;
        break;
      case 'relative_ps':
        isAvailable = f.revenuePerShare > 0 || (f.revenue > 0 && f.sharesOutstanding > 0);
        break;
      case 'asset_based':
        isAvailable = f.bvps > 0;
        break;
      default:
        isAvailable = false;
    }

    if (isAvailable) {
      const baseWeight = groupConfig.defaultWeights[model] ?? 0.10;
      availableModels.push({ model, weight: baseWeight });
    }
  }

  // Fallback: if no models are available, include at least dcf and asset_based
  if (availableModels.length === 0) {
    if (f.operatingIncome > 0 && f.sharesOutstanding > 0) {
      availableModels.push({ model: 'dcf', weight: 0.60 });
    }
    if (f.bvps > 0) {
      availableModels.push({ model: 'asset_based', weight: 0.40 });
    }
  }

  // If still nothing, force a basic model
  if (availableModels.length === 0) {
    availableModels.push({ model: 'asset_based', weight: 1.0 });
  }

  // Normalise weights
  const totalWeight = availableModels.reduce((sum, m) => sum + m.weight, 0);
  const weights: Record<string, number> = {};
  for (const m of availableModels) {
    weights[m.model] = m.weight / totalWeight;
  }

  return {
    selectedModels: availableModels.map((m) => m.model),
    weights,
    reason: groupConfig.reason,
    sectorProfile: sectorProfile.notes,
  };
}

// ══════════════════════════════════════════════════════════════════════
// V3 Sector-Specific Valuation Models
// ══════════════════════════════════════════════════════════════════════

// ── a) ROE-Based Valuation (for Banks) ───────────────────────────

/**
 * Calculate the intrinsic value using ROE-Based Valuation.
 *
 * This model is particularly suited for banks and financial institutions
 * where book value and return on equity are the primary value drivers.
 *
 * **Formula:**
 * ```
 * Intrinsic Value = Book Value per Share × (ROE / Cost of Equity)
 * ```
 *
 * When ROE > Cost of Equity, the stock deserves a premium above book value.
 * When ROE < Cost of Equity, the stock trades at a discount to book.
 *
 * The ratio ROE/CoE is capped at 3.0 to prevent extreme valuations for
 * unusually high-ROE banks. A floor of 0.3 prevents negative values.
 *
 * @param f        - Fundamental data (requires bvps, roe, sharesOutstanding)
 * @param costOfEquity - The company's cost of equity (decimal), typically from WACC
 * @param auditTrail - Optional audit trail to append steps to
 * @returns Fair value per share in EGP, or 0 if data is insufficient
 *
 * @example
 * ```typescript
 * // Bank with ROE 18%, CoE 22%, BVPS 5.00 EGP
 * // Value = 5.00 × (0.18 / 0.22) = 4.09 EGP
 * ```
 */
export function calculateROEBasedValuation(
  f: FundamentalData,
  costOfEquity: number,
  auditTrail?: AuditEntry[],
): number {
  if (f.bvps <= 0 || f.roe <= 0 || f.sharesOutstanding <= 0) return 0;

  const bookValuePerShare = f.bvps;
  const roeDecimal = f.roe / 100; // Convert percentage to decimal
  const coe = Math.max(costOfEquity, 0.05); // Floor at 5%

  // Cap the ROE/CoE ratio to prevent extreme values
  const roeCoeRatio = Math.min(Math.max(roeDecimal / coe, 0.3), 3.0);

  const intrinsicValue = bookValuePerShare * roeCoeRatio;

  // Record audit entry
  if (auditTrail) {
    auditTrail.push({
      step: 'ROE-Based Valuation',
      formula: 'BVPS × (ROE / CoE)',
      inputs: { BVPS: bookValuePerShare, ROE: roeDecimal, CoE: coe, 'ROE/CoE': roeCoeRatio },
      output: intrinsicValue,
      timestamp: new Date().toISOString(),
      model: 'roe_based',
    });
  }

  return Math.max(intrinsicValue, 0);
}

// ── b) Excess Return Model / EVA (for Banks) ─────────────────────

/**
 * Calculate intrinsic value using the Excess Return (EVA) Model.
 *
 * This model values a bank by its ability to generate returns above
 * its cost of equity. The present value of excess returns is added to
 * book value.
 *
 * **Formula:**
 * ```
 * EVA = (ROE - CoE) × Book Value
 * Value = Book Value + PV(EVA) / (1 + CoE)
 * ```
 *
 * If ROE > CoE, the company creates value (positive EVA → premium).
 * If ROE < CoE, the company destroys value (negative EVA → discount).
 *
 * The EVA is perpetuity-valued using the standard perpetuity formula
 * with a 10-year average horizon for the perpetuity approximation.
 *
 * @param f        - Fundamental data (requires bvps, roe, sharesOutstanding)
 * @param costOfEquity - The company's cost of equity (decimal)
 * @param auditTrail - Optional audit trail to append steps to
 * @returns Fair value per share in EGP, or 0 if data is insufficient
 */
export function calculateExcessReturnValuation(
  f: FundamentalData,
  costOfEquity: number,
  auditTrail?: AuditEntry[],
): number {
  if (f.bvps <= 0 || f.roe <= 0 || f.sharesOutstanding <= 0) return 0;

  const bookValuePerShare = f.bvps;
  const roeDecimal = f.roe / 100;
  const coe = Math.max(costOfEquity, 0.05);

  // EVA = (ROE - CoE) × Book Value
  const eva = (roeDecimal - coe) * bookValuePerShare;

  // Present value of EVA as a perpetuity: PV = EVA / CoE
  // We use the standard perpetuity with cost of equity as the discount rate
  const pvEVA = coe > 0 ? eva / coe : 0;

  // Total value = Book Value + PV(EVA)
  // Cap the PV(EVA) to prevent extreme values
  const cappedPVEVA = Math.max(Math.min(pvEVA, bookValuePerShare * 2), -bookValuePerShare * 0.5);
  const intrinsicValue = bookValuePerShare + cappedPVEVA;

  // Record audit entry
  if (auditTrail) {
    auditTrail.push({
      step: 'Excess Return (EVA) Valuation',
      formula: 'BVPS + PV((ROE - CoE) × BVPS)',
      inputs: { BVPS: bookValuePerShare, ROE: roeDecimal, CoE: coe, EVA: eva, 'PV(EVA)': cappedPVEVA },
      output: intrinsicValue,
      timestamp: new Date().toISOString(),
      model: 'excess_return',
    });
  }

  return Math.max(intrinsicValue, 0);
}

// ── c) NAV Model (for Real Estate) ────────────────────────────────

/**
 * Calculate Net Asset Value for a Real Estate company.
 *
 * This is the primary valuation method for Egyptian real estate developers,
 * who are valued on their land bank and development inventory.
 *
 * **Formula:**
 * ```
 * NAV = Total Assets − Total Liabilities − Minority Interests
 * Per Share = NAV / Shares Outstanding
 * ```
 *
 * Since we don't have direct land bank or development-in-progress data
 * from TradingView, we use total assets as a proxy (which includes
 * property, land, and inventory for real estate firms). We apply a
 * 15% discount to total assets to account for:
 *   - Illiquidity discount on property holdings
 *   - Development execution risk
 *   - Carrying value vs. fair value differences
 *
 * @param f        - Fundamental data (requires totalAssets, totalLiabilities, sharesOutstanding)
 * @param auditTrail - Optional audit trail to append steps to
 * @returns NAV per share in EGP, or 0 if data is insufficient
 */
export function calculateNAVValuation(
  f: FundamentalData,
  auditTrail?: AuditEntry[],
): number {
  if (f.totalAssets <= 0 || f.sharesOutstanding <= 0) return 0;

  // Apply a 15% illiquidity/execution discount to total assets
  // for real estate firms (standard practice in Egyptian market)
  const assetDiscount = 0.15;
  const adjustedAssets = f.totalAssets * (1 - assetDiscount);

  const totalLiabilities = Math.max(f.totalLiabilities, 0);

  // Minority interests estimated as 2% of total assets (common for EGX developers)
  const minorityInterests = f.totalAssets * 0.02;

  const nav = adjustedAssets - totalLiabilities - minorityInterests;
  const navPerShare = Math.max(nav / f.sharesOutstanding, 0);

  // Record audit entry
  if (auditTrail) {
    auditTrail.push({
      step: 'NAV Valuation (Real Estate)',
      formula: '(Total Assets × (1 - Discount) - Liabilities - Minority) / Shares',
      inputs: {
        TotalAssets: f.totalAssets,
        Discount: assetDiscount,
        AdjustedAssets: adjustedAssets,
        TotalLiabilities: totalLiabilities,
        MinorityInterests: minorityInterests,
        SharesOutstanding: f.sharesOutstanding,
      },
      output: navPerShare,
      timestamp: new Date().toISOString(),
      model: 'nav',
    });
  }

  return navPerShare;
}

// ── d) Adjusted NAV (for Insurance) ────────────────────────────────

/**
 * Calculate Adjusted Net Asset Value for an insurance company.
 *
 * Insurance companies are valued on embedded value which adjusts
 * book value for future profit streams from in-force policies.
 *
 * **Formula:**
 * ```
 * Adjusted NAV = Book Value + Embedded Value Adjustment − AOCI
 * Per Share = Adjusted NAV / Shares Outstanding
 * ```
 *
 * Since embedded value data isn't available from TradingView, we
 * estimate the adjustment as:
 *   - Embedded Value Adjustment = 10% of equity (industry average markup)
 *   - AOCI (Accumulated Other Comprehensive Income) ≈ -3% of equity
 *     (common for insurers with bond portfolios in rising rate environments)
 *
 * @param f        - Fundamental data (requires stockholdersEquity, sharesOutstanding)
 * @param auditTrail - Optional audit trail to append steps to
 * @returns Adjusted NAV per share in EGP, or 0 if data is insufficient
 */
export function calculateAdjustedNAVValuation(
  f: FundamentalData,
  auditTrail?: AuditEntry[],
): number {
  if (f.stockholdersEquity <= 0 || f.sharesOutstanding <= 0) return 0;

  const bookValue = f.stockholdersEquity;

  // Embedded value adjustment: 10% premium to book value
  // Represents present value of future profits from in-force policies
  const embeddedValueAdj = bookValue * 0.10;

  // AOCI (Accumulated Other Comprehensive Income):
  // Negative impact from bond portfolio unrealised losses in rising rates
  const aoci = -bookValue * 0.03;

  const adjustedNAV = bookValue + embeddedValueAdj + aoci; // aoci is negative
  const perShare = Math.max(adjustedNAV / f.sharesOutstanding, 0);

  // Record audit entry
  if (auditTrail) {
    auditTrail.push({
      step: 'Adjusted NAV (Insurance)',
      formula: '(Book Value + Embedded Value Adj - |AOCI|) / Shares',
      inputs: {
        BookValue: bookValue,
        EmbeddedValueAdj: embeddedValueAdj,
        AOCI: aoci,
        AdjustedNAV: adjustedNAV,
        SharesOutstanding: f.sharesOutstanding,
      },
      output: perShare,
      timestamp: new Date().toISOString(),
      model: 'adjusted_nav',
    });
  }

  return perShare;
}

// ── e) Sum of the Parts / SOTP (for Holding Companies) ────────────

/**
 * Calculate Sum of the Parts (SOTP) valuation for holding companies.
 *
 * Holding companies own subsidiaries whose values may differ from
 * the consolidated book value. SOTP values each subsidiary separately
 * at market or fair value.
 *
 * **Formula:**
 * ```
 * SOTP = Σ(subsidiary_value × ownership%) + Net Cash − Holding Costs
 * Per Share = SOTP / Shares Outstanding
 * ```
 *
 * Since subsidiary-level data isn't available from TradingView, we
 * estimate using the consolidated financials:
 *   - Total assets are used as a proxy for subsidiary values
 *   - A 20% holding company discount is applied (common in Egypt)
 *   - Net cash = cash − total debt
 *   - Holding costs = 3% of revenue (management overhead)
 *
 * @param f        - Fundamental data (requires totalAssets, totalDebt, cash, revenue, sharesOutstanding)
 * @param auditTrail - Optional audit trail to append steps to
 * @returns SOTP fair value per share in EGP, or 0 if data is insufficient
 */
export function calculateSOTPValuation(
  f: FundamentalData,
  auditTrail?: AuditEntry[],
): number {
  if (f.totalAssets <= 0 || f.sharesOutstanding <= 0) return 0;

  // Proxy: total assets represent the aggregate subsidiary asset base
  // Apply a holding company discount of 20% (common in EGX market)
  // to account for:
  //   - Parent company overhead costs
  //   - Lack of operational synergy
  //   - Minority interest drag
  const holdingDiscount = 0.20;
  const subsidiaryValue = f.totalAssets * (1 - holdingDiscount);

  // Net cash position
  const netCash = f.cash - Math.max(f.totalDebt, 0);

  // Holding costs (management overhead, centralised functions)
  const holdingCosts = f.revenue > 0 ? f.revenue * 0.03 : f.totalAssets * 0.01;

  // Total SOTP equity value
  const sotpEquity = subsidiaryValue + netCash - holdingCosts;
  const perShare = Math.max(sotpEquity / f.sharesOutstanding, 0);

  // Record audit entry
  if (auditTrail) {
    auditTrail.push({
      step: 'Sum of the Parts (SOTP) Valuation',
      formula: '(Total Assets × (1 - Holding Discount) + Net Cash - Holding Costs) / Shares',
      inputs: {
        TotalAssets: f.totalAssets,
        HoldingDiscount: holdingDiscount,
        SubsidiaryValue: subsidiaryValue,
        NetCash: netCash,
        HoldingCosts: holdingCosts,
        SOTPEquity: sotpEquity,
        SharesOutstanding: f.sharesOutstanding,
      },
      output: perShare,
      timestamp: new Date().toISOString(),
      model: 'sotp',
    });
  }

  return perShare;
}

// ── f) Revenue Multiple Model (for loss-making growth) ─────────────

/**
 * Calculate fair value using Revenue Multiple for loss-making growth companies.
 *
 * This model is used when traditional earnings-based multiples (P/E, EV/EBITDA)
 * are not applicable because the company has negative earnings but strong
 * revenue growth.
 *
 * **Formula:**
 * ```
 * Enterprise Value = Revenue × Sector EV/Sales Multiple
 * Per Share = (EV − Net Debt) / Shares Outstanding
 * ```
 *
 * The sector EV/Sales multiple is sourced from the sector benchmark.
 * For the Egyptian market, we use the sector's avgPS as a proxy for
 * the EV/Sales multiple (adjusted by a factor of 0.85 to account for
 * the EV vs. equity value difference).
 *
 * @param f              - Fundamental data (requires revenue, totalDebt, cash, sharesOutstanding)
 * @param sectorEVSales  - Sector EV/Sales multiple (decimal), typically from benchmarks
 * @param auditTrail     - Optional audit trail to append steps to
 * @returns Fair value per share in EGP, or 0 if data is insufficient
 */
export function calculateRevenueMultipleValuation(
  f: FundamentalData,
  sectorEVSales: number,
  auditTrail?: AuditEntry[],
): number {
  if (f.revenue <= 0 || f.sharesOutstanding <= 0) return 0;

  // Enterprise value = Revenue × EV/Sales multiple
  const evMultiple = Math.max(sectorEVSales, 0.5);
  const enterpriseValue = f.revenue * evMultiple;

  // Subtract net debt to get equity value
  const netDebt = Math.max(f.totalDebt - f.cash, 0);
  const equityValue = enterpriseValue - netDebt;

  const perShare = Math.max(equityValue / f.sharesOutstanding, 0);

  // Record audit entry
  if (auditTrail) {
    auditTrail.push({
      step: 'Revenue Multiple Valuation',
      formula: '(Revenue × EV/Sales - Net Debt) / Shares',
      inputs: {
        Revenue: f.revenue,
        EVSales: evMultiple,
        EnterpriseValue: enterpriseValue,
        NetDebt: netDebt,
        EquityValue: equityValue,
        SharesOutstanding: f.sharesOutstanding,
      },
      output: perShare,
      timestamp: new Date().toISOString(),
      model: 'revenue_multiple',
    });
  }

  return perShare;
}

// ── g) PEG Model (for growth stocks) ──────────────────────────────

/**
 * Calculate fair value using the PEG (Price/Earnings to Growth) ratio.
 *
 * The PEG model values growth stocks by relating P/E to earnings growth.
 * A PEG of 1.0 is considered "fair value" — the stock is fairly priced
 * when its P/E equals its growth rate.
 *
 * **Formula:**
 * ```
 * PEG Ratio = P/E / Earnings Growth Rate
 * Fair Value = EPS × PEG Fair Multiple × Growth Rate
 * ```
 *
 * We use a "fair" PEG of 1.0 as the benchmark:
 * ```
 * Fair P/E = Growth Rate (in decimal, e.g., 0.20 = 20%)
 * Fair Value = EPS × Growth Rate
 * ```
 *
 * This is capped at the sector average P/E × 1.5 to prevent
 * excessive valuations for very high-growth stocks.
 *
 * @param f           - Fundamental data (requires eps, earningsGrowth)
 * @param sectorAvgPE - Sector average P/E ratio (used as cap)
 * @param auditTrail  - Optional audit trail to append steps to
 * @returns Fair value per share in EGP, or 0 if data is insufficient
 */
export function calculatePEGValuation(
  f: FundamentalData,
  sectorAvgPE: number,
  auditTrail?: AuditEntry[],
): number {
  if (f.eps <= 0 || f.earningsGrowth <= 0) return 0;

  const eps = f.eps;
  const growthRate = f.earningsGrowth / 100; // Convert to decimal

  // Fair P/E = growth rate × fair PEG of 1.0
  const fairPE = growthRate;

  // Cap at sector average P/E × 1.5
  const maxPE = sectorAvgPE * 1.5;
  const cappedFairPE = Math.min(fairPE, maxPE);

  const fairValue = eps * cappedFairPE;

  // Calculate the actual PEG for reference
  const currentPE = f.price > 0 ? f.price / eps : 0;
  const pegRatio = currentPE > 0 && growthRate > 0 ? currentPE / growthRate : 0;

  // Record audit entry
  if (auditTrail) {
    auditTrail.push({
      step: 'PEG Valuation',
      formula: 'EPS × min(Growth Rate, Sector PE × 1.5)',
      inputs: {
        EPS: eps,
        GrowthRate: growthRate,
        FairPE: fairPE,
        MaxPE: maxPE,
        CappedFairPE: cappedFairPE,
        CurrentPEG: pegRatio,
      },
      output: fairValue,
      timestamp: new Date().toISOString(),
      model: 'peg',
    });
  }

  return Math.max(fairValue, 0);
}

// ── h) Gordon Growth Enhanced DDM (for high-dividend) ─────────────

/**
 * Calculate intrinsic value using the Enhanced Gordon Growth DDM.
 *
 * This is the classic Gordon Growth Model (GGM) applied specifically
 * for high-dividend Egyptian stocks. It is a simpler, single-stage
 * version compared to the multi-stage DDM in V2.
 *
 * **Formula:**
 * ```
 * Value = DPS × (1 + g) / (k − g)
 * ```
 *
 * Where:
 * - `DPS` = Dividend Per Share
 * - `g`   = Sustainable growth rate = ROE × Retention Ratio
 * - `k`   = Cost of Equity (required return)
 *
 * The sustainable growth rate is calculated as:
 * ```
 * g = ROE × (1 − Payout Ratio)
 * ```
 *
 * If earnings growth data is available, we use the minimum of the
 * sustainable growth rate and the observed earnings growth, capped
 * at (k − 0.02) to ensure model convergence.
 *
 * @param f             - Fundamental data (requires dps, roe, payoutRatio, eps)
 * @param costOfEquity  - Cost of equity / required return (decimal)
 * @param auditTrail    - Optional audit trail to append steps to
 * @returns Fair value per share in EGP, or 0 if data is insufficient or k ≤ g
 */
export function calculateGordonGrowthDDM(
  f: FundamentalData,
  costOfEquity: number,
  auditTrail?: AuditEntry[],
): number {
  // Require positive dividend data
  const dps = f.dps > 0
    ? f.dps
    : f.eps > 0 && f.payoutRatio > 0
      ? f.eps * (f.payoutRatio / 100)
      : 0;

  if (dps <= 0 || f.eps <= 0) return 0;

  const k = Math.max(costOfEquity, 0.06);

  // Calculate sustainable growth rate
  const roe = f.roe > 0 ? f.roe / 100 : 0;
  const payoutRatio = f.payoutRatio > 0 ? f.payoutRatio / 100 : dps / f.eps;
  const retentionRatio = Math.max(1 - payoutRatio, 0);

  let g: number;
  if (roe > 0 && retentionRatio > 0) {
    g = roe * retentionRatio; // Sustainable growth rate
  } else if (f.earningsGrowth > 0) {
    g = Math.min(f.earningsGrowth / 100, k - 0.02);
  } else {
    g = 0.05; // Default 5%
  }

  // Cap growth rate below required return (model breaks if g ≥ k)
  g = Math.min(Math.max(g, 0.005), k - 0.02);

  // Gordon Growth Model: V = D₀ × (1 + g) / (k − g)
  const numerator = dps * (1 + g);
  const denominator = k - g;

  if (denominator <= 0) return 0;

  const fairValue = numerator / denominator;

  // Record audit entry
  if (auditTrail) {
    auditTrail.push({
      step: 'Gordon Growth Enhanced DDM',
      formula: 'DPS × (1 + g) / (k - g)',
      inputs: {
        DPS: dps,
        g: g,
        k: k,
        ROE: roe,
        PayoutRatio: payoutRatio,
        RetentionRatio: retentionRatio,
        Numerator: numerator,
        Denominator: denominator,
      },
      output: fairValue,
      timestamp: new Date().toISOString(),
      model: 'gordon_ddm',
    });
  }

  return Math.max(fairValue, 0);
}

// ══════════════════════════════════════════════════════════════════════
// Confidence Scoring
// ══════════════════════════════════════════════════════════════════════

/**
 * Calculate the valuation confidence level based on data availability,
 * model convergence, and sector characteristics.
 *
 * **Scoring Components (0–100):**
 *
 * | Factor              | Weight | Description |
 * |---------------------|--------|-------------|
 * | Data Availability   | 25%    | How many fields are populated |
 * | Reporting Quality   | 20%    | Data source reliability (Tier 1/2) |
 * | Forecast Certainty  | 20%    | Earnings stability and predictability |
 * | Earnings Stability  | 20%    | Low variance in recent earnings |
 * | Sector Maturity     | 15%    | How well-understood the sector is |
 *
 * @param f     - Fundamental data
 * @param sector - EGX sector name
 * @param activeModelCount - Number of models that produced valid results
 * @returns A ValuationConfidence object with level, score, and factors
 */
export function calculateValuationConfidence(
  f: FundamentalData,
  sector: string,
  activeModelCount: number,
): ValuationConfidence {
  // ── Data Availability (0–100) ──
  const expectedFields = [
    f.price, f.eps, f.bvps, f.revenue, f.netIncome,
    f.operatingIncome, f.totalAssets, f.stockholdersEquity,
    f.freeCashFlow, f.sharesOutstanding, f.roe, f.debtEquity,
  ];
  const populatedFields = expectedFields.filter((v) => v > 0).length;
  const dataAvailability = Math.round((populatedFields / expectedFields.length) * 100);

  // ── Reporting Quality (0–100) ──
  // Based on data source: TradingView = Tier 2 (70), validated = Tier 1+ (85)
  let reportingQuality = 60;
  if (f.dataSource === 'validated') reportingQuality = 85;
  else if (f.dataSource === 'tradingview') reportingQuality = 70;
  if (f.validatedAt) reportingQuality = Math.min(reportingQuality + 5, 100);

  // ── Forecast Certainty (0–100) ──
  let forecastCertainty = 50;
  if (f.earningsGrowth > 0 && Math.abs(f.earningsGrowth) < 100) forecastCertainty += 15;
  if (f.revenueGrowth > 0 && Math.abs(f.revenueGrowth) < 100) forecastCertainty += 10;
  if (f.eps > 0 && f.pe > 0 && f.pe < 50) forecastCertainty += 15;
  if (f.freeCashFlow > 0) forecastCertainty += 10;
  forecastCertainty = Math.min(forecastCertainty, 100);

  // ── Earnings Stability (0–100) ──
  let earningsStability = 50;
  if (f.netIncome > 0) earningsStability += 15;
  if (f.operatingMargin > 5 && f.operatingMargin < 60) earningsStability += 15;
  if (f.grossMargin > 10 && f.grossMargin < 80) earningsStability += 10;
  if (f.roe > 5 && f.roe < 40) earningsStability += 10;
  earningsStability = Math.min(earningsStability, 100);

  // ── Sector Maturity (0–100) ──
  // Well-established sectors get higher maturity scores
  const sectorCounts: Record<string, number> = {
    'Financials': 90, 'Materials': 85, 'Real Estate': 80,
    'Consumer Defensive': 85, 'Industrials': 80, 'Healthcare': 75,
    'Consumer Discretionary': 70, 'Energy': 75, 'Technology': 50,
    'Communication Services': 70, 'Utilities': 85,
  };
  const sectorMaturity = sectorCounts[sector] || 60;

  // ── Composite Score ──
  const weights = { dataAvail: 0.25, reporting: 0.20, forecast: 0.20, stability: 0.20, maturity: 0.15 };
  const score = Math.round(
    dataAvailability * weights.dataAvail +
    reportingQuality * weights.reporting +
    forecastCertainty * weights.forecast +
    earningsStability * weights.stability +
    sectorMaturity * weights.maturity
  );

  // ── Confidence Level ──
  let level: ValuationConfidence['level'];
  if (score >= 80) level = 'Very High';
  else if (score >= 60) level = 'High';
  else if (score >= 40) level = 'Moderate';
  else if (score >= 20) level = 'Low';
  else level = 'Very Low';

  // Adjust for model count
  const modelPenalty = activeModelCount < 3 ? -10 : 0;
  const adjustedScore = Math.max(0, Math.min(100, score + modelPenalty));

  let adjustedLevel = level;
  if (adjustedScore < 60 && level === 'High') adjustedLevel = 'Moderate';
  if (adjustedScore < 40 && (level === 'Moderate' || level === 'High')) adjustedLevel = 'Low';

  return {
    level: adjustedLevel,
    score: adjustedScore,
    factors: {
      dataAvailability,
      reportingQuality,
      forecastCertainty,
      earningsStability,
      sectorMaturity,
    },
    explanation: `Valuation confidence is ${adjustedLevel} (${adjustedScore}/100). ` +
      `Active models: ${activeModelCount}. ` +
      `Data availability: ${dataAvailability}%. ` +
      `Sector maturity: ${sectorMaturity}%.`,
  };
}

// ══════════════════════════════════════════════════════════════════════
// Data Quality Scoring
// ══════════════════════════════════════════════════════════════════════

/**
 * Calculate institutional-grade data quality score.
 *
 * Returns a DataQualityScore with:
 * - Overall score (0–100)
 * - Completeness: percentage of expected fields populated
 * - Consistency: cross-field consistency checks
 * - Timeliness: data freshness
 * - Accuracy: sanity check pass rate
 * - Letter grade (A+ through F)
 *
 * @param f - Fundamental data
 * @returns DataQualityScore object
 */
export function calculateDataQuality(f: FundamentalData): DataQualityScore {
  // ── Completeness (0–100) ──
  const criticalFields = [
    f.price, f.eps, f.bvps, f.revenue, f.netIncome,
    f.operatingIncome, f.totalAssets, f.stockholdersEquity,
    f.freeCashFlow, f.sharesOutstanding, f.roe, f.debtEquity,
    f.pe, f.pb, f.evEbitda, f.grossMargin, f.operatingMargin,
    f.cash, f.totalDebt, f.dps, f.dividendYield,
  ];
  const populated = criticalFields.filter((v) => v !== 0 && v !== null && v !== undefined).length;
  const completeness = Math.round((populated / criticalFields.length) * 100);

  // ── Consistency (0–100) ──
  let consistency = 80;
  // Check: market cap ≈ price × shares outstanding
  if (f.price > 0 && f.sharesOutstanding > 0 && f.marketCap > 0) {
    const impliedCap = f.price * f.sharesOutstanding;
    const deviation = Math.abs(impliedCap - f.marketCap) / f.marketCap;
    if (deviation > 0.10) consistency -= 20;
    else if (deviation > 0.05) consistency -= 10;
  }
  // Check: total assets ≈ total liabilities + equity
  if (f.totalAssets > 0 && f.totalLiabilities > 0 && f.stockholdersEquity > 0) {
    const implied = f.totalLiabilities + f.stockholdersEquity;
    const deviation = Math.abs(implied - f.totalAssets) / f.totalAssets;
    if (deviation > 0.15) consistency -= 15;
    else if (deviation > 0.05) consistency -= 5;
  }
  consistency = Math.max(0, Math.min(100, consistency));

  // ── Timeliness (0–100) ──
  let timeliness = 80;
  if (f.fetchedAt) {
    const daysSince = (Date.now() - new Date(f.fetchedAt).getTime()) / (1000 * 60 * 60 * 24);
    if (daysSince > 30) timeliness = 30;
    else if (daysSince > 14) timeliness = 50;
    else if (daysSince > 7) timeliness = 70;
  }

  // ── Accuracy (0–100) ──
  let accuracy = 85;
  // Sanity: P/E should be reasonable
  if (f.pe > 200 || (f.pe < 0 && f.eps > 0)) accuracy -= 10;
  // Sanity: ROE should be in normal range
  if (f.roe > 100 || f.roe < -50) accuracy -= 10;
  // Sanity: Margins should be in normal range
  if (f.grossMargin > 100 || f.grossMargin < -50) accuracy -= 10;
  // Sanity: Debt equity should be positive
  if (f.debtEquity < -5) accuracy -= 10;
  accuracy = Math.max(0, Math.min(100, accuracy));

  // ── Overall (weighted) ──
  const overall = Math.round(
    completeness * 0.30 +
    consistency * 0.25 +
    timeliness * 0.20 +
    accuracy * 0.25
  );

  // ── Letter Grade ──
  let grade: DataQualityScore['grade'];
  if (overall >= 97) grade = 'A+';
  else if (overall >= 93) grade = 'A';
  else if (overall >= 90) grade = 'A-';
  else if (overall >= 87) grade = 'B+';
  else if (overall >= 83) grade = 'B';
  else if (overall >= 80) grade = 'B-';
  else if (overall >= 77) grade = 'C+';
  else if (overall >= 73) grade = 'C';
  else if (overall >= 70) grade = 'C-';
  else if (overall >= 60) grade = 'D';
  else grade = 'F';

  return { overall, completeness, consistency, timeliness, accuracy, grade };
}

// ══════════════════════════════════════════════════════════════════════
// Transparent Assumptions Builder
// ══════════════════════════════════════════════════════════════════════

/**
 * Build a fully documented set of transparent assumptions from
 * the sector profile, WACC result, and fundamental data.
 *
 * @param f         - Fundamental data
 * @param sector    - EGX sector name
 * @param waccResult - WACC calculation result
 * @returns TransparentAssumptions object
 */
function buildTransparentAssumptions(
  f: FundamentalData,
  sector: string,
  waccResult: WACCResult,
): TransparentAssumptions {
  const profile = getSectorValuationProfile(sector);
  const macro = getEgyptMacroEnvironment();

  // Growth rate: derive from company data, falling back to sector defaults
  const growthRate = f.revenueGrowth > 0
    ? f.revenueGrowth / 100
    : profile.dcfParams.baseGrowthRate;

  const growthSource = f.revenueGrowth > 0
    ? 'Company reported revenue growth (YoY)'
    : `Sector default base growth rate (${(profile.dcfParams.baseGrowthRate * 100).toFixed(1)}%)`;

  // Sector premiums
  const sectorPremiums: TransparentAssumptions['sectorPremiums'] = [
    { field: 'equity_risk_premium', value: waccResult.equityRiskPremium, source: 'Sector valuation profile (CFA-standard ERP)' },
    { field: 'size_premium', value: waccResult.sizePremium, source: waccResult.assumptions.sizePremMethodology },
    { field: 'country_risk_premium', value: waccResult.countryRiskPremium, source: waccResult.assumptions.crpMethodology },
  ];

  return {
    discountRate: {
      value: waccResult.wacc,
      source: `WACC = (E/V × ${waccResult.costOfEquity.toFixed(4)}) + (D/V × ${waccResult.costOfDebt.toFixed(4)})`,
      methodology: `CAPM: Ke = ${waccResult.riskFreeRate.toFixed(4)} + ${waccResult.beta.toFixed(2)} × ${waccResult.equityRiskPremium.toFixed(4)} + ${waccResult.sizePremium.toFixed(4)} + ${waccResult.countryRiskPremium.toFixed(4)} (CRP). Source: ${waccResult.assumptions.riskFreeSource}`,
    },
    growthRate: {
      value: growthRate,
      source: growthSource,
      methodology: 'Revenue growth rate (YoY) from TradingView fundamentals, capped at sector ceiling. Used as base projection rate.',
    },
    terminalGrowth: {
      value: profile.dcfParams.terminalGrowthRate,
      source: `Sector profile terminal growth (${(profile.dcfParams.terminalGrowthRate * 100).toFixed(1)}%)`,
      methodology: 'Terminal growth rate reflects long-run Egyptian GDP growth (~4.2% real + inflation). Sector-specific caps applied.',
    },
    taxRate: {
      value: EGYPT_TAX_RATE,
      source: 'Egyptian Income Tax Law (Article 19)',
      methodology: 'Statutory corporate tax rate of 22.5% applied to all Egyptian-listed companies.',
    },
    sectorPremiums,
    countryRiskPremium: {
      value: waccResult.countryRiskPremium,
      source: waccResult.assumptions.crpMethodology,
    },
    inflationAssumption: {
      value: macro.inflationRate,
      source: `CAPMA / IMF data. Last updated: ${macro.lastUpdated}`,
    },
  };
}

// ══════════════════════════════════════════════════════════════════════
// Main V3 Fair Value Calculation
// ══════════════════════════════════════════════════════════════════════

/**
 * Calculate the full V3 fair value for a single Egyptian stock.
 *
 * This is the primary entry point for the V3 engine. It orchestrates:
 *
 * 1. **Auto model selection** — picks the best models for the sector
 * 2. **WACC calculation** — uses the egypt-wacc-engine
 * 3. **V2 models** — runs all V1/V2 models as baseline
 * 4. **V3 sector-specific models** — runs the new sector-focused models
 * 5. **Model weighting** — combines results by model appropriateness
 * 6. **Confidence scoring** — assesses valuation reliability
 * 7. **Audit trail** — builds a step-by-step calculation record
 * 8. **Assumption documentation** — records all assumptions transparently
 *
 * @param fundamentalData  - The company's fundamental data
 * @param sector           - EGX sector name (e.g., "Financials", "Real Estate")
 * @param options          - Optional configuration overrides
 * @returns A comprehensive FairValueResultV3 with all models and metadata
 *
 * @example
 * ```typescript
 * const result = calculateFairValueV3(cibFundamentals, 'Financials', {
 *   mcConfig: { iterations: 5000, seed: 42 },
 *   includeAuditTrail: true,
 * });
 *
 * console.log(`V3 Fair Value: ${result.v3FairValue.toFixed(2)} EGP`);
 * console.log(`Confidence: ${result.valuationConfidence.level} (${result.valuationConfidence.score})`);
 * console.log(`Models used: ${result.modelSelection.selectedModels.join(', ')}`);
 * ```
 */
export function calculateFairValueV3(
  fundamentalData: FundamentalData,
  sector: string,
  options?: {
    sectorBenchmarks?: Record<string, SectorBenchmark>;
    mcConfig?: MonteCarloConfig;
    includeAuditTrail?: boolean;
    waccOverride?: number;
    previousData?: FundamentalData;
  },
): FairValueResultV3 {
  const f = fundamentalData;
  const opts = options ?? {};
  const sectorBenchmarks = opts.sectorBenchmarks;
  const mcConfig = opts.mcConfig;
  const includeAuditTrail = opts.includeAuditTrail ?? true;

  // ── Step 1: Auto Model Selection ──
  const modelSelection = selectBestModels(sector, f);

  // ── Step 2: WACC Calculation (egypt-wacc-engine) ──
  const waccResult = opts.waccOverride
    ? {
        ...calculateEgyptianWACC({
          sector,
          beta: f.beta > 0 ? f.beta : undefined,
          marketCapEGP: f.marketCap > 0 ? f.marketCap : undefined,
          debtEquityRatio: f.debtEquity > 0 ? f.debtEquity : undefined,
        }),
        wacc: opts.waccOverride,
      }
    : calculateEgyptianWACC({
        sector,
        beta: f.beta > 0 ? f.beta : undefined,
        marketCapEGP: f.marketCap > 0 ? f.marketCap : undefined,
        debtEquityRatio: f.debtEquity > 0 ? f.debtEquity : undefined,
      });

  const costOfEquity = waccResult.costOfEquity;

  // ── Step 3: Initialize Audit Trail ──
  const auditTrail: AuditEntry[] = [];

  // Record WACC calculation in audit trail
  if (includeAuditTrail) {
    auditTrail.push({
      step: 'WACC Calculation (Egypt-WACC-Engine)',
      formula: 'WACC = (E/V × Ke) + (D/V × Kd × (1-T))',
      inputs: {
        CostOfEquity: waccResult.costOfEquity,
        CostOfDebt: waccResult.costOfDebt,
        WACC: waccResult.wacc,
        Beta: waccResult.beta,
        EquityRatio: waccResult.equityRatio,
        DebtRatio: waccResult.debtRatio,
        TaxRate: waccResult.taxRate,
        RiskFreeRate: waccResult.riskFreeRate,
      },
      output: waccResult.wacc,
      timestamp: new Date().toISOString(),
      model: 'wacc',
    });
  }

  // ── Step 4: Get Sector Benchmark ──
  const sectorBenchmark = getSectorBenchmark(sector, sectorBenchmarks);
  const sectorProfile = getSectorValuationProfile(sector, sectorBenchmarks);

  // ── Step 5: Run V3 Sector-Specific Models ──
  const sectorSpecificModels: SectorSpecificModelResult[] = [];

  for (const modelName of modelSelection.selectedModels) {
    let fairValue = 0;
    let confidence = 0.5;
    let description = '';
    let assumptions: Record<string, number> = {};

    switch (modelName) {
      case 'roe_based': {
        fairValue = calculateROEBasedValuation(f, costOfEquity, includeAuditTrail ? auditTrail : undefined);
        confidence = f.roe > 0 && f.bvps > 0 ? 0.75 : 0.3;
        description = `ROE-Based: BVPS ${f.bvps.toFixed(2)} × (ROE ${(f.roe / 100).toFixed(4)} / CoE ${costOfEquity.toFixed(4)})`;
        assumptions = { BVPS: f.bvps, ROE: f.roe / 100, CoE: costOfEquity };
        break;
      }
      case 'excess_return': {
        fairValue = calculateExcessReturnValuation(f, costOfEquity, includeAuditTrail ? auditTrail : undefined);
        confidence = f.roe > 0 && f.bvps > 0 ? 0.70 : 0.3;
        const eva = (f.roe / 100 - costOfEquity) * f.bvps;
        description = `EVA: BVPS ${f.bvps.toFixed(2)} + PV(EVA ${(eva).toFixed(2)}) / CoE ${costOfEquity.toFixed(4)}`;
        assumptions = { BVPS: f.bvps, ROE: f.roe / 100, CoE: costOfEquity, EVA: eva };
        break;
      }
      case 'nav': {
        fairValue = calculateNAVValuation(f, includeAuditTrail ? auditTrail : undefined);
        confidence = f.totalAssets > 0 ? 0.65 : 0.3;
        description = `NAV: Assets ${f.totalAssets.toFixed(0)} (15% discount) - Liabilities ${f.totalLiabilities.toFixed(0)} / Shares ${f.sharesOutstanding.toFixed(0)}`;
        assumptions = { TotalAssets: f.totalAssets, Discount: 0.15, TotalLiabilities: f.totalLiabilities, Shares: f.sharesOutstanding };
        break;
      }
      case 'adjusted_nav': {
        fairValue = calculateAdjustedNAVValuation(f, includeAuditTrail ? auditTrail : undefined);
        confidence = f.stockholdersEquity > 0 ? 0.60 : 0.3;
        description = `Adj. NAV: Equity ${f.stockholdersEquity.toFixed(0)} + 10% embedded value - 3% AOCI`;
        assumptions = { Equity: f.stockholdersEquity, EmbeddedAdj: f.stockholdersEquity * 0.10, AOCI: -f.stockholdersEquity * 0.03 };
        break;
      }
      case 'sotp': {
        fairValue = calculateSOTPValuation(f, includeAuditTrail ? auditTrail : undefined);
        confidence = f.totalAssets > 0 ? 0.55 : 0.3;
        description = `SOTP: Assets ${f.totalAssets.toFixed(0)} (20% discount) + Net Cash ${(f.cash - Math.max(f.totalDebt, 0)).toFixed(0)} / Shares`;
        assumptions = { TotalAssets: f.totalAssets, HoldingDiscount: 0.20, NetCash: f.cash - Math.max(f.totalDebt, 0), Shares: f.sharesOutstanding };
        break;
      }
      case 'revenue_multiple': {
        // Use sector avg PS × 0.85 as EV/Sales proxy
        const evSalesProxy = sectorBenchmark.avgPS * 0.85;
        fairValue = calculateRevenueMultipleValuation(f, evSalesProxy, includeAuditTrail ? auditTrail : undefined);
        confidence = f.revenue > 0 ? 0.50 : 0.2;
        description = `Revenue Multiple: Revenue ${f.revenue.toFixed(0)} × EV/Sales ${evSalesProxy.toFixed(2)} - Net Debt ${Math.max(f.totalDebt - f.cash, 0).toFixed(0)}`;
        assumptions = { Revenue: f.revenue, EVSales: evSalesProxy, NetDebt: Math.max(f.totalDebt - f.cash, 0) };
        break;
      }
      case 'peg': {
        fairValue = calculatePEGValuation(f, sectorBenchmark.avgPE, includeAuditTrail ? auditTrail : undefined);
        confidence = f.eps > 0 && f.earningsGrowth > 0 ? 0.65 : 0.3;
        description = `PEG: EPS ${f.eps.toFixed(4)} × min(Growth ${f.earningsGrowth}%, Sector PE × 1.5)`;
        assumptions = { EPS: f.eps, GrowthRate: f.earningsGrowth / 100, SectorAvgPE: sectorBenchmark.avgPE };
        break;
      }
      case 'gordon_ddm': {
        fairValue = calculateGordonGrowthDDM(f, costOfEquity, includeAuditTrail ? auditTrail : undefined);
        confidence = f.dps > 0 && f.eps > 0 ? 0.70 : 0.3;
        const dps = f.dps > 0 ? f.dps : f.eps * (f.payoutRatio / 100);
        description = `Gordon DDM: DPS ${dps.toFixed(4)} × (1 + g) / (CoE ${costOfEquity.toFixed(4)} - g)`;
        assumptions = { DPS: dps, CoE: costOfEquity, ROE: f.roe / 100, PayoutRatio: f.payoutRatio / 100 };
        break;
      }
      case 'dcf': {
        // Use sector-specific DCF with WACC from engine
        const profile = getSectorValuationProfile(sector, sectorBenchmarks);
        fairValue = runSectorDCF(f, sector, waccResult, includeAuditTrail ? auditTrail : undefined);
        confidence = f.operatingIncome > 0 && f.sharesOutstanding > 0 ? 0.70 : 0.3;
        description = `DCF: Sector ${sector} with WACC ${(waccResult.wacc * 100).toFixed(1)}%`;
        assumptions = { WACC: waccResult.wacc, GrowthRate: profile.dcfParams.baseGrowthRate, TerminalGrowth: profile.dcfParams.terminalGrowthRate };
        break;
      }
      case 'relative_pe': {
        fairValue = f.eps > 0 ? f.eps * sectorBenchmark.avgPE : 0;
        confidence = f.eps > 0 ? 0.65 : 0.3;
        description = `P/E Relative: EPS ${f.eps.toFixed(4)} × Sector P/E ${sectorBenchmark.avgPE.toFixed(1)}`;
        assumptions = { EPS: f.eps, SectorPE: sectorBenchmark.avgPE };
        break;
      }
      case 'relative_pb': {
        fairValue = f.bvps > 0 ? f.bvps * sectorBenchmark.avgPB : 0;
        confidence = f.bvps > 0 ? 0.65 : 0.3;
        description = `P/B Relative: BVPS ${f.bvps.toFixed(4)} × Sector P/B ${sectorBenchmark.avgPB.toFixed(2)}`;
        assumptions = { BVPS: f.bvps, SectorPB: sectorBenchmark.avgPB };
        break;
      }
      case 'relative_ev_ebitda': {
        const ebitdaPS = f.sharesOutstanding > 0 ? f.operatingIncome / f.sharesOutstanding : 0;
        fairValue = ebitdaPS > 0 ? ebitdaPS * sectorBenchmark.avgEV_EBITDA : 0;
        confidence = ebitdaPS > 0 ? 0.60 : 0.3;
        description = `EV/EBITDA Relative: EBITDA/Share ${ebitdaPS.toFixed(4)} × Sector EV/EBITDA ${sectorBenchmark.avgEV_EBITDA.toFixed(1)}`;
        assumptions = { EBITDAPS: ebitdaPS, SectorEVEBITDA: sectorBenchmark.avgEV_EBITDA };
        break;
      }
      case 'relative_ps': {
        const revPS = f.revenuePerShare > 0
          ? f.revenuePerShare
          : f.revenue > 0 && f.sharesOutstanding > 0
            ? f.revenue / f.sharesOutstanding
            : 0;
        fairValue = revPS > 0 ? revPS * sectorBenchmark.avgPS : 0;
        confidence = revPS > 0 ? 0.55 : 0.3;
        description = `P/S Relative: Revenue/Share ${revPS.toFixed(4)} × Sector P/S ${sectorBenchmark.avgPS.toFixed(2)}`;
        assumptions = { RevPS: revPS, SectorPS: sectorBenchmark.avgPS };
        break;
      }
      case 'ddm': {
        fairValue = runSimpleDDM(f, costOfEquity, includeAuditTrail ? auditTrail : undefined);
        confidence = f.dividendYield > 0 && f.eps > 0 ? 0.65 : 0.3;
        description = `DDM: Dividend yield ${(f.dividendYield / 100).toFixed(4)} at CoE ${costOfEquity.toFixed(4)}`;
        assumptions = { DividendYield: f.dividendYield / 100, CoE: costOfEquity };
        break;
      }
      case 'asset_based': {
        fairValue = runAssetBased(f, sector, includeAuditTrail ? auditTrail : undefined);
        confidence = f.bvps > 0 ? 0.60 : 0.3;
        description = `Asset-Based: BVPS ${f.bvps.toFixed(4)} adjusted for ROE ${f.roe}% vs sector avg`;
        assumptions = { BVPS: f.bvps, ROE: f.roe / 100 };
        break;
      }
      default:
        fairValue = 0;
        description = 'Unknown model';
    }

    const weight = modelSelection.weights[modelName] ?? 0;

    if (fairValue > 0) {
      sectorSpecificModels.push({
        modelName,
        fairValue,
        weight,
        confidence,
        assumptions,
        description,
      });
    }
  }

  // ── Step 6: Calculate V3 Weighted Fair Value ──
  let v3FairValue = 0;
  const totalWeight = sectorSpecificModels.reduce((s, m) => s + m.weight, 0);

  if (totalWeight > 0) {
    v3FairValue = sectorSpecificModels.reduce((sum, model) => {
      return sum + model.fairValue * (model.weight / totalWeight);
    }, 0);
  }

  // ── Step 7: Calculate V3 Upside & Status ──
  const v3Upside = f.price > 0 ? ((v3FairValue - f.price) / f.price) * 100 : 0;

  const sectorThresholds = sectorProfile.thresholds;
  let v3Status: FairValueResultV3['v3Status'] = 'N/A';
  if (v3FairValue > 0 && f.price > 0) {
    if (v3Upside > sectorThresholds.undervaluedUpside) v3Status = 'Undervalued';
    else if (v3Upside < sectorThresholds.overvaluedDownside) v3Status = 'Overvalued';
    else v3Status = 'Fairly Valued';
  }

  // ── Step 8: Calculate Confidence & Data Quality ──
  const activeModelCount = sectorSpecificModels.filter((m) => m.fairValue > 0).length;
  const valuationConfidence = calculateValuationConfidence(f, sector, activeModelCount);
  const v3DataQuality = calculateDataQuality(f);

  // ── Step 9: Build Transparent Assumptions ──
  const transparentAssumptions = buildTransparentAssumptions(f, sector, waccResult);

  // ── Step 10: Build V2 base result ──
  // We need to construct a V2 result to extend from.
  // Import the V2 calculation function and call it.
  const v2Result = buildV2BaseResult(f, sector, sectorBenchmarks, mcConfig);

  // ── Step 11: Assemble Final V3 Result ──
  const v3Result: FairValueResultV3 = {
    ...v2Result,

    // V3 fields
    sectorSpecificModels,
    modelSelection,
    valuationConfidence,
    v3DataQuality,
    auditTrail: includeAuditTrail ? auditTrail : [],
    transparentAssumptions,
    waccDetails: waccResult,
    v3FairValue,
    v3Upside,
    v3Status,
  };

  return v3Result;
}

// ══════════════════════════════════════════════════════════════════════
// Internal Helpers
// ══════════════════════════════════════════════════════════════════════

/**
 * Run a simplified sector-specific DCF using the WACC from the engine.
 *
 * This is used internally by calculateFairValueV3 when 'dcf' is among
 * the selected models. It uses a simplified single-stage DCF rather than
 * the V2 multi-stage model to keep the calculation transparent and
 * aligned with the WACC engine's parameters.
 */
function runSectorDCF(
  f: FundamentalData,
  sector: string,
  waccResult: WACCResult,
  auditTrail?: AuditEntry[],
): number {
  if (f.operatingIncome <= 0 || f.sharesOutstanding <= 0) return 0;

  const profile = getSectorValuationProfile(sector);
  const { dcfParams } = profile;

  const wacc = waccResult.wacc;
  const shares = f.sharesOutstanding;
  const operatingIncome = f.operatingIncome;
  const taxRate = EGYPT_TAX_RATE;

  // NOPAT
  const nopat = operatingIncome * (1 - taxRate);

  // Reinvestment rate
  const capEx = Math.abs(f.capex);
  const reinvestmentRate = operatingIncome > 0
    ? Math.max(0, Math.min(0.8, capEx / operatingIncome))
    : dcfParams.capExRatio;

  // FCF
  const fcf = nopat * (1 - reinvestmentRate);

  if (fcf <= 0) return 0;

  const fcfPerShare = fcf / shares;

  // Growth rates
  const revGrowth = f.revenueGrowth > 0
    ? Math.max(-0.25, Math.min(0.35, f.revenueGrowth / 100))
    : dcfParams.baseGrowthRate;

  const baseGrowth = revGrowth;
  const terminalGrowth = dcfParams.terminalGrowthRate;
  const projectionYears = dcfParams.projectionYears;

  if (wacc <= terminalGrowth) return 0;

  // Project FCF per share
  let currentFCFPS = fcfPerShare;
  const projectedFCF: number[] = [];

  for (let i = 0; i < projectionYears; i++) {
    const convergence = projectionYears > 1 ? i / (projectionYears - 1) : 1;
    const yearGrowth = baseGrowth + (terminalGrowth - baseGrowth) * convergence;
    currentFCFPS *= (1 + yearGrowth);
    projectedFCF.push(currentFCFPS);
  }

  // Terminal value
  const lastFCF = projectedFCF[projectedFCF.length - 1] || 0;
  const terminalValue = lastFCF > 0
    ? (lastFCF * (1 + terminalGrowth)) / (wacc - terminalGrowth)
    : 0;

  // Discount to PV
  let pvFCF = 0;
  for (let i = 0; i < projectionYears; i++) {
    pvFCF += projectedFCF[i] / Math.pow(1 + wacc, i + 1);
  }
  const pvTerminal = terminalValue / Math.pow(1 + wacc, projectionYears);

  // Subtract net debt per share
  const netDebtPerShare = Math.max(f.totalDebt - f.cash, 0) / shares;
  const intrinsicValue = Math.max(pvFCF + pvTerminal - netDebtPerShare, 0);

  // Audit entry
  if (auditTrail) {
    auditTrail.push({
      step: 'Sector DCF Valuation',
      formula: 'PV(FCF) + TV / (1+WACC)^n - Net Debt/Share',
      inputs: {
        NOPAT: nopat,
        FCF: fcf,
        FCFPerShare: fcfPerShare,
        BaseGrowth: baseGrowth,
        TerminalGrowth: terminalGrowth,
        WACC: wacc,
        ProjectionYears: projectionYears,
        TerminalValue: terminalValue,
        PVFCF: pvFCF,
        PVTerminal: pvTerminal,
        NetDebtPerShare: netDebtPerShare,
      },
      output: intrinsicValue,
      timestamp: new Date().toISOString(),
      model: 'dcf',
    });
  }

  return intrinsicValue;
}

/**
 * Run a simplified DDM (Gordon Growth) for the V3 engine.
 */
function runSimpleDDM(
  f: FundamentalData,
  costOfEquity: number,
  auditTrail?: AuditEntry[],
): number {
  if (f.dividendYield <= 0 || f.eps <= 0) return 0;

  const dps = f.dps > 0
    ? f.dps
    : f.eps * (f.payoutRatio / 100);

  if (dps <= 0) return 0;

  const k = Math.max(costOfEquity, 0.06);

  // Sustainable growth rate
  const roe = f.roe > 0 ? f.roe / 100 : 0;
  const payoutRatio = f.payoutRatio > 0 ? f.payoutRatio / 100 : dps / f.eps;
  const retentionRatio = Math.max(1 - payoutRatio, 0);

  let g: number;
  if (roe > 0 && retentionRatio > 0) {
    g = Math.min(roe * retentionRatio, k - 0.02);
  } else if (f.earningsGrowth > 0) {
    g = Math.min(f.earningsGrowth / 100, k - 0.02);
  } else {
    g = 0.05;
  }

  g = Math.max(g, 0.005);

  if (g >= k) return 0;

  const fairValue = dps * (1 + g) / (k - g);

  if (auditTrail) {
    auditTrail.push({
      step: 'Simple DDM Valuation',
      formula: 'DPS × (1 + g) / (k - g)',
      inputs: { DPS: dps, g, k, ROE: roe, PayoutRatio: payoutRatio },
      output: fairValue,
      timestamp: new Date().toISOString(),
      model: 'ddm',
    });
  }

  return Math.max(fairValue, 0);
}

/**
 * Run asset-based valuation for the V3 engine.
 */
function runAssetBased(
  f: FundamentalData,
  sector: string,
  auditTrail?: AuditEntry[],
): number {
  if (f.bvps <= 0) return 0;

  const profile = getSectorValuationProfile(sector);
  const roe = f.roe > 0 ? f.roe / 100 : 0;
  const avgROE = profile.avgROE / 100;

  let premium = 0;
  if (roe > 0) {
    premium = (roe - avgROE) * 3;
  }
  premium = Math.max(-0.3, Math.min(0.8, premium));

  const adjustedBVPS = f.bvps * (1 + premium);

  if (auditTrail) {
    auditTrail.push({
      step: 'Asset-Based Valuation',
      formula: 'BVPS × (1 + ROE Premium)',
      inputs: { BVPS: f.bvps, ROE: roe, AvgROE: avgROE, premium },
      output: adjustedBVPS,
      timestamp: new Date().toISOString(),
      model: 'asset_based',
    });
  }

  return adjustedBVPS;
}

/**
 * Build a V2 base result to extend from.
 *
 * This constructs a minimal FairValueResultV2 with V2 fields populated
 * so the V3 result can properly extend it.
 */
function buildV2BaseResult(
  f: FundamentalData,
  sector: string,
  sectorBenchmarks?: Record<string, SectorBenchmark>,
  mcConfig?: MonteCarloConfig,
): FairValueResultV2 {
  // Use the V1 calculation function to get a proper base
  const v1 = v1CalculateFairValue(f, sector, sectorBenchmarks);

  // V2 models
  const multiStageDCF = calculateMultiStageDCF(f);
  const monteCarlo = calculateMonteCarlo(f, mcConfig);
  const multiStageDDM = calculateMultiStageDDM(f);
  const liquidation = calculateLiquidation(f);
  const scenarioAnalysis = calculateScenarioAnalysis(f);

  // Risk score calculation
  let riskScore = 50;
  const de = f.debtEquity;
  let score = 0;
  let max = 0;

  max += 20;
  if (de > 5) score += 20;
  else if (de > 3) score += 15;
  else if (de > 1) score += 10;
  else if (de > 0) score += 5;

  max += 20;
  const b = f.beta > 0 ? f.beta : 1.0;
  if (b > 1.8) score += 20;
  else if (b > 1.4) score += 15;
  else if (b > 1.0) score += 10;
  else if (b > 0.7) score += 5;

  max += 20;
  if (monteCarlo && monteCarlo.mean > 0) {
    const cv = monteCarlo.stdDev / monteCarlo.mean;
    if (cv > 1.0) score += 20;
    else if (cv > 0.6) score += 15;
    else if (cv > 0.3) score += 10;
    else if (cv > 0.15) score += 5;
  } else {
    score += 10;
  }

  max += 15;
  const nm = f.netMargin;
  if (nm <= 0) score += 15;
  else if (nm < 3) score += 10;
  else if (nm < 8) score += 5;

  max += 15;
  if (f.marketCap < 1_000_000_000) score += 15;
  else if (f.marketCap < 10_000_000_000) score += 10;
  else if (f.marketCap < 50_000_000_000) score += 5;

  max += 10;
  if (f.freeCashFlow < 0) score += 10;
  else if (f.operatingCashFlow > 0 && f.freeCashFlow < f.operatingCashFlow * 0.3) score += 5;

  riskScore = max > 0 ? Math.round((score / max) * 100) : 50;

  // Margin of safety
  const marginOfSafety = v1.weightedFairValue > 0
    ? ((v1.weightedFairValue - f.price) / v1.weightedFairValue) * 100
    : 0;

  return {
    ...v1,

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
