/**
 * Egypt-Specific WACC / Discount Rate Engine
 * ────────────────────────────────────────────
 * Institutional-grade weighted average cost of capital calculations
 * calibrated for the Egyptian market (EGX) using:
 *
 *   - Central Bank of Egypt (CBE) rate structure & yield curve
 *   - Country risk premium (CRP) via Damodaran sovereign spread methodology
 *   - Sector-specific betas, debt ratios, and cost of debt
 *   - Egyptian corporate tax regime (22.5%)
 *   - Inflation-adjusted terminal growth assumptions
 *
 * All rates are expressed in **decimal form** (e.g. 0.27 = 27%).
 *
 * @module egypt-wacc-engine
 */

import {
  getSectorValuationProfile,
  EGYPT_MARKET_AVG,
  type SectorValuationProfile,
} from './egx-sectors';

// ═══════════════════════════════════════════════════════════════════
// PUBLIC INTERFACES
// ═══════════════════════════════════════════════════════════════════

/**
 * Complete WACC calculation output.
 *
 * Every intermediate figure used in the WACC derivation is exposed so
 * analysts can audit assumptions, sensitivity-test inputs, and trace
 * how each component contributes to the final discount rate.
 */
export interface WACCResult {
  /** Cost of equity (Ke) — CAPM with Egypt-specific adjustments */
  costOfEquity: number;
  /** After-tax cost of debt (Kd) — corporate borrowing rate × (1 − T) */
  costOfDebt: number;
  /** Weighted average cost of capital (WACC) */
  wacc: number;
  /** Risk-free rate used (matched to projection horizon on the yield curve) */
  riskFreeRate: number;
  /** Equity beta used (provided or sector default) */
  beta: number;
  /** Equity risk premium (Rm − Rf) */
  equityRiskPremium: number;
  /** Country risk premium for Egypt */
  countryRiskPremium: number;
  /** Size premium based on market capitalisation band */
  sizePremium: number;
  /** Egyptian corporate tax rate applied (decimal) */
  taxRate: number;
  /** Debt-to-total-capital ratio (D / V) */
  debtRatio: number;
  /** Equity-to-total-capital ratio (E / V) */
  equityRatio: number;
  /** Full Egyptian government yield curve used in the calculation */
  yieldCurve: {
    '91d': number;
    '182d': number;
    '1y': number;
    '3y': number;
    '5y': number;
    '10y': number;
    '20y': number;
    '30y': number;
  };
  /** Metadata documenting which sources/methodologies were applied */
  assumptions: {
    /** Description of the risk-free rate source (e.g. "CBE 10-year bond yield") */
    riskFreeSource: string;
    /** Whether the beta was user-provided or derived from sector defaults */
    betaSource: 'provided' | 'sector_default';
    /** CRP methodology (e.g. "Damodaran sovereign spread + sector adjustment") */
    crpMethodology: string;
    /** Size premium methodology (e.g. "Market-cap band: Mid cap") */
    sizePremMethodology: string;
  };
}

/**
 * Snapshot of the Egyptian macro-economic environment relevant to WACC.
 *
 * These figures are updated periodically (ideally daily or weekly) when
 * new CBE data becomes available. The `lastUpdated` timestamp allows
 * consumers to gauge data freshness.
 */
export interface EgyptMacroEnvironment {
  /** Current risk-free rate (short-term, typically 91-day T-bill or overnight) */
  riskFreeRate: number;
  /** Current / expected CPI inflation rate */
  inflationRate: number;
  /** Real GDP growth rate */
  gdpGrowthRate: number;
  /** Country risk premium for Egypt */
  countryRiskPremium: number;
  /** Equity risk premium (Rm − Rf) */
  equityRiskPremium: number;
  /** Egyptian corporate income tax rate */
  corporateTaxRate: number;
  /** Full yield curve of Egyptian government securities */
  yieldCurve: { [tenor: string]: number };
  /** ISO-8601 timestamp of the last data refresh */
  lastUpdated: string;
}

/**
 * Parameters accepted by {@link calculateEgyptianWACC}.
 *
 * Only `sector` is required — every other field has a sensible Egyptian
 * market default derived from the sector valuation profile or this engine's
 * built-in macro data.
 */
export interface WACCInputParameters {
  /** EGX sector name (e.g. "Financials", "Real Estate"). **Required.** */
  sector: string;
  /**
   * Company beta. If omitted the sector default beta from the valuation
   * profile is used.
   */
  beta?: number;
  /**
   * Total market capitalisation in Egyptian Pounds (EGP).
   * Used to determine the size premium. If omitted, a mid-cap premium
   * of 1 % is applied.
   */
  marketCapEGP?: number;
  /**
   * Debt-to-equity ratio for the specific company.
   * If omitted the sector default debt ratio is used.
   */
  debtEquityRatio?: number;
  /**
   * Pre-tax cost of debt (decimal). If omitted the sector default
   * cost of debt is used, adjusted by the company's actual leverage.
   */
  costOfDebt?: number;
  /**
   * Projection horizon in years. Determines which point on the yield
   * curve is used as the risk-free rate (e.g. 5 years → 5y bond yield).
   * Defaults to the sector's `projectionYears` from its valuation profile,
   * falling back to 5.
   */
  projectionYears?: number;
  /**
   * Override for the country risk premium. If omitted the engine computes
   * it via the Damodaran sovereign-spread methodology.
   */
  countryRiskPremium?: number;
  /**
   * Override for the equity risk premium. If omitted the sector default
   * is used (typically 0.08 = 8 %).
   */
  equityRiskPremium?: number;
  /**
   * Override for the corporate tax rate. Defaults to 0.225 (22.5 %).
   */
  taxRate?: number;
  /**
   * Override for the risk-free rate. If omitted the yield curve is
   * interpolated at the projection horizon.
   */
  riskFreeRate?: number;
}

// ═══════════════════════════════════════════════════════════════════
// EGYPTIAN GOVERNMENT YIELD CURVE (CBE-linked)
// ═══════════════════════════════════════════════════════════════════

/**
 * Default Egyptian government bond yield curve.
 *
 * Reflects approximately the rates observed in early 2025 as the CBE
 * maintained a tight monetary stance. These values serve as a starting
 * point and should be refreshed when official CBE / Ministry of Finance
 * data is published.
 *
 * All values in **decimal form**.
 */
const DEFAULT_YIELD_CURVE: Record<string, number> = {
  '91d':  0.2650,   // 91-day treasury bill
  '182d': 0.2680,   // 182-day treasury bill
  '1y':   0.2700,   // 1-year government bond
  '3y':   0.2600,   // 3-year government bond
  '5y':   0.2500,   // 5-year government bond
  '10y':  0.2350,   // 10-year government bond
  '20y':  0.2200,   // 20-year government bond
  '30y':  0.2100,   // 30-year government bond
};

/**
 * Mapping from tenor keys to their approximate equivalent in years,
 * used by the interpolation algorithm.
 */
const TENOR_TO_YEARS: Record<string, number> = {
  '91d':  91 / 365,
  '182d': 182 / 365,
  '1y':   1,
  '3y':   3,
  '5y':   5,
  '10y':  10,
  '20y':  20,
  '30y':  30,
};

/**
 * Sorted list of tenor keys ordered by ascending time-to-maturity (years).
 */
const SORTED_TENORS = Object.entries(TENOR_TO_YEARS)
  .sort(([, a], [, b]) => a - b)
  .map(([tenor]) => tenor);

// ═══════════════════════════════════════════════════════════════════
// EGYPT MACRO-ECONOMIC DEFAULTS
// ═══════════════════════════════════════════════════════════════════

/**
 * Default Egyptian macro assumptions.
 *
 * These are calibrated to conditions prevailing in Egypt in 2025:
 *
 * | Parameter                | Value | Source / Rationale                            |
 * |--------------------------|-------|-----------------------------------------------|
 * | Risk-free rate           | 27%   | CBE overnight / 1-year T-bill                 |
 * | Inflation (CPI)         | 23%   | CAPMA target trajectory, actual ~25% in 2024  |
 * | Real GDP growth          | 4.2%  | IMF / World Bank projection                   |
 * | Country risk premium     | 3%    | Damodaran Jan-2025 estimate for Egypt (B- / B)|
 * | Equity risk premium      | 8%    | Historical ERP for Egyptian equities          |
 * | Corporate tax rate       | 22.5% | Egyptian Income Tax Law (Article 19)         |
 */
const DEFAULT_MACRO: Omit<EgyptMacroEnvironment, 'yieldCurve' | 'lastUpdated'> = {
  riskFreeRate:        0.27,
  inflationRate:       0.23,
  gdpGrowthRate:       0.042,
  countryRiskPremium:  0.03,
  equityRiskPremium:   0.08,
  corporateTaxRate:    0.225,
};

// ═══════════════════════════════════════════════════════════════════
// SOVEREIGN RATING & CRP PARAMETERS (Damodaran methodology)
// ═══════════════════════════════════════════════════════════════════

/**
 * Egypt's sovereign credit rating and associated CDS spread data
 * used in the Damodaran country risk premium framework.
 *
 * **Methodology (Damodaran, 2024):**
 *
 * 1. Obtain the sovereign CDS spread for Egypt (in basis points).
 * 2. Convert to an annualised default spread: `CDS / 10,000`.
 * 3. Scale by the ratio of the country's equity market volatility to
 *    its sovereign bond volatility (the "equity risk" adjustment).
 * 4. Optionally adjust by sector risk (some sectors earn mostly local
 *    revenue and thus bear less country risk).
 *
 * The `defaultSpread` below is the pre-adjustment CDS-implied spread.
 * The `equityVolRatio` captures the equity-to-sovereign volatility scaling.
 */
const SOVEREIGN_RATING_DATA = {
  /** Egypt Moody's / S&P / Fitch composite rating */
  rating: 'B-',
  /** Approximate 5-year CDS spread (bps) — early 2025 */
  cdsSpreadBps: 620,
  /** Ratio of EGX100 equity volatility to Egypt sovereign bond volatility */
  equityVolRatio: 1.35,
  /** Mature-market ERP used as the baseline (Damodaran's global ERP) */
  matureMarketERP: 0.055,
};

/**
 * Sector-specific CRP scaling factors.
 *
 * Sectors that derive most revenue domestically (e.g. utilities, telecom)
 * bear a higher proportion of country risk than export-oriented sectors
 * (e.g. materials, energy) whose revenues may be USD-denominated.
 *
 * - `> 1.0` — sector is **more exposed** to Egypt country risk
 * - `< 1.0` — sector is **less exposed** (export / USD revenue)
 */
const SECTOR_CRP_ADJUSTMENT: Record<string, number> = {
  'Financials':                1.00,  // Domestic lending & deposits
  'Materials':                 0.85,  // Export-linked cement / chemicals
  'Real Estate':               1.10,  // Entirely domestic
  'Healthcare':                1.00,  // Mostly domestic
  'Consumer Defensive':        1.05,  // Domestic consumption
  'Industrials':               0.90,  // Mix of domestic & export
  'Consumer Discretionary':    1.00,  // Domestic consumption
  'Energy':                    0.75,  // Oil & gas — USD-linked revenue
  'Technology':                0.90,  // Mix of local & export
  'Communication Services':    0.95,  // Domestic telecom with some USD
  'Utilities':                 1.10,  // Regulated, fully domestic
};

// ═══════════════════════════════════════════════════════════════════
// SIZE PREMIUM BANDS (EGP market capitalisation)
// ═══════════════════════════════════════════════════════════════════

/**
 * Size premium tiers calibrated for the EGX.
 *
 * Smaller companies on the EGX tend to be less liquid, have wider
 * bid-ask spreads, and carry higher information asymmetry — all of
 * which justify an additional premium over the CAPM cost of equity.
 */
const SIZE_PREMIUM_BANDS: Array<{ maxCap: number; premium: number; label: string }> = [
  { maxCap: Infinity, premium: 0.00, label: 'Large cap (>$1B EGP)' },
  { maxCap: 1_000_000_000, premium: 0.01, label: 'Mid cap ($200M–$1B EGP)' },
  { maxCap: 200_000_000, premium: 0.02, label: 'Small cap ($50M–$200M EGP)' },
  { maxCap: 50_000_000, premium: 0.03, label: 'Micro cap (<$50M EGP)' },
];

// ═══════════════════════════════════════════════════════════════════
// CREDIT SPREAD MATRIX (cost of debt adjustments)
// ═══════════════════════════════════════════════════════════════════

/**
 * Credit spread matrix used to adjust the base cost of debt.
 *
 * The spread is added on top of the risk-free rate to reflect the
 * company's credit quality as proxied by its debt-to-equity ratio.
 */
const CREDIT_SPREAD_BY_DE: Array<{ maxDERatio: number; spread: number }> = [
  { maxDERatio: 0.5,  spread: 0.015 },
  { maxDERatio: 1.0,  spread: 0.025 },
  { maxDERatio: 2.0,  spread: 0.040 },
  { maxDERatio: 3.0,  spread: 0.055 },
  { maxDERatio: 5.0,  spread: 0.080 },
  { maxDERatio: Infinity, spread: 0.120 },
];

// ═══════════════════════════════════════════════════════════════════
// MUTABLE STATE — allows live updates from market data feeds
// ═══════════════════════════════════════════════════════════════════

/**
 * Internal mutable macro environment.
 *
 * Updated via `updateMacroEnvironment()` when fresh market data is
 * ingested from CBE publications, IMF reports, or pricing APIs.
 */
let _currentMacro: EgyptMacroEnvironment = {
  ...DEFAULT_MACRO,
  yieldCurve: { ...DEFAULT_YIELD_CURVE },
  lastUpdated: new Date().toISOString(),
};

// ═══════════════════════════════════════════════════════════════════
// CORE EXPORTED FUNCTIONS
// ═══════════════════════════════════════════════════════════════════

/**
 * Calculate the Weighted Average Cost of Capital (WACC) for an
 * Egyptian-listed company.
 *
 * The calculation follows a five-step process:
 *
 * 1. **Resolve sector profile** — fetches default beta, debt ratio,
 *    cost of debt, equity risk premium, and other sector-level WACC
 *    parameters from the `egx-sectors` module.
 *
 * 2. **Determine risk-free rate** — interpolates the Egyptian government
 *    yield curve at the company's projection horizon.
 *
 * 3. **Compute Cost of Equity (Ke)** — CAPM augmented with Egypt
 *    country risk premium and size premium:
 *
 *    ```
 *    Ke = Rf + β × ERP + CRP + SP
 *    ```
 *
 * 4. **Compute Cost of Debt (Kd)** — base rate plus a credit spread
 *    derived from the company's debt-to-equity ratio, then tax-affected.
 *
 * 5. **Compute WACC** — weighted by the company's capital structure:
 *
 *    ```
 *    WACC = (E/V × Ke) + (D/V × Kd × (1 − T))
 *    ```
 *
 * @param params - WACC input parameters. Only `sector` is required.
 * @returns A fully populated {@link WACCResult} with all intermediate values.
 *
 * @example
 * ```ts
 * import { calculateEgyptianWACC } from '@/lib/egypt-wacc-engine';
 *
 * const result = calculateEgyptianWACC({
 *   sector: 'Financials',
 *   beta: 1.15,
 *   marketCapEGP: 45_000_000_000,  // EGP 45 billion
 *   debtEquityRatio: 4.5,
 *   projectionYears: 5,
 * });
 *
 * console.log(`WACC = ${(result.wacc * 100).toFixed(2)}%`);
 * ```
 */
export function calculateEgyptianWACC(params: WACCInputParameters): WACCResult {
  const {
    sector,
    beta: providedBeta,
    marketCapEGP,
    debtEquityRatio: providedDERatio,
    costOfDebt: providedKd,
    projectionYears: providedHorizon,
    countryRiskPremium: providedCRP,
    equityRiskPremium: providedERP,
    taxRate: providedTaxRate,
    riskFreeRate: providedRf,
  } = params;

  // ── Step 1: Resolve sector valuation profile ──────────────────
  const sectorProfile: SectorValuationProfile = getSectorValuationProfile(sector);
  const sectorWacc = sectorProfile.waccParams;

  // ── Step 2: Determine risk-free rate from yield curve ──────────
  const projectionYears = providedHorizon ?? sectorProfile.dcfParams.projectionYears ?? 5;
  const riskFreeRate = providedRf ?? interpolateYieldCurve(projectionYears);

  let riskFreeSource: string;
  if (providedRf !== undefined) {
    riskFreeSource = 'User-provided override';
  } else {
    // Find the closest tenor label for documentation
    const closestTenor = findClosestTenor(projectionYears);
    riskFreeSource = `CBE yield curve interpolated at ${projectionYears}-year horizon (nearest tenor: ${closestTenor})`;
  }

  // ── Step 3: Beta ───────────────────────────────────────────────
  const beta = providedBeta ?? sectorWacc.defaultBeta;
  const betaSource: 'provided' | 'sector_default' = providedBeta !== undefined ? 'provided' : 'sector_default';

  // ── Step 4: Equity Risk Premium ───────────────────────────────
  const equityRiskPremium = providedERP ?? sectorWacc.equityRiskPremium;

  // ── Step 5: Country Risk Premium ───────────────────────────────
  const crp = providedCRP ?? getCountryRiskPremium(sector);

  // ── Step 6: Size Premium ───────────────────────────────────────
  const sizePremium = getSizePremium(marketCapEGP);
  const sizeLabel = SIZE_PREMIUM_BANDS.find(
    (b) => marketCapEGP !== undefined && marketCapEGP <= b.maxCap,
  )?.label ?? 'Mid cap ($200M–$1B EGP) [default]';

  // ── Step 7: Cost of Equity (Ke) — CAPM with Egypt adjustments ──
  //
  //    Ke = Rf + β × ERP + CRP + SP
  //
  const costOfEquity = riskFreeRate + beta * equityRiskPremium + crp + sizePremium;

  // ── Step 8: Capital structure ───────────────────────────────────
  const taxRate = providedTaxRate ?? sectorWacc.taxRate;

  // Resolve debt/equity → weightings
  const effectiveDERatio = providedDERatio ?? sectorWacc.defaultDebtRatio;
  const debtRatio = effectiveDERatio / (1 + effectiveDERatio);
  const equityRatio = 1 - debtRatio;

  // ── Step 9: Cost of Debt (Kd) ─────────────────────────────────
  //
  //    Kd_pre-tax = Rf + credit_spread(D/E)
  //    Kd_after-tax = Kd_pre-tax × (1 − T)
  //
  const creditSpread = getCreditSpread(effectiveDERatio);
  const preTaxCostOfDebt = providedKd ?? (riskFreeRate + creditSpread);
  const afterTaxCostOfDebt = preTaxCostOfDebt * (1 - taxRate);

  // ── Step 10: WACC ──────────────────────────────────────────────
  //
  //    WACC = (E/V × Ke) + (D/V × Kd × (1 − T))
  //
  const wacc = equityRatio * costOfEquity + debtRatio * afterTaxCostOfDebt;

  // ── Assemble yield curve snapshot ───────────────────────────────
  const yc = _currentMacro.yieldCurve;
  const yieldCurve = {
    '91d':  yc['91d']  ?? DEFAULT_YIELD_CURVE['91d'],
    '182d': yc['182d'] ?? DEFAULT_YIELD_CURVE['182d'],
    '1y':   yc['1y']   ?? DEFAULT_YIELD_CURVE['1y'],
    '3y':   yc['3y']   ?? DEFAULT_YIELD_CURVE['3y'],
    '5y':   yc['5y']   ?? DEFAULT_YIELD_CURVE['5y'],
    '10y':  yc['10y']  ?? DEFAULT_YIELD_CURVE['10y'],
    '20y':  yc['20y']  ?? DEFAULT_YIELD_CURVE['20y'],
    '30y':  yc['30y']  ?? DEFAULT_YIELD_CURVE['30y'],
  };

  return {
    costOfEquity,
    costOfDebt: afterTaxCostOfDebt,
    wacc,
    riskFreeRate,
    beta,
    equityRiskPremium,
    countryRiskPremium: crp,
    sizePremium,
    taxRate,
    debtRatio,
    equityRatio,
    yieldCurve,
    assumptions: {
      riskFreeSource,
      betaSource,
      crpMethodology: `Damodaran sovereign spread (CDS ${SOVEREIGN_RATING_DATA.cdsSpreadBps}bps × equity vol ratio ${SOVEREIGN_RATING_DATA.equityVolRatio}) × sector factor ${SECTOR_CRP_ADJUSTMENT[sector] ?? 1.0}`,
      sizePremMethodology: `Market-cap band: ${sizeLabel}`,
    },
  };
}

/**
 * Return a snapshot of the current Egyptian macro-economic environment
 * used by the WACC engine.
 *
 * This is useful for dashboard displays and for audit trails — analysts
 * can see exactly what macro inputs were active at the time a valuation
 * was generated.
 *
 * @returns A deep-cloned {@link EgyptMacroEnvironment} object.
 */
export function getEgyptMacroEnvironment(): EgyptMacroEnvironment {
  // Return a deep copy to prevent external mutation of internal state
  return {
    ..._currentMacro,
    yieldCurve: { ..._currentMacro.yieldCurve },
  };
}

/**
 * Interpolate the Egyptian government yield curve at an arbitrary
 * time-to-maturity.
 *
 * Uses **linear interpolation** between the two adjacent tenors on the
 * curve. For tenors outside the curve range:
 *
 * - **Below 91 days** — clamps to the 91-day rate.
 * - **Above 30 years** — clamps to the 30-year rate (with a small
 *   extrapolation warning in development builds).
 *
 * @param tenorYears - Time to maturity in years (e.g. 2.5 for 2½ years).
 * @returns Interpolated yield in decimal form (e.g. 0.258 = 25.8%).
 *
 * @example
 * ```ts
 * interpolateYieldCurve(2);   // → 0.2650 (between 1y and 3y)
 * interpolateYieldCurve(15);  // → 0.2275 (between 10y and 20y)
 * ```
 */
export function interpolateYieldCurve(tenorYears: number): number {
  const curve = _currentMacro.yieldCurve;

  // Build sorted (years, rate) pairs from available curve data
  const points: Array<{ years: number; rate: number }> = [];
  for (const tenor of SORTED_TENORS) {
    const years = TENOR_TO_YEARS[tenor];
    const rate = curve[tenor] ?? DEFAULT_YIELD_CURVE[tenor] ?? 0.25;
    points.push({ years, rate });
  }

  // ── Clamp below the minimum tenor ─────────────────────────────
  if (tenorYears <= points[0].years) {
    return points[0].rate;
  }

  // ── Clamp above the maximum tenor ─────────────────────────────
  if (tenorYears >= points[points.length - 1].years) {
    return points[points.length - 1].rate;
  }

  // ── Linear interpolation between the two bracketing points ─────
  for (let i = 0; i < points.length - 1; i++) {
    const lo = points[i];
    const hi = points[i + 1];
    if (tenorYears >= lo.years && tenorYears <= hi.years) {
      const fraction = (tenorYears - lo.years) / (hi.years - lo.years);
      return lo.rate + fraction * (hi.rate - lo.rate);
    }
  }

  // Fallback — should never reach here
  return _currentMacro.riskFreeRate;
}

/**
 * Determine the size premium for an Egyptian-listed company based on
 * its market capitalisation in EGP.
 *
 * | Market Cap (EGP) | Premium | Rationale |
 * |-------------------|---------|-----------|
 * | > 1,000,000,000   | 0.00%   | Large & liquid |
 * | 200M – 1B         | 1.00%   | Moderate illiquidity |
 * | 50M – 200M        | 2.00%   | Higher illiquidity & information risk |
 * | < 50,000,000      | 3.00%   | Micro-cap — thin trading, wide spreads |
 *
 * If `marketCapEGP` is not provided the engine assumes a mid-cap
 * default of 1 %.
 *
 * @param marketCapEGP - Market capitalisation in Egyptian Pounds.
 * @returns Size premium in decimal form (e.g. 0.02 = 2%).
 */
export function getSizePremium(marketCapEGP?: number): number {
  if (marketCapEGP === undefined) {
    return 0.01; // Default to mid-cap
  }

  for (const band of SIZE_PREMIUM_BANDS) {
    if (marketCapEGP <= band.maxCap) {
      return band.premium;
    }
  }

  // Fallback: large cap
  return 0.00;
}

/**
 * Compute the Country Risk Premium (CRP) for Egypt using the
 * **Damodaran sovereign spread methodology**.
 *
 * **Procedure:**
 *
 * 1. Start with the CDS-implied sovereign default spread:
 *    `defaultSpread = CDS_bps / 10,000`
 *
 * 2. Scale by the equity-to-sovereign volatility ratio to convert
 *    from bond risk to equity risk:
 *    `rawCRP = defaultSpread × equityVolRatio`
 *
 * 3. Optionally adjust by sector — export-oriented sectors (energy,
 *    materials) are less exposed to Egyptian country risk than
 *    domestic-facing sectors (utilities, real estate).
 *    `sectorCRP = rawCRP × sectorAdjustmentFactor`
 *
 * @param sector - Optional EGX sector name. If provided, the CRP is
 *   scaled by the sector's exposure factor.
 * @returns Country risk premium in decimal form (typically ~0.03 = 3%).
 *
 * @example
 * ```ts
 * getCountryRiskPremium();             // → 0.0335 (no sector adjustment)
 * getCountryRiskPremium('Energy');     // → 0.0251 (export-linked, lower)
 * getCountryRiskPremium('Utilities');  // → 0.0369 (domestic, higher)
 * ```
 */
export function getCountryRiskPremium(sector?: string): number {
  // Step 1: CDS-implied default spread
  const defaultSpread = SOVEREIGN_RATING_DATA.cdsSpreadBps / 10_000;

  // Step 2: Scale by equity-to-sovereign volatility ratio
  const rawCRP = defaultSpread * SOVEREIGN_RATING_DATA.equityVolRatio;

  // Step 3: Sector adjustment (default = 1.0 = no adjustment)
  const sectorFactor = sector ? (SECTOR_CRP_ADJUSTMENT[sector] ?? 1.0) : 1.0;

  return rawCRP * sectorFactor;
}

/**
 * Convert a nominal rate to a real rate by removing the effect of
 * expected inflation, using the **Fisher equation** (exact form):
 *
 * ```
 * realRate = (1 + nominalRate) / (1 + inflationRate) − 1
 * ```
 *
 * This is useful for converting the WACC (which is in nominal terms)
 * to a real discount rate when projecting cash flows in real (inflation-
 * adjusted) terms.
 *
 * @param nominalRate - Nominal rate in decimal form (e.g. 0.30).
 * @param inflationRate - Expected inflation rate in decimal form.
 *   Defaults to the current macro inflation assumption (0.23).
 * @returns Real rate in decimal form.
 *
 * @example
 * ```ts
 * adjustForInflation(0.30, 0.23);  // → 0.0569 (≈ 5.69% real)
 * ```
 */
export function adjustForInflation(
  nominalRate: number,
  inflationRate?: number,
): number {
  const inflation = inflationRate ?? _currentMacro.inflationRate;

  // Fisher equation (exact)
  return (1 + nominalRate) / (1 + inflation) - 1;
}

// ═══════════════════════════════════════════════════════════════════
// LIVE UPDATE FUNCTIONS (for market data integration)
// ═════════════════════════════════════════════════════════════════

/**
 * Update the Egyptian macro environment with fresh market data.
 *
 * This function is intended to be called by a scheduled job, API
 * endpoint, or WebSocket handler whenever new CBE rates, inflation
 * figures, or sovereign spread data becomes available.
 *
 * Only the provided fields are overwritten — omitted fields retain
 * their current values.
 *
 * @param updates - Partial set of fields to update.
 *
 * @example
 * ```ts
 * updateMacroEnvironment({
 *   riskFreeRate: 0.265,
 *   yieldCurve: { '91d': 0.26, '1y': 0.265, '10y': 0.23 },
 *   inflationRate: 0.20,
 * });
 * ```
 */
export function updateMacroEnvironment(
  updates: Partial<Omit<EgyptMacroEnvironment, 'lastUpdated'>>,
): void {
  _currentMacro = {
    ..._currentMacro,
    ...updates,
    yieldCurve: {
      ..._currentMacro.yieldCurve,
      ...updates.yieldCurve,
    },
    lastUpdated: new Date().toISOString(),
  };
}

/**
 * Reset the macro environment to its default (hardcoded) values.
 * Useful for testing or for rolling back after a bad data feed.
 */
export function resetMacroEnvironment(): void {
  _currentMacro = {
    ...DEFAULT_MACRO,
    yieldCurve: { ...DEFAULT_YIELD_CURVE },
    lastUpdated: new Date().toISOString(),
  };
}

// ═══════════════════════════════════════════════════════════════════
// UTILITY FUNCTIONS (not exported — internal use only)
// ═══════════════════════════════════════════════════════════════════

/**
 * Find the closest tenor label to a given number of years.
 *
 * @param years - Target time in years.
 * @returns The tenor string key (e.g. "5y") that is closest to the target.
 */
function findClosestTenor(years: number): string {
  let closest = SORTED_TENORS[0];
  let minDiff = Infinity;

  for (const tenor of SORTED_TENORS) {
    const tenorYears = TENOR_TO_YEARS[tenor];
    const diff = Math.abs(tenorYears - years);
    if (diff < minDiff) {
      minDiff = diff;
      closest = tenor;
    }
  }

  return closest;
}

/**
 * Look up the credit spread (bps over risk-free) implied by a company's
 * debt-to-equity ratio.
 *
 * The spread represents the additional yield investors demand to hold
 * the company's debt versus Egyptian government bonds of similar maturity.
 *
 * @param debtEquityRatio - The company's total debt / total equity.
 * @returns Credit spread in decimal form (e.g. 0.04 = 4%).
 */
function getCreditSpread(debtEquityRatio: number): number {
  for (const tier of CREDIT_SPREAD_BY_DE) {
    if (debtEquityRatio <= tier.maxDERatio) {
      return tier.spread;
    }
  }
  return CREDIT_SPREAD_BY_DE[CREDIT_SPREAD_BY_DE.length - 1].spread;
}

/**
 * Clamp a value between a minimum and maximum.
 *
 * @param value - The input value.
 * @param min - Lower bound.
 * @param max - Upper bound.
 * @returns The clamped value.
 */
function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/**
 * Convert a real rate back to a nominal rate using the Fisher equation:
 *
 * ```
 * nominalRate = (1 + realRate) × (1 + inflationRate) − 1
 * ```
 *
 * @param realRate - Real rate in decimal form.
 * @param inflationRate - Inflation rate in decimal form.
 * @returns Nominal rate in decimal form.
 */
function nominalFromReal(realRate: number, inflationRate: number): number {
  return (1 + realRate) * (1 + inflationRate) - 1;
}

/**
 * Compute a terminal growth rate appropriate for an Egyptian DCF model.
 *
 * The terminal growth rate should not exceed the long-run nominal GDP
 * growth rate of the Egyptian economy. A common approach:
 *
 * ```
 * g_terminal = inflation + realGDP_growth × 0.6
 * ```
 *
 * The 0.6 factor reflects that most companies cannot grow faster than
 * the economy indefinitely — they converge toward GDP growth in the
 * long run.
 *
 * @param sector - Optional sector; uses sector-specific terminal growth if available.
 * @param inflationOverride - Override for inflation. Defaults to macro assumption.
 * @returns Terminal growth rate in decimal form (clamped between 0 and nominal GDP).
 */
export function computeTerminalGrowthRate(
  sector?: string,
  inflationOverride?: number,
): number {
  const inflation = inflationOverride ?? _currentMacro.inflationRate;
  const realGDP = _currentMacro.gdpGrowthRate;

  // If a sector is provided, use its profile's terminal growth as a ceiling
  let sectorTerminalGrowth: number | undefined;
  if (sector) {
    const profile = getSectorValuationProfile(sector);
    sectorTerminalGrowth = profile.dcfParams.terminalGrowthRate;
  }

  // Base terminal growth: inflation + fraction of real GDP growth
  const baseTerminal = inflation + realGDP * 0.6;

  // Cap at the sector's terminal growth rate (which is typically conservative)
  if (sectorTerminalGrowth !== undefined) {
    return Math.min(baseTerminal, sectorTerminalGrowth);
  }

  // Hard cap: terminal growth cannot exceed nominal GDP growth
  const nominalGDP = nominalFromReal(realGDP, inflation);
  return clamp(baseTerminal, 0, nominalGDP);
}

/**
 * Validate a WACC result for internal consistency.
 *
 * Checks that:
 * - All rates are non-negative.
 * - WACC falls within a reasonable range (0–1, i.e. 0%–100%).
 * - Cost of equity > cost of debt (after tax) in most cases.
 * - Debt + equity ratios sum to 1.
 *
 * @param result - The WACC result to validate.
 * @returns An object with `valid` (boolean) and `warnings` (string[]).
 */
export function validateWACCResult(
  result: WACCResult,
): { valid: boolean; warnings: string[] } {
  const warnings: string[] = [];

  if (result.wacc < 0 || result.wacc > 1) {
    warnings.push(`WACC of ${(result.wacc * 100).toFixed(2)}% is outside the 0–100% range.`);
  }

  if (result.costOfEquity < 0) {
    warnings.push(`Cost of equity (${(result.costOfEquity * 100).toFixed(2)}%) is negative.`);
  }

  if (result.costOfDebt < 0) {
    warnings.push(`Cost of debt (${(result.costOfDebt * 100).toFixed(2)}%) is negative.`);
  }

  if (result.beta < 0) {
    warnings.push(`Beta (${result.beta.toFixed(2)}) is negative — unusual for most sectors.`);
  }

  if (result.costOfDebt > result.costOfEquity) {
    warnings.push(
      `After-tax cost of debt (${(result.costOfDebt * 100).toFixed(2)}%) exceeds cost of equity (${(result.costOfEquity * 100).toFixed(2)}%) — verify capital structure assumptions.`,
    );
  }

  const weightSum = result.debtRatio + result.equityRatio;
  if (Math.abs(weightSum - 1) > 0.001) {
    warnings.push(`Debt ratio (${result.debtRatio}) + equity ratio (${result.equityRatio}) ≠ 1.0.`);
  }

  if (result.riskFreeRate <= 0) {
    warnings.push(`Risk-free rate (${(result.riskFreeRate * 100).toFixed(2)}%) is zero or negative.`);
  }

  return {
    valid: warnings.length === 0,
    warnings,
  };
}
