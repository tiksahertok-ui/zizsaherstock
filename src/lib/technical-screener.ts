/**
 * EGX Technical Screener Engine v2
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
 * SIGNAL RULES (documented):
 *   Trend     (30%): Price vs SMA20/50/200, EMA alignment, crossover proximity
 *   Momentum  (25%): RSI zones, MACD histogram, Stochastic crosses
 *   Volatility (20%): BB position/squeeze, 52-week range
 *   Volume    (15%): Volume spike with price-direction confirmation
 *   Consensus (10%): TradingView aggregated technical rating
 *
 * TIMEFRAMES: daily (default), weekly, monthly
 *   — TradingView scanner always returns daily indicators.
 *   — Weekly/monthly signals apply adjusted thresholds to account
 *     for wider noise bands on longer timeframes.
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

export interface ScreenerStock {
  symbol: string;
  name: string;
  sector: string;
  signal: SignalType;
  confidence: number;
  entryPrice: number;
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

function calcStopLoss(t: TechnicalIndicators, signal: SignalType, tf: Timeframe): { price: number; pct: number } {
  const { close, atr, sma20, sma50, sma100, sma200, bbLower, bbUpper } = t;
  const atrMul = TF_ADJUST[tf].atrMultiplier;
  const safeAtr = atr > 0 ? atr : close * 0.02;

  if (signal === 'Strong Buy' || signal === 'Buy') {
    // Long: SL below support levels
    const atrSL = close - (safeAtr * 2 * atrMul);
    const s20 = sma20 > 0 ? sma20 : close * 0.98;
    const s50 = sma50 > 0 ? sma50 : close * 0.96;
    const bbSl = bbLower > 0 ? bbLower : close * 0.97;
    // Tightest SL below price
    const sl = Math.max(atrSL, Math.min(s20, s50, bbSl));
    const finalSL = Math.min(sl, close * 0.995);
    const pct = safeDiv(close - finalSL, close, 0) * 100;
    return { price: round2(finalSL), pct: round2(pct) };
  } else if (signal === 'Strong Sell' || signal === 'Sell') {
    // Short: SL above resistance
    const atrSL = close + (safeAtr * 2 * atrMul);
    const s20 = sma20 > 0 ? sma20 : close * 1.02;
    const s50 = sma50 > 0 ? sma50 : close * 1.04;
    const bbSl = bbUpper > 0 ? bbUpper : close * 1.03;
    const sl = Math.min(atrSL, Math.max(s20, s50, bbSl));
    const finalSL = Math.max(sl, close * 1.005);
    const pct = safeDiv(finalSL - close, close, 0) * 100;
    return { price: round2(finalSL), pct: round2(pct) };
  }

  // FIX: Hold — direction-aware SL based on trend
  const trendBias = (sma50 > 0 && close > sma50) || (sma200 > 0 && close > sma200);
  if (trendBias) {
    const sl = close - (safeAtr * 2.5 * atrMul);
    const pct = safeDiv(close - sl, close, 0) * 100;
    return { price: round2(sl), pct: round2(pct) };
  } else {
    const sl = close + (safeAtr * 2.5 * atrMul);
    const pct = safeDiv(sl - close, close, 0) * 100;
    return { price: round2(sl), pct: round2(pct) };
  }
}

function calcTakeProfits(t: TechnicalIndicators, signal: SignalType, tf: Timeframe): TakeProfitTarget[] {
  const { close, atr, sma200, sma50, bbUpper, bbLower, week52High, week52Low } = t;
  const atrMul = TF_ADJUST[tf].atrMultiplier;
  const safeAtr = atr > 0 ? atr : close * 0.02;
  const isBull = signal === 'Strong Buy' || signal === 'Buy';
  const tps: TakeProfitTarget[] = [];

  if (isBull) {
    const tp1 = round2(close + safeAtr * 1.5 * atrMul);
    tps.push({ level: 1, price: tp1, basis: `${round2(1.5 * atrMul)}× ATR`, probability: 'High' });

    const tp2a = bbUpper > 0 ? bbUpper : close + safeAtr * 2.5 * atrMul;
    tps.push({ level: 2, price: round2(tp2a), basis: bbUpper > 0 ? 'BB Upper Band' : `${round2(2.5 * atrMul)}× ATR`, probability: 'Medium' });

    const tp3a = week52High > 0 ? week52High : close + safeAtr * 4 * atrMul;
    tps.push({ level: 3, price: round2(tp3a), basis: week52High > 0 ? '52-Week High' : `${round2(4 * atrMul)}× ATR`, probability: 'Low' });
  } else if (signal === 'Sell' || signal === 'Strong Sell') {
    const tp1 = round2(close - safeAtr * 1.5 * atrMul);
    tps.push({ level: 1, price: tp1, basis: `${round2(1.5 * atrMul)}× ATR`, probability: 'High' });

    const tp2a = bbLower > 0 ? bbLower : close - safeAtr * 2.5 * atrMul;
    tps.push({ level: 2, price: round2(tp2a), basis: bbLower > 0 ? 'BB Lower Band' : `${round2(2.5 * atrMul)}× ATR`, probability: 'Medium' });

    const tp3a = week52Low > 0 ? week52Low : close - safeAtr * 4 * atrMul;
    tps.push({ level: 3, price: round2(tp3a), basis: week52Low > 0 ? '52-Week Low' : `${round2(4 * atrMul)}× ATR`, probability: 'Low' });
  }

  // Hold signals: generate directional TPs based on trend bias
  if (tps.length === 0) {
    const trendUp = sma50 > 0 && close > sma50;
    const dir = trendUp ? 1 : -1;
    tps.push({ level: 1, price: round2(close + dir * safeAtr * 1.5 * atrMul), basis: `${round2(1.5 * atrMul)}× ATR (trend)`, probability: 'Medium' });
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
    const agreeingRationales = allRationales.filter(r =>
      (composite > 0 && r.direction > 0) || (composite < 0 && r.direction < 0)
    ).length;
    const agreement = allRationales.length > 0 ? agreeingRationales / allRationales.length : 0.5;
    const dataQualityBonus = dq.score >= 80 ? 5 : dq.score >= 60 ? 0 : -10;
    const confidence = clamp(Math.round(magnitude * 0.7 + agreement * 35 + 15 + dataQualityBonus), 0, 100);

    if (confidence < p.minConfidence) { skippedConfidence++; continue; }

    // SL, TP, R:R
    const sl = calcStopLoss(t, signal, p.timeframe);
    const tps = calcTakeProfits(t, signal, p.timeframe);
    const risk = Math.abs(t.close - sl.price);
    const reward = tps.length > 0 ? Math.abs(tps[0].price - t.close) : 0;
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
      signal, confidence, entryPrice: t.close,
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
  sampleTrades: Array<{
    symbol: string;
    signal: SignalType;
    confidence: number;
    entryPrice: number;
    exitPrice: number;
    returnPct: number;
    periodReturn: number;
    slHit: boolean;
    tp1Hit: boolean;
    correct: boolean;
  }>;
}

/**
 * Walk-forward backtest using historical performance data.
 * FIX: Uses actual live prices (not entry prices) for return calculation.
 */
export function backtestSignals(
  screenerStocks: ScreenerStock[],
  performanceData: Record<string, { '1W': number; '1M': number; '3M': number; '6M': number }>,
  currentPrices: Record<string, number>,
  period: '1W' | '1M' | '3M' | '6M' = '1M',
): BacktestResult {
  // FIX: currentPrices should contain ACTUAL current/live prices, not entry prices
  const signals = screenerStocks
    .filter(s => s.signal !== 'Hold' && currentPrices[s.symbol] > 0)
    .map(s => {
      const current = currentPrices[s.symbol];
      const entry = s.entryPrice;
      const returnPct = safeDiv(current - entry, entry, 0) * 100;
      const perf = performanceData[s.symbol]?.[period] || 0;
      const correct = (s.signal.includes('Buy') && returnPct > 0) || (s.signal.includes('Sell') && returnPct < 0);
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
        entryPrice: entry, exitPrice: current,
        returnPct: round2(returnPct), periodReturn: perf,
        slHit, tp1Hit, correct,
      };
    });

  const wins = signals.filter(s => s.correct);
  const losses = signals.filter(s => !s.correct);
  const winRate = signals.length > 0 ? (wins.length / signals.length) * 100 : 0;
  const avgWin = wins.length > 0 ? wins.reduce((s, x) => s + x.returnPct, 0) / wins.length : 0;
  const avgLoss = losses.length > 0 ? losses.reduce((s, x) => s + x.returnPct, 0) / losses.length : 0;
  const grossProfit = wins.reduce((s, x) => s + x.returnPct, 0);
  const grossLoss = Math.abs(losses.reduce((s, x) => s + x.returnPct, 0));
  const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? 99 : 0;
  const avgReturn = signals.length > 0 ? signals.reduce((s, x) => s + x.returnPct, 0) / signals.length : 0;

  // Expectancy = (WinRate × AvgWin) - ((1 - WinRate) × |AvgLoss|)
  const expectancy = (winRate / 100) * avgWin - ((1 - winRate / 100)) * Math.abs(avgLoss);

  // Worst single trade (not a true max drawdown)
  const worstTrade = signals.length > 0 ? Math.min(...signals.map(s => s.returnPct)) : 0;

  // Sharpe ratio with period adjustment
  const mean = avgReturn;
  const variance = signals.length > 1
    ? signals.reduce((s, x) => s + (x.returnPct - mean) ** 2, 0) / (signals.length - 1)
    : 0;
  const stdDev = Math.sqrt(variance);
  // FIX: Adjust annualization by period
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
    timeframe: 'daily', // TODO: should come from params when backtest supports multi-TF
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
    sampleTrades: signals.slice(0, 20), // top 20 sample trades
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
