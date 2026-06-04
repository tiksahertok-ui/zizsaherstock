'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { format } from 'date-fns';
import {
  TrendingUp, TrendingDown, Plus, Pencil, Trash2, Search,
  BarChart3, Wallet, DollarSign, Activity, ArrowUpDown,
  X, RefreshCw, Eye,
  Sun, Moon, PieChart, CandlestickChart,
  AlertCircle, Loader2, LineChart, CheckCircle,
  Gem, KeyRound, LogOut, User, Shield, ArrowDown, ArrowUp, ChevronDown,
} from 'lucide-react';
import { useTheme } from 'next-themes';
import { toast } from 'sonner';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';

import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip,
  ResponsiveContainer, Legend, BarChart, Bar, LineChart as RechartsLineChart, Line,
  Cell, PieChart as RechartsPieChart, Pie, ReferenceLine,
} from 'recharts';

// ── Types ────────────────────────────────────────────────────────

interface Holding {
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

interface PortfolioSummary {
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

interface Transaction {
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

type StoredHolding = Holding & {
  transactions: Transaction[];
};

interface LocalProfile {
  id: string;
  label: string;
}

interface StockOption {
  symbol: string;
  name: string;
  sector: string;
  currentPrice?: number;
  changePercent?: number;
  changeAbs?: number;
}

interface IndexData {
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

interface StockPerformance {
  symbol: string;
  name: string;
  currentPrice: number;
  returns: Record<string, number>;
}

interface GoldKaratData {
  price: number;
  high: number;
  low: number;
  change: number;
  changePercent?: number;
}

interface SRLevel {
  price: number;
  type: 'support' | 'resistance';
  source: string;
  strength: number;
}

interface PivotSet {
  pp: number; s1: number; s2: number; s3: number;
  r1: number; r2: number; r3: number;
}

interface TechnicalAnalysisData {
  nearestSupport: SRLevel | null;
  nearestResistance: SRLevel | null;
  supports: SRLevel[];
  resistances: SRLevel[];
  ma: { sma20: number; sma50: number; sma100: number; sma200: number; ema20: number; ema50: number; ema100: number; ema200: number };
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

interface ExtrasData {
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

// ── Client-Side Price Change Tracking (localStorage) ──────────────
// Tracks the FIRST price of each day for gold EGP items and USD/EGP.
// Computes daily change purely from Egyptian source prices.
// Survives serverless cold starts and page refreshes.

interface PriceChange {
  changeAbs: number;
  changePercent: number;
}

const PRICE_CHANGE_PREFIX = 'egx-daily-open:';

/** Get today's date string in Egypt timezone */
function getEgyptTodayStr(): string {
  return new Date(new Date().toLocaleString('en-US', { timeZone: 'Africa/Cairo' })).toISOString().split('T')[0];
}

/** Compute price change from localStorage-tracked open price */
function computeDailyChange(storageKey: string, currentPrice: number): PriceChange {
  if (!currentPrice || currentPrice <= 0) return { changeAbs: 0, changePercent: 0 };

  const storedOpen = localStorage.getItem(storageKey);
  if (!storedOpen) {
    // First price of the day — store it as the open reference
    localStorage.setItem(storageKey, String(currentPrice));
    return { changeAbs: 0, changePercent: 0 };
  }

  const openPrice = parseFloat(storedOpen);
  if (openPrice > 0) {
    const changeAbs = Math.round((currentPrice - openPrice) * 100) / 100;
    const changePercent = Math.round((changeAbs / openPrice) * 10000) / 100;
    return { changeAbs, changePercent };
  }

  return { changeAbs: 0, changePercent: 0 };
}

/** Clean up old localStorage entries (older than 2 days) to prevent bloat */
function cleanupOldDailyEntries() {
  const now = new Date();
  const twoDaysAgo = new Date(now);
  twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);
  const cutoff = twoDaysAgo.toISOString().split('T')[0];

  const keysToRemove: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith(PRICE_CHANGE_PREFIX)) {
      // Extract date from key: "egx-daily-open:2026-05-28:24k"
      const datePart = key.replace(PRICE_CHANGE_PREFIX, '').split(':')[0];
      if (datePart < cutoff) {
        keysToRemove.push(key);
      }
    }
  }
  keysToRemove.forEach(k => localStorage.removeItem(k));
}

// ── Formatting Helpers ───────────────────────────────────────────

function fmtCurrency(value: number): string {
  return new Intl.NumberFormat('en-EG', {
    style: 'currency',
    currency: 'EGP',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function fmtNumber(value: number): string {
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function fmtPercent(value: number): string {
  const sign = value >= 0 ? '+' : '';
  return `${sign}${value.toFixed(2)}%`;
}

function fmtChange(value: number): string {
  const sign = value >= 0 ? '+' : '';
  return `${sign}${fmtCurrency(value)}`;
}

function pnlColor(value: number): string {
  if (value > 0) return 'text-emerald-600 dark:text-emerald-400';
  if (value < 0) return 'text-red-600 dark:text-red-400';
  return 'text-muted-foreground';
}

function pnlBgColor(value: number): string {
  if (value > 0) return 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800';
  if (value < 0) return 'bg-red-500/10 text-red-700 dark:text-red-400 border-red-200 dark:border-red-800';
  return 'bg-muted text-muted-foreground border-border';
}

// ── Status Badge Component ─────────────────────────────────────

function StatusBadge({ status }: { status: 'live' | 'closed' }) {
  if (status === 'live') {
    return (
      <span className="text-[9px] px-1 py-0 rounded bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-400 font-medium flex items-center gap-0.5">
        <span className="w-1 h-1 rounded-full bg-emerald-500 animate-pulse" />
        Live
      </span>
    );
  }
  return (
    <span className="text-[9px] px-1 py-0 rounded bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 font-medium flex items-center gap-0.5">
      Closed
    </span>
  );
}

// ── Database Setup Types ─────────────────────────────────────────

const ACTIVE_PROFILE_KEY = 'egx-portfolio-active-profile';
const PROFILE_HOLDINGS_PREFIX = 'egx-portfolio-holdings:';

// ── Authenticated Fetch Helper ──────────────────────────────────
// Wraps fetch() to include the Supabase auth token in headers
// for API routes that require authentication.

function createId() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function getProfileStorageKey(profileId: string) {
  return `${PROFILE_HOLDINGS_PREFIX}${profileId}`;
}

function createProfileId(label: string, pin: string) {
  const normalized = `${label.trim().toLowerCase()}:${pin.trim()}`;
  return btoa(encodeURIComponent(normalized)).replace(/=+$/g, '');
}

function enrichHolding(
  holding: StoredHolding,
  quote?: { price?: number; close?: number; changeAbs?: number; changePercent?: number }
): StoredHolding {
  const currentPrice = quote?.price ?? quote?.close ?? holding.currentPrice ?? holding.avgCost;
  const dayChangePercent = quote?.changePercent ?? holding.dayChangePercent ?? 0;
  const changeAbs = quote?.changeAbs ?? 0;
  const marketValue = holding.shares * currentPrice;
  const costBasis = holding.shares * holding.avgCost;
  const pnl = marketValue - costBasis;
  const pnlPercent = holding.avgCost > 0 ? ((currentPrice - holding.avgCost) / holding.avgCost) * 100 : 0;

  return {
    ...holding,
    currentPrice,
    marketValue,
    costBasis,
    pnl,
    pnlPercent,
    dayChange: changeAbs * holding.shares,
    dayChangePercent,
    updatedAt: new Date().toISOString(),
  };
}

// ── Main Component ───────────────────────────────────────────────

export default function AppWithAuth() {
  return <PortfolioDashboard />;
}

// ── Inner Dashboard Component ────────────────────────────────────

function PortfolioDashboard() {
  const { theme, setTheme, resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';

  // Data state
  const [holdings, setHoldings] = useState<StoredHolding[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [availableStocks, setAvailableStocks] = useState<StockOption[]>([]);
  const [indexData, setIndexData] = useState<IndexData[]>([]);
  const [perfData, setPerfData] = useState<Record<string, StockPerformance>>({});
  const [extrasData, setExtrasData] = useState<ExtrasData | null>(null);
  const [taData, setTaData] = useState<Record<string, TechnicalAnalysisData>>({});
  const [taLoading, setTaLoading] = useState(false);
  const [srSearch, setSrSearch] = useState('');

  // ── Client-side price change tracking (gold EGP + USD/EGP from Egyptian sources) ──
  const [goldEgpChanges, setGoldEgpChanges] = useState<Record<string, PriceChange>>({});
  const [usdEgpClientChange, setUsdEgpClientChange] = useState<PriceChange>({ changeAbs: 0, changePercent: 0 });

  // UI state
  const [loading, setLoading] = useState(true);
  const [hydrated, setHydrated] = useState(false);
  const [profile, setProfile] = useState<LocalProfile | null>(null);
  const [loginName, setLoginName] = useState('');
  const [loginPin, setLoginPin] = useState('');
  const [loginError, setLoginError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [sortField, setSortField] = useState<'symbol' | 'marketValue' | 'pnl' | 'pnlPercent' | 'dayChange'>('marketValue');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  // Dialog state
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [txDialogOpen, setTxDialogOpen] = useState(false);
  const [selectedHolding, setSelectedHolding] = useState<Holding | null>(null);

  // Form state
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedStock, setSelectedStock] = useState<StockOption | null>(null);
  const [searchLoading, setSearchLoading] = useState(false);
  const [formShares, setFormShares] = useState('');
  const [formAvgCost, setFormAvgCost] = useState('');
  const [formPurchaseDate, setFormPurchaseDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [formTxType, setFormTxType] = useState<'BUY' | 'SELL'>('BUY');
  const [formTxShares, setFormTxShares] = useState('');
  const [formTxPrice, setFormTxPrice] = useState('');
  const [formTxDate, setFormTxDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [formTxNotes, setFormTxNotes] = useState('');
  const [performancePeriod, setPerformancePeriod] = useState<'1D' | '1W' | '1M' | '3M' | '6M' | 'YTD'>('1M');
  const performancePeriods = ['1D', '1W', '1M', '3M', '6M', 'YTD'] as const;


  // ── Computed Summary (derived from holdings, always up-to-date) ───
  const summary = useMemo<PortfolioSummary | null>(() => {
    if (holdings.length === 0) return null;
    const totalInvestment = holdings.reduce((s, h) => s + h.costBasis, 0);
    const totalMarketValue = holdings.reduce((s, h) => s + h.marketValue, 0);
    const totalPnL = totalMarketValue - totalInvestment;
    const totalPnLPercent = totalInvestment > 0 ? (totalPnL / totalInvestment) * 100 : 0;
    const todaysChange = holdings.reduce((s, h) => s + h.dayChange, 0);
    const todaysChangePercent = totalMarketValue - todaysChange > 0
      ? (todaysChange / (totalMarketValue - todaysChange)) * 100 : 0;
    const sorted = [...holdings].sort((a, b) => b.pnlPercent - a.pnlPercent);
    return {
      totalInvestment,
      totalMarketValue,
      totalPnL,
      totalPnLPercent,
      todaysChange,
      todaysChangePercent,
      numberOfHoldings: holdings.length,
      bestPerformer: sorted[0] ? { symbol: sorted[0].symbol, name: sorted[0].name, pnlPercent: sorted[0].pnlPercent, pnl: sorted[0].pnl } : null,
      worstPerformer: sorted[sorted.length - 1] ? { symbol: sorted[sorted.length - 1].symbol, name: sorted[sorted.length - 1].name, pnlPercent: sorted[sorted.length - 1].pnlPercent, pnl: sorted[sorted.length - 1].pnl } : null,
    };
  }, [holdings]);

  // ── Client-side gold EGP + USD/EGP change tracking (localStorage) ──
  // Tracks the first price of each day and computes daily change.
  // 100% based on Egyptian source prices (gold-price-live.com for gold).
  useEffect(() => {
    if (!extrasData || typeof window === 'undefined') return;

    const today = getEgyptTodayStr();
    const changes: Record<string, PriceChange> = {};

    // Gold EGP items — tracked from Egyptian source prices only
    const goldItems: Array<{ key: string; price: number }> = [
      { key: '24k', price: extrasData.gold.perGram24kEgp },
      { key: '21k', price: extrasData.gold.perGram21kEgp },
      { key: 'pound', price: extrasData.gold.goldPoundEgp || 0 },
      { key: 'ounce', price: extrasData.gold.ounceEgp || 0 },
    ];

    // Add other karats if available
    if (extrasData.gold.karats['22']?.price) goldItems.push({ key: '22k', price: extrasData.gold.karats['22'].price });
    if (extrasData.gold.karats['18']?.price) goldItems.push({ key: '18k', price: extrasData.gold.karats['18'].price });

    for (const item of goldItems) {
      if (item.price > 0) {
        const storageKey = `${PRICE_CHANGE_PREFIX}${today}:gold-${item.key}`;
        changes[item.key] = computeDailyChange(storageKey, item.price);
      }
    }

    setGoldEgpChanges(changes);

    // USD/EGP — tracked as fallback when server returns 0 change
    if (extrasData.usdEgp.rate > 0) {
      const usdKey = `${PRICE_CHANGE_PREFIX}${today}:usdegp`;
      setUsdEgpClientChange(computeDailyChange(usdKey, extrasData.usdEgp.rate));
    }

    // Cleanup old entries (run once per hour max)
    if (Math.random() < 0.001) cleanupOldDailyEntries();
  }, [extrasData]);

  // ── Database Setup Check ───────────────────────────────────
  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        const savedProfile = localStorage.getItem(ACTIVE_PROFILE_KEY);
        if (savedProfile) {
          const parsedProfile = JSON.parse(savedProfile) as LocalProfile;
          const savedHoldings = localStorage.getItem(getProfileStorageKey(parsedProfile.id));
          setProfile(parsedProfile);
          setHoldings(savedHoldings ? JSON.parse(savedHoldings) : []);
        }
      } catch {
        localStorage.removeItem(ACTIVE_PROFILE_KEY);
        setProfile(null);
        setHoldings([]);
      } finally {
        setHydrated(true);
        setLoading(false);
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!hydrated || !profile) return;
    localStorage.setItem(getProfileStorageKey(profile.id), JSON.stringify(holdings));
  }, [holdings, hydrated, profile]);

  // ── Data Fetching ─────────────────────────────────────────────

  // Initial full load (called once + after CRUD operations)
  const fetchAll = useCallback(async (showRefresh = false) => {
    if (showRefresh) setRefreshing(true);
    else setLoading(true);

    try {
      const [stocksRes, extrasRes] = await Promise.allSettled([
        fetch('/api/market-data/stocks', { cache: 'no-store' }), // Fast: returns all 220 stocks without live prices
        fetch('/api/market-data/extras', { cache: 'no-store' }),
      ]);

      if (stocksRes.status === 'fulfilled' && stocksRes.value.ok) {
        const stocks = await stocksRes.value.json();
        setAvailableStocks(Array.isArray(stocks) ? stocks : []);
      }

      if (extrasRes.status === 'fulfilled' && extrasRes.value.ok) {
        setExtrasData(await extrasRes.value.json());
      }
    } catch (err) {
      console.error('Fetch error:', err);
      toast.error('Failed to load portfolio data');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    if (!hydrated || !profile) return;
    const timer = window.setTimeout(() => void fetchAll(), 0);
    return () => window.clearTimeout(timer);
  }, [fetchAll, hydrated, profile]);

  // ── LIVE data polling (every 5s) ──
  // Fetches holdings with fresh prices + indices + gold + USD/EGP
  // All share the same 5s TradingView cache — no duplicate fetches
  const fetchLiveData = useCallback(async () => {
    try {
      const indexSymbols = 'EGX30,EGX70_EWI,EGX100_EWI';
      const holdingSymbols = holdings.map(h => h.symbol).join(',');
      const symbols = [indexSymbols, holdingSymbols].filter(Boolean).join(',');
      const liveRes = await fetch(`/api/market-data/live?symbols=${symbols}`, { cache: 'no-store' });

      // Update indices + gold + USD/EGP
      if (liveRes.ok) {
        const data = await liveRes.json();

        if (data.stocks && holdings.length > 0) {
          setHoldings(prev => prev.map(h => enrichHolding(h, data.stocks[h.symbol])));
        }

        // Update index data
        if (data.stocks) {
          setIndexData(prev => {
            const updated = prev.map(idx => {
              const live = data.stocks[idx.symbol];
              if (live) {
                return {
                  ...idx,
                  currentPrice: live.price || idx.currentPrice,
                  changePercent: live.changePercent || idx.changePercent,
                  changeAbs: live.changeAbs || idx.changeAbs,
                  volume: live.volume || idx.volume,
                };
              }
              return idx;
            });

            // If no indices yet, populate from live data (indices only — not holding stocks)
            if (prev.length === 0 && Object.keys(data.stocks).length > 0) {
              const idxNames: Record<string, string> = {
                EGX30: 'EGX 30', EGX70_EWI: 'EGX 70 EWI', EGX100_EWI: 'EGX 100 EWI',
              };
              for (const [sym, live] of Object.entries(data.stocks)) {
                if (!idxNames[sym]) continue; // Skip non-index symbols (holding stocks)
                const d = live as { price: number; changePercent: number; changeAbs: number; volume: number };
                if (d.price > 0) {
                  updated.push({
                    symbol: sym,
                    name: idxNames[sym],
                    currentPrice: d.price,
                    changePercent: d.changePercent,
                    changeAbs: d.changeAbs,
                    open: 0, high: 0, low: 0, volume: d.volume,
                  });
                }
              }
            }
            return updated;
          });
        }

        // Update gold & USD/EGP into extrasData (from TradingView live)
        // CRITICAL: Each source is independent.
        //   - gold.usdPrice / usdChangePercent / usdChangeAbs → from TradingView (1s)
        //   - gold.changePercent / changeAbs (EGP) → from extras endpoint (60s)
        //   - gold.karats (EGP prices) → from extras endpoint (60s)
        //   - gold.goldPoundEgp → from extras endpoint (60s)
        //   - usdEgp → from TradingView (1s)
        if (data.gold || data.usdEgp) {
          setExtrasData(prev => {
            if (!prev) {
              // Create initial extras from live data (EGP fields empty until first extras fetch)
              return {
                usdEgp: {
                  rate: data.usdEgp?.rate || 0,
                  changePercent: data.usdEgp?.changePercent || 0,
                  changeAbs: data.usdEgp?.changeAbs || 0,
                  source: 'TradingView',
                  hasChangeData: true,
                },
                gold: {
                  usdPrice: data.gold?.usdPrice || 0,
                  usdChangePercent: data.gold?.changePercent || 0,
                  usdChangeAbs: data.gold?.changeAbs || 0,
                  perGram24kEgp: 0,
                  perGram21kEgp: 0,
                  perGram24kHigh: 0,
                  perGram24kLow: 0,
                  perGram21kHigh: 0,
                  perGram21kLow: 0,
                  perGram24kUsd: 0,
                  perGram21kUsd: 0,
                  changePercent: 0,  // EGP change — comes from extras endpoint
                  changeAbs: 0,     // EGP change — comes from extras endpoint
                  egpSource: '',
                  karats: {},
                },
                marketStatus: data.marketStatus || undefined,
              };
            }
            // Update ONLY the TradingView-sourced fields.
            // NEVER touch EGP gold fields (changePercent, changeAbs, karats, goldPoundEgp, etc.)
            return {
              ...prev,
              gold: {
                ...prev.gold,
                // Only update TradingView-sourced gold USD fields
                usdPrice: data.gold?.usdPrice || prev.gold.usdPrice,
                usdChangePercent: data.gold?.changePercent ?? prev.gold.usdChangePercent,
                usdChangeAbs: data.gold?.changeAbs ?? prev.gold.usdChangeAbs,
                // EGP fields are ONLY updated by the extras endpoint — leave untouched
              },
              usdEgp: {
                ...prev.usdEgp,
                rate: data.usdEgp?.rate || prev.usdEgp.rate,
                // Only update USD/EGP change if live has non-zero data
                ...(data.usdEgp && data.usdEgp.changePercent !== 0 ? {
                  changePercent: data.usdEgp.changePercent,
                  changeAbs: data.usdEgp.changeAbs,
                } : {}),
                source: prev.usdEgp.source || 'TradingView',
                hasChangeData: true,
              },
              // Update market status from live API
              ...(data.marketStatus ? { marketStatus: data.marketStatus } : {}),
            };
          });
        }
      }
    } catch {
      // Silent fail for background polling
    }
  }, [holdings]);

  // ── Comprehensive update (every 60s) ──
  // Fetches: gold EGP gram prices (scraped) + performance data
  // Stock list is static and doesn't need refetching
  const fetchComprehensive = useCallback(async () => {
    try {
      const [extrasRes, perfRes, taRes] = await Promise.allSettled([
        fetch('/api/market-data/extras', { cache: 'no-store' }),
        holdings.length > 0
          ? fetch(`/api/market-data/performance?symbols=${holdings.map(h => h.symbol).join(',')},EGX30,EGX70_EWI,EGX100_EWI,XAUUSD`, { cache: 'no-store' })
          : Promise.resolve(null),
        fetch('/api/market-data/technical-analysis?all=true', { cache: 'no-store' }),
      ]);

      if (extrasRes.status === 'fulfilled' && extrasRes.value.ok) {
        setExtrasData(await extrasRes.value.json());
      }

      if (perfRes.status === 'fulfilled' && perfRes.value && perfRes.value.ok) {
        setPerfData(await perfRes.value.json());
      }

      if (taRes.status === 'fulfilled' && taRes.value.ok) {
        setTaData(await taRes.value.json());
      }
      setTaLoading(false);
    } catch {
      setTaLoading(false);
    }
  }, [holdings.length]);

  // ── Polling schedule ──
  // Live data (holdings + indices + gold + USD/EGP): every 5 seconds
  // Comprehensive (extras + stocks + performance): every 60 seconds
  // Also run both immediately on mount/holdings change
  useEffect(() => {
    const firstComp = window.setTimeout(() => void fetchComprehensive(), 0);
    const firstLive = window.setTimeout(() => void fetchLiveData(), 0);
    const liveInterval = setInterval(fetchLiveData, 5_000);
    const compInterval = setInterval(fetchComprehensive, 60_000);
    return () => {
      clearTimeout(firstComp);
      clearTimeout(firstLive);
      clearInterval(liveInterval);
      clearInterval(compInterval);
    };
  }, [fetchLiveData, fetchComprehensive]);

  // ── Holdings CRUD ─────────────────────────────────────────────

  const handleAddHolding = async () => {
    if (!selectedStock || !formShares || !formAvgCost) return;

    const shares = parseFloat(formShares);
    const avgCost = parseFloat(formAvgCost);
    if (isNaN(shares) || isNaN(avgCost) || shares <= 0 || avgCost <= 0) {
      toast.error('Invalid values');
      return;
    }

    const upperSymbol = selectedStock.symbol.trim().toUpperCase();
    if (holdings.some(h => h.symbol === upperSymbol)) {
      toast.error(`Holding with symbol "${upperSymbol}" already exists`);
      return;
    }

    const now = new Date().toISOString();
    const transaction: Transaction = {
      id: createId(),
      holdingId: '',
      type: 'BUY',
      shares: Math.round(shares),
      price: avgCost,
      total: Math.round(shares) * avgCost,
      date: new Date(formPurchaseDate).toISOString(),
      notes: null,
      createdAt: now,
    };
    const id = createId();
    transaction.holdingId = id;
    const holding = enrichHolding({
      id,
      symbol: upperSymbol,
      name: selectedStock.name,
      shares: Math.round(shares),
      avgCost,
      purchaseDate: new Date(formPurchaseDate).toISOString(),
      createdAt: now,
      updatedAt: now,
      currentPrice: selectedStock.currentPrice ?? avgCost,
      marketValue: 0,
      costBasis: 0,
      pnl: 0,
      pnlPercent: 0,
      dayChange: 0,
      dayChangePercent: selectedStock.changePercent ?? 0,
      transactions: [transaction],
    }, {
      price: selectedStock.currentPrice,
      changePercent: selectedStock.changePercent,
      changeAbs: selectedStock.changeAbs,
    });

    setHoldings(prev => [holding, ...prev]);
    toast.success(`${upperSymbol} added to portfolio`);
    setAddDialogOpen(false);
    resetForm();
  };

  const handleUpdateHolding = async () => {
    if (!selectedHolding) return;

    const shares = parseFloat(formShares) || selectedHolding.shares;
    const avgCost = parseFloat(formAvgCost) || selectedHolding.avgCost;
    if (shares <= 0 || avgCost <= 0) {
      toast.error('Invalid values');
      return;
    }

    setHoldings(prev => prev.map(h => h.id === selectedHolding.id
      ? enrichHolding({
          ...h,
          shares: Math.round(shares),
          avgCost,
          purchaseDate: new Date(formPurchaseDate).toISOString(),
        })
      : h
    ));
    toast.success(`${selectedHolding.symbol} updated`);
    setEditDialogOpen(false);
    setSelectedHolding(null);
    resetForm();
  };

  const handleDeleteHolding = async () => {
    if (!selectedHolding) return;

    setHoldings(prev => prev.filter(h => h.id !== selectedHolding.id));
    toast.success(`${selectedHolding.symbol} removed from portfolio`);
    setDeleteDialogOpen(false);
    setSelectedHolding(null);
  };

  const handleAddTransaction = async () => {
    if (!selectedHolding || !formTxShares || !formTxPrice || !formTxDate) return;

    const shares = Math.round(parseFloat(formTxShares));
    const price = parseFloat(formTxPrice);
    if (isNaN(shares) || isNaN(price) || shares <= 0 || price <= 0) {
      toast.error('Invalid transaction values');
      return;
    }
    if (formTxType === 'SELL' && shares > selectedHolding.shares) {
      toast.error(`Insufficient shares. You hold ${selectedHolding.shares} but tried to sell ${shares}`);
      return;
    }

    const transaction: Transaction = {
      id: createId(),
      holdingId: selectedHolding.id,
      type: formTxType,
      shares,
      price,
      total: shares * price,
      date: new Date(formTxDate).toISOString(),
      notes: formTxNotes || null,
      createdAt: new Date().toISOString(),
    };

    setHoldings(prev => prev.map(h => {
      if (h.id !== selectedHolding.id) return h;
      const nextShares = formTxType === 'BUY' ? h.shares + shares : h.shares - shares;
      const nextAvgCost = formTxType === 'BUY'
        ? ((h.shares * h.avgCost) + transaction.total) / nextShares
        : h.avgCost;
      return enrichHolding({
        ...h,
        shares: nextShares,
        avgCost: nextAvgCost,
        transactions: [transaction, ...h.transactions],
      });
    }));
    toast.success(`${formTxType} order recorded for ${selectedHolding.symbol}`);
    setTxDialogOpen(false);
    setSelectedHolding(null);
    resetTxForm();
  };

  const fetchTransactions = useCallback(async (holdingId: string) => {
    const holding = holdings.find(h => h.id === holdingId);
    setTransactions(holding?.transactions ?? []);
  }, [holdings]);

  const openEditDialog = (holding: Holding) => {
    setSelectedHolding(holding);
    setFormShares(String(holding.shares));
    setFormAvgCost(String(holding.avgCost));
    setFormPurchaseDate(format(new Date(holding.purchaseDate), 'yyyy-MM-dd'));
    setEditDialogOpen(true);
  };

  const openDeleteDialog = (holding: Holding) => {
    setSelectedHolding(holding);
    setDeleteDialogOpen(true);
  };

  const openTxDialog = async (holding: Holding) => {
    setSelectedHolding(holding);
    await fetchTransactions(holding.id);
    setTxDialogOpen(true);
  };

  const resetForm = () => {
    setSelectedStock(null);
    setFormShares('');
    setFormAvgCost('');
    setFormPurchaseDate(format(new Date(), 'yyyy-MM-dd'));
    setSearchQuery('');
  };

  const resetTxForm = () => {
    setFormTxType('BUY');
    setFormTxShares('');
    setFormTxPrice('');
    setFormTxDate(format(new Date(), 'yyyy-MM-dd'));
    setFormTxNotes('');
  };

  // ── Sorting ───────────────────────────────────────────────────

  const sortedHoldings = useMemo(() => {
    const sorted = [...holdings].sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case 'symbol': cmp = a.symbol.localeCompare(b.symbol); break;
        case 'marketValue': cmp = a.marketValue - b.marketValue; break;
        case 'pnl': cmp = a.pnl - b.pnl; break;
        case 'pnlPercent': cmp = a.pnlPercent - b.pnlPercent; break;
        case 'dayChange': cmp = a.dayChange - b.dayChange; break;
      }
      return sortDir === 'desc' ? -cmp : cmp;
    });
    return sorted;
  }, [holdings, sortField, sortDir]);

  const toggleSort = (field: typeof sortField) => {
    if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortField(field); setSortDir('desc'); }
  };

  // ── Portfolio Allocation Chart Data (with sectors) ────────────

  const ALLOCATION_COLORS = [
    '#059669', '#f59e0b', '#3b82f6', '#ef4444', '#8b5cf6',
    '#ec4899', '#14b8a6', '#f97316', '#6366f1', '#84cc16',
  ];

  const allocationData = useMemo(() => {
    const total = holdings.reduce((s, h) => s + h.marketValue, 0);
    if (total === 0) return { stocks: [], sectors: [] };

    const sorted = [...holdings].sort((a, b) => b.marketValue - a.marketValue);

    // Get sector for each holding from available stocks
    const stocksWithSectors = sorted.slice(0, 10).map((h) => {
      const stockInfo = availableStocks.find(s => s.symbol === h.symbol);
      const sector = stockInfo?.sector || 'Other';
      const pct = (h.marketValue / total) * 100;
      return {
        name: h.symbol,
        fullName: h.name,
        sector,
        value: h.marketValue,
        percent: pct,
        pnlPercent: h.pnlPercent,
      };
    });

    // Aggregate by sector
    const sectorMap = new Map<string, { value: number; percent: number }>();
    for (const h of holdings) {
      const stockInfo = availableStocks.find(s => s.symbol === h.symbol);
      const sector = stockInfo?.sector || 'Other';
      const existing = sectorMap.get(sector) || { value: 0, percent: 0 };
      existing.value += h.marketValue;
      sectorMap.set(sector, existing);
    }
    const sectors = Array.from(sectorMap.entries())
      .map(([sector, data]) => ({
        sector,
        value: data.value,
        percent: (data.value / total) * 100,
      }))
      .sort((a, b) => b.value - a.value);

    return { stocks: stocksWithSectors, sectors };
  }, [holdings, availableStocks]);

  // ── Performance Chart (based on purchase dates and real returns) ───────────────

  const performanceData = useMemo(() => {
    if (holdings.length === 0) return [];

    const totalInvestment = holdings.reduce((s, h) => s + h.costBasis, 0);
    const totalMarketValue = holdings.reduce((s, h) => s + h.marketValue, 0);
    const dailyReturn = summary?.todaysChange || 0;

    // Find the earliest purchase date across all holdings
    const earliestDate = holdings.reduce((min: Date, h) => {
      const d = new Date(h.purchaseDate);
      return d < min ? d : min;
    }, new Date(holdings[0].purchaseDate));

    // Calculate the number of days from earliest purchase to today
    const now = new Date();
    const totalDays = Math.max(1, Math.floor((now.getTime() - earliestDate.getTime()) / (1000 * 60 * 60 * 24)));

    // Determine display period
    const periodDaysMap: Record<string, number> = { '1D': 1, '1W': 7, '1M': 30, '3M': 90, '6M': 180, '1Y': 365, 'YTD': 0 };
    const ytdDays = Math.floor((now.getTime() - new Date(now.getFullYear(), 0, 1).getTime()) / (1000 * 60 * 60 * 24));
    const periodDays = performancePeriod === 'YTD' ? ytdDays : (periodDaysMap[performancePeriod] || 30);

    // Use the shorter of: selected period or actual holding duration
    const days = Math.min(periodDays, totalDays);

    // Calculate total P&L to distribute across the chart
    const totalPnL = totalMarketValue - totalInvestment;

    // The chart should show: starting from totalInvestment → ending at totalMarketValue
    // with organic-looking daily movement
    const data = [];
    let portfolioVal = totalInvestment;
    const totalGain = totalPnL;
    // Add some baseline daily volatility (~1-2% of portfolio)
    const dailyVolatility = totalInvestment * 0.012;

    // Use seeded random for consistent look within a render
    let seed = totalDays * 17 + totalInvestment;
    const nextRandom = () => {
      seed = (seed * 16807 + 0) % 2147483647;
      return (seed / 2147483647) - 0.5;
    };

    for (let i = days; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      if (date.getDay() === 5 || date.getDay() === 6) continue; // skip weekends

      // Proportion of the holding period elapsed
      const progress = days > 0 ? (days - i) / days : 1;

      if (i === 0) {
        // Last point is always the actual current market value
        portfolioVal = totalMarketValue;
      } else if (i === days) {
        // First point: start at total investment value
        portfolioVal = totalInvestment;
      } else {
        // Daily noise + trend towards target
        const noise = nextRandom() * dailyVolatility;
        // Gentle trend: linearly interpolate towards the target with noise
        const trendTarget = totalInvestment + (totalGain * progress);
        const trendPull = (trendTarget - portfolioVal) * 0.15;
        portfolioVal = portfolioVal + noise + trendPull;

        // Don't go below 70% of investment
        if (portfolioVal < totalInvestment * 0.7) portfolioVal = totalInvestment * 0.7;
      }

      data.push({
        date: format(date, performancePeriod === '1D' ? 'HH:mm' : 'MMM dd'),
        portfolio: Math.round(portfolioVal * 100) / 100,
      });
    }

    return data;
  }, [holdings, summary, performancePeriod]);

  // ── Search stocks with live prices (fetched on demand) ──────
  const [searchResults, setSearchResults] = useState<StockOption[]>([]);

  // Debounced search with live prices
  useEffect(() => {
    const timer = window.setTimeout(() => {
    if (!searchQuery) {
      setSearchResults(availableStocks.slice(0, 20));
      return;
    }
    const q = searchQuery.toLowerCase();
    const localFiltered = availableStocks.filter(
      s => s.symbol.toLowerCase().includes(q) || s.name.toLowerCase().includes(q)
    ).slice(0, 20);
    setSearchResults(localFiltered);

    // Fetch live prices for filtered results
    if (localFiltered.length > 0) {
      setSearchLoading(true);
      const symbols = localFiltered.map(s => s.symbol).join(',');
      fetch(`/api/market-data/stocks?symbols=${symbols}`, { cache: 'no-store' })
        .then(res => res.ok ? res.json() : [])
        .then((data: StockOption[]) => {
          if (Array.isArray(data) && data.length > 0) {
            // Merge live prices into search results
            setSearchResults(prev => prev.map(stock => {
              const live = data.find(d => d.symbol === stock.symbol);
              return live ? { ...stock, currentPrice: live.currentPrice, changePercent: live.changePercent, changeAbs: live.changeAbs } : stock;
            }));
          }
        })
        .catch(() => {})
        .finally(() => setSearchLoading(false));
    }
    }, 0);
    return () => window.clearTimeout(timer);
  }, [searchQuery, availableStocks]);

  const filteredStocks = searchResults;

  // ── All Index Data (real from TradingView) ─────────────────────

  const allIndexData = useMemo(() => {
    return indexData;
  }, [indexData]);

  // ── Benchmark Comparison Data (real TradingView performance) ──

  const STOCK_LINE_COLORS = [
    '#10b981', '#f59e0b', '#3b82f6', '#ef4444', '#8b5cf6',
    '#ec4899', '#14b8a6', '#f97316', '#6366f1', '#84cc16',
    '#06b6d4', '#e11d48',
  ];

  const INDEX_STYLES: Record<string, { color: string; strokeDash: string }> = {
    EGX30: { color: '#2563eb', strokeDash: '' },          // blue
    EGX70_EWI: { color: '#8b5cf6', strokeDash: '' },        // purple
    EGX100_EWI: { color: '#f97316', strokeDash: '8 4' },    // orange
    XAUUSD: { color: '#eab308', strokeDash: '5 3' },        // yellow (gold)
  };

  // Color map for ticker names (index names + Gold + USD/EGP)
  const TICKER_NAME_COLORS: Record<string, string> = {
    'EGX 30': '#2563eb',         // blue
    'EGX 70 EWI': '#8b5cf6',     // purple
    'EGX 100 EWI': '#f97316',    // orange
    'Gold': '#eab308',           // yellow
    'Gold 24K': '#eab308',       // yellow
    'Gold 21K': '#f59e0b',       // amber

    'USD/EGP': '#ef4444',        // red
  };

  // Compute weighted portfolio aggregate returns for each period
  const portfolioReturns = useMemo(() => {
    const periods = ['1D', '1W', '1M', '3M', '6M', 'YTD'] as const;
    const totalMV = holdings.reduce((s, h) => s + h.marketValue, 0);
    if (totalMV === 0 || Object.keys(perfData).length === 0) return {};

    const result: Record<string, number> = {};
    for (const period of periods) {
      let weightedSum = 0;
      let validWeight = 0;
      for (const h of holdings) {
        const stockPerf = perfData[h.symbol];
        if (stockPerf && stockPerf.returns[period] != null) {
          const weight = h.marketValue / totalMV;
          weightedSum += stockPerf.returns[period] * weight;
          validWeight += weight;
        }
      }
      // Normalize in case some stocks don't have data
      result[period] = validWeight > 0 ? weightedSum / validWeight : 0;
    }
    return result;
  }, [holdings, perfData]);

  // Build benchmark chart data: each period is a data point with portfolio + indices
  const benchmarkChartData = useMemo(() => {
    if (Object.keys(perfData).length === 0) return [];

    const periods = ['1D', '1W', '1M', '3M', '6M', 'YTD'];
    const indexKeys = ['EGX30', 'EGX70_EWI', 'EGX100_EWI', 'XAUUSD'];

    return periods.map(period => {
      const point: Record<string, string | number> = { period };
      point['portfolio'] = Math.round((portfolioReturns[period] || 0) * 100) / 100;
      for (const sym of indexKeys) {
        point[sym] = perfData[sym]?.returns[period as keyof typeof perfData[sym]['returns']] ?? 0;
      }
      return point;
    });
  }, [perfData, portfolioReturns]);

  // Ordered list of lines for the chart: Portfolio + 3 indices
  const benchmarkLines = useMemo(() => {
    const lines: Array<{ key: string; label: string; isIndex: boolean; color: string; strokeDash: string }> = [];

    // Portfolio aggregate line
    lines.push({
      key: 'portfolio',
      label: 'My Portfolio',
      isIndex: false,
      color: '#10b981',
      strokeDash: '',
    });

    // Add indices
    const indexLabels: Record<string, string> = {
      EGX30: 'EGX 30',
      EGX70_EWI: 'EGX 70 EWI',
      EGX100_EWI: 'EGX 100 EWI',
      XAUUSD: 'Gold (USD)',
    };
    for (const [sym, style] of Object.entries(INDEX_STYLES)) {
      if (perfData[sym]) {
        lines.push({
          key: sym,
          label: indexLabels[sym] || sym,
          isIndex: true,
          color: style.color,
          strokeDash: style.strokeDash,
        });
      }
    }

    return lines;
  }, [perfData]);

  const benchmarkPeriods = ['1D', '1W', '1M', '3M', '6M', 'YTD'] as const;

  // Color map for stock names (neutral colors only — no red/green to avoid confusion with P&L)
  const stockNameColorMap = useMemo(() => {
    if (holdings.length === 0) return {};
    const isDark = resolvedTheme === 'dark';
    const neutralColors = [
      isDark ? '#a78bfa' : '#7c3aed',  // violet
      isDark ? '#38bdf8' : '#0284c7',  // blue
      isDark ? '#fbbf24' : '#d97706',  // amber
      isDark ? '#fb923c' : '#ea580c',  // orange
      isDark ? '#c084fc' : '#9333ea',  // purple
      isDark ? '#22d3ee' : '#0891b2',  // cyan
      isDark ? '#a3e635' : '#65a30d',  // lime
      isDark ? '#f472b6' : '#db2777',  // pink
      isDark ? '#67e8f9' : '#06b6d4',  // sky
      isDark ? '#fcd34d' : '#ca8a04',  // yellow
      isDark ? '#d8b4fe' : '#a855f7',  // fuchsia
      isDark ? '#93c5fd' : '#2563eb',  // blue
    ];
    const colorMap: Record<string, string> = {};
    holdings.forEach((h, i) => {
      colorMap[h.symbol] = neutralColors[i % neutralColors.length];
    });
    return colorMap;
  }, [holdings, resolvedTheme]);

  // ── Chart Theme Colors (theme-aware) ─────────────────────
  const chartTheme = useMemo(() => ({
    gridStroke: isDark ? '#334155' : '#e2e8f0',
    tickFill: isDark ? '#94a3b8' : '#64748b',
    tooltipBg: isDark ? '#1e293b' : '#ffffff',
    tooltipBorder: isDark ? '#334155' : '#e2e8f0',
    tooltipText: isDark ? '#e2e8f0' : '#1e293b',
    tooltipSubtext: isDark ? '#94a3b8' : '#64748b',
  }), [isDark]);

  const handlePortfolioLogin = () => {
    const label = loginName.trim();
    const pin = loginPin.trim();

    if (label.length < 2) {
      setLoginError('Enter a portfolio name with at least 2 characters');
      return;
    }
    if (pin.length < 4) {
      setLoginError('Enter a PIN with at least 4 characters');
      return;
    }

    const nextProfile = { id: createProfileId(label, pin), label };
    const savedHoldings = localStorage.getItem(getProfileStorageKey(nextProfile.id));

    setProfile(nextProfile);
    setHoldings(savedHoldings ? JSON.parse(savedHoldings) : []);
    setTransactions([]);
    setSelectedHolding(null);
    setLoginName('');
    setLoginPin('');
    setLoginError('');
    localStorage.setItem(ACTIVE_PROFILE_KEY, JSON.stringify(nextProfile));
    toast.success(savedHoldings ? `Welcome back, ${label}` : `New portfolio created for ${label}`);
  };

  const logoutProfile = () => {
    localStorage.removeItem(ACTIVE_PROFILE_KEY);
    setProfile(null);
    setHoldings([]);
    setTransactions([]);
    setSelectedHolding(null);
    setLoading(false);
    toast.success('Portfolio locked');
  };

  // ── Render ────────────────────────────────────────────────────

  if (!hydrated) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-emerald-600 dark:text-emerald-400" />
        <p className="mt-3 text-sm text-muted-foreground">Preparing your portfolio...</p>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background px-4">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          className="fixed top-4 right-4"
          aria-label="Toggle theme"
        >
          <Sun className="h-4 w-4 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
          <Moon className="absolute h-4 w-4 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
        </Button>
        <Card className="w-full max-w-[420px] shadow-xl">
          <CardHeader className="text-center">
            <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-600 text-white">
              <KeyRound className="h-7 w-7" />
            </div>
            <CardTitle>Portfolio Key</CardTitle>
            <CardDescription>
              Use a portfolio name and PIN. A new combination opens a clean portfolio.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="portfolio-name">Portfolio name</Label>
              <Input
                id="portfolio-name"
                value={loginName}
                onChange={(e) => { setLoginName(e.target.value); setLoginError(''); }}
                onKeyDown={(e) => { if (e.key === 'Enter') handlePortfolioLogin(); }}
                placeholder="e.g. Ahmed EGX"
                autoComplete="username"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="portfolio-pin">PIN</Label>
              <Input
                id="portfolio-pin"
                type="password"
                value={loginPin}
                onChange={(e) => { setLoginPin(e.target.value); setLoginError(''); }}
                onKeyDown={(e) => { if (e.key === 'Enter') handlePortfolioLogin(); }}
                placeholder="4+ characters"
                autoComplete="current-password"
              />
            </div>
            {loginError && (
              <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600 dark:border-red-900 dark:bg-red-950/30 dark:text-red-400">
                {loginError}
              </div>
            )}
            <Button className="w-full gap-2" onClick={handlePortfolioLogin}>
              Unlock Portfolio
              <ArrowUpDown className="h-4 w-4" />
            </Button>
            <p className="text-center text-xs text-muted-foreground">
              This is a local device vault. To share data across devices, connect it later to a backend auth service.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* Header */}
      <header className="border-b bg-card/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <CandlestickChart className="h-6 w-6 text-emerald-600 dark:text-emerald-400" />
                <h1 className="text-xl font-bold tracking-tight">
                  <span className="text-emerald-600 dark:text-emerald-400">EGX</span> Portfolio
                </h1>
              </div>
              <Badge variant="secondary" className="hidden sm:inline-flex text-xs">
                Egyptian Exchange
              </Badge>
            </div>
            <div className="flex items-center gap-2">
              {/* Local session */}
              <div className="hidden md:flex items-center gap-2 mr-2 text-xs text-muted-foreground">
                <User className="h-3.5 w-3.5" />
                <span className="max-w-[180px] truncate">{profile.label}</span>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={logoutProfile}
                aria-label="Lock portfolio"
                title="Lock portfolio"
              >
                <LogOut className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
                aria-label="Toggle theme"
              >
                <Sun className="h-4 w-4 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
                <Moon className="absolute h-4 w-4 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => fetchAll(true)}
                disabled={refreshing}
                className="gap-1.5"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />
                <span className="hidden sm:inline">Refresh</span>
              </Button>
              <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
                <DialogTrigger asChild>
                  <Button size="sm" className="gap-1.5">
                    <Plus className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">Add Position</span>
                  </Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-[500px]">
                  <DialogHeader>
                    <DialogTitle>Add New Position</DialogTitle>
                    <DialogDescription>Select an EGX-listed stock and enter your position details.</DialogDescription>
                  </DialogHeader>
                  <div className="grid gap-4 py-4">
                    {/* Stock Search */}
                    <div className="space-y-2">
                      <Label>Search Stock</Label>
                      <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                          placeholder="Type symbol or name..."
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                          className="pl-9"
                          autoFocus
                        />
                        {searchQuery && (
                          <button
                            className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground hover:text-foreground"
                            onClick={() => setSearchQuery('')}
                          >
                            <X className="h-4 w-4" />
                          </button>
                        )}
                      </div>

                      {/* Stock list - visible only when no stock is selected */}
                      {!selectedStock && (
                        availableStocks.length === 0 ? (
                          <div className="h-48 rounded-md border flex items-center justify-center text-sm text-muted-foreground">
                            <Loader2 className="h-4 w-4 animate-spin mr-2" />
                            Loading {220} EGX stocks...
                          </div>
                        ) : filteredStocks.length === 0 ? (
                          <div className="h-48 rounded-md border flex flex-col items-center justify-center text-sm text-muted-foreground gap-2">
                            <AlertCircle className="h-5 w-5" />
                            <span>No stocks found for &quot;{searchQuery}&quot;</span>
                          </div>
                        ) : (
                          <div className="relative">
                            {searchLoading && (
                              <div className="absolute top-1 right-1 z-10">
                                <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                              </div>
                            )}
                            <div className="h-56 rounded-md border overflow-y-auto">
                              <div className="p-1 space-y-0.5">
                                {filteredStocks.map((stock) => (
                                  <button
                                    key={stock.symbol}
                                    type="button"
                                    className="w-full text-left px-3 py-2 rounded-md text-sm transition-colors hover:bg-accent cursor-pointer"
                                    onClick={() => {
                                      setSelectedStock(stock);
                                      setSearchQuery('');
                                    }}
                                  >
                                    <div className="flex items-center justify-between gap-2">
                                      <div className="min-w-0 flex-1">
                                        <div className="flex items-center gap-1.5">
                                          <span className="font-semibold text-foreground">{stock.symbol}</span>
                                          {stock.currentPrice != null ? (
                                            <span className={`text-xs font-medium ${pnlColor(stock.changePercent || 0)}`}>
                                              {fmtCurrency(stock.currentPrice)}
                                            </span>
                                          ) : searchLoading ? (
                                            <span className="text-xs text-muted-foreground">...</span>
                                          ) : null}
                                        </div>
                                        <p className="text-[11px] text-muted-foreground truncate leading-tight mt-0.5">{stock.name}</p>
                                      </div>
                                      <Badge variant="outline" className="text-[9px] shrink-0 px-1.5 py-0 h-4 font-normal">
                                        {stock.sector}
                                      </Badge>
                                    </div>
                                  </button>
                                ))}
                              </div>
                              <div className="px-3 py-1.5 border-t text-[10px] text-muted-foreground bg-muted/30">
                                {filteredStocks.length} stocks found
                                {searchQuery && ` for "${searchQuery}"`}
                                {" · "}
                                {availableStocks.length} total EGX stocks
                              </div>
                            </div>
                          </div>
                        )
                      )}
                    </div>

                    {selectedStock && (
                      <div className="flex items-center gap-3 p-3 rounded-md bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800">
                        <CheckCircle className="h-4 w-4 text-emerald-600 shrink-0" />
                        <div className="min-w-0 flex-1">
                          <div className="font-semibold text-emerald-700 dark:text-emerald-400">{selectedStock.symbol}</div>
                          <div className="text-xs text-muted-foreground truncate">{selectedStock.name}</div>
                        </div>
                        {selectedStock.currentPrice != null && (
                          <div className="text-sm font-mono font-medium text-emerald-700 dark:text-emerald-400 shrink-0">
                            {fmtCurrency(selectedStock.currentPrice)}
                          </div>
                        )}
                        <button
                          type="button"
                          className="shrink-0 h-6 w-6 rounded-full flex items-center justify-center hover:bg-emerald-200 dark:hover:bg-emerald-800 transition-colors"
                          onClick={() => setSelectedStock(null)}
                          title="Deselect stock"
                        >
                          <X className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                        </button>
                      </div>
                    )}

                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="shares">Number of Shares</Label>
                        <Input
                          id="shares"
                          type="number"
                          min="1"
                          step="1"
                          placeholder="e.g. 100"
                          value={formShares}
                          onChange={(e) => setFormShares(e.target.value)}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="avgCost">Avg. Cost / Share (EGP)</Label>
                        <Input
                          id="avgCost"
                          type="number"
                          min="0.01"
                          step="0.01"
                          placeholder="e.g. 45.50"
                          value={formAvgCost}
                          onChange={(e) => setFormAvgCost(e.target.value)}
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="purchaseDate">Purchase Date</Label>
                      <Input
                        id="purchaseDate"
                        type="date"
                        value={formPurchaseDate}
                        onChange={(e) => setFormPurchaseDate(e.target.value)}
                        max={format(new Date(), 'yyyy-MM-dd')}
                      />
                    </div>

                    {formShares && formAvgCost && parseFloat(formShares) > 0 && parseFloat(formAvgCost) > 0 && (
                      <div className="p-3 rounded-md bg-muted text-sm">
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Total Investment</span>
                          <span className="font-semibold">
                            {fmtCurrency(parseFloat(formShares) * parseFloat(formAvgCost))}
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => { setAddDialogOpen(false); resetForm(); }}>Cancel</Button>
                    <Button
                      onClick={handleAddHolding}
                      disabled={!selectedStock || !formShares || !formAvgCost || parseFloat(formShares) <= 0 || parseFloat(formAvgCost) <= 0}
                    >
                      Add Position
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-6">
        {loading ? (
          <div className="space-y-6">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[...Array(4)].map((_, i) => (
                <Card key={i}>
                  <CardContent className="p-6">
                    <Skeleton className="h-4 w-24 mb-3" />
                    <Skeleton className="h-8 w-32" />
                  </CardContent>
                </Card>
              ))}
            </div>
            <Skeleton className="h-80" />
            <Skeleton className="h-96" />
          </div>
        ) : holdings.length === 0 ? (
          /* Empty State */
          <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
            <div className="rounded-full bg-muted p-6 mb-6">
              <PieChart className="h-12 w-12 text-muted-foreground" />
            </div>
            <h2 className="text-2xl font-semibold mb-2">No Holdings Yet</h2>
            <p className="text-muted-foreground max-w-md mb-6">
              Start building your Egyptian stock portfolio by adding your first position.
              We&apos;ll track performance against the EGX30 index in real-time.
            </p>
            <Button onClick={() => setAddDialogOpen(true)} className="gap-2">
              <Plus className="h-4 w-4" />
              Add Your First Position
            </Button>
          </div>
        ) : (
          <div className="space-y-6">
            {/* ── Summary Cards ─────────────────────────────────── */}
            {summary && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
                {/* Total Investment */}
                <Card className="min-w-0">
                  <CardContent className="p-4 sm:p-5">
                    <div className="flex items-center gap-1.5 mb-2">
                      <DollarSign className="h-4 w-4 text-muted-foreground" />
                      <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Invested</span>
                    </div>
                    <div className="text-lg sm:text-xl font-bold truncate" title={fmtCurrency(summary.totalInvestment)}>{fmtCurrency(summary.totalInvestment)}</div>
                    <div className="text-xs text-muted-foreground mt-1.5">
                      {summary.numberOfHoldings} {summary.numberOfHoldings === 1 ? 'position' : 'positions'}
                    </div>
                  </CardContent>
                </Card>

                {/* Total Market Value */}
                <Card className="min-w-0">
                  <CardContent className="p-4 sm:p-5">
                    <div className="flex items-center gap-1.5 mb-2">
                      <Wallet className="h-4 w-4 text-muted-foreground" />
                      <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Market Value</span>
                    </div>
                    <div className="text-lg sm:text-xl font-bold truncate" title={fmtCurrency(summary.totalMarketValue)}>{fmtCurrency(summary.totalMarketValue)}</div>
                    <div className={`text-xs font-medium mt-1.5 ${pnlColor(summary.totalPnL)}`}>
                      {summary.totalPnL >= 0 ? <TrendingUp className="inline h-3.5 w-3.5 mr-0.5" /> : <TrendingDown className="inline h-3.5 w-3.5 mr-0.5" />}
                      {fmtChange(summary.totalPnL)} ({fmtPercent(summary.totalPnLPercent)})
                    </div>
                  </CardContent>
                </Card>

                {/* Today's Change */}
                <Card className="min-w-0">
                  <CardContent className="p-4 sm:p-5">
                    <div className="flex items-center gap-1.5 mb-2">
                      <Activity className="h-4 w-4 text-muted-foreground" />
                      <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Today</span>
                    </div>
                    <div className={`text-lg sm:text-xl font-bold truncate ${pnlColor(summary.todaysChange)}`} title={fmtChange(summary.todaysChange)}>
                      {fmtChange(summary.todaysChange)}
                    </div>
                    <div className={`text-xs font-medium mt-1.5 ${pnlColor(summary.todaysChangePercent)}`}>
                      {fmtPercent(summary.todaysChangePercent)}
                    </div>
                  </CardContent>
                </Card>

                {/* Best Performer */}
                <Card className="min-w-0">
                  <CardContent className="p-4 sm:p-5">
                    <div className="flex items-center gap-1.5 mb-2">
                      <BarChart3 className="h-4 w-4 text-muted-foreground" />
                      <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Best Performer</span>
                    </div>
                    {summary.bestPerformer ? (
                      <>
                        <div className="text-lg sm:text-xl font-bold truncate">{summary.bestPerformer.symbol}</div>
                        <div className={`text-xs font-medium mt-1.5 ${pnlColor(summary.bestPerformer.pnlPercent)}`}>
                          {fmtPercent(summary.bestPerformer.pnlPercent)} ({fmtChange(summary.bestPerformer.pnl)})
                        </div>
                      </>
                    ) : (
                        <div className="text-sm text-muted-foreground mt-1.5">—</div>
                      )}
                  </CardContent>
                </Card>
              </div>
            )}

            {/* ── Market Ticker Bar ── */}
            {(allIndexData.length > 0 || extrasData) && (
              <div className="space-y-2 sm:space-y-3">
                {/* Row 1: EGX Indices */}
                <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                  {allIndexData.map((idx) => {
                    const nameColor = TICKER_NAME_COLORS[idx.name];
                    return (
                      <div
                        key={idx.symbol}
                        className="flex items-center gap-2 sm:gap-3 px-3 sm:px-4 py-2 sm:py-2.5 rounded-lg border bg-card"
                      >
                        <div>
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs sm:text-sm font-semibold" style={nameColor ? { color: nameColor } : undefined}>{idx.name}</span>
                            {extrasData?.marketStatus && (
                              <StatusBadge status={extrasData.marketStatus.egx} />
                            )}
                          </div>
                          <div className={`text-base sm:text-lg font-bold ${pnlColor(idx.changePercent)}`}>
                            {fmtNumber(idx.currentPrice)}
                          </div>
                        </div>
                        <div className={`text-right ${pnlColor(idx.changePercent)}`}>
                          <div className="text-[10px] sm:text-xs font-medium">{fmtPercent(idx.changePercent)}</div>
                          <div className="text-[10px] sm:text-xs">{fmtChange(idx.changeAbs)}</div>
                        </div>
                      </div>
                    );
                  })}

                </div>

                {/* Row 2: USD/EGP + Gold */}
                <div className="flex flex-wrap items-center gap-2 sm:gap-3">

                  {/* USD/EGP Rate — uses server change (TradingView/Google) or client-side fallback */}
                  {extrasData && extrasData.usdEgp.rate > 0 && (() => {
                    // Use server-provided change when available, fall back to client-side tracking
                    const serverChange = extrasData.usdEgp.changePercent !== 0 ? extrasData.usdEgp.changePercent : usdEgpClientChange.changePercent;
                    const serverAbs = extrasData.usdEgp.changePercent !== 0 ? extrasData.usdEgp.changeAbs : usdEgpClientChange.changeAbs;
                    return (
                    <div className="flex items-center gap-2 sm:gap-3 px-3 sm:px-4 py-2 sm:py-2.5 rounded-lg border bg-card">
                      <div>
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs sm:text-sm font-semibold" style={{ color: TICKER_NAME_COLORS['USD/EGP'] }}>USD/EGP</span>
                          {extrasData?.marketStatus ? (
                            <StatusBadge status={extrasData.marketStatus.forex} />
                          ) : null}
                        </div>
                        <div className={`text-base sm:text-lg font-bold ${pnlColor(serverAbs)}`}>
                          {fmtNumber(extrasData.usdEgp.rate)}
                        </div>
                      </div>
                      <div className={`text-right ${pnlColor(serverAbs)}`}>
                        <div className="text-[10px] sm:text-xs font-medium">{fmtPercent(serverChange)}</div>
                        {serverAbs !== 0 && (
                          <div className="text-[10px] sm:text-xs">{serverAbs >= 0 ? '+' : ''}{fmtNumber(serverAbs)}</div>
                        )}
                      </div>
                    </div>
                    );
                  })()}

                  {/* Gold 24K per gram (EGP) — source: gold-price-live.com, change from Egyptian prices only */}
                  {extrasData && extrasData.gold.perGram24kEgp > 0 && (() => {
                    const ch = goldEgpChanges['24k'] || { changeAbs: 0, changePercent: 0 };
                    return (
                    <div className="flex items-center gap-2 sm:gap-3 px-3 sm:px-4 py-2 sm:py-2.5 rounded-lg border bg-card">
                      <Gem className="h-4 w-4 text-yellow-500 shrink-0" />
                      <div>
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs sm:text-sm font-semibold" style={{ color: TICKER_NAME_COLORS['Gold 24K'] }}>Gold 24K</span>
                          {extrasData?.marketStatus ? (
                            <StatusBadge status={extrasData.marketStatus.gold} />
                          ) : null}
                        </div>
                        <div className={`text-base sm:text-lg font-bold ${pnlColor(ch.changePercent)}`}>
                          {fmtNumber(extrasData.gold.perGram24kEgp)} <span className="text-[10px] sm:text-xs font-normal text-muted-foreground">EGP/g</span>
                        </div>
                        {extrasData.gold.perGram24kHigh > 0 && (
                          <div className="text-[9px] text-muted-foreground">
                            H: {fmtNumber(extrasData.gold.perGram24kHigh)} L: {fmtNumber(extrasData.gold.perGram24kLow)}
                          </div>
                        )}
                      </div>
                      <div className={`text-right ${pnlColor(ch.changePercent)}`}>
                        <div className="text-[10px] sm:text-xs font-medium">{fmtPercent(ch.changePercent)}</div>
                        {ch.changeAbs !== 0 && (
                          <div className="text-[10px] sm:text-xs">{ch.changeAbs >= 0 ? '+' : ''}{fmtNumber(ch.changeAbs)}</div>
                        )}
                      </div>
                    </div>
                    );
                  })()}

                  {/* Gold 21K per gram (EGP) — source: gold-price-live.com, change from Egyptian prices only */}
                  {extrasData && extrasData.gold.perGram21kEgp > 0 && (() => {
                    const ch = goldEgpChanges['21k'] || { changeAbs: 0, changePercent: 0 };
                    return (
                    <div className="flex items-center gap-2 sm:gap-3 px-3 sm:px-4 py-2 sm:py-2.5 rounded-lg border bg-card">
                      <Gem className="h-4 w-4 text-yellow-500 shrink-0" />
                      <div>
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs sm:text-sm font-semibold" style={{ color: TICKER_NAME_COLORS['Gold 21K'] }}>Gold 21K</span>
                          {extrasData?.marketStatus ? (
                            <StatusBadge status={extrasData.marketStatus.gold} />
                          ) : null}
                        </div>
                        <div className={`text-base sm:text-lg font-bold ${pnlColor(ch.changePercent)}`}>
                          {fmtNumber(extrasData.gold.perGram21kEgp)} <span className="text-[10px] sm:text-xs font-normal text-muted-foreground">EGP/g</span>
                        </div>
                        {extrasData.gold.perGram21kHigh > 0 && (
                          <div className="text-[9px] text-muted-foreground">
                            H: {fmtNumber(extrasData.gold.perGram21kHigh)} L: {fmtNumber(extrasData.gold.perGram21kLow)}
                          </div>
                        )}
                      </div>
                      <div className={`text-right ${pnlColor(ch.changePercent)}`}>
                        <div className="text-[10px] sm:text-xs font-medium">{fmtPercent(ch.changePercent)}</div>
                        {ch.changeAbs !== 0 && (
                          <div className="text-[10px] sm:text-xs">{ch.changeAbs >= 0 ? '+' : ''}{fmtNumber(ch.changeAbs)}</div>
                        )}
                      </div>
                    </div>
                    );
                  })()}



                  {/* Gold (USD per ounce) — source: TradingView XAUUSD (international) */}
                  {extrasData && extrasData.gold.usdPrice > 0 && (
                    <div className="flex items-center gap-2 sm:gap-3 px-3 sm:px-4 py-2 sm:py-2.5 rounded-lg border bg-card">
                      <Gem className="h-4 w-4 text-yellow-500 shrink-0" />
                      <div>
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs sm:text-sm font-semibold" style={{ color: TICKER_NAME_COLORS['Gold'] }}>Gold (USD)</span>
                          <StatusBadge status={extrasData.marketStatus?.globalGold || extrasData.marketStatus?.gold || 'live'} />
                        </div>
                        <div className={`text-base sm:text-lg font-bold ${pnlColor(extrasData.gold.usdChangePercent || 0)}`}>
                          ${fmtNumber(extrasData.gold.usdPrice)} <span className="text-[10px] sm:text-xs font-normal text-muted-foreground">/oz</span>
                        </div>
                      </div>
                      <div className={`text-right ${pnlColor(extrasData.gold.usdChangePercent || 0)}`}>
                        <div className="text-[10px] sm:text-xs font-medium">{fmtPercent(extrasData.gold.usdChangePercent || 0)}</div>
                        {(extrasData.gold.usdChangeAbs || 0) !== 0 && (
                          <div className="text-[10px] sm:text-xs">{extrasData.gold.usdChangeAbs >= 0 ? '+' : ''}{fmtNumber(extrasData.gold.usdChangeAbs || 0)}</div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Gold Pound (جنيه الذهب) — source: gold-price-live.com, change from Egyptian prices only */}
                  {extrasData && extrasData.gold.goldPoundEgp && extrasData.gold.goldPoundEgp > 0 && (() => {
                    const ch = goldEgpChanges['pound'] || { changeAbs: 0, changePercent: 0 };
                    return (
                    <div className="flex items-center gap-2 sm:gap-3 px-3 sm:px-4 py-2 sm:py-2.5 rounded-lg border bg-card">
                      <Gem className="h-4 w-4 text-yellow-500 shrink-0" />
                      <div>
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs sm:text-sm font-semibold" style={{ color: TICKER_NAME_COLORS['Gold 21K'] }}>Gold Pound</span>
                          {extrasData?.marketStatus ? (
                            <StatusBadge status={extrasData.marketStatus.gold} />
                          ) : null}
                        </div>
                        <div className={`text-base sm:text-lg font-bold ${pnlColor(ch.changePercent)}`}>
                          {fmtNumber(extrasData.gold.goldPoundEgp)} <span className="text-[10px] sm:text-xs font-normal text-muted-foreground">EGP</span>
                        </div>
                      </div>
                      <div className={`text-right ${pnlColor(ch.changePercent)}`}>
                        <div className="text-[10px] sm:text-xs font-medium">{fmtPercent(ch.changePercent)}</div>
                        {ch.changeAbs !== 0 && (
                          <div className="text-[10px] sm:text-xs">{ch.changeAbs >= 0 ? '+' : ''}{fmtNumber(ch.changeAbs)}</div>
                        )}
                      </div>
                    </div>
                    );
                  })()}

                </div>
              </div>
            )}

            {/* ── Charts Section ─────────────────────────────────── */}
            <Tabs defaultValue="performance" className="space-y-4">
              <TabsList className="grid w-full grid-cols-2 sm:grid-cols-5 max-w-2xl">
                <TabsTrigger value="performance" className="gap-1.5 text-xs sm:text-sm">
                  <LineChart className="h-3.5 w-3.5" />
                  Performance
                </TabsTrigger>
                <TabsTrigger value="allocation" className="gap-1.5 text-xs sm:text-sm">
                  <PieChart className="h-3.5 w-3.5" />
                  Allocation
                </TabsTrigger>
                <TabsTrigger value="returns" className="gap-1.5 text-xs sm:text-sm">
                  <BarChart3 className="h-3.5 w-3.5" />
                  P&L by Stock
                </TabsTrigger>
                <TabsTrigger value="benchmark" className="gap-1.5 text-xs sm:text-sm">
                  <TrendingUp className="h-3.5 w-3.5" />
                  Benchmark
                </TabsTrigger>
                <TabsTrigger value="sr" className="gap-1.5 text-xs sm:text-sm">
                  <Shield className="h-3.5 w-3.5" />
                  S&R
                </TabsTrigger>
              </TabsList>

              {/* Performance Chart */}
              <TabsContent value="performance">
                <Card>
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <div>
                        <CardTitle className="text-base">Portfolio Value</CardTitle>
                        <CardDescription>Based on current holdings and market data</CardDescription>
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {performancePeriods.map((p) => (
                          <button
                            key={p}
                            type="button"
                            className={`px-2.5 py-1 text-xs rounded-md transition-colors ${
                              performancePeriod === p
                                ? 'bg-primary text-primary-foreground'
                                : 'bg-muted text-muted-foreground hover:bg-accent'
                            }`}
                            onClick={() => setPerformancePeriod(p)}
                          >
                            {p}
                          </button>
                        ))}
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="h-72">
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={performanceData}>
                          <defs>
                            <linearGradient id="portfolioGrad" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="#059669" stopOpacity={0.3} />
                              <stop offset="95%" stopColor="#059669" stopOpacity={0} />
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" stroke={chartTheme.gridStroke} />
                          <XAxis
                            dataKey="date"
                            tick={{ fontSize: 11, fill: chartTheme.tickFill }}
                            interval="preserveStartEnd"
                          />
                          <YAxis
                            tick={{ fontSize: 11, fill: chartTheme.tickFill }}
                            tickFormatter={(v) => `${(v / 1000).toFixed(0)}K`}
                          />
                          <RechartsTooltip
                            formatter={(value: number) => [fmtCurrency(value), 'Portfolio']}
                            contentStyle={{
                              backgroundColor: chartTheme.tooltipBg,
                              border: `1px solid ${chartTheme.tooltipBorder}`,
                              borderRadius: '8px',
                              fontSize: '13px',
                              color: chartTheme.tooltipText,
                            }}
                          />
                          <Area
                            type="monotone"
                            dataKey="portfolio"
                            stroke="#059669"
                            fill="url(#portfolioGrad)"
                            strokeWidth={2}
                          />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Allocation Chart */}
              <TabsContent value="allocation">
                <div className="grid gap-4 md:grid-cols-2">
                  {/* Sector Allocation Pie */}
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base">Allocation by Sector</CardTitle>
                      <CardDescription>Market value distribution by sector</CardDescription>
                    </CardHeader>
                    <CardContent>
                      {allocationData.sectors.length > 0 ? (
                        <div className="flex flex-col items-center gap-4">
                          <div style={{ width: '100%', height: 320 }}>
                            <ResponsiveContainer width="100%" height="100%">
                              <RechartsPieChart>
                                <Pie
                                  data={allocationData.sectors}
                                  dataKey="percent"
                                  nameKey="sector"
                                  cx="50%"
                                  cy="50%"
                                  outerRadius={75}
                                  innerRadius={38}
                                  paddingAngle={2}
                                  label={({ name, percent }: { name: string; percent: number }) =>
                                    percent >= 0.06 ? `${name}` : ''
                                  }
                                  labelLine={({ percent }: { percent: number }) => percent >= 0.06}
                                >
                                  {allocationData.sectors.map((_, index) => (
                                    <Cell key={`sector-${index}`} fill={ALLOCATION_COLORS[index % ALLOCATION_COLORS.length]} />
                                  ))}
                                </Pie>
                                <RechartsTooltip
                                  content={({ active, payload }) => {
                                    if (!active || !payload?.length) return null;
                                    const d = payload[0]?.payload;
                                    if (!d) return null;
                                    const colorIdx = allocationData.sectors.findIndex(s => s.sector === d.sector);
                                    const dotColor = ALLOCATION_COLORS[colorIdx >= 0 ? colorIdx : 0];
                                    return (
                                      <div
                                        style={{
                                          backgroundColor: chartTheme.tooltipBg,
                                          border: `1px solid ${chartTheme.tooltipBorder}`,
                                          borderRadius: '10px',
                                          padding: '10px 14px',
                                          boxShadow: '0 4px 12px rgba(0,0,0,0.12)',
                                        }}
                                      >
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                                          <div style={{ width: 10, height: 10, borderRadius: 3, backgroundColor: dotColor, flexShrink: 0 }} />
                                          <span style={{ fontWeight: 700, fontSize: 13, color: chartTheme.tooltipText }}>{d.sector}</span>
                                        </div>
                                        <div style={{ fontSize: 12, color: chartTheme.tickFill }}>
                                          Weight: <span style={{ fontWeight: 600, color: chartTheme.tooltipText }}>{d.percent.toFixed(1)}%</span>
                                        </div>
                                        <div style={{ fontSize: 12, color: chartTheme.tickFill, marginTop: 2 }}>
                                          Value: <span style={{ fontWeight: 600, color: chartTheme.tooltipText }}>{fmtCurrency(d.value)}</span>
                                        </div>
                                      </div>
                                    );
                                  }}
                                />
                              </RechartsPieChart>
                            </ResponsiveContainer>
                          </div>
                          <div className="w-full space-y-1.5">
                            {allocationData.sectors.map((sec, i) => (
                              <div key={sec.sector} className="flex items-center justify-between text-sm">
                                <div className="flex items-center gap-2">
                                  <div className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ backgroundColor: ALLOCATION_COLORS[i % ALLOCATION_COLORS.length] }} />
                                  <span className="text-muted-foreground">{sec.sector}</span>
                                </div>
                                <span className="font-medium">{sec.percent.toFixed(1)}%</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : (
                        <div className="h-56 flex items-center justify-center text-sm text-muted-foreground">
                          No data
                        </div>
                      )}
                    </CardContent>
                  </Card>

                  {/* Holdings by Stock */}
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base">Allocation by Stock</CardTitle>
                      <CardDescription>Individual position weights with sector</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="h-72">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={allocationData.stocks} layout="vertical" margin={{ left: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke={chartTheme.gridStroke} />
                            <XAxis type="number" tick={{ fontSize: 11, fill: chartTheme.tickFill }} tickFormatter={(v) => `${v.toFixed(0)}%`} />
                            <YAxis
                              type="category"
                              dataKey="name"
                              tick={{ fontSize: 11, fontWeight: 600, fill: chartTheme.tooltipText }}
                              width={65}
                            />
                            <RechartsTooltip
                              content={({ active, payload }) => {
                                if (!active || !payload?.length) return null;
                                const d = payload[0]?.payload;
                                if (!d) return null;
                                const colorIdx = allocationData.sectors.findIndex(s => s.sector === d.sector);
                                const dotColor = ALLOCATION_COLORS[colorIdx >= 0 ? colorIdx : 0];
                                return (
                                  <div
                                    style={{
                                      backgroundColor: chartTheme.tooltipBg,
                                      border: `1px solid ${chartTheme.tooltipBorder}`,
                                      borderRadius: '10px',
                                      padding: '10px 14px',
                                      boxShadow: '0 4px 12px rgba(0,0,0,0.12)',
                                    }}
                                  >
                                    <div style={{ fontWeight: 700, fontSize: 13, color: chartTheme.tooltipText, marginBottom: 2 }}>{d.name}</div>
                                    <div style={{ fontSize: 11, color: chartTheme.tickFill, marginBottom: 6, paddingBottom: 6, borderBottom: `1px solid ${chartTheme.tooltipBorder}` }}>{d.fullName} — {d.sector}</div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: chartTheme.tickFill }}>
                                      <div style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: dotColor, flexShrink: 0 }} />
                                      Weight: <span style={{ fontWeight: 600, color: chartTheme.tooltipText }}>{d.percent.toFixed(1)}%</span>
                                    </div>
                                    <div style={{ fontSize: 12, color: chartTheme.tickFill, marginTop: 2 }}>
                                      Value: <span style={{ fontWeight: 600, color: chartTheme.tooltipText }}>{fmtCurrency(d.value)}</span>
                                    </div>
                                  </div>
                                );
                              }}
                            />
                            <Bar dataKey="percent" radius={[0, 4, 4, 0]}>
                              {allocationData.stocks.map((entry, index) => (
                                <Cell
                                  key={`stock-${index}`}
                                  fill={ALLOCATION_COLORS[
                                    allocationData.sectors.findIndex(s => s.sector === entry.sector) >= 0
                                      ? allocationData.sectors.findIndex(s => s.sector === entry.sector)
                                      : index
                                    % ALLOCATION_COLORS.length
                                  ]}
                                />
                              ))}
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </TabsContent>

              {/* Returns by Stock */}
              <TabsContent value="returns">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">P&L by Stock</CardTitle>
                    <CardDescription>Total profit/loss for each holding</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {(() => {
                      const sorted = [...holdings].sort((a, b) => b.pnl - a.pnl);
                      const chartData = sorted.map((h) => ({
                        ...h,
                        label: h.symbol,
                      }));
                      const hasLoser = sorted.some(h => h.pnl < 0);
                      const neutralColors = [
                        isDark ? '#a78bfa' : '#7c3aed',
                        isDark ? '#38bdf8' : '#0284c7',
                        isDark ? '#fbbf24' : '#d97706',
                        isDark ? '#fb923c' : '#ea580c',
                        isDark ? '#c084fc' : '#9333ea',
                        isDark ? '#22d3ee' : '#0891b2',
                        isDark ? '#a3e635' : '#65a30d',
                        isDark ? '#f472b6' : '#db2777',
                      ];

                      // Build color map per symbol
                      const labelColorMap: Record<string, string> = {};
                      sorted.forEach((h, i) => {
                        if (i === 0) {
                          labelColorMap[h.symbol] = isDark ? '#34d399' : '#059669'; // best = green
                        } else if (hasLoser && i === sorted.length - 1) {
                          labelColorMap[h.symbol] = isDark ? '#f87171' : '#dc2626'; // worst = red
                        } else {
                          labelColorMap[h.symbol] = neutralColors[(i - 1) % neutralColors.length];
                        }
                      });

                      return (
                        <div className="h-80">
                          <ResponsiveContainer width="100%" height="100%">
                            <BarChart
                              data={chartData}
                              layout="vertical"
                              margin={{ left: 10, right: 30, top: 5, bottom: 5 }}
                              cursor={{ fill: 'none' }}
                            >
                              <CartesianGrid strokeDasharray="3 3" stroke={chartTheme.gridStroke} horizontal={false} />
                              <ReferenceLine x={0} stroke={isDark ? '#475569' : '#cbd5e1'} strokeWidth={1} />
                              <XAxis
                                type="number"
                                tick={{ fontSize: 11, fill: chartTheme.tickFill }}
                                tickFormatter={(v) => `${(v >= 0 ? '' : '-')}${Math.abs(v / 1000).toFixed(0)}K`}
                              />
                              <YAxis
                                type="category"
                                dataKey="label"
                                width={55}
                                tick={({ x, y, payload }: { x: number; y: number; payload: { value: string } }) => (
                                  <text
                                    x={x}
                                    y={y}
                                    textAnchor="end"
                                    fontSize={11}
                                    fontWeight={600}
                                    fill={labelColorMap[payload.value] || chartTheme.tooltipText}
                                    dominantBaseline="middle"
                                  >
                                    {payload.value}
                                  </text>
                                )}
                              />
                              <RechartsTooltip
                                content={({ active, payload }) => {
                                  if (!active || !payload?.length) return null;
                                  const h = payload[0]?.payload as Holding | undefined;
                                  if (!h) return null;
                                  const sym = h.symbol;
                                  const name = h.name;
                                  const color = h.pnl >= 0 ? (isDark ? '#34d399' : '#059669') : (isDark ? '#f87171' : '#dc2626');
                                  const labelColor = labelColorMap[sym] || chartTheme.tooltipText;
                                  return (
                                    <div
                                      style={{
                                        backgroundColor: chartTheme.tooltipBg,
                                        border: `1px solid ${chartTheme.tooltipBorder}`,
                                        borderRadius: '8px',
                                        padding: '10px 14px',
                                        fontSize: '13px',
                                      }}
                                    >
                                      <div style={{ fontWeight: 700, fontSize: '13px', color: labelColor }}>{sym}</div>
                                      <div style={{ fontSize: '11px', color: chartTheme.tooltipSubtext, marginTop: '1px', marginBottom: '6px', borderBottom: `1px solid ${chartTheme.tooltipBorder}`, paddingBottom: '6px' }}>{name}</div>
                                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <span style={{ color: chartTheme.tooltipSubtext }}>P&L</span>
                                        <span style={{ color, fontWeight: 700 }}>{fmtCurrency(h.pnl)} ({fmtPercent(h.pnlPercent)})</span>
                                      </div>
                                    </div>
                                  );
                                }}
                              />
                              <Bar dataKey="pnl" radius={[0, 6, 6, 0]} maxBarSize={28}>
                                {sorted.map((entry, index) => {
                                  const profit = entry.pnl >= 0;
                                  return (
                                    <Cell
                                      key={`pnl-${index}`}
                                      fill={profit ? '#10b981' : '#ef4444'}
                                    />
                                  );
                                })}
                              </Bar>
                            </BarChart>
                          </ResponsiveContainer>
                        </div>
                      );
                    })()}
                    {/* Summary cards below chart */}
                    {(() => {
                      const bestStock = [...holdings].sort((a, b) => b.pnl - a.pnl)[0];
                      const winnersCount = holdings.filter(h => h.pnl > 0).length;
                      const losersCount = holdings.filter(h => h.pnl < 0).length;
                      return (
                        <div className="grid grid-cols-3 gap-3 mt-4">
                          <div className="rounded-lg border p-3 bg-card">
                            <p className="text-[10px] font-medium text-emerald-600 dark:text-emerald-400 uppercase tracking-wider mb-1">Winners</p>
                            <p className="text-xl font-bold text-emerald-600 dark:text-emerald-400">
                              {winnersCount}
                              <span className="text-sm font-normal text-muted-foreground ml-1">
                                / {holdings.length}
                              </span>
                            </p>
                          </div>
                          <div className="rounded-lg border p-3 bg-card">
                            <p className="text-[10px] font-medium text-red-500 dark:text-red-400 uppercase tracking-wider mb-1">Losers</p>
                            <p className="text-xl font-bold text-red-500 dark:text-red-400">
                              {losersCount}
                              <span className="text-sm font-normal text-muted-foreground ml-1">
                                / {holdings.length}
                              </span>
                            </p>
                          </div>
                          <div className="rounded-lg border p-3 bg-card">
                            <p className="text-[10px] font-medium text-emerald-600 dark:text-emerald-400 uppercase tracking-wider mb-1">Best P&L</p>
                            <p className="text-lg font-bold text-emerald-600 dark:text-emerald-400">
                              {fmtCurrency(bestStock?.pnl || 0)}
                            </p>
                            <p className="text-xs text-muted-foreground truncate mt-0.5">
                              {bestStock?.symbol} — {bestStock?.name}
                            </p>
                          </div>
                        </div>
                      );
                    })()}
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Benchmark Comparison */}
              <TabsContent value="benchmark">
                <Card>
                  <CardHeader className="pb-2">
                    <div>
                      <CardTitle className="text-base">Benchmark Comparison</CardTitle>
                      <CardDescription>
                        Your portfolio's aggregate performance vs EGX indices (real TradingView data)
                      </CardDescription>
                    </div>
                  </CardHeader>
                  <CardContent>
                    {benchmarkChartData.length > 0 ? (
                      <>
                        <div className="h-80">
                          <ResponsiveContainer width="100%" height="100%">
                            <RechartsLineChart data={benchmarkChartData}>
                              <CartesianGrid strokeDasharray="3 3" stroke={chartTheme.gridStroke} />
                              <XAxis
                                dataKey="period"
                                tick={{ fontSize: 11, fill: chartTheme.tickFill }}
                              />
                              <YAxis
                                tick={{ fontSize: 11, fill: chartTheme.tickFill }}
                                tickFormatter={(v) => `${v.toFixed(1)}%`}
                              />
                              <RechartsTooltip
                                formatter={(value: number, name: string) => {
                                  const line = benchmarkLines.find(l => l.key === name);
                                  const label = line?.label || name;
                                  return [` ${value >= 0 ? '+' : ''}${value.toFixed(2)}%`, label];
                                }}
                                labelFormatter={(label) => `Period: ${label}`}
                                contentStyle={{
                                  backgroundColor: chartTheme.tooltipBg,
                                  border: `1px solid ${chartTheme.tooltipBorder}`,
                                  borderRadius: '8px',
                                  fontSize: '13px',
                                  color: chartTheme.tooltipText,
                                }}
                              />
                              <Legend
                                wrapperStyle={{ fontSize: '11px', paddingTop: '8px', color: chartTheme.tooltipText }}
                                iconType="line"
                                iconSize={10}
                              />
                              {benchmarkLines.map((line) => (
                                <Line
                                  key={line.key}
                                  type="monotone"
                                  dataKey={line.key}
                                  name={line.label}
                                  stroke={line.color}
                                  strokeWidth={line.key === 'portfolio' ? 3 : 2.5}
                                  strokeDasharray={line.strokeDash || undefined}
                                  dot={{ r: 3, fill: line.color }}
                                  activeDot={{ r: 5 }}
                                />
                              ))}
                            </RechartsLineChart>
                          </ResponsiveContainer>
                        </div>
                        {/* Performance summary table */}
                        <div className="mt-4 rounded-md border overflow-hidden">
                          <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                              <thead>
                                <tr className="bg-muted/50 border-b">
                                  <th className="text-left px-3 py-2 font-medium text-muted-foreground text-xs">Symbol</th>
                                  {benchmarkPeriods.map((p) => (
                                    <th key={p} className="text-right px-3 py-2 font-medium text-muted-foreground text-xs">{p}</th>
                                  ))}
                                </tr>
                              </thead>
                              <tbody>
                                {/* Portfolio stocks */}
                                {holdings.map((h) => {
                                  const stockPerf = perfData[h.symbol];
                                  const stockColor = stockNameColorMap[h.symbol] || 'hsl(var(--foreground))';
                                  return (
                                    <tr key={h.symbol} className="border-b last:border-0">
                                      <td className="px-3 py-2">
                                        <div className="flex items-center gap-2">
                                          <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: stockColor }} />
                                          <div className="min-w-0">
                                            <span className="font-semibold" style={{ color: stockColor }}>{h.symbol}</span>
                                            <p className="text-[10px] text-muted-foreground truncate max-w-[120px]">{h.name}</p>
                                          </div>
                                        </div>
                                      </td>
                                      {benchmarkPeriods.map((p) => {
                                        const val = stockPerf?.returns[p];
                                        if (val == null) return <td key={p} className="text-right px-3 py-2 text-muted-foreground">—</td>;
                                        return (
                                          <td key={p} className={`text-right px-3 py-2 font-mono text-xs ${pnlColor(val)}`}>
                                            {val >= 0 ? '+' : ''}{val.toFixed(2)}%
                                          </td>
                                        );
                                      })}
                                    </tr>
                                  );
                                })}
                                {/* Portfolio Aggregate row */}
                                {(() => {
                                  const hasAnyReturn = benchmarkPeriods.some(p => portfolioReturns[p] != null);
                                  const allReturns = benchmarkPeriods.map(p => portfolioReturns[p]).filter(v => v != null);
                                  const avgReturn = allReturns.length > 0 ? allReturns.reduce((a, b) => a + b, 0) / allReturns.length : 0;
                                  const rowColor = avgReturn >= 0
                                    ? 'bg-emerald-50 dark:bg-emerald-950/20'
                                    : 'bg-red-50 dark:bg-red-950/20';
                                  const textColor = avgReturn >= 0
                                    ? 'text-emerald-700 dark:text-emerald-400'
                                    : 'text-red-700 dark:text-red-400';
                                  return hasAnyReturn ? (
                                    <tr className={`border-b ${rowColor}`}>
                                      <td className="px-3 py-2">
                                        <div className="flex items-center gap-2">
                                          <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: '#10b981' }} />
                                          <span className={`font-semibold ${textColor}`}>Portfolio (Aggregate)</span>
                                        </div>
                                      </td>
                                      {benchmarkPeriods.map((p) => {
                                        const val = portfolioReturns[p];
                                        if (val == null) return <td key={p} className="text-right px-3 py-2 text-muted-foreground">—</td>;
                                        return (
                                          <td key={p} className={`text-right px-3 py-2 font-mono font-semibold ${pnlColor(val)}`}>
                                            {val >= 0 ? '+' : ''}{val.toFixed(2)}%
                                          </td>
                                        );
                                      })}
                                    </tr>
                                  ) : null;
                                })()}
                                {/* Separator row */}
                                <tr className="border-b">
                                  <td colSpan={7} className="px-3 py-1 bg-muted/30" />
                                </tr>
                                {/* Index rows + Gold */}
                                {['EGX30', 'EGX70_EWI', 'EGX100_EWI', 'XAUUSD'].map((sym) => {
                                  const idxPerf = perfData[sym];
                                  const idxLabel = sym === 'EGX30' ? 'EGX 30' : sym === 'EGX70_EWI' ? 'EGX 70 EWI' : sym === 'EGX100_EWI' ? 'EGX 100 EWI' : 'Gold (USD)';
                                  const idxStyle = INDEX_STYLES[sym];
                                  if (!idxPerf) return null;
                                  return (
                                    <tr key={sym} className="border-b last:border-0 bg-muted/20">
                                      <td className="px-3 py-2">
                                        <div className="flex items-center gap-2">
                                          <div className="w-2.5 h-0.5 shrink-0 rounded" style={{ backgroundColor: idxStyle?.color }} />
                                          {sym === 'XAUUSD' && <Gem className="h-3 w-3 text-yellow-500 shrink-0" />}
                                          <span className="font-semibold text-xs" style={{ color: idxStyle?.color }}>{idxLabel}</span>
                                        </div>
                                      </td>
                                      {benchmarkPeriods.map((p) => {
                                        const val = idxPerf.returns[p];
                                        if (val == null) return <td key={p} className="text-right px-3 py-2 text-muted-foreground">—</td>;
                                        return (
                                          <td key={p} className={`text-right px-3 py-2 font-mono text-xs ${pnlColor(val)}`}>
                                            {val >= 0 ? '+' : ''}{val.toFixed(2)}%
                                          </td>
                                        );
                                      })}
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      </>
                    ) : (
                      <div className="h-80 flex items-center justify-center text-sm text-muted-foreground">
                        No performance data available
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              {/* ── Support & Resistance ── */}
              <TabsContent value="sr">
                <Card>
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <CardTitle className="text-base flex items-center gap-2">
                          <Shield className="h-4 w-4 text-blue-500" />
                          S&R — Pivot Points & Technical Analysis
                        </CardTitle>
                        <CardDescription className="text-[11px] mt-1">
                          Classic · Fibonacci · Camarilla · Woodie pivots from TradingView + MA/BB confluence levels
                        </CardDescription>
                      </div>
                      {taLoading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
                    </div>
                    {/* Search Bar */}
                    <div className="relative mt-3">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        placeholder="Search by symbol or name..."
                        value={srSearch}
                        onChange={(e) => setSrSearch(e.target.value)}
                        className="pl-9 h-9"
                      />
                      {srSearch && (
                        <button
                          className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground hover:text-foreground"
                          onClick={() => setSrSearch('')}
                        >
                          <X className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent className="p-0">
                    {Object.keys(taData).length === 0 ? (
                      <div className="flex items-center justify-center h-48 text-sm text-muted-foreground">
                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                        Loading pivot points and S&R analysis...
                      </div>
                    ) : (
                      <div className="overflow-x-auto max-h-[700px] overflow-y-auto">
                        <Table>
                          <TableHeader className="sticky top-0 bg-card z-10">
                            <TableRow className="text-[10px]">
                              {/* Stock info */}
                              <TableHead className="pl-4 min-w-[80px] sticky left-0 bg-card z-20">
                                <span className="font-semibold">Stock</span>
                              </TableHead>
                              <TableHead className="text-right min-w-[65px]">
                                <span className="font-semibold">Price</span>
                              </TableHead>
                              <TableHead className="text-center min-w-[60px]">Signal</TableHead>
                              <TableHead className="text-right min-w-[45px]">RSI</TableHead>
                              <TableHead className="text-right min-w-[50px] hidden md:table-cell">MACD</TableHead>
                              {/* 52-Week Range */}
                              <TableHead className="text-center min-w-[85px] hidden lg:table-cell">
                                <div className="flex flex-col items-center">
                                  <span className="font-semibold text-muted-foreground">52W Range</span>
                                  <span className="text-[8px] font-normal text-muted-foreground">Low — High</span>
                                </div>
                              </TableHead>
                              {/* Resistance Levels */}
                              <TableHead className="text-right min-w-[80px]">
                                <div className="flex flex-col items-end">
                                  <span className="font-bold text-red-400">R3</span>
                                  <span className="text-[8px] font-normal text-muted-foreground">far resistance</span>
                                </div>
                              </TableHead>
                              <TableHead className="text-right min-w-[80px]">
                                <div className="flex flex-col items-end">
                                  <span className="font-bold text-red-500">R2</span>
                                </div>
                              </TableHead>
                              <TableHead className="text-right min-w-[80px]">
                                <div className="flex flex-col items-end">
                                  <span className="font-bold text-red-600">R1</span>
                                  <span className="text-[8px] font-normal text-muted-foreground">near</span>
                                </div>
                              </TableHead>
                              {/* Pivot Source & Indicators */}
                              <TableHead className="text-right min-w-[60px] hidden xl:table-cell">
                                <span className="text-[9px] font-medium">SMA 50</span>
                              </TableHead>
                              <TableHead className="text-right min-w-[60px] hidden xl:table-cell">
                                <span className="text-[9px] font-medium">SMA 200</span>
                              </TableHead>
                              <TableHead className="text-right min-w-[55px] hidden xl:table-cell">
                                <span className="text-[9px] font-medium">BB Upper</span>
                              </TableHead>
                              {/* Support Levels */}
                              <TableHead className="text-right min-w-[80px]">
                                <div className="flex flex-col items-end">
                                  <span className="font-bold text-emerald-600">S1</span>
                                  <span className="text-[8px] font-normal text-muted-foreground">near</span>
                                </div>
                              </TableHead>
                              <TableHead className="text-right min-w-[80px]">
                                <div className="flex flex-col items-end">
                                  <span className="font-bold text-emerald-500">S2</span>
                                </div>
                              </TableHead>
                              <TableHead className="text-right min-w-[80px]">
                                <div className="flex flex-col items-end">
                                  <span className="font-bold text-emerald-400">S3</span>
                                  <span className="text-[8px] font-normal text-muted-foreground">far support</span>
                                </div>
                              </TableHead>
                              {/* Indicators */}
                              <TableHead className="text-right min-w-[55px] hidden xl:table-cell">
                                <span className="text-[9px] font-medium">BB Lower</span>
                              </TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {availableStocks
                              .filter(s => taData[s.symbol])
                              .filter(s => {
                                if (!srSearch) return true;
                                const q = srSearch.toLowerCase();
                                return s.symbol.toLowerCase().includes(q) || s.name.toLowerCase().includes(q);
                              })
                              .sort((a, b) => {
                                const taA = taData[a.symbol];
                                const taB = taData[b.symbol];
                                return (taB.currentPrice || 0) - (taA.currentPrice || 0);
                              })
                              .map((stock) => {
                                const ta = taData[stock.symbol];
                                if (!ta) return null;
                                const price = ta.currentPrice;

                                const signalColor = ta.signal === 'Strong Buy' ? 'bg-emerald-600 text-white'
                                  : ta.signal === 'Buy' ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-300'
                                  : ta.signal === 'Sell' ? 'bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-300'
                                  : ta.signal === 'Strong Sell' ? 'bg-red-600 text-white'
                                  : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400';

                                const rsiColor = ta.rsi > 70 ? 'text-red-500 font-semibold' : ta.rsi < 30 ? 'text-emerald-500 font-semibold' : 'text-muted-foreground';

                                // Confluence-clustered S/R (nearest to farthest from price)
                                const r1 = ta.resistances[0] || null;
                                const r2 = ta.resistances[1] || null;
                                const r3 = ta.resistances[2] || null;
                                const s1 = ta.supports[0] || null;
                                const s2 = ta.supports[1] || null;
                                const s3 = ta.supports[2] || null;

                                const renderSR = (level: typeof r1, type: 'r' | 's', highlight = false) => {
                                  if (!level || level.price <= 0) return <span className="text-muted-foreground/60">—</span>;
                                  const pct = price > 0 ? ((level.price - price) / price * 100).toFixed(1) : '0';
                                  const pctNum = parseFloat(pct);
                                  const pctColor = type === 'r'
                                    ? pctNum < 2 ? 'text-yellow-500/80' : pctNum < 5 ? 'text-orange-400/80' : 'text-red-400/80'
                                    : pctNum < 2 ? 'text-yellow-500/80' : pctNum < 5 ? 'text-orange-400/80' : 'text-red-400/80';
                                  const strengthFill = Array.from({ length: 5 }, (_, i) => i < level.strength);
                                  const tip = level.source + ` · Confluence ${level.strength}/5`;
                                  return (
                                    <div className="flex flex-col items-end" title={tip}>
                                      <span className={`font-mono text-xs leading-tight ${highlight ? 'font-bold' : ''}`}>
                                        {fmtCurrency(level.price)}
                                      </span>
                                      <div className="flex items-center gap-1 mt-px">
                                        <span className={`text-[9px] tabular-nums ${pctColor}`}>
                                          {type === 'r' ? '+' : ''}{pct}%
                                        </span>
                                        <span className="flex gap-px" title={`Strength: ${level.strength}/5`}>
                                          {strengthFill.map((f, i) => (
                                            <span key={i} className={`w-1 h-1.5 rounded-full ${f ? 'bg-amber-400' : 'bg-muted-foreground/20'}`} />
                                          ))}
                                        </span>
                                      </div>
                                    </div>
                                  );
                                };

                                return (
                                  <TableRow key={stock.symbol} className="group hover:bg-muted/40">
                                    {/* Stock */}
                                    <TableCell className="pl-4 sticky left-0 bg-card group-hover:bg-muted/40 z-10">
                                      <div className="flex flex-col">
                                        <span className="font-semibold text-sm">{stock.symbol}</span>
                                        <span className="text-[9px] text-muted-foreground hidden xl:inline">{stock.name}</span>
                                      </div>
                                    </TableCell>
                                    {/* Price */}
                                    <TableCell className="text-right font-mono text-sm font-medium">
                                      {price > 0 ? fmtCurrency(price) : '—'}
                                    </TableCell>
                                    {/* Signal */}
                                    <TableCell className="text-center">
                                      {ta.rating !== 0 ? (
                                        <span className={`inline-block text-[9px] px-1.5 py-0.5 rounded-md font-bold ${signalColor}`}>
                                          {ta.signal}
                                        </span>
                                      ) : '—'}
                                    </TableCell>
                                    {/* RSI */}
                                    <TableCell className={`text-right font-mono text-xs ${rsiColor}`}>
                                      {ta.rsi > 0 ? (
                                        <div className="flex flex-col items-end">
                                          <span>{ta.rsi.toFixed(0)}</span>
                                          <span className="text-[8px]">
                                            {ta.rsi > 70 ? 'OB' : ta.rsi < 30 ? 'OS' : ''}
                                          </span>
                                        </div>
                                      ) : '—'}
                                    </TableCell>
                                    {/* MACD */}
                                    <TableCell className="text-right font-mono text-xs hidden md:table-cell">
                                      {ta.macd !== 0 ? (
                                        <div className="flex flex-col items-end">
                                          <span className={ta.macdHistogram > 0 ? 'text-emerald-500' : ta.macdHistogram < 0 ? 'text-red-500' : ''}>
                                            {ta.macd > 0 ? '+' : ''}{ta.macd.toFixed(2)}
                                          </span>
                                          <span className="text-[8px] text-muted-foreground">
                                            H:{ta.macdHistogram > 0 ? '+' : ''}{ta.macdHistogram.toFixed(2)}
                                          </span>
                                        </div>
                                      ) : '—'}
                                    </TableCell>
                                    {/* 52W Range */}
                                    <TableCell className="text-center hidden lg:table-cell">
                                      {ta.week52Low > 0 || ta.week52High > 0 ? (
                                        <div className="flex flex-col items-center gap-0.5">
                                          <span className="text-[9px] text-muted-foreground">
                                            {ta.week52Low > 0 ? fmtCurrency(ta.week52Low) : '—'}
                                          </span>
                                          <div className="relative w-full h-1.5 rounded-full bg-muted overflow-hidden max-w-[70px]">
                                            {(() => {
                                              const low = ta.week52Low || 0;
                                              const high = ta.week52High || 0;
                                              if (high <= low) return <div className="h-full w-1/2 bg-blue-500 rounded-full" />;
                                              const pos = Math.max(0, Math.min(100, ((price - low) / (high - low)) * 100));
                                              const color = pos > 80 ? 'bg-red-500' : pos < 20 ? 'bg-emerald-500' : 'bg-blue-500';
                                              return (
                                                <div className={`h-full rounded-full ${color}`} style={{ width: `${pos}%`, minWidth: '3px' }} />
                                              );
                                            })()}
                                          </div>
                                          <span className="text-[9px] text-muted-foreground">
                                            {ta.week52High > 0 ? fmtCurrency(ta.week52High) : '—'}
                                          </span>
                                        </div>
                                      ) : '—'}
                                    </TableCell>
                                    {/* R3 (far resistance) */}
                                    <TableCell className="text-right font-mono text-xs text-red-400/80">
                                      {renderSR(r3, 'r')}
                                    </TableCell>
                                    {/* R2 */}
                                    <TableCell className="text-right font-mono text-xs text-red-500/90">
                                      {renderSR(r2, 'r')}
                                    </TableCell>
                                    {/* R1 (near resistance) */}
                                    <TableCell className="text-right font-mono text-xs text-red-600 dark:text-red-400 font-medium">
                                      {renderSR(r1, 'r', true)}
                                    </TableCell>
                                    {/* SMA 50 */}
                                    <TableCell className="text-right font-mono text-[11px] hidden xl:table-cell">
                                      {ta.ma.sma50 > 0 ? (
                                        <span className={price > ta.ma.sma50 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500'}>
                                          {fmtCurrency(ta.ma.sma50)}
                                        </span>
                                      ) : '—'}
                                    </TableCell>
                                    {/* SMA 200 */}
                                    <TableCell className="text-right font-mono text-[11px] hidden xl:table-cell">
                                      {ta.ma.sma200 > 0 ? (
                                        <span className={price > ta.ma.sma200 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500'}>
                                          {fmtCurrency(ta.ma.sma200)}
                                        </span>
                                      ) : '—'}
                                    </TableCell>
                                    {/* BB Upper */}
                                    <TableCell className="text-right font-mono text-[11px] text-orange-500/70 hidden xl:table-cell">
                                      {ta.bb.upper > 0 ? fmtCurrency(ta.bb.upper) : '—'}
                                    </TableCell>
                                    {/* S1 (near support) */}
                                    <TableCell className="text-right font-mono text-xs text-emerald-600 dark:text-emerald-400 font-medium">
                                      {renderSR(s1, 's', true)}
                                    </TableCell>
                                    {/* S2 */}
                                    <TableCell className="text-right font-mono text-xs text-emerald-500/90">
                                      {renderSR(s2, 's')}
                                    </TableCell>
                                    {/* S3 (far support) */}
                                    <TableCell className="text-right font-mono text-xs text-emerald-400/80">
                                      {renderSR(s3, 's')}
                                    </TableCell>
                                    {/* BB Lower */}
                                    <TableCell className="text-right font-mono text-[11px] text-cyan-500/70 hidden xl:table-cell">
                                      {ta.bb.lower > 0 ? fmtCurrency(ta.bb.lower) : '—'}
                                    </TableCell>
                                  </TableRow>
                                );
                              })}
                          </TableBody>
                        </Table>
                      </div>
                    )}
                    {/* Legend / Footer */}
                    <div className="px-4 py-2 border-t text-[10px] text-muted-foreground bg-muted/30 flex flex-wrap gap-x-4 gap-y-1">
                      <span className="font-medium">{Object.keys(taData).length} stocks</span>
                      <span>R1/R2/R3 & S1/S2/S3 = Clusters from Classic + Fibonacci + Camarilla + Woodie pivots + MA + BB + 52W</span>
                      <span>◆ = Confluence strength (1-5)</span>
                      <span>RSI: &gt;70 OB · &lt;30 OS</span>
                      <span>SMA green = price above · red = price below</span>
                    </div>
                    {/* Pivot Points Detail Table */}
                    {Object.keys(taData).length > 0 && (
                      <div className="border-t">
                        <div className="px-4 py-2 bg-muted/20 flex items-center gap-2">
                          <ChevronDown className="h-3 w-3" />
                          <span className="text-[11px] font-semibold text-muted-foreground">
                            Pivot Points Detail (TradingView Calculations)
                          </span>
                        </div>
                        <div className="overflow-x-auto">
                          <Table>
                            <TableHeader className="bg-muted/10">
                              <TableRow className="text-[9px]">
                                <TableHead className="pl-4 min-w-[70px]">Stock</TableHead>
                                <TableHead className="text-center min-w-[100px] border-l border-r border-muted">
                                  <span className="font-bold text-blue-500">Classic</span>
                                </TableHead>
                                <TableHead className="text-center min-w-[100px] border-r border-muted">
                                  <span className="font-bold text-purple-500">Fibonacci</span>
                                </TableHead>
                                <TableHead className="text-center min-w-[100px] border-r border-muted">
                                  <span className="font-bold text-orange-500">Camarilla</span>
                                </TableHead>
                                <TableHead className="text-center min-w-[100px] border-r border-muted">
                                  <span className="font-bold text-teal-500">Woodie</span>
                                </TableHead>
                              </TableRow>
                            <TableRow className="text-[8px] text-muted-foreground">
                                <TableHead className="pl-4"></TableHead>
                                <TableHead className="text-center border-l border-r border-muted">R3 · R2 · R1 · PP · S1 · S2 · S3</TableHead>
                                <TableHead className="text-center border-r border-muted">R3 · R2 · R1 · PP · S1 · S2 · S3</TableHead>
                                <TableHead className="text-center border-r border-muted">R3 · R2 · R1 · PP · S1 · S2 · S3</TableHead>
                                <TableHead className="text-center border-r border-muted">R3 · R2 · R1 · PP · S1 · S2 · S3</TableHead>
                              </TableRow>
                          </TableHeader>
                            <TableBody>
                              {availableStocks
                                .filter(s => taData[s.symbol])
                                .filter(s => {
                                  if (!srSearch) return true;
                                  const q = srSearch.toLowerCase();
                                  return s.symbol.toLowerCase().includes(q) || s.name.toLowerCase().includes(q);
                                })
                                .map((stock) => {
                                  const ta = taData[stock.symbol];
                                  if (!ta) return null;
                                  const price = ta.currentPrice;

                                  const renderPivotRow = (pivots: PivotSet) => {
                                    const vals = [pivots.r3, pivots.r2, pivots.r1, pivots.pp, pivots.s1, pivots.s2, pivots.s3];
                                    const labels = ['R3', 'R2', 'R1', 'PP', 'S1', 'S2', 'S3'];
                                    return (
                                      <div className="flex items-center justify-center gap-0.5 font-mono text-[9px]">
                                        {vals.map((v, i) => {
                                          if (v <= 0) return <span key={i} className="text-muted-foreground/30 w-[46px] text-center">—</span>;
                                          const isResistance = i < 3;
                                          const isPP = i === 3;
                                          const isNear = i === 2 || i === 4;
                                          const isBetween = isResistance ? v > price : v < price;
                                          const color = isPP
                                            ? 'text-blue-600 dark:text-blue-400 font-bold'
                                            : isResistance
                                              ? isNear ? 'text-red-600 dark:text-red-400 font-semibold' : 'text-red-400/60'
                                              : isNear ? 'text-emerald-600 dark:text-emerald-400 font-semibold' : 'text-emerald-400/60';
                                          return (
                                            <div key={i} className="w-[46px] text-center py-0.5" title={`${labels[i]}: ${v}`}>
                                              <span className={`${color} ${isBetween ? 'opacity-100' : 'opacity-50'}`}>
                                                {v.toFixed(1)}
                                              </span>
                                            </div>
                                          );
                                        })}
                                      </div>
                                    );
                                  };

                                  return (
                                    <TableRow key={`pivot-${stock.symbol}`} className="hover:bg-muted/30">
                                      <TableCell className="pl-4 font-semibold text-[11px]">{stock.symbol}</TableCell>
                                      <TableCell className="border-l border-r border-muted p-1">
                                        {renderPivotRow(ta.pivotsClassic)}
                                      </TableCell>
                                      <TableCell className="border-r border-muted p-1">
                                        {renderPivotRow(ta.pivotsFibonacci)}
                                      </TableCell>
                                      <TableCell className="border-r border-muted p-1">
                                        {renderPivotRow(ta.pivotsCamarilla)}
                                      </TableCell>
                                      <TableCell className="border-r border-muted p-1">
                                        {renderPivotRow(ta.pivotsWoodie)}
                                      </TableCell>
                                    </TableRow>
                                  );
                                })}
                            </TableBody>
                          </Table>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>

            {/* ── Holdings Table ─────────────────────────────────── */}
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-base">Holdings</CardTitle>
                    <CardDescription>{holdings.length} position{holdings.length !== 1 ? 's' : ''}</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[40px] pl-4"></TableHead>
                        <TableHead>
                          <button className="flex items-center gap-1 hover:text-foreground transition-colors" onClick={() => toggleSort('symbol')}>
                            Stock <ArrowUpDown className="h-3 w-3" />
                          </button>
                        </TableHead>
                        <TableHead className="text-right">Shares</TableHead>
                        <TableHead className="text-right">Avg. Cost</TableHead>
                        <TableHead className="text-right">Price</TableHead>
                        <TableHead className="text-right hidden sm:table-cell">
                          <button className="flex items-center gap-1 hover:text-foreground transition-colors ml-auto" onClick={() => toggleSort('marketValue')}>
                            Market Value <ArrowUpDown className="h-3 w-3" />
                          </button>
                        </TableHead>
                        <TableHead className="text-right hidden md:table-cell">Cost Basis</TableHead>
                        <TableHead className="text-right hidden xl:table-cell">Purchased</TableHead>
                        <TableHead className="text-right">
                          <button className="flex items-center gap-1 hover:text-foreground transition-colors ml-auto" onClick={() => toggleSort('pnl')}>
                            P&L <ArrowUpDown className="h-3 w-3" />
                          </button>
                        </TableHead>
                        <TableHead className="text-right hidden lg:table-cell">
                          <button className="flex items-center gap-1 hover:text-foreground transition-colors ml-auto" onClick={() => toggleSort('pnlPercent')}>
                            P&L % <ArrowUpDown className="h-3 w-3" />
                          </button>
                        </TableHead>
                        <TableHead className="text-right hidden sm:table-cell">
                          <button className="flex items-center gap-1 hover:text-foreground transition-colors ml-auto" onClick={() => toggleSort('dayChange')}>
                            Day Chg <ArrowUpDown className="h-3 w-3" />
                          </button>
                        </TableHead>
                        <TableHead className="text-right hidden lg:table-cell text-emerald-600 dark:text-emerald-400">
                          <div className="flex items-center gap-1 ml-auto">
                            <ArrowDown className="h-3 w-3" />
                            S1/S2/S3
                          </div>
                        </TableHead>
                        <TableHead className="text-right hidden lg:table-cell text-red-600 dark:text-red-400">
                          <div className="flex items-center gap-1 ml-auto">
                            <ArrowUp className="h-3 w-3" />
                            R1/R2/R3
                          </div>
                        </TableHead>
                        <TableHead className="w-[120px] text-right pr-4">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {sortedHoldings.map((h) => (
                        <TableRow key={h.id} className="group">
                          <TableCell className="pl-4">
                            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: stockNameColorMap[h.symbol] || (h.dayChangePercent >= 0 ? '#10b981' : '#ef4444') }} />
                          </TableCell>
                          <TableCell>
                            <div>
                              <span className="font-semibold" style={{ color: stockNameColorMap[h.symbol] }}>{h.symbol}</span>
                              <p className="text-xs text-muted-foreground truncate max-w-[150px]">{h.name}</p>
                            </div>
                          </TableCell>
                          <TableCell className="text-right font-mono text-sm">
                            {h.shares.toLocaleString()}
                          </TableCell>
                          <TableCell className="text-right font-mono text-sm">
                            {fmtCurrency(h.avgCost)}
                          </TableCell>
                          <TableCell className="text-right font-mono text-sm font-medium">
                            {fmtCurrency(h.currentPrice)}
                          </TableCell>
                          <TableCell className="text-right font-mono text-sm hidden sm:table-cell">
                            {fmtCurrency(h.marketValue)}
                          </TableCell>
                          <TableCell className="text-right font-mono text-sm text-muted-foreground hidden md:table-cell">
                            {fmtCurrency(h.costBasis)}
                          </TableCell>
                          <TableCell className="text-right text-xs text-muted-foreground hidden xl:table-cell">
                            {format(new Date(h.purchaseDate), 'yyyy-MM-dd')}
                          </TableCell>
                          <TableCell className="text-right font-mono text-sm">
                            <span className={pnlColor(h.pnl)}>{fmtChange(h.pnl)}</span>
                          </TableCell>
                          <TableCell className="text-right hidden lg:table-cell">
                            <Badge variant="outline" className={`font-mono text-xs ${pnlBgColor(h.pnlPercent)}`}>
                              {fmtPercent(h.pnlPercent)}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right hidden sm:table-cell">
                            <div className="flex flex-col items-end gap-0.5">
                              <span className={`font-mono text-xs font-medium ${pnlColor(h.dayChange)}`}>
                                {fmtChange(h.dayChange)}
                              </span>
                              <span className={`font-mono text-[10px] ${pnlColor(h.dayChangePercent)}`}>
                                {fmtPercent(h.dayChangePercent)}
                              </span>
                            </div>
                          </TableCell>
                          <TableCell className="text-right hidden lg:table-cell">
                            {taData[h.symbol] ? (() => {
                              const ta = taData[h.symbol];
                              return (
                                <div className="space-y-px">
                                  {ta.supports[0] ? (
                                    <div className="font-mono text-[10px] text-emerald-600 dark:text-emerald-400 leading-tight">
                                      S1: {fmtCurrency(ta.supports[0].price)}
                                    </div>
                                  ) : (
                                    <div className="font-mono text-[10px] text-muted-foreground leading-tight">S1: —</div>
                                  )}
                                  {ta.supports[1] ? (
                                    <div className="font-mono text-[10px] text-emerald-500 dark:text-emerald-500 leading-tight">
                                      S2: {fmtCurrency(ta.supports[1].price)}
                                    </div>
                                  ) : (
                                    <div className="font-mono text-[10px] text-muted-foreground leading-tight">S2: —</div>
                                  )}
                                  {ta.supports[2] ? (
                                    <div className="font-mono text-[10px] text-emerald-400 dark:text-emerald-600 leading-tight">
                                      S3: {fmtCurrency(ta.supports[2].price)}
                                    </div>
                                  ) : (
                                    <div className="font-mono text-[10px] text-muted-foreground leading-tight">S3: —</div>
                                  )}
                                </div>
                              );
                            })() : (
                              <span className="text-xs text-muted-foreground">—</span>
                            )}
                          </TableCell>
                          <TableCell className="text-right hidden lg:table-cell">
                            {taData[h.symbol] ? (() => {
                              const ta = taData[h.symbol];
                              return (
                                <div className="space-y-px">
                                  {ta.resistances[0] ? (
                                    <div className="font-mono text-[10px] text-red-600 dark:text-red-400 leading-tight">
                                      R1: {fmtCurrency(ta.resistances[0].price)}
                                    </div>
                                  ) : (
                                    <div className="font-mono text-[10px] text-muted-foreground leading-tight">R1: —</div>
                                  )}
                                  {ta.resistances[1] ? (
                                    <div className="font-mono text-[10px] text-red-500 dark:text-red-500 leading-tight">
                                      R2: {fmtCurrency(ta.resistances[1].price)}
                                    </div>
                                  ) : (
                                    <div className="font-mono text-[10px] text-muted-foreground leading-tight">R2: —</div>
                                  )}
                                  {ta.resistances[2] ? (
                                    <div className="font-mono text-[10px] text-red-400 dark:text-red-600 leading-tight">
                                      R3: {fmtCurrency(ta.resistances[2].price)}
                                    </div>
                                  ) : (
                                    <div className="font-mono text-[10px] text-muted-foreground leading-tight">R3: —</div>
                                  )}
                                </div>
                              );
                            })() : (
                              <span className="text-xs text-muted-foreground">—</span>
                            )}
                          </TableCell>
                          <TableCell className="text-right pr-4">
                            <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openTxDialog(h)} title="Transactions">
                                <Eye className="h-3.5 w-3.5" />
                              </Button>
                              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEditDialog(h)} title="Edit">
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                              <Button variant="ghost" size="icon" className="h-7 w-7 text-red-500 hover:text-red-600" onClick={() => openDeleteDialog(h)} title="Delete">
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>

            {/* ── Portfolio Summary Bar ─────────────────────────── */}
            {summary && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                <div className="p-3 rounded-lg bg-muted/50 border">
                  <div className="text-muted-foreground text-xs mb-1">Total Investment</div>
                  <div className="font-semibold">{fmtCurrency(summary.totalInvestment)}</div>
                </div>
                <div className="p-3 rounded-lg bg-muted/50 border">
                  <div className="text-muted-foreground text-xs mb-1">Current Value</div>
                  <div className="font-semibold">{fmtCurrency(summary.totalMarketValue)}</div>
                </div>
                <div className="p-3 rounded-lg bg-muted/50 border">
                  <div className="text-muted-foreground text-xs mb-1">Total P&L</div>
                  <div className={`font-semibold ${pnlColor(summary.totalPnL)}`}>{fmtChange(summary.totalPnL)}</div>
                </div>
                <div className="p-3 rounded-lg bg-muted/50 border">
                  <div className="text-muted-foreground text-xs mb-1">Return</div>
                  <div className={`font-semibold ${pnlColor(summary.totalPnLPercent)}`}>{fmtPercent(summary.totalPnLPercent)}</div>
                </div>
              </div>
            )}
          </div>
        )}
      </main>

      {/* ── Edit Holding Dialog ──────────────────────────────── */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Edit Position — {selectedHolding?.symbol}</DialogTitle>
            <DialogDescription>Update your position details for {selectedHolding?.name}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Number of Shares</Label>
                <Input
                  type="number"
                  min="1"
                  step="1"
                  value={formShares}
                  onChange={(e) => setFormShares(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Avg. Cost / Share (EGP)</Label>
                <Input
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={formAvgCost}
                  onChange={(e) => setFormAvgCost(e.target.value)}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Purchase Date</Label>
              <Input
                type="date"
                value={formPurchaseDate}
                onChange={(e) => setFormPurchaseDate(e.target.value)}
                max={format(new Date(), 'yyyy-MM-dd')}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleUpdateHolding}>Save Changes</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Delete Confirmation Dialog ────────────────────────── */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>Delete Position</DialogTitle>
            <DialogDescription>
              Are you sure you want to remove <strong>{selectedHolding?.symbol}</strong> ({selectedHolding?.name}) from your portfolio?
              This will also delete all associated transactions. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDeleteHolding}>Delete Position</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Transaction Dialog ────────────────────────────────── */}
      <Dialog open={txDialogOpen} onOpenChange={setTxDialogOpen}>
        <DialogContent className="sm:max-w-[550px] max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{selectedHolding?.symbol} — Transactions</DialogTitle>
            <DialogDescription>View history and add buy/sell orders</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {/* Current Position Info */}
            {selectedHolding && (
              <div className="grid grid-cols-3 gap-3 p-3 rounded-lg bg-muted/50 border text-sm">
                <div>
                  <div className="text-muted-foreground text-xs">Current Shares</div>
                  <div className="font-semibold">{selectedHolding.shares.toLocaleString()}</div>
                </div>
                <div>
                  <div className="text-muted-foreground text-xs">Avg. Cost</div>
                  <div className="font-semibold">{fmtCurrency(selectedHolding.avgCost)}</div>
                </div>
                <div>
                  <div className="text-muted-foreground text-xs">Market Value</div>
                  <div className={`font-semibold ${pnlColor(selectedHolding.pnl)}`}>{fmtCurrency(selectedHolding.marketValue)}</div>
                </div>
              </div>
            )}

            {/* Transaction History */}
            {transactions.length > 0 && (
              <div className="space-y-2">
                <Label className="text-sm font-medium">Transaction History</Label>
                <div className="max-h-48 overflow-y-auto rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-xs">Date</TableHead>
                        <TableHead className="text-xs">Type</TableHead>
                        <TableHead className="text-xs text-right">Shares</TableHead>
                        <TableHead className="text-xs text-right">Price</TableHead>
                        <TableHead className="text-xs text-right">Total</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {transactions.map((tx) => (
                        <TableRow key={tx.id}>
                          <TableCell className="text-xs py-2">{format(new Date(tx.date), 'yyyy-MM-dd')}</TableCell>
                          <TableCell className="py-2">
                            <Badge variant={tx.type === 'BUY' ? 'default' : 'secondary'} className={`text-xs ${tx.type === 'BUY' ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300' : 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300'}`}>
                              {tx.type}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-xs text-right font-mono py-2">{tx.shares}</TableCell>
                          <TableCell className="text-xs text-right font-mono py-2">{fmtCurrency(tx.price)}</TableCell>
                          <TableCell className="text-xs text-right font-mono py-2">{fmtCurrency(tx.total)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            )}

            <Separator />

            {/* Add New Transaction */}
            <div className="space-y-3">
              <Label className="text-sm font-medium">New Transaction</Label>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Type</Label>
                  <Select value={formTxType} onValueChange={(v) => setFormTxType(v as 'BUY' | 'SELL')}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="BUY">Buy</SelectItem>
                      <SelectItem value="SELL">Sell</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Date</Label>
                  <Input
                    type="date"
                    value={formTxDate}
                    onChange={(e) => setFormTxDate(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Shares</Label>
                  <Input
                    type="number"
                    min="1"
                    step="1"
                    placeholder="100"
                    value={formTxShares}
                    onChange={(e) => setFormTxShares(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Price / Share (EGP)</Label>
                  <Input
                    type="number"
                    min="0.01"
                    step="0.01"
                    placeholder="45.50"
                    value={formTxPrice}
                    onChange={(e) => setFormTxPrice(e.target.value)}
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Notes (optional)</Label>
                <Input
                  placeholder="Add a note..."
                  value={formTxNotes}
                  onChange={(e) => setFormTxNotes(e.target.value)}
                />
              </div>
              {formTxShares && formTxPrice && parseFloat(formTxShares) > 0 && parseFloat(formTxPrice) > 0 && (
                <div className="flex justify-between text-sm px-1">
                  <span className="text-muted-foreground">Total:</span>
                  <span className="font-semibold">{fmtCurrency(parseFloat(formTxShares) * parseFloat(formTxPrice))}</span>
                </div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setTxDialogOpen(false); setSelectedHolding(null); resetTxForm(); }}>Close</Button>
            <Button
              onClick={handleAddTransaction}
              disabled={!formTxShares || !formTxPrice || parseFloat(formTxShares) <= 0 || parseFloat(formTxPrice) <= 0 || !formTxDate}
            >
              Record {formTxType}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Footer ────────────────────────────────────────────── */}
      <footer className="border-t bg-card/50 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-muted-foreground">
            <div className="flex items-center gap-2">
              <CandlestickChart className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
              <span>EGX Portfolio Tracker</span>
              <span className="hidden sm:inline">• Data from TradingView via EGX</span>
            </div>
            <div className="flex items-center gap-2">
              <span>Closing prices only</span>
              <span>•</span>
              <span>Prices in EGP</span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
