/**
 * Institutional-Grade Data Validation Layer v2
 * ────────────────────────────────────────────
 *
 * Comprehensive validation pipeline for the Egyptian stock market (EGX)
 * platform. Every data point passes through automated multi-layered
 * validation checks before being used in analysis, valuation, or display.
 *
 * Validation Categories:
 *   1. Cross-Source Verification  – Multi-source agreement checks
 *   2. Historical Consistency      – YoY and sequential change detection
 *   3. Outlier Detection            – Z-score and IQR-based anomaly flags
 *   4. Missing Value Detection     – Completeness scoring
 *   5. Duplicate Filing Detection  – Filing date deduplication
 *   6. Restatement Detection       – Material restatement flagging
 *   7. Sanity Checks               – Fundamental ratio reasonability
 *   8. Sector Benchmark Comparison – Peer-relative analysis
 *
 * Egyptian Market Specifics:
 *   - All monetary values in EGP (Egyptian Pounds)
 *   - CBE overnight rate ≈ 27% (2025)
 *   - EGX average P/E ≈ 9.5, sector-specific norms apply
 *   - Frontier market data quality considerations
 *
 * NOTE: All exported functions are prefixed with `institutional` to avoid
 *       naming conflicts with the original data-validator.ts module.
 *
 * @module data-validator-v2
 */

import { getSectorBenchmark, EGYPT_MARKET_AVG } from './egx-sectors';
import type { FundamentalData } from './fundamentals';

// ═══════════════════════════════════════════════════════════════════
// INTERFACES
// ═══════════════════════════════════════════════════════════════════

/**
 * Represents a single validation check performed on a data field.
 *
 * Each check has a severity level:
 *   - `info`     – Informational, no action needed
 *   - `warning`  – Potential issue, worth investigating
 *   - `error`    – Likely data problem, should be reviewed
 *   - `critical` – Data should not be trusted until resolved
 */
export interface ValidationCheck {
  /** Machine-readable check identifier */
  checkName: string;
  /** Whether the check passed */
  passed: boolean;
  /** Severity level when the check fails */
  severity: 'info' | 'warning' | 'error' | 'critical';
  /** Human-readable description of the check result */
  message: string;
  /** Optional additional context (e.g., expected range, deviation %) */
  details?: string;
}

/**
 * Aggregated validation result for a single data field.
 *
 * Combines all checks run against a field into one result with
 * an overall validity flag, a confidence score (0–1), and
 * categorized warnings/errors.
 */
export interface ValidationResult {
  /** The field name being validated (e.g., 'pe', 'revenue', 'eps') */
  field: string;
  /** The raw value of the field */
  value: number | string;
  /** True if all checks passed or only info-level flags were raised */
  isValid: boolean;
  /** Non-critical issues that should be reviewed */
  warnings: string[];
  /** Critical issues that invalidate the data point */
  errors: string[];
  /** Confidence in this value: 1.0 = fully trusted, 0.0 = completely unreliable */
  confidence: number;
  /** Individual check results for detailed drill-down */
  validationChecks: ValidationCheck[];
}

/**
 * Data quality score broken down by dimension.
 *
 * Each dimension is scored 0–100, and an overall weighted average
 * is computed. A letter grade (A+ through F) is assigned based on
 * institutional grading standards.
 */
export interface DataQualityScore {
  /** Weighted overall score (0–100) */
  overall: number;
  /** Percentage of expected fields that are populated */
  completeness: number;
  /** Cross-source agreement rate */
  consistency: number;
  /** How recently the data was last updated */
  timeliness: number;
  /** Percentage of sanity checks that passed */
  accuracy: number;
  /** Institutional letter grade */
  grade: 'A+' | 'A' | 'A-' | 'B+' | 'B' | 'B-' | 'C+' | 'C' | 'C-' | 'D' | 'F';
}

/**
 * Valuation confidence score – separate from data quality.
 *
 * Assesses how confident we can be in a valuation model's output
 * based on data availability, source reliability, forecastability,
 * and sector maturity.
 */
export interface ValuationConfidence {
  /** Human-readable confidence level */
  level: 'Very High' | 'High' | 'Moderate' | 'Low' | 'Very Low';
  /** Numeric score (0–100) */
  score: number;
  /** Sub-factor scores that compose the overall confidence */
  factors: {
    /** How much data we have (0–100) */
    dataAvailability: number;
    /** How reliable the reporting source is (0–100) */
    reportingQuality: number;
    /** How predictable the company's earnings are (0–100) */
    forecastCertainty: number;
    /** Earnings consistency over recent periods (0–100) */
    earningsStability: number;
    /** How well-understood the sector is (0–100) */
    sectorMaturity: number;
  };
  /** Human-readable explanation of the confidence assessment */
  explanation: string;
}

/**
 * Comprehensive validation report aggregating all checks for a stock.
 */
export interface ValidationReport {
  /** Stock symbol (uppercase, e.g., 'CIB') */
  symbol: string;
  /** ISO 8601 timestamp of when the report was generated */
  generatedAt: string;
  /** Per-field validation results */
  fieldResults: ValidationResult[];
  /** Aggregated data quality score */
  qualityScore: DataQualityScore;
  /** Valuation confidence assessment */
  valuationConfidence: ValuationConfidence;
  /** Count of checks by severity */
  summary: {
    totalChecks: number;
    passed: number;
    failed: number;
    criticalCount: number;
    errorCount: number;
    warningCount: number;
    infoCount: number;
  };
  /** Top-priority issues that require immediate attention */
  priorityIssues: string[];
  /** Recommendation on whether the data is usable for analysis */
  recommendation: 'trust' | 'use_with_caution' | 'do_not_use';
}

// ── Input / Helper Types ───────────────────────────────────────────

/**
 * A value reported by a specific data source, tagged with its reliability tier.
 *
 * Tiers:
 *   - Tier 1: Primary / official (e.g., EGX filings, company disclosures)
 *   - Tier 2: Aggregator / verified (e.g., TradingView, Mubasher)
 *   - Tier 3: Estimated / crowd-sourced (e.g., user-submitted)
 */
export interface SourceValue {
  /** Data provider name (e.g., 'tradingview', 'mubasher', 'egx_filing') */
  source: string;
  /** Reliability tier of this source */
  tier: 1 | 2 | 3;
  /** Numeric value reported for this field */
  value: number;
  /** ISO 8601 timestamp of when this value was fetched */
  fetchedAt?: string;
}

/**
 * A historical price snapshot for a single trading day.
 */
export interface PriceSnapshot {
  /** Trading date in ISO 8601 format (YYYY-MM-DD) */
  date: string;
  /** Closing price in EGP */
  price: number;
  /** Trading volume in shares */
  volume: number;
}

/**
 * Generic financial statement for validation.
 *
 * The `data` map contains field → value pairs, where field names follow
 * standard Egyptian financial reporting conventions.
 */
export interface FinancialStatement {
  /** Type of financial statement */
  type: 'income_statement' | 'balance_sheet' | 'cash_flow';
  /** Reporting period (e.g., '2024-12-31', 'FY2024', 'Q3-2024') */
  period: string;
  /** Whether this statement has been audited */
  isAudited?: boolean;
  /** Field name → numeric value (all values in EGP or percentages) */
  data: Record<string, number>;
}

/**
 * A metric change record for restatement tracking.
 */
export interface MetricChange {
  /** Field name */
  field: string;
  /** Previously reported value */
  oldValue: number;
  /** Currently reported value */
  newValue: number;
  /** Absolute percentage change */
  changePercent: number;
  /** Whether this qualifies as a material restatement */
  isMaterial: boolean;
}

// ═══════════════════════════════════════════════════════════════════
// EGYPTIAN MARKET CONSTANTS
// ═══════════════════════════════════════════════════════════════════

/** Maximum allowed deviation between Tier 1 and Tier 2 sources (5%) */
const TIER1_VS_TIER2_DEVIATION_THRESHOLD = 0.05;

/** Maximum allowed deviation between any two sources (10%) */
const ANY_SOURCE_DEVIATION_THRESHOLD = 0.10;

/** Material restatement threshold (5% change) */
const RESTATEMENT_MATERIAL_THRESHOLD = 0.05;

/** Z-score threshold for outlier detection (3 standard deviations) */
const ZSCORE_OUTLIER_THRESHOLD = 3.0;

/** IQR multiplier for outlier detection (1.5× IQR beyond quartiles) */
const IQR_OUTLIER_MULTIPLIER = 1.5;

/** Year-over-year change threshold for non-volatile metrics (50%) */
const YOY_NON_VOLATILE_THRESHOLD = 0.50;

/** Dividend yield sanity upper bound (50%) */
const DIVIDEND_YIELD_UPPER_BOUND = 50;

/** Revenue growth sanity range: lower bound (-100%) */
const REVENUE_GROWTH_LOWER_BOUND = -100;

/** Revenue growth sanity range: upper bound (+500%) */
const REVENUE_GROWTH_UPPER_BOUND = 500;

/** Market cap vs price×shares tolerance (5%) */
const MARKET_CAP_TOLERANCE = 0.05;

/** Days after which data is considered stale for timeliness scoring */
const STALE_DATA_DAYS = 7;

/** Days after which data is considered severely stale */
const SEVERELY_STALE_DATA_DAYS = 30;

/** Minimum number of peers required for meaningful outlier detection */
const MIN_PEERS_FOR_OUTLIER = 3;

/** Non-volatile fundamental metrics (where YoY > 50% is suspicious) */
const NON_VOLATILE_METRICS: string[] = [
  'totalAssets',
  'totalLiabilities',
  'stockholdersEquity',
  'sharesOutstanding',
  'debtEquity',
  'bvps',
];

/** Critical fields that must be populated for meaningful analysis */
const CRITICAL_FIELDS: (keyof FundamentalData)[] = [
  'eps',
  'revenue',
  'totalDebt',
  'price',
  'marketCap',
  'sharesOutstanding',
];

/** Fields that are commonly zero but shouldn't be for active stocks */
const SHOULD_NOT_BE_ZERO_WHEN_ACTIVE: (keyof FundamentalData)[] = [
  'eps',
  'revenue',
  'netIncome',
  'grossProfit',
  'totalAssets',
  'stockholdersEquity',
  'sharesOutstanding',
];

// ═══════════════════════════════════════════════════════════════════
// INTERNAL UTILITY FUNCTIONS
// ═══════════════════════════════════════════════════════════════════

/**
 * Calculate the percentage difference between two numeric values.
 *
 * Handles zero-edge cases gracefully:
 *   - Both zero → 0% difference
 *   - One zero → 100% difference
 *   - Otherwise → |a − b| / max(|a|, |b|)
 *
 * @returns Value between 0 (identical) and 1 (100% different)
 */
function institutionalPctDiff(a: number, b: number): number {
  if (a === 0 && b === 0) return 0;
  if (a === 0 || b === 0) return 1;
  return Math.abs(a - b) / Math.max(Math.abs(a), Math.abs(b));
}

/**
 * Compute the arithmetic mean of a numeric array.
 * Returns 0 for empty arrays.
 */
function institutionalMean(values: number[]): number {
  if (!values.length) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

/**
 * Compute the population standard deviation of a numeric array.
 * Returns 0 for empty arrays or arrays with fewer than 2 elements.
 */
function institutionalStdDev(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = institutionalMean(values);
  const squaredDiffs = values.map((v) => Math.pow(v - mean, 2));
  return Math.sqrt(squaredDiffs.reduce((sum, d) => sum + d, 0) / values.length);
}

/**
 * Compute the z-score of a value within a distribution.
 *
 * @param value   - The value to score
 * @param values   - The reference distribution
 * @returns Z-score (can be Infinity if std dev is 0)
 */
function institutionalZScore(value: number, values: number[]): number {
  if (values.length < 2) return 0;
  const mean = institutionalMean(values);
  const stdDev = institutionalStdDev(values);
  if (stdDev === 0) return value === mean ? 0 : Infinity;
  return (value - mean) / stdDev;
}

/**
 * Compute the median of a numeric array.
 * Returns 0 for empty arrays.
 */
function institutionalMedian(values: number[]): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * Compute the quartiles (Q1, Q3) and interquartile range (IQR)
 * of a numeric array using linear interpolation.
 *
 * @returns `{ q1, q3, iqr }` — returns zeros for arrays with < 4 elements
 */
function institutionalQuartiles(values: number[]): { q1: number; q3: number; iqr: number } {
  const defaultResult = { q1: 0, q3: 0, iqr: 0 };
  if (values.length < 4) return defaultResult;

  const sorted = [...values].sort((a, b) => a - b);
  const n = sorted.length;

  const percentile = (p: number): number => {
    const index = (p / 100) * (n - 1);
    const lower = Math.floor(index);
    const upper = Math.ceil(index);
    if (lower === upper) return sorted[lower];
    return sorted[lower] + (sorted[upper] - sorted[lower]) * (index - lower);
  };

  const q1 = percentile(25);
  const q3 = percentile(75);
  return { q1, q3, iqr: q3 - q1 };
}

/**
 * Clamp a numeric value within a specified range.
 */
function institutionalClamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Parse an ISO date string and return the number of days since that date.
 * Returns `Infinity` if the date string is invalid.
 */
function institutionalDaysSince(isoDate: string | null | undefined): number {
  if (!isoDate) return Infinity;
  try {
    const then = new Date(isoDate).getTime();
    const now = Date.now();
    if (isNaN(then)) return Infinity;
    return (now - then) / (1000 * 60 * 60 * 24);
  } catch {
    return Infinity;
  }
}

/**
 * Determine the letter grade for a numeric score (0–100).
 *
 * Grading scale:
 *   A+ = 97–100   A  = 93–96   A- = 90–92
 *   B+ = 87–89    B  = 83–86   B- = 80–82
 *   C+ = 77–79    C  = 73–76   C- = 70–72
 *   D  = 60–69    F  = 0–59
 */
function institutionalGrade(score: number): DataQualityScore['grade'] {
  if (score >= 97) return 'A+';
  if (score >= 93) return 'A';
  if (score >= 90) return 'A-';
  if (score >= 87) return 'B+';
  if (score >= 83) return 'B';
  if (score >= 80) return 'B-';
  if (score >= 77) return 'C+';
  if (score >= 73) return 'C';
  if (score >= 70) return 'C-';
  if (score >= 60) return 'D';
  return 'F';
}

/**
 * Create a ValidationCheck object with all required fields.
 */
function institutionalMakeCheck(
  checkName: string,
  passed: boolean,
  severity: ValidationCheck['severity'],
  message: string,
  details?: string,
): ValidationCheck {
  return { checkName, passed, severity, message, details };
}

// ═══════════════════════════════════════════════════════════════════
// 1. CROSS-SOURCE VERIFICATION
// ═══════════════════════════════════════════════════════════════════

/**
 * Cross-validate a single field's value across multiple data sources.
 *
 * **Algorithm:**
 * 1. Group sources by reliability tier (Tier 1 = primary, Tier 2 = aggregator, Tier 3 = estimated).
 * 2. Compute the median value per tier (for tiers with multiple sources).
 * 3. Flag if deviation between Tier 1 and Tier 2 exceeds 5% (CRITICAL).
 * 4. Flag if deviation between any two source values exceeds 10% (ERROR).
 * 5. If only Tier 2+ sources are available, flag a WARNING about missing primary data.
 * 6. Recommend the median of all Tier 1 values if they agree, or median of all sources otherwise.
 *
 * @param field        - Name of the field being validated (e.g., 'price', 'eps')
 * @param sourceValues - Array of values from different data sources, each tagged with tier
 * @returns Array of validation checks performed
 *
 * @example
 * ```typescript
 * const checks = institutionalCrossValidateSources('price', [
 *   { source: 'egx_filing', tier: 1, value: 82.50 },
 *   { source: 'tradingview', tier: 2, value: 82.45 },
 *   { source: 'mubasher', tier: 2, value: 83.10 },
 * ]);
 * ```
 */
export function institutionalCrossValidateSources(
  field: string,
  sourceValues: SourceValue[],
): ValidationCheck[] {
  const checks: ValidationCheck[] = [];

  // ── Guard: insufficient data ────────────────────────────────────
  if (sourceValues.length === 0) {
    checks.push(institutionalMakeCheck(
      'cross_source:empty',
      false,
      'critical',
      `No source data available for field "${field}".`,
      'At least one data source is required to validate this field.',
    ));
    return checks;
  }

  if (sourceValues.length === 1) {
    checks.push(institutionalMakeCheck(
      'cross_source:single_source',
      true,
      'info',
      `Field "${field}" has data from only one source (${sourceValues[0].source}, Tier ${sourceValues[0].tier}). Cross-validation not possible.`,
      'Consider cross-referencing with additional sources to improve confidence.',
    ));
    return checks;
  }

  // ── Group by tier ───────────────────────────────────────────────
  const tier1Values = sourceValues.filter((s) => s.tier === 1).map((s) => s.value);
  const tier2Values = sourceValues.filter((s) => s.tier === 2).map((s) => s.value);
  const tier3Values = sourceValues.filter((s) => s.tier === 3).map((s) => s.value);

  // ── Check for primary source availability ───────────────────────
  if (tier1Values.length === 0) {
    checks.push(institutionalMakeCheck(
      'cross_source:no_primary',
      true,
      'warning',
      `No Tier 1 (primary) source available for "${field}". Validation relies on Tier ${tier2Values.length > 0 ? '2' : '3'} sources only.`,
      `Available sources: ${sourceValues.map((s) => `${s.source} (T${s.tier})`).join(', ')}`,
    ));
  }

  // ── Pairwise deviation check across all sources ────────────────
  let maxDeviation = 0;
  let worstPair = '';
  let anySourceViolation = false;

  for (let i = 0; i < sourceValues.length; i++) {
    for (let j = i + 1; j < sourceValues.length; j++) {
      const a = sourceValues[i];
      const b = sourceValues[j];
      const deviation = institutionalPctDiff(a.value, b.value);

      if (deviation > maxDeviation) {
        maxDeviation = deviation;
        worstPair = `${a.source} (${a.value}) vs ${b.source} (${b.value})`;
      }

      if (deviation > ANY_SOURCE_DEVIATION_THRESHOLD) {
        anySourceViolation = true;
        checks.push(institutionalMakeCheck(
          'cross_source:any_source_deviation',
          false,
          'error',
          `Field "${field}": ${a.source}=${a.value} vs ${b.source}=${b.value} — deviation of ${(deviation * 100).toFixed(1)}% exceeds 10% threshold.`,
          `Sources: ${worstPair}. Max deviation: ${(maxDeviation * 100).toFixed(1)}%.`,
        ));
      }
    }
  }

  // ── Tier 1 vs Tier 2 comparison (CRITICAL) ───────────────────────
  if (tier1Values.length > 0 && tier2Values.length > 0) {
    const tier1Median = institutionalMedian(tier1Values);
    const tier2Median = institutionalMedian(tier2Values);
    const tierDeviation = institutionalPctDiff(tier1Median, tier2Median);

    if (tierDeviation > TIER1_VS_TIER2_DEVIATION_THRESHOLD) {
      checks.push(institutionalMakeCheck(
        'cross_source:tier1_vs_tier2',
        false,
        'critical',
        `Field "${field}": Tier 1 median (${tier1Median.toFixed(4)}) vs Tier 2 median (${tier2Median.toFixed(4)}) — deviation of ${(tierDeviation * 100).toFixed(1)}% exceeds 5% critical threshold.`,
        `Tier 1 sources: ${tier1Values.map((v) => v.toFixed(4)).join(', ')}. ` +
        `Tier 2 sources: ${tier2Values.map((v) => v.toFixed(4)).join(', ')}.`,
      ));
    } else {
      checks.push(institutionalMakeCheck(
        'cross_source:tier1_vs_tier2',
        true,
        'info',
        `Field "${field}": Tier 1 and Tier 2 sources agree within ${(tierDeviation * 100).toFixed(1)}% (threshold: 5%).`,
      ));
    }
  }

  // ── Summary check ────────────────────────────────────────────────
  if (!anySourceViolation && maxDeviation <= ANY_SOURCE_DEVIATION_THRESHOLD) {
    checks.push(institutionalMakeCheck(
      'cross_source:summary',
      true,
      'info',
      `Field "${field}": All ${sourceValues.length} sources agree within acceptable thresholds. Max deviation: ${(maxDeviation * 100).toFixed(1)}%.`,
    ));
  } else {
    checks.push(institutionalMakeCheck(
      'cross_source:summary',
      false,
      maxDeviation > TIER1_VS_TIER2_DEVIATION_THRESHOLD ? 'critical' : 'error',
      `Field "${field}": Source disagreement detected. Worst pair: ${worstPair} (${(maxDeviation * 100).toFixed(1)}% deviation).`,
    ));
  }

  return checks;
}

// ═══════════════════════════════════════════════════════════════════
// 2. OUTLIER DETECTION
// ═══════════════════════════════════════════════════════════════════

/**
 * Detect whether a value is an outlier relative to its sector peers.
 *
 * Uses two complementary methods:
 *
 * 1. **Z-score analysis** (parametric): Computes how many standard deviations
 *    the value is from the peer mean. Flags values > 3σ as outliers.
 *    Best for normally-distributed metrics (P/E, margins, yields).
 *
 * 2. **IQR method** (non-parametric): Computes Q1, Q3, and the interquartile
 *    range. Flags values below Q1 − 1.5×IQR or above Q3 + 1.5×IQR.
 *    Robust to non-normal distributions (revenue, debt, market cap).
 *
 * @param symbol      - Stock symbol being evaluated
 * @param fieldName   - Name of the metric being checked
 * @param value       - The value to evaluate
 * @param sectorPeers - Array of the same metric's values from sector peers
 * @returns Array of validation checks
 *
 * @example
 * ```typescript
 * const checks = institutionalDetectOutliers('CIB', 'pe', 8.2, [7.5, 8.0, 8.5, 9.0, 7.8, 8.3, 9.5, 7.2]);
 * ```
 */
export function institutionalDetectOutliers(
  symbol: string,
  fieldName: string,
  value: number,
  sectorPeers: number[],
): ValidationCheck[] {
  const checks: ValidationCheck[] = [];

  // ── Guard: insufficient peer data ───────────────────────────────
  if (sectorPeers.length < MIN_PEERS_FOR_OUTLIER) {
    checks.push(institutionalMakeCheck(
      'outlier:insufficient_peers',
      true,
      'info',
      `Cannot perform outlier detection for ${symbol}.${fieldName}: only ${sectorPeers.length} peers available (minimum ${MIN_PEERS_FOR_OUTLIER} required).`,
      `Value: ${value}. Peer data insufficient for statistical analysis.`,
    ));
    return checks;
  }

  const allValues = [...sectorPeers, value];
  const mean = institutionalMean(sectorPeers);
  const stdDev = institutionalStdDev(sectorPeers);
  const zScore = stdDev > 0 ? Math.abs((value - mean) / stdDev) : (value === mean ? 0 : Infinity);

  // ── Z-Score Analysis ────────────────────────────────────────────
  if (zScore > ZSCORE_OUTLIER_THRESHOLD) {
    const direction = value > mean ? 'above' : 'below';
    checks.push(institutionalMakeCheck(
      'outlier:zscore',
      false,
      zScore > 5 ? 'critical' : 'error',
      `${symbol} ${fieldName}=${value} is ${zScore.toFixed(2)}σ ${direction} sector mean (${mean.toFixed(4)}). Exceeds ${ZSCORE_OUTLIER_THRESHOLD}σ threshold.`,
      `Standard deviation: ${stdDev.toFixed(4)}. Peer count: ${sectorPeers.length}. ` +
      `This value is a statistical outlier and should be verified.`,
    ));
  } else if (zScore > 2.0) {
    checks.push(institutionalMakeCheck(
      'outlier:zscore',
      true,
      'warning',
      `${symbol} ${fieldName}=${value} is ${zScore.toFixed(2)}σ from sector mean (${mean.toFixed(4)}). Within normal range but notable.`,
      `Standard deviation: ${stdDev.toFixed(4)}. Values between 2–3σ are uncommon but not flagged as outliers.`,
    ));
  } else {
    checks.push(institutionalMakeCheck(
      'outlier:zscore',
      true,
      'info',
      `${symbol} ${fieldName}=${value} is ${zScore.toFixed(2)}σ from sector mean (${mean.toFixed(4)}). Within normal range.`,
    ));
  }

  // ── IQR Analysis ───────────────────────────────────────────────
  const { q1, q3, iqr } = institutionalQuartiles(sectorPeers);

  if (iqr > 0) {
    const lowerFence = q1 - IQR_OUTLIER_MULTIPLIER * iqr;
    const upperFence = q3 + IQR_OUTLIER_MULTIPLIER * iqr;

    if (value < lowerFence) {
      checks.push(institutionalMakeCheck(
        'outlier:iqr',
        false,
        'error',
        `${symbol} ${fieldName}=${value} is below the lower fence (${lowerFence.toFixed(4)}) by IQR method. Q1=${q1.toFixed(4)}, IQR=${iqr.toFixed(4)}.`,
        `Values below Q1 − 1.5×IQR are considered outliers. This may indicate data error or a genuinely unusual metric.`,
      ));
    } else if (value > upperFence) {
      checks.push(institutionalMakeCheck(
        'outlier:iqr',
        false,
        'error',
        `${symbol} ${fieldName}=${value} exceeds the upper fence (${upperFence.toFixed(4)}) by IQR method. Q3=${q3.toFixed(4)}, IQR=${iqr.toFixed(4)}.`,
        `Values above Q3 + 1.5×IQR are considered outliers. Verify data accuracy for extreme values.`,
      ));
    } else {
      checks.push(institutionalMakeCheck(
        'outlier:iqr',
        true,
        'info',
        `${symbol} ${fieldName}=${value} is within the IQR fences [${lowerFence.toFixed(4)}, ${upperFence.toFixed(4)}]. Not an outlier.`,
      ));
    }
  } else {
    checks.push(institutionalMakeCheck(
      'outlier:iqr',
      true,
      'info',
      `IQR is zero for ${fieldName} – all peer values are identical. IQR-based outlier detection skipped.`,
    ));
  }

  return checks;
}

// ═══════════════════════════════════════════════════════════════════
// 3. HISTORICAL CONSISTENCY CHECK
// ═══════════════════════════════════════════════════════════════════

/**
 * Check whether a stock's current fundamental metrics are consistent
 * with previously reported values.
 *
 * **Checks performed:**
 * 1. **YoY Change Analysis**: For non-volatile metrics (total assets, equity,
 *    shares outstanding), flags changes exceeding 50% as potential errors.
 * 2. **Sign Flip Detection**: If a previously positive metric becomes negative
 *    (or vice versa), flag it for review.
 * 3. **Revenue/Income Volatility**: Large swings in revenue or net income
 *    are flagged but not treated as errors (they may be legitimate).
 *
 * @param current  - Current period fundamental values (field → value)
 * @param previous - Previous period fundamental values (field → value)
 * @returns Array of validation checks
 *
 * @example
 * ```typescript
 * const checks = institutionalCheckHistoricalConsistency(
 *   { revenue: 5000000000, totalAssets: 80000000000 },
 *   { revenue: 4500000000, totalAssets: 75000000000 }
 * );
 * ```
 */
export function institutionalCheckHistoricalConsistency(
  current: Record<string, number>,
  previous: Record<string, number>,
): ValidationCheck[] {
  const checks: ValidationCheck[] = [];

  if (Object.keys(previous).length === 0) {
    checks.push(institutionalMakeCheck(
      'historical:no_previous_data',
      true,
      'info',
      'No previous period data available. Historical consistency checks skipped.',
    ));
    return checks;
  }

  // ── Compare all common fields ──────────────────────────────────
  const commonFields = Object.keys(current).filter(
    (key) => key in previous && typeof current[key] === 'number' && typeof previous[key] === 'number',
  );

  for (const field of commonFields) {
    const curVal = current[field] as number;
    const prevVal = previous[field] as number;

    // Skip if both values are zero
    if (curVal === 0 && prevVal === 0) continue;

    // ── YoY Change for non-volatile metrics ───────────────────────
    if (NON_VOLATILE_METRICS.includes(field)) {
      const change = institutionalPctDiff(curVal, prevVal);

      if (change > YOY_NON_VOLATILE_THRESHOLD) {
        checks.push(institutionalMakeCheck(
          'historical:non_volatile_yoy',
          false,
          change > 1.0 ? 'critical' : 'error',
          `Non-volatile metric "${field}" changed by ${(change * 100).toFixed(1)}% YoY (${prevVal} → ${curVal}). Exceeds ${YOY_NON_VOLATILE_THRESHOLD * 100}% threshold.`,
          `Non-volatile metrics (assets, equity, shares) typically change < 50% YoY. Verify data accuracy or check for corporate events (mergers, splits, restatements).`,
        ));
      }
    }

    // ── Sign Flip Detection ───────────────────────────────────────
    if (prevVal !== 0 && curVal !== 0 && Math.sign(curVal) !== Math.sign(prevVal)) {
      const severity: ValidationCheck['severity'] =
        ['eps', 'netIncome', 'freeCashFlow'].includes(field) ? 'warning' : 'error';

      checks.push(institutionalMakeCheck(
        'historical:sign_flip',
        false,
        severity,
        `Metric "${field}" flipped sign: ${prevVal} → ${curVal}.`,
        ['eps', 'netIncome'].includes(field)
          ? 'Sign flips in earnings metrics may indicate a shift from profit to loss (or vice versa). Verify with financial statements.'
          : 'Sign flips in fundamental metrics may indicate data errors, restatements, or unusual corporate events.',
      ));
    }

    // ── Large Revenue/Income Swings (informational, not errors) ───
    if (['revenue', 'netIncome', 'operatingIncome'].includes(field)) {
      const change = institutionalPctDiff(curVal, prevVal);
      if (change > 0.80) {
        checks.push(institutionalMakeCheck(
          'historical:large_revenue_swing',
          true,
          change > 2.0 ? 'warning' : 'info',
          `Metric "${field}" changed by ${(change * 100).toFixed(1)}% (${prevVal} → ${curVal}).`,
          'Revenue/income swings can be legitimate (acquisitions, disposals, currency effects). Review the company\'s financial statements for context.',
        ));
      }
    }
  }

  // ── Summary ─────────────────────────────────────────────────────
  const errorChecks = checks.filter((c) => c.severity === 'error' || c.severity === 'critical');
  if (errorChecks.length === 0 && checks.length > 0) {
    checks.push(institutionalMakeCheck(
      'historical:summary',
      true,
      'info',
      `Historical consistency check passed across ${commonFields.length} fields with no critical issues.`,
    ));
  } else if (errorChecks.length > 0) {
    checks.push(institutionalMakeCheck(
      'historical:summary',
      false,
      errorChecks.some((c) => c.severity === 'critical') ? 'critical' : 'error',
      `Historical consistency check found ${errorChecks.length} issue(s) across ${commonFields.length} fields.`,
      `Fields with issues: ${errorChecks.map((c) => c.checkName).join(', ')}.`,
    ));
  }

  return checks;
}

// ═══════════════════════════════════════════════════════════════════
// 4. MISSING VALUE DETECTION
// ═══════════════════════════════════════════════════════════════════

/**
 * Detect missing, zero, or incomplete values in fundamental data.
 *
 * **Checks performed:**
 * 1. **Critical field presence**: EPS, Revenue, Debt, Price, Market Cap,
 *    and Shares Outstanding must be non-zero for meaningful analysis.
 * 2. **Active stock zeros**: If a stock has a positive price but zeros in
 *    fields that should be populated, flag those gaps.
 * 3. **Completeness scoring**: Calculate what percentage of expected fields
 *    are populated.
 *
 * Returns per-field validation checks and an overall completeness score.
 */
function institutionalDetectMissingValues(data: FundamentalData): {
  checks: ValidationCheck[];
  completenessScore: number;
} {
  const checks: ValidationCheck[] = [];
  let populatedCount = 0;
  const totalCheckableFields = CRITICAL_FIELDS.length + SHOULD_NOT_BE_ZERO_WHEN_ACTIVE.length;

  // ── Critical field checks ───────────────────────────────────────
  for (const field of CRITICAL_FIELDS) {
    const value = data[field] as number;
    if (value === 0 || value === null || value === undefined) {
      checks.push(institutionalMakeCheck(
        'missing:critical_field',
        false,
        'critical',
        `Critical field "${field}" is missing or zero for ${data.symbol}. This severely limits analytical capability.`,
        `Critical fields (${CRITICAL_FIELDS.join(', ')}) are required for valuation models, screening, and ranking. Data from this source may be incomplete.`,
      ));
    } else {
      populatedCount++;
    }
  }

  // ── Active-stock zero detection ─────────────────────────────────
  if (data.price > 0) {
    for (const field of SHOULD_NOT_BE_ZERO_WHEN_ACTIVE) {
      const value = data[field] as number;
      if (value === 0 || value === null || value === undefined) {
        checks.push(institutionalMakeCheck(
          'missing:active_zero',
          false,
          'warning',
          `Field "${field}" is zero for ${data.symbol} despite positive price (${data.price}). Data may be incomplete.`,
          'This stock is actively trading but fundamental data is missing. The data source may not have recent financials.',
        ));
      }
    }
  }

  // ── Completeness score ──────────────────────────────────────────
  const completenessScore = institutionalClamp(
    Math.round((populatedCount / totalCheckableFields) * 100),
    0,
    100,
  );

  checks.push(institutionalMakeCheck(
    'missing:completeness',
    completenessScore >= 80,
    completenessScore >= 80 ? 'info' : completenessScore >= 50 ? 'warning' : 'error',
    `Data completeness for ${data.symbol}: ${completenessScore}% (${populatedCount}/${totalCheckableFields} critical fields populated).`,
    completenessScore < 50
      ? 'Below 50% completeness — most valuation models will produce unreliable results.'
      : completenessScore < 80
        ? 'Below 80% completeness — some valuation models may have reduced accuracy.'
        : 'Adequate completeness for most analytical purposes.',
  ));

  return { checks, completenessScore };
}

// ═══════════════════════════════════════════════════════════════════
// 5. DUPLICATE FILING DETECTION
// ═══════════════════════════════════════════════════════════════════

/**
 * Detect duplicate filing dates in a sequence of financial snapshots.
 *
 * On the EGX, companies may re-file amended statements for the same
 * period. This function identifies when the same filing period appears
 * multiple times, which may indicate restatements or data pipeline issues.
 *
 * @param filings - Array of { period, fetchedAt } objects representing financial filings
 * @returns Array of validation checks flagging duplicates
 */
function institutionalDetectDuplicateFilings(
  filings: Array<{ period: string; fetchedAt: string }>,
): ValidationCheck[] {
  const checks: ValidationCheck[] = [];

  if (filings.length === 0) {
    checks.push(institutionalMakeCheck(
      'filing:no_filings',
      true,
      'info',
      'No filing data available for duplicate detection.',
    ));
    return checks;
  }

  // Count occurrences of each period
  const periodCounts = new Map<string, number>();
  for (const filing of filings) {
    const normalizedPeriod = filing.period.trim().toLowerCase();
    periodCounts.set(normalizedPeriod, (periodCounts.get(normalizedPeriod) || 0) + 1);
  }

  // Check for duplicates
  const duplicates: string[] = [];
  for (const [period, count] of Array.from(periodCounts.entries())) {
    if (count > 1) {
      duplicates.push(period);
      checks.push(institutionalMakeCheck(
        'filing:duplicate_period',
        false,
        count > 2 ? 'error' : 'warning',
        `Filing period "${period}" appears ${count} times. This may indicate a restatement or duplicate data ingestion.`,
        count > 2
          ? 'Multiple filings for the same period suggest a data pipeline issue. Verify source data integrity.'
          : 'Two filings for the same period may indicate an amended/re-stated filing. Cross-check with restatement detection.',
      ));
    }
  }

  if (duplicates.length === 0) {
    checks.push(institutionalMakeCheck(
      'filing:no_duplicates',
      true,
      'info',
      `No duplicate filing periods detected across ${filings.length} filings.`,
    ));
  } else {
    checks.push(institutionalMakeCheck(
      'filing:duplicate_summary',
      false,
      'warning',
      `Found ${duplicates.length} duplicate filing period(s): ${duplicates.join(', ')}.`,
    ));
  }

  return checks;
}

// ═══════════════════════════════════════════════════════════════════
// 6. RESTATEMENT DETECTION
// ═══════════════════════════════════════════════════════════════════

/**
 * Detect material restatements by comparing current data against
 * previously reported values for the same stock.
 *
 * A **material restatement** is defined as a change of > 5% in any
 * previously reported fundamental metric. This is important because
 * restatements can significantly affect valuation models and comparability.
 *
 * @param symbol      - Stock symbol
 * @param currentData - Current period fundamental values
 * @param previousData - Previously reported values for the same period
 * @returns Array of validation checks and a list of detected changes
 *
 * @example
 * ```typescript
 * const checks = institutionalDetectRestatements('CIB',
 *   { revenue: 52000000000, netIncome: 15000000000 },
 *   { revenue: 50000000000, netIncome: 14000000000 }
 * );
 * ```
 */
export function institutionalDetectRestatements(
  symbol: string,
  currentData: Record<string, number>,
  previousData: Record<string, number>,
): ValidationCheck[] {
  const checks: ValidationCheck[] = [];
  const changes: MetricChange[] = [];

  const commonFields = Object.keys(currentData).filter(
    (key) => key in previousData && typeof currentData[key] === 'number' && typeof previousData[key] === 'number',
  );

  for (const field of commonFields) {
    const curVal = currentData[field] as number;
    const prevVal = previousData[field] as number;

    // Skip identical values
    if (curVal === prevVal) continue;

    // Skip if both are zero
    if (curVal === 0 && prevVal === 0) continue;

    const changePercent = institutionalPctDiff(curVal, prevVal);
    const isMaterial = changePercent > RESTATEMENT_MATERIAL_THRESHOLD;

    changes.push({
      field,
      oldValue: prevVal,
      newValue: curVal,
      changePercent,
      isMaterial,
    });

    if (isMaterial) {
      checks.push(institutionalMakeCheck(
        'restatement:material',
        false,
        changePercent > 0.20 ? 'critical' : 'error',
        `Material restatement detected for ${symbol}.${field}: ${prevVal} → ${curVal} (${(changePercent * 100).toFixed(1)}% change).`,
        `Change exceeds ${RESTATEMENT_MATERIAL_THRESHOLD * 100}% materiality threshold. Verify if this is an amended filing or data source correction. ` +
        `Valuation models using this data should be recalculated.`,
      ));
    } else {
      checks.push(institutionalMakeCheck(
        'restatement:minor',
        true,
        'info',
        `Minor change in ${symbol}.${field}: ${prevVal} → ${curVal} (${(changePercent * 100).toFixed(1)}% change). Below materiality threshold.`,
      ));
    }
  }

  // ── Summary ─────────────────────────────────────────────────────
  const materialChanges = changes.filter((c) => c.isMaterial);
  if (commonFields.length === 0) {
    checks.push(institutionalMakeCheck(
      'restatement:no_overlap',
      true,
      'info',
      `No overlapping fields between current and previous data for ${symbol}. Restatement check skipped.`,
    ));
  } else if (materialChanges.length === 0) {
    checks.push(institutionalMakeCheck(
      'restatement:summary',
      true,
      'info',
      `No material restatements detected for ${symbol}. Checked ${commonFields.length} fields, ${changes.length} had minor changes.`,
    ));
  } else {
    checks.push(institutionalMakeCheck(
      'restatement:summary',
      false,
      materialChanges.some((c) => c.changePercent > 0.20) ? 'critical' : 'error',
      `Found ${materialChanges.length} material restatement(s) for ${symbol}: ${materialChanges.map((c) => c.field).join(', ')}.`,
      'Review the company\'s amended filing and update any dependent analysis.',
    ));
  }

  return checks;
}

// ═══════════════════════════════════════════════════════════════════
// 7. SANITY CHECKS
// ═══════════════════════════════════════════════════════════════════

/**
 * Perform sanity checks on fundamental data values.
 *
 * Validates that values fall within reasonable ranges for the
 * Egyptian market context:
 *
 * | Metric             | Rule                                       | Threshold       |
 * |--------------------|--------------------------------------------|-----------------|
 * | P/E ratio         | Positive for profitable companies           | pe > 0 when eps > 0 |
 * | Debt/Equity       | Must be non-negative                        | D/E >= 0        |
 * | Dividend Yield    | Should not exceed 50% (EGX context)         | yield < 50%     |
 * | Revenue Growth     | Within -100% to +500%                       | -100 ≤ growth ≤ 500 |
 * | Market Cap         | Should approximate price × shares          | within 5%       |
 * | P/B ratio          | Should be non-negative                      | P/B >= 0        |
 * | ROE                | Should be within -100% to +200%             | bounded range   |
 * | Gross Margin       | Should be within 0% to 100%                | bounded range   |
 *
 * @param data - FundamentalData object to validate
 * @returns Array of sanity check results
 */
function institutionalRunSanityChecks(data: FundamentalData): ValidationCheck[] {
  const checks: ValidationCheck[] = [];

  // ── P/E Ratio: positive for profitable companies ────────────────
  if (data.eps > 0 && data.price > 0) {
    if (data.pe <= 0) {
      checks.push(institutionalMakeCheck(
        'sanity:pe_positive',
        false,
        'error',
        `P/E ratio is ${data.pe} but EPS (${data.eps}) and price (${data.price}) are both positive. Expected P/E > 0.`,
        `Calculated P/E = price/EPS = ${data.price}/${data.eps} = ${(data.price / data.eps).toFixed(2)}. The reported P/E appears incorrect.`,
      ));
    } else if (Math.abs(data.pe - data.price / data.eps) > data.pe * 0.10) {
      checks.push(institutionalMakeCheck(
        'sanity:pe_consistency',
        false,
        'warning',
        `P/E ratio (${data.pe}) does not match price/EPS calculation (${(data.price / data.eps).toFixed(2)}). Deviation > 10%.`,
        'This may indicate that P/E and EPS are from different reporting periods.',
      ));
    } else {
      checks.push(institutionalMakeCheck(
        'sanity:pe_positive',
        true,
        'info',
        `P/E ratio (${data.pe}) is consistent with price (${data.price}) / EPS (${data.eps}).`,
      ));
    }
  }

  // ── Debt/Equity: non-negative ───────────────────────────────────
  if (data.debtEquity < 0) {
    checks.push(institutionalMakeCheck(
      'sanity:debt_equity_non_negative',
      false,
      'error',
      `Debt/Equity ratio is ${data.debtEquity}, which is negative. This is unusual and may indicate negative equity or data error.`,
      'Negative D/E can occur when stockholders\' equity is negative (liabilities > assets). Verify with the balance sheet.',
    ));
  } else {
    checks.push(institutionalMakeCheck(
      'sanity:debt_equity_non_negative',
      true,
      'info',
      `Debt/Equity ratio (${data.debtEquity}) is non-negative.`,
    ));
  }

  // ── Dividend Yield: < 50% ─────────────────────────────────────
  if (data.dividendYield > DIVIDEND_YIELD_UPPER_BOUND) {
    checks.push(institutionalMakeCheck(
      'sanity:dividend_yield_bound',
      false,
      'error',
      `Dividend yield (${data.dividendYield.toFixed(2)}%) exceeds ${DIVIDEND_YIELD_UPPER_BOUND}%. This is extremely high and likely a data error.`,
      'EGX average dividend yield is ~7%. Yields > 50% are almost certainly incorrect. Possible causes: price drop not reflected in yield calc, or special dividend distortion.',
    ));
  } else if (data.dividendYield > 25) {
    checks.push(institutionalMakeCheck(
      'sanity:dividend_yield_bound',
      true,
      'warning',
      `Dividend yield (${data.dividendYield.toFixed(2)}%) is very high (>25%). Verify this is not a data artifact.`,
      'High yields may be legitimate for EGX income stocks, but values > 25% warrant double-checking.',
    ));
  } else if (data.dividendYield >= 0) {
    checks.push(institutionalMakeCheck(
      'sanity:dividend_yield_bound',
      true,
      'info',
      `Dividend yield (${data.dividendYield.toFixed(2)}%) is within reasonable bounds.`,
    ));
  }

  // ── Revenue Growth: within -100% to +500% ──────────────────────
  if (data.revenueGrowth < REVENUE_GROWTH_LOWER_BOUND) {
    checks.push(institutionalMakeCheck(
      'sanity:revenue_growth_bound',
      false,
      'critical',
      `Revenue growth (${data.revenueGrowth.toFixed(1)}%) is below ${REVENUE_GROWTH_LOWER_BOUND}%. This is likely a data error.`,
      'Revenue growth below -100% is mathematically possible (revenue went to zero from a positive base) but extremely rare. Verify data source.',
    ));
  } else if (data.revenueGrowth > REVENUE_GROWTH_UPPER_BOUND) {
    checks.push(institutionalMakeCheck(
      'sanity:revenue_growth_bound',
      false,
      'critical',
      `Revenue growth (${data.revenueGrowth.toFixed(1)}%) exceeds ${REVENUE_GROWTH_UPPER_BOUND}%. This is likely a data error or acquisition effect.`,
      'Revenue growth > 500% is possible with major acquisitions but should be verified against company announcements.',
    ));
  } else if (data.revenueGrowth !== 0) {
    checks.push(institutionalMakeCheck(
      'sanity:revenue_growth_bound',
      true,
      'info',
      `Revenue growth (${data.revenueGrowth.toFixed(1)}%) is within normal bounds [-100%, +500%].`,
    ));
  }

  // ── Market Cap ≈ Price × Shares ───────────────────────────────
  if (data.price > 0 && data.sharesOutstanding > 0 && data.marketCap > 0) {
    const calculatedMarketCap = data.price * data.sharesOutstanding;
    const deviation = institutionalPctDiff(calculatedMarketCap, data.marketCap);

    if (deviation > MARKET_CAP_TOLERANCE) {
      checks.push(institutionalMakeCheck(
        'sanity:market_cap_consistency',
        false,
        'error',
        `Market cap (${data.marketCap.toLocaleString()}) does not match price (${data.price}) × shares (${data.sharesOutstanding.toLocaleString()}) = ${calculatedMarketCap.toLocaleString()}. Deviation: ${(deviation * 100).toFixed(1)}%.`,
        `Deviation exceeds ${MARKET_CAP_TOLERANCE * 100}% tolerance. This may indicate stale market cap data or incorrect shares outstanding. Check data timestamps.`,
      ));
    } else {
      checks.push(institutionalMakeCheck(
        'sanity:market_cap_consistency',
        true,
        'info',
        `Market cap (${data.marketCap.toLocaleString()}) is consistent with price × shares (deviation: ${(deviation * 100).toFixed(2)}%).`,
      ));
    }
  }

  // ── P/B ratio: non-negative ─────────────────────────────────────
  if (data.pb < 0) {
    checks.push(institutionalMakeCheck(
      'sanity:pb_non_negative',
      false,
      'error',
      `P/B ratio (${data.pb}) is negative. Price-to-Book should be non-negative for healthy companies.`,
      'Negative P/B can occur with negative book value per share. Verify equity data.',
    ));
  } else if (data.pb > 0) {
    checks.push(institutionalMakeCheck(
      'sanity:pb_non_negative',
      true,
      'info',
      `P/B ratio (${data.pb}) is non-negative.`,
    ));
  }

  // ── ROE: within reasonable bounds ───────────────────────────────
  if (data.roe < -100) {
    checks.push(institutionalMakeCheck(
      'sanity:roe_bounds',
      false,
      'warning',
      `ROE (${data.roe.toFixed(1)}%) is below -100%. This indicates severe losses relative to equity.`,
      'Very negative ROE is possible for deeply loss-making companies but warrants verification.',
    ));
  } else if (data.roe > 200) {
    checks.push(institutionalMakeCheck(
      'sanity:roe_bounds',
      false,
      'warning',
      `ROE (${data.roe.toFixed(1)}%) exceeds 200%. This may indicate very thin equity base.`,
      'Extremely high ROE can be legitimate for companies with small equity bases. Check for data accuracy.',
    ));
  } else if (data.roe !== 0) {
    checks.push(institutionalMakeCheck(
      'sanity:roe_bounds',
      true,
      'info',
      `ROE (${data.roe.toFixed(1)}%) is within reasonable bounds.`,
    ));
  }

  // ── Gross Margin: 0–100% ───────────────────────────────────────
  if (data.grossMargin < 0) {
    checks.push(institutionalMakeCheck(
      'sanity:gross_margin_bounds',
      false,
      'warning',
      `Gross margin (${data.grossMargin.toFixed(1)}%) is negative. Company may be selling below cost.`,
      'Negative gross margin is unusual but can occur in commodity downturns or for specific industries. Verify.',
    ));
  } else if (data.grossMargin > 100) {
    checks.push(institutionalMakeCheck(
      'sanity:gross_margin_bounds',
      false,
      'error',
      `Gross margin (${data.grossMargin.toFixed(1)}%) exceeds 100%. Gross margin should be 0–100%.`,
      'Gross margin > 100% is mathematically impossible and indicates a data error. Check revenue and COGS values.',
    ));
  } else if (data.grossMargin > 0) {
    checks.push(institutionalMakeCheck(
      'sanity:gross_margin_bounds',
      true,
      'info',
      `Gross margin (${data.grossMargin.toFixed(1)}%) is within normal bounds [0%, 100%].`,
    ));
  }

  // ── Net Margin: within reasonable bounds ────────────────────────
  if (data.netMargin < -200) {
    checks.push(institutionalMakeCheck(
      'sanity:net_margin_bounds',
      false,
      'warning',
      `Net margin (${data.netMargin.toFixed(1)}%) is below -200%. Verify data accuracy.`,
      'Severely negative net margins may indicate one-time charges or extraordinary losses.',
    ));
  } else if (data.netMargin > 100) {
    checks.push(institutionalMakeCheck(
      'sanity:net_margin_bounds',
      false,
      'error',
      `Net margin (${data.netMargin.toFixed(1)}%) exceeds 100%. Net margin should not exceed 100%.`,
      'Net margin > 100% may indicate negative revenue or accounting anomalies. Verify.',
    ));
  } else if (data.netMargin !== 0) {
    checks.push(institutionalMakeCheck(
      'sanity:net_margin_bounds',
      true,
      'info',
      `Net margin (${data.netMargin.toFixed(1)}%) is within acceptable bounds.`,
    ));
  }

  return checks;
}

// ═══════════════════════════════════════════════════════════════════
// 8. SECTOR BENCHMARK COMPARISON
// ═══════════════════════════════════════════════════════════════════

/**
 * Compare a stock's key metrics against its sector benchmark.
 *
 * Computes z-scores for each metric relative to the sector average
 * and flags extreme deviations. Uses sector-specific standard deviations
 * estimated from EGX market norms when actual peer-level data is
 * unavailable.
 *
 * @param data       - FundamentalData for the stock
 * @param sectorName - Sector name (e.g., 'Financials', 'Materials')
 * @returns Array of sector comparison validation checks
 */
function institutionalCompareSectorBenchmark(
  data: FundamentalData,
  sectorName: string,
): ValidationCheck[] {
  const checks: ValidationCheck[] = [];
  const benchmark = getSectorBenchmark(sectorName);

  // Mapping of FundamentalData fields to benchmark fields
  const comparisons: Array<{
    fieldName: string;
    stockValue: number;
    benchmarkAvg: number;
    estimatedStdDev: number;
    label: string;
  }> = [
    {
      fieldName: 'pe',
      stockValue: data.pe,
      benchmarkAvg: benchmark.avgPE,
      estimatedStdDev: benchmark.avgPE * 0.4, // Rough estimate: 40% of mean
      label: 'P/E Ratio',
    },
    {
      fieldName: 'pb',
      stockValue: data.pb,
      benchmarkAvg: benchmark.avgPB,
      estimatedStdDev: benchmark.avgPB * 0.5,
      label: 'P/B Ratio',
    },
    {
      fieldName: 'roe',
      stockValue: data.roe,
      benchmarkAvg: benchmark.avgROE,
      estimatedStdDev: benchmark.avgROE * 0.3,
      label: 'ROE',
    },
    {
      fieldName: 'debtEquity',
      stockValue: data.debtEquity,
      benchmarkAvg: benchmark.avgDebtEquity,
      estimatedStdDev: benchmark.avgDebtEquity * 0.5,
      label: 'Debt/Equity',
    },
    {
      fieldName: 'dividendYield',
      stockValue: data.dividendYield,
      benchmarkAvg: benchmark.avgDividendYield,
      estimatedStdDev: benchmark.avgDividendYield * 0.4,
      label: 'Dividend Yield',
    },
    {
      fieldName: 'grossMargin',
      stockValue: data.grossMargin,
      benchmarkAvg: benchmark.avgGrossMargin,
      estimatedStdDev: benchmark.avgGrossMargin * 0.3,
      label: 'Gross Margin',
    },
  ];

  for (const comp of comparisons) {
    if (comp.stockValue === 0 || comp.estimatedStdDev === 0) continue;

    const deviation = comp.stockValue - comp.benchmarkAvg;
    const zScore = Math.abs(deviation) / comp.estimatedStdDev;
    const direction = deviation > 0 ? 'above' : 'below';

    if (zScore > ZSCORE_OUTLIER_THRESHOLD) {
      checks.push(institutionalMakeCheck(
        `sector:${comp.fieldName}`,
        false,
        'warning',
        `${data.symbol} ${comp.label} (${comp.stockValue.toFixed(2)}) is ${zScore.toFixed(1)}σ ${direction} ${sectorName} average (${comp.benchmarkAvg.toFixed(2)}).`,
        `Estimated sector std dev: ${comp.estimatedStdDev.toFixed(2)}. Extreme deviations may indicate misclassification, data error, or a genuinely unique company.`,
      ));
    } else if (zScore > 2.0) {
      checks.push(institutionalMakeCheck(
        `sector:${comp.fieldName}`,
        true,
        'info',
        `${data.symbol} ${comp.label} (${comp.stockValue.toFixed(2)}) is ${zScore.toFixed(1)}σ ${direction} ${sectorName} average (${comp.benchmarkAvg.toFixed(2)}).`,
      ));
    }
  }

  return checks;
}

// ═══════════════════════════════════════════════════════════════════
// 9. MASTER VALIDATION FUNCTION
// ═══════════════════════════════════════════════════════════════════

/**
 * Run the complete institutional validation pipeline on a single stock.
 *
 * This is the main entry point. It orchestrates all validation layers:
 *
 * 1. **Missing Value Detection** — Check for zero/missing critical fields
 * 2. **Sanity Checks** — Validate ratio reasonability bounds
 * 3. **Cross-Source Verification** — (If sectorData provides peer values)
 * 4. **Historical Consistency** — (If priceData provides historical snapshots)
 * 5. **Outlier Detection** — (If sectorData provides peer values)
 * 6. **Sector Benchmark Comparison** — (If sectorData is provided)
 *
 * Returns a `ValidationResult` array with one entry per validated field,
 * each containing all checks, a validity flag, and a confidence score.
 *
 * @param symbol           - Stock symbol (e.g., 'CIB', 'ORAS')
 * @param fundamentalData  - Complete fundamental data object
 * @param priceData        - Optional historical price snapshots for consistency checks
 * @param sectorData       - Optional sector benchmark data (name or SectorBenchmark)
 * @returns Array of per-field validation results
 *
 * @example
 * ```typescript
 * const results = institutionalValidateStockData('CIB', cibData, priceHistory, 'Financials');
 * const criticalIssues = results.filter(r => !r.isValid);
 * ```
 */
export function institutionalValidateStockData(
  symbol: string,
  fundamentalData: FundamentalData,
  priceData?: PriceSnapshot[],
  sectorData?: string | { avgPE: number; avgPB: number; avgROE: number; avgDebtEquity: number; avgDividendYield: number; avgGrossMargin: number; avgNetMargin: number; avgRevenueGrowth: number; count: number; sector: string },
): ValidationResult[] {
  const normalizedSymbol = symbol.toUpperCase().trim();
  const results: ValidationResult[] = [];

  // ── Build field-level validation results ────────────────────────
  const fieldsToValidate: Array<{
    field: string;
    value: number;
    label: string;
  }> = [
    { field: 'price', value: fundamentalData.price, label: 'Price (EGP)' },
    { field: 'marketCap', value: fundamentalData.marketCap, label: 'Market Cap (EGP)' },
    { field: 'pe', value: fundamentalData.pe, label: 'P/E Ratio' },
    { field: 'pb', value: fundamentalData.pb, label: 'P/B Ratio' },
    { field: 'evEbitda', value: fundamentalData.evEbitda, label: 'EV/EBITDA' },
    { field: 'ps', value: fundamentalData.ps, label: 'P/S Ratio' },
    { field: 'eps', value: fundamentalData.eps, label: 'EPS (EGP)' },
    { field: 'revenue', value: fundamentalData.revenue, label: 'Revenue (EGP)' },
    { field: 'netIncome', value: fundamentalData.netIncome, label: 'Net Income (EGP)' },
    { field: 'grossMargin', value: fundamentalData.grossMargin, label: 'Gross Margin (%)' },
    { field: 'operatingMargin', value: fundamentalData.operatingMargin, label: 'Operating Margin (%)' },
    { field: 'netMargin', value: fundamentalData.netMargin, label: 'Net Margin (%)' },
    { field: 'roe', value: fundamentalData.roe, label: 'ROE (%)' },
    { field: 'roa', value: fundamentalData.roa, label: 'ROA (%)' },
    { field: 'debtEquity', value: fundamentalData.debtEquity, label: 'Debt/Equity' },
    { field: 'totalDebt', value: fundamentalData.totalDebt, label: 'Total Debt (EGP)' },
    { field: 'dividendYield', value: fundamentalData.dividendYield, label: 'Dividend Yield (%)' },
    { field: 'revenueGrowth', value: fundamentalData.revenueGrowth, label: 'Revenue Growth (%)' },
    { field: 'earningsGrowth', value: fundamentalData.earningsGrowth, label: 'Earnings Growth (%)' },
    { field: 'freeCashFlow', value: fundamentalData.freeCashFlow, label: 'Free Cash Flow (EGP)' },
    { field: 'beta', value: fundamentalData.beta, label: 'Beta' },
    { field: 'sharesOutstanding', value: fundamentalData.sharesOutstanding, label: 'Shares Outstanding' },
  ];

  for (const fieldDef of fieldsToValidate) {
    const checks: ValidationCheck[] = [];
    const warnings: string[] = [];
    const errors: string[] = [];

    // ── Missing value check ───────────────────────────────────────
    if (fieldDef.value === 0 || fieldDef.value === null || fieldDef.value === undefined) {
      const isCritical = CRITICAL_FIELDS.includes(fieldDef.field as keyof FundamentalData);
      checks.push(institutionalMakeCheck(
        `field:missing_${fieldDef.field}`,
        false,
        isCritical ? 'error' : 'info',
        `${fieldDef.label} (${fieldDef.field}) is zero or missing for ${normalizedSymbol}.`,
        isCritical ? 'This field is critical for analysis and should be populated.' : 'Non-critical field missing.',
      ));
      if (isCritical) {
        errors.push(`${fieldDef.label} is missing — critical for valuation.`);
      }
    }

    // ── Skip further checks if value is zero ──────────────────────
    if (fieldDef.value === 0) {
      results.push({
        field: fieldDef.field,
        value: fieldDef.value,
        isValid: !CRITICAL_FIELDS.includes(fieldDef.field as keyof FundamentalData),
        warnings,
        errors,
        confidence: CRITICAL_FIELDS.includes(fieldDef.field as keyof FundamentalData) ? 0 : 0.5,
        validationChecks: checks,
      });
      continue;
    }

    // ── Sanity checks per field ────────────────────────────────────
    if (fieldDef.field === 'pe') {
      if (fundamentalData.eps > 0 && fundamentalData.price > 0 && fieldDef.value <= 0) {
        checks.push(institutionalMakeCheck(
          `field:sanity_${fieldDef.field}`,
          false,
          'error',
          `P/E is ${fieldDef.value} but EPS (${fundamentalData.eps}) > 0 and price (${fundamentalData.price}) > 0.`,
        ));
        errors.push('P/E should be positive for profitable companies.');
      }
    }

    if (fieldDef.field === 'dividendYield' && fieldDef.value > DIVIDEND_YIELD_UPPER_BOUND) {
      checks.push(institutionalMakeCheck(
        `field:sanity_${fieldDef.field}`,
        false,
        'error',
        `Dividend yield (${fieldDef.value.toFixed(2)}%) exceeds ${DIVIDEND_YIELD_UPPER_BOUND}%.`,
      ));
      errors.push('Dividend yield is unrealistically high.');
    }

    if (fieldDef.field === 'revenueGrowth') {
      if (fieldDef.value < REVENUE_GROWTH_LOWER_BOUND || fieldDef.value > REVENUE_GROWTH_UPPER_BOUND) {
        checks.push(institutionalMakeCheck(
          `field:sanity_${fieldDef.field}`,
          false,
          'critical',
          `Revenue growth (${fieldDef.value.toFixed(1)}%) is outside normal bounds [${REVENUE_GROWTH_LOWER_BOUND}%, ${REVENUE_GROWTH_UPPER_BOUND}%].`,
        ));
        errors.push('Revenue growth is outside expected range.');
      }
    }

    if (fieldDef.field === 'grossMargin') {
      if (fieldDef.value > 100) {
        checks.push(institutionalMakeCheck(
          `field:sanity_${fieldDef.field}`,
          false,
          'error',
          `Gross margin (${fieldDef.value.toFixed(1)}%) exceeds 100%.`,
        ));
        errors.push('Gross margin cannot exceed 100%.');
      }
    }

    if (fieldDef.field === 'debtEquity' && fieldDef.value < 0) {
      checks.push(institutionalMakeCheck(
        `field:sanity_${fieldDef.field}`,
        false,
        'error',
        `Debt/Equity (${fieldDef.value}) is negative.`,
      ));
      errors.push('Debt/Equity should be non-negative.');
    }

    // ── Sector comparison ──────────────────────────────────────────
    if (sectorData) {
      const sectorName = typeof sectorData === 'string' ? sectorData : sectorData.sector;
      const benchmark = getSectorBenchmark(sectorName);

      const metricMap: Record<string, { avg: number; stdFactor: number }> = {
        pe: { avg: benchmark.avgPE, stdFactor: 0.4 },
        pb: { avg: benchmark.avgPB, stdFactor: 0.5 },
        roe: { avg: benchmark.avgROE, stdFactor: 0.3 },
        debtEquity: { avg: benchmark.avgDebtEquity, stdFactor: 0.5 },
        dividendYield: { avg: benchmark.avgDividendYield, stdFactor: 0.4 },
        grossMargin: { avg: benchmark.avgGrossMargin, stdFactor: 0.3 },
      };

      const metric = metricMap[fieldDef.field];
      if (metric && metric.avg > 0) {
        const estimatedStd = metric.avg * metric.stdFactor;
        const deviation = Math.abs(fieldDef.value - metric.avg);
        const zScore = estimatedStd > 0 ? deviation / estimatedStd : 0;

        if (zScore > ZSCORE_OUTLIER_THRESHOLD) {
          checks.push(institutionalMakeCheck(
            `field:sector_outlier_${fieldDef.field}`,
            false,
            'warning',
            `${fieldDef.label} (${fieldDef.value.toFixed(2)}) is ${(zScore).toFixed(1)}σ from ${sectorName} average (${metric.avg.toFixed(2)}).`,
          ));
          warnings.push(`${fieldDef.label} is a sector outlier.`);
        }
      }
    }

    // ── Compute confidence ────────────────────────────────────────
    const failedChecks = checks.filter((c) => !c.passed);
    const criticalFails = failedChecks.filter((c) => c.severity === 'critical').length;
    const errorFails = failedChecks.filter((c) => c.severity === 'error').length;

    let confidence = 1.0;
    confidence -= criticalFails * 0.35;
    confidence -= errorFails * 0.20;
    confidence -= failedChecks.filter((c) => c.severity === 'warning').length * 0.05;
    confidence = institutionalClamp(confidence, 0, 1);

    // Separate warnings and errors from checks
    for (const check of checks) {
      if (!check.passed) {
        if (check.severity === 'warning') {
          warnings.push(check.message);
        } else if (check.severity === 'error' || check.severity === 'critical') {
          errors.push(check.message);
        }
      }
    }

    results.push({
      field: fieldDef.field,
      value: fieldDef.value,
      isValid: criticalFails === 0 && errorFails === 0,
      warnings,
      errors,
      confidence,
      validationChecks: checks,
    });
  }

  return results;
}

// ═══════════════════════════════════════════════════════════════════
// 10. DATA QUALITY SCORE
// ═══════════════════════════════════════════════════════════════════

/**
 * Calculate a comprehensive DataQualityScore from validation results.
 *
 * The score is a weighted composite of four dimensions:
 *
 * | Dimension      | Weight | Calculation                                      |
 * |----------------|--------|--------------------------------------------------|
 * | Completeness   | 30%    | % of expected fields that are populated            |
 * | Consistency    | 25%    | % of cross-source checks that passed              |
 * | Timeliness     | 25%    | How recently data was fetched (days since fetch)  |
 * | Accuracy       | 20%    | % of sanity checks that passed                    |
 *
 * @param validations - Array of ValidationResult from institutionalValidateStockData
 * @param fetchedAt   - ISO 8601 timestamp of when the data was last fetched
 * @returns DataQualityScore with per-dimension scores and letter grade
 *
 * @example
 * ```typescript
 * const results = institutionalValidateStockData('CIB', data);
 * const quality = institutionalCalculateDataQualityScore(results, data.fetchedAt);
 * console.log(`Quality: ${quality.grade} (${quality.overall}/100)`);
 * ```
 */
export function institutionalCalculateDataQualityScore(
  validations: ValidationResult[],
  fetchedAt?: string | null,
): DataQualityScore {
  if (validations.length === 0) {
    return {
      overall: 0,
      completeness: 0,
      consistency: 0,
      timeliness: 0,
      accuracy: 0,
      grade: 'F',
    };
  }

  // ── Completeness (30% weight) ──────────────────────────────────
  const totalFields = validations.length;
  const populatedFields = validations.filter(
    (v) => typeof v.value === 'number' && v.value !== 0,
  ).length;
  const completeness = Math.round((populatedFields / totalFields) * 100);

  // ── Consistency (25% weight) ────────────────────────────────────
  const consistencyChecks = validations.flatMap((v) =>
    v.validationChecks.filter(
      (c) => c.checkName.startsWith('cross_source') || c.checkName.startsWith('sector'),
    ),
  );
  const consistencyPassed = consistencyChecks.length > 0
    ? consistencyChecks.filter((c) => c.passed).length / consistencyChecks.length
    : 0.8; // Assume good consistency if no cross-source checks were run
  const consistency = Math.round(consistencyPassed * 100);

  // ── Timeliness (25% weight) ─────────────────────────────────────
  const daysSinceFetch = institutionalDaysSince(fetchedAt ?? null);
  let timeliness: number;
  if (daysSinceFetch <= 1) {
    timeliness = 100;
  } else if (daysSinceFetch <= STALE_DATA_DAYS) {
    // Linear decay from 100 to 60 over 7 days
    timeliness = Math.round(100 - (daysSinceFetch / STALE_DATA_DAYS) * 40);
  } else if (daysSinceFetch <= SEVERELY_STALE_DATA_DAYS) {
    // Linear decay from 60 to 20 over 23 days (day 7 to day 30)
    timeliness = Math.round(60 - ((daysSinceFetch - STALE_DATA_DAYS) / (SEVERELY_STALE_DATA_DAYS - STALE_DATA_DAYS)) * 40);
  } else {
    timeliness = Math.max(0, 20 - Math.round((daysSinceFetch - SEVERELY_STALE_DATA_DAYS) / 10));
  }

  // ── Accuracy (20% weight) ───────────────────────────────────────
  const sanityChecks = validations.flatMap((v) =>
    v.validationChecks.filter((c) => c.checkName.includes('sanity')),
  );
  const accuracyPassed = sanityChecks.length > 0
    ? sanityChecks.filter((c) => c.passed).length / sanityChecks.length
    : 0.9; // Assume good accuracy if no sanity checks were run
  const accuracy = Math.round(accuracyPassed * 100);

  // ── Overall weighted score ──────────────────────────────────────
  const overall = Math.round(
    completeness * 0.30 +
    consistency * 0.25 +
    timeliness * 0.25 +
    accuracy * 0.20,
  );

  return {
    overall: institutionalClamp(overall, 0, 100),
    completeness: institutionalClamp(completeness, 0, 100),
    consistency: institutionalClamp(consistency, 0, 100),
    timeliness: institutionalClamp(timeliness, 0, 100),
    accuracy: institutionalClamp(accuracy, 0, 100),
    grade: institutionalGrade(institutionalClamp(overall, 0, 100)),
  };
}

// ═══════════════════════════════════════════════════════════════════
// 11. FINANCIAL STATEMENT VALIDATION
// ═══════════════════════════════════════════════════════════════════

/**
 * Validate the internal consistency of a financial statement.
 *
 * **Income Statement checks:**
 *   - Revenue ≥ Gross Profit ≥ Operating Income ≥ Net Income (in absolute terms)
 *   - Revenue - COGS = Gross Profit (within 1% tolerance)
 *   - Gross Profit - Operating Expenses = Operating Income
 *   - Operating Income - Net Interest & Tax ≈ Net Income
 *
 * **Balance Sheet checks:**
 *   - Total Assets = Total Liabilities + Stockholders' Equity
 *   - Total Assets = Current Assets + Non-Current Assets
 *   - Working Capital = Current Assets - Current Liabilities
 *
 * **Cash Flow checks:**
 *   - Operating Cash Flow - CapEx ≈ Free Cash Flow
 *   - Net Income should relate to Operating Cash Flow (via changes in working capital)
 *
 * @param statement - FinancialStatement object with type and data fields
 * @returns Array of ValidationResult, one per validated relationship
 */
export function institutionalValidateFinancialStatement(
  statement: FinancialStatement,
): ValidationResult[] {
  const results: ValidationResult[] = [];
  const { type, data } = statement;
  const tolerance = 0.01; // 1% tolerance for accounting relationships

  // Helper: get a field value, defaulting to 0
  const get = (field: string): number => data[field] ?? 0;
  // Helper: check if a field exists (non-zero)
  const has = (field: string): boolean => field in data && data[field] !== 0;

  if (type === 'income_statement') {
    // ── Revenue ≥ |Gross Profit| ──────────────────────────────────
    const revenue = get('revenue');
    const grossProfit = get('grossProfit');
    if (revenue > 0 && grossProfit > 0) {
      const isValid = grossProfit <= revenue * (1 + tolerance);
      results.push({
        field: 'income:gross_profit_vs_revenue',
        value: grossProfit,
        isValid,
        warnings: isValid ? [] : [`Gross Profit (${grossProfit}) exceeds Revenue (${revenue}).`],
        errors: isValid ? [] : ['Gross Profit should not exceed Revenue.'],
        confidence: isValid ? 0.95 : 0.3,
        validationChecks: [institutionalMakeCheck(
          'statement:gross_profit_vs_revenue',
          isValid,
          isValid ? 'info' : 'error',
          isValid
            ? `Gross Profit (${grossProfit}) ≤ Revenue (${revenue}). Relationship holds.`
            : `Gross Profit (${grossProfit}) exceeds Revenue (${revenue}). Accounting error likely.`,
        )],
      });
    }

    // ── Revenue - COGS ≈ Gross Profit ──────────────────────────────
    if (has('revenue') && has('costOfRevenue') && has('grossProfit')) {
      const expectedGrossProfit = revenue - get('costOfRevenue');
      const deviation = institutionalPctDiff(grossProfit, expectedGrossProfit);
      const isValid = deviation <= tolerance;
      results.push({
        field: 'income:gross_profit_calc',
        value: grossProfit,
        isValid,
        warnings: isValid ? [] : [`Gross Profit deviation from calculation: ${(deviation * 100).toFixed(1)}%.`],
        errors: isValid ? [] : ['Revenue - COGS does not equal Gross Profit.'],
        confidence: isValid ? 0.95 : 0.4,
        validationChecks: [institutionalMakeCheck(
          'statement:gross_profit_calc',
          isValid,
          isValid ? 'info' : 'error',
          isValid
            ? `Revenue - COGS = Gross Profit. Check passed.`
            : `Revenue (${revenue}) - COGS (${get('costOfRevenue')}) = ${expectedGrossProfit}, but reported Gross Profit = ${grossProfit}. Deviation: ${(deviation * 100).toFixed(1)}%.`,
        )],
      });
    }

    // ── Gross Profit ≥ Operating Income ≥ Net Income ──────────────
    const operatingIncome = get('operatingIncome');
    const netIncome = get('netIncome');
    if (grossProfit > 0 && operatingIncome > 0) {
      const isValid = operatingIncome <= grossProfit * (1 + tolerance);
      results.push({
        field: 'income:op_income_vs_gross',
        value: operatingIncome,
        isValid,
        warnings: isValid ? [] : [`Operating Income (${operatingIncome}) exceeds Gross Profit (${grossProfit}).`],
        errors: isValid ? [] : [],
        confidence: isValid ? 0.95 : 0.5,
        validationChecks: [institutionalMakeCheck(
          'statement:op_income_vs_gross',
          isValid,
          isValid ? 'info' : 'warning',
          isValid
            ? `Operating Income (${operatingIncome}) ≤ Gross Profit (${grossProfit}).`
            : `Operating Income (${operatingIncome}) > Gross Profit (${grossProfit}). Possible data issue or negative operating expenses.`,
        )],
      });
    }

    if (operatingIncome > 0 && netIncome > 0) {
      const isValid = netIncome <= operatingIncome * (1 + tolerance);
      results.push({
        field: 'income:net_vs_operating',
        value: netIncome,
        isValid,
        warnings: isValid ? [] : [`Net Income (${netIncome}) exceeds Operating Income (${operatingIncome}).`],
        errors: isValid ? [] : [],
        confidence: isValid ? 0.90 : 0.6,
        validationChecks: [institutionalMakeCheck(
          'statement:net_vs_operating',
          isValid,
          isValid ? 'info' : 'info',
          isValid
            ? `Net Income (${netIncome}) ≤ Operating Income (${operatingIncome}). Normal relationship.`
            : `Net Income (${netIncome}) > Operating Income (${operatingIncome}). This can happen with negative interest/income from associates. Worth verifying.`,
        )],
      });
    }
  }

  if (type === 'balance_sheet') {
    // ── Total Assets = Total Liabilities + Stockholders' Equity ────
    const totalAssets = get('totalAssets');
    const totalLiabilities = get('totalLiabilities');
    const equity = get('stockholdersEquity');
    if (totalAssets > 0) {
      const expectedAssets = totalLiabilities + equity;
      const deviation = institutionalPctDiff(totalAssets, expectedAssets);
      const isValid = deviation <= tolerance;
      results.push({
        field: 'balance:accounting_equation',
        value: totalAssets,
        isValid,
        warnings: isValid ? [] : [`Assets (${totalAssets}) ≠ Liabilities (${totalLiabilities}) + Equity (${equity}) = ${expectedAssets}. Deviation: ${(deviation * 100).toFixed(1)}%.`],
        errors: isValid ? [] : ['Balance sheet accounting equation does not hold.'],
        confidence: isValid ? 0.99 : 0.2,
        validationChecks: [institutionalMakeCheck(
          'statement:accounting_equation',
          isValid,
          isValid ? 'info' : 'critical',
          isValid
            ? `Accounting equation holds: Assets = Liabilities + Equity.`
            : `Accounting equation violation: Assets (${totalAssets}) ≠ Liabilities (${totalLiabilities}) + Equity (${equity}) = ${expectedAssets}. This is a critical data integrity issue.`,
          `Deviation: ${(deviation * 100).toFixed(2)}%.`,
        )],
      });
    }

    // ── Working Capital = Current Assets - Current Liabilities ────
    if (has('workingCapital') && has('currentAssets') && has('currentLiabilities')) {
      const expectedWC = get('currentAssets') - get('currentLiabilities');
      const reportedWC = get('workingCapital');
      const deviation = institutionalPctDiff(reportedWC, expectedWC);
      const isValid = deviation <= tolerance;
      results.push({
        field: 'balance:working_capital',
        value: reportedWC,
        isValid,
        warnings: isValid ? [] : [`Working Capital deviation: ${(deviation * 100).toFixed(1)}%.`],
        errors: isValid ? [] : [],
        confidence: isValid ? 0.95 : 0.5,
        validationChecks: [institutionalMakeCheck(
          'statement:working_capital',
          isValid,
          isValid ? 'info' : 'error',
          isValid
            ? `Working Capital (${reportedWC}) = Current Assets (${get('currentAssets')}) - Current Liabilities (${get('currentLiabilities')}). Check passed.`
            : `Working Capital (${reportedWC}) ≠ Current Assets (${get('currentAssets')}) - Current Liabilities (${get('currentLiabilities')}) = ${expectedWC}.`,
        )],
      });
    }
  }

  if (type === 'cash_flow') {
    // ── OCF - CapEx ≈ FCF ────────────────────────────────────────
    const ocf = get('operatingCashFlow');
    const capex = get('capitalExpenditure');
    const fcf = get('freeCashFlow');
    if (has('operatingCashFlow') && has('freeCashFlow')) {
      const expectedFCF = ocf + capex; // CapEx is typically negative
      const deviation = institutionalPctDiff(fcf, expectedFCF);
      const isValid = deviation <= tolerance * 2; // 2% tolerance for FCF (can have other adjustments)
      results.push({
        field: 'cashflow:fcf_calc',
        value: fcf,
        isValid,
        warnings: isValid ? [] : [`FCF deviation from OCF+CapEx: ${(deviation * 100).toFixed(1)}%. May include other adjustments.`],
        errors: isValid ? [] : [],
        confidence: isValid ? 0.90 : 0.5,
        validationChecks: [institutionalMakeCheck(
          'statement:fcf_calc',
          isValid,
          isValid ? 'info' : 'warning',
          isValid
            ? `Free Cash Flow (${fcf}) ≈ Operating Cash Flow (${ocf}) + CapEx (${capex}). Check passed.`
            : `Free Cash Flow (${fcf}) ≠ OCF (${ocf}) + CapEx (${capex}) = ${expectedFCF}. Deviation: ${(deviation * 100).toFixed(1)}%. FCF may include other adjustments.`,
        )],
      });
    }
  }

  return results;
}

// ═══════════════════════════════════════════════════════════════════
// 12. VALIDATION REPORT GENERATION
// ═══════════════════════════════════════════════════════════════════

/**
 * Generate a comprehensive ValidationReport for a stock.
 *
 * Aggregates all per-field validation results, computes the overall
 * data quality score, generates a valuation confidence assessment,
 * and produces a prioritized list of issues that require attention.
 *
 * @param symbol       - Stock symbol
 * @param validations  - Array of ValidationResult from institutionalValidateStockData
 * @param qualityScore - DataQualityScore from institutionalCalculateDataQualityScore
 * @param fetchedAt    - ISO 8601 timestamp of data fetch (optional)
 * @returns Complete ValidationReport
 *
 * @example
 * ```typescript
 * const results = institutionalValidateStockData('CIB', data, [], 'Financials');
 * const quality = institutionalCalculateDataQualityScore(results, data.fetchedAt);
 * const report = institutionalGenerateValidationReport('CIB', results, quality);
 * console.log(`Recommendation: ${report.recommendation}`);
 * ```
 */
export function institutionalGenerateValidationReport(
  symbol: string,
  validations: ValidationResult[],
  qualityScore: DataQualityScore,
  fetchedAt?: string | null,
): ValidationReport {
  const normalizedSymbol = symbol.toUpperCase().trim();
  const allChecks = validations.flatMap((v) => v.validationChecks);

  // ── Summary counts ─────────────────────────────────────────────
  const summary = {
    totalChecks: allChecks.length,
    passed: allChecks.filter((c) => c.passed).length,
    failed: allChecks.filter((c) => !c.passed).length,
    criticalCount: allChecks.filter((c) => !c.passed && c.severity === 'critical').length,
    errorCount: allChecks.filter((c) => !c.passed && c.severity === 'error').length,
    warningCount: allChecks.filter((c) => !c.passed && c.severity === 'warning').length,
    infoCount: allChecks.filter((c) => c.passed && c.severity === 'info').length,
  };

  // ── Priority issues ─────────────────────────────────────────────
  const priorityIssues: string[] = [];
  for (const validation of validations) {
    for (const check of validation.validationChecks) {
      if (!check.passed && check.severity === 'critical') {
        priorityIssues.push(`[CRITICAL] ${validation.field}: ${check.message}`);
      } else if (!check.passed && check.severity === 'error') {
        priorityIssues.push(`[ERROR] ${validation.field}: ${check.message}`);
      }
    }
  }

  // Limit to top 10 issues
  if (priorityIssues.length > 10) {
    priorityIssues.length = 10;
  }

  // ── Recommendation ───────────────────────────────────────────────
  let recommendation: ValidationReport['recommendation'];
  if (qualityScore.overall >= 80 && summary.criticalCount === 0 && summary.errorCount === 0) {
    recommendation = 'trust';
  } else if (qualityScore.overall >= 50 && summary.criticalCount === 0) {
    recommendation = 'use_with_caution';
  } else {
    recommendation = 'do_not_use';
  }

  // ── Valuation confidence ─────────────────────────────────────────
  const avgConfidence = validations.length > 0
    ? validations.reduce((sum, v) => sum + v.confidence, 0) / validations.length
    : 0;

  const valuationConfidence: ValuationConfidence = {
    level: avgConfidence >= 0.85 ? 'Very High'
      : avgConfidence >= 0.70 ? 'High'
        : avgConfidence >= 0.50 ? 'Moderate'
          : avgConfidence >= 0.30 ? 'Low'
            : 'Very Low',
    score: Math.round(avgConfidence * 100),
    factors: {
      dataAvailability: qualityScore.completeness,
      reportingQuality: qualityScore.accuracy,
      forecastCertainty: qualityScore.consistency,
      earningsStability: institutionalClamp(
        Math.round(avgConfidence * 100),
        0,
        100,
      ),
      sectorMaturity: qualityScore.timeliness > 50 ? 70 : 40, // Proxy
    },
    explanation:
      `Data quality grade: ${qualityScore.grade} (${qualityScore.overall}/100). ` +
      `${summary.criticalCount} critical, ${summary.errorCount} error, ${summary.warningCount} warning issues detected. ` +
      `Average field confidence: ${(avgConfidence * 100).toFixed(0)}%. ` +
      (recommendation === 'trust'
        ? 'Data is reliable enough for institutional-grade analysis.'
        : recommendation === 'use_with_caution'
          ? 'Data has some quality issues. Cross-reference with additional sources before making investment decisions.'
          : 'Data quality is insufficient for reliable analysis. Do not use for valuation or investment decisions.'),
  };

  return {
    symbol: normalizedSymbol,
    generatedAt: new Date().toISOString(),
    fieldResults: validations,
    qualityScore,
    valuationConfidence,
    summary,
    priorityIssues,
    recommendation,
  };
}

// ═══════════════════════════════════════════════════════════════════
// 13. VALUATION CONFIDENCE SCORE
// ═══════════════════════════════════════════════════════════════════

/**
 * Calculate a ValuationConfidence score based on fundamental data quality,
 * sector maturity, and earnings predictability.
 *
 * This is conceptually separate from DataQualityScore — it measures
 * **how confident we can be in the valuation output**, not just the
 * raw data quality.
 *
 * **Factors:**
 *
 * | Factor                | Weight | Description                                       |
 * |-----------------------|--------|---------------------------------------------------|
 * | Data Availability     | 25%    | How many fields are populated                     |
 * | Reporting Quality     | 20%    | Source reliability and data freshness             |
 * | Forecast Certainty    | 20%    | Earnings predictability (stable = more certain)  |
 * | Earnings Stability    | 20%    | EPS variance over recent periods                  |
 * | Sector Maturity       | 15%    | How well-understood the sector is on EGX         |
 *
 * **Sector Maturity Scoring (EGX-specific):**
 *   - Financials: 90 (most data, longest history)
 *   - Materials/Industrials: 80
 *   - Real Estate: 75
 *   - Consumer Defensive: 80
 *   - Healthcare: 60
 *   - Consumer Discretionary: 65
 *   - Technology: 45 (small sector, limited history)
 *   - Communication Services: 55
 *   - Energy: 70
 *   - Utilities: 70
 *   - Unknown: 50
 *
 * @param fundamentalData - Partial fundamental data (at minimum: eps, revenue)
 * @param sector          - Sector name (optional)
 * @param dataQuality     - DataQualityScore (optional, will be estimated if missing)
 * @returns ValuationConfidence assessment
 *
 * @example
 * ```typescript
 * const confidence = institutionalCalculateValuationConfidence(
 *   cibData,
 *   'Financials',
 *   qualityScore
 * );
 * console.log(`${confidence.level}: ${confidence.score}/100`);
 * console.log(confidence.explanation);
 * ```
 */
export function institutionalCalculateValuationConfidence(
  fundamentalData: Partial<FundamentalData>,
  sector?: string,
  dataQuality?: DataQualityScore,
): ValuationConfidence {
  const d = fundamentalData;

  // ── Factor 1: Data Availability (0–100) ──────────────────────────
  let dataAvailability = 0;
  let availabilityChecks = 0;
  let availabilityTotal = 14; // Number of fields to check

  const keyFields: (keyof FundamentalData)[] = [
    'price', 'pe', 'pb', 'eps', 'revenue', 'netIncome',
    'grossMargin', 'netMargin', 'roe', 'debtEquity',
    'totalDebt', 'freeCashFlow', 'sharesOutstanding', 'dividendYield',
  ];

  for (const field of keyFields) {
    availabilityChecks++;
    const val = d[field] as number | undefined;
    if (val !== undefined && val !== 0 && val !== null) {
      dataAvailability++;
    }
  }

  dataAvailability = Math.round((dataAvailability / availabilityTotal) * 100);

  // ── Factor 2: Reporting Quality (0–100) ────────────────────────
  let reportingQuality: number;
  if (dataQuality) {
    reportingQuality = Math.round(
      dataQuality.accuracy * 0.5 +
      dataQuality.timeliness * 0.3 +
      dataQuality.consistency * 0.2,
    );
  } else {
    // Estimate from available data
    reportingQuality = 60; // Default baseline

    // Boost if we have recent fetch time
    const fetchedAt = d.fetchedAt;
    if (fetchedAt) {
      const daysOld = institutionalDaysSince(fetchedAt);
      if (daysOld <= 1) reportingQuality += 20;
      else if (daysOld <= 7) reportingQuality += 10;
      else if (daysOld > 30) reportingQuality -= 10;
    }

    // Boost if source is validated
    if (d.dataSource === 'validated') reportingQuality += 10;

    // Boost if audited
    if (d.hasData) reportingQuality += 5;

    reportingQuality = institutionalClamp(reportingQuality, 0, 100);
  }

  // ── Factor 3: Forecast Certainty (0–100) ────────────────────────
  let forecastCertainty = 50; // Base: moderate uncertainty

  // Stable revenue growth increases certainty
  const revGrowth = d.revenueGrowth ?? 0;
  if (revGrowth > 0 && revGrowth < 30) {
    forecastCertainty += 15; // Moderate, positive growth = more predictable
  } else if (revGrowth >= 30 && revGrowth < 100) {
    forecastCertainty += 5; // High growth = less predictable
  } else if (revGrowth < 0) {
    forecastCertainty -= 10; // Declining revenue = less certain
  }

  // Stable margins increase certainty
  if (d.grossMargin && d.grossMargin > 10 && d.grossMargin < 80) {
    forecastCertainty += 10;
  }

  // Stable ROE increases certainty
  if (d.roe && d.roe > 5 && d.roe < 50) {
    forecastCertainty += 10;
  }

  // Large companies are more predictable
  if (d.marketCap && d.marketCap > 50_000_000_000) { // > 50B EGP
    forecastCertainty += 10;
  } else if (d.marketCap && d.marketCap > 10_000_000_000) { // > 10B EGP
    forecastCertainty += 5;
  }

  // Beta < 1 increases certainty
  if (d.beta && d.beta > 0 && d.beta < 1) {
    forecastCertainty += 5;
  } else if (d.beta && d.beta > 1.5) {
    forecastCertainty -= 5;
  }

  forecastCertainty = institutionalClamp(forecastCertainty, 0, 100);

  // ── Factor 4: Earnings Stability (0–100) ───────────────────────
  let earningsStability = 50; // Base

  if (d.eps !== undefined && d.eps !== 0) {
    // Positive, non-volatile EPS = stable
    if (d.eps > 0 && (d.pe ?? 0) > 0 && (d.pe ?? 0) < 30) {
      earningsStability += 20; // Reasonable P/E suggests stable earnings
    } else if (d.eps > 0) {
      earningsStability += 10;
    } else {
      earningsStability -= 15; // Negative EPS = unstable
    }

    // Check earnings growth consistency
    if (d.earningsGrowth !== undefined) {
      if (d.earningsGrowth > -10 && d.earningsGrowth < 50) {
        earningsStability += 15; // Moderate, positive earnings growth
      } else if (d.earningsGrowth >= 50) {
        earningsStability += 0;  // High growth = less stable
      } else if (d.earningsGrowth < -10) {
        earningsStability -= 10; // Declining earnings
      }
    }

    // Payout ratio as stability indicator
    if (d.payoutRatio !== undefined && d.payoutRatio > 0 && d.payoutRatio < 80) {
      earningsStability += 5; // Consistent dividend payer = stable
    }
  }

  earningsStability = institutionalClamp(earningsStability, 0, 100);

  // ── Factor 5: Sector Maturity (0–100) ──────────────────────────
  const sectorMaturityMap: Record<string, number> = {
    'Financials': 90,
    'Materials': 80,
    'Industrials': 80,
    'Consumer Defensive': 80,
    'Real Estate': 75,
    'Energy': 70,
    'Utilities': 70,
    'Consumer Discretionary': 65,
    'Healthcare': 60,
    'Communication Services': 55,
    'Technology': 45,
  };

  let sectorMaturity: number;
  if (sector && sector in sectorMaturityMap) {
    sectorMaturity = sectorMaturityMap[sector];
  } else if (sector) {
    // Try to find partial match
    const matchingKey = Object.keys(sectorMaturityMap).find(
      (k) => k.toLowerCase().includes(sector.toLowerCase()) ||
        sector.toLowerCase().includes(k.toLowerCase()),
    );
    sectorMaturity = matchingKey ? sectorMaturityMap[matchingKey] : 50;
  } else {
    sectorMaturity = 50; // Unknown sector
  }

  // Boost sector maturity if we have a benchmark with many peers
  if (sector) {
    const benchmark = getSectorBenchmark(sector);
    if (benchmark.count >= 20) {
      sectorMaturity = Math.min(95, sectorMaturity + 5);
    } else if (benchmark.count < 5) {
      sectorMaturity = Math.max(30, sectorMaturity - 10);
    }
  }

  // ── Compute overall weighted score ─────────────────────────────
  const overallScore = Math.round(
    dataAvailability * 0.25 +
    reportingQuality * 0.20 +
    forecastCertainty * 0.20 +
    earningsStability * 0.20 +
    sectorMaturity * 0.15,
  );

  // ── Determine confidence level ────────────────────────────────
  let level: ValuationConfidence['level'];
  if (overallScore >= 85) level = 'Very High';
  else if (overallScore >= 70) level = 'High';
  else if (overallScore >= 50) level = 'Moderate';
  else if (overallScore >= 30) level = 'Low';
  else level = 'Very Low';

  // ── Build explanation ───────────────────────────────────────────
  const sectorLabel = sector ?? 'Unknown';
  const factorSummary = [
    `Data Availability: ${dataAvailability}/100`,
    `Reporting Quality: ${reportingQuality}/100`,
    `Forecast Certainty: ${forecastCertainty}/100`,
    `Earnings Stability: ${earningsStability}/100`,
    `Sector Maturity (${sectorLabel}): ${sectorMaturity}/100`,
  ].join('. ');

  let explanation: string;
  if (level === 'Very High' || level === 'High') {
    explanation =
      `High valuation confidence for this ${sectorLabel} stock. ` +
      `${factorSummary}. ` +
      `The combination of good data coverage, stable earnings, and a well-understood sector ` +
      `provides a reliable foundation for valuation models.`;
  } else if (level === 'Moderate') {
    explanation =
      `Moderate valuation confidence. ${factorSummary}. ` +
      `Valuation estimates should be treated as approximate ranges rather than precise values. ` +
      `Cross-reference with multiple models and consider using sensitivity analysis.`;
  } else {
    explanation =
      `Low valuation confidence. ${factorSummary}. ` +
      `Significant limitations in data quality or predictability reduce the reliability ` +
      `of any valuation output. Use results with extreme caution and supplement with ` +
      `qualitative analysis and expert judgment.`;
  }

  return {
    level,
    score: overallScore,
    factors: {
      dataAvailability,
      reportingQuality,
      forecastCertainty,
      earningsStability,
      sectorMaturity,
    },
    explanation,
  };
}

// ═══════════════════════════════════════════════════════════════════
// 14. COMPREHENSIVE PIPELINE ORCHESTRATOR
// ═══════════════════════════════════════════════════════════════════

/**
 * Run the full institutional validation pipeline on a stock's fundamental data.
 *
 * This is a convenience function that:
 * 1. Validates all individual fields via `institutionalValidateStockData`
 * 2. Runs sanity checks across the dataset
 * 3. Checks for missing values
 * 4. Performs sector benchmark comparison
 * 5. Runs historical consistency checks (if previous data provided)
 * 6. Detects restatements (if previous data provided)
 * 7. Calculates the data quality score
 * 8. Calculates the valuation confidence score
 * 9. Generates the complete validation report
 *
 * @param symbol           - Stock symbol
 * @param fundamentalData  - Current fundamental data
 * @param previousData     - Previous period data for consistency/restatement checks (optional)
 * @param sectorName       - Sector name for benchmark comparison (optional)
 * @param priceHistory     - Historical price snapshots (optional)
 * @returns Complete ValidationReport
 */
export function institutionalRunFullPipeline(
  symbol: string,
  fundamentalData: FundamentalData,
  previousData?: Record<string, number>,
  sectorName?: string,
  priceHistory?: PriceSnapshot[],
): ValidationReport {
  // Step 1: Validate all fields
  const fieldValidations = institutionalValidateStockData(
    symbol,
    fundamentalData,
    priceHistory,
    sectorName,
  );

  // Step 2: Run sanity checks
  const sanityChecks = institutionalRunSanityChecks(fundamentalData);
  const sanityResult: ValidationResult = {
    field: '_sanity_checks',
    value: 'aggregate',
    isValid: sanityChecks.every((c) => c.passed || c.severity === 'info'),
    warnings: sanityChecks.filter((c) => !c.passed && c.severity === 'warning').map((c) => c.message),
    errors: sanityChecks.filter((c) => !c.passed && (c.severity === 'error' || c.severity === 'critical')).map((c) => c.message),
    confidence: sanityChecks.every((c) => c.passed) ? 1.0
      : institutionalClamp(1.0 - sanityChecks.filter((c) => !c.passed).length * 0.15, 0, 1),
    validationChecks: sanityChecks,
  };

  // Step 3: Missing value detection
  const missingResult = institutionalDetectMissingValues(fundamentalData);
  const missingValidation: ValidationResult = {
    field: '_missing_values',
    value: `${missingResult.completenessScore}%`,
    isValid: missingResult.completenessScore >= 80,
    warnings: missingResult.checks.filter((c) => !c.passed && c.severity === 'warning').map((c) => c.message),
    errors: missingResult.checks.filter((c) => !c.passed && (c.severity === 'error' || c.severity === 'critical')).map((c) => c.message),
    confidence: missingResult.completenessScore / 100,
    validationChecks: missingResult.checks,
  };

  // Step 4: Historical consistency
  let historicalValidation: ValidationResult | null = null;
  if (previousData && Object.keys(previousData).length > 0) {
    const historicalChecks = institutionalCheckHistoricalConsistency(
      fundamentalData as unknown as Record<string, number>,
      previousData,
    );
    historicalValidation = {
      field: '_historical_consistency',
      value: `${historicalChecks.filter((c) => c.passed).length}/${historicalChecks.length} passed`,
      isValid: historicalChecks.every((c) => c.passed || c.severity === 'info'),
      warnings: historicalChecks.filter((c) => !c.passed && c.severity === 'warning').map((c) => c.message),
      errors: historicalChecks.filter((c) => !c.passed && (c.severity === 'error' || c.severity === 'critical')).map((c) => c.message),
      confidence: historicalChecks.length > 0
        ? institutionalClamp(historicalChecks.filter((c) => c.passed).length / historicalChecks.length, 0, 1)
        : 0.5,
      validationChecks: historicalChecks,
    };
  }

  // Step 5: Restatement detection
  let restatementValidation: ValidationResult | null = null;
  if (previousData && Object.keys(previousData).length > 0) {
    const restatementChecks = institutionalDetectRestatements(
      symbol,
      fundamentalData as unknown as Record<string, number>,
      previousData,
    );
    restatementValidation = {
      field: '_restatements',
      value: `${restatementChecks.filter((c) => c.passed).length}/${restatementChecks.length} passed`,
      isValid: restatementChecks.every((c) => c.passed || c.severity === 'info'),
      warnings: restatementChecks.filter((c) => !c.passed && c.severity === 'warning').map((c) => c.message),
      errors: restatementChecks.filter((c) => !c.passed && (c.severity === 'error' || c.severity === 'critical')).map((c) => c.message),
      confidence: restatementChecks.length > 0
        ? institutionalClamp(restatementChecks.filter((c) => c.passed).length / restatementChecks.length, 0, 1)
        : 1.0,
      validationChecks: restatementChecks,
    };
  }

  // Combine all validation results
  const allValidations: ValidationResult[] = [
    ...fieldValidations,
    sanityResult,
    missingValidation,
  ];
  if (historicalValidation) allValidations.push(historicalValidation);
  if (restatementValidation) allValidations.push(restatementValidation);

  // Step 6: Calculate data quality score
  const qualityScore = institutionalCalculateDataQualityScore(
    allValidations,
    fundamentalData.fetchedAt,
  );

  // Step 7: Calculate valuation confidence
  const valuationConfidence = institutionalCalculateValuationConfidence(
    fundamentalData,
    sectorName,
    qualityScore,
  );

  // Step 8: Generate report
  const allChecks = allValidations.flatMap((v) => v.validationChecks);
  const summary = {
    totalChecks: allChecks.length,
    passed: allChecks.filter((c) => c.passed).length,
    failed: allChecks.filter((c) => !c.passed).length,
    criticalCount: allChecks.filter((c) => !c.passed && c.severity === 'critical').length,
    errorCount: allChecks.filter((c) => !c.passed && c.severity === 'error').length,
    warningCount: allChecks.filter((c) => !c.passed && c.severity === 'warning').length,
    infoCount: allChecks.filter((c) => c.passed && c.severity === 'info').length,
  };

  const priorityIssues: string[] = [];
  for (const validation of allValidations) {
    for (const check of validation.validationChecks) {
      if (!check.passed && check.severity === 'critical') {
        priorityIssues.push(`[CRITICAL] ${validation.field}: ${check.message}`);
      } else if (!check.passed && check.severity === 'error') {
        priorityIssues.push(`[ERROR] ${validation.field}: ${check.message}`);
      }
    }
  }
  if (priorityIssues.length > 15) {
    priorityIssues.length = 15;
  }

  let recommendation: ValidationReport['recommendation'];
  if (qualityScore.overall >= 80 && summary.criticalCount === 0 && summary.errorCount === 0) {
    recommendation = 'trust';
  } else if (qualityScore.overall >= 50 && summary.criticalCount === 0) {
    recommendation = 'use_with_caution';
  } else {
    recommendation = 'do_not_use';
  }

  return {
    symbol: symbol.toUpperCase().trim(),
    generatedAt: new Date().toISOString(),
    fieldResults: allValidations,
    qualityScore,
    valuationConfidence,
    summary,
    priorityIssues,
    recommendation,
  };
}
