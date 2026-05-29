// ── Portfolio & Holdings Types ──────────────────────────────────

export interface Holding {
  id: string;
  symbol: string;
  name: string;
  shares: number;
  avgCost: number;
  purchaseDate: string;
  createdAt: string;
  updatedAt: string;
  currentPrice: number;
  marketValue: number;
  costBasis: number;
  pnl: number;
  pnlPercent: number;
  dayChange: number;
  dayChangePercent: number;
}

export interface PortfolioSummary {
  totalInvestment: number;
  totalMarketValue: number;
  totalPnL: number;
  totalPnLPercent: number;
  todaysChange: number;
  todaysChangePercent: number;
  numberOfHoldings: number;
  bestPerformer: { symbol: string; name: string; pnlPercent: number; pnl: number } | null;
  worstPerformer: { symbol: string; name: string; pnlPercent: number; pnl: number } | null;
}

export interface Transaction {
  id: string;
  holdingId: string;
  type: string;
  shares: number;
  price: number;
  total: number;
  date: string;
  notes: string | null;
  createdAt: string;
}

export type StoredHolding = Holding & {
  transactions: Transaction[];
};

export interface LocalProfile {
  id: string;
  label: string;
}

export interface StockOption {
  symbol: string;
  name: string;
  sector: string;
  currentPrice?: number;
  changePercent?: number;
  changeAbs?: number;
}

// ── Market Data Types ──────────────────────────────────────────

export interface IndexData {
  symbol: string;
  name: string;
  currentPrice: number;
  changePercent: number;
  changeAbs: number;
  open: number;
  high: number;
  low: number;
  volume: number;
  estimated?: boolean;
}

export interface StockPerformance {
  symbol: string;
  name: string;
  currentPrice: number;
  returns: Record<string, number>;
}

export interface GoldKaratData {
  price: number;
  high: number;
  low: number;
  change: number;
  changePercent?: number;
}

export interface SRLevel {
  price: number;
  type: 'support' | 'resistance';
  source: string;
  strength: number;
}

export interface PivotSet {
  pp: number; s1: number; s2: number; s3: number;
  r1: number; r2: number; r3: number;
}

export interface TechnicalAnalysisData {
  nearestSupport: SRLevel | null;
  nearestResistance: SRLevel | null;
  supports: SRLevel[];
  resistances: SRLevel[];
  ma: {
    sma20: number; sma50: number; sma100: number; sma200: number;
    ema20: number; ema50: number; ema100: number; ema200: number;
  };
  bb: { upper: number; lower: number; width: number };
  pivotsClassic: PivotSet;
  pivotsFibonacci: PivotSet;
  pivotsCamarilla: PivotSet;
  pivotsWoodie: PivotSet;
  week52High: number;
  week52Low: number;
  rsi: number;
  stochK: number;
  stochD: number;
  macd: number;
  macdSignal: number;
  macdHistogram: number;
  atr: number;
  rating: number;
  ratingMA: number;
  ratingOther: number;
  currentPrice: number;
  name: string;
  signal: 'Strong Buy' | 'Buy' | 'Neutral' | 'Sell' | 'Strong Sell';
}

export interface ExtrasData {
  usdEgp: {
    rate: number;
    changePercent: number;
    changeAbs: number;
    source: string;
    hasChangeData: boolean;
  };
  gold: {
    usdPrice: number;
    usdChangePercent: number;
    usdChangeAbs: number;
    perGram24kEgp: number;
    perGram21kEgp: number;
    perGram24kHigh: number;
    perGram24kLow: number;
    perGram21kHigh: number;
    perGram21kLow: number;
    perGram24kUsd: number;
    perGram21kUsd: number;
    changePercent: number;    // EGP gold change (from gold-price-live.com)
    changeAbs: number;       // EGP gold absolute change
    egpSource: string;
    karats: Record<string, GoldKaratData>;
    ounceEgp?: number;
    goldPoundEgp?: number;
    poundChangePercent?: number;
    poundChangeAbs?: number;
  };
  dataFreshness?: {
    scraped: boolean;
    tradingView: boolean;
    goldEgpSource: string;
    usdEgpLive: boolean;
    timestamp: string;
  };
  marketStatus?: {
    egx: 'live' | 'closed';
    gold: 'live' | 'closed';
    globalGold: 'live' | 'closed';
    forex: 'live' | 'closed';
  };
}

export interface PriceChange {
  changeAbs: number;
  changePercent: number;
}

// ── Sort Types ─────────────────────────────────────────────────

export type SortField = 'symbol' | 'marketValue' | 'pnl' | 'pnlPercent' | 'dayChange';
export type SortDir = 'asc' | 'desc';
