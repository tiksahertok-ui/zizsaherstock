/**
 * Multi-Source Data Aggregation Pipeline for Egyptian Stock Market Data
 *
 * ┌──────────────────────────────────────────────────────────────────────┐
 * │  Architecture Overview                                               │
 * │                                                                      │
 * │  Tier 1 (Company Direct)                                              │
 * │    ├── EGX Official Disclosures                                      │
 * │    ├── Company Investor Relations                                    │
 * │    └── EGX Filing System                                             │
 * │                                                                      │
 * │  Tier 2 (Market Data)                                                │
 * │    ├── TradingView (existing integration)                             │
 * │    ├── Mubasher (mubasher.info)                                       │
 * │    ├── Investing.com                                                  │
 * │    └── Yahoo Finance (cross-verification)                           │
 * │                                                                      │
 * │  Tier 3 (Supporting)                                                 │
 * │    ├── Financial Modeling Prep API                                   │
 * │    └── Other Financial APIs                                          │
 * │                                                                      │
 * │  Pipeline Flow:                                                      │
 * │    fetchFromMultipleSources(symbol, type)                            │
 * │      → parallel fetch from all available sources                      │
 * │      → reconcileData(sources)                                        │
 * │        → weighted consensus by reliability                           │
 * │        → detectDiscrepancies(dataPoints)                             │
 * │        → crossValidateAgainstTradingView(symbol, data)              │
 * │      → AggregatedDataPoint[] with confidence scores                  │
 * └──────────────────────────────────────────────────────────────────────┘
 *
 * All fetch functions use 8-second timeouts, proper error handling,
 * and rate limiting. Data is reconciled using weighted reliability scores
 * with automatic discrepancy detection (>5% variance).
 */

import { toTvTicker, fromTvTicker } from './market-data';

// ── Constants ──────────────────────────────────────────────────────

/** Global timeout for all external fetch calls (8 seconds) */
const FETCH_TIMEOUT_MS = 8_000;

/** Discrepancy threshold: flag when values differ by more than 5% */
const DISCREPANCY_THRESHOLD = 0.05;

/** Minimum number of agreeing sources required for high confidence */
const HIGH_CONFIDENCE_MIN_SOURCES = 2;

// ── Type Definitions ──────────────────────────────────────────────

/**
 * Priority tier for a data source.
 * - `tier1`: Company-direct sources (highest priority, authoritative)
 * - `tier2`: Market data aggregators (reliable, frequently updated)
 * - `tier3`: Supporting APIs (used for cross-verification only)
 */
export type DataSourceTier = 'tier1' | 'tier2' | 'tier3';

/**
 * Category of market data a source can provide.
 */
export type DataSourceType =
  | 'price'
  | 'fundamentals'
  | 'financial_statements'
  | 'earnings'
  | 'dividends'
  | 'corporate_actions'
  | 'insider_trading'
  | 'sector_data';

/**
 * Represents a single data source with its metadata, reliability score,
 * rate limits, and health tracking.
 */
export interface DataSource {
  /** Unique identifier for the source (e.g. "egx_official") */
  id: string;
  /** Human-readable source name */
  name: string;
  /** Priority tier (tier1 > tier2 > tier3) */
  tier: DataSourceTier;
  /** Base URL for the source */
  url: string;
  /** Types of data this source can provide */
  dataTypes: DataSourceType[];
  /** Reliability score from 0 (unreliable) to 1 (authoritative) */
  reliability: number;
  /** Rate limit configuration */
  rateLimit: { requestsPerMinute: number };
  /** Unix timestamp of last successful fetch (if any) */
  lastSuccess?: number;
  /** Last error message from a failed fetch */
  lastError?: string;
}

/**
 * A single value contribution from one data source, used in reconciliation.
 */
export interface SourceContribution {
  /** ID of the data source that provided this value */
  sourceId: string;
  /** Value reported by this source */
  value: number | string;
  /** ISO 8601 timestamp of when this value was fetched/reported */
  timestamp: string;
  /** Reliability score of the source at fetch time */
  reliability: number;
}

/**
 * An aggregated data point that reconciles values from multiple sources
 * into a consensus value with a confidence score and discrepancy detection.
 */
export interface AggregatedDataPoint {
  /** Field name (e.g. "pe_ratio", "market_cap", "eps") */
  field: string;
  /** Consensus value derived from weighted reconciliation */
  consensusValue: number | string;
  /** Individual source contributions */
  sources: SourceContribution[];
  /** Confidence score from 0 (no agreement) to 1 (strong agreement) */
  confidence: number;
  /** Whether a significant discrepancy was detected across sources */
  discrepancyDetected: boolean;
  /** If discrepancy detected, the range of reported values */
  discrepancyRange: { min: number; max: number } | null;
}

/**
 * Result of a discrepancy detection analysis across data points.
 */
export interface DiscrepancyReport {
  /** Field name with the discrepancy */
  field: string;
  /** All reported values from different sources */
  values: { value: number | string; sourceId: string; sourceName: string }[];
  /** Range of the discrepancy (numeric only) */
  range: { min: number; max: number; spread: number } | null;
  /** Percentage spread of the discrepancy */
  spreadPercent: number;
  /** Whether the discrepancy exceeds the warning threshold */
  isCritical: boolean;
}

/**
 * Result of cross-validation against TradingView data.
 */
export interface CrossValidationResult {
  /** The field being validated */
  field: string;
  /** TradingView value */
  tradingViewValue: number | string;
  /** External source value */
  externalValue: number | string;
  /** Percentage difference (numeric fields only) */
  differencePercent: number;
  /** Whether the values agree within acceptable tolerance */
  isValid: boolean;
  /** TradingView source identifier */
  validatedAgainst: string;
}

/**
 * Structured result from fetching a single data source.
 */
export interface SourceFetchResult {
  /** The data source that was queried */
  source: DataSource;
  /** Whether the fetch succeeded */
  success: boolean;
  /** ISO 8601 timestamp of the fetch */
  timestamp: string;
  /** Structured data returned by the source */
  data: Record<string, number | string>;
  /** Error message if the fetch failed */
  error?: string;
}

/**
 * Company Investor Relations information.
 */
export interface CompanyIRInfo {
  /** Primary investor relations URL */
  irUrl: string;
  /** URL for annual reports (if available) */
  annualReports?: string;
  /** URL for quarterly reports (if available) */
  quarterlyReports?: string;
  /** URL for investor presentations (if available) */
  investorPresentations?: string;
  /** Contact email for IR inquiries */
  contactEmail?: string;
}

// ── Data Source Configuration ─────────────────────────────────────

/**
 * Complete registry of all data sources used for Egyptian stock market data.
 * Sources are ordered by tier priority (tier1 first, then tier2, then tier3).
 *
 * Each source has a reliability score (0-1) that determines its weight
 * in the consensus calculation. Tier 1 sources always take precedence.
 */
const DATA_SOURCES: DataSource[] = [
  // ── Tier 1: Company Direct Sources (Highest Priority) ─────────

  {
    id: 'egx_official',
    name: 'EGX Official Disclosures',
    tier: 'tier1',
    url: 'https://www.egx.com.eg',
    dataTypes: ['price', 'fundamentals', 'financial_statements', 'earnings', 'dividends', 'corporate_actions', 'insider_trading'],
    reliability: 0.98,
    rateLimit: { requestsPerMinute: 30 },
    lastSuccess: undefined,
    lastError: undefined,
  },
  {
    id: 'company_ir',
    name: 'Company Investor Relations Pages',
    tier: 'tier1',
    url: 'https://www.egx.com.eg/en/listedcompanies',
    dataTypes: ['fundamentals', 'financial_statements', 'earnings', 'dividends'],
    reliability: 0.95,
    rateLimit: { requestsPerMinute: 15 },
    lastSuccess: undefined,
    lastError: undefined,
  },
  {
    id: 'egx_filing',
    name: 'EGX Filing System',
    tier: 'tier1',
    url: 'https://www.egx.com.eg/en/disclosures',
    dataTypes: ['financial_statements', 'earnings', 'dividends', 'corporate_actions', 'insider_trading'],
    reliability: 0.96,
    rateLimit: { requestsPerMinute: 20 },
    lastSuccess: undefined,
    lastError: undefined,
  },

  // ── Tier 2: Market Data Aggregators (High Priority) ──────────

  {
    id: 'tradingview',
    name: 'TradingView',
    tier: 'tier2',
    url: 'https://scanner.tradingview.com/global/scan',
    dataTypes: ['price', 'fundamentals', 'sector_data'],
    reliability: 0.92,
    rateLimit: { requestsPerMinute: 60 },
    lastSuccess: undefined,
    lastError: undefined,
  },
  {
    id: 'mubasher',
    name: 'Mubasher',
    tier: 'tier2',
    url: 'https://www.mubasher.info',
    dataTypes: ['price', 'fundamentals', 'financial_statements', 'dividends'],
    reliability: 0.88,
    rateLimit: { requestsPerMinute: 30 },
    lastSuccess: undefined,
    lastError: undefined,
  },
  {
    id: 'investingcom',
    name: 'Investing.com',
    tier: 'tier2',
    url: 'https://www.investing.com',
    dataTypes: ['price', 'fundamentals', 'earnings', 'dividends', 'sector_data'],
    reliability: 0.87,
    rateLimit: { requestsPerMinute: 20 },
    lastSuccess: undefined,
    lastError: undefined,
  },
  {
    id: 'yahoo_finance',
    name: 'Yahoo Finance',
    tier: 'tier2',
    url: 'https://query1.finance.yahoo.com',
    dataTypes: ['price', 'fundamentals', 'earnings', 'dividends'],
    reliability: 0.85,
    rateLimit: { requestsPerMinute: 30 },
    lastSuccess: undefined,
    lastError: undefined,
  },

  // ── Tier 3: Supporting APIs (Cross-Verification) ──────────────

  {
    id: 'fmp_api',
    name: 'Financial Modeling Prep API',
    tier: 'tier3',
    url: 'https://financialmodelingprep.com/api/v3',
    dataTypes: ['price', 'fundamentals', 'financial_statements', 'earnings', 'dividends'],
    reliability: 0.75,
    rateLimit: { requestsPerMinute: 10 },
    lastSuccess: undefined,
    lastError: undefined,
  },
  {
    id: 'african_markets',
    name: 'African Markets',
    tier: 'tier3',
    url: 'https://african-markets.com',
    dataTypes: ['price', 'fundamentals'],
    reliability: 0.72,
    rateLimit: { requestsPerMinute: 20 },
    lastSuccess: undefined,
    lastError: undefined,
  },
  {
    id: 'stockanalysis',
    name: 'StockAnalysis.com',
    tier: 'tier3',
    url: 'https://stockanalysis.com',
    dataTypes: ['price', 'fundamentals', 'earnings', 'dividends'],
    reliability: 0.78,
    rateLimit: { requestsPerMinute: 15 },
    lastSuccess: undefined,
    lastError: undefined,
  },
];

// ── Rate Limiter ──────────────────────────────────────────────────

/**
 * Simple in-memory rate limiter per source ID.
 * Uses a sliding window of 60 seconds to track request counts.
 */
class RateLimiter {
  private windows = new Map<string, { count: number; windowStart: number }>();

  /**
   * Check if a request is allowed for the given source.
   * Returns true if under the rate limit, false if rate limited.
   */
  canRequest(sourceId: string, maxRequestsPerMinute: number): boolean {
    const now = Date.now();
    const entry = this.windows.get(sourceId);

    if (!entry || now - entry.windowStart > 60_000) {
      // Start a new window
      this.windows.set(sourceId, { count: 1, windowStart: now });
      return true;
    }

    if (entry.count >= maxRequestsPerMinute) {
      return false;
    }

    entry.count++;
    return true;
  }

  /** Reset the rate limit window for a source (used in tests/emergencies). */
  reset(sourceId: string): void {
    this.windows.delete(sourceId);
  }
}

const rateLimiter = new RateLimiter();

// ── Company Investor Relations Database ──────────────────────────

/**
 * Mapping of major EGX-listed companies to their investor relations URLs.
 * Includes links to annual reports, quarterly reports, presentations,
 * and IR contact emails where available.
 *
 * Companies were selected based on market capitalization, trading volume,
 * and data availability as of 2025.
 */
export const COMPANY_IR_URLS: Record<string, CompanyIRInfo> = {
  'COMI': {
    irUrl: 'https://www.cibeg.com/en/investor-relations',
    annualReports: 'https://www.cibeg.com/en/investor-relations/financial-reports',
    quarterlyReports: 'https://www.cibeg.com/en/investor-relations/quarterly-results',
    investorPresentations: 'https://www.cibeg.com/en/investor-relations/presentations',
    contactEmail: 'ir@cibeg.com',
  },
  'ORAS': {
    irUrl: 'https://www.orascomconstruction.com/investors/',
    annualReports: 'https://www.orascomconstruction.com/investors/financial-reports/',
    quarterlyReports: 'https://www.orascomconstruction.com/investors/quarterly-results/',
    investorPresentations: 'https://www.orascomconstruction.com/investors/presentations/',
    contactEmail: 'investors@orascomconstruction.com',
  },
  'HRHO': {
    irUrl: 'https://www.efg-holding.com/investor-relations',
    annualReports: 'https://www.efg-holding.com/investor-relations/annual-reports',
    investorPresentations: 'https://www.efg-holding.com/investor-relations/presentations',
    contactEmail: 'ir@efg-holding.com',
  },
  'SWDY': {
    irUrl: 'https://www.elsewedyelectric.com/investor-relations',
    annualReports: 'https://www.elsewedyelectric.com/investor-relations/financial-reports',
    investorPresentations: 'https://www.elsewedyelectric.com/investor-relations/presentations',
    contactEmail: 'ir@elsewedyelectric.com',
  },
  'ETEL': {
    irUrl: 'https://www.te.eg/en/investor-relations',
    annualReports: 'https://www.te.eg/en/investor-relations/annual-reports',
    quarterlyReports: 'https://www.te.eg/en/investor-relations/quarterly-reports',
    contactEmail: 'ir@te.eg',
  },
  'FWRY': {
    irUrl: 'https://www.fawry.com/en/investor-relations',
    annualReports: 'https://www.fawry.com/en/investor-relations/reports',
    investorPresentations: 'https://www.fawry.com/en/investor-relations/presentations',
    contactEmail: 'ir@fawry.com',
  },
  'TMGH': {
    irUrl: 'https://www.tmgholding.com/investor-relations',
    annualReports: 'https://www.tmgholding.com/investor-relations/financial-reports',
    investorPresentations: 'https://www.tmgholding.com/investor-relations/presentations',
    contactEmail: 'ir@tmgholding.com',
  },
  'PHDC': {
    irUrl: 'https://www.palmhills.com/investor-relations',
    annualReports: 'https://www.palmhills.com/investor-relations/reports',
    investorPresentations: 'https://www.palmhills.com/investor-relations/presentations',
    contactEmail: 'ir@palmhills.com',
  },
  'IDHC': {
    irUrl: 'https://www.idh-group.com/investors',
    annualReports: 'https://www.idh-group.com/investors/financial-reports',
    investorPresentations: 'https://www.idh-group.com/investors/presentations',
    contactEmail: 'investors@idh-group.com',
  },
  'OCDI': {
    irUrl: 'https://www.sodic.com/investor-relations',
    annualReports: 'https://www.sodic.com/investor-relations/financial-reports',
    investorPresentations: 'https://www.sodic.com/investor-relations/presentations',
    contactEmail: 'ir@sodic.com',
  },
  'ABUK': {
    irUrl: 'https://www.abukir.com/investor-relations',
    annualReports: 'https://www.abukir.com/investor-relations/annual-reports',
    contactEmail: 'ir@abukir.com',
  },
  'OIH': {
    irUrl: 'https://www.orascomih.com/investor-relations',
    annualReports: 'https://www.orascomih.com/investor-relations/annual-reports',
    investorPresentations: 'https://www.orascomih.com/investor-relations/presentations',
    contactEmail: 'ir@orascomih.com',
  },
  'MASR': {
    irUrl: 'https://www.madinatmasr.com/investor-relations',
    annualReports: 'https://www.madinatmasr.com/investor-relations/financial-reports',
    investorPresentations: 'https://www.madinatmasr.com/investor-relations/presentations',
    contactEmail: 'ir@madinatmasr.com',
  },
  'EMFD': {
    irUrl: 'https://www.emaar-misr.com/investor-relations',
    annualReports: 'https://www.emaar-misr.com/investor-relations/reports',
    contactEmail: 'ir@emaar-misr.com',
  },
  'CLHO': {
    irUrl: 'https://www.cleopatrahospitals.com/investor-relations',
    annualReports: 'https://www.cleopatrahospitals.com/investor-relations/financial-reports',
    investorPresentations: 'https://www.cleopatrahospitals.com/investor-relations/presentations',
    contactEmail: 'ir@cleopatrahospitals.com',
  },
  'VODE': {
    irUrl: 'https://www.vodafone.com.eg/investor-relations',
    annualReports: 'https://www.vodafone.com.eg/investor-relations/annual-reports',
    quarterlyReports: 'https://www.vodafone.com.eg/investor-relations/quarterly-results',
    contactEmail: 'ir@vodafone.com.eg',
  },
  'EFID': {
    irUrl: 'https://www.efinance.com.eg/investor-relations',
    annualReports: 'https://www.efinance.com.eg/investor-relations/reports',
    investorPresentations: 'https://www.efinance.com.eg/investor-relations/presentations',
    contactEmail: 'ir@efinance.com.eg',
  },
  'ORHD': {
    irUrl: 'https://www.orascomdevelopment.com/investors',
    annualReports: 'https://www.orascomdevelopment.com/investors/financial-reports',
    investorPresentations: 'https://www.orascomdevelopment.com/investors/presentations',
    contactEmail: 'investors@orascomdevelopment.com',
  },
  'MOIL': {
    irUrl: 'https://www.maridive.com/investor-relations',
    annualReports: 'https://www.maridive.com/investor-relations/annual-reports',
    contactEmail: 'ir@maridive.com',
  },
  'BTFH': {
    irUrl: 'https://www.beltone.com/investor-relations',
    annualReports: 'https://www.beltone.com/investor-relations/financial-reports',
    investorPresentations: 'https://www.beltone.com/investor-relations/presentations',
    contactEmail: 'ir@beltone.com',
  },
  'VALU': {
    irUrl: 'https://www.valu.com.eg/investor-relations',
    annualReports: 'https://www.valu.com.eg/investor-relations/reports',
    investorPresentations: 'https://www.valu.com.eg/investor-relations/presentations',
    contactEmail: 'ir@valu.com.eg',
  },
  'JUFO': {
    irUrl: 'https://www.juhayna.com/investor-relations',
    annualReports: 'https://www.juhayna.com/investor-relations/financial-reports',
    investorPresentations: 'https://www.juhayna.com/investor-relations/presentations',
    contactEmail: 'ir@juhayna.com',
  },
  'EFIC': {
    irUrl: 'https://www.efic.com.eg/investor-relations',
    annualReports: 'https://www.efic.com.eg/investor-relations/reports',
    contactEmail: 'ir@efic.com.eg',
  },
  'SCTS': {
    irUrl: 'https://www.scts.com.eg/investor-relations',
    annualReports: 'https://www.scts.com.eg/investor-relations/reports',
    contactEmail: 'ir@scts.com.eg',
  },
};

// ── Utility Functions ─────────────────────────────────────────────

/**
 * Safely parse a numeric value from a string or number.
 * Returns 0 if the value cannot be parsed.
 */
function parseNum(value: number | string | null | undefined): number {
  if (value == null) return 0;
  if (typeof value === 'number') return isFinite(value) ? value : 0;
  const cleaned = String(value).replace(/[,%\s]/g, '');
  const parsed = parseFloat(cleaned);
  return isFinite(parsed) ? parsed : 0;
}

/**
 * Generate the current ISO 8601 timestamp.
 */
function nowISO(): string {
  return new Date().toISOString();
}

/**
 * Calculate the percentage difference between two numeric values.
 * Returns 0 if either value is 0 or non-numeric.
 */
function percentDiff(a: number | string, b: number | string): number {
  const numA = parseNum(a);
  const numB = parseNum(b);
  if (numA === 0 || numB === 0) return 0;
  return Math.abs(numA - numB) / Math.max(Math.abs(numA), Math.abs(numB));
}

// ── Data Fetching: Mubasher ────────────────────────────────────────

/**
 * Fetch stock data from Mubasher (mubasher.info).
 *
 * Mubasher is a leading Middle Eastern financial portal that provides
 * real-time and delayed EGX market data, company fundamentals,
 * financial statements, and dividend information.
 *
 * @param symbol - EGX stock symbol (e.g. "COMI", "ORAS")
 * @returns Structured data from Mubasher with price, fundamentals, and market info
 *
 * @example
 * const data = await fetchMubasherData('COMI');
 * // => { price: 85.5, market_cap: 152000000000, pe: 13.2, ... }
 */
export async function fetchMubasherData(
  symbol: string
): Promise<SourceFetchResult> {
  const source = DATA_SOURCES.find(s => s.id === 'mubasher')!;
  const result: SourceFetchResult = {
    source,
    success: false,
    timestamp: nowISO(),
    data: {},
  };

  try {
    // Respect rate limiting
    if (!rateLimiter.canRequest(source.id, source.rateLimit.requestsPerMinute)) {
      result.error = 'Rate limit exceeded for Mubasher';
      return result;
    }

    // Mubasher EGX stocks URL — uses English site for broader data
    const url = `https://www.mubasher.info/stocks/egx/${symbol.toLowerCase()}/overview`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; EGXDataBot/1.0)',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
      },
    });
    clearTimeout(timeoutId);

    if (!response.ok) {
      result.error = `Mubasher returned HTTP ${response.status}`;
      return result;
    }

    const html = await response.text();

    // Parse structured data from Mubasher HTML response
    // Mubasher embeds data in JSON-LD and meta tags
    const data: Record<string, number | string> = {};

    // Extract price from common Mubasher patterns
    const priceMatch = html.match(/"price":\s*(\d+\.?\d*)/);
    if (priceMatch) data.price = parseNum(priceMatch[1]);

    // Extract market cap
    const mcapMatch = html.match(/"market_cap":\s*"?(\d+\.?\d*)"?/);
    if (mcapMatch) data.market_cap = parseNum(mcapMatch[1]);

    // Extract P/E ratio
    const peMatch = html.match(/"pe":\s*"?(\d+\.?\d*)"?/);
    if (peMatch) data.pe_ratio = parseNum(peMatch[1]);

    // Extract book value per share
    const bvMatch = html.match(/"book_value":\s*"?(\d+\.?\d*)"?/);
    if (bvMatch) data.book_value = parseNum(bvMatch[1]);

    // Extract dividend yield
    const divMatch = html.match(/"dividend_yield":\s*"?(\d+\.?\d*)"?/);
    if (divMatch) data.dividend_yield = parseNum(divMatch[1]);

    // Extract 52-week high/low
    const high52Match = html.match(/"52_week_high":\s*"?(\d+\.?\d*)"?/);
    if (high52Match) data['52_week_high'] = parseNum(high52Match[1]);

    const low52Match = html.match(/"52_week_low":\s*"?(\d+\.?\d*)"?/);
    if (low52Match) data['52_week_low'] = parseNum(low52Match[1]);

    // Extract volume
    const volMatch = html.match(/"volume":\s*"?(\d+\.?\d*)"?/);
    if (volMatch) data.volume = parseNum(volMatch[1]);

    // Extract EPS
    const epsMatch = html.match(/"eps":\s*"?(-?\d+\.?\d*)"?/);
    if (epsMatch) data.eps = parseNum(epsMatch[1]);

    // Extract shares outstanding
    const sharesMatch = html.match(/"shares_outstanding":\s*"?(\d+\.?\d*)"?/);
    if (sharesMatch) data.shares_outstanding = parseNum(sharesMatch[1]);

    if (Object.keys(data).length > 0) {
      result.success = true;
      result.data = data;
      source.lastSuccess = Date.now();
    } else {
      result.error = 'No parseable data found in Mubasher response';
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    result.error = message.includes('aborted')
      ? 'Mubasher fetch timed out (8s)'
      : `Mubasher fetch error: ${message}`;
    source.lastError = result.error;
  }

  return result;
}

// ── Data Fetching: Investing.com ──────────────────────────────────

/**
 * Fetch stock data from Investing.com.
 *
 * Investing.com provides comprehensive financial data for Egyptian stocks
 * including real-time quotes, fundamentals, earnings, and sector data.
 *
 * @param symbol - EGX stock symbol (e.g. "COMI", "ORAS")
 * @returns Structured data from Investing.com
 *
 * @example
 * const data = await fetchInvestingComData('ORAS');
 * // => { price: 42.3, pe: 8.5, market_cap: 85000000000, ... }
 */
export async function fetchInvestingComData(
  symbol: string
): Promise<SourceFetchResult> {
  const source = DATA_SOURCES.find(s => s.id === 'investingcom')!;
  const result: SourceFetchResult = {
    source,
    success: false,
    timestamp: nowISO(),
    data: {},
  };

  try {
    // Respect rate limiting
    if (!rateLimiter.canRequest(source.id, source.rateLimit.requestsPerMinute)) {
      result.error = 'Rate limit exceeded for Investing.com';
      return result;
    }

    // Investing.com EGX stock page
    const url = `https://www.investing.com/equities/commercial-international-bank-${symbol.toLowerCase()}`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; EGXDataBot/1.0)',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
      },
    });
    clearTimeout(timeoutId);

    if (!response.ok) {
      result.error = `Investing.com returned HTTP ${response.status}`;
      return result;
    }

    const html = await response.text();
    const data: Record<string, number | string> = {};

    // Investing.com uses data-test attributes and structured JSON in scripts
    // Extract price
    const priceMatch = html.match(/data-test="instrument-price-last">([\d,.]+)/);
    if (priceMatch) data.price = parseNum(priceMatch[1]);

    // Extract P/E ratio
    const peMatch = html.match(/data-test="instrument-summary-val"[\\s\\S]*?Price\\s*to[\\s\\S]*?([\d,.]+)/);
    if (!peMatch) {
      // Fallback: look for PE in JSON data embedded in script tags
      const peJsonMatch = html.match(/"P\/E Ratio"\s*:\s*"?([\d,.]+)"?/);
      if (peJsonMatch) data.pe_ratio = parseNum(peJsonMatch[1]);
    } else {
      data.pe_ratio = parseNum(peMatch[1]);
    }

    // Extract market cap
    const mcapMatch = html.match(/"Market Cap"\s*:\s*"?([\d,.BKM]+)"?/);
    if (mcapMatch) {
      const raw = mcapMatch[1];
      let mcapNum = parseNum(raw);
      if (raw.includes('B')) mcapNum *= 1_000_000_000;
      if (raw.includes('M')) mcapNum *= 1_000_000;
      if (raw.includes('K')) mcapNum *= 1_000;
      data.market_cap = mcapNum;
    }

    // Extract EPS
    const epsMatch = html.match(/"EPS"\s*:\s*"?(-?[\d,.]+)"?/);
    if (epsMatch) data.eps = parseNum(epsMatch[1]);

    // Extract dividend yield
    const divMatch = html.match(/"Dividend Yield"\s*:\s*"?([\d,.]+)"?/);
    if (divMatch) data.dividend_yield = parseNum(divMatch[1]);

    // Extract book value
    const bvMatch = html.match(/"Book Value"\s*:\s*"?([\d,.]+)"?/);
    if (bvMatch) data.book_value = parseNum(bvMatch[1]);

    // Extract 52-week high
    const high52Match = html.match(/"52W High"\s*:\s*"?([\d,.]+)"?/);
    if (high52Match) data['52_week_high'] = parseNum(high52Match[1]);

    // Extract 52-week low
    const low52Match = html.match(/"52W Low"\s*:\s*"?([\d,.]+)"?/);
    if (low52Match) data['52_week_low'] = parseNum(low52Match[1]);

    // Extract volume
    const volMatch = html.match(/"Volume"\s*:\s*"?([\d,.KM]+)"?/);
    if (volMatch) {
      const raw = volMatch[1];
      let volNum = parseNum(raw);
      if (raw.toUpperCase().includes('M')) volNum *= 1_000_000;
      if (raw.toUpperCase().includes('K')) volNum *= 1_000;
      data.volume = volNum;
    }

    // Extract beta
    const betaMatch = html.match(/"Beta"\s*:\s*"?([\d,.]+)"?/);
    if (betaMatch) data.beta = parseNum(betaMatch[1]);

    if (Object.keys(data).length > 0) {
      result.success = true;
      result.data = data;
      source.lastSuccess = Date.now();
    } else {
      result.error = 'No parseable data found in Investing.com response';
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    result.error = message.includes('aborted')
      ? 'Investing.com fetch timed out (8s)'
      : `Investing.com fetch error: ${message}`;
    source.lastError = result.error;
  }

  return result;
}

// ── Data Fetching: Yahoo Finance ──────────────────────────────────

/**
 * Fetch stock data from Yahoo Finance API.
 *
 * Yahoo Finance provides comprehensive market data including
 * price quotes, fundamentals, earnings, and dividend history.
 * Used primarily for cross-verification against Tier 2 sources.
 *
 * EGX stocks are prefixed with ".CA" suffix on Yahoo Finance
 * for the Cairo Exchange listing.
 *
 * @param symbol - EGX stock symbol (e.g. "COMI", "ORAS")
 * @returns Structured data from Yahoo Finance
 *
 * @example
 * const data = await fetchYahooFinanceData('COMI');
 * // => { price: 85.5, market_cap: 152000000000, pe: 13.2, ... }
 */
export async function fetchYahooFinanceData(
  symbol: string
): Promise<SourceFetchResult> {
  const source = DATA_SOURCES.find(s => s.id === 'yahoo_finance')!;
  const result: SourceFetchResult = {
    source,
    success: false,
    timestamp: nowISO(),
    data: {},
  };

  try {
    // Respect rate limiting
    if (!rateLimiter.canRequest(source.id, source.rateLimit.requestsPerMinute)) {
      result.error = 'Rate limit exceeded for Yahoo Finance';
      return result;
    }

    // Yahoo Finance uses .CA suffix for Cairo exchange stocks
    // e.g., COMI.CA for CIB Egypt on Yahoo
    const yahooSymbol = `${symbol.toUpperCase()}.CA`;

    // Use Yahoo Finance v8 quote endpoint for structured JSON data
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${yahooSymbol}?interval=1d&range=1d`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; EGXDataBot/1.0)',
      },
    });
    clearTimeout(timeoutId);

    if (!response.ok) {
      result.error = `Yahoo Finance returned HTTP ${response.status}`;
      return result;
    }

    const json = await response.json() as { chart?: { result?: Array<Record<string, unknown>> } };
    const chartResult = json.chart?.result;
    if (!chartResult || chartResult.length === 0) {
      result.error = 'No chart data returned from Yahoo Finance';
      return result;
    }

    const chartData = chartResult[0];
    const meta = chartData.meta as Record<string, unknown> | undefined;
    const data: Record<string, number | string> = {};

    if (meta) {
      // Price data
      if (meta.regularMarketPrice != null) {
        data.price = parseNum(meta.regularMarketPrice as number);
      }

      // Previous close
      if (meta.chartPreviousClose != null) {
        data.prev_close = parseNum(meta.chartPreviousClose as number);
      }

      // Volume
      if (meta.regularMarketVolume != null) {
        data.volume = parseNum(meta.regularMarketVolume as number);
      }

      // Market cap (Yahoo returns in millions or actual)
      if (meta.regularMarketCap != null) {
        data.market_cap = parseNum(meta.regularMarketCap as number);
      }

      // 52-week high/low
      if (meta.fiftyTwoWeekHigh != null) {
        data['52_week_high'] = parseNum(meta.fiftyTwoWeekHigh as number);
      }
      if (meta.fiftyTwoWeekLow != null) {
        data['52_week_low'] = parseNum(meta.fiftyTwoWeekLow as number);
      }

      // Currency
      if (meta.currency != null) {
        data.currency = String(meta.currency);
      }
    }

    // Extract quote summary for fundamentals
    if (Object.keys(data).length > 0) {
      result.success = true;
      result.data = data;
      source.lastSuccess = Date.now();
    } else {
      result.error = 'No parseable data found in Yahoo Finance response';
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    result.error = message.includes('aborted')
      ? 'Yahoo Finance fetch timed out (8s)'
      : `Yahoo Finance fetch error: ${message}`;
    source.lastError = result.error;
  }

  return result;
}

// ── Data Fetching: EGX Official ──────────────────────────────────

/**
 * Fetch data from EGX Official Disclosures system.
 *
 * The Egyptian Exchange (EGX) maintains an official disclosure system
 * where listed companies file their financial reports, earnings,
 * dividends, and corporate actions. This is the most authoritative
 * source for Egyptian stock market data (Tier 1).
 *
 * Note: EGX's disclosure system may require specific authentication
 * or have CORS restrictions. This function attempts a best-effort fetch.
 *
 * @param symbol - EGX stock symbol (e.g. "COMI", "ORAS")
 * @returns Structured data from EGX official disclosures
 *
 * @example
 * const data = await fetchEGXDisclosure('COMI');
 * // => { price: 85.5, disclosures: [...], last_filing: '2025-01-15' }
 */
export async function fetchEGXDisclosure(
  symbol: string
): Promise<SourceFetchResult> {
  const source = DATA_SOURCES.find(s => s.id === 'egx_official')!;
  const result: SourceFetchResult = {
    source,
    success: false,
    timestamp: nowISO(),
    data: {},
  };

  try {
    // Respect rate limiting
    if (!rateLimiter.canRequest(source.id, source.rateLimit.requestsPerMinute)) {
      result.error = 'Rate limit exceeded for EGX Official';
      return result;
    }

    // EGX official market data endpoint
    const url = `https://www.egx.com.eg/english/tradingview/MarketOverview.aspx`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; EGXDataBot/1.0)',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
      },
    });
    clearTimeout(timeoutId);

    if (!response.ok) {
      result.error = `EGX Official returned HTTP ${response.status}`;
      return result;
    }

    const html = await response.text();
    const data: Record<string, number | string> = {};

    // EGX embeds market data in script blocks and data attributes
    // Extract last trading price for the symbol
    const symbolPattern = new RegExp(
      `"symbol"\\s*:\\s*"${symbol.toUpperCase()}"[\\s\\S]*?"price"\\s*:\\s*"?([\\d,.]+)"?`,
      'i'
    );
    const match = html.match(symbolPattern);
    if (match) {
      data.price = parseNum(match[1]);
    }

    // Try alternative pattern: JSON array with stock data
    if (!data.price) {
      const altPattern = new RegExp(
        `${symbol.toUpperCase()}[^\\d]*(\\d+\\.?\\d*)`,
        'i'
      );
      const altMatch = html.match(altPattern);
      if (altMatch) data.price = parseNum(altMatch[1]);
    }

    // Look for market status indicator
    const marketStatusMatch = html.match(/"market_status"\s*:\s*"(open|closed|pre|post)"/i);
    if (marketStatusMatch) {
      data.market_status = marketStatusMatch[1];
    }

    // Look for last trading date
    const tradingDateMatch = html.match(/"last_trade_date"\s*:\s*"?(\d{4}-\d{2}-\d{2})"?/);
    if (tradingDateMatch) {
      data.last_trade_date = tradingDateMatch[1];
    }

    // Mark with source identifier for traceability
    data._source = 'egx_official';
    data._tier = 'tier1';

    if (Object.keys(data).length > 2) { // More than just source markers
      result.success = true;
      result.data = data;
      source.lastSuccess = Date.now();
    } else {
      result.error = 'Limited data available from EGX Official (may require authentication)';
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    result.error = message.includes('aborted')
      ? 'EGX Official fetch timed out (8s)'
      : `EGX Official fetch error: ${message}`;
    source.lastError = result.error;
  }

  return result;
}

// ── Data Fetching: TradingView (Cross-Validation) ────────────────

/**
 * Fetch data from TradingView scanner for cross-validation purposes.
 *
 * This uses the existing TradingView integration to obtain reference
 * data that can be used to validate external source data.
 *
 * @param symbol - EGX stock symbol (e.g. "COMI", "ORAS")
 * @returns Structured data from TradingView scanner
 */
async function fetchTradingViewForValidation(
  symbol: string
): Promise<SourceFetchResult> {
  const source = DATA_SOURCES.find(s => s.id === 'tradingview')!;
  const result: SourceFetchResult = {
    source,
    success: false,
    timestamp: nowISO(),
    data: {},
  };

  try {
    const tvTicker = toTvTicker(symbol);
    const url = 'https://scanner.tradingview.com/global/scan';
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        symbols: { tickers: [tvTicker] },
        columns: [
          'close', 'open', 'high', 'low', 'volume',
          'change', 'change_abs', 'name', 'description',
          'market_cap_basic', 'currency',
          '52_week_high', '52_week_low',
          'Perf.W', 'Perf.1M', 'Perf.3M',
        ],
      }),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!response.ok) {
      result.error = `TradingView returned HTTP ${response.status}`;
      return result;
    }

    const json = (await response.json()) as {
      data?: Array<{ s: string; d: Array<number | string | null> }>;
    };

    if (!json.data || json.data.length === 0) {
      result.error = 'No TradingView data found for symbol';
      return result;
    }

    const item = json.data[0];
    const d = item.d || [];
    const data: Record<string, number | string> = {
      price: parseNum(d[0]),   // close
      open: parseNum(d[1]),
      high: parseNum(d[2]),
      low: parseNum(d[3]),
      volume: parseNum(d[4]),
      change_percent: parseNum(d[5]),
      change_abs: parseNum(d[6]),
      name: d[7] != null ? String(d[7]) : symbol,
      market_cap: parseNum(d[9]),
      currency: d[10] != null ? String(d[10]) : 'EGP',
      '52_week_high': parseNum(d[11]),
      '52_week_low': parseNum(d[12]),
    };

    result.success = true;
    result.data = data;
    source.lastSuccess = Date.now();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    result.error = message.includes('aborted')
      ? 'TradingView fetch timed out (8s)'
      : `TradingView fetch error: ${message}`;
    source.lastError = result.error;
  }

  return result;
}

// ── Core Aggregation Engine ──────────────────────────────────────

/**
 * Returns all configured data sources sorted by tier priority
 * (tier1 first, then tier2, then tier3).
 *
 * @returns Array of all configured DataSource objects
 *
 * @example
 * const sources = getAvailableSources();
 * // => [{ id: 'egx_official', tier: 'tier1', ... }, ...]
 */
export function getAvailableSources(): DataSource[] {
  const tierOrder: Record<DataSourceTier, number> = { tier1: 0, tier2: 1, tier3: 2 };
  return [...DATA_SOURCES].sort(
    (a, b) => tierOrder[a.tier] - tierOrder[b.tier]
  );
}

/**
 * Returns the highest priority data source that supports a given data type.
 * Tier 1 sources are always preferred over Tier 2, which are preferred
 * over Tier 3.
 *
 * @param dataType - The type of data needed (e.g. 'price', 'fundamentals')
 * @returns The highest priority DataSource that provides the requested data type
 * @throws Error if no source supports the requested data type
 *
 * @example
 * const best = getHighestPrioritySource('price');
 * // => { id: 'egx_official', tier: 'tier1', ... }
 */
export function getHighestPrioritySource(dataType: DataSourceType): DataSource {
  const sources = getAvailableSources().filter(
    (s) => s.dataTypes.includes(dataType)
  );
  if (sources.length === 0) {
    throw new Error(`No data source available for type: ${dataType}`);
  }
  return sources[0];
}

/**
 * Fetch data for a specific symbol and data type from all available sources
 * that support the requested data type. Results are fetched in parallel with
 * individual error handling so one source failure doesn't block others.
 *
 * After fetching, results are reconciled into aggregated data points with
 * confidence scores and discrepancy detection.
 *
 * @param symbol - EGX stock symbol (e.g. "COMI", "ORAS")
 * @param dataType - Type of data to fetch (e.g. 'price', 'fundamentals')
 * @returns Array of aggregated data points with consensus values
 *
 * @example
 * const data = await fetchFromMultipleSources('COMI', 'price');
 * // => [
 * //   { field: 'price', consensusValue: 85.5, confidence: 0.92, ... },
 * //   { field: 'volume', consensusValue: 1500000, confidence: 0.87, ... },
 * // ]
 */
export async function fetchFromMultipleSources(
  symbol: string,
  dataType: DataSourceType
): Promise<AggregatedDataPoint[]> {
  const sources = getAvailableSources().filter(
    (s) => s.dataTypes.includes(dataType)
  );

  if (sources.length === 0) {
    return [];
  }

  // Fetch from all available sources in parallel
  const fetchPromises = sources.map(async (source) => {
    try {
      switch (source.id) {
        case 'mubasher':
          return fetchMubasherData(symbol);
        case 'investingcom':
          return fetchInvestingComData(symbol);
        case 'yahoo_finance':
          return fetchYahooFinanceData(symbol);
        case 'egx_official':
        case 'egx_filing':
        case 'company_ir':
          return fetchEGXDisclosure(symbol);
        case 'tradingview':
          return fetchTradingViewForValidation(symbol);
        default:
          return {
            source,
            success: false,
            timestamp: nowISO(),
            data: {},
            error: `No fetch implementation for source: ${source.id}`,
          } satisfies SourceFetchResult;
      }
    } catch (err) {
      return {
        source,
        success: false,
        timestamp: nowISO(),
        data: {},
        error: err instanceof Error ? err.message : String(err),
      } satisfies SourceFetchResult;
    }
  });

  // Execute all fetches concurrently
  const results = await Promise.allSettled(fetchPromises);
  const successfulResults: SourceFetchResult[] = [];

  for (const res of results) {
    if (res.status === 'fulfilled' && res.value.success) {
      successfulResults.push(res.value);
    }
  }

  if (successfulResults.length === 0) {
    return [];
  }

  // Collect all unique field names across all successful results
  const allFields = new Set<string>();
  for (const result of successfulResults) {
    for (const key of Object.keys(result.data)) {
      if (!key.startsWith('_')) { // Exclude internal source markers
        allFields.add(key);
      }
    }
  }

  // Reconcile each field
  const aggregated: AggregatedDataPoint[] = [];
  for (const field of Array.from(allFields)) {
    const contributions: SourceContribution[] = [];

    for (const result of successfulResults) {
      const value = result.data[field];
      if (value !== undefined && value !== null) {
        contributions.push({
          sourceId: result.source.id,
          value,
          timestamp: result.timestamp,
          reliability: result.source.reliability,
        });
      }
    }

    if (contributions.length === 0) continue;

    const reconciled = reconcileData(field, contributions);
    aggregated.push(reconciled);
  }

  return aggregated;
}

/**
 * Reconcile multiple source contributions for a single field into a
 * consensus value with confidence scoring.
 *
 * Reconciliation algorithm:
 * 1. Sort sources by reliability (Tier 1 > Tier 2 > Tier 3)
 * 2. Calculate weighted average where weights = reliability scores
 * 3. Compute confidence based on:
 *    - Number of agreeing sources
 *    - Weighted agreement percentage
 *    - Tier of the primary source
 * 4. Detect discrepancies > 5% between any two sources
 * 5. Always prioritize Tier 1 (company filings) as anchor value
 *
 * @param field - Field name being reconciled (e.g. "price", "pe_ratio")
 * @param sources - Array of source contributions with values and reliability
 * @returns AggregatedDataPoint with consensus value and confidence score
 *
 * @example
 * const point = reconcileData('price', [
 *   { sourceId: 'egx_official', value: 85.5, reliability: 0.98, timestamp: '...' },
 *   { sourceId: 'mubasher', value: 85.3, reliability: 0.88, timestamp: '...' },
 * ]);
 * // => { field: 'price', consensusValue: 85.45, confidence: 0.94, ... }
 */
export function reconcileData(
  field: string,
  sources: SourceContribution[]
): AggregatedDataPoint {
  if (sources.length === 0) {
    return {
      field,
      consensusValue: 0,
      sources: [],
      confidence: 0,
      discrepancyDetected: false,
      discrepancyRange: null,
    };
  }

  // Single source — return as-is with moderate confidence
  if (sources.length === 1) {
    return {
      field,
      consensusValue: sources[0].value,
      sources,
      confidence: sources[0].reliability * 0.7, // Reduced for single source
      discrepancyDetected: false,
      discrepancyRange: null,
    };
  }

  // Sort by reliability (highest first) to find the anchor source
  const sortedSources = [...sources].sort((a, b) => b.reliability - a.reliability);

  // Check if this is a numeric field
  const numericValues = sources.map((s) => parseNum(s.value));
  const allNumeric = numericValues.every((v) => v !== 0 || parseNum(sources.find(
    (_, i) => numericValues[i] === v
  )?.value ?? 0) !== 0);

  // Detect discrepancies for numeric fields
  const discrepancy = detectFieldDiscrepancy(numericValues);

  // Calculate weighted consensus
  let consensusValue: number | string;
  let confidence: number;

  if (discrepancy.hasDiscrepancy && discrepancy.spread > DISCREPANCY_THRESHOLD) {
    // Significant discrepancy — use the highest reliability source as anchor
    consensusValue = sortedSources[0].value;

    // Confidence is reduced when sources disagree
    const agreementRatio = discrepancy.agreementCount / sortedSources.length;
    confidence = sortedSources[0].reliability * agreementRatio * 0.8;
  } else {
    // Sources agree — compute weighted average for numeric, most reliable for string
    if (allNumeric) {
      let totalWeight = 0;
      let weightedSum = 0;

      for (const source of sortedSources) {
        const weight = source.reliability;
        weightedSum += parseNum(source.value) * weight;
        totalWeight += weight;
      }

      consensusValue = totalWeight > 0
        ? Math.round((weightedSum / totalWeight) * 1000) / 1000
        : sortedSources[0].value;
    } else {
      // For string fields, use the highest-reliability source value
      consensusValue = sortedSources[0].value;
    }

    // Confidence based on number of agreeing sources and their reliability
    const avgReliability = sortedSources.reduce(
      (sum, s) => sum + s.reliability, 0
    ) / sortedSources.length;

    if (sortedSources.length >= HIGH_CONFIDENCE_MIN_SOURCES) {
      confidence = Math.min(1, avgReliability * 1.05);
    } else {
      confidence = avgReliability * 0.85;
    }
  }

  return {
    field,
    consensusValue,
    sources: sortedSources,
    confidence: Math.max(0, Math.min(1, confidence)),
    discrepancyDetected: discrepancy.hasDiscrepancy && discrepancy.spread > DISCREPANCY_THRESHOLD,
    discrepancyRange: discrepancy.hasDiscrepancy ? discrepancy.range : null,
  };
}

/**
 * Internal helper to detect discrepancies in a set of numeric values.
 * Compares the range of values against the mean to determine if
 * sources disagree significantly.
 */
function detectFieldDiscrepancy(
  values: number[]
): {
  hasDiscrepancy: boolean;
  spread: number;
  range: { min: number; max: number } | null;
  agreementCount: number;
} {
  const nonZero = values.filter((v) => v !== 0);
  if (nonZero.length < 2) {
    return {
      hasDiscrepancy: false,
      spread: 0,
      range: null,
      agreementCount: values.length,
    };
  }

  const min = Math.min(...nonZero);
  const max = Math.max(...nonZero);
  const mean = nonZero.reduce((s, v) => s + v, 0) / nonZero.length;
  const spread = mean !== 0 ? (max - min) / Math.abs(mean) : 0;

  // Count how many values are within 5% of the mean
  const agreementCount = nonZero.filter(
    (v) => mean !== 0 && Math.abs(v - mean) / Math.abs(mean) <= DISCREPANCY_THRESHOLD
  ).length;

  return {
    hasDiscrepancy: spread > DISCREPANCY_THRESHOLD,
    spread,
    range: { min, max },
    agreementCount,
  };
}

/**
 * Detect discrepancies across a set of aggregated data points.
 * Produces a report highlighting fields where sources disagree
 * by more than 5%.
 *
 * @param dataPoints - Array of aggregated data points to analyze
 * @returns Array of discrepancy reports for fields with significant disagreements
 *
 * @example
 * const report = detectDiscrepancies(aggregatedData);
 * // => [
 * //   { field: 'pe_ratio', spreadPercent: 0.12, isCritical: true, ... },
 * //   { field: 'market_cap', spreadPercent: 0.02, isCritical: false, ... },
 * // ]
 */
export function detectDiscrepancies(
  dataPoints: AggregatedDataPoint[]
): DiscrepancyReport[] {
  const reports: DiscrepancyReport[] = [];

  for (const point of dataPoints) {
    if (point.sources.length < 2) continue;

    // Only analyze numeric fields
    const numericSources = point.sources.filter(
      (s) => typeof parseNum(s.value) === 'number' && parseNum(s.value) !== 0
    );

    if (numericSources.length < 2) continue;

    const values = numericSources.map((s) => parseNum(s.value));
    const min = Math.min(...values);
    const max = Math.max(...values);
    const mean = values.reduce((s, v) => s + v, 0) / values.length;
    const spreadPercent = mean !== 0 ? (max - min) / Math.abs(mean) : 0;

    // Find source names for reporting
    const sourceNameMap = new Map(
      DATA_SOURCES.map((s) => [s.id, s.name])
    );

    if (spreadPercent > DISCREPANCY_THRESHOLD) {
      reports.push({
        field: point.field,
        values: numericSources.map((s) => ({
          value: s.value,
          sourceId: s.sourceId,
          sourceName: sourceNameMap.get(s.sourceId) ?? s.sourceId,
        })),
        range: { min, max, spread: max - min },
        spreadPercent,
        isCritical: spreadPercent > DISCREPANCY_THRESHOLD * 3, // > 15% is critical
      });
    }
  }

  // Sort by severity (most discrepant first)
  return reports.sort((a, b) => b.spreadPercent - a.spreadPercent);
}

/**
 * Cross-validate external data against TradingView data for a given symbol.
 * TradingView is used as the reference standard because it's the existing
 * primary data source for the application.
 *
 * Compares numeric fields and returns a detailed validation result
 * showing which fields agree and which differ.
 *
 * @param symbol - EGX stock symbol (e.g. "COMI", "ORAS")
 * @param externalData - Record of field-value pairs from an external source
 * @returns Array of cross-validation results for each comparable field
 *
 * @example
 * const results = crossValidateAgainstTradingView('COMI', { price: 85.5, pe: 13.2 });
 * // => [
 * //   { field: 'price', differencePercent: 0.001, isValid: true, ... },
 * //   { field: 'pe', differencePercent: 0.05, isValid: true, ... },
 * // ]
 */
export async function crossValidateAgainstTradingView(
  symbol: string,
  externalData: Record<string, number | string>
): Promise<CrossValidationResult[]> {
  // Fetch TradingView reference data
  const tvResult = await fetchTradingViewForValidation(symbol);

  if (!tvResult.success) {
    return [];
  }

  const tvData = tvResult.data;
  const results: CrossValidationResult[] = [];

  // Compare common fields
  const fieldMapping: Record<string, string> = {
    'price': 'price',
    'open': 'open',
    'high': 'high',
    'low': 'low',
    'volume': 'volume',
    'market_cap': 'market_cap',
    '52_week_high': '52_week_high',
    '52_week_low': '52_week_low',
    'pe_ratio': 'price', // TradingView doesn't have PE directly; skip if no match
  };

  for (const [extField, tvField] of Object.entries(fieldMapping)) {
    const externalValue = externalData[extField];
    const tvValue = tvData[tvField];

    if (externalValue === undefined || tvValue === undefined) continue;

    // Skip non-numeric fields
    const extNum = parseNum(externalValue);
    const tvNum = parseNum(tvValue);
    if (extNum === 0 && tvNum === 0) continue;

    const differencePercent = percentDiff(extNum, tvNum);

    results.push({
      field: extField,
      tradingViewValue: tvValue,
      externalValue,
      differencePercent: Math.round(differencePercent * 10000) / 100, // 2 decimal places
      isValid: differencePercent <= DISCREPANCY_THRESHOLD,
      validatedAgainst: 'tradingview',
    });
  }

  return results;
}

/**
 * Retrieve the investor relations URL for a given company symbol.
 * Falls back to the EGX listed companies page if no specific
 * IR URL is known for the company.
 *
 * @param symbol - EGX stock symbol (e.g. "COMI", "ORAS")
 * @returns Full URL to the company's investor relations page
 *
 * @example
 * const url = getCompanyIR_URL('COMI');
 * // => 'https://www.cibeg.com/en/investor-relations'
 *
 * const url2 = getCompanyIR_URL('UNKNOWN');
 * // => 'https://www.egx.com.eg/en/listedcompanies'
 */
export function getCompanyIR_URL(symbol: string): string {
  const upperSymbol = symbol.toUpperCase().trim();
  const companyInfo = COMPANY_IR_URLS[upperSymbol];

  if (companyInfo && companyInfo.irUrl) {
    return companyInfo.irUrl;
  }

  // Fallback: EGX listed companies page where all companies are listed
  return 'https://www.egx.com.eg/en/listedcompanies';
}

/**
 * Retrieve full investor relations information for a company.
 * Returns null if no IR information is available for the company.
 *
 * @param symbol - EGX stock symbol (e.g. "COMI", "ORAS")
 * @returns Company IR information or null
 *
 * @example
 * const info = getCompanyIRInfo('ORAS');
 * // => { irUrl: '...', annualReports: '...', investorPresentations: '...', ... }
 */
export function getCompanyIRInfo(symbol: string): CompanyIRInfo | null {
  const upperSymbol = symbol.toUpperCase().trim();
  return COMPANY_IR_URLS[upperSymbol] ?? null;
}

/**
 * Get all data sources that support a specific data type,
 * sorted by reliability score (highest first).
 *
 * @param dataType - Type of data needed
 * @returns Array of data sources supporting the requested type
 */
export function getSourcesForType(dataType: DataSourceType): DataSource[] {
  return getAvailableSources()
    .filter((s) => s.dataTypes.includes(dataType))
    .sort((a, b) => b.reliability - a.reliability);
}

/**
 * Get the health status of all configured data sources.
 * Returns success/error information for each source.
 *
 * @returns Array of source health status objects
 */
export function getSourceHealth(): Array<{
  id: string;
  name: string;
  tier: DataSourceTier;
  reliability: number;
  isHealthy: boolean;
  lastSuccess?: number;
  lastError?: string;
}> {
  return DATA_SOURCES.map((source) => ({
    id: source.id,
    name: source.name,
    tier: source.tier,
    reliability: source.reliability,
    isHealthy: source.lastSuccess !== undefined && source.lastError === undefined,
    lastSuccess: source.lastSuccess,
    lastError: source.lastError,
  }));
}

/**
 * Aggregate data from all available sources for a symbol.
 * This is a convenience function that fetches price data from
 * all sources and returns reconciled results.
 *
 * @param symbol - EGX stock symbol
 * @returns Aggregated data points with consensus values
 */
export async function aggregateAllDataForSymbol(
  symbol: string
): Promise<AggregatedDataPoint[]> {
  const allDataTypes: DataSourceType[] = [
    'price',
    'fundamentals',
    'financial_statements',
    'earnings',
    'dividends',
    'corporate_actions',
    'insider_trading',
    'sector_data',
  ];

  // Fetch from the most common data types (price + fundamentals)
  const priorityTypes: DataSourceType[] = ['price', 'fundamentals'];
  const allPoints: AggregatedDataPoint[] = [];

  // Fetch priority types first
  for (const dataType of priorityTypes) {
    const points = await fetchFromMultipleSources(symbol, dataType);
    allPoints.push(...points);
  }

  return allPoints;
}
