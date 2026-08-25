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
  // 30-day average volume (real data from TradingView)
  "average_volume_30d_calc",
  // Oscillators
  "RSI", "Stoch.K", "Stoch.D",
  "MACD.macd", "MACD.signal",
  // TradingView aggregated technical rating
  "Recommend.All", "Recommend.MA", "Recommend.Other",
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
const BATCH_SIZE = 50;
const FETCH_TIMEOUT = 8_000;

/**
 * Internal: Fetch symbols from TradingView scanner in staggered batches.
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

      // Fetch batches with 150ms stagger to avoid rate limiting
      const fetchSingleBatch = async (batch: string[]): Promise<Record<string, QuoteData>> => {
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
      };

      // Fetch batches in parallel (TradingView handles concurrent requests well)
      const batchResults: Record<string, QuoteData>[] = await Promise.all(
        batches.map(batch => fetchSingleBatch(batch))
      );

      // Merge results from all successful batches
      for (const res of batchResults) {
        Object.assign(result, res);
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

  // Fetch batches with 150ms stagger to avoid rate limiting
  const fetchSingleBatch = async (batch: string[]): Promise<Record<string, PerformanceData>> => {
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

    // Build column-index map for dynamic field extraction
    const colIdx: Record<string, number> = {};
    PERF_COLUMNS.forEach((col, i) => { colIdx[col] = i; });

    const batchResult: Record<string, PerformanceData> = {};
    for (const item of json.data) {
      const sym = fromTvTicker(item.s || "");
      const d = item.d || [];
      const get = (col: string) => toNum(d[colIdx[col]]);
      batchResult[sym] = {
        symbol: sym,
        name: sym === "XAUUSD" ? "Gold (USD)" : sym,
        currentPrice: get("close"),
        returns: {
          "1D": get("change"),
          "1W": get("Perf.W"),
          "1M": get("Perf.1M"),
          "3M": get("Perf.3M"),
          "6M": get("Perf.6M"),
          YTD: get("Perf.YTD"),
        },
      };
    }
    return batchResult;
  };

  // Fetch batches in parallel
  const batchResults: Record<string, PerformanceData>[] = await Promise.all(
    batches.map(batch => fetchSingleBatch(batch))
  );

  for (const res of batchResults) {
    Object.assign(result, res);
  }

  perfCache.set(key, { data: result, ts: now });
  return result;
}

// ── Technical Indicators Data (60s cache) ─────────────────────

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
  // 30-day average volume
  avgVolume30d: number;
}

const techCache = new Map<string, { data: Record<string, TechnicalIndicators>; ts: number }>();
const TECH_CACHE_TTL = 300_000; // 5 minutes — EGX data doesn't change intra-session

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

  // Build column-index map from TECH_COLUMNS for dynamic field extraction
  const colIdx: Record<string, number> = {};
  TECH_COLUMNS.forEach((col, i) => { colIdx[col] = i; });

  // Fetch batches with 150ms stagger to avoid rate limiting
  const fetchSingleBatch = async (batch: string[]): Promise<Record<string, TechnicalIndicators>> => {
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
      const get = (col: string) => toNum(d[colIdx[col]]);

      batchResult[sym] = {
        symbol: sym,
        close: get("close"),
        high: get("high"),
        low: get("low"),
        open: get("open"),
        volume: get("volume"),
        week52High: get("price_52_week_high"),
        week52Low: get("price_52_week_low"),
        sma20: get("SMA20"),
        sma50: get("SMA50"),
        sma100: get("SMA100"),
        sma200: get("SMA200"),
        ema20: get("EMA20"),
        ema50: get("EMA50"),
        ema100: get("EMA100"),
        ema200: get("EMA200"),
        bbUpper: get("BB.upper"),
        bbLower: get("BB.lower"),
        atr: get("ATR"),
        avgVolume30d: get("average_volume_30d_calc"),
        rsi: get("RSI"),
        stochK: get("Stoch.K"),
        stochD: get("Stoch.D"),
        macd: get("MACD.macd"),
        macdSignal: get("MACD.signal"),
        recommendAll: get("Recommend.All"),
        recommendMA: get("Recommend.MA"),
        recommendOther: get("Recommend.Other"),
      };
    }
    return batchResult;
  };

  // Fetch batches in parallel (TradingView handles concurrent requests well)
  const batchResults: Record<string, TechnicalIndicators>[] = await Promise.all(
    batches.map(batch => fetchSingleBatch(batch))
  );

  for (const res of batchResults) {
    Object.assign(result, res);
  }

  techCache.set(key, { data: result, ts: now });
  return result;
}

// ── Stock list is now in a separate file for maintainability ──
// Import from: import { EGX_STOCKS, EGX_STOCK_COUNT, findStock, searchStocks } from '@/lib/egx-stocks'
