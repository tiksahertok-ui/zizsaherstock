/**
 * EGX Multi-Source Data Validation & Cross-Referencing Layer
 * ──────────────────────────────────────────────────────────
 * Validates fundamental data quality, cross-references prices and
 * financial metrics across TradingView, Yahoo Finance, and Mubasher,
 * and computes confidence scores with stale-data detection.
 *
 * Designed for Vercel serverless (cold-start safe, timeout-bounded).
 */

import type { FundamentalData } from './fundamentals';

// ── Cache Layer ────────────────────────────────────────────────────

/** Validation result cache (crossValidateData) */
const validationCache = new Map<string, { data: ValidationResult; ts: number }>();
const VALIDATION_CACHE_TTL = 300_000; // 5 minutes

/** Yahoo Finance fetch cache */
const yahooCache = new Map<string, { data: Partial<FundamentalData>; ts: number }>();
const YAHOO_CACHE_TTL = 300_000; // 5 minutes

/** Mubasher fetch cache */
const mubasherCache = new Map<string, { data: { price: number; pe: number; marketCap: number; change: number }; ts: number }>();
const MUBASHER_CACHE_TTL = 300_000; // 5 minutes

// ── Constants ─────────────────────────────────────────────────────

const FETCH_TIMEOUT = 10_000;
const PRICE_TOLERANCE = 0.01; // 1%
const PE_TOLERANCE = 0.05; // 5%
const MAX_CONCURRENT = 10;

// ── Types ─────────────────────────────────────────────────────────

export interface ValidationResult {
  symbol: string;
  priceMatch: boolean;
  peMatch: boolean;
  overallScore: number; // 0-100
  warnings: string[];
  sources: Record<string, { price: number; pe: number; fetchedAt: string }>;
  recommendedPrice: number;
  recommendedPE: number;
}

// ── Utility Helpers ───────────────────────────────────────────────

function cacheKey(symbol: string, prefix: string): string {
  return `${prefix}:${symbol.toUpperCase()}`;
}

function isCacheValid(ts: number, ttl: number): boolean {
  return Date.now() - ts < ttl;
}

/** Calculate percentage difference between two values. */
function pctDiff(a: number, b: number): number {
  if (a === 0 && b === 0) return 0;
  if (a === 0 || b === 0) return 1; // 100% diff when one is zero
  return Math.abs(a - b) / Math.max(Math.abs(a), Math.abs(b));
}

/** Compute the median of a numeric array. Returns 0 for empty input. */
function median(values: number[]): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
}

function nowISO(): string {
  return new Date().toISOString();
}

// ══════════════════════════════════════════════════════════════════
// 1. EGP CURRENCY VALIDATOR
// ══════════════════════════════════════════════════════════════════

/**
 * Validate that a stock's fundamental data is denominated in Egyptian Pounds.
 *
 * - `f.currency` must be "EGP" (case-insensitive).
 * - Non-EGP currencies trigger warnings.
 * - Missing / empty currency also triggers a warning.
 */
export function validateEGPCurrency(
  f: FundamentalData
): { valid: boolean; currency: string; warnings: string[] } {
  const warnings: string[] = [];
  const currency = (f.currency || '').trim().toUpperCase();
  const valid = currency === 'EGP';

  if (!f.currency || f.currency.trim() === '') {
    warnings.push('Currency field is missing or empty — cannot verify denomination.');
  } else if (currency !== 'EGP') {
    warnings.push(
      `Currency is "${f.currency}" — expected EGP. ` +
      `Financial metrics may need conversion to Egyptian Pounds.`
    );
    // Specific well-known currencies get extra guidance
    if (currency === 'USD') {
      warnings.push(
        'USD-denominated data detected. Apply current USD/EGP exchange rate before analysis.'
      );
    }
  }

  return { valid, currency: f.currency || '', warnings };
}

// ══════════════════════════════════════════════════════════════════
// 2. YAHOO FINANCE DATA FETCHER
// ══════════════════════════════════════════════════════════════════

/**
 * Fetch supplementary fundamental data from Yahoo Finance for an EGX stock.
 *
 * Tries the chart endpoint first (`v8/finance/chart`), then falls back to
 * the quoteSummary endpoint (`v10/finance/quoteSummary`). Results are
 * cached for 5 minutes.
 *
 * @returns Partial `FundamentalData` on success, `null` on failure.
 */
export async function fetchYahooFinanceData(
  symbol: string
): Promise<Partial<FundamentalData> | null> {
  const key = cacheKey(symbol, 'yahoo');

  // Return cached result if fresh
  const cached = yahooCache.get(key);
  if (cached && isCacheValid(cached.ts, YAHOO_CACHE_TTL)) {
    return cached.data;
  }

  const ticker = `EGX.${symbol}.CA`;
  const result: Partial<FundamentalData> = {};

  // ── Attempt 1: Chart API ─────────────────────────────────────
  try {
    const chartUrl =
      `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}` +
      `?interval=1d&range=5d`;

    const resp = await fetch(chartUrl, {
      headers: { 'Accept': 'application/json' },
      signal: AbortSignal.timeout(FETCH_TIMEOUT),
    });

    if (resp.ok) {
      const json = await resp.json();
      const meta = json?.chart?.result?.[0]?.meta;

      if (meta) {
        if (typeof meta.regularMarketPrice === 'number') result.price = meta.regularMarketPrice;
        if (typeof meta.fiftyTwoWeekHigh === 'number') result.week52High = meta.fiftyTwoWeekHigh;
        if (typeof meta.fiftyTwoWeekLow === 'number') result.week52Low = meta.fiftyTwoWeekLow;
      }

      // Extract indicators for additional metrics
      const indicators = json?.chart?.result?.[0]?.indicators;
      if (indicators?.quote?.close?.[0]) {
        const closes = indicators.quote.close[0] as (number | null)[];
        const validCloses = closes.filter((c): c is number => c != null && isFinite(c));
        if (validCloses.length && !result.price) {
          result.price = validCloses[validCloses.length - 1];
        }
      }
    }
  } catch {
    // Silently swallow — will try fallback
  }

  // ── Attempt 2: Quote Summary API ────────────────────────────
  if (!result.price || !result.marketCap) {
    try {
      const summaryUrl =
        `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${ticker}` +
        `?modules=defaultKeyStatistics,financialData`;

      const resp = await fetch(summaryUrl, {
        headers: { 'Accept': 'application/json' },
        signal: AbortSignal.timeout(FETCH_TIMEOUT),
      });

      if (resp.ok) {
        const json = await resp.json();
        const quote = json?.quoteSummary?.result?.[0];

        if (quote) {
          const fin = quote.financialData ?? {};
          const stats = quote.defaultKeyStatistics ?? {};

          // Price
          const priceRaw = fin.currentPrice?.raw ?? fin.currentPrice?.fmt;
          if (typeof priceRaw === 'number' && priceRaw > 0 && !result.price) {
            result.price = priceRaw;
          }

          // Market cap
          const mcapRaw = stats.marketCap?.raw ?? stats.enterpriseValue?.raw;
          if (typeof mcapRaw === 'number' && mcapRaw > 0) {
            result.marketCap = mcapRaw;
          }

          // P/E ratio
          const peRaw = fin.trailingPE?.raw ?? stats.trailingPE?.raw;
          if (typeof peRaw === 'number' && peRaw > 0) {
            result.pe = peRaw;
          }

          // P/B ratio
          const pbRaw = stats.priceToBook?.raw;
          if (typeof pbRaw === 'number' && pbRaw > 0) {
            result.pb = pbRaw;
          }

          // EPS
          const epsRaw = stats.trailingEps?.raw ?? fin.trailingEps?.raw;
          if (typeof epsRaw === 'number') {
            result.eps = epsRaw;
          }

          // Dividend yield (Yahoo returns decimal, normalize to %)
          const divRaw = stats.dividendYield?.raw ?? stats.dividendYield?.fmt;
          if (typeof divRaw === 'number') {
            result.dividendYield = divRaw < 1 ? divRaw * 100 : divRaw;
          }

          // Beta
          const betaRaw = stats.beta?.raw;
          if (typeof betaRaw === 'number') {
            result.beta = betaRaw;
          }

          // 52-week high/low
          const high52 = stats['52WeekChange']?.raw;
          if (typeof stats.fiftyTwoWeekHigh?.raw === 'number' && !result.week52High) {
            result.week52High = stats.fiftyTwoWeekHigh.raw;
          }
          if (typeof stats.fiftyTwoWeekLow?.raw === 'number' && !result.week52Low) {
            result.week52Low = stats.fiftyTwoWeekLow.raw;
          }
        }
      }
    } catch {
      // Silently swallow
    }
  }

  // Cache even partial / empty results to avoid hammering the API
  yahooCache.set(key, { data: result, ts: Date.now() });

  // Return null if we got nothing useful
  return Object.keys(result).length > 0 ? result : null;
}

// ══════════════════════════════════════════════════════════════════
// 3. MUBASHER DATA FETCHER
// ══════════════════════════════════════════════════════════════════

/**
 * Fetch basic market data from Mubasher for an EGX stock.
 *
 * Scrapes the HTML page using multiple regex patterns to extract:
 * price, P/E ratio, market cap, and daily change%.
 *
 * Results are cached for 5 minutes.
 *
 * @returns `{ price, pe, marketCap, change }` on success, `null` on failure.
 */
export async function fetchMubasherData(
  symbol: string
): Promise<{ price: number; pe: number; marketCap: number; change: number } | null> {
  const key = cacheKey(symbol, 'mubasher');

  // Return cached result if fresh
  const cached = mubasherCache.get(key);
  if (cached && isCacheValid(cached.ts, MUBASHER_CACHE_TTL)) {
    return cached.data;
  }

  let html = '';
  try {
    const url = `https://www.mubasher.net/eg/stocks/${encodeURIComponent(symbol)}`;
    const resp = await fetch(url, {
      headers: {
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'en-US,en;q=0.9',
        'User-Agent': 'Mozilla/5.0 (compatible; EGX-Validator/1.0)',
      },
      signal: AbortSignal.timeout(FETCH_TIMEOUT),
    });

    if (!resp.ok) {
      mubasherCache.set(key, { data: { price: 0, pe: 0, marketCap: 0, change: 0 }, ts: Date.now() });
      return null;
    }

    html = await resp.text();
  } catch {
    mubasherCache.set(key, { data: { price: 0, pe: 0, marketCap: 0, change: 0 }, ts: Date.now() });
    return null;
  }

  // ── Parsing helpers ──────────────────────────────────────────

  function extractNumber(pattern: RegExp): number {
    const match = html.match(pattern);
    if (!match?.[1]) return 0;
    const raw = match[1].replace(/,/g, '').trim();
    const num = parseFloat(raw);
    return isFinite(num) ? num : 0;
  }

  function extractNumberB(pattern: RegExp): number {
    const match = html.match(pattern);
    if (!match?.[1]) return 0;
    const raw = match[1].replace(/,/g, '').trim();
    const num = parseFloat(raw);
    return isFinite(num) ? num : 0;
  }

  // ── Price extraction (multiple patterns) ──────────────────────

  // Pattern A: JSON-LD structured data (most reliable)
  const pricePatterns = [
    // JSON-LD / structured data embedded in page
    /"price"\s*:\s*"?([0-9.,]+)"?/,
    // data-price attribute
    /data-[a-z-]*price["']?\s*[:=]\s*["']?([0-9.,]+)/i,
    // Meta og:price or price tag
    /["']price["']\s*[>:]\s*["']?([0-9.,]+)/i,
    // Common price display pattern
    /class="[^"]*(?:price|last|value)[^"]*"[^>]*>([0-9.,]+)/i,
    // Inline JSON with price field
    /"last_price"\s*:\s*"?([0-9.,]+)"?/i,
    /"close"\s*:\s*"?([0-9.,]+)"?/i,
  ];

  let price = 0;
  for (const pat of pricePatterns) {
    price = extractNumber(pat);
    if (price > 0) break;
  }

  // ── P/E ratio extraction ──────────────────────────────────────

  const pePatterns = [
    /"pe_ratio"\s*:\s*"?([0-9.,\-]+)"?/i,
    /"P\/E"\s*:\s*"?([0-9.,\-]+)"?/i,
    /(?:P\/E\s*ratio|PE)\s*[:\s]+([0-9.,\-]+)/i,
    /data-[a-z-]*pe["']?\s*[:=]\s*["']?([0-9.,\-]+)/i,
    /class="[^"]*(?:pe|price-earning)[^"]*"[^>]*>([0-9.,\-]+)/i,
  ];

  let pe = 0;
  for (const pat of pePatterns) {
    pe = extractNumberB(pat);
    if (pe > 0) break;
  }

  // ── Market cap extraction ─────────────────────────────────────

  const mcapPatterns = [
    /"market_cap"\s*:\s*"?([0-9.,]+)"?/i,
    /"Market Cap[^"]*"\s*:\s*"?([0-9.,]+)"?/i,
    /(?:market\s*cap|market\s*value)\s*[:\s]*\s*([0-9.,]+)/i,
    /data-[a-z-]*mcap["']?\s*[:=]\s*["']?([0-9.,]+)/i,
  ];

  let marketCap = 0;
  for (const pat of mcapPatterns) {
    marketCap = extractNumber(pat);
    if (marketCap > 0) break;
  }

  // ── Change % extraction ───────────────────────────────────────

  const changePatterns = [
    /"change_pct"\s*:\s*"?([0-9.\-]+)"?/i,
    /"change"\s*:\s*"?([0-9.\-]+)"?/i,
    /data-[a-z-]*change["']?\s*[:=]\s*["']?([0-9.\-]+)/i,
    /class="[^"]*(?:change|chg|diff)[^"]*"[^>]*>([0-9.\-]+)/i,
  ];

  let change = 0;
  for (const pat of changePatterns) {
    change = extractNumber(pat);
    if (change !== 0) break;
  }

  const data = { price, pe, marketCap, change };

  // Cache the result
  mubasherCache.set(key, { data, ts: Date.now() });

  // Return null if nothing useful was extracted
  return price > 0 || pe > 0 ? data : null;
}

// ══════════════════════════════════════════════════════════════════
// 4. DATA CROSS-VALIDATOR
// ══════════════════════════════════════════════════════════════════

/**
 * Cross-validate fundamental data across multiple sources.
 *
 * Sources used:
 *   1. TradingView (passed as `tvData`)
 *   2. Yahoo Finance (fetched)
 *   3. Mubasher (fetched)
 *
 * Algorithm:
 *   - Fetches secondary sources in parallel.
 *   - Compares price (1% tolerance) and P/E (5% tolerance).
 *   - Computes an overall confidence score (0-100).
 *   - If sources disagree significantly, recommends the median value.
 *   - Results are cached for 5 minutes per symbol.
 */
export async function crossValidateData(
  symbol: string,
  tvData: FundamentalData
): Promise<ValidationResult> {
  const normalized = symbol.toUpperCase();
  const key = cacheKey(normalized, 'validation');

  // Return cached validation if fresh
  const cached = validationCache.get(key);
  if (cached && isCacheValid(cached.ts, VALIDATION_CACHE_TTL)) {
    return cached.data;
  }

  const warnings: string[] = [];
  const sources: ValidationResult['sources'] = {};
  const ts = nowISO();

  // ── TradingView source ───────────────────────────────────────
  sources['tradingview'] = {
    price: tvData.price,
    pe: tvData.pe,
    fetchedAt: ts,
  };

  // ── Fetch secondary sources in parallel ───────────────────────
  const [yahooData, mubasherData] = await Promise.all([
    fetchYahooFinanceData(normalized),
    fetchMubasherData(normalized),
  ]);

  // ── Yahoo source ──────────────────────────────────────────────
  if (yahooData) {
    sources['yahoo'] = {
      price: yahooData.price ?? 0,
      pe: yahooData.pe ?? 0,
      fetchedAt: ts,
    };
  } else {
    warnings.push('Yahoo Finance data unavailable — could not cross-reference.');
  }

  // ── Mubasher source ──────────────────────────────────────────
  if (mubasherData) {
    sources['mubasher'] = {
      price: mubasherData.price,
      pe: mubasherData.pe,
      fetchedAt: ts,
    };
  } else {
    warnings.push('Mubasher data unavailable — could not cross-reference.');
  }

  // ── Price comparison ─────────────────────────────────────────
  const tvPrice = tvData.price;
  const yahooPrice = yahooData?.price ?? 0;
  const mubasherPrice = mubasherData?.price ?? 0;

  // All prices that are actually available (> 0)
  const availablePrices: number[] = [];
  if (tvPrice > 0) availablePrices.push(tvPrice);
  if (yahooPrice > 0) availablePrices.push(yahooPrice);
  if (mubasherPrice > 0) availablePrices.push(mubasherPrice);

  let priceMatch = true;
  if (availablePrices.length >= 2) {
    // Check all pairwise combinations
    for (let i = 0; i < availablePrices.length; i++) {
      for (let j = i + 1; j < availablePrices.length; j++) {
        const diff = pctDiff(availablePrices[i], availablePrices[j]);
        if (diff > PRICE_TOLERANCE) {
          priceMatch = false;
          warnings.push(
            `Price discrepancy: ${availablePrices[i].toFixed(2)} vs ${availablePrices[j].toFixed(2)} ` +
            `(${(diff * 100).toFixed(1)}% difference exceeds 1% threshold).`
          );
        }
      }
    }
  } else if (availablePrices.length === 0) {
    warnings.push('No price data available from any source.');
    priceMatch = false;
  }

  // ── P/E comparison ────────────────────────────────────────────
  const tvPE = tvData.pe;
  const yahooPE = yahooData?.pe ?? 0;
  const mubasherPE = mubasherData?.pe ?? 0;

  const availablePEs: number[] = [];
  if (tvPE > 0) availablePEs.push(tvPE);
  if (yahooPE > 0) availablePEs.push(yahooPE);
  if (mubasherPE > 0) availablePEs.push(mubasherPE);

  let peMatch = true;
  if (availablePEs.length >= 2) {
    for (let i = 0; i < availablePEs.length; i++) {
      for (let j = i + 1; j < availablePEs.length; j++) {
        const diff = pctDiff(availablePEs[i], availablePEs[j]);
        if (diff > PE_TOLERANCE) {
          peMatch = false;
          warnings.push(
            `P/E discrepancy: ${availablePEs[i].toFixed(2)} vs ${availablePEs[j].toFixed(2)} ` +
            `(${(diff * 100).toFixed(1)}% difference exceeds 5% threshold).`
          );
        }
      }
    }
  } else if (availablePEs.length === 0) {
    // P/E being zero is common for loss-making companies; don't warn loudly
  }

  // ── Recommended values ────────────────────────────────────────
  // If there's disagreement, use the median across all sources.
  // If there's agreement (or only one source), use the TradingView value.
  let recommendedPrice: number;
  let recommendedPE: number;

  if (!priceMatch && availablePrices.length >= 3) {
    recommendedPrice = median(availablePrices);
    warnings.push(
      `Using median price (${recommendedPrice.toFixed(2)}) from ${availablePrices.length} sources.`
    );
  } else {
    recommendedPrice = tvPrice > 0 ? tvPrice : (availablePrices[0] ?? 0);
  }

  if (!peMatch && availablePEs.length >= 3) {
    recommendedPE = median(availablePEs);
    warnings.push(
      `Using median P/E (${recommendedPE.toFixed(2)}) from ${availablePEs.length} sources.`
    );
  } else {
    recommendedPE = tvPE > 0 ? tvPE : (availablePEs[0] ?? 0);
  }

  // ── Overall score ────────────────────────────────────────────
  // Scoring:
  //   - Base: 40 points for having TradingView data with price > 0
  //   - +15 each for Yahoo and Mubasher responding (up to 30)
  //   - +10 for price match (if 2+ sources)
  //   - +10 for P/E match (if 2+ sources)
  //   - -10 for each discrepancy warning beyond the first
  //   - Capped at 100
  let score = 0;

  // Base: TradingView data quality
  if (tvPrice > 0) score += 40;

  // Secondary sources responding
  if (yahooData && yahooPrice > 0) score += 15;
  if (mubasherData && mubasherPrice > 0) score += 15;

  // Agreement bonuses
  if (availablePrices.length >= 2 && priceMatch) score += 10;
  if (availablePEs.length >= 2 && peMatch) score += 10;

  // Penalties for discrepancies
  const discrepancyCount = warnings.filter(
    (w) => w.includes('discrepancy')
  ).length;
  score -= Math.max(0, (discrepancyCount - 1)) * 10;

  // Unavailability penalties
  if (!yahooData) score -= 5;
  if (!mubasherData) score -= 5;

  const overallScore = Math.max(0, Math.min(100, score));

  // ── Build result ──────────────────────────────────────────────
  const result: ValidationResult = {
    symbol: normalized,
    priceMatch,
    peMatch,
    overallScore,
    warnings,
    sources,
    recommendedPrice,
    recommendedPE,
  };

  // Cache it
  validationCache.set(key, { data: result, ts: Date.now() });

  return result;
}

// ══════════════════════════════════════════════════════════════════
// 5. BATCH VALIDATION
// ══════════════════════════════════════════════════════════════════

/**
 * Cross-validate fundamental data for multiple stocks in batch.
 *
 * - Processes up to `MAX_CONCURRENT` (10) stocks simultaneously to avoid
 *   rate-limiting external APIs.
 * - Returns a map of symbol → ValidationResult.
 */
export async function validateBatchData(
  fundamentals: Record<string, FundamentalData>
): Promise<Record<string, ValidationResult>> {
  const entries = Object.entries(fundamentals);

  if (!entries.length) return {};

  const results: Record<string, ValidationResult> = {};

  // Process in chunks to limit concurrency
  for (let i = 0; i < entries.length; i += MAX_CONCURRENT) {
    const chunk = entries.slice(i, i + MAX_CONCURRENT);

    const chunkResults = await Promise.allSettled(
      chunk.map(async ([symbol, data]) => {
        const validation = await crossValidateData(symbol, data);
        return { symbol: symbol.toUpperCase(), validation } as const;
      })
    );

    for (const res of chunkResults) {
      if (res.status === 'fulfilled') {
        results[res.value.symbol] = res.value.validation;
      }
      // Silently skip failed validations
    }
  }

  return results;
}

// ══════════════════════════════════════════════════════════════════
// 6. DATA FRESHNESS CHECKER
// ══════════════════════════════════════════════════════════════════

/**
 * Check whether fundamental data appears fresh or stale.
 *
 * A stock is flagged as stale when critical fields (price, P/E, revenue)
 * are zero — this typically indicates missing or outdated data from
 * the source provider.
 *
 * @returns `isStale` flag, human-readable `age`, and any warnings.
 */
export function checkDataFreshness(
  f: FundamentalData
): { age: string; isStale: boolean; warnings: string[] } {
  const warnings: string[] = [];
  let staleFieldCount = 0;

  // Price = 0 → very likely no trading data available
  if (f.price === 0) {
    staleFieldCount++;
    warnings.push('Price is zero — data may be stale or the stock is not actively trading.');
  }

  // P/E = 0 → could be loss-making, but still flag for awareness
  if (f.pe === 0 && f.eps !== 0) {
    // EPS exists but P/E is 0 → definitely a data gap
    staleFieldCount++;
    warnings.push('P/E is zero despite non-zero EPS — valuation data may be incomplete.');
  } else if (f.pe === 0 && f.price > 0) {
    // Price exists but no P/E → likely no earnings data
    warnings.push(
      'P/E ratio is zero — the company may be loss-making or earnings data is unavailable.'
    );
  }

  // Revenue = 0 with positive price → likely missing financials
  if (f.revenue === 0 && f.price > 0) {
    staleFieldCount++;
    warnings.push('Revenue is zero — financial statement data may be missing or outdated.');
  }

  // Market cap = 0 with positive price → shares outstanding missing
  if (f.marketCap === 0 && f.price > 0) {
    warnings.push('Market cap is zero — shares outstanding data may be unavailable.');
  }

  // Volume = 0 with positive price → possible data staleness
  if (f.volume === 0 && f.price > 0) {
    warnings.push('Volume is zero — trading data may not have updated for this session.');
  }

  // Check data quality flags from the source
  if (f.hasData === false) {
    staleFieldCount++;
    warnings.push('Source data quality flag indicates no fundamental data available.');
  }

  // Determine staleness description
  const isStale = staleFieldCount >= 2;

  let age: string;
  if (isStale) {
    age = 'stale';
  } else if (staleFieldCount === 1) {
    age = 'partially stale';
  } else if (warnings.length > 0) {
    age = 'fresh with gaps';
  } else {
    age = 'fresh';
  }

  return { age, isStale, warnings };
}
