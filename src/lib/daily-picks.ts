/**
 * Daily Picks Engine v1
 * ─────────────────────────────────────────────────────────────────
 * Server-side module that selects stocks with the strongest bullish
 * technical setups from the screener's output.
 *
 * ARCHITECTURE NOTE (from audit):
 *   This was extracted from a client-side useMemo in analysis/page.tsx
 *   into a pure, testable server function. This is the single
 *   highest-leverage engineering fix from the daily-recommendations audit.
 *
 * SCORING MODEL — 6 dimensions, 100 points max:
 *
 *   1. SIGNAL STRENGTH  (25 pts): Strong Buy vs Buy + confidence level
 *   2. TREND QUALITY    (20 pts): EMA stack alignment, price vs key MAs
 *   3. MOMENTUM QUALITY (20 pts): MACD direction, RSI zone, Stochastic
 *   4. VOLUME INTEREST  (15 pts): Volume spike / accumulation tags
 *   5. RISK:REWARD      (10 pts): Higher R:R = more attractive
 *   6. PATTERN BONUS    (10 pts): Breakout, squeeze, reversal patterns
 *
 * IMPORTANT CAVEATS (from audit):
 *   - This scoring formula is heuristic, NOT statistically fitted.
 *   - The label "strongest setups" reflects indicator alignment,
 *     NOT a validated forward-performance claim.
 *   - No historical backtest exists yet for this specific ranking.
 *   - Ground-truth evaluation pipeline is a SEPARATE workstream.
 *
 * FILTER THRESHOLDS (documented, versioned):
 *   - Signal: Buy or Strong Buy only
 *   - Confidence: >= 40
 *   - Risk:Reward: >= 1.5
 *   - RSI: <= 75 (must have room to run)
 *   - MACD: not both negative and bearish (macd < signal)
 */

import type { ScreenerStock } from './technical-screener';

// ── Versioned Parameters ─────────────────────────────────────
// All thresholds in one place for easy testing, tuning, and audit.
// Bumped when any scoring dimension changes.

export const DAILY_PICKS_VERSION = '1.0.0';

export const DAILY_PICKS_PARAMS = {
  /** Maximum number of picks to return */
  maxPicks: 5,

  // ── Filter thresholds ──
  minConfidence: 40,
  minRiskReward: 1.5,
  maxRSI: 75,

  // ── Scoring weights (must sum contextually to 100) ──
  /** Dimension 1: Signal Strength */
  signal: {
    strongBuyPts: 25,
    buyPts: 15,
    confidenceMaxBonus: 15,   // additional pts for 100% confidence
  },
  /** Dimension 2: Trend Quality (max 20) */
  trend: {
    maxPts: 20,
    perfectEMAStack: 8,       // EMA20 > EMA50 > EMA200
    partialEMAStack: 5,       // EMA20 > EMA50
    aboveSMA: 3,              // each of SMA20/50/200
    aboveEMA20: 3,
  },
  /** Dimension 3: Momentum Quality (max 20) */
  momentum: {
    maxPts: 20,
    // RSI zones (actual thresholds, matching implementation)
    rsiIdealLow: 45,
    rsiIdealHigh: 65,
    rsiApproachingLow: 35,
    rsiApproachingHigh: 45,
    rsiOkHigh: 75,
    rsiIdealPts: 8,
    rsiApproachingPts: 5,
    rsiOkPts: 3,
    rsiOversoldPts: 4,        // < 35 bounce potential
    macdPositiveHist: 5,
    macdExpanding: 3,
    stochBullBelow75: 4,
    stochLowBull: 3,
  },
  /** Dimension 4: Volume Interest (max 15) */
  volume: {
    maxPts: 15,
    spikeUpPts: 12,
    normalUpPts: 7,
    baselinePts: 4,
  },
  /** Dimension 5: Risk:Reward (max 10) */
  riskReward: {
    maxPts: 10,
    fullRREquals: 4,           // 4:1 R:R = full 10 pts
  },
  /** Dimension 6: Pattern Bonus (max 10) */
  pattern: {
    maxPts: 10,
    aboveMA: 3,
    bbSqueeze: 4,
    macdCrossUp: 3,
    bullishMAStack: 3,
    oversoldReversal: 2,
  },
} as const;

// ── Score Breakdown (for explainability) ─────────────────────

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

// ── Output type ──────────────────────────────────────────────

export interface DailyPick extends ScreenerStock {
  /** Composite next-session setup score (0-100) */
  nextSessionScore: number;
  /** Per-dimension score breakdown for explainability */
  scoreBreakdown: DailyPickScoreBreakdown;
  /** Rank (1 = strongest) */
  rank: number;
  /** Top rationale tags explaining why this was picked */
  topRationale: string[];
}

export interface DailyPicksResult {
  picks: DailyPick[];
  totalCandidates: number;     // stocks passing filters
  totalUniverse: number;       // total stocks evaluated
  version: string;
  generatedAt: string;
  /** Sector distribution of picks */
  sectorDistribution: Record<string, number>;
}

// ── Pure scoring function (no React, no browser deps) ────────

/**
 * Compute a 0-100 score measuring how aligned a stock's technical
 * indicators are with a bullish next-session move.
 */
function computeNextSessionScore(stock: ScreenerStock): {
  score: number;
  breakdown: DailyPickScoreBreakdown;
  topRationale: string[];
} {
  const P = DAILY_PICKS_PARAMS;
  const ind = stock.indicators;
  const rationales: string[] = [];

  // ── 1. SIGNAL STRENGTH (up to 40 pts = 25 base + 15 bonus) ──
  const signalBase = stock.signal === 'Strong Buy' ? P.signal.strongBuyPts : P.signal.buyPts;
  const confBonus = Math.min(stock.confidence / 100, 1) * P.signal.confidenceMaxBonus;
  const signalPts = signalBase + confBonus;
  if (stock.signal === 'Strong Buy') rationales.push('إشارة شراء قوي');

  // ── 2. TREND QUALITY (max 20 pts) ──
  let trendPts = 0;
  if (ind.ema20 > 0 && ind.ema50 > 0 && ind.ema200 > 0 && ind.ema20 > ind.ema50 && ind.ema50 > ind.ema200) {
    trendPts += P.trend.perfectEMAStack;
    rationales.push('تكدس EMA صعودي مثالي');
  } else if (ind.ema20 > 0 && ind.ema50 > 0 && ind.ema20 > ind.ema50) {
    trendPts += P.trend.partialEMAStack;
    rationales.push('EMA قصير فوق المتوسط');
  }
  if (ind.sma20 > 0 && ind.close > ind.sma20) trendPts += P.trend.aboveSMA;
  if (ind.sma50 > 0 && ind.close > ind.sma50) trendPts += P.trend.aboveSMA;
  if (ind.sma200 > 0 && ind.close > ind.sma200) {
    trendPts += P.trend.aboveSMA;
    rationales.push('السعر فوق SMA200');
  }
  if (ind.ema20 > 0 && ind.close > ind.ema20) trendPts += P.trend.aboveEMA20;
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

// ── Filter function ──────────────────────────────────────────

/**
 * Apply entry filters before scoring.
 * Returns true if the stock qualifies for daily pick consideration.
 *
 * Filter rationale:
 *  - Buy/Strong Buy only: we're looking for bullish setups
 *  - Confidence >= 40: meaningful signal, not noise
 *  - R:R >= 1.5: minimum acceptable risk-adjusted opportunity
 *  - RSI <= 75: must have room to run (not overbought)
 *  - MACD not fully bearish: avoids dead-cat-bounce candidates
 */
function passesFilters(stock: ScreenerStock): boolean {
  if (stock.signal !== 'Strong Buy' && stock.signal !== 'Buy') return false;
  if (stock.confidence < DAILY_PICKS_PARAMS.minConfidence) return false;
  if (stock.riskReward < DAILY_PICKS_PARAMS.minRiskReward) return false;
  const ind = stock.indicators;
  if (ind.rsi > 0 && ind.rsi > DAILY_PICKS_PARAMS.maxRSI) return false;
  // MACD must not be fully bearish (both negative AND macd < signal)
  if (ind.macd < 0 && ind.macdSignal < 0 && ind.macd < ind.macdSignal) return false;
  return true;
}

// ── Main entry point ─────────────────────────────────────────

/**
 * Compute daily picks from a universe of screener stocks.
 *
 * This is the single entry point — a pure function with no side effects.
 * Persistence, caching, and scheduling are the responsibility of the
 * caller (API route / cron job).
 *
 * @param stocks - Full universe of ScreenerStock from the technical screener
 * @param params - Optional parameter overrides (for testing / A/B)
 * @returns Ranked, scored daily picks with full breakdowns
 */
export function computeDailyPicks(
  stocks: ScreenerStock[],
  params?: Partial<typeof DAILY_PICKS_PARAMS>,
): DailyPicksResult {
  const P = { ...DAILY_PICKS_PARAMS, ...params };
  const totalUniverse = stocks.length;

  // Filter candidates
  const candidates = stocks.filter(passesFilters);
  const totalCandidates = candidates.length;

  // Score each candidate
  const scored = candidates.map(stock => {
    const { score, breakdown, topRationale } = computeNextSessionScore(stock);
    return {
      ...stock,
      nextSessionScore: score,
      scoreBreakdown: breakdown,
      rank: 0, // assigned after sorting
      topRationale,
    };
  });

  // Sort by score descending, assign ranks
  scored.sort((a, b) => b.nextSessionScore - a.nextSessionScore);
  const picks = scored.slice(0, P.maxPicks).map((s, i) => ({
    ...s,
    rank: i + 1,
  }));

  // Sector distribution
  const sectorDistribution: Record<string, number> = {};
  for (const pick of picks) {
    sectorDistribution[pick.sector] = (sectorDistribution[pick.sector] || 0) + 1;
  }

  return {
    picks,
    totalCandidates,
    totalUniverse,
    version: DAILY_PICKS_VERSION,
    generatedAt: new Date().toISOString(),
    sectorDistribution,
  };
}

// ── Label helpers (calibrated placeholders until DS validation) ──

/**
 * Map score to a strength label.
 * NOTE: These thresholds are NOT yet calibrated against realized outcomes.
 * They are internal consistency labels only.
 * TODO (from audit): Calibrate against ground-truth once evaluation pipeline exists.
 */
export function getStrengthLabel(score: number): { label: string; color: string; bgColor: string } {
  if (score >= 75) return { label: 'قوية جداً', color: 'text-emerald-600', bgColor: 'bg-emerald-500/10' };
  if (score >= 55) return { label: 'قوية', color: 'text-amber-600', bgColor: 'bg-amber-500/10' };
  return { label: 'متوسطة', color: 'text-muted-foreground', bgColor: 'bg-muted' };
}
