/**
 * EGX Fundamental Data Fetcher
 * ─────────────────────────────────
 * Fetches real fundamental/financial data for Egyptian stocks
 * from TradingView Scanner API with caching.
 *
 * Data includes: P/E, P/B, EV/EBITDA, EPS, Revenue, Net Income,
 * Margins, ROE, ROA, Debt ratios, Dividends, Cash flow, etc.
 *
 * Enhanced with EGP currency validation, data source tracking,
 * and quality scoring across weighted categories.
 */

import { toTvTicker, fromTvTicker } from './market-data';

// ── TradingView Fundamental Columns ──────────────────────────

const FUNDAMENTAL_COLUMNS = [
  // Price & Market
  "close", "change", "change_abs", "volume",
  "name", "market_cap_basic", "currency",
  // Valuation Ratios
  "price_earnings_ttm",           // P/E (TTM)
  "price_book_fq",                // P/B (FQ)
  "ev_ebitda",                    // EV/EBITDA
  "price_sales_ttm",             // P/S (TTM)
  "peg_trailing_12m",            // PEG ratio
  // Per-Share Metrics
  "earnings_per_share_basic_ttm", // EPS (TTM)
  "book_value_per_share_fq",      // BVPS (FQ)
  "dividends_per_share_fy",       // DPS (FY)
  "revenue_per_share_ttm",       // Revenue per share
  // Profitability
  "revenue",                      // Total revenue
  "net_income",                   // Net income
  "operating_income",             // Operating income (EBIT)
  "gross_profit",                 // Gross profit
  "gross_margin",                 // Gross margin %
  "operating_margin",             // Operating margin %
  "net_margin",                   // Net margin %
  "return_on_equity",              // ROE %
  "return_on_assets",              // ROA %
  // Growth
  "revenue_growth_yoy",           // Revenue growth YoY %
  "earnings_growth_yoy",           // Earnings growth YoY %
  // Balance Sheet
  "total_debt_equity",            // Debt/Equity ratio
  "total_debt",                    // Total debt
  "cash",                          // Cash & equivalents
  "total_assets",                   // Total assets
  "total_liabilities",              // Total liabilities
  "stockholders_equity",            // Stockholders' equity
  "working_capital",                // Working capital
  // Cash Flow
  "free_cash_flow",                 // FCF
  "capital_expenditure",            // CapEx
  "operating_cash_flow",            // Operating cash flow
  // Dividends
  "dividend_yield_recent",         // Dividend yield %
  "payout_ratio",                   // Payout ratio %
  // Risk
  "beta_1_year",                    // Beta (1Y)
  "price_52_week_high",             // 52W high
  "price_52_week_low",              // 52W low
  // Shares
  "total_shares_outstanding_fq",    // Shares outstanding
];

// ── Cache ──────────────────────────────────────────────────────

const SCANNER_URL = "https://scanner.tradingview.com/global/scan";
const BATCH_SIZE = 20;
const FETCH_TIMEOUT = 12_000;

const fundCache = new Map<string, { data: Record<string, FundamentalData>; ts: number }>();
const FUND_CACHE_TTL = 300_000; // 5 minutes (fundamental data changes slowly)

// ── Types ──────────────────────────────────────────────────────

export type DataSource = 'tradingview' | 'yahoo' | 'mubasher' | 'validated';

export interface FundamentalData {
  symbol: string;
  name: string;

  // Price
  price: number;
  change: number;
  changeAbs: number;
  volume: number;
  marketCap: number;
  currency: string;
  week52High: number;
  week52Low: number;
  beta: number;

  // Valuation
  pe: number;
  pb: number;
  evEbitda: number;
  ps: number;
  peg: number;

  // Per-Share
  eps: number;
  bvps: number;
  dps: number;
  revenuePerShare: number;
  sharesOutstanding: number;

  // Profitability
  revenue: number;
  netIncome: number;
  operatingIncome: number;
  grossProfit: number;
  grossMargin: number;
  operatingMargin: number;
  netMargin: number;
  roe: number;
  roa: number;

  // Growth
  revenueGrowth: number;
  earningsGrowth: number;

  // Balance Sheet
  debtEquity: number;
  totalDebt: number;
  cash: number;
  totalAssets: number;
  totalLiabilities: number;
  stockholdersEquity: number;
  workingCapital: number;

  // Cash Flow
  freeCashFlow: number;
  capex: number;
  operatingCashFlow: number;

  // Dividends
  dividendYield: number;
  payoutRatio: number;

  // Data quality flags
  hasData: boolean;
  hasProfitability: boolean;
  hasBalanceSheet: boolean;
  hasCashFlow: boolean;
  hasGrowth: boolean;

  // Currency validation
  isEGP: boolean;

  // Data source tracking
  dataSource: DataSource;
  dataQualityScore: number;
  validatedAt: string | null;
}

// ── Utility ──────────────────────────────────────────────────────

function toNum(v: number | string | null | undefined): number {
  if (v == null) return 0;
  const x = typeof v === "string" ? parseFloat(v.replace(/,/g, "")) : v;
  return isFinite(x) ? x : 0;
}

// ── Main Fetch Function ─────────────────────────────────────────

export async function fetchFundamentals(
  symbols: string[]
): Promise<Record<string, FundamentalData>> {
  if (!symbols.length) return {};
  const sorted = [...symbols].map((s) => s.toUpperCase().trim()).sort();
  const key = sorted.join(",");
  const now = Date.now();

  // Check cache
  const cached = fundCache.get(key);
  if (cached && now - cached.ts < FUND_CACHE_TTL) return cached.data;

  const result: Record<string, FundamentalData> = {};

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
          columns: FUNDAMENTAL_COLUMNS,
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
      FUNDAMENTAL_COLUMNS.forEach((col, i) => { colIdx[col] = i; });

      const batchResult: Record<string, FundamentalData> = {};
      for (const item of json.data) {
        const sym = fromTvTicker(item.s || "");
        const d = item.d || [];

        // Dynamic getter helpers based on column names
        const get = (col: string) => toNum(d[colIdx[col]]);
        const getStr = (col: string, fallback: string) =>
          d[colIdx[col]] != null ? String(d[colIdx[col]]) : fallback;

        const pe = get("price_earnings_ttm");
        const revenue = get("revenue");
        const netIncome = get("net_income");
        const grossProfit = get("gross_profit");
        const grossMargin = get("gross_margin");
        const operatingMargin = get("operating_margin");
        const netMargin = get("net_margin");
        const roe = get("return_on_equity");
        const roa = get("return_on_assets");
        const freeCashFlow = get("free_cash_flow");
        const operatingCashFlow = get("operating_cash_flow");
        const totalAssets = get("total_assets");
        const totalLiabilities = get("total_liabilities");
        const stockholdersEquity = get("stockholders_equity");

        // Currency validation
        const currency = getStr("currency", "EGP").toUpperCase();
        const isEGP = currency === "EGP" || currency.includes("EGP");

        const fundamental: FundamentalData = {
          symbol: sym,
          name: getStr("name", sym),

          // Price
          price: get("close"),
          change: get("change"),
          changeAbs: get("change_abs"),
          volume: get("volume"),
          marketCap: get("market_cap_basic"),
          currency,
          week52High: get("price_52_week_high"),
          week52Low: get("price_52_week_low"),
          beta: get("beta_1_year"),

          // Valuation
          pe,
          pb: get("price_book_fq"),
          evEbitda: get("ev_ebitda"),
          ps: get("price_sales_ttm"),
          peg: get("peg_trailing_12m"),

          // Per-Share
          eps: get("earnings_per_share_basic_ttm"),
          bvps: get("book_value_per_share_fq"),
          dps: get("dividends_per_share_fy"),
          revenuePerShare: get("revenue_per_share_ttm"),
          sharesOutstanding: get("total_shares_outstanding_fq"),

          // Profitability
          revenue,
          netIncome,
          operatingIncome: get("operating_income"),
          grossProfit,
          grossMargin,
          operatingMargin,
          netMargin,
          roe,
          roa,

          // Growth
          revenueGrowth: get("revenue_growth_yoy"),
          earningsGrowth: get("earnings_growth_yoy"),

          // Balance Sheet
          debtEquity: get("total_debt_equity"),
          totalDebt: get("total_debt"),
          cash: get("cash"),
          totalAssets,
          totalLiabilities,
          stockholdersEquity,
          workingCapital: get("working_capital"),

          // Cash Flow
          freeCashFlow,
          capex: get("capital_expenditure"),
          operatingCashFlow,

          // Dividends
          dividendYield: get("dividend_yield_recent") * 100, // TV returns as decimal
          payoutRatio: get("payout_ratio") * 100,

          // Data quality flags
          hasData: pe > 0 || revenue > 0,
          hasProfitability: revenue > 0 && grossMargin > 0,
          hasBalanceSheet: totalAssets > 0,
          hasCashFlow: freeCashFlow !== 0 || operatingCashFlow !== 0,
          hasGrowth: get("revenue_growth_yoy") !== 0 || get("earnings_growth_yoy") !== 0,

          // Currency validation
          isEGP,

          // Data source tracking
          dataSource: 'tradingview' as DataSource,
          dataQualityScore: 0,
          validatedAt: null,
        };

        // Compute and assign quality score
        fundamental.dataQualityScore = getEnhancedQualityScore(fundamental).overall;

        batchResult[sym] = fundamental;
      }
      return batchResult;
    })
  );

  for (const res of responses) {
    if (res.status === "fulfilled") {
      Object.assign(result, res.value);
    }
  }

  // Cache result
  fundCache.set(key, { data: result, ts: now });
  return result;
}

/**
 * Fetch fundamentals for all EGX stocks (batched).
 * Returns a map of symbol → FundamentalData.
 */
export async function fetchAllEGXFundamentals(): Promise<Record<string, FundamentalData>> {
  const { EGX_STOCKS } = await import('./egx-stocks');
  const symbols = EGX_STOCKS.map((s) => s.symbol);
  return fetchFundamentals(symbols);
}

/**
 * Get data quality score (0-100) for a stock's fundamental data.
 */
export function getFundamentalQualityScore(f: FundamentalData): number {
  let score = 0;
  const maxScore = 11;

  if (f.price > 0) score++;
  if (f.pe > 0) score++;
  if (f.pb > 0) score++;
  if (f.revenue > 0) score++;
  if (f.netIncome !== 0) score++;
  if (f.grossMargin > 0) score++;
  if (f.roe > 0) score++;
  if (f.debtEquity >= 0) score++;
  if (f.freeCashFlow !== 0) score++;
  if (f.dividendYield >= 0) score++;
  if (f.revenueGrowth !== 0 || f.earningsGrowth !== 0) score++;

  return Math.round((score / maxScore) * 100);
}

// ── Enhanced Quality Scoring ─────────────────────────────────────

export interface QualityCategoryScores {
  price: number;
  valuation: number;
  profitability: number;
  balanceSheet: number;
  cashFlow: number;
  growth: number;
  perShare: number;
}

export interface EnhancedQualityResult {
  overall: number;
  categories: QualityCategoryScores;
  warnings: string[];
}

/**
 * Enhanced data quality score (0-100) with weighted categories.
 * Categories: Price (15), Valuation (20), Profitability (20),
 * Balance Sheet (15), Cash Flow (15), Growth (10), Per-Share (5)
 */
export function getEnhancedQualityScore(f: FundamentalData): EnhancedQualityResult {
  const warnings: string[] = [];

  // ── Price (15 points) ──
  let priceScore = 0;
  if (f.price > 0) priceScore += 5;
  if (f.change !== 0) priceScore += 3;
  if (f.volume > 0) priceScore += 2;
  if (f.marketCap > 0) priceScore += 3;
  if (f.beta > 0) priceScore += 2;

  // ── Valuation (20 points) ──
  let valuationScore = 0;
  if (f.pe > 0) valuationScore += 5;
  else warnings.push("Missing P/E ratio");
  if (f.pb > 0) valuationScore += 4;
  if (f.evEbitda > 0) valuationScore += 4;
  else warnings.push("Missing EV/EBITDA");
  if (f.ps > 0) valuationScore += 4;
  if (f.peg > 0) valuationScore += 3;

  // ── Profitability (20 points) ──
  let profitabilityScore = 0;
  if (f.revenue > 0) profitabilityScore += 4;
  else warnings.push("Missing revenue");
  if (f.grossProfit > 0) profitabilityScore += 3;
  if (f.grossMargin > 0) profitabilityScore += 3;
  if (f.operatingMargin > 0) profitabilityScore += 3;
  if (f.netMargin > 0) profitabilityScore += 3;
  if (f.roe > 0) profitabilityScore += 2;
  else warnings.push("Missing ROE");
  if (f.roa > 0) profitabilityScore += 2;

  // ── Balance Sheet (15 points) ──
  let balanceSheetScore = 0;
  if (f.totalAssets > 0) balanceSheetScore += 3;
  else warnings.push("Missing total assets");
  if (f.totalLiabilities > 0) balanceSheetScore += 2;
  if (f.stockholdersEquity > 0) balanceSheetScore += 3;
  if (f.totalDebt > 0 || f.debtEquity >= 0) balanceSheetScore += 3;
  if (f.workingCapital !== 0) balanceSheetScore += 2;
  if (f.cash > 0) balanceSheetScore += 2;

  // ── Cash Flow (15 points) ──
  let cashFlowScore = 0;
  if (f.operatingCashFlow !== 0) cashFlowScore += 4;
  else warnings.push("Missing operating cash flow");
  if (f.freeCashFlow !== 0) cashFlowScore += 4;
  if (f.capex !== 0) cashFlowScore += 3;
  if (f.operatingIncome > 0) cashFlowScore += 2;
  if (f.netIncome !== 0) cashFlowScore += 2;

  // ── Growth (10 points) ──
  let growthScore = 0;
  if (f.revenueGrowth !== 0) growthScore += 5;
  else warnings.push("Missing revenue growth");
  if (f.earningsGrowth !== 0) growthScore += 5;
  else warnings.push("Missing earnings growth");

  // ── Per-Share (5 points) ──
  let perShareScore = 0;
  if (f.eps > 0) perShareScore += 2;
  else warnings.push("Missing EPS");
  if (f.bvps > 0) perShareScore += 1;
  if (f.dps > 0) perShareScore += 1;
  if (f.sharesOutstanding > 0) perShareScore += 1;

  const overall = Math.round(
    priceScore +
    valuationScore +
    profitabilityScore +
    balanceSheetScore +
    cashFlowScore +
    growthScore +
    perShareScore
  );

  // Currency warning
  if (!f.isEGP) {
    warnings.push(`Currency is ${f.currency}, not EGP`);
  }

  return {
    overall,
    categories: {
      price: priceScore,
      valuation: valuationScore,
      profitability: profitabilityScore,
      balanceSheet: balanceSheetScore,
      cashFlow: cashFlowScore,
      growth: growthScore,
      perShare: perShareScore,
    },
    warnings,
  };
}

// ── EGP Filtering ────────────────────────────────────────────────

/**
 * Filter fundamentals to only include EGP-denominated stocks.
 * Returns filtered map + count of filtered-out stocks.
 */
export function filterEGPOnly(
  fundamentals: Record<string, FundamentalData>
): { filtered: Record<string, FundamentalData>; removedCount: number; removedSymbols: string[] } {
  const filtered: Record<string, FundamentalData> = {};
  const removedSymbols: string[] = [];

  for (const [symbol, data] of Object.entries(fundamentals)) {
    if (data.isEGP) {
      filtered[symbol] = data;
    } else {
      removedSymbols.push(symbol);
    }
  }

  return {
    filtered,
    removedCount: removedSymbols.length,
    removedSymbols,
  };
}

// ── EGP Validated Fetch ─────────────────────────────────────────

/**
 * Fetch fundamentals for all EGX stocks, filter to EGP only,
 * and return validated results.
 */
export async function fetchAllEGPValidatedStocks(): Promise<Record<string, FundamentalData>> {
  const allFundamentals = await fetchAllEGXFundamentals();

  const { filtered } = filterEGPOnly(allFundamentals);

  // Stamp validation metadata on each entry
  const now = new Date().toISOString();
  for (const data of Object.values(filtered)) {
    data.dataSource = 'validated';
    data.validatedAt = now;
  }

  return filtered;
}
