/**
 * EGX Fundamental Data Fetcher
 * ─────────────────────────────────
 * Fetches real fundamental/financial data for Egyptian stocks
 * from TradingView Scanner API with caching.
 *
 * Data includes: P/E, P/B, EV/EBITDA, EPS, Revenue, Net Income,
 * Margins, ROE, ROA, Debt ratios, Dividends, Cash flow, etc.
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

      const batchResult: Record<string, FundamentalData> = {};
      for (const item of json.data) {
        const sym = fromTvTicker(item.s || "");
        const d = item.d || [];

        const pe = toNum(d[8]);
        const revenue = toNum(d[20]);
        const netIncome = toNum(d[21]);
        const grossProfit = toNum(d[23]);
        const grossMargin = toNum(d[24]);
        const operatingMargin = toNum(d[25]);
        const netMargin = toNum(d[26]);
        const roe = toNum(d[27]);
        const roa = toNum(d[28]);
        const freeCashFlow = toNum(d[40]);
        const operatingCashFlow = toNum(d[42]);
        const totalAssets = toNum(d[35]);
        const totalLiabilities = toNum(d[36]);
        const stockholdersEquity = toNum(d[37]);

        batchResult[sym] = {
          symbol: sym,
          name: (d[5] as string) || sym,

          // Price
          price: toNum(d[0]),
          change: toNum(d[1]),
          changeAbs: toNum(d[2]),
          volume: toNum(d[3]),
          marketCap: toNum(d[6]),
          currency: (d[7] as string) || "EGP",
          week52High: toNum(d[46]),
          week52Low: toNum(d[47]),
          beta: toNum(d[45]),

          // Valuation
          pe,
          pb: toNum(d[9]),
          evEbitda: toNum(d[10]),
          ps: toNum(d[11]),
          peg: toNum(d[12]),

          // Per-Share
          eps: toNum(d[13]),
          bvps: toNum(d[14]),
          dps: toNum(d[15]),
          revenuePerShare: toNum(d[16]),
          sharesOutstanding: toNum(d[44]),

          // Profitability
          revenue,
          netIncome,
          operatingIncome: toNum(d[22]),
          grossProfit,
          grossMargin,
          operatingMargin,
          netMargin,
          roe,
          roa,

          // Growth
          revenueGrowth: toNum(d[29]),
          earningsGrowth: toNum(d[30]),

          // Balance Sheet
          debtEquity: toNum(d[31]),
          totalDebt: toNum(d[32]),
          cash: toNum(d[33]),
          totalAssets,
          totalLiabilities,
          stockholdersEquity,
          workingCapital: toNum(d[38]),

          // Cash Flow
          freeCashFlow,
          capex: toNum(d[41]),
          operatingCashFlow,

          // Dividends
          dividendYield: toNum(d[43]) * 100, // TV returns as decimal
          payoutRatio: toNum(d[48]) * 100,

          // Data quality flags
          hasData: pe > 0 || revenue > 0,
          hasProfitability: revenue > 0 && grossMargin > 0,
          hasBalanceSheet: totalAssets > 0,
          hasCashFlow: freeCashFlow !== 0 || operatingCashFlow !== 0,
          hasGrowth: toNum(d[29]) !== 0 || toNum(d[30]) !== 0,
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
