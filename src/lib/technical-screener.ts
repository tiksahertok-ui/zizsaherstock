/**
 * EGX Daily Technical Screener Engine
 * ─────────────────────────────────────────────────────────────────
 * Production-ready technical analysis screener for Egyptian Exchange.
 * Uses TradingView-provided indicators to generate clear Buy/Hold/Sell
 * signals with entry, stop-loss, take-profit targets, confidence scores,
 * rationale tags, and risk management rules.
 *
 * Indicators consumed (all from TradingView scanner, no local calc):
 *   SMA20/50/100/200, EMA20/50/100/200, RSI, Stoch K/D,
 *   MACD/Signal, BB Upper/Lower, ATR, Volume, 52w High/Low,
 *   recommendAll/MA/Other, Pivot Points.
 */

import type { TechnicalIndicators } from './market-data';

// ── Types ──────────────────────────────────────────────────────

export type SignalType = 'Strong Buy' | 'Buy' | 'Hold' | 'Sell' | 'Strong Sell';

export interface SignalRationale {
  tag: string;
  weight: number;  // contribution to final score
  direction: 1 | -1 | 0;  // bullish / bearish / neutral
  description: string;
}

export interface TakeProfitTarget {
  level: number;       // TP1, TP2, TP3
  price: number;
  basis: string;       // e.g., "2× ATR", "BB Upper", "SMA200"
  probability: string; // e.g., "High", "Medium"
}

export interface ScreenerStock {
  symbol: string;
  name: string;
  sector: string;
  signal: SignalType;
  confidence: number;         // 0–100
  entryPrice: number;
  stopLoss: number;
  stopLossPct: number;        // % from entry
  takeProfits: TakeProfitTarget[];
  riskReward: number;        // average TP reward vs SL risk
  positionSize: number;       // suggested % of portfolio
  rationale: SignalRationale[];
  tags: string[];             // shorthand tags for UI
  // Raw indicators for transparency
  indicators: {
    rsi: number; macd: number; macdSignal: number;
    stochK: number; stochD: number;
    atr: number; bbUpper: number; bbLower: number;
    sma20: number; sma50: number; sma200: number;
    ema20: number; ema50: number; ema200: number;
    volume: number; close: number;
    recommendAll: number;
    bbWidth: number;       // (upper-lower)/mid as %
    priceVsSma200: number; // % above/below SMA200
    priceVsBB: number;    // % position within BB (-1=lower, +1=upper)
  };
  // Risk checks
  riskFlags: string[];
  // Metadata
  generatedAt: string;
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
  generatedAt: string;
}

export interface ScreenerResult {
  stocks: ScreenerStock[];
  summary: ScreenerSummary;
  parameters: ScreenerParameters;
  generatedAt: string;
}

export interface ScreenerParameters {
  // Signal thresholds
  buyThreshold: number;
  strongBuyThreshold: number;
  sellThreshold: number;
  strongSellThreshold: number;
  // Risk
  maxRiskPerTrade: number;      // % of portfolio
  maxPortfolioExposure: number;  // max total %
  minLiquidity: number;         // min avg daily turnover (proxy: volume)
  // Volume confirmation
  volumeSpikeThreshold: number; // multiplier for volume spike detection
  // Filters
  minPrice: number;
  maxPrice: number;
  minConfidence: number;
  sector?: string;
}

// ── Default Parameters ────────────────────────────────────────

export const DEFAULT_PARAMS: ScreenerParameters = {
  buyThreshold: 35,
  strongBuyThreshold: 65,
  sellThreshold: -35,
  strongSellThreshold: -65,
  maxRiskPerTrade: 2,
  maxPortfolioExposure: 80,
  minLiquidity: 100_000,
  volumeSpikeThreshold: 1.5,
  minPrice: 1,
  maxPrice: 0, // 0 = no max
  minConfidence: 40,
};

// ── Scoring Components ─────────────────────────────────────────

interface ScoreComponent {
  name: string;
  score: number;    // -100 to +100
  weight: number;    // 0–1, sums to ~1
  rationale: SignalRationale[];
}

/** 1. Trend Score (weight: 0.30) */
function scoreTrend(t: TechnicalIndicators): ScoreComponent {
  const r: SignalRationale[] = [];
  let score = 0;
  const { close, sma20, sma50, sma100, sma200, ema20, ema50, ema200 } = t;
  const safe = (v: number) => (v > 0 ? v : close);
  const s20 = safe(sma20), s50 = safe(sma50), s100 = safe(sma100), s200 = safe(sma200);
  const e20 = safe(ema20), e50 = safe(ema50);

  // Price vs MAs (each ±15)
  const above20 = close > s20 ? 15 : close < s20 ? -15 : 0;
  const above50 = close > s50 ? 12 : close < s50 ? -12 : 0;
  const above200 = close > s200 ? 18 : close < s200 ? -18 : 0;
  score += above20 + above50 + above200;

  if (above20 > 0) r.push({ tag: 'Above SMA20', weight: 15, direction: 1, description: `Price (${close.toFixed(2)}) above SMA20 (${s20.toFixed(2)})` });
  if (above20 < 0) r.push({ tag: 'Below SMA20', weight: 15, direction: -1, description: `Price below SMA20` });
  if (above50 > 0) r.push({ tag: 'Above SMA50', weight: 12, direction: 1, description: `Price above SMA50 (${s50.toFixed(2)})` });
  if (above50 < 0) r.push({ tag: 'Below SMA50', weight: 12, direction: -1, description: `Price below SMA50` });
  if (above200 > 0) r.push({ tag: 'Above SMA200', weight: 18, direction: 1, description: `Price above 200-day MA (${s200.toFixed(2)}) — long-term bullish` });
  if (above200 < 0) r.push({ tag: 'Below SMA200', weight: 18, direction: -1, description: `Price below 200-day MA — long-term bearish` });

  // EMA alignment (±10 each)
  if (e20 > e50 && e50 > s200) {
    score += 15;
    r.push({ tag: 'Bullish MA Stack', weight: 15, direction: 1, description: 'EMA20 > EMA50 > SMA200 — bullish alignment' });
  } else if (e20 < e50 && e50 < s200) {
    score -= 15;
    r.push({ tag: 'Bearish MA Stack', weight: 15, direction: -1, description: 'EMA20 < EMA50 < SMA200 — bearish alignment' });
  }

  // EMA crossover detection (proximity-based)
  const emaSpread = ((e20 - e50) / s50) * 100;
  if (Math.abs(emaSpread) < 1) {
    const dir = emaSpread >= 0 ? 1 : -1;
    score += dir * 8;
    r.push({ tag: 'EMA Cross Nearby', weight: 8, direction: dir as 1 | -1, description: `EMA20/50 spread ${(emaSpread).toFixed(2)}% — crossover imminent` });
  }

  return { name: 'Trend', score: Math.max(-100, Math.min(100, score)), weight: 0.30, rationale: r };
}

/** 2. Momentum Score (weight: 0.25) */
function scoreMomentum(t: TechnicalIndicators): ScoreComponent {
  const r: SignalRationale[] = [];
  let score = 0;
  const { rsi, macd, macdSignal, stochK, stochD } = t;

  // RSI (±25)
  if (rsi > 0) {
    if (rsi < 30) {
      score += 25;
      r.push({ tag: 'RSI Oversold', weight: 25, direction: 1, description: `RSI at ${rsi.toFixed(1)} — oversold, potential bounce` });
    } else if (rsi < 40) {
      score += 12;
      r.push({ tag: 'RSI Low', weight: 12, direction: 1, description: `RSI at ${rsi.toFixed(1)} — approaching oversold` });
    } else if (rsi > 70) {
      score -= 25;
      r.push({ tag: 'RSI Overbought', weight: 25, direction: -1, description: `RSI at ${rsi.toFixed(1)} — overbought, potential decline` });
    } else if (rsi > 60) {
      score -= 8;
      r.push({ tag: 'RSI High', weight: 8, direction: -1, description: `RSI at ${rsi.toFixed(1)} — approaching overbought` });
    } else {
      // Neutral RSI — slight bullish bias for 45-55 range (trending)
      score += 3;
    }
  }

  // MACD (±20)
  if (macd > 0 && macdSignal > 0) {
    score += 15;
    r.push({ tag: 'MACD Bullish', weight: 15, direction: 1, description: 'MACD and signal both positive' });
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

  // Stochastic (±15)
  if (stochK > 0 && stochD > 0) {
    if (stochK < 20 && stochD < 20) {
      score += 15;
      r.push({ tag: 'Stoch Oversold', weight: 15, direction: 1, description: `Stoch K(${stochK.toFixed(1)}) D(${stochD.toFixed(1)}) — oversold zone` });
    } else if (stochK > 80 && stochD > 80) {
      score -= 15;
      r.push({ tag: 'Stoch Overbought', weight: 15, direction: -1, description: `Stochastic in overbought zone` });
    } else if (stochK > stochD && stochK < 50) {
      score += 8;
      r.push({ tag: 'Stoch Bull Cross', weight: 8, direction: 1, description: 'Stoch K crossed above D in lower zone' });
    } else if (stochK < stochD && stochK > 50) {
      score -= 8;
      r.push({ tag: 'Stoch Bear Cross', weight: 8, direction: -1, description: 'Stoch K crossed below D in upper zone' });
    }
  }

  return { name: 'Momentum', score: Math.max(-100, Math.min(100, score)), weight: 0.25, rationale: r };
}

/** 3. Volatility & Breakout Score (weight: 0.20) */
function scoreVolatility(t: TechnicalIndicators): ScoreComponent {
  const r: SignalRationale[] = [];
  let score = 0;
  const { close, bbUpper, bbLower, atr, week52High, week52Low } = t;

  const bbMid = (bbUpper + bbLower) / 2;
  const bbWidth = bbMid > 0 ? ((bbUpper - bbLower) / bbMid) * 100 : 0;

  // Bollinger Band position (±15)
  if (bbUpper > 0 && bbLower > 0 && bbWidth > 0) {
    const bbPos = bbMid > 0 ? ((close - bbLower) / (bbUpper - bbLower)) * 2 - 1 : 0; // -1 to +1

    if (bbPos > 0.9) {
      score -= 12;
      r.push({ tag: 'BB Upper Touch', weight: 12, direction: -1, description: 'Price at upper Bollinger Band — overextended' });
    } else if (bbPos < -0.9) {
      score += 12;
      r.push({ tag: 'BB Lower Touch', weight: 12, direction: 1, description: 'Price at lower Bollinger Band — oversold' });
    } else if (bbPos > 0.5) {
      score += 5; // mild bullish — in upper half
    } else if (bbPos < -0.5) {
      score -= 5; // mild bearish — in lower half
    }

    // BB Squeeze (low volatility, potential breakout)
    if (bbWidth < 5) {
      const dir = close > bbMid ? 1 : -1;
      score += dir * 8;
      r.push({ tag: 'BB Squeeze', weight: 8, direction: dir as 1 | -1, description: `BB width ${bbWidth.toFixed(1)}% — low volatility, breakout imminent (${dir > 0 ? 'bullish' : 'bearish'} bias)` });
    }
  }

  // 52-week range position (±15)
  if (week52High > 0 && week52Low > 0 && week52High > week52Low) {
    const rangePos = ((close - week52Low) / (week52High - week52Low)) * 100;

    if (rangePos > 95) {
      score -= 10;
      r.push({ tag: 'Near 52w High', weight: 10, direction: -1, description: `At ${rangePos.toFixed(0)}% of 52-week range — extended` });
    } else if (rangePos < 10) {
      score += 15;
      r.push({ tag: 'Near 52w Low', weight: 15, direction: 1, description: `At ${rangePos.toFixed(0)}% of 52-week range — potential value zone` });
    } else if (rangePos < 30) {
      score += 8;
      r.push({ tag: 'Lower 52w Range', weight: 8, direction: 1, description: 'In lower third of 52-week range' });
    } else if (rangePos > 80) {
      score -= 5;
      r.push({ tag: 'Upper 52w Range', weight: 5, direction: -1, description: 'In upper fifth of 52-week range' });
    }
  }

  return {
    name: 'Volatility', score: Math.max(-100, Math.min(100, score)), weight: 0.20, rationale: r,
    _bbWidth: bbWidth, _bbPos: bbMid > 0 && bbUpper > bbLower ? ((close - bbLower) / (bbUpper - bbLower)) * 2 - 1 : 0,
  } as ScoreComponent & { _bbWidth: number; _bbPos: number };
}

/** 4. Volume Confirmation (weight: 0.15) */
function scoreVolume(t: TechnicalIndicators, avgVolume: number): ScoreComponent {
  const r: SignalRationale[] = [];
  let score = 0;
  const { volume, close, sma20 } = t;

  if (volume <= 0 || avgVolume <= 0) {
    return { name: 'Volume', score: 0, weight: 0.15, rationale: [r.push({ tag: 'No Volume Data', weight: 0, direction: 0, description: 'Volume data unavailable' }), r[0]] };
  }

  const volRatio = volume / avgVolume;
  const priceChange = sma20 > 0 ? ((close - sma20) / sma20) * 100 : 0;

  if (volRatio > 2) {
    // High volume — confirm the direction
    if (priceChange > 0) {
      score += 20;
      r.push({ tag: 'High Volume Rally', weight: 20, direction: 1, description: `Volume ${(volRatio).toFixed(1)}× average with price up — strong buying` });
    } else {
      score -= 20;
      r.push({ tag: 'High Volume Sell-off', weight: 20, direction: -1, description: `Volume ${(volRatio).toFixed(1)}× average with price down — distribution` });
    }
  } else if (volRatio > 1.5) {
    if (priceChange > 0) {
      score += 12;
      r.push({ tag: 'Above-Avg Volume Bull', weight: 12, direction: 1, description: `Volume ${(volRatio).toFixed(1)}× average — accumulation` });
    } else {
      score -= 10;
      r.push({ tag: 'Above-Avg Volume Bear', weight: 10, direction: -1, description: 'Above-average volume on decline' });
    }
  } else if (volRatio < 0.5) {
    r.push({ tag: 'Low Volume', weight: 0, direction: 0, description: `Volume only ${(volRatio).toFixed(1)}× average — low conviction` });
  }

  return { name: 'Volume', score: Math.max(-100, Math.min(100, score)), weight: 0.15, rationale: r };
}

/** 5. TradingView Consensus (weight: 0.10) */
function scoreTVConsensus(t: TechnicalIndicators): ScoreComponent {
  const r: SignalRationale[] = [];
  // recommendAll: -2 (Strong Sell) to +2 (Strong Buy)
  const tv = t.recommendAll;
  const score = tv * 25; // map -2..+2 to -50..+50

  const labels: Record<number, string> = { '-2': 'Strong Sell', '-1': 'Sell', '0': 'Neutral', '1': 'Buy', '2': 'Strong Buy' };
  const dir = tv > 0.3 ? 1 : tv < -0.3 ? -1 : 0;
  r.push({ tag: `TV: ${labels[Math.round(tv)] || 'Neutral'}`, weight: Math.abs(score), direction: dir as 1 | -1 | 0, description: `TradingView aggregated rating: ${tv > 0 ? '+' : ''}${tv.toFixed(2)}` });

  return { name: 'TV Consensus', score: Math.max(-100, Math.min(100, score)), weight: 0.10, rationale: r };
}

// ── Signal Classification ──────────────────────────────────────

function classifySignal(score: number, params: ScreenerParameters): SignalType {
  if (score >= params.strongBuyThreshold) return 'Strong Buy';
  if (score >= params.buyThreshold) return 'Buy';
  if (score <= params.strongSellThreshold) return 'Strong Sell';
  if (score <= params.sellThreshold) return 'Sell';
  return 'Hold';
}

// ── Stop-Loss & Take-Profit Calculation ────────────────────────

function calcStopLoss(t: TechnicalIndicators, signal: SignalType): { price: number; pct: number } {
  const { close, atr, sma20, sma50, bbLower, bbUpper } = t;
  const safeAtr = atr > 0 ? atr : close * 0.02;

  if (signal === 'Strong Buy' || signal === 'Buy') {
    // For longs: SL below recent support
    const atrSL = close - (safeAtr * 2);
    const smaSL = Math.min(sma20 > 0 ? sma20 : close, sma50 > 0 ? sma50 : close);
    const bbSL = bbLower > 0 ? bbLower : close * 0.97;
    // Use the highest (tightest) SL that's still below price
    const sl = Math.max(atrSL, Math.min(smaSL, bbSL));
    const pct = ((close - sl) / close) * 100;
    return { price: Math.round(sl * 100) / 100, pct: Math.round(pct * 100) / 100 };
  } else if (signal === 'Strong Sell' || signal === 'Sell') {
    // For shorts: SL above recent resistance
    const atrSL = close + (safeAtr * 2);
    const smaSL = Math.max(sma20 > 0 ? sma20 : close, sma50 > 0 ? sma50 : close);
    const bbSL = bbUpper > 0 ? bbUpper : close * 1.03;
    const sl = Math.min(atrSL, Math.max(smaSL, bbSL));
    const pct = ((sl - close) / close) * 100;
    return { price: Math.round(sl * 100) / 100, pct: Math.round(pct * 100) / 100 };
  }

  // Hold — wide SL
  return { price: Math.round((close - safeAtr * 3) * 100) / 100, pct: Math.round((safeAtr * 3 / close) * 10000) / 100 };
}

function calcTakeProfits(t: TechnicalIndicators, signal: SignalType, sl: number): TakeProfitTarget[] {
  const { close, atr, sma200, bbUpper, bbLower, week52High, week52Low } = t;
  const safeAtr = atr > 0 ? atr : close * 0.02;
  const isBull = signal === 'Strong Buy' || signal === 'Buy';
  const tps: TakeProfitTarget[] = [];

  if (isBull) {
    // TP1: 1.5× ATR from entry
    const tp1 = Math.round((close + safeAtr * 1.5) * 100) / 100;
    tps.push({ level: 1, price: tp1, basis: '1.5× ATR', probability: 'High' });

    // TP2: BB Upper or 2.5× ATR
    const tp2a = bbUpper > 0 ? bbUpper : close + safeAtr * 2.5;
    const tp2 = Math.round(tp2a * 100) / 100;
    tps.push({ level: 2, price: tp2, basis: bbUpper > 0 ? 'BB Upper Band' : '2.5× ATR', probability: 'Medium' });

    // TP3: 52w High or 4× ATR
    const tp3a = week52High > 0 ? week52High : close + safeAtr * 4;
    const tp3 = Math.round(tp3a * 100) / 100;
    tps.push({ level: 3, price: tp3, basis: week52High > 0 ? '52-Week High' : '4× ATR', probability: 'Low' });
  } else if (signal === 'Sell' || signal === 'Strong Sell') {
    const tp1 = Math.round((close - safeAtr * 1.5) * 100) / 100;
    tps.push({ level: 1, price: tp1, basis: '1.5× ATR', probability: 'High' });

    const tp2a = bbLower > 0 ? bbLower : close - safeAtr * 2.5;
    const tp2 = Math.round(tp2a * 100) / 100;
    tps.push({ level: 2, price: tp2, basis: bbLower > 0 ? 'BB Lower Band' : '2.5× ATR', probability: 'Medium' });

    const tp3a = week52Low > 0 ? week52Low : close - safeAtr * 4;
    const tp3 = Math.round(tp3a * 100) / 100;
    tps.push({ level: 3, price: tp3, basis: week52Low > 0 ? '52-Week Low' : '4× ATR', probability: 'Low' });
  }

  return tps;
}

// ── Risk Management ────────────────────────────────────────────

function calcPositionSize(slPct: number, params: ScreenerParameters, confidence: number): number {
  if (slPct <= 0) return 0;
  // Position size = (maxRiskPerTrade / SL%) × confidence adjustment
  const base = params.maxRiskPerTrade / slPct * 100;
  const adj = 0.5 + (confidence / 100) * 0.5; // 0.5× to 1.0× based on confidence
  const size = base * adj;
  return Math.round(Math.min(size, 20) * 100) / 100; // cap at 20%
}

function getRiskFlags(t: TechnicalIndicators, signal: SignalType, volume: number, avgVol: number): string[] {
  const flags: string[] = [];
  if (volume < 50000) flags.push('Very Low Liquidity');
  else if (volume < 100000) flags.push('Low Liquidity');
  if (t.atr <= 0 || t.close <= 0) flags.push('Missing ATR Data');
  if (t.rsi <= 0) flags.push('Missing RSI Data');
  if (signal !== 'Hold' && t.rsi > 0 && ((signal === 'Buy' && t.rsi > 65) || (signal === 'Sell' && t.rsi < 35))) {
    flags.push('Signal-RSI Divergence');
  }
  if (t.week52High > 0 && t.week52Low > 0) {
    const range = t.week52High - t.week52Low;
    if (range > 0 && t.atr / range > 0.05) flags.push('High Daily Volatility');
  }
  return flags;
}

// ── Main Screener Function ─────────────────────────────────────

export async function runTechnicalScreener(
  techData: Record<string, TechnicalIndicators>,
  stockInfo: Array<{ symbol: string; name: string; sector: string }>,
  avgVolumes: Record<string, number>,
  params: Partial<ScreenerParameters> = {}
): Promise<ScreenerResult> {
  const p = { ...DEFAULT_PARAMS, ...params };
  const now = new Date().toISOString();
  const stocks: ScreenerStock[] = [];

  for (const stock of stockInfo) {
    const t = techData[stock.symbol];
    if (!t || t.close <= 0) continue;

    // Price filter
    if (t.close < p.minPrice) continue;
    if (p.maxPrice > 0 && t.close > p.maxPrice) continue;

    // Sector filter
    if (p.sector && p.sector !== 'All' && stock.sector !== p.sector) continue;

    // Liquidity filter
    if (t.volume < p.minLiquidity) continue;

    // ── Calculate component scores ──
    const trend = scoreTrend(t);
    const momentum = scoreMomentum(t);
    const vol = scoreVolatility(t);
    const volumeScore = scoreVolume(t, avgVolumes[stock.symbol] || t.volume);
    const tvConsensus = scoreTVConsensus(t);

    // ── Weighted composite score (-100 to +100) ──
    const composite =
      trend.score * trend.weight +
      momentum.score * momentum.weight +
    vol.score * vol.weight +
    volumeScore.score * volumeScore.weight +
    tvConsensus.score * tvConsensus.weight;

    // ── Classify signal ──
    const signal = classifySignal(composite, p);

    // ── Confidence (0-100) ──
    // Based on: magnitude of score + indicator agreement + data quality
    const magnitude = Math.abs(composite);
    const allRationales = [...trend.rationale, ...momentum.rationale, ...vol.rationale, ...volumeScore.rationale, ...tvConsensus.rationale];
    const agreeingRationales = allRationales.filter(r =>
      (composite > 0 && r.direction > 0) || (composite < 0 && r.direction < 0)
    ).length;
    const agreement = allRationales.length > 0 ? agreeingRationales / allRationales.length : 0.5;
    const confidence = Math.round(Math.min(100, magnitude * 0.8 + agreement * 40 + 10));

    if (confidence < p.minConfidence) continue;

    // ── Stop-Loss & Take-Profits ──
    const sl = calcStopLoss(t, signal);
    const tps = calcTakeProfits(t, signal, sl.price);

    // ── Risk-Reward ──
    const risk = Math.abs(t.close - sl.price);
    const reward = tps.length > 0 ? Math.abs(tps[0].price - t.close) : risk;
    const riskReward = risk > 0 ? Math.round((reward / risk) * 100) / 100 : 0;

    // ── Position Size ──
    const positionSize = calcPositionSize(sl.pct, p, confidence);

    // ── Risk Flags ──
    const riskFlags = getRiskFlags(t, signal, t.volume, avgVolumes[stock.symbol] || t.volume);

    // ── BB/MA derived values for transparency ──
    const bbMid = (t.bbUpper + t.bbLower) / 2;
    const bbWidthPct = bbMid > 0 ? ((t.bbUpper - t.bbLower) / bbMid) * 100 : 0;
    const priceVsSma200 = t.sma200 > 0 ? ((t.close - t.sma200) / t.sma200) * 100 : 0;
    const priceVsBB = (t.bbUpper > t.bbLower) ? ((t.close - t.bbLower) / (t.bbUpper - t.bbLower)) * 2 - 1 : 0;

    // ── Tags (short rationale labels for UI) ──
    const tags = allRationales
      .filter(r => r.direction !== 0 && Math.abs(r.weight) >= 5)
      .sort((a, b) => b.weight - a.weight)
      .slice(0, 5)
      .map(r => r.tag);

    stocks.push({
      symbol: stock.symbol,
      name: stock.name,
      sector: stock.sector,
      signal,
      confidence,
      entryPrice: t.close,
      stopLoss: sl.price,
      stopLossPct: sl.pct,
      takeProfits: tps,
      riskReward,
      positionSize,
      rationale: allRationales,
      tags,
      indicators: {
        rsi: t.rsi, macd: t.macd, macdSignal: t.macdSignal,
        stochK: t.stochK, stochD: t.stochD,
        atr: t.atr, bbUpper: t.bbUpper, bbLower: t.bbLower,
        sma20: t.sma20, sma50: t.sma50, sma200: t.sma200,
        ema20: t.ema20, ema50: t.ema50, ema200: t.ema200,
        volume: t.volume, close: t.close,
        recommendAll: t.recommendAll,
        bbWidth: Math.round(bbWidthPct * 100) / 100,
        priceVsSma200: Math.round(priceVsSma200 * 100) / 100,
        priceVsBB: Math.round(priceVsBB * 100) / 100,
      },
      riskFlags,
      generatedAt: now,
    });
  }

  // ── Sort by confidence desc, then by signal strength ──
  const signalOrder: Record<SignalType, number> = { 'Strong Buy': 5, 'Buy': 4, 'Hold': 3, 'Sell': 2, 'Strong Sell': 1 };
  stocks.sort((a, b) => {
    const so = signalOrder[b.signal] - signalOrder[a.signal];
    if (so !== 0) return so;
    return b.confidence - a.confidence;
  });

  // ── Summary ──
  const sectorBreakdown: Record<string, { bullish: number; bearish: number; neutral: number }> = {};
  for (const s of stocks) {
    if (!sectorBreakdown[s.sector]) sectorBreakdown[s.sector] = { bullish: 0, bearish: 0, neutral: 0 };
    const sd = sectorBreakdown[s.sector];
    if (s.signal.includes('Buy')) sd.bullish++;
    else if (s.signal.includes('Sell')) sd.bearish++;
    else sd.neutral++;
  }

  const topSignals = stocks.slice(0, 10).map(s => ({ symbol: s.symbol, signal: s.signal, confidence: s.confidence }));

  const summary: ScreenerSummary = {
    total: stocks.length,
    strongBuy: stocks.filter(s => s.signal === 'Strong Buy').length,
    buy: stocks.filter(s => s.signal === 'Buy').length,
    hold: stocks.filter(s => s.signal === 'Hold').length,
    sell: stocks.filter(s => s.signal === 'Sell').length,
    strongSell: stocks.filter(s => s.signal === 'Strong Sell').length,
    avgConfidence: stocks.length > 0 ? Math.round(stocks.reduce((s, st) => s + st.confidence, 0) / stocks.length) : 0,
    topSignals,
    sectorBreakdown,
    generatedAt: now,
  };

  return {
    stocks,
    summary,
    parameters: p,
    generatedAt: now,
  };
}

// ── Backtesting (simplified — uses TradingView performance data) ─

export interface BacktestResult {
  parameters: ScreenerParameters;
  period: string;
  totalSignals: number;
  winRate: number;
  avgReturn: number;
  avgWin: number;
  avgLoss: number;
  profitFactor: number;
  maxDrawdown: number;
  sharpeRatio: number;
  signals: Array<{
    symbol: string;
    signal: SignalType;
    confidence: number;
    entryPrice: number;
    currentPrice: number;
    returnPct: number;
    periodReturn: number;
    correct: boolean;
  }>;
}

export function backtestSignals(
  screenerStocks: ScreenerStock[],
  performanceData: Record<string, { '1W': number; '1M': number; '3M': number; '6M': number }>,
  currentPrices: Record<string, number>,
  period: '1W' | '1M' | '3M' | '6M' = '1M'
): BacktestResult {
  const signals = screenerStocks
    .filter(s => s.signal !== 'Hold' && currentPrices[s.symbol] > 0)
    .map(s => {
      const current = currentPrices[s.symbol];
      const perf = performanceData[s.symbol]?.[period] || 0;
      const returnPct = ((current - s.entryPrice) / s.entryPrice) * 100;
      const correct = (s.signal.includes('Buy') && returnPct > 0) || (s.signal.includes('Sell') && returnPct < 0);
      return {
        symbol: s.symbol, signal: s.signal, confidence: s.confidence,
        entryPrice: s.entryPrice, currentPrice: current,
        returnPct: Math.round(returnPct * 100) / 100,
        periodReturn: perf,
        correct,
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

  // Simplified max drawdown (worst single signal)
  const maxDrawdown = signals.length > 0 ? Math.min(...signals.map(s => s.returnPct)) : 0;

  // Simplified Sharpe (return / std dev)
  const mean = avgReturn;
  const variance = signals.length > 1 ? signals.reduce((s, x) => s + (x.returnPct - mean) ** 2, 0) / (signals.length - 1) : 0;
  const sharpeRatio = Math.sqrt(variance) > 0 ? (mean / Math.sqrt(variance)) * Math.sqrt(252) / Math.sqrt(1) : 0; // annualized approx

  return {
    parameters: DEFAULT_PARAMS,
    period,
    totalSignals: signals.length,
    winRate: Math.round(winRate * 100) / 100,
    avgReturn: Math.round(avgReturn * 100) / 100,
    avgWin: Math.round(avgWin * 100) / 100,
    avgLoss: Math.round(avgLoss * 100) / 100,
    profitFactor: Math.round(profitFactor * 100) / 100,
    maxDrawdown: Math.round(maxDrawdown * 100) / 100,
    sharpeRatio: Math.round(sharpeRatio * 100) / 100,
    signals,
  };
}
