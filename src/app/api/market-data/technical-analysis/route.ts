import { NextRequest, NextResponse } from "next/server";
import { fetchTechnicalIndicators, type TechnicalIndicators } from "@/lib/market-data";

/**
 * /api/market-data/technical-analysis — Professional Support & Resistance
 *
 * Uses TradingView's professional-grade technical indicators (same data used
 * by institutional analysts worldwide):
 *
 * 1. MOVING AVERAGES (Primary S/R — most widely used by analysts)
 *    - SMA 20, 50, 100, 200 & EMA 20, 50, 100, 200
 *    - Price above MA -> MA acts as support. Price below -> resistance.
 *    - Confluence: when multiple MAs cluster near same price -> stronger level.
 *
 * 2. BOLLINGER BANDS (Dynamic volatility S/R)
 *    - Upper/Lower bands expand and contract with volatility.
 *    - Price touching upper band -> potential resistance (overbought).
 *    - Price touching lower band -> potential support (oversold).
 *
 * 3. PIVOT POINTS (Intraday S/R) — TradingView built-in calculations
 *    - Classic: PP = (H+L+C)/3, standard S/R levels
 *    - Fibonacci: Uses 0.382/0.618 ratios for tighter levels
 *    - Camarilla: Short-term intraday, tighter range
 *    - Woodie: Emphasizes closing price
 *
 * 4. 52-WEEK HIGH/LOW (Major psychological levels)
 *    - Breakouts above 52W high -> bullish signal.
 *    - Breakdowns below 52W low -> bearish signal.
 *
 * 5. TECHNICAL RATING (TradingView aggregated)
 *    - Combines 20+ indicators into a single Buy/Sell rating.
 *    - Scale: -2 (Strong Sell) to +2 (Strong Buy).
 *
 * 6. OSCILLATORS (RSI, Stochastic, MACD)
 * 7. CONFLUENCE SCORING — Score 1-5 based on multi-method agreement.
 *
 * Data Sources: TradingView Scanner API (same data as TradingView charts).
 * Cache: 60s server-side.
 */

// ── Types ──────────────────────────────────────────────────────

interface SRLevel {
  price: number;
  type: 'support' | 'resistance';
  source: string;
  strength: number; // 1-5 confluence score
}

interface PivotSet {
  pp: number; s1: number; s2: number; s3: number;
  r1: number; r2: number; r3: number;
}

interface SupportResistance {
  // Nearest levels (highest confluence)
  nearestSupport: SRLevel | null;
  nearestResistance: SRLevel | null;
  // All significant levels sorted
  supports: SRLevel[];
  resistances: SRLevel[];
  // Key MAs
  ma: {
    sma20: number; sma50: number; sma100: number; sma200: number;
    ema20: number; ema50: number; ema100: number; ema200: number;
  };
  // Bollinger Bands
  bb: { upper: number; lower: number; width: number };
  // Pivot Points — all types from TradingView
  pivotsClassic: PivotSet;
  pivotsFibonacci: PivotSet;
  pivotsCamarilla: PivotSet;
  pivotsWoodie: PivotSet;
  // 52-week range
  week52High: number;
  week52Low: number;
  // Oscillators
  rsi: number;
  stochK: number;
  stochD: number;
  macd: number;
  macdSignal: number;
  macdHistogram: number;
  // ATR (volatility)
  atr: number;
  // TradingView Technical Rating
  rating: number;
  ratingMA: number;
  ratingOther: number;
  // Current price
  currentPrice: number;
  name: string;
  // Signal summary
  signal: 'Strong Buy' | 'Buy' | 'Neutral' | 'Sell' | 'Strong Sell';
}

export type { SupportResistance };

// ── Helpers ────────────────────────────────────────────────────

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function ratingToSignal(r: number): SupportResistance['signal'] {
  if (r >= 1.5) return 'Strong Buy';
  if (r >= 0.5) return 'Buy';
  if (r >= -0.5) return 'Neutral';
  if (r >= -1.5) return 'Sell';
  return 'Strong Sell';
}

const emptyPivots = (): PivotSet => ({ pp: 0, s1: 0, s2: 0, s3: 0, r1: 0, r2: 0, r3: 0 });

/** Cluster nearby levels (within ATR tolerance) and score confluence */
function clusterLevels(
  levels: SRLevel[],
  atr: number,
  price: number
): SRLevel[] {
  if (levels.length === 0) return [];

  const sorted = [...levels].sort((a, b) => a.price - b.price);
  const tolerance = atr > 0 ? Math.max(atr * 0.5, price * 0.005) : price * 0.01;

  const clustered: SRLevel[] = [];
  let cluster = { ...sorted[0], strength: sorted[0].strength, sources: [sorted[0].source] };

  for (let i = 1; i < sorted.length; i++) {
    if (Math.abs(sorted[i].price - cluster.price) <= tolerance) {
      cluster.price = round2((cluster.price * cluster.strength + sorted[i].price * sorted[i].strength) / (cluster.strength + sorted[i].strength));
      cluster.strength = Math.min(5, cluster.strength + sorted[i].strength);
      cluster.sources.push(sorted[i].source);
    } else {
      clustered.push({ ...cluster, source: cluster.sources.slice(0, 4).join(', ') });
      cluster = { ...sorted[i], strength: sorted[i].strength, sources: [sorted[i].source] };
    }
  }
  clustered.push({ ...cluster, source: cluster.sources.slice(0, 4).join(', ') });

  return clustered;
}

/** Add pivot levels from a pivot set to the allLevels array */
function addPivotLevels(
  pivots: PivotSet,
  prefix: string,
  allLevels: SRLevel[],
  price: number
): void {
  const levels: { val: number; label: string }[] = [
    { val: pivots.s1, label: `${prefix} S1` },
    { val: pivots.s2, label: `${prefix} S2` },
    { val: pivots.s3, label: `${prefix} S3` },
    { val: pivots.r1, label: `${prefix} R1` },
    { val: pivots.r2, label: `${prefix} R2` },
    { val: pivots.r3, label: `${prefix} R3` },
  ];
  for (const { val, label } of levels) {
    if (val <= 0 || val === price) continue;
    allLevels.push({
      price: round2(val),
      type: val < price ? 'support' : 'resistance',
      source: label,
      strength: 1,
    });
  }
}

// ── Main Analysis ──────────────────────────────────────────────

function analyzeStock(ind: TechnicalIndicators): SupportResistance {
  const price = ind.close;

  if (price <= 0) {
    return {
      nearestSupport: null, nearestResistance: null,
      supports: [], resistances: [],
      ma: { sma20: 0, sma50: 0, sma100: 0, sma200: 0, ema20: 0, ema50: 0, ema100: 0, ema200: 0 },
      bb: { upper: 0, lower: 0, width: 0 },
      pivotsClassic: emptyPivots(), pivotsFibonacci: emptyPivots(),
      pivotsCamarilla: emptyPivots(), pivotsWoodie: emptyPivots(),
      week52High: 0, week52Low: 0,
      rsi: 0, stochK: 0, stochD: 0, macd: 0, macdSignal: 0, macdHistogram: 0,
      atr: 0, rating: 0, ratingMA: 0, ratingOther: 0,
      currentPrice: 0, name: ind.symbol, signal: 'Neutral',
    };
  }

  const allLevels: SRLevel[] = [];

  // ── 1. Moving Averages (highest priority) ──
  const mas = [
    { name: 'SMA 20', val: ind.sma20, weight: 2 },
    { name: 'SMA 50', val: ind.sma50, weight: 3 },
    { name: 'SMA 100', val: ind.sma100, weight: 3 },
    { name: 'SMA 200', val: ind.sma200, weight: 4 },
    { name: 'EMA 20', val: ind.ema20, weight: 2 },
    { name: 'EMA 50', val: ind.ema50, weight: 3 },
    { name: 'EMA 100', val: ind.ema100, weight: 3 },
    { name: 'EMA 200', val: ind.ema200, weight: 4 },
  ];

  for (const ma of mas) {
    if (ma.val <= 0) continue;
    if (ma.val < price) {
      allLevels.push({ price: round2(ma.val), type: 'support', source: ma.name, strength: ma.weight });
    } else if (ma.val > price) {
      allLevels.push({ price: round2(ma.val), type: 'resistance', source: ma.name, strength: ma.weight });
    }
  }

  // ── 2. Bollinger Bands ──
  if (ind.bbUpper > 0 && ind.bbUpper > price) {
    allLevels.push({ price: round2(ind.bbUpper), type: 'resistance', source: 'BB Upper', strength: 2 });
  }
  if (ind.bbLower > 0 && ind.bbLower < price) {
    allLevels.push({ price: round2(ind.bbLower), type: 'support', source: 'BB Lower', strength: 2 });
  }

  // ── 3. Pivot Points — from TradingView (Classic, Fibonacci, Camarilla, Woodie) ──
  addPivotLevels(ind.pivotsClassic, 'Classic', allLevels, price);
  addPivotLevels(ind.pivotsFibonacci, 'Fibonacci', allLevels, price);
  addPivotLevels(ind.pivotsCamarilla, 'Camarilla', allLevels, price);
  addPivotLevels(ind.pivotsWoodie, 'Woodie', allLevels, price);

  // ── 4. 52-Week High/Low (major psychological levels) ──
  if (ind.week52High > price) {
    allLevels.push({ price: round2(ind.week52High), type: 'resistance', source: '52W High', strength: 3 });
  }
  if (ind.week52Low > 0 && ind.week52Low < price) {
    allLevels.push({ price: round2(ind.week52Low), type: 'support', source: '52W Low', strength: 3 });
  }

  // ── 5. Cluster nearby levels for confluence ──
  const atr = ind.atr || price * 0.02;
  const supports = clusterLevels(allLevels.filter(l => l.type === 'support'), atr, price);
  const resistances = clusterLevels(allLevels.filter(l => l.type === 'resistance'), atr, price);

  // Find nearest (closest to current price)
  const supportsBelow = supports.filter(s => s.price < price).sort((a, b) => b.price - a.price);
  const resistancesAbove = resistances.filter(r => r.price > price).sort((a, b) => a.price - b.price);

  const nearestSupport = supportsBelow.length > 0 ? supportsBelow[0] : null;
  const nearestResistance = resistancesAbove.length > 0 ? resistancesAbove[0] : null;

  // ── Build result ──
  return {
    nearestSupport,
    nearestResistance,
    supports: supportsBelow.slice(0, 5),
    resistances: resistancesAbove.slice(0, 5),
    ma: {
      sma20: round2(ind.sma20), sma50: round2(ind.sma50), sma100: round2(ind.sma100), sma200: round2(ind.sma200),
      ema20: round2(ind.ema20), ema50: round2(ind.ema50), ema100: round2(ind.ema100), ema200: round2(ind.ema200),
    },
    bb: {
      upper: round2(ind.bbUpper),
      lower: round2(ind.bbLower),
      width: ind.bbLower > 0 ? round2(((ind.bbUpper - ind.bbLower) / ind.bbLower) * 100) : 0,
    },
    pivotsClassic: {
      pp: round2(ind.pivotsClassic.pp),
      s1: round2(ind.pivotsClassic.s1), s2: round2(ind.pivotsClassic.s2), s3: round2(ind.pivotsClassic.s3),
      r1: round2(ind.pivotsClassic.r1), r2: round2(ind.pivotsClassic.r2), r3: round2(ind.pivotsClassic.r3),
    },
    pivotsFibonacci: {
      pp: round2(ind.pivotsFibonacci.pp),
      s1: round2(ind.pivotsFibonacci.s1), s2: round2(ind.pivotsFibonacci.s2), s3: round2(ind.pivotsFibonacci.s3),
      r1: round2(ind.pivotsFibonacci.r1), r2: round2(ind.pivotsFibonacci.r2), r3: round2(ind.pivotsFibonacci.r3),
    },
    pivotsCamarilla: {
      pp: round2(ind.pivotsCamarilla.pp),
      s1: round2(ind.pivotsCamarilla.s1), s2: round2(ind.pivotsCamarilla.s2), s3: round2(ind.pivotsCamarilla.s3),
      r1: round2(ind.pivotsCamarilla.r1), r2: round2(ind.pivotsCamarilla.r2), r3: round2(ind.pivotsCamarilla.r3),
    },
    pivotsWoodie: {
      pp: round2(ind.pivotsWoodie.pp),
      s1: round2(ind.pivotsWoodie.s1), s2: round2(ind.pivotsWoodie.s2), s3: round2(ind.pivotsWoodie.s3),
      r1: round2(ind.pivotsWoodie.r1), r2: round2(ind.pivotsWoodie.r2), r3: round2(ind.pivotsWoodie.r3),
    },
    week52High: round2(ind.week52High),
    week52Low: round2(ind.week52Low),
    rsi: round2(ind.rsi),
    stochK: round2(ind.stochK),
    stochD: round2(ind.stochD),
    macd: round2(ind.macd),
    macdSignal: round2(ind.macdSignal),
    macdHistogram: round2(ind.macd - ind.macdSignal),
    atr: round2(atr),
    rating: ind.recommendAll,
    ratingMA: ind.recommendMA,
    ratingOther: ind.recommendOther,
    currentPrice: round2(price),
    name: ind.symbol,
    signal: ratingToSignal(ind.recommendAll),
  };
}

// ── Cache (60s) ────────────────────────────────────────────────

const taCache = new Map<string, { data: Record<string, SupportResistance>; ts: number }>();
const TA_CACHE_TTL = 60_000;

// ── GET Handler ────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const symbolsParam = searchParams.get("symbols") || "";
    const fetchAll = searchParams.get("all") === "true";

    let symbols: string[] = [];

    if (fetchAll) {
      const { EGX_STOCKS } = await import("@/lib/egx-stocks");
      symbols = EGX_STOCKS.map(s => s.symbol);
    } else {
      symbols = symbolsParam
        .split(",")
        .map(s => s.trim().toUpperCase())
        .filter(Boolean);
    }

    if (symbols.length === 0) {
      return NextResponse.json({ error: "No symbols provided" }, { status: 400 });
    }

    // Check cache
    const cacheKey = [...symbols].sort().join(",");
    const now = Date.now();
    const cached = taCache.get(cacheKey);
    if (cached && now - cached.ts < TA_CACHE_TTL) {
      return NextResponse.json(cached.data, {
        headers: { "Cache-Control": "no-store" },
      });
    }

    // Fetch professional technical indicators from TradingView
    const indicators = await fetchTechnicalIndicators(symbols);

    // Analyze each stock
    const result: Record<string, SupportResistance> = {};
    for (const [sym, ind] of Object.entries(indicators)) {
      result[sym] = analyzeStock(ind);
    }

    // Update cache
    taCache.set(cacheKey, { data: result, ts: now });

    return NextResponse.json(result, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    console.error("Technical analysis error:", error);
    return NextResponse.json({ error: "Failed to fetch technical analysis" }, { status: 503 });
  }
}
