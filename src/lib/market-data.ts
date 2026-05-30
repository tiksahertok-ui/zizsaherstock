/**
 * Unified TradingView market data fetcher with dual-cache architecture.
 *
 * ┌─────────────────────────────────────────────────────────────┐
 * │  fetchQuotesLive(symbols)  → 1s shared cache (real-time)    │
 * │  fetchQuotesFull(symbols)  → 60s cache (detailed stock list)│
 * │  fetchPerformance(symbols) → 60s cache (period returns)     │
 * └─────────────────────────────────────────────────────────────┘
 *
 * All functions share the same live cache, so if holdings endpoint
 * fetches COMI at t=0, the live endpoint reuses it at t=0.8.
 * In-flight dedup: if multiple callers request the same symbol at once,
 * only ONE TradingView request is made and all callers share the result.
 */

const SCANNER_URL = "https://scanner.tradingview.com/global/scan";

// ── Symbol ↔ TradingView Ticker Mapping ────────────────────────

const TV_SYMBOL_MAP: Record<string, string> = {
  "XAUUSD": "OANDA:XAUUSD",
  "USDEGP": "FX_IDC:USDEGP",
};

// Reverse map: TV ticker → internal symbol
const TV_TO_INTERNAL: Record<string, string> = {};
for (const [sym, tv] of Object.entries(TV_SYMBOL_MAP)) {
  TV_TO_INTERNAL[tv.toUpperCase()] = sym;
  TV_TO_INTERNAL[tv.toLowerCase()] = sym;
}

export function toTvTicker(symbol: string): string {
  const upper = symbol.toUpperCase();
  if (TV_SYMBOL_MAP[upper]) return TV_SYMBOL_MAP[upper];
  // Special index mappings
  if (upper === "EGX30") return "EGX:EGX30";
  if (upper === "EGX70_EWI") return "EGX:EGX70EWI";
  if (upper === "EGX100_EWI") return "EGX:EGX100EWI";
  return `EGX:${upper}`;
}

export function fromTvTicker(tvTicker: string): string {
  const upper = tvTicker.toUpperCase();
  // Check direct mapping first
  if (TV_TO_INTERNAL[upper]) return TV_TO_INTERNAL[upper];
  // Extract EGX symbol
  if (upper.startsWith("EGX:")) {
    const sym = upper.replace("EGX:", "");
    if (sym === "EGX70EWI") return "EGX70_EWI";
    if (sym === "EGX100EWI") return "EGX100_EWI";
    return sym;
  }
  return upper;
}

// ── Utility ────────────────────────────────────────────────────

function toNum(v: number | string | null | undefined): number {
  if (v == null) return 0;
  const x = typeof v === "string" ? parseFloat(v.replace(/,/g, "")) : v;
  return isFinite(x) ? x : 0;
}

// ── Types ──────────────────────────────────────────────────────

export interface QuoteData {
  symbol: string;
  close: number;
  open: number;
  high: number;
  low: number;
  volume: number;
  changePercent: number;
  changeAbs: number;
  name: string;
  description: string;
  marketCap: number;
  currency: string;
  prevClose: number;
  week52High: number;
  week52Low: number;
}

// ── Columns ────────────────────────────────────────────────────

const FAST_COLUMNS = ["close", "open", "change", "change_abs", "volume"];

const FULL_COLUMNS = [
  "close", "open", "high", "low", "volume",
  "change", "change_abs",
  "name", "description",
  "market_cap_basic", "currency",
  "Prev Close", "52_week_high", "52_week_low",
];

const PERF_COLUMNS = [
  "change",   // 1D
  "Perf.W",   // 1W
  "Perf.1M",  // 1M
  "Perf.3M",  // 3M
  "Perf.6M",  // 6M
  "Perf.YTD", // YTD
  "close",
];

// TradingView technical indicator columns (used by professional analysts)
const TECH_COLUMNS = [
  "close", "high", "low", "open", "volume",
  // 52-week range (price_52_week_* works for EGX stocks unlike 52_week_*)
  "price_52_week_high", "price_52_week_low",
  // Moving Averages — most widely used S/R by institutional analysts
  "SMA20", "SMA50", "SMA100", "SMA200",
  "EMA20", "EMA50", "EMA100", "EMA200",
  // Volatility-based dynamic S/R
  "BB.upper", "BB.lower", "ATR",
  // Oscillators
  "RSI", "Stoch.K", "Stoch.D",
  "MACD.macd", "MACD.signal",
  // TradingView aggregated technical rating
  "Recommend.All", "Recommend.MA", "Recommend.Other",
  // Pivot Points — Classic, Fibonacci, Camarilla, Woodie
  "Pivot.M.Classic.Middle", "Pivot.M.Classic.S1", "Pivot.M.Classic.S2", "Pivot.M.Classic.S3",
  "Pivot.M.Classic.R1", "Pivot.M.Classic.R2", "Pivot.M.Classic.R3",
  "Pivot.M.Fibonacci.Middle", "Pivot.M.Fibonacci.S1", "Pivot.M.Fibonacci.S2", "Pivot.M.Fibonacci.S3",
  "Pivot.M.Fibonacci.R1", "Pivot.M.Fibonacci.R2", "Pivot.M.Fibonacci.R3",
  "Pivot.M.Camarilla.Middle", "Pivot.M.Camarilla.S1", "Pivot.M.Camarilla.S2", "Pivot.M.Camarilla.S3",
  "Pivot.M.Camarilla.R1", "Pivot.M.Camarilla.R2", "Pivot.M.Camarilla.R3",
  "Pivot.M.Woodie.Middle", "Pivot.M.Woodie.S1", "Pivot.M.Woodie.S2", "Pivot.M.Woodie.S3",
  "Pivot.M.Woodie.R1", "Pivot.M.Woodie.R2", "Pivot.M.Woodie.R3",
];

// ── SHARED LIVE CACHE (5s TTL) ─────────────────────────────────
// Per-symbol cache: symbol → { quoteData, ts }
const liveCache = new Map<string, { data: QuoteData; ts: number }>();
const LIVE_CACHE_TTL = 5_000; // 5 seconds
const GOLD_CACHE_TTL = 1_500; // 1.5 seconds for gold (fast-moving commodity)
const GOLD_SYMBOLS = new Set(['XAUUSD']);

// ── In-flight deduplication ───────────────────────────────────
// Prevents duplicate TradingView requests when multiple callers
// request the same symbols concurrently (e.g., at 1s polling)
const inflightMap = new Map<string, Promise<Record<string, QuoteData>>>();

// ── FULL CACHE (60s TTL, for stock list details) ───────────────
const fullCache = new Map<string, { data: Record<string, QuoteData>; ts: number }>();
const FULL_CACHE_TTL = 60_000; // 60 seconds

// ── Batch settings ─────────────────────────────────────────────
const BATCH_SIZE = 20;
const FETCH_TIMEOUT = 8_000;

/**
 * Internal: Fetch symbols from TradingView scanner in parallel batches.
 * Uses in-flight deduplication to prevent duplicate concurrent requests.
 */
async function fetchFromTV(
  symbols: string[],
  columns: string[]
): Promise<Record<string, QuoteData>> {
  if (!symbols.length) return {};

  // Dedup key: sorted symbols + columns hash
  const dedupKey = [...symbols].sort().join(",") + "|" + columns.join(",");

  // If same request is already in-flight, return the same promise
  const existing = inflightMap.get(dedupKey);
  if (existing) return existing;

  const promise = (async () => {
    try {
      const result: Record<string, QuoteData> = {};

      // Split into batches of BATCH_SIZE
      const batches: string[][] = [];
      for (let i = 0; i < symbols.length; i += BATCH_SIZE) {
        batches.push(symbols.slice(i, i + BATCH_SIZE));
      }

      // Fetch ALL batches in parallel (no delay between batches)
      const responses = await Promise.allSettled(
        batches.map(async (batch) => {
          const tickers = batch.map(toTvTicker);
          const resp = await fetch(SCANNER_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              symbols: { tickers },
              columns,
            }),
            cache: "no-store",
            signal: AbortSignal.timeout(FETCH_TIMEOUT),
          });

          if (!resp.ok) return {};
          const json = (await resp.json()) as {
            data?: Array<{ s: string; d: Array<number | string | null> }>;
          };
          if (!json.data) return {};

          // Build column-index map for dynamic field extraction
          const colIdx: Record<string, number> = {};
          columns.forEach((col, i) => { colIdx[col] = i; });

          const batchResult: Record<string, QuoteData> = {};
          for (const item of json.data) {
            const sym = fromTvTicker(item.s || "");
            const d = item.d || [];
            const get = (col: string) => toNum(d[colIdx[col]]);
            const getStr = (col: string, fallback: string) =>
              d[colIdx[col]] != null ? String(d[colIdx[col]]) : fallback;
            batchResult[sym] = {
              symbol: sym,
              close: get("close"),
              open: get("open"),
              high: get("high"),
              low: get("low"),
              volume: get("volume"),
              changePercent: get("change"),
              changeAbs: get("change_abs"),
              name: getStr("name", sym),
              description: getStr("description", ""),
              marketCap: get("market_cap_basic"),
              currency: getStr("currency", "EGP"),
              prevClose: get("Prev Close"),
              week52High: get("52_week_high"),
              week52Low: get("52_week_low"),
            };
          }
          return batchResult;
        })
      );

      // Merge results from all successful batches
      for (const res of responses) {
        if (res.status === "fulfilled") {
          Object.assign(result, res.value);
        }
      }

      return result;
    } finally {
      inflightMap.delete(dedupKey);
    }
  })();

  inflightMap.set(dedupKey, promise);
  return promise;
}

/**
 * fetchQuotesLive — Real-time quotes with 1s shared cache.
 * Used by: /api/holdings, /api/portfolio/summary, /api/market-data/live
 *
 * Every API endpoint shares this cache, so if one endpoint fetches COMI,
 * all other endpoints get COMI from cache for the next 1s.
 */
export async function fetchQuotesLive(
  symbols: string[]
): Promise<Record<string, QuoteData>> {
  if (!symbols.length) return {};
  const now = Date.now();
  const normalizedSymbols = symbols.map((s) => s.toUpperCase().trim());
  const uniqueSymbols = [...new Set(normalizedSymbols)];

  // Check cache for each symbol (gold gets shorter TTL)
  const cachedResult: Record<string, QuoteData> = {};
  const missingSymbols: string[] = [];

  for (const s of uniqueSymbols) {
    const cached = liveCache.get(s);
    const ttl = GOLD_SYMBOLS.has(s) ? GOLD_CACHE_TTL : LIVE_CACHE_TTL;
    if (cached && now - cached.ts < ttl) {
      cachedResult[s] = cached.data;
    } else {
      missingSymbols.push(s);
    }
  }

  // All symbols found in cache — return immediately
  if (missingSymbols.length === 0) return cachedResult;

  // Fetch missing symbols from TradingView
  const freshData = await fetchFromTV(missingSymbols, FAST_COLUMNS);
  const fetchTime = Date.now();

  // Update live cache for fetched symbols
  for (const [sym, data] of Object.entries(freshData)) {
    liveCache.set(sym, { data, ts: fetchTime });
  }

  // Merge: cached + fresh
  return { ...cachedResult, ...freshData };
}

/**
 * fetchQuotesFull — Detailed quotes with 60s cache.
 * Used by: /api/market-data/stocks (full stock list for search)
 *
 * Includes name, 52w high/low, prev close, description, etc.
 */
export async function fetchQuotesFull(
  symbols: string[]
): Promise<Record<string, QuoteData>> {
  if (!symbols.length) return {};
  const sorted = [...symbols].map((s) => s.toUpperCase().trim()).sort();
  const key = sorted.join(",");
  const now = Date.now();

  const cached = fullCache.get(key);
  if (cached && now - cached.ts < FULL_CACHE_TTL) return cached.data;

  const result = await fetchFromTV(sorted, FULL_COLUMNS);

  fullCache.set(key, { data: result, ts: now });

  // Also update live cache with fresh prices
  for (const [sym, data] of Object.entries(result)) {
    liveCache.set(sym, { data, ts: now });
  }

  return result;
}

/**
 * Legacy alias — delegates to fetchQuotesLive (1s cache).
 */
export async function fetchQuotes(
  symbols: string[]
): Promise<Record<string, QuoteData>> {
  return fetchQuotesLive(symbols);
}

// ── Performance Data (60s cache) ───────────────────────────────

export const PERF_PERIODS = ["1D", "1W", "1M", "3M", "6M", "YTD"] as const;
export type PerfPeriod = (typeof PERF_PERIODS)[number];

export interface PerformanceData {
  symbol: string;
  name: string;
  currentPrice: number;
  returns: Record<PerfPeriod, number>;
}

const perfCache = new Map<string, { data: Record<string, PerformanceData>; ts: number }>();
const PERF_CACHE_TTL = 60_000;

/**
 * Fetch real period performance for a list of symbols.
 * Supports EGX stocks, indices, and Gold.
 */
export async function fetchPerformance(
  symbols: string[]
): Promise<Record<string, PerformanceData>> {
  if (!symbols.length) return {};
  const sorted = [...symbols].map((s) => s.toUpperCase().trim()).sort();
  const key = sorted.join(",");
  const now = Date.now();

  const cached = perfCache.get(key);
  if (cached && now - cached.ts < PERF_CACHE_TTL) return cached.data;

  const result: Record<string, PerformanceData> = {};

  // Split into batches
  const batches: string[][] = [];
  for (let i = 0; i < sorted.length; i += BATCH_SIZE) {
    batches.push(sorted.slice(i, i + BATCH_SIZE));
  }

  const responses = await Promise.allSettled(
    batches.map(async (batch) => {
      const tickers = batch.map(toTvTicker);
      const resp = await fetch(SCANNER_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          symbols: { tickers },
          columns: PERF_COLUMNS,
        }),
        cache: "no-store",
        signal: AbortSignal.timeout(FETCH_TIMEOUT),
      });

      if (!resp.ok) return {};
      const json = (await resp.json()) as {
        data?: Array<{ s: string; d: Array<number | string | null> }>;
      };
      if (!json.data) return {};

      const batchResult: Record<string, PerformanceData> = {};
      for (const item of json.data) {
        const sym = fromTvTicker(item.s || "");
        const d = item.d || [];
        batchResult[sym] = {
          symbol: sym,
          name: sym === "XAUUSD" ? "Gold (USD)" : sym,
          currentPrice: toNum(d[6]),
          returns: {
            "1D": toNum(d[0]),
            "1W": toNum(d[1]),
            "1M": toNum(d[2]),
            "3M": toNum(d[3]),
            "6M": toNum(d[4]),
            YTD: toNum(d[5]),
          },
        };
      }
      return batchResult;
    })
  );

  for (const res of responses) {
    if (res.status === "fulfilled") {
      Object.assign(result, res.value);
    }
  }

  perfCache.set(key, { data: result, ts: now });
  return result;
}

// ── Technical Indicators Data (60s cache) ─────────────────────

interface PivotSet {
  pp: number; s1: number; s2: number; s3: number;
  r1: number; r2: number; r3: number;
}

export interface TechnicalIndicators {
  symbol: string;
  close: number;
  high: number;
  low: number;
  open: number;
  volume: number;
  week52High: number;
  week52Low: number;
  // Moving Averages
  sma20: number;
  sma50: number;
  sma100: number;
  sma200: number;
  ema20: number;
  ema50: number;
  ema100: number;
  ema200: number;
  // Bollinger Bands & ATR
  bbUpper: number;
  bbLower: number;
  atr: number;
  // Oscillators
  rsi: number;
  stochK: number;
  stochD: number;
  macd: number;
  macdSignal: number;
  // Technical Ratings (TradingView aggregated: -2=Strong Sell ... +2=Strong Buy)
  recommendAll: number;
  recommendMA: number;
  recommendOther: number;
  // Pivot Points — TradingView built-in calculations
  pivotsClassic: PivotSet;
  pivotsFibonacci: PivotSet;
  pivotsCamarilla: PivotSet;
  pivotsWoodie: PivotSet;
}

const techCache = new Map<string, { data: Record<string, TechnicalIndicators>; ts: number }>();
const TECH_CACHE_TTL = 60_000; // 60 seconds

/**
 * Fetch professional technical indicators from TradingView scanner.
 * Includes MAs, Bollinger Bands, RSI, MACD, Stochastic, ATR, and TradingView's
 * aggregated technical rating (the same used by TradingView's built-in analysis).
 *
 * These are the exact indicators used by professional analysts worldwide.
 */
export async function fetchTechnicalIndicators(
  symbols: string[]
): Promise<Record<string, TechnicalIndicators>> {
  if (!symbols.length) return {};
  const sorted = [...symbols].map((s) => s.toUpperCase().trim()).sort();
  const key = sorted.join(",");
  const now = Date.now();

  const cached = techCache.get(key);
  if (cached && now - cached.ts < TECH_CACHE_TTL) return cached.data;

  const result: Record<string, TechnicalIndicators> = {};

  // Split into batches
  const batches: string[][] = [];
  for (let i = 0; i < sorted.length; i += BATCH_SIZE) {
    batches.push(sorted.slice(i, i + BATCH_SIZE));
  }

  const responses = await Promise.allSettled(
    batches.map(async (batch) => {
      const tickers = batch.map(toTvTicker);
      const resp = await fetch(SCANNER_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          symbols: { tickers },
          columns: TECH_COLUMNS,
        }),
        cache: "no-store",
        signal: AbortSignal.timeout(FETCH_TIMEOUT),
      });

      if (!resp.ok) return {};
      const json = (await resp.json()) as {
        data?: Array<{ s: string; d: Array<number | string | null> }>
      };
      if (!json.data) return {};

      const batchResult: Record<string, TechnicalIndicators> = {};
      for (const item of json.data) {
        const sym = fromTvTicker(item.s || "");
        const d = item.d || [];
        const g = (i: number) => toNum(d[i]);

        batchResult[sym] = {
          symbol: sym,
          close: g(0),
          high: g(1),
          low: g(2),
          open: g(3),
          volume: g(4),
          week52High: g(5),
          week52Low: g(6),
          sma20: g(7),
          sma50: g(8),
          sma100: g(9),
          sma200: g(10),
          ema20: g(11),
          ema50: g(12),
          ema100: g(13),
          ema200: g(14),
          bbUpper: g(15),
          bbLower: g(16),
          atr: g(17),
          rsi: g(18),
          stochK: g(19),
          stochD: g(20),
          macd: g(21),
          macdSignal: g(22),
          recommendAll: g(23),
          recommendMA: g(24),
          recommendOther: g(25),
          // Pivot Points from TradingView (indices 26-49)
          pivotsClassic: { pp: g(26), s1: g(27), s2: g(28), s3: g(29), r1: g(30), r2: g(31), r3: g(32) },
          pivotsFibonacci: { pp: g(33), s1: g(34), s2: g(35), s3: g(36), r1: g(37), r2: g(38), r3: g(39) },
          pivotsCamarilla: { pp: g(40), s1: g(41), s2: g(42), s3: g(43), r1: g(44), r2: g(45), r3: g(46) },
          pivotsWoodie: { pp: g(47), s1: g(48), s2: g(49), s3: g(50), r1: g(51), r2: g(52), r3: g(53) },
        };
      }
      return batchResult;
    })
  );

  for (const res of responses) {
    if (res.status === "fulfilled") {
      Object.assign(result, res.value);
    }
  }

  techCache.set(key, { data: result, ts: now });
  return result;
}

// ── Stock list is now in a separate file for maintainability ──
// Import from: import { EGX_STOCKS, EGX_STOCK_COUNT, findStock, searchStocks } from '@/lib/egx-stocks'
