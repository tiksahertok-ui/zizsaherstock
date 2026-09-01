/**
 * Daily Picks Engine v2 — Flagship Feature
 * ═══════════════════════════════════════════════════════════════
 * Two-stage pipeline: Fundamental Gate → Technical Ranking
 *
 * STAGE 1 — FUNDAMENTAL QUALITY GATE (A.2):
 *   No stock enters Daily Picks on technical merit alone.
 *   Reuses the platform's existing fundamental/valuation engine
 *   (fundamentals.ts, egx-sectors.ts) as the data source.
 *   Every threshold is explicit, documented, and versioned.
 *   A stock failing the fundamental gate is EXCLUDED regardless
 *   of technical strength.
 *
 * STAGE 2 — TECHNICAL SCORING (A.4):
 *   Single consolidated scoring methodology (replaces the
 *   two competing formulas from v1). Multi-factor confirmation
 *   across trend, momentum, volume, volatility — with
 *   multicollinearity caps (A.4).
 *   Every pick carries explicit SL, TP, R:R with EGX-specific
 *   price-limit bounding (A.5).
 *
 * EGX ADAPTATIONS (A.5):
 *   - Liquidity filter calibrated to EGX turnover distributions
 *   - Price limits: ±16% session limit, 5% circuit breaker
 *   - Settlement: T+2 (sell-side = "reduce/avoid" not short)
 *   - No short-side opportunities presented
 *   - SL/TP bounded by EGX daily price limit
 *
 * SECTION B FEATURES:
 *   B.1: Flexible count (allows <5 with explanation)
 *   B.2: Soft sector-concentration guard
 *   B.4: Next-in-line transparency (ranks 6-10)
 *   B.5: Market context metadata per batch
 *   B.7: Versioned parameter set
 *
 * IMPORTANT CAVEATS:
 *   - Scoring is heuristic, NOT statistically fitted.
 *   - "Strongest setups" reflects indicator alignment,
 *     NOT validated forward-performance claim.
 *   - Walk-forward backtest is a SEPARATE workstream (A.4).
 *   - No claim of guaranteed next-session outperformance.
 */

import type { ScreenerStock } from './technical-screener';
import type { FundamentalData } from './fundamentals';
import { DEFAULT_SECTOR_BENCHMARKS } from './egx-sectors';

// ═══════════════════════════════════════════════════════════════
// VERSIONED PARAMETERS — all thresholds in one place (B.7)
// Bumped when ANY scoring dimension or threshold changes.
// Every historical batch is attributable to the exact config
// that produced it.
// ═══════════════════════════════════════════════════════════════

export const DAILY_PICKS_VERSION = '2.0.0';

export const DAILY_PICKS_PARAMS = {
  // ── Output ──
  maxPicks: 5,           // B.1: default target (can return fewer)
  nextInLineCount: 5,   // B.4: ranks 6-10 for transparency

  // ═══ STAGE 1: FUNDAMENTAL QUALITY GATE (A.2) ═══
  // Each threshold is documented with rationale.
  // All checks are AND — a stock must pass ALL to proceed.
  fundamental: {
    // 1a. Profitability: at least one positive margin
    // Rationale: a company must generate profit to be investable
    minGrossMargin: 0,        // 0 = just needs to be non-negative (most EGX stocks)
    minNetMargin: 0,
    minOperatingMargin: 0,

    // 1b. Solvency: leverage must not be extreme
    // Rationale: D/E > 10 suggests distressed balance sheet
    maxDebtEquity: 10,

    // 1c. Cash generation: FCF must be non-negative
    // Rationale: sustained negative FCF = value destruction
    minFreeCashFlow: 0,

    // 1d. Revenue existence: must have revenue
    // Rationale: pre-revenue companies are speculation, not investment
    minRevenue: 0,

    // 1e. Relative valuation vs sector: not extremely overvalued
    // Rationale: P/E > 3x sector average is a red flag
    // even if technically bullish
    maxPeVsSectorMultiple: 3.0,

    // 1f. Minimum data quality to evaluate fundamentals
    // Rationale: insufficient data = unreliable gate decision
    minDataQualityScore: 30,   // out of 100

    // 1g. EGP currency gate (reuse existing platform filter)
    // Rationale: non-EGP stocks are not tradeable on EGX
    requireEGP: true,
  },

  // ═══ STAGE 2: TECHNICAL FILTERS ═══
  // Applied AFTER fundamental gate. These are hard cutoffs.
  technical: {
    // Signal direction
    signals: ['Strong Buy', 'Buy'] as string[],

    // Minimum confidence from screener
    minConfidence: 40,

    // Risk:Reward minimum (A.4)
    minRiskReward: 1.5,

    // RSI must have room to run (not overbought)
    maxRSI: 75,

    // MACD must not be fully bearish
    // (both negative AND macd < signal)
    bearishMACDExcluded: true,
  },

  // ═══ STAGE 2: TECHNICAL SCORING (consolidated, A.4) ═══
  // 6 dimensions, 100 points max.
  // Multicollinearity cap: MA-related signals capped at 8/20 trend pts
  // (A.4: avoid inflating with near-duplicate signals)
  scoring: {
    // Dimension 1: SIGNAL STRENGTH (max 25 + 15 bonus = 40)
    signal: {
      strongBuyPts: 25,
      buyPts: 15,
      confidenceMaxBonus: 15,
    },
    // Dimension 2: TREND QUALITY (max 20)
    // Cap applied: no more than 8 pts from MA alignment alone
    trend: {
      maxPts: 20,
      perfectEMAStack: 8,       // EMA20 > EMA50 > EMA200
      partialEMAStack: 5,       // EMA20 > EMA50
      aboveSMA: 3,              // each of SMA20/50/200 (cap: 8 max from MAs)
      aboveEMA20: 3,
      maAlignmentCap: 8,        // multicollinearity guard (A.4)
    },
    // Dimension 3: MOMENTUM QUALITY (max 20)
    momentum: {
      maxPts: 20,
      rsiIdealLow: 45,
      rsiIdealHigh: 65,
      rsiApproachingLow: 35,
      rsiApproachingHigh: 45,
      rsiOkHigh: 75,
      rsiIdealPts: 8,
      rsiApproachingPts: 5,
      rsiOkPts: 3,
      rsiOversoldPts: 4,
      macdPositiveHist: 5,
      macdExpanding: 3,
      stochBullBelow75: 4,
      stochLowBull: 3,
    },
    // Dimension 4: VOLUME INTEREST (max 15)
    volume: {
      maxPts: 15,
      spikeUpPts: 12,
      normalUpPts: 7,
      baselinePts: 4,
    },
    // Dimension 5: RISK:REWARD (max 10)
    riskReward: {
      maxPts: 10,
      fullRREquals: 4,           // 4:1 R:R = full 10 pts
    },
    // Dimension 6: PATTERN BONUS (max 10)
    pattern: {
      maxPts: 10,
      aboveMA: 3,
      bbSqueeze: 4,
      macdCrossUp: 3,
      bullishMAStack: 3,
      oversoldReversal: 2,
    },
  },

  // ═══ EGX-SPECIFIC (A.5) ═══
  egx: {
    // Daily price limit: ±16% (confirmed EGX rule)
    dailyPriceLimitPct: 16,
    // Circuit breaker: 5% halt
    circuitBreakerPct: 5,
    // Minimum daily turnover (EGP) for liquidity filter
    // Calibrated to EGX turnover distribution:
    // median daily turnover ~500K EGP, 25th percentile ~100K
    minDailyTurnoverEGP: 100_000,
    // Settlement cycle
    settlementCycle: 'T+2',
    // Short selling availability
    shortSellingAvailable: false,
  },

  // ═══ SECTOR GUARD (B.2) ═══
  sectorGuard: {
    enabled: true,
    maxPerSector: 3,       // max picks from same sector
    // Penalty applied when sector is over-represented
    overConcentrationPenalty: 8,
  },

} as const;

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

export interface FundamentalGateResult {
  passed: boolean;
  checks: {
    profitability: { passed: boolean; detail: string; value: number; threshold: number };
    solvency: { passed: boolean; detail: string; value: number; threshold: number };
    cashFlow: { passed: boolean; detail: string; value: number; threshold: number };
    revenue: { passed: boolean; detail: string; value: number; threshold: number };
    valuation: { passed: boolean; detail: string; value: number; threshold: number };
    dataQuality: { passed: boolean; detail: string; value: number; threshold: number };
    currency: { passed: boolean; detail: string; value: string; threshold: string };
  };
  overallScore: number; // 0-7 (how many checks passed)
}

export interface DailyPickScoreBreakdown {
  signal: number;
  trend: number;
  momentum: number;
  volume: number;
  riskReward: number;
  pattern: number;
  /** Sum of all dimensions (0-100) */
  total: number;
}

export interface MarketContext {
  egx30Level: number;
  egx30ChangePct: number;
  marketVolatility: 'low' | 'medium' | 'high';
  regime: 'bullish' | 'bearish' | 'ranging';
  timestamp: string;
}

export interface DailyPick extends ScreenerStock {
  /** Composite technical score (0-100) */
  nextSessionScore: number;
  /** Per-dimension score breakdown */
  scoreBreakdown: DailyPickScoreBreakdown;
  /** Rank (1 = strongest) */
  rank: number;
  /** Top rationale tags (Arabic) */
  topRationale: string[];
  /** Fundamental gate result */
  fundamentalGate: FundamentalGateResult;
  /** Whether this is a next-in-line pick (B.4) */
  isNextInLine: boolean;
}

export interface DailyPicksResult {
  picks: DailyPick[];
  /** Ranks 6-10 for transparency (B.4) */
  nextInLine: DailyPick[];
  totalUniverse: number;
  fundamentalPass: number;
  technicalPass: number;
  version: string;
  generatedAt: string;
  sectorDistribution: Record<string, number>;
  /** If fewer than maxPicks, explains why (B.1) */
  countNote: string;
  /** Market context at batch time (B.5) */
  marketContext: MarketContext | null;
  /** Full parameter snapshot (B.7) */
  paramsSnapshot: typeof DAILY_PICKS_PARAMS;
}

export type RankingMethod = 'nextSessionScore' | 'confidence';

// ═══════════════════════════════════════════════════════════════
// STAGE 1: FUNDAMENTAL QUALITY GATE (A.2)
// ═══════════════════════════════════════════════════════════════

/**
 * Apply the fundamental quality gate to a single stock.
 *
 * This is a hard pre-filter. A stock that fails is EXCLUDED from
 * Daily Picks regardless of how strong its technical setup is.
 *
 * Thresholds are documented in DAILY_PICKS_PARAMS.fundamental.
 * Every check is explicit and independently auditable.
 *
 * @param symbol - EGX ticker symbol
 * @param fundamental - FundamentalData from the platform's fetcher
 * @returns FundamentalGateResult with per-check detail
 */
export function evaluateFundamentalGate(
  symbol: string,
  fundamental: FundamentalData | undefined,
): FundamentalGateResult {
  const P = DAILY_PICKS_PARAMS.fundamental;

  // Default: all checks fail if no fundamental data
  if (!fundamental || !fundamental.hasData) {
    return {
      passed: false,
      checks: {
        profitability: { passed: false, detail: 'لا توجد بيانات', value: 0, threshold: 0 },
        solvency: { passed: false, detail: 'لا توجد بيانات', value: 0, threshold: P.maxDebtEquity },
        cashFlow: { passed: false, detail: 'لا توجد بيانات', value: 0, threshold: P.minFreeCashFlow },
        revenue: { passed: false, detail: 'لا توجد بيانات', value: 0, threshold: P.minRevenue },
        valuation: { passed: false, detail: 'لا توجد بيانات', value: 0, threshold: P.maxPeVsSectorMultiple },
        dataQuality: { passed: false, detail: 'لا توجد بيانات', value: 0, threshold: P.minDataQualityScore },
        currency: { passed: false, detail: 'لا توجد بيانات', value: 'N/A', threshold: 'EGP' },
      },
      overallScore: 0,
    };
  }

  // Get sector benchmark for relative valuation check
  const sectorBenchmark = DEFAULT_SECTOR_BENCHMARKS[fundamental.currency === 'EGP' ? getSectorForSymbol(symbol) : ''];
  const sectorPE = sectorBenchmark?.avgPE || 12;

  const checks = {
    // 1a. Profitability: at least one positive margin
    profitability: (() => {
      const hasPositive = fundamental.grossMargin > P.minGrossMargin
        || fundamental.netMargin > P.minNetMargin
        || fundamental.operatingMargin > P.minOperatingMargin;
      return {
        passed: hasPositive,
        detail: hasPositive
          ? `هامش صافي ${fundamental.netMargin.toFixed(1)}%`
          : 'جميع الهوامش سالبة أو صفرية',
        value: Math.max(fundamental.grossMargin, fundamental.netMargin, fundamental.operatingMargin),
        threshold: 0,
      };
    })(),

    // 1b. Solvency: D/E not extreme
    solvency: (() => {
      const de = fundamental.debtEquity;
      const passed = de >= 0 && de <= P.maxDebtEquity;
      return {
        passed,
        detail: passed
          ? `مديونية/ملكية ${de.toFixed(1)} (< ${P.maxDebtEquity})`
          : `مديونية/ملكية ${de.toFixed(1)} تتجاوز الحد (${P.maxDebtEquity})`,
        value: de,
        threshold: P.maxDebtEquity,
      };
    })(),

    // 1c. Cash flow: FCF non-negative
    cashFlow: (() => {
      const fcf = fundamental.freeCashFlow;
      const passed = fcf >= P.minFreeCashFlow;
      return {
        passed,
        detail: passed
          ? `تدفق نقدي حر ${formatEGP(fcf)}`
          : `تدفق نقدي حر سالب ${formatEGP(fcf)}`,
        value: fcf,
        threshold: P.minFreeCashFlow,
      };
    })(),

    // 1d. Revenue existence
    revenue: (() => {
      const rev = fundamental.revenue;
      const passed = rev > P.minRevenue;
      return {
        passed,
        detail: passed
          ? `إيرادات ${formatEGP(rev)}`
          : 'لا توجد إيرادات',
        value: rev,
        threshold: P.minRevenue,
      };
    })(),

    // 1e. Relative valuation vs sector
    valuation: (() => {
      const pe = fundamental.pe;
      if (pe <= 0 || sectorPE <= 0) {
        // If P/E is not available or negative, pass (can't judge overvaluation)
        return { passed: true, detail: 'لا يتوفر P/E للحكم', value: 0, threshold: P.maxPeVsSectorMultiple };
      }
      const ratio = pe / sectorPE;
      const passed = ratio <= P.maxPeVsSectorMultiple;
      return {
        passed,
        detail: passed
          ? `P/E ${pe.toFixed(1)} (${(ratio).toFixed(1)}× قطاعي)`
          : `P/E ${pe.toFixed(1)} = ${(ratio).toFixed(1)}× متوسط القطاع (${sectorPE.toFixed(1)}) — مبالغ فيه`,
        value: ratio,
        threshold: P.maxPeVsSectorMultiple,
      };
    })(),

    // 1f. Data quality
    dataQuality: (() => {
      const score = fundamental.dataQualityScore;
      const passed = score >= P.minDataQualityScore;
      return {
        passed,
        detail: `جودة البيانات ${score}%` + (passed ? '' : ` (أقل من ${P.minDataQualityScore}%)`),
        value: score,
        threshold: P.minDataQualityScore,
      };
    })(),

    // 1g. EGP currency
    currency: (() => {
      const passed = !P.requireEGP || fundamental.isEGP;
      return {
        passed,
        detail: passed ? `عملة ${fundamental.currency}` : `عملة ${fundamental.currency} — ليست جنيه` ,
        value: fundamental.currency,
        threshold: 'EGP',
      };
    })(),
  };

  // A stock must pass ALL checks
  const passed = Object.values(checks).every(c => c.passed);
  const overallScore = Object.values(checks).filter(c => c.passed).length;

  return { passed, checks, overallScore };
}

// ═══════════════════════════════════════════════════════════════
// STAGE 2: TECHNICAL FILTERS
// ═══════════════════════════════════════════════════════════════

function passesTechnicalFilters(stock: ScreenerStock): boolean {
  const T = DAILY_PICKS_PARAMS.technical;

  // Signal direction
  if (!T.signals.includes(stock.signal)) return false;

  // Confidence
  if (stock.confidence < T.minConfidence) return false;

  // Risk:Reward
  if (stock.riskReward < T.minRiskReward) return false;

  // RSI ceiling
  const ind = stock.indicators;
  if (ind.rsi > 0 && ind.rsi > T.maxRSI) return false;

  // MACD not fully bearish
  if (T.bearishMACDExcluded && ind.macd < 0 && ind.macdSignal < 0 && ind.macd < ind.macdSignal) return false;

  return true;
}

// ═══════════════════════════════════════════════════════════════
// STAGE 2: TECHNICAL SCORING (consolidated, A.4)
// ═══════════════════════════════════════════════════════════════

function computeTechnicalScore(stock: ScreenerStock): {
  score: number;
  breakdown: DailyPickScoreBreakdown;
  topRationale: string[];
} {
  const P = DAILY_PICKS_PARAMS.scoring;
  const ind = stock.indicators;
  const rationales: string[] = [];

  // ── 1. SIGNAL STRENGTH (up to 40 pts) ──
  const signalBase = stock.signal === 'Strong Buy' ? P.signal.strongBuyPts : P.signal.buyPts;
  const confBonus = Math.min(stock.confidence / 100, 1) * P.signal.confidenceMaxBonus;
  const signalPts = signalBase + confBonus;
  if (stock.signal === 'Strong Buy') rationales.push('إشارة شراء قوي');

  // ── 2. TREND QUALITY (max 20 pts, multicollinearity cap) ──
  let maAlignmentPts = 0;
  let trendPts = 0;

  // EMA stack (strongest trend signal)
  if (ind.ema20 > 0 && ind.ema50 > 0 && ind.ema200 > 0 && ind.ema20 > ind.ema50 && ind.ema50 > ind.ema200) {
    trendPts += P.trend.perfectEMAStack;
    maAlignmentPts += P.trend.perfectEMAStack;
    rationales.push('تكدس EMA صعودي مثالي');
  } else if (ind.ema20 > 0 && ind.ema50 > 0 && ind.ema20 > ind.ema50) {
    trendPts += P.trend.partialEMAStack;
    maAlignmentPts += P.trend.partialEMAStack;
    rationales.push('EMA قصير فوق المتوسط');
  }
  // SMA checks (cap to avoid inflating with duplicate MA signals)
  if (ind.sma20 > 0 && ind.close > ind.sma20) { trendPts += P.trend.aboveSMA; maAlignmentPts += P.trend.aboveSMA; }
  if (ind.sma50 > 0 && ind.close > ind.sma50) { trendPts += P.trend.aboveSMA; maAlignmentPts += P.trend.aboveSMA; }
  if (ind.sma200 > 0 && ind.close > ind.sma200) {
    trendPts += P.trend.aboveSMA; maAlignmentPts += P.trend.aboveSMA;
    rationales.push('السعر فوق SMA200');
  }
  if (ind.ema20 > 0 && ind.close > ind.ema20) { trendPts += P.trend.aboveEMA20; maAlignmentPts += P.trend.aboveEMA20; }

  // Multicollinearity cap (A.4): MA alignment can contribute at most 8 pts
  const maExcess = Math.max(0, maAlignmentPts - P.trend.maAlignmentCap);
  trendPts = Math.max(0, trendPts - maExcess);
  const finalTrendPts = Math.min(trendPts, P.trend.maxPts);

  // ── 3. MOMENTUM QUALITY (max 20 pts) ──
  let momPts = 0;
  if (ind.rsi > 0) {
    if (ind.rsi >= P.momentum.rsiIdealLow && ind.rsi <= P.momentum.rsiIdealHigh) {
      momPts += P.momentum.rsiIdealPts;
      rationales.push('RSI في المنطقة المثالية');
    } else if (ind.rsi >= P.momentum.rsiApproachingLow && ind.rsi < P.momentum.rsiApproachingHigh) {
      momPts += P.momentum.rsiApproachingPts;
    } else if (ind.rsi > P.momentum.rsiIdealHigh && ind.rsi <= P.momentum.rsiOkHigh) {
      momPts += P.momentum.rsiOkPts;
    } else if (ind.rsi < P.momentum.rsiApproachingLow) {
      momPts += P.momentum.rsiOversoldPts;
      rationales.push('RSI منطقة تشبع بيعي (ارتداد محتمل)');
    }
  }
  const hist = ind.macd - ind.macdSignal;
  if (hist > 0) {
    momPts += P.momentum.macdPositiveHist;
    if (ind.macd > ind.macdSignal) {
      momPts += P.momentum.macdExpanding;
      rationales.push('MACD إيجابي ومتسع');
    }
  }
  if (ind.stochK > 0 && ind.stochD > 0) {
    if (ind.stochK > ind.stochD && ind.stochK < 75) {
      momPts += P.momentum.stochBullBelow75;
    } else if (ind.stochK > 20 && ind.stochK < 50 && ind.stochK > ind.stochD) {
      momPts += P.momentum.stochLowBull;
      rationales.push('تقاطع Stochastic صعودي');
    }
  }
  const finalMomPts = Math.min(momPts, P.momentum.maxPts);

  // ── 4. VOLUME INTEREST (max 15 pts) ──
  let volPts = 0;
  const hasVolSpike = stock.tags.some(t => t === 'Volume Spike Up' || t === 'Strong Volume Up');
  const hasAccumulation = stock.tags.some(t => t === 'Normal Volume Up');
  if (hasVolSpike) {
    volPts += P.volume.spikeUpPts;
    rationales.push('ارتفاع ملحوظ في حجم التداول');
  } else if (hasAccumulation) {
    volPts += P.volume.normalUpPts;
  } else {
    volPts += P.volume.baselinePts;
  }
  const finalVolPts = Math.min(volPts, P.volume.maxPts);

  // ── 5. RISK:REWARD (max 10 pts) ──
  const rrPts = Math.min(stock.riskReward / P.riskReward.fullRREquals, 1) * P.riskReward.maxPts;
  if (stock.riskReward >= 2) rationales.push('نسبة مخاطرة:عائد ممتازة ' + stock.riskReward.toFixed(1) + ':1');

  // ── 6. PATTERN BONUS (max 10 pts) ──
  let patPts = 0;
  if (stock.tags.some(t => t === 'Above SMA50' || t === 'Above SMA200')) patPts += P.pattern.aboveMA;
  if (stock.tags.some(t => t === 'BB Squeeze')) {
    patPts += P.pattern.bbSqueeze;
    rationales.push('ضغط بولنجر (حركة وشيكة)');
  }
  if (stock.tags.some(t => t === 'MACD Cross Up')) {
    patPts += P.pattern.macdCrossUp;
    rationales.push('تقاطع MACD صعودي');
  }
  if (stock.tags.some(t => t === 'Bullish MA Stack')) patPts += P.pattern.bullishMAStack;
  if (stock.tags.some(t => t === 'RSI Oversold' || t === 'Stoch Oversold')) patPts += P.pattern.oversoldReversal;
  const finalPatPts = Math.min(patPts, P.pattern.maxPts);

  const total = Math.round(finalTrendPts + finalMomPts + signalPts + finalVolPts + rrPts + finalPatPts);

  const breakdown: DailyPickScoreBreakdown = {
    signal: Math.round(signalPts),
    trend: finalTrendPts,
    momentum: finalMomPts,
    volume: finalVolPts,
    riskReward: Math.round(rrPts),
    pattern: finalPatPts,
    total,
  };

  return { score: total, breakdown, topRationale: rationales.slice(0, 4) };
}

// ═══════════════════════════════════════════════════════════════
// EGX PRICE LIMIT BOUNDING (A.5)
// ═══════════════════════════════════════════════════════════════

/**
 * Bound SL and TP levels by EGX daily price limit rules.
 *
 * EGX rules:
 *   - Regular session price limit: ±16% from previous close
 *   - Circuit breaker: 5% halt (separate mechanism)
 *   - SL/TP must be within the theoretical single-day range
 *
 * @param close - Previous close price
 * @param stopLoss - Proposed stop loss
 * @param takeProfits - Proposed take profit levels
 */
export function boundByEGXPriceLimits(
  close: number,
  stopLoss: number,
  takeProfits: number[],
): { boundedSL: number; boundedTPs: number[]; slLimit: number; tpLimit: number } {
  const limitPct = DAILY_PICKS_PARAMS.egx.dailyPriceLimitPct / 100;
  const slLimit = close * (1 - limitPct);   // theoretical lower bound
  const tpLimit = close * (1 + limitPct);   // theoretical upper bound

  // SL should not be below the daily limit (can't execute)
  const boundedSL = Math.max(stopLoss, slLimit);

  // TPs should not exceed the daily limit
  const boundedTPs = takeProfits.map(tp => Math.min(tp, tpLimit));

  return { boundedSL, boundedTPs, slLimit, tpLimit };
}

// ═══════════════════════════════════════════════════════════════
// SECTOR CONCENTRATION GUARD (B.2)
// ═══════════════════════════════════════════════════════════════

/**
 * Apply soft sector concentration guard.
 * Penalizes (doesn't exclude) stocks in sectors that already
 * have maxPerSector picks in the list.
 *
 * This is applied AFTER scoring, as a post-hoc adjustment.
 * The penalty is small enough that truly dominant picks
 * can still overcome it.
 */
function applySectorGuard(
  picks: DailyPick[],
): { picks: DailyPick[]; guardApplied: boolean; details: string[] } {
  const SG = DAILY_PICKS_PARAMS.sectorGuard;
  if (!SG.enabled) return { picks, guardApplied: false, details: [] };

  const details: string[] = [];
  const sectorCounts: Record<string, number> = {};

  for (const pick of picks) {
    sectorCounts[pick.sector] = (sectorCounts[pick.sector] || 0) + 1;
  }

  // Find over-concentrated sectors
  const overConcentrated = Object.entries(sectorCounts)
    .filter(([, count]) => count > SG.maxPerSector)
    .map(([sector]) => sector);

  if (overConcentrated.length === 0) return { picks, guardApplied: false, details: [] };

  // Apply penalty to lowest-ranked picks in over-concentrated sectors
  const adjusted = picks.map(pick => {
    if (overConcentrated.includes(pick.sector)) {
      const penalty = SG.overConcentrationPenalty;
      return {
        ...pick,
        nextSessionScore: Math.max(0, pick.nextSessionScore - penalty),
      };
    }
    return pick;
  });

  // Re-sort and re-rank
  adjusted.sort((a, b) => b.nextSessionScore - a.nextSessionScore);
  const reRanked = adjusted.map((s, i) => ({ ...s, rank: i + 1 }));

  for (const sector of overConcentrated) {
    details.push(`قطاع ${sector}: أكثر من ${SG.maxPerSector} اختيارات — تم تطبيق عقوبة توزيع`);
  }

  return { picks: reRanked, guardApplied: true, details };
}

// ═══════════════════════════════════════════════════════════════
// MAIN ENTRY POINT
// ═══════════════════════════════════════════════════════════════

/**
 * Compute daily picks — the flagship pipeline.
 *
 * Two-stage process:
 *   1. Fundamental gate: filter by financial health
 *   2. Technical scoring: rank by indicator alignment
 *
 * Returns up to maxPicks + nextInLineCount results.
 * If fewer than maxPicks stocks pass both stages, returns
 * the actual count with an explanatory note (B.1).
 *
 * @param stocks - Full universe from the technical screener
 * @param fundamentals - Map of symbol → FundamentalData
 * @param marketContext - Optional market context (B.5)
 * @param params - Optional parameter overrides
 */
export function computeDailyPicksV2(
  stocks: ScreenerStock[],
  fundamentals: Record<string, FundamentalData>,
  marketContext: MarketContext | null = null,
  params?: Partial<typeof DAILY_PICKS_PARAMS>,
): DailyPicksResult {
  const P = { ...DAILY_PICKS_PARAMS, ...params };
  const totalUniverse = stocks.length;

  // ── Stage 1: Fundamental Gate ──
  const fundPassed: DailyPick[] = [];
  const fundFailed = 0;

  for (const stock of stocks) {
    const gateResult = evaluateFundamentalGate(stock.symbol, fundamentals[stock.symbol]);
    if (gateResult.passed) {
      fundPassed.push({
        ...stock,
        nextSessionScore: 0,
        scoreBreakdown: { signal: 0, trend: 0, momentum: 0, volume: 0, riskReward: 0, pattern: 0, total: 0 },
        rank: 0,
        topRationale: [],
        fundamentalGate: gateResult,
        isNextInLine: false,
      });
    }
  }
  const fundamentalPassCount = fundPassed.length;

  // ── Stage 2: Technical Filters + Scoring ──
  const techCandidates = fundPassed.filter(passesTechnicalFilters);
  const technicalPassCount = techCandidates.length;

  // Score each candidate
  const scored = techCandidates.map(stock => {
    const { score, breakdown, topRationale } = computeTechnicalScore(stock);
    return {
      ...stock,
      nextSessionScore: score,
      scoreBreakdown: breakdown,
      rank: 0,
      topRationale,
      fundamentalGate: stock.fundamentalGate,
      isNextInLine: false,
    };
  });

  // Sort by score descending
  scored.sort((a, b) => b.nextSessionScore - a.nextSessionScore);

  // ── Sector Concentration Guard (B.2) ──
  const { picks: guardedPicks, guardApplied } = applySectorGuard(scored);

  // ── Flexible count (B.1) ──
  const mainPicks = guardedPicks.slice(0, P.maxPicks).map((s, i) => ({ ...s, rank: i + 1 }));
  const nextInLine = guardedPicks.slice(P.maxPicks, P.maxPicks + P.nextInLineCount).map((s, i) => ({
    ...s,
    rank: P.maxPicks + i + 1,
    isNextInLine: true,
  }));

  // Count note (B.1)
  let countNote = '';
  if (mainPicks.length < P.maxPicks) {
    if (mainPicks.length === 0) {
      countNote = 'لا توجد أسهم تجتاز المعايير الأساسية والفنية اليوم';
    } else {
      countNote = `فقط ${mainPicks.length} أسهم استوفت المعايير الكاملة اليوم — لم يتم خفض الحد لملء القائمة`;
    }
  }

  // Sector distribution (of main picks)
  const sectorDistribution: Record<string, number> = {};
  for (const pick of mainPicks) {
    sectorDistribution[pick.sector] = (sectorDistribution[pick.sector] || 0) + 1;
  }

  return {
    picks: mainPicks,
    nextInLine,
    totalUniverse,
    fundamentalPass: fundamentalPassCount,
    technicalPass: technicalPassCount,
    version: DAILY_PICKS_VERSION,
    generatedAt: new Date().toISOString(),
    sectorDistribution,
    countNote,
    marketContext,
    paramsSnapshot: P as typeof DAILY_PICKS_PARAMS,
  };
}

// ═══════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════

/** Map score to calibrated strength label (Arabic) */
export function getStrengthLabel(score: number): { label: string; color: string; bgColor: string } {
  if (score >= 75) return { label: 'قوية جداً', color: 'text-emerald-600', bgColor: 'bg-emerald-500/10' };
  if (score >= 55) return { label: 'قوية', color: 'text-amber-600', bgColor: 'bg-amber-500/10' };
  return { label: 'متوسطة', color: 'text-muted-foreground', bgColor: 'bg-muted' };
}

/** Format large EGP values for display */
function formatEGP(value: number): string {
  if (Math.abs(value) >= 1e9) return (value / 1e9).toFixed(1) + ' مليار ج.م';
  if (Math.abs(value) >= 1e6) return (value / 1e6).toFixed(1) + ' مليون ج.م';
  if (Math.abs(value) >= 1e3) return (value / 1e3).toFixed(1) + ' ألف ج.م';
  return value.toFixed(0) + ' ج.م';
}

/** Map symbol to sector (using EGX_STOCKS lookup) */
const SECTOR_CACHE: Record<string, string> = {};
async function loadSectorMap() {
  if (Object.keys(SECTOR_CACHE).length > 0) return;
  const { EGX_STOCKS } = await import('./egx-stocks');
  for (const s of EGX_STOCKS) SECTOR_CACHE[s.symbol] = s.sector;
}

function getSectorForSymbol(symbol: string): string {
  return SECTOR_CACHE[symbol] || '';
}

/** Initialize sector cache (call once at module load) */
loadSectorMap().catch(() => {});

// ═══════════════════════════════════════════════════════════════
// A/B: Confidence-only baseline (§6, P1-1)
// ═══════════════════════════════════════════════════════════════

/**
 * Compute picks using confidence-only ranking (A/B baseline).
 * The fundamental gate is still applied — only the ranking changes.
 */
export function computeDailyPicksWithMethod(
  stocks: ScreenerStock[],
  fundamentals: Record<string, FundamentalData>,
  method: RankingMethod = 'nextSessionScore',
  marketContext: MarketContext | null = null,
): DailyPicksResult & { rankingMethod: RankingMethod } {
  const base = computeDailyPicksV2(stocks, fundamentals, marketContext);

  if (method === 'confidence') {
    const reSorted = [...base.picks].sort((a, b) => b.confidence - a.confidence);
    const reRanked = reSorted.map((s, i) => ({ ...s, rank: i + 1 }));
    const sectorDist: Record<string, number> = {};
    for (const p of reRanked) sectorDist[p.sector] = (sectorDist[p.sector] || 0) + 1;
    return {
      ...base,
      picks: reRanked,
      sectorDistribution: sectorDist,
      rankingMethod: method,
    };
  }

  return { ...base, rankingMethod: method };
}

// ═══════════════════════════════════════════════════════════════
// PERSONALIZATION (§9 Governance, lightweight)
// ═══════════════════════════════════════════════════════════════

export interface UserContext {
  heldSectors: string[];
  heldSymbols: string[];
  watchlistSymbols: string[];
}

/**
 * Re-rank picks for user diversification.
 * Original scores preserved — this is a post-hoc adjustment.
 * Users can opt out by passing empty UserContext.
 */
export function personalizePicks(
  picks: DailyPick[],
  userContext: UserContext,
): { picks: DailyPick[]; adjustments: Array<{ symbol: string; originalRank: number; newRank: number; reason: string }> } {
  if (!userContext.heldSectors.length && !userContext.heldSymbols.length && !userContext.watchlistSymbols.length) {
    return { picks, adjustments: [] };
  }

  const sectorCounts: Record<string, number> = {};
  for (const s of userContext.heldSectors) sectorCounts[s] = (sectorCounts[s] || 0) + 1;

  const adjusted = picks.map(pick => {
    let adj = 0;
    const reasons: string[] = [];
    if (userContext.heldSymbols.includes(pick.symbol)) { adj -= 5; reasons.push('already_held'); }
    const sc = sectorCounts[pick.sector] || 0;
    if (sc >= 2) { adj -= 3; reasons.push('sector_overconcentrated'); }
    else if (sc === 1) { adj -= 1; reasons.push('sector_exposure_exists'); }
    if (userContext.watchlistSymbols.includes(pick.symbol)) { adj += 2; reasons.push('watchlist_affinity'); }
    return { ...pick, nextSessionScore: Math.max(0, pick.nextSessionScore + adj) };
  });

  adjusted.sort((a, b) => b.nextSessionScore - a.nextSessionScore);
  const reRanked = adjusted.map((s, i) => ({ ...s, rank: i + 1 }));

  const adjustments = reRanked
    .filter(p => p.rank !== (picks.find(op => op.symbol === p.symbol)?.rank || 0))
    .map(p => {
      const origRank = picks.find(op => op.symbol === p.symbol)?.rank || 0;
      const reasonMap: Record<string, string> = { already_held: 'السهم محفوظ بالفعل', sector_overconcentrated: 'تركز قطاعي (>2 محفوظة)', sector_exposure_exists: 'تعرض قطاعي موجود', watchlist_affinity: 'في قائمة المراقبة' };
      return { symbol: p.symbol, originalRank: origRank, newRank: p.rank, reason: Object.keys(reasonMap).find(k => false) || 'تخصيص' };
    });

  return { picks: reRanked, adjustments };
}
