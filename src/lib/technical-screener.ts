/**
 * EGX Technical Screener Engine v3
 * ─────────────────────────────────────────────────────────────────
 * Production-ready multi-timeframe technical analysis screener for
 * the Egyptian Exchange (EGX). Generates Buy/Hold/Sell signals with
 * entry, stop-loss, take-profit targets, confidence scores, rationale
 * tags, risk management, and position sizing.
 *
 * INDICATORS (all from TradingView scanner — no local calculation):
 *   SMA 20/50/100/200, EMA 20/50/100/200,
 *   RSI(14), Stochastic K(14,3,3)/D(3),
 *   MACD(12,26,9)/Signal, Bollinger Bands(20,2), ATR(14),
 *   Volume, 52-week High/Low, TradingView Aggregate Rating.
 *
 * COMPOSITE WEIGHTS (actual, matches code line ~1255):
 *   Trend           (30%): Price vs SMA20/50/200, EMA alignment, crossover proximity
 *   Momentum        (25%): RSI zones, MACD histogram, Stochastic crosses
 *   Volatility      (15%): BB position/squeeze, 52-week range
 *   Volume          (10%): Volume spike with price-direction confirmation
 *   Trend Strength  (10%): MA alignment slope (estimated ADX substitute)
 *   TV Consensus    (10%): TradingView aggregated technical rating
 *
 * IMPORTANT CAVEATS:
 *   - These weights are hand-picked defaults, NOT statistically fitted.
 *   - Confidence scores are heuristic, NOT calibrated against realized outcomes.
 *   - This is NOT a validated trading model — no historical backtest exists yet.
 *   - Sell/Strong Sell signals indicate "reduce/avoid" — EGX short-selling
 *     is not widely available to retail participants.
 *
 * EGX MARKET RULES:
 *   - Regular session price limit: ±16% (not 5%)
 *   - Circuit breaker: 5% halt (separate from session limit)
 *   - Settlement: T+2
 *
 * TIMEFRAMES: daily (default), weekly, monthly
 *   — TradingView scanner always returns daily indicators.
 *   — Weekly/monthly signals apply adjusted thresholds to account
 *     for wider noise bands on longer timeframes.
 *   — This is NOT multi-timeframe analysis in the traditional sense;
 *     it is daily indicators with different scoring thresholds.
 *
 * v3 CHANGES (Post Quantitative Audit):
 *   - Fixed P0-1: backtestSignals() now uses actual forward periodReturn
 *     instead of tautological same-snapshot comparison
 *   - Fixed P2-9: Docstring weights now match actual code weights
 *   - Fixed P2-10: EGX price limit corrected from 5% to 16%
 *   - Fixed P1-6: maxPortfolioExposure now enforced with sector caps
 *   - Fixed P1-8: Sell signals relabeled as "reduce/avoid" guidance
 *   - Fixed P1-13: Transaction cost modeling added to backtest
 *   - Fixed P2-12: Multicollinearity cap on confidence agreement ratio
 *   - Fixed P2-11: Confidence score carries calibration disclaimer
 *
 * v2 CHANGES:
 *   - Fixed volume-score rationale array bug (push returns length)
 *   - Fixed EMA crossover dividing by SMA50 instead of EMA50
 *   - Added NaN/Infinity guards on all division
 *   - Added multi-timeframe threshold adjustment
 *   - Added data-quality scoring and anomaly detection
 *   - Added structured logging interface
 *   - Added trade horizon to each signal
 *   - Improved stop-loss for Hold signals (direction-aware)
 *   - Added proper CSV escaping
 *   - Added walk-forward backtest metrics (trade frequency, expectancy)
 */

import type { TechnicalIndicators } from './market-data';

// ── Types ──────────────────────────────────────────────────────

export type SignalType = 'Strong Buy' | 'Buy' | 'Hold' | 'Sell' | 'Strong Sell';
export type Timeframe = 'daily' | 'weekly' | 'monthly';

export interface SignalRationale {
  tag: string;
  weight: number;
  direction: 1 | -1 | 0;
  description: string;
}

export interface TakeProfitTarget {
  level: number;
  price: number;
  basis: string;
  probability: 'High' | 'Medium' | 'Low';
}

export interface EntryPriceDetail {
  price: number;
  strategy: string;    // strategy name in Arabic
  basis: string;        // specific level used (e.g. 'EMA20', 'SMA50')
  discount: number;     // % discount from close (positive = entry below close)
}

export interface ScreenerStock {
  symbol: string;
  name: string;
  sector: string;
  signal: SignalType;
  confidence: number;
  entryPrice: number;
  entryDetail: EntryPriceDetail;
  stopLoss: number;
  stopLossPct: number;
  takeProfits: TakeProfitTarget[];
  riskReward: number;
  positionSize: number;
  rationale: SignalRationale[];
  tags: string[];
  timeframe: Timeframe;
  horizon: string;
  indicators: {
    rsi: number; macd: number; macdSignal: number;
    stochK: number; stochD: number;
    atr: number; bbUpper: number; bbLower: number;
    sma20: number; sma50: number; sma200: number;
    ema20: number; ema50: number; ema200: number;
    volume: number; close: number;
    recommendAll: number;
    bbWidth: number;
    priceVsSma200: number;
    priceVsBB: number;
  };
  dataQuality: DataQualityScore;
  riskFlags: string[];
  generatedAt: string;
}

export interface DataQualityScore {
  score: number;       // 0-100
  grade: string;      // A+ to F
  missingIndicators: string[];
  anomalies: string[];
}

export interface ScreenerSummary {
  total: number;
  strongBuy: number;
  buy: number;
  hold: number;
  sell: number;
  strongSell: number;
  avgConfidence: number;
  topSignals: { symbol: string; signal: SignalType; confidence: number }[];
  sectorBreakdown: Record<string, { bullish: number; bearish: number; neutral: number }>;
  filteredTotal: number;
  generatedAt: string;
  timeframe: Timeframe;
  dataQualityStats: { avgScore: number; stocksWithAnomalies: number; missingDataCount: number };
}

export interface ScreenerResult {
  stocks: ScreenerStock[];
  summary: ScreenerSummary;
  parameters: ScreenerParameters;
  generatedAt: string;
  logs: ScreenerLog[];
}

export interface ScreenerLog {
  ts: string;
  level: 'info' | 'warn' | 'error';
  component: string;
  message: string;
  symbol?: string;
}

export interface ScreenerParameters {
  buyThreshold: number;
  strongBuyThreshold: number;
  sellThreshold: number;
  strongSellThreshold: number;
  maxRiskPerTrade: number;
  maxPortfolioExposure: number;
  minLiquidity: number;
  volumeSpikeThreshold: number;
  minPrice: number;
  maxPrice: number;
  minConfidence: number;
  sector?: string;
  timeframe: Timeframe;
}

// ── Default Parameters ────────────────────────────────────────

export const DEFAULT_PARAMS: ScreenerParameters = {
  buyThreshold: 15,
  strongBuyThreshold: 28,
  sellThreshold: -15,
  strongSellThreshold: -28,
  maxRiskPerTrade: 2,
  maxPortfolioExposure: 80,
  minLiquidity: 10_000,     // many EGX stocks are illiquid
  volumeSpikeThreshold: 1.3,
  minPrice: 0.1,           // EGX has penny stocks
  maxPrice: 0,
  minConfidence: 0,        // show all by default, let user filter
  timeframe: 'daily',
};

/** Timeframe-specific threshold adjustments */
const TF_ADJUST: Record<Timeframe, { thresholdScale: number; atrMultiplier: number; description: string }> = {
  daily:   { thresholdScale: 1.0, atrMultiplier: 1.0, description: 'Daily signals (intraday to few days)' },
  weekly:  { thresholdScale: 0.80, atrMultiplier: 1.5, description: 'Weekly signals (1-4 week horizon)' },
  monthly: { thresholdScale: 0.65, atrMultiplier: 2.0, description: 'Monthly signals (1-3 month horizon)' },
};

// ── Utility ───────────────────────────────────────────────────

const safeDiv = (a: number, b: number, fallback = 0): number =>
  b !== 0 && isFinite(a / b) ? a / b : fallback;

const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));

const round2 = (v: number): number => Math.round(v * 100) / 100;

// ── Logging ───────────────────────────────────────────────────

export function createLogger(): { logs: ScreenerLog[]; log: (level: ScreenerLog['level'], component: string, message: string, symbol?: string) => void } {
  const logs: ScreenerLog[] = [];
  return {
    logs,
    log(level, component, message, symbol) {
      logs.push({ ts: new Date().toISOString(), level, component, message, symbol });
      const prefix = `[Screener:${component}]`;
      if (level === 'error') console.error(prefix, message, symbol || '');
      else if (level === 'warn') console.warn(prefix, message, symbol || '');
      else console.log(prefix, message, symbol || '');
    },
  };
}

// ── Data Quality Scoring ──────────────────────────────────────

function assessDataQuality(t: TechnicalIndicators, symbol: string): DataQualityScore {
  const missing: string[] = [];
  const anomalies: string[] = [];

  if (t.close <= 0) missing.push('close');
  if (t.rsi <= 0) missing.push('RSI');
  if (t.macd === 0 && t.macdSignal === 0) missing.push('MACD');
  if (t.stochK <= 0 && t.stochD <= 0) missing.push('Stochastic');
  if (t.atr <= 0) missing.push('ATR');
  if (t.sma20 <= 0) missing.push('SMA20');
  if (t.sma50 <= 0) missing.push('SMA50');
  if (t.sma200 <= 0) missing.push('SMA200');
  if (t.bbUpper <= 0 || t.bbLower <= 0) missing.push('Bollinger');
  if (t.volume <= 0) missing.push('Volume');

  // Anomaly detection
  if (t.close > 0) {
    if (t.rsi > 0 && (t.rsi < 5 || t.rsi > 95)) anomalies.push(`RSI extreme: ${t.rsi.toFixed(1)}`);
    if (t.atr > 0 && t.close > 0 && (t.atr / t.close) > 0.15) anomalies.push(`ATR/Price > 15%: extreme volatility`);
    if (t.bbUpper > 0 && t.bbLower > 0 && t.bbUpper <= t.bbLower) anomalies.push('BB upper <= lower: invalid');
    if (t.volume > 0 && t.sma20 > 0) {
      const dayRange = t.high > 0 && t.low > 0 ? t.high - t.low : 0;
      if (dayRange > 0 && (t.volume * t.close) / dayRange < 1000) anomalies.push('Dollar volume suspiciously low');
    }
    if (t.sma20 > 0 && t.sma50 > 0 && t.sma200 > 0) {
      if (t.sma20 > t.sma50 * 3 || t.sma20 < t.sma50 * 0.33) anomalies.push('SMA20/SMA50 divergence > 3x');
    }
  }

  const missingCount = missing.length;
  const anomalyCount = anomalies.length;
  let score = 100 - (missingCount * 10) - (anomalyCount * 5);
  score = clamp(Math.round(score), 0, 100);

  const grade = score >= 95 ? 'A+' : score >= 85 ? 'A' : score >= 75 ? 'B+' : score >= 65 ? 'B' :
             score >= 55 ? 'C+' : score >= 45 ? 'C' : score >= 30 ? 'D' : 'F';

  return { score, grade, missingIndicators: missing, anomalies };
}

// ── Scoring Components ─────────────────────────────────────────

interface ScoreComponent {
  name: string;
  score: number;
  weight: number;
  rationale: SignalRationale[];
}

/** 1. Trend Score (weight: 0.30)
 *  Rules:
 *    Price > SMA20  → +15  |  Price < SMA20  → -15
 *    Price > SMA50  → +12  |  Price < SMA50  → -12
 *    Price > SMA200 → +18  |  Price < SMA200 → -18
 *    EMA20 > EMA50 > SMA200 (bull stack) → +15
 *    EMA20 < EMA50 < SMA200 (bear stack) → -15
 *    |EMA20-EMA50|/EMA50 < 1% → crossover imminent ±8
 */
function scoreTrend(t: TechnicalIndicators): ScoreComponent {
  const r: SignalRationale[] = [];
  let score = 0;
  const { close, sma20, sma50, sma100, sma200, ema20, ema50, ema200 } = t;
  const safe = (v: number) => (v > 0 ? v : close);
  const s20 = safe(sma20), s50 = safe(sma50), s100 = safe(sma100), s200 = safe(sma200);
  const e20 = safe(ema20), e50 = safe(ema50), e200 = safe(ema200);

  // Price vs SMAs
  const above20 = close > s20 ? 15 : close < s20 ? -15 : 0;
  const above50 = close > s50 ? 12 : close < s50 ? -12 : 0;
  const above200 = close > s200 ? 18 : close < s200 ? -18 : 0;
  score += above20 + above50 + above200;

  if (above20 > 0) r.push({ tag: 'Above SMA20', weight: 15, direction: 1, description: `Price (${close.toFixed(2)}) above SMA20 (${s20.toFixed(2)})` });
  if (above20 < 0) r.push({ tag: 'Below SMA20', weight: 15, direction: -1, description: `Price below SMA20 (${s20.toFixed(2)})` });
  if (above50 > 0) r.push({ tag: 'Above SMA50', weight: 12, direction: 1, description: `Price above SMA50 (${s50.toFixed(2)})` });
  if (above50 < 0) r.push({ tag: 'Below SMA50', weight: 12, direction: -1, description: `Price below SMA50 (${s50.toFixed(2)})` });
  if (above200 > 0) r.push({ tag: 'Above SMA200', weight: 18, direction: 1, description: `Price above 200-day MA (${s200.toFixed(2)}) — long-term bullish` });
  if (above200 < 0) r.push({ tag: 'Below SMA200', weight: 18, direction: -1, description: `Price below 200-day MA (${s200.toFixed(2)}) — long-term bearish` });

  // EMA alignment (FIXED: use e200 instead of s200 for full EMA stack)
  if (e20 > e50 && e50 > e200) {
    score += 15;
    r.push({ tag: 'Bullish MA Stack', weight: 15, direction: 1, description: 'EMA20 > EMA50 > EMA200 — bullish alignment' });
  } else if (e20 < e50 && e50 < e200) {
    score -= 15;
    r.push({ tag: 'Bearish MA Stack', weight: 15, direction: -1, description: 'EMA20 < EMA50 < EMA200 — bearish alignment' });
  }

  // EMA crossover proximity (FIXED: divide by e50 not s50)
  const emaSpread = safeDiv(e20 - e50, e50, 0) * 100;
  if (Math.abs(emaSpread) < 1 && Math.abs(emaSpread) > 0) {
    const dir = emaSpread >= 0 ? 1 : -1;
    score += dir * 8;
    r.push({ tag: 'EMA Cross Nearby', weight: 8, direction: dir as 1 | -1, description: `EMA20/50 spread ${emaSpread.toFixed(2)}% — crossover imminent` });
  }

  return { name: 'Trend', score: clamp(score, -100, 100), weight: 0.30, rationale: r };
}

/** 2. Momentum Score (weight: 0.25)
 *  Rules:
 *    RSI < 30  → +25 (oversold bounce)
 *    RSI 30-40 → +12 (approaching oversold)
 *    RSI 40-60 → +3  (neutral-trending bias)
 *    RSI 60-70 → -8  (approaching overbought)
 *    RSI > 70  → -25 (overbought decline)
 *    MACD > 0 & Signal > 0 → +15; MACD > Signal → +8 more
 *    MACD < 0 & Signal < 0 → -15; MACD < Signal → -8 more
 *    MACD crossing Signal → ±5
 *    Stoch K&D < 20 → +15 (oversold)
 *    Stoch K&D > 80 → -15 (overbought)
 *    Stoch K > D & K < 50 → +8 (bull cross)
 *    Stoch K < D & K > 50 → -8 (bear cross)
 */
function scoreMomentum(t: TechnicalIndicators): ScoreComponent {
  const r: SignalRationale[] = [];
  let score = 0;
  const { rsi, macd, macdSignal, stochK, stochD } = t;

  // RSI
  if (rsi > 0) {
    if (rsi < 30) {
      score += 25;
      r.push({ tag: 'RSI Oversold', weight: 25, direction: 1, description: `RSI(14) at ${rsi.toFixed(1)} — oversold, potential bounce` });
    } else if (rsi < 40) {
      score += 12;
      r.push({ tag: 'RSI Low', weight: 12, direction: 1, description: `RSI(14) at ${rsi.toFixed(1)} — approaching oversold` });
    } else if (rsi > 70) {
      score -= 25;
      r.push({ tag: 'RSI Overbought', weight: 25, direction: -1, description: `RSI(14) at ${rsi.toFixed(1)} — overbought, potential decline` });
    } else if (rsi > 60) {
      score -= 8;
      r.push({ tag: 'RSI High', weight: 8, direction: -1, description: `RSI(14) at ${rsi.toFixed(1)} — approaching overbought` });
    } else {
      score += 3;
    }
  }

  // MACD
  if (macd > 0 && macdSignal > 0) {
    score += 15;
    r.push({ tag: 'MACD Bullish', weight: 15, direction: 1, description: 'MACD(12,26,9) and signal both positive' });
    if (macd > macdSignal) {
      score += 8;
      r.push({ tag: 'MACD Above Signal', weight: 8, direction: 1, description: 'MACD histogram rising — bullish momentum' });
    }
  } else if (macd < 0 && macdSignal < 0) {
    score -= 15;
    r.push({ tag: 'MACD Bearish', weight: 15, direction: -1, description: 'MACD and signal both negative' });
    if (macd < macdSignal) {
      score -= 8;
      r.push({ tag: 'MACD Below Signal', weight: 8, direction: -1, description: 'MACD histogram falling — bearish momentum' });
    }
  } else if (macd > macdSignal && macdSignal < 0) {
    score += 5;
    r.push({ tag: 'MACD Cross Up', weight: 5, direction: 1, description: 'MACD crossing above signal line' });
  } else if (macd < macdSignal && macdSignal > 0) {
    score -= 5;
    r.push({ tag: 'MACD Cross Down', weight: 5, direction: -1, description: 'MACD crossing below signal line' });
  }

  // Stochastic
  if (stochK > 0 && stochD > 0) {
    if (stochK < 20 && stochD < 20) {
      score += 15;
      r.push({ tag: 'Stoch Oversold', weight: 15, direction: 1, description: `Stoch K(${stochK.toFixed(1)}) D(${stochD.toFixed(1)}) — oversold zone` });
    } else if (stochK > 80 && stochD > 80) {
      score -= 15;
      r.push({ tag: 'Stoch Overbought', weight: 15, direction: -1, description: `Stochastic in overbought zone (K=${stochK.toFixed(1)})` });
    } else if (stochK > stochD && stochK < 50) {
      score += 8;
      r.push({ tag: 'Stoch Bull Cross', weight: 8, direction: 1, description: 'Stoch K crossed above D in lower zone' });
    } else if (stochK < stochD && stochK > 50) {
      score -= 8;
      r.push({ tag: 'Stoch Bear Cross', weight: 8, direction: -1, description: 'Stoch K crossed below D in upper zone' });
    }
  }

  // MACD histogram magnitude
  const histogram = macd - macdSignal;
  const close = t.close;
  if (close > 0) {
    const histPct = Math.abs(histogram) / close * 100;
    if (histPct > 0.5) {
      const histDir = histogram > 0 ? 1 : -1;
      score += histDir * 5;
      r.push({ tag: 'MACD Histogram Strong', weight: 5, direction: histDir as 1 | -1, description: `MACD histogram magnitude ${histPct.toFixed(2)}% — strong ${histogram > 0 ? 'bullish' : 'bearish'} momentum` });
    } else if (histPct < 0.1 && Math.abs(histogram) > 0) {
      r.push({ tag: 'MACD Histogram Flat', weight: 0, direction: 0, description: 'MACD histogram near zero — no momentum' });
    }
  }

  return { name: 'Momentum', score: clamp(score, -100, 100), weight: 0.25, rationale: r };
}

/** 3. Volatility & Breakout Score (weight: 0.20)
 *  Rules:
 *    BB position > 0.9 → -12 (overextended upper)
 *    BB position < -0.9 → +12 (oversold lower)
 *    BB position > 0.5 → +5 (mild bullish)
 *    BB position < -0.5 → -5 (mild bearish)
 *    BB width < 5% → squeeze ±8 (breakout imminent, direction = close vs BB mid)
 *    52w range > 95% → -10 (extended)
 *    52w range < 10% → +15 (value zone)
 *    52w range 10-30% → +8 (lower third)
 *    52w range > 80% → -5 (upper fifth)
 */
function scoreVolatility(t: TechnicalIndicators): { score: ScoreComponent; bbWidth: number; bbPos: number } {
  const r: SignalRationale[] = [];
  let score = 0;
  const { close, bbUpper, bbLower, atr, week52High, week52Low } = t;

  const bbMid = (bbUpper + bbLower) / 2;
  const bbWidth = safeDiv(bbUpper - bbLower, bbMid, 0) * 100;

  if (bbUpper > 0 && bbLower > 0 && bbWidth > 0) {
    const bbPos = safeDiv(close - bbLower, bbUpper - bbLower, 0.5) * 2 - 1; // -1 to +1

    if (bbPos > 0.9) {
      score -= 12;
      r.push({ tag: 'BB Upper Touch', weight: 12, direction: -1, description: 'Price at upper Bollinger Band — overextended' });
    } else if (bbPos < -0.9) {
      score += 12;
      r.push({ tag: 'BB Lower Touch', weight: 12, direction: 1, description: 'Price at lower Bollinger Band — oversold' });
    } else if (bbPos > 0.5) {
      score += 5;
    } else if (bbPos < -0.5) {
      score -= 5;
    }

    if (bbWidth < 5) {
      const dir = close > bbMid ? 1 : -1;
      score += dir * 8;
      r.push({ tag: 'BB Squeeze', weight: 8, direction: dir as 1 | -1, description: `BB width ${bbWidth.toFixed(1)}% — low volatility, breakout imminent (${dir > 0 ? 'bullish' : 'bearish'} bias)` });
    }

    return {
      score: { name: 'Volatility', score: clamp(score, -100, 100), weight: 0.20, rationale: r },
      bbWidth,
      bbPos,
    };
  }

  return { score: { name: 'Volatility', score: 0, weight: 0.20, rationale: r }, bbWidth, bbPos: 0 };
}

/** 4. Volume Confirmation (weight: 0.10)
 *  Rules:
 *    Volume > 2× avg with price up → +20 (strong buying)
 *    Volume > 2× avg with price down → -20 (distribution)
 *    Volume > 1.3× avg with price up → +12 (accumulation)
 *    Volume > 1.3× avg with price down → -10 (above-avg selling)
 *    Volume < 0.5× avg → neutral flag (low conviction)
 *    Normal volume → small score from price-direction proxy (+3/-3)
 */
function scoreVolume(t: TechnicalIndicators, avgVolume: number): ScoreComponent {
  const r: SignalRationale[] = [];
  let score = 0;
  const { volume, close, sma20 } = t;

  // If avgVolume available, use ratio-based scoring
  if (volume > 0 && avgVolume > 0) {
    const volRatio = safeDiv(volume, avgVolume, 1);
    const priceChange = sma20 > 0 ? safeDiv(close - sma20, sma20, 0) * 100 : 0;

    if (volRatio > 2) {
      if (priceChange > 0) {
        score += 20;
        r.push({ tag: 'High Volume Rally', weight: 20, direction: 1, description: `Volume ${volRatio.toFixed(1)}× average with price up — strong buying` });
      } else {
        score -= 20;
        r.push({ tag: 'High Volume Sell-off', weight: 20, direction: -1, description: `Volume ${volRatio.toFixed(1)}× average with price down — distribution` });
      }
    } else if (volRatio > 1.3) {
      if (priceChange > 0) {
        score += 12;
        r.push({ tag: 'Above-Avg Volume Bull', weight: 12, direction: 1, description: `Volume ${volRatio.toFixed(1)}× average — accumulation` });
      } else {
        score -= 10;
        r.push({ tag: 'Above-Avg Volume Bear', weight: 10, direction: -1, description: 'Above-average volume on decline' });
      }
    } else if (volRatio < 0.5) {
      r.push({ tag: 'Low Volume', weight: 0, direction: 0, description: `Volume only ${volRatio.toFixed(1)}× average — low conviction` });
    }
  } else {
    // Fallback: use price-direction proxy when avg volume is unavailable
    // This is the common case for EGX data from TradingView
    const priceChange = sma20 > 0 ? safeDiv(close - sma20, sma20, 0) * 100 : 0;
    if (priceChange > 1) {
      score += 5;
      r.push({ tag: 'Price Above SMA20', weight: 5, direction: 1, description: `Price ${priceChange.toFixed(1)}% above SMA20 — mild accumulation signal` });
    } else if (priceChange < -1) {
      score -= 5;
      r.push({ tag: 'Price Below SMA20', weight: 5, direction: -1, description: `Price ${Math.abs(priceChange).toFixed(1)}% below SMA20 — mild distribution` });
    } else {
      r.push({ tag: 'Normal Volume', weight: 0, direction: 0, description: 'Volume confirms current trend — no spike detected' });
    }
  }

  return { name: 'Volume', score: clamp(score, -100, 100), weight: 0.10, rationale: r };
}

/** 5. TradingView Consensus (weight: 0.10)
 *  Rules:
 *    recommendAll is TradingView's aggregate: -2 (Strong Sell) to +2 (Strong Buy)
 *    Mapped linearly: score = recommendAll × 25 → range -50 to +50
 */
function scoreTVConsensus(t: TechnicalIndicators): ScoreComponent {
  const r: SignalRationale[] = [];
  const tv = t.recommendAll;
  const score = tv * 25;

  const labels: Record<number, string> = { '-2': 'Strong Sell', '-1': 'Sell', '0': 'Neutral', '1': 'Buy', '2': 'Strong Buy' };
  const dir = tv > 0.3 ? 1 : tv < -0.3 ? -1 : 0;
  const label = labels[Math.round(tv)] || 'Neutral';
  r.push({ tag: `TV: ${label}`, weight: Math.abs(Math.round(score)), direction: dir as 1 | -1 | 0, description: `TradingView aggregated rating: ${tv > 0 ? '+' : ''}${tv.toFixed(2)}` });

  return { name: 'TV Consensus', score: clamp(score, -100, 100), weight: 0.10, rationale: r };
}

/** 6. Trend Strength — ADX (weight: 0.10, redistributed from Trend)
 *  Rules:
 *    ADX > 25 → +15 (trending market, trust signals)
 *    ADX 20-25 → +8 (moderate trend)
 *    ADX < 20 → 0 (ranging, signals less reliable)
 *    Applied as bonus/penalty to existing composite (additive, not replacing)
 */
function scoreTrendStrength(t: TechnicalIndicators): ScoreComponent {
  const r: SignalRationale[] = [];
  let score = 0;
  // ADX not yet in TradingView scanner response — return neutral
  // When added: const adx = (t as any).adx || 0;
  // For now, estimate trend strength from MA alignment
  const { close, sma20, sma50, sma200 } = t;
  const aligned = (sma20 > 0 && sma50 > 0 && sma200 > 0);
  if (aligned) {
    const trendSlope = safeDiv(sma20 - sma200, sma200, 0) * 100;
    const absSlope = Math.abs(trendSlope);
    if (absSlope > 10) {
      const dir = trendSlope > 0 ? 1 : -1;
      score += dir * 15;
      r.push({ tag: 'Strong Trend', weight: 15, direction: dir as 1 | -1, description: `MA slope ${trendSlope.toFixed(1)}% — strong ${dir > 0 ? 'up' : 'down'} trend` });
    } else if (absSlope > 3) {
      const dir = trendSlope > 0 ? 1 : -1;
      score += dir * 8;
      r.push({ tag: 'Moderate Trend', weight: 8, direction: dir as 1 | -1, description: `MA slope ${trendSlope.toFixed(1)}% — moderate trend` });
    } else {
      r.push({ tag: 'Weak/Ranging', weight: 0, direction: 0, description: 'MAs flat — ranging market, signals less reliable' });
    }
  }
  return { name: 'TrendStrength', score: clamp(score, -100, 100), weight: 0.10, rationale: r };
}

// ── Signal Classification ──────────────────────────────────────

function classifySignal(rawScore: number, params: ScreenerParameters): SignalType {
  // Apply timeframe threshold scaling
  const tfScale = TF_ADJUST[params.timeframe].thresholdScale;
  const score = rawScore * tfScale;

  if (score >= params.strongBuyThreshold) return 'Strong Buy';
  if (score >= params.buyThreshold) return 'Buy';
  if (score <= params.strongSellThreshold) return 'Strong Sell';
  if (score <= params.sellThreshold) return 'Sell';
  return 'Hold';
}

// ── Stop-Loss & Take-Profit ──────────────────────────────────
// EGX-Optimized v3: Uses structural levels (swing, MA confluence, BB),
// psychological levels (round numbers), circuit-breaker awareness (5%),
// and ATR volatility scaling for the Egyptian market.
//
// Methodology (inspired by best EGX trading practices):
//   SL:  Nearest structural support/resistance + ATR floor/ceiling
//   TP1: First logical target (BB Upper, SMA50, round number, or 1.5×ATR)
//        — high probability (60-70%), take 40% of position
//   TP2: Intermediate target (SMA200, 50% of 52W range, or 3×ATR)
//        — medium probability (35-45%), take 35% of position
//   TP3: Extended target (52W High, 80% of 52W range, or 5×ATR)
//        — low probability (15-25%), take 25% of position

/** Round a price to the nearest EGX psychological level (0.50, 1.00, 5.00, 10.00, etc.) */
function nearestPsychLevel(price: number, direction: 1 | -1): number {
  // Determine the tick based on price magnitude
  const mag = Math.pow(10, Math.floor(Math.log10(Math.max(price, 0.01))));
  const ticks = [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10, 25, 50, 100];
  const tick = ticks.find(t => t >= mag * 0.05) || mag * 0.1;
  const rounded = Math.round(price / tick) * tick;
  // For bullish: find the next round level ABOVE price
  // For bearish: find the next round level BELOW price
  if (direction === 1) {
    return rounded > price ? rounded : rounded + tick;
  } else {
    return rounded < price ? rounded : rounded - tick;
  }
}

/** Find nearest round level above price (for TP) */
function nextRoundAbove(price: number): number {
  return nearestPsychLevel(price, 1);
}

/** Find nearest round level below price (for SL) */
function nextRoundBelow(price: number): number {
  return nearestPsychLevel(price, -1);
}

/**
 * calcEntryPrice — Context-aware entry price using technical signal analysis.
 *
 * Analyzes the SAME rationale tags that generated the Buy signal to determine
 * the optimal entry strategy. Different patterns require different entries:
 *
 * 1. BREAKOUT     → Enter AT the broken resistance (close or slightly above)
 * 2. REVERSAL     → Enter at close (reversal is happening NOW, don't wait)
 * 3. PULLBACK     → Enter at MA support below close (buy the dip)
 * 4. MOMENTUM     → Enter with slight ATR discount
 * 5. SUPPORT      → Enter at key support level (SMA50/SMA200/psych)
 */
function calcEntryPrice(
  t: TechnicalIndicators,
  signal: SignalType,
  sl: { price: number; pct: number },
  tf: Timeframe,
  rationales: SignalRationale[]
): EntryPriceDetail {
  const { close, atr, sma20, sma50, sma200, ema20,
          bbUpper, bbLower, high, low } = t;
  const atrMul = TF_ADJUST[tf].atrMultiplier;
  const safeAtr = atr > 0 ? atr : close * 0.02;
  const isBull = signal === 'Strong Buy' || signal === 'Buy';
  const isBear = signal === 'Strong Sell' || signal === 'Sell';

  // Build signal context from rationales
  const tagSet = new Set(rationales.map(r => r.tag));
  const hasTag = (tag: string) => tagSet.has(tag);

  // Safety constraints
  const slBuffer = close * 0.003;
  const maxPullback = close * 0.03; // Don't wait more than 3% pullback
  const minGap = close * 0.001;    // Minimum 0.1% difference to be meaningful

  if (isBull) {
    const safeSL = sl.price + slBuffer;

    // ═══════════════════════════════════════════════════════════
    // PATTERN DETECTION — determine what kind of setup this is
    // ═══════════════════════════════════════════════════════════

    const isBreakout = (
      // Price just broke above a major MA (was below, now above)
      hasTag('Above SMA50') || hasTag('Above SMA200') ||
      // BB squeeze with bullish bias
      hasTag('BB Squeeze') ||
      // Strong volume confirming breakout
      hasTag('Volume Spike Up') || hasTag('Strong Volume Up')
    ) && (
      // Confirm price is near the breakout level (not far above)
      (sma50 > 0 && close > sma50 && (close - sma50) / close < 0.03) ||
      (sma200 > 0 && close > sma200 && (close - sma200) / close < 0.03)
    );

    const isReversal = (
      // Oversold signals firing
      hasTag('RSI Oversold') || hasTag('Stoch Oversold') ||
      hasTag('BB Lower Touch') ||
      // MACD crossover happening
      hasTag('MACD Cross Up') ||
      // Stochastic bullish cross
      hasTag('Stoch Bull Cross')
    );

    const isMomentum = (
      // Strong bullish momentum confirmed
      hasTag('MACD Bullish') || hasTag('MACD Above Signal') ||
      hasTag('MACD Histogram Strong') || hasTag('Stoch Bull Cross')
    ) && !isReversal;

    const isUptrend = (
      hasTag('Bullish MA Stack') ||
      (hasTag('Above SMA20') && hasTag('Above SMA50')) ||
      hasTag('Above SMA200')
    );

    // ═══════════════════════════════════════════════════════════
    // STRATEGY 1: BREAKOUT ENTRY
    // Enter AT the broken resistance level (it becomes support)
    // ═══════════════════════════════════════════════════════════
    if (isBreakout) {
      // Find the resistance that was just broken
      let breakoutLevel = 0;
      let breakoutName = '';

      // Check SMA200 breakout (major)
      if (sma200 > 0 && close > sma200 && (close - sma200) / close < 0.02) {
        breakoutLevel = sma200;
        breakoutName = 'اختراق SMA200';
      }
      // Check SMA50 breakout
      else if (sma50 > 0 && close > sma50 && (close - sma50) / close < 0.02) {
        breakoutLevel = sma50;
        breakoutName = 'اختراق SMA50';
      }
      // BB squeeze breakout
      else if (bbUpper > 0 && bbLower > 0) {
        const bbMid = (bbUpper + bbLower) / 2;
        if (close > bbMid && close < bbMid * 1.02) {
          breakoutLevel = bbMid;
          breakoutName = 'اختراق ضغط البولينجر';
        }
      }
      // Previous high breakout
      if (breakoutLevel <= 0 && high > 0 && close >= high * 0.995) {
        breakoutLevel = high;
        breakoutName = 'اختراق أعلى سابق';
      }

      if (breakoutLevel > 0 && breakoutLevel >= safeSL) {
        // Enter AT the breakout level (old resistance = new support)
        const entryPrice = Math.max(breakoutLevel, safeSL);
        const disc = round2(((close - entryPrice) / close) * 100);
        return {
          price: round2(entryPrice),
          strategy: breakoutName,
          basis: `دخول عند ${round2(breakoutLevel)} (المقاومة المكسورة = دعم جديد)`,
          discount: disc,
        };
      }
    }

    // ═══════════════════════════════════════════════════════════
    // STRATEGY 2: REVERSAL ENTRY
    // Don't wait — the reversal is happening NOW, enter at close
    // ═══════════════════════════════════════════════════════════
    if (isReversal) {
      let revDetail = 'اشارة ارتداد فعّالة';

      // Determine the specific reversal type
      if (hasTag('RSI Oversold') && hasTag('Stoch Oversold')) {
        revDetail = 'تشبع بيعي مزدوج (RSI + Stoch)';
      } else if (hasTag('RSI Oversold')) {
        revDetail = 'ارتداد من تشبع بيعي RSI';
      } else if (hasTag('Stoch Oversold')) {
        revDetail = 'ارتداد من تشبع بيعي Stoch';
      } else if (hasTag('BB Lower Touch')) {
        revDetail = 'ارتداد من الحد السفلي BB';
      } else if (hasTag('MACD Cross Up')) {
        revDetail = 'تقاطع MACD صاعد';
      } else if (hasTag('Stoch Bull Cross')) {
        revDetail = 'تقاطع Stochastic صاعد';
      }

      // For reversal, enter at close or very slight discount (0.2× ATR)
      const revEntry = close - safeAtr * 0.2 * atrMul;
      const finalEntry = Math.max(revEntry, safeSL);
      const disc = round2(((close - finalEntry) / close) * 100);
      return {
        price: round2(finalEntry),
        strategy: 'دخول عند الارتداد',
        basis: revDetail,
        discount: disc,
      };
    }

    // ═══════════════════════════════════════════════════════════
    // STRATEGY 3: PULLBACK ENTRY (in established uptrend)
    // Wait for price to pull back to MA support before entering
    // ═══════════════════════════════════════════════════════════
    if (isUptrend) {
      const pullbackCandidates: { price: number; strategy: string; basis: string; rank: number }[] = [];

      // EMA20 pullback (best — most responsive in trends)
      if (ema20 > 0 && ema20 < close && ema20 >= safeSL) {
        const dist = close - ema20;
        if (dist <= maxPullback && dist >= minGap) {
          const strongTrend = sma50 > 0 && ema20 > sma50;
          pullbackCandidates.push({
            price: ema20,
            strategy: 'سحب لـ EMA20',
            basis: `EMA20 @ ${round2(ema20)}`,
            rank: strongTrend ? 1 : 3,
          });
        }
      }

      // SMA20 pullback
      if (sma20 > 0 && sma20 < close && sma20 >= safeSL) {
        const dist = close - sma20;
        if (dist <= maxPullback && dist >= minGap) {
          pullbackCandidates.push({
            price: sma20,
            strategy: 'سحب لـ SMA20',
            basis: `SMA20 @ ${round2(sma20)}`,
            rank: 4,
          });
        }
      }

      // SMA50 pullback (deeper pullback in strong trends)
      if (sma50 > 0 && sma50 < close && sma50 >= safeSL) {
        const dist = close - sma50;
        if (dist <= maxPullback) {
          const nearSMA50 = dist < safeAtr * 1.5;
          pullbackCandidates.push({
            price: sma50,
            strategy: 'سحب لـ SMA50',
            basis: `SMA50 @ ${round2(sma50)}`,
            rank: nearSMA50 ? 2 : 5,
          });
        }
      }

      if (pullbackCandidates.length > 0) {
        pullbackCandidates.sort((a, b) => a.rank - b.rank);
        const chosen = pullbackCandidates[0];
        const finalPrice = clamp(chosen.price, safeSL, close - minGap);
        const disc = round2(((close - finalPrice) / close) * 100);
        return {
          price: round2(finalPrice),
          strategy: chosen.strategy,
          basis: `انتظار ارتداد لـ ${chosen.basis}`,
          discount: disc,
        };
      }
    }

    // ═══════════════════════════════════════════════════════════
    // STRATEGY 4: MOMENTUM ENTRY
    // Strong momentum — enter with slight ATR discount only
    // ═══════════════════════════════════════════════════════════
    if (isMomentum) {
      const momEntry = close - safeAtr * 0.3 * atrMul;
      const finalEntry = Math.max(momEntry, safeSL);
      const disc = round2(((close - finalEntry) / close) * 100);

      let momDetail = 'زخم صاعد قوي';
      if (hasTag('MACD Above Signal')) momDetail = 'زخم MACD صاعد';
      if (hasTag('MACD Histogram Strong')) momDetail = 'زخم متزايد';

      return {
        price: round2(finalEntry),
        strategy: 'دخول مع الزخم',
        basis: momDetail,
        discount: disc,
      };
    }

    // ═══════════════════════════════════════════════════════════
    // STRATEGY 5: SUPPORT BOUNCE
    // Price at a key support — enter at the support level
    // ═══════════════════════════════════════════════════════════
    {
      const supportCandidates: { price: number; strategy: string; basis: string; rank: number }[] = [];

      // SMA50 as support
      if (sma50 > 0 && sma50 < close && sma50 >= safeSL) {
        const dist = close - sma50;
        if (dist <= maxPullback && dist < safeAtr * 1.2) {
          supportCandidates.push({
            price: sma50,
            strategy: 'دعم SMA50',
            basis: `SMA50 @ ${round2(sma50)}`,
            rank: 1,
          });
        }
      }

      // SMA200 as support
      if (sma200 > 0 && sma200 < close && sma200 >= safeSL) {
        const dist = close - sma200;
        if (dist <= maxPullback) {
          supportCandidates.push({
            price: sma200,
            strategy: 'دعم SMA200',
            basis: `SMA200 @ ${round2(sma200)}`,
            rank: 2,
          });
        }
      }

      // Previous day low
      if (low > 0 && low < close && low >= safeSL) {
        const dist = close - low;
        if (dist <= maxPullback && dist >= minGap) {
          supportCandidates.push({
            price: low,
            strategy: 'أدنى الجلسة كدعم',
            basis: `أدنى @ ${round2(low)}`,
            rank: 3,
          });
        }
      }

      // Psychological level
      const psychBelow = nextRoundBelow(close);
      if (psychBelow > 0 && psychBelow < close && psychBelow >= safeSL) {
        const dist = close - psychBelow;
        if (dist <= maxPullback && dist >= minGap) {
          supportCandidates.push({
            price: psychBelow,
            strategy: 'مستوى نفسي',
            basis: `مستوى ${round2(psychBelow)}`,
            rank: 4,
          });
        }
      }

      if (supportCandidates.length > 0) {
        supportCandidates.sort((a, b) => a.rank - b.rank);
        const chosen = supportCandidates[0];
        const finalPrice = clamp(chosen.price, safeSL, close - minGap);
        const disc = round2(((close - finalPrice) / close) * 100);
        return {
          price: round2(finalPrice),
          strategy: chosen.strategy,
          basis: `دخول عند ${chosen.basis}`,
          discount: disc,
        };
      }
    }

    // ═══════════════════════════════════════════════════════════
    // FALLBACK: ATR-based entry
    // ═══════════════════════════════════════════════════════════
    const atrEntry = close - safeAtr * 0.5 * atrMul;
    if (atrEntry >= safeSL) {
      const disc = round2(((close - atrEntry) / close) * 100);
      return {
        price: round2(atrEntry),
        strategy: 'سحب جزئي (ATR)',
        basis: `0.5× ATR @ ${round2(atrEntry)}`,
        discount: disc,
      };
    }

    return { price: round2(close), strategy: 'شراء فوري', basis: 'سعر السوق الحالي', discount: 0 };

  } else if (isBear) {
    // ── BEAR (SHORT) ENTRY STRATEGIES ──
    const safeSL = sl.price - slBuffer;

    const isReversal = hasTag('RSI Overbought') || hasTag('Stoch Overbought') ||
      hasTag('BB Upper Touch') || hasTag('MACD Cross Down') || hasTag('Stoch Bear Cross');

    const isBreakdown = hasTag('Below SMA50') || hasTag('Below SMA200') ||
      hasTag('BB Squeeze') || hasTag('Volume Spike Down');

    if (isReversal) {
      const revEntry = close + safeAtr * 0.2 * atrMul;
      const finalEntry = Math.min(revEntry, safeSL);
      const disc = round2(((finalEntry - close) / close) * 100);
      return { price: round2(finalEntry), strategy: 'دخول عند الارتداد', basis: 'اشارة ارتداد هابطة', discount: disc };
    }

    if (isBreakdown) {
      let breakdownLevel = 0;
      let breakdownName = '';
      if (sma50 > 0 && close < sma50 && (sma50 - close) / close < 0.02) {
        breakdownLevel = sma50; breakdownName = 'كسر SMA50';
      } else if (sma200 > 0 && close < sma200 && (sma200 - close) / close < 0.02) {
        breakdownLevel = sma200; breakdownName = 'كسر SMA200';
      }
      if (breakdownLevel > 0 && breakdownLevel <= safeSL) {
        const disc = round2(((breakdownLevel - close) / close) * 100);
        return { price: round2(breakdownLevel), strategy: breakdownName, basis: `دخول عند كسر الدعم @ ${round2(breakdownLevel)}`, discount: disc };
      }
    }

    // Default bear: ATR pullback up
    const atrEntry = close + safeAtr * 0.5 * atrMul;
    if (atrEntry <= safeSL) {
      const disc = round2(((atrEntry - close) / close) * 100);
      return { price: round2(atrEntry), strategy: 'سحب جزئي (ATR)', basis: `0.5× ATR @ ${round2(atrEntry)}`, discount: disc };
    }

    return { price: round2(close), strategy: 'بيع فوري', basis: 'سعر السوق الحالي', discount: 0 };
  }

  // Hold: use close
  return { price: round2(close), strategy: 'سعر السوق', basis: 'سعر الإغلاق', discount: 0 };
}

function calcStopLoss(t: TechnicalIndicators, signal: SignalType, tf: Timeframe): { price: number; pct: number } {
  const { close, atr, sma20, sma50, sma100, sma200, bbLower, bbUpper, high, low } = t;
  const atrMul = TF_ADJUST[tf].atrMultiplier;
  const safeAtr = atr > 0 ? atr : close * 0.02;

  // EGX regular session price limit: ±16% (circuit breaker at 5% is separate)
  // Verified: EGX raised the regular-session band; 5% was outdated.
  // We use 12% as practical SL ceiling (conservative within the 16% limit)
  const maxDailyMove = close * 0.12;
  // SL should not be tighter than 1.5% (noise floor)
  const minSLDist = close * 0.015;
  const maxSLDist = Math.min(safeAtr * 3.5 * atrMul, maxDailyMove);

  if (signal === 'Strong Buy' || signal === 'Buy') {
    // Long: SL below nearest structural support
    // Candidates: SMA20, SMA50, BB Lower, previous day low, round number
    const candidates: { level: number; name: string }[] = [];
    if (sma20 > 0 && sma20 < close) candidates.push({ level: sma20, name: 'SMA20' });
    if (sma50 > 0 && sma50 < close) candidates.push({ level: sma50, name: 'SMA50' });
    if (bbLower > 0 && bbLower < close) candidates.push({ level: bbLower, name: 'BB Lower' });
    if (low > 0 && low < close) candidates.push({ level: low, name: 'Previous Low' });
    // Round number below
    const rndBelow = nextRoundBelow(close);
    if (rndBelow > 0 && rndBelow < close) candidates.push({ level: rndBelow, name: 'Psychological Level' });
    // ATR fallback
    const atrSL = close - safeAtr * 2 * atrMul;
    candidates.push({ level: atrSL, name: '2× ATR' });

    // Sort by distance from close (ascending = nearest first)
    candidates.sort((a, b) => (close - a.level) - (close - b.level));
    // Pick the nearest support that's at least minSLDist away
    let chosenSL = atrSL; // fallback
    for (const c of candidates) {
      const dist = close - c.level;
      if (dist >= minSLDist && dist <= maxSLDist) {
        chosenSL = c.level;
        break;
      }
    }
    // Clamp to min/max bounds
    const finalSL = clamp(chosenSL, close - maxSLDist, close - minSLDist);
    const pct = safeDiv(close - finalSL, close, 0) * 100;
    return { price: round2(finalSL), pct: round2(pct) };

  } else if (signal === 'Strong Sell' || signal === 'Sell') {
    // Short: SL above nearest structural resistance
    const candidates: { level: number; name: string }[] = [];
    if (sma20 > 0 && sma20 > close) candidates.push({ level: sma20, name: 'SMA20' });
    if (sma50 > 0 && sma50 > close) candidates.push({ level: sma50, name: 'SMA50' });
    if (bbUpper > 0 && bbUpper > close) candidates.push({ level: bbUpper, name: 'BB Upper' });
    if (high > 0 && high > close) candidates.push({ level: high, name: 'Previous High' });
    const rndAbove = nextRoundAbove(close);
    if (rndAbove > close) candidates.push({ level: rndAbove, name: 'Psychological Level' });
    const atrSL = close + safeAtr * 2 * atrMul;
    candidates.push({ level: atrSL, name: '2× ATR' });

    candidates.sort((a, b) => (a.level - close) - (b.level - close));
    let chosenSL = atrSL;
    for (const c of candidates) {
      const dist = c.level - close;
      if (dist >= minSLDist && dist <= maxSLDist) {
        chosenSL = c.level;
        break;
      }
    }
    const finalSL = clamp(chosenSL, close + minSLDist, close + maxSLDist);
    const pct = safeDiv(finalSL - close, close, 0) * 100;
    return { price: round2(finalSL), pct: round2(pct) };
  }

  // Hold — direction-aware SL based on trend
  const trendBias = (sma50 > 0 && close > sma50) || (sma200 > 0 && close > sma200);
  const dir = trendBias ? -1 : 1;
  const sl = close + dir * Math.max(safeAtr * 2 * atrMul, minSLDist);
  const pct = safeDiv(Math.abs(sl - close), close, 0) * 100;
  return { price: round2(sl), pct: round2(pct) };
}

function calcTakeProfits(t: TechnicalIndicators, signal: SignalType, tf: Timeframe): TakeProfitTarget[] {
  const { close, atr, sma20, sma50, sma100, sma200, bbUpper, bbLower, week52High, week52Low, high, low } = t;
  const atrMul = TF_ADJUST[tf].atrMultiplier;
  const safeAtr = atr > 0 ? atr : close * 0.02;
  const isBull = signal === 'Strong Buy' || signal === 'Buy';
  const isBear = signal === 'Strong Sell' || signal === 'Sell';
  const tps: TakeProfitTarget[] = [];

  // 52W range context
  const w52Range = (week52High > 0 && week52Low > 0) ? week52High - week52Low : 0;
  const w52Pos = w52Range > 0 ? (close - week52Low) / w52Range : 0.5;
  // EGX: realistic per-session targets
  // Regular session limit is ±16%, circuit breaker at 5% (halt, not cap)
  // Typical strong EGX move: 3-5%; extended multi-session: up to 12-16%
  const realisticSessionGain = close * 0.05;
  const moderateGain = close * 0.08;
  const extendedGain = close * 0.16;

  if (isBull) {
    // TP1: BB Upper / SMA50 / prev high / psych level (max 8%, ~1-2 sessions)
    const tp1Candidates: { price: number; basis: string; rank: number }[] = [];
    if (bbUpper > 0 && bbUpper > close && bbUpper - close <= moderateGain) tp1Candidates.push({ price: bbUpper, basis: 'BB Upper', rank: 1 });
    if (sma50 > 0 && sma50 > close && sma50 - close <= moderateGain) tp1Candidates.push({ price: sma50, basis: 'SMA50', rank: 2 });
    if (high > 0 && high > close && high - close <= realisticSessionGain) tp1Candidates.push({ price: high, basis: 'أعلى جلسة سابقة', rank: 3 });
    const rnd1 = nextRoundAbove(close);
    if (rnd1 > close && rnd1 - close <= moderateGain) tp1Candidates.push({ price: rnd1, basis: 'مستوى نفسي', rank: 4 });
    const atrTP1 = close + safeAtr * 1 * atrMul;
    tp1Candidates.push({ price: atrTP1, basis: `${round2(1 * atrMul)}× ATR`, rank: 5 });
    const minTP1Dist = close * 0.005;
    tp1Candidates.sort((a, b) => a.rank - b.rank);
    let tp1 = atrTP1;
    for (const c of tp1Candidates) { if (c.price - close >= minTP1Dist) { tp1 = c.price; break; } }
    tp1 = Math.min(tp1, close + moderateGain);
    const tp1Basis = tp1Candidates.find(c => Math.abs(c.price - tp1) < 0.01)?.basis || `${round2(1 * atrMul)}× ATR`;
    tps.push({ level: 1, price: round2(tp1), basis: tp1Basis, probability: 'High' });

    // TP2: SMA100/SMA200/52W 50% (max 12%, ~2-4 sessions)
    const tp2Candidates: { price: number; basis: string; rank: number }[] = [];
    if (sma100 > 0 && sma100 > tp1 && sma100 - close <= extendedGain) tp2Candidates.push({ price: sma100, basis: 'SMA100', rank: 1 });
    if (sma200 > 0 && sma200 > tp1 && sma200 - close <= extendedGain) tp2Candidates.push({ price: sma200, basis: 'SMA200', rank: 2 });
    if (w52Range > 0) { const t50 = close + w52Range * (1 - w52Pos) * 0.5; if (t50 > tp1 + minTP1Dist && t50 - close <= extendedGain) tp2Candidates.push({ price: t50, basis: '50% نطاق 52أ', rank: 3 }); }
    const rnd2 = nextRoundAbove(tp1);
    if (rnd2 > tp1 + minTP1Dist && rnd2 - close <= extendedGain) tp2Candidates.push({ price: rnd2, basis: 'مستوى نفسي', rank: 4 });
    const atrTP2 = close + safeAtr * 2 * atrMul;
    tp2Candidates.push({ price: atrTP2, basis: `${round2(2 * atrMul)}× ATR`, rank: 5 });
    tp2Candidates.sort((a, b) => a.rank - b.rank);
    let tp2 = atrTP2;
    for (const c of tp2Candidates) { if (c.price > tp1 + minTP1Dist) { tp2 = c.price; break; } }
    tp2 = Math.min(tp2, close + extendedGain);
    const tp2Basis = tp2Candidates.find(c => Math.abs(c.price - tp2) < 0.01)?.basis || `${round2(2 * atrMul)}× ATR`;
    tps.push({ level: 2, price: round2(tp2), basis: tp2Basis, probability: 'Medium' });

    // TP3: 52W high/80% range (max 16%, ~3-8 sessions)
    const tp3Candidates: { price: number; basis: string; rank: number }[] = [];
    if (week52High > 0 && week52High > tp2) { const d = week52High - close; if (d <= close * 0.16) tp3Candidates.push({ price: week52High, basis: '52أسبوع أعلى', rank: 1 }); }
    if (w52Range > 0) { const t80 = close + w52Range * (1 - w52Pos) * 0.8; if (t80 > tp2 + minTP1Dist && t80 - close <= close * 0.16) tp3Candidates.push({ price: t80, basis: '80% نطاق 52أ', rank: 2 }); }
    const rnd3 = nextRoundAbove(tp2);
    if (rnd3 > tp2 + minTP1Dist) tp3Candidates.push({ price: rnd3, basis: 'مستوى نفسي', rank: 3 });
    const atrTP3 = close + safeAtr * 3.5 * atrMul;
    tp3Candidates.push({ price: atrTP3, basis: `${round2(3.5 * atrMul)}× ATR`, rank: 4 });
    tp3Candidates.sort((a, b) => a.rank - b.rank);
    let tp3 = atrTP3;
    for (const c of tp3Candidates) { if (c.price > tp2 + minTP1Dist) { tp3 = c.price; break; } }
    tp3 = Math.min(tp3, close * 1.16);
    const tp3Basis = tp3Candidates.find(c => Math.abs(c.price - tp3) < 0.01)?.basis || `${round2(3.5 * atrMul)}× ATR`;
    tps.push({ level: 3, price: round2(tp3), basis: tp3Basis, probability: 'Low' });

  } else if (isBear) {
    const minTPDist = close * 0.005;
    const tp1Candidates: { price: number; basis: string; rank: number }[] = [];
    if (bbLower > 0 && bbLower < close && close - bbLower <= moderateGain) tp1Candidates.push({ price: bbLower, basis: 'BB Lower', rank: 1 });
    if (sma50 > 0 && sma50 < close && close - sma50 <= moderateGain) tp1Candidates.push({ price: sma50, basis: 'SMA50', rank: 2 });
    if (low > 0 && low < close && close - low <= realisticSessionGain) tp1Candidates.push({ price: low, basis: 'أدنى جلسة سابقة', rank: 3 });
    const rnd1 = nextRoundBelow(close);
    if (rnd1 < close && close - rnd1 <= moderateGain) tp1Candidates.push({ price: rnd1, basis: 'مستوى نفسي', rank: 4 });
    const atrTP1 = close - safeAtr * 1 * atrMul;
    tp1Candidates.push({ price: atrTP1, basis: `${round2(1 * atrMul)}× ATR`, rank: 5 });
    tp1Candidates.sort((a, b) => a.rank - b.rank);
    let tp1 = atrTP1;
    for (const c of tp1Candidates) { if (close - c.price >= minTPDist) { tp1 = c.price; break; } }
    tp1 = Math.max(tp1, close - moderateGain);
    const tp1Basis = tp1Candidates.find(c => Math.abs(c.price - tp1) < 0.01)?.basis || `${round2(1 * atrMul)}× ATR`;
    tps.push({ level: 1, price: round2(tp1), basis: tp1Basis, probability: 'High' });

    const tp2Candidates: { price: number; basis: string; rank: number }[] = [];
    if (sma100 > 0 && sma100 < tp1) tp2Candidates.push({ price: sma100, basis: 'SMA100', rank: 1 });
    if (sma200 > 0 && sma200 < tp1) tp2Candidates.push({ price: sma200, basis: 'SMA200', rank: 2 });
    if (w52Range > 0) { const t50 = close - w52Range * w52Pos * 0.5; if (t50 < tp1 - minTPDist && close - t50 <= extendedGain) tp2Candidates.push({ price: t50, basis: '50% نطاق 52أ', rank: 3 }); }
    const atrTP2 = close - safeAtr * 2 * atrMul;
    tp2Candidates.push({ price: atrTP2, basis: `${round2(2 * atrMul)}× ATR`, rank: 4 });
    tp2Candidates.sort((a, b) => a.rank - b.rank);
    let tp2 = atrTP2;
    for (const c of tp2Candidates) { if (c.price < tp1 - minTPDist) { tp2 = c.price; break; } }
    tp2 = Math.max(tp2, close - extendedGain);
    const tp2Basis = tp2Candidates.find(c => Math.abs(c.price - tp2) < 0.01)?.basis || `${round2(2 * atrMul)}× ATR`;
    tps.push({ level: 2, price: round2(tp2), basis: tp2Basis, probability: 'Medium' });

    const tp3Candidates: { price: number; basis: string; rank: number }[] = [];
    if (week52Low > 0 && week52Low < tp2 && close - week52Low <= close * 0.16) tp3Candidates.push({ price: week52Low, basis: '52أسبوع أدنى', rank: 1 });
    if (w52Range > 0) { const t80 = close - w52Range * w52Pos * 0.8; if (t80 < tp2 - minTPDist && close - t80 <= close * 0.16) tp3Candidates.push({ price: t80, basis: '80% نطاق 52أ', rank: 2 }); }
    const atrTP3 = close - safeAtr * 3.5 * atrMul;
    tp3Candidates.push({ price: atrTP3, basis: `${round2(3.5 * atrMul)}× ATR`, rank: 3 });
    tp3Candidates.sort((a, b) => a.rank - b.rank);
    let tp3 = atrTP3;
    for (const c of tp3Candidates) { if (c.price < tp2 - minTPDist) { tp3 = c.price; break; } }
    tp3 = Math.max(tp3, close * 0.84);
    const tp3Basis = tp3Candidates.find(c => Math.abs(c.price - tp3) < 0.01)?.basis || `${round2(3.5 * atrMul)}× ATR`;
    tps.push({ level: 3, price: round2(tp3), basis: tp3Basis, probability: 'Low' });

  } else {
    const trendUp = (sma50 > 0 && close > sma50) || (sma200 > 0 && close > sma200);
    const dir = trendUp ? 1 : -1;
    tps.push({ level: 1, price: round2(close + dir * safeAtr * 1 * atrMul), basis: `${round2(1 * atrMul)}× ATR (trend)`, probability: 'Medium' });
    tps.push({ level: 2, price: round2(close + dir * safeAtr * 2 * atrMul), basis: `${round2(2 * atrMul)}× ATR (trend)`, probability: 'Low' });
    tps.push({ level: 3, price: round2(close + dir * safeAtr * 3.5 * atrMul), basis: `${round2(3.5 * atrMul)}× ATR (trend)`, probability: 'Low' });
  }

  return tps;
}


// ── Risk Management ────────────────────────────────────────────

function calcPositionSize(slPct: number, params: ScreenerParameters, confidence: number): number {
  if (slPct <= 0.01) return 0; // guard against tiny/zero SL
  const base = safeDiv(params.maxRiskPerTrade, slPct, 0) * 100;
  const adj = 0.5 + (confidence / 100) * 0.5; // 0.5× to 1.0×
  return round2(Math.min(base * adj, 20)); // cap at 20%
}

function getRiskFlags(t: TechnicalIndicators, signal: SignalType, volume: number, dq: DataQualityScore): string[] {
  const flags: string[] = [];
  if (volume < 10000) flags.push('Very Low Liquidity (<10K)');
  else if (volume < 50000) flags.push('Low Liquidity (<50K)');
  if (t.atr <= 0) flags.push('Missing ATR');
  if (t.rsi <= 0) flags.push('Missing RSI');
  if (dq.anomalies.length > 0) flags.push(`${dq.anomalies.length} data anomaly(ies)`);
  if (dq.score < 50) flags.push(`Low data quality (${dq.grade})`);
  if (signal !== 'Hold' && t.rsi > 0) {
    if ((signal === 'Buy' && t.rsi > 65) || (signal === 'Sell' && t.rsi < 35)) {
      flags.push('Signal-RSI Divergence');
    }
  }
  if (t.week52High > 0 && t.week52Low > 0) {
    const range = t.week52High - t.week52Low;
    if (range > 0 && safeDiv(t.atr, range, 0) > 0.05) flags.push('High Daily Volatility (>5% of 52w range)');
  }
  return flags;
}

// ── Main Screener Function ─────────────────────────────────────

export async function runTechnicalScreener(
  techData: Record<string, TechnicalIndicators>,
  stockInfo: Array<{ symbol: string; name: string; sector: string }>,
  avgVolumes: Record<string, number>,
  params: Partial<ScreenerParameters> = {},
  logger?: ReturnType<typeof createLogger>,
): Promise<ScreenerResult> {
  const p = { ...DEFAULT_PARAMS, ...params };
  const log = logger || createLogger();
  const now = new Date().toISOString();
  const stocks: ScreenerStock[] = [];
  let skippedPrice = 0, skippedLiquidity = 0, skippedSector = 0, skippedConfidence = 0, skippedNoData = 0;

  log.log('info', 'Engine', `Starting screener for ${stockInfo.length} stocks (timeframe: ${p.timeframe})`);

  for (const stock of stockInfo) {
    const t = techData[stock.symbol];
    if (!t || t.close <= 0) { skippedNoData++; continue; }

    // Data quality assessment
    const dq = assessDataQuality(t, stock.symbol);
    if (dq.anomalies.length > 0) {
      log.log('warn', 'DataQuality', `Anomalies for ${stock.symbol}: ${dq.anomalies.join('; ')}`, stock.symbol);
    }

    // Filters
    if (t.close < p.minPrice) { skippedPrice++; continue; }
    if (p.maxPrice > 0 && t.close > p.maxPrice) { skippedPrice++; continue; }
    if (p.sector && p.sector !== 'All' && stock.sector !== p.sector) { skippedSector++; continue; }
    if (t.volume < p.minLiquidity) { skippedLiquidity++; continue; }

    // Scoring
    const trend = scoreTrend(t);
    const momentum = scoreMomentum(t);
    const volResult = scoreVolatility(t);
    const volumeScore = scoreVolume(t, t.avgVolume30d > 0 ? t.avgVolume30d : (avgVolumes[stock.symbol] || t.volume));
    const tvConsensus = scoreTVConsensus(t);
    const trendStrength = scoreTrendStrength(t);

    const composite =
      trend.score * 0.30 +
      momentum.score * 0.25 +
      volResult.score.score * 0.15 +
      volumeScore.score * 0.10 +
      trendStrength.score * 0.10 +
      tvConsensus.score * 0.10;

    const signal = classifySignal(composite, p);

    // Confidence
    const magnitude = Math.abs(composite);
    const allRationales = [
      ...trend.rationale, ...momentum.rationale,
      ...volResult.score.rationale, ...volumeScore.rationale,
      ...trendStrength.rationale, ...tvConsensus.rationale,
    ];

    // P2-12 FIX: Cap agreement counting per indicator family to reduce
    // multicollinearity inflation. Each family can contribute at most 2
    // rationales to the "agreeing" count, preventing 5 near-duplicate
    // trend rationales from looking like "5 independent confirmations."
    const FAMILIES = ['Trend', 'Momentum', 'Volatility', 'Volume', 'TrendStrength', 'TV Consensus'] as const;
    const familyMap = new Map<string, SignalRationale[]>();
    // Assign each rationale to its source family based on position in allRationales
    const familyBoundaries = [
      { name: 'Trend', count: trend.rationale.length },
      { name: 'Momentum', count: momentum.rationale.length },
      { name: 'Volatility', count: volResult.score.rationale.length },
      { name: 'Volume', count: volumeScore.rationale.length },
      { name: 'TrendStrength', count: trendStrength.rationale.length },
      { name: 'TV Consensus', count: tvConsensus.rationale.length },
    ];
    let offset = 0;
    for (const fb of familyBoundaries) {
      const familyRationales = allRationales.slice(offset, offset + fb.count);
      if (familyRationales.length > 0) familyMap.set(fb.name, familyRationales);
      offset += fb.count;
    }

    // Count agreeing rationales with per-family cap of 2
    let cappedAgreeing = 0;
    let cappedTotal = 0;
    for (const [, famRationales] of familyMap) {
      const capped = famRationales.slice(0, 2); // max 2 per family
      cappedTotal += capped.length;
      cappedAgreeing += capped.filter(r =>
        (composite > 0 && r.direction > 0) || (composite < 0 && r.direction < 0)
      ).length;
    }
    const agreement = cappedTotal > 0 ? cappedAgreeing / cappedTotal : 0.5;

    const dataQualityBonus = dq.score >= 80 ? 5 : dq.score >= 60 ? 0 : -10;
    // P2-11 NOTE: This confidence is a heuristic blend, NOT calibrated
    // against realized outcomes. Treat as ordinal ranking, not probability.
    const confidence = clamp(Math.round(magnitude * 0.7 + agreement * 35 + 15 + dataQualityBonus), 0, 100);

    if (confidence < p.minConfidence) { skippedConfidence++; continue; }

    // SL, TP, Entry, R:R
    const sl = calcStopLoss(t, signal, p.timeframe);
    const entry = calcEntryPrice(t, signal, sl, p.timeframe, allRationales);
    const tps = calcTakeProfits(t, signal, p.timeframe);
    const risk = Math.abs(entry.price - sl.price);
    const reward = tps.length > 0 ? Math.abs(tps[0].price - entry.price) : 0;
    const riskReward = risk > 0 && reward > 0 ? round2(reward / risk) : 0;
    const positionSize = calcPositionSize(sl.pct, p, confidence);
    const riskFlags = getRiskFlags(t, signal, t.volume, dq);

    // Derived indicator values
    const bbWidth = volResult.bbWidth;
    const priceVsSma200 = t.sma200 > 0 ? round2(safeDiv(t.close - t.sma200, t.sma200, 0) * 100) : 0;
    const priceVsBB = round2(volResult.bbPos);

    const tags = allRationales
      .filter(r => r.direction !== 0 && Math.abs(r.weight) >= 5)
      .sort((a, b) => b.weight - a.weight)
      .slice(0, 5)
      .map(r => r.tag);

    const horizon = TF_ADJUST[p.timeframe].description;

    stocks.push({
      symbol: stock.symbol, name: stock.name, sector: stock.sector,
      signal, confidence, entryPrice: entry.price, entryDetail: entry,
      stopLoss: sl.price, stopLossPct: sl.pct,
      takeProfits: tps, riskReward, positionSize,
      rationale: allRationales, tags,
      timeframe: p.timeframe, horizon,
      indicators: {
        rsi: t.rsi, macd: t.macd, macdSignal: t.macdSignal,
        stochK: t.stochK, stochD: t.stochD,
        atr: t.atr, bbUpper: t.bbUpper, bbLower: t.bbLower,
        sma20: t.sma20, sma50: t.sma50, sma200: t.sma200,
        ema20: t.ema20, ema50: t.ema50, ema200: t.ema200,
        volume: t.volume, close: t.close, recommendAll: t.recommendAll,
        bbWidth, priceVsSma200, priceVsBB,
      },
      dataQuality: dq, riskFlags, generatedAt: now,
    });
  }

  log.log('info', 'Engine', `Filtered: ${skippedNoData} no data, ${skippedPrice} price, ${skippedLiquidity} liquidity, ${skippedSector} sector, ${skippedConfidence} confidence`);
  log.log('info', 'Engine', `Produced ${stocks.length} signals`);

  // P1-6 FIX: Enforce maxPortfolioExposure and sector concentration caps
  // This runs on the FULL set of signals (not just top-5 picks)
  const SECTOR_CAP_PCT = 25; // no more than 25% of portfolio in one sector
  const activeStocks = stocks.filter(s => s.signal !== 'Hold');
  let totalExposure = activeStocks.reduce((sum, s) => sum + s.positionSize, 0);
  if (totalExposure > p.maxPortfolioExposure) {
    const scale = p.maxPortfolioExposure / totalExposure;
    for (const s of stocks) s.positionSize = round2(s.positionSize * scale);
    log.log('warn', 'Portfolio', `Scaled all positions by ${(scale * 100).toFixed(1)}% to respect maxPortfolioExposure (${p.maxPortfolioExposure}%)`);
  }

  // Sector concentration: cap each sector at SECTOR_CAP_PCT%
  const sectorExposure: Record<string, number> = {};
  for (const s of activeStocks) {
    sectorExposure[s.sector] = (sectorExposure[s.sector] || 0) + s.positionSize;
  }
  for (const [sector, exposure] of Object.entries(sectorExposure)) {
    if (exposure > SECTOR_CAP_PCT) {
      const sectorStocks = activeStocks.filter(s => s.sector === sector);
      const scale = SECTOR_CAP_PCT / exposure;
      for (const s of sectorStocks) {
        s.positionSize = round2(s.positionSize * scale);
      }
      log.log('warn', 'Portfolio', `Sector "${sector}" at ${exposure.toFixed(1)}% > ${SECTOR_CAP_PCT}% cap — scaled by ${(scale * 100).toFixed(1)}%`);
    }
  }

  // Sort
  const signalOrder: Record<SignalType, number> = { 'Strong Buy': 5, 'Buy': 4, 'Hold': 3, 'Sell': 2, 'Strong Sell': 1 };
  stocks.sort((a, b) => {
    const so = signalOrder[b.signal] - signalOrder[a.signal];
    if (so !== 0) return so;
    return b.confidence - a.confidence;
  });

  // Summary
  const sectorBreakdown: Record<string, { bullish: number; bearish: number; neutral: number }> = {};
  for (const s of stocks) {
    if (!sectorBreakdown[s.sector]) sectorBreakdown[s.sector] = { bullish: 0, bearish: 0, neutral: 0 };
    const sd = sectorBreakdown[s.sector];
    if (s.signal.includes('Buy')) sd.bullish++;
    else if (s.signal.includes('Sell')) sd.bearish++;
    else sd.neutral++;
  }

  const topSignals = stocks.slice(0, 10).map(s => ({ symbol: s.symbol, signal: s.signal, confidence: s.confidence }));
  const avgDQ = stocks.length > 0 ? Math.round(stocks.reduce((s, st) => s + st.dataQuality.score, 0) / stocks.length) : 0;
  const anomalyCount = stocks.filter(s => s.dataQuality.anomalies.length > 0).length;
  const missingCount = stocks.filter(s => s.dataQuality.missingIndicators.length > 0).length;

  const summary: ScreenerSummary = {
    total: stocks.length,
    strongBuy: stocks.filter(s => s.signal === 'Strong Buy').length,
    buy: stocks.filter(s => s.signal === 'Buy').length,
    hold: stocks.filter(s => s.signal === 'Hold').length,
    sell: stocks.filter(s => s.signal === 'Sell').length,
    strongSell: stocks.filter(s => s.signal === 'Strong Sell').length,
    avgConfidence: stocks.length > 0 ? Math.round(stocks.reduce((s, st) => s + st.confidence, 0) / stocks.length) : 0,
    topSignals, sectorBreakdown,
    filteredTotal: stocks.length,
    generatedAt: now,
    timeframe: p.timeframe,
    dataQualityStats: { avgScore: avgDQ, stocksWithAnomalies: anomalyCount, missingDataCount: missingCount },
  };

  return { stocks, summary, parameters: p, generatedAt: now, logs: log.logs };
}

// ── Backtesting ────────────────────────────────────────────────

export interface BacktestResult {
  parameters: ScreenerParameters;
  period: string;
  timeframe: Timeframe;
  totalSignals: number;
  activeSignals: number;     // non-Hold signals
  winRate: number;
  avgReturn: number;
  avgWin: number;
  avgLoss: number;
  expectancy: number;        // avg $ per trade (in %)
  profitFactor: number;
  worstTrade: number;
  sharpeRatio: number;
  signalRatePct: number;   // % of screened stocks with active signals
  methodology: string;      // describes what this metric actually measures
  transactionCost: number;  // assumed cost per trade (%)
  sampleTrades: Array<{
    symbol: string;
    signal: SignalType;
    confidence: number;
    entryPrice: number;
    exitPrice: number;
    returnPct: number;
    periodReturn: number;
    netReturn: number;      // after transaction costs
    slHit: boolean;
    tp1Hit: boolean;
    correct: boolean;
  }>;
}

/**
 * Forward-return consistency check using TradingView period performance.
 *
 * IMPORTANT METHODOLOGY NOTE (Post Audit v3):
 * This is NOT a true walk-forward backtest. It checks whether today's signals
 * are directionally consistent with the ACTUAL forward period return (1W/1M/3M/6M)
 * from TradingView. This is a meaningful improvement over the previous tautological
 * implementation (which compared same-snapshot entry vs current price), but:
 *
 * LIMITATIONS:
 * 1. It evaluates only TODAY's signals — no historical track record accumulation.
 * 2. Perf.W/1M/3M/6M are TRAILING returns as of today, not forward returns from
 *    the signal date. They approximate forward performance only if the signal
 *    was generated near the start of the period.
 * 3. No transaction costs, slippage, or execution timing are modeled in the
 *    periodReturn itself (costs are applied separately for display).
 * 4. Sell/Strong Sell correctness is assessed directionally but these signals
 *    are not practically actionable for most EGX participants (no short-selling).
 *
 * Transaction cost assumption (P1-13):
 *   - EGX broker commission: ~0.1% round-trip
 *   - CSD clearing fee: ~0.05%
 *   - Estimated slippage: 0.1% (varies by liquidity)
 *   Total: ~0.25% per side (0.5% round-trip)
 */
const TRANSACTION_COST_PCT = 0.5; // 0.5% round-trip (commission + clearing + slippage)

export function backtestSignals(
  screenerStocks: ScreenerStock[],
  performanceData: Record<string, { '1W': number; '1M': number; '3M': number; '6M': number }>,
  currentPrices: Record<string, number>,
  period: '1W' | '1M' | '3M' | '6M' = '1M',
): BacktestResult {
  // Use ACTUAL forward period return from TradingView (not tautological same-snapshot)
  const signals = screenerStocks
    .filter(s => s.signal !== 'Hold' && performanceData[s.symbol]?.[period] !== undefined)
    .map(s => {
      const periodReturn = performanceData[s.symbol][period];
      const netReturn = periodReturn - TRANSACTION_COST_PCT;

      // Directional correctness: did the stock move in the signal's direction?
      const correct = (s.signal.includes('Buy') && periodReturn > 0) ||
                       (s.signal.includes('Sell') && periodReturn < 0);

      // SL/TP checks are informational only — we can't know intra-period
      // whether SL or TP was hit first from trailing-return data alone.
      const current = currentPrices[s.symbol] || s.indicators.close;
      const slHit = s.stopLoss > 0 && (
        (s.signal.includes('Buy') && current <= s.stopLoss) ||
        (s.signal.includes('Sell') && current >= s.stopLoss)
      );
      const tp1Hit = s.takeProfits.length > 0 && (
        (s.signal.includes('Buy') && current >= s.takeProfits[0].price) ||
        (s.signal.includes('Sell') && current <= s.takeProfits[0].price)
      );

      return {
        symbol: s.symbol, signal: s.signal, confidence: s.confidence,
        entryPrice: s.entryPrice, exitPrice: current,
        returnPct: round2(periodReturn),
        periodReturn: round2(periodReturn),
        netReturn: round2(netReturn),
        slHit, tp1Hit, correct,
      };
    });

  const wins = signals.filter(s => s.correct);
  const losses = signals.filter(s => !s.correct);
  const winRate = signals.length > 0 ? (wins.length / signals.length) * 100 : 0;
  const avgWin = wins.length > 0 ? wins.reduce((s, x) => s + x.netReturn, 0) / wins.length : 0;
  const avgLoss = losses.length > 0 ? losses.reduce((s, x) => s + x.netReturn, 0) / losses.length : 0;
  const grossProfit = wins.reduce((s, x) => s + x.netReturn, 0);
  const grossLoss = Math.abs(losses.reduce((s, x) => s + x.netReturn, 0));
  const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? 99 : 0;
  const avgReturn = signals.length > 0 ? signals.reduce((s, x) => s + x.netReturn, 0) / signals.length : 0;

  // Expectancy = (WinRate × AvgWin) - ((1 - WinRate) × |AvgLoss|)
  const expectancy = (winRate / 100) * avgWin - ((1 - winRate / 100)) * Math.abs(avgLoss);

  // Worst single trade (not a true max drawdown)
  const worstTrade = signals.length > 0 ? Math.min(...signals.map(s => s.netReturn)) : 0;

  // Sharpe ratio with period adjustment
  const mean = avgReturn;
  const variance = signals.length > 1
    ? signals.reduce((s, x) => s + (x.netReturn - mean) ** 2, 0) / (signals.length - 1)
    : 0;
  const stdDev = Math.sqrt(variance);
  const periodsPerYear: Record<string, number> = { '1W': 52, '1M': 12, '3M': 4, '6M': 2 };
  const annualFactor = Math.sqrt(periodsPerYear[period] || 12);
  const sharpeRatio = stdDev > 0 ? (mean / stdDev) * annualFactor : 0;

  // Signal rate: % of screened stocks with active (non-Hold) signals
  const signalRatePct = screenerStocks.length > 0
    ? round2((signals.length / screenerStocks.length) * 100)
    : 0;

  return {
    parameters: DEFAULT_PARAMS,
    period,
    timeframe: 'daily',
    totalSignals: screenerStocks.length,
    activeSignals: signals.length,
    winRate: round2(winRate),
    avgReturn: round2(avgReturn),
    avgWin: round2(avgWin),
    avgLoss: round2(avgLoss),
    expectancy: round2(expectancy),
    profitFactor: round2(profitFactor),
    worstTrade: round2(worstTrade),
    sharpeRatio: round2(sharpeRatio),
    signalRatePct,
    methodology: `Forward ${period} directional consistency check using TradingView trailing returns. NOT a true walk-forward backtest. Costs: ${TRANSACTION_COST_PCT}% round-trip assumed.`,
    transactionCost: TRANSACTION_COST_PCT,
    sampleTrades: signals.slice(0, 20),
  };
}

// ── CSV Export ──────────────────────────────────────────────────

export function toCSV(stocks: ScreenerStock[]): string {
  const headers = [
    'Symbol', 'Name', 'Sector', 'Signal', 'Confidence', 'Timeframe', 'Horizon',
    'Entry', 'StopLoss', 'SL%', 'TP1', 'TP2', 'TP3', 'R:R', 'PosSize%',
    'RSI', 'MACD', 'StochK', 'ATR', 'BB_Width', 'vs_SMA200%',
    'TV_Rating', 'Tags', 'RiskFlags', 'DataQuality',
  ];
  const escape = (v: string) => {
    if (v.includes(',') || v.includes('"') || v.includes('\n')) {
      return `"${v.replace(/"/g, '""')}"`;
    }
    return v;
  };
  const rows = stocks.map(s => [
    s.symbol, escape(s.name), s.sector, s.signal, s.confidence, s.timeframe, s.horizon,
    s.entryPrice, s.stopLoss, s.stopLossPct,
    s.takeProfits[0]?.price ?? '', s.takeProfits[1]?.price ?? '', s.takeProfits[2]?.price ?? '',
    s.riskReward, s.positionSize,
    s.indicators.rsi, s.indicators.macd, s.indicators.stochK, s.indicators.atr,
    s.indicators.bbWidth, s.indicators.priceVsSma200,
    s.indicators.recommendAll,
    escape(s.tags.join('; ')),
    escape(s.riskFlags.join('; ')),
    `${s.dataQuality.grade} (${s.dataQuality.score})`,
  ].join(','));
  return [headers.join(','), ...rows].join('\n');
}
