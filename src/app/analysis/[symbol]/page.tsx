'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft,
  Star,
  RefreshCw,
  TrendingUp,
  TrendingDown,
  Target,
  Brain,
 BarChart3,
  Activity,
  ChevronRight,
  Building2,
  Zap,
 Shield,
  AlertTriangle,
  Clock,
  Eye,
  FileSearch,
  Gauge,
  Sparkles,
} from 'lucide-react';

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';

import TradingViewChart from '@/components/analysis/tradingview-chart';
import FairValueGauge from '@/components/analysis/fair-value-gauge';
import ValuationBreakdown from '@/components/analysis/valuation-breakdown';
import SensitivityMatrix from '@/components/analysis/sensitivity-matrix';
import RatioDashboard from '@/components/analysis/ratio-dashboard';
import TechnicalAnalysisSection from '@/components/analysis/technical-analysis-section';
import PeerComparisonTable from '@/components/analysis/peer-comparison-table';
import MonteCarloChart from '@/components/analysis/monte-carlo-chart';
import ResearchReport from '@/components/analysis/research-report';
import SectorModelsPanel from '@/components/analysis/sector-models-panel';
import ConfidenceScorePanel from '@/components/analysis/confidence-score-panel';
import AuditTrailPanel from '@/components/analysis/audit-trail-panel';
import AIFairValueCard from '@/components/analysis/ai-fair-value-card';

import { fmtCurrency, fmtPercent, fmtNumber, pnlColor, timeAgo } from '@/utils/formatters';
import { useAutoRefresh, REFRESH_INTERVALS } from '@/hooks/use-auto-refresh';
import { EGX_STOCKS } from '@/lib/egx-stocks';
import { isWatched, addToWatchlist, removeFromWatchlist } from '@/lib/watchlist-store';
import type { FairValueResult } from '@/lib/fair-value-engine';
import type { FundamentalData } from '@/lib/fundamentals';

// ── Types ──────────────────────────────────────────────────────────────

interface LiveQuote {
  price: number;
  changePercent: number;
  changeAbs: number;
  volume: number;
}

interface CompanyData {
  fairValue: FairValueResult | null;
  fundamentals: FundamentalData | null;
  liveQuote: LiveQuote | null;
}

// ── Animation Config ──────────────────────────────────────────────────

const tabVariants = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -8 },
};

const headerFade = {
  initial: { opacity: 0, y: -6 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -6 },
};

// ── Helpers ────────────────────────────────────────────────────────────

function formatMarketCap(mcap: number): string {
  if (mcap >= 1e12) return `${(mcap / 1e12).toFixed(2)}T EGP`;
  if (mcap >= 1e9) return `${(mcap / 1e9).toFixed(2)}B EGP`;
  if (mcap >= 1e6) return `${(mcap / 1e6).toFixed(0)}M EGP`;
  if (mcap > 0) return fmtCurrency(mcap);
  return '—';
}

function valuationStatusColor(status: string) {
  if (status === 'Undervalued') return 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800';
  if (status === 'Fairly Valued' || status === 'Fair') return 'bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-800';
  if (status === 'Overvalued') return 'bg-red-500/15 text-red-700 dark:text-red-400 border-red-200 dark:border-red-800';
  return 'bg-muted text-muted-foreground border-border';
}

function valuationStatusIcon(status: string) {
  if (status === 'Undervalued') return <TrendingUp className="size-3" />;
  if (status === 'Overvalued') return <TrendingDown className="size-3" />;
  return <Shield className="size-3" />;
}

// ── Skeletons ──────────────────────────────────────────────────────────

function HeaderSkeleton() {
  return (
    <div className="w-full backdrop-blur-xl bg-background/80 border-b border-border/50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 space-y-3">
        {/* Top row */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Skeleton className="h-10 w-10 rounded-xl" />
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Skeleton className="h-6 w-36" />
                <Skeleton className="h-5 w-14 rounded-md" />
                <Skeleton className="h-5 w-20 rounded-full" />
              </div>
              <Skeleton className="h-4 w-28" />
            </div>
          </div>
          <Skeleton className="h-9 w-24 rounded-md" />
        </div>
        {/* Price row */}
        <div className="flex items-center gap-4">
          <Skeleton className="h-9 w-32" />
          <Skeleton className="h-6 w-16" />
          <Skeleton className="h-5 w-24 rounded-full" />
          <Skeleton className="h-5 w-20 rounded-full" />
        </div>
      </div>
    </div>
  );
}

function TabContentSkeleton() {
  return (
    <div className="space-y-6">
      {/* Chart skeleton */}
      <Skeleton className="h-[500px] w-full rounded-xl" />
      {/* Cards row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Skeleton className="h-72 rounded-xl" />
        <Skeleton className="h-72 rounded-xl" />
        <Skeleton className="h-72 rounded-xl" />
      </div>
    </div>
  );
}

function NotFoundState() {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <Card className="max-w-md mx-4 border-border/50">
        <CardContent className="flex flex-col items-center gap-4 py-10 text-center">
          <div className="size-14 rounded-2xl bg-muted/50 flex items-center justify-center">
            <AlertTriangle className="size-7 text-amber-500" />
          </div>
          <div className="space-y-1.5">
            <h2 className="text-lg font-semibold">Stock Not Found</h2>
            <p className="text-sm text-muted-foreground">
              The symbol you&apos;re looking for doesn&apos;t exist in our EGX database.
            </p>
          </div>
          <Button asChild variant="outline" className="gap-2 mt-2">
            <Link href="/analysis">
              <ArrowLeft className="size-4" />
              Back to Analysis
            </Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

// ── Key Metrics Card (Overview Tab) ──────────────────────────────────

function KeyMetricsCard({ data, fairValue }: { data: FundamentalData | null; fairValue: FairValueResult | null }) {
  const price = data?.price || fairValue?.currentPrice || 0;

  const metrics = useMemo(() => {
    if (!data && !fairValue) return [];
    return [
      { label: 'P/E Ratio', value: data?.pe ? fmtNumber(data.pe, 1) : '—', good: data?.pe != null && data.pe > 0 && data.pe < 20 },
      { label: 'P/B Ratio', value: data?.pb ? fmtNumber(data.pb, 2) : '—', good: data?.pb != null && data.pb > 0 && data.pb < 3 },
      { label: 'EPS', value: data?.eps ? fmtCurrency(data.eps) : '—', good: data ? data.eps > 0 : false },
      { label: 'Div. Yield', value: data?.dividendYield != null && data.dividendYield > 0 ? `${data.dividendYield.toFixed(1)}%` : '—', good: data ? data.dividendYield >= 3 : false },
      { label: 'ROE', value: data?.roe != null && data.roe > 0 ? `${data.roe.toFixed(1)}%` : '—', good: data ? data.roe >= 15 : false },
      { label: 'Volume', value: data?.volume != null && data.volume > 0 ? `${(data.volume / 1e6).toFixed(1)}M` : '—', good: false },
      { label: '52W Low', value: data?.week52Low != null && data.week52Low > 0 ? fmtCurrency(data.week52Low) : '—', good: false },
      { label: '52W High', value: data?.week52High != null && data.week52High > 0 ? fmtCurrency(data.week52High) : '—', good: false },
    ];
  }, [data, fairValue]);

  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-2 pt-4 px-4">
        <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
          <Zap className="size-3.5" />
          Key Metrics
        </CardTitle>
      </CardHeader>
      <CardContent className="px-4 pb-4">
        <div className="space-y-0">
          {metrics.map((m, i) => (
            <div
              key={m.label}
              className={`flex items-center justify-between py-2 ${
                i < metrics.length - 1 ? 'border-b border-border/40' : ''
              }`}
            >
              <span className="text-xs text-muted-foreground">{m.label}</span>
              <span
                className={`text-xs font-mono font-semibold tabular-nums ${
                  m.good ? 'text-emerald-600 dark:text-emerald-400' : 'text-foreground'
                }`}
              >
                {m.value}
              </span>
            </div>
          ))}
          {/* 52W Range Bar */}
          {data?.week52Low != null && data.week52Low > 0 && data.week52High != null && data.week52High > 0 && price > 0 && (
            <div className="pt-3">
              <div className="flex justify-between text-[10px] text-muted-foreground mb-1">
                <span>{fmtCurrency(data.week52Low)}</span>
                <span>{fmtCurrency(data.week52High)}</span>
              </div>
              <div className="h-1.5 bg-muted rounded-full overflow-hidden relative">
                <div
                  className="absolute h-full rounded-full bg-primary/30"
                  style={{
                    left: '0%',
                    right: `${data.week52High > data.week52Low
                      ? ((data.week52High - price) / (data.week52High - data.week52Low)) * 100
                      : 0}%`,
                  }}
                />
                <div
                  className="absolute h-full w-1.5 bg-primary rounded-full"
                  style={{
                    left: `${((price - data.week52Low) / (data.week52High - data.week52Low)) * 100}%`,
                  }}
                />
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// ── Price Targets Card (Overview Tab) ─────────────────────────────────

function PriceTargetsCard({ fairValue }: { fairValue: FairValueResult | null }) {
  if (!fairValue || fairValue.bullishTarget <= 0) return null;

  const currentPrice = fairValue.currentPrice;
  const targets = [
    { label: 'Bearish', value: fairValue.bearishTarget, icon: TrendingDown, color: 'text-red-600 dark:text-red-400', border: 'border-red-200 dark:border-red-800' },
    { label: 'Base Case', value: fairValue.baseTarget, icon: Target, color: 'text-foreground', border: 'border-primary/30' },
    { label: 'Bullish', value: fairValue.bullishTarget, icon: TrendingUp, color: 'text-emerald-600 dark:text-emerald-400', border: 'border-emerald-200 dark:border-emerald-800' },
  ];

  const maxTarget = Math.max(fairValue.bullishTarget, currentPrice * 1.5);

  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-2 pt-4 px-4">
        <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
          <Target className="size-3.5" />
          Price Targets
        </CardTitle>
      </CardHeader>
      <CardContent className="px-4 pb-4 space-y-3">
        {targets.map(t => {
          const upside = currentPrice > 0 ? ((t.value - currentPrice) / currentPrice) * 100 : 0;
          return (
            <div key={t.label} className={`rounded-lg border p-3 ${t.border}`}>
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-1.5">
                  <t.icon className={`size-3.5 ${t.color}`} />
                  <span className="text-xs font-medium text-muted-foreground">{t.label}</span>
                </div>
                <span className={`text-sm font-bold font-mono tabular-nums ${t.color}`}>
                  {fmtCurrency(t.value)}
                </span>
              </div>
              <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${Math.max(5, (t.value / maxTarget) * 100)}%` }}
                  transition={{ duration: 0.8, ease: 'easeOut' }}
                  className={`h-full rounded-full ${
                    t.label === 'Bullish'
                      ? 'bg-emerald-500'
                      : t.label === 'Bearish'
                        ? 'bg-red-500'
                        : 'bg-primary'
                  }`}
                />
              </div>
              <div className="flex items-center justify-between mt-1">
                <span className="text-[10px] text-muted-foreground">vs. {fmtCurrency(currentPrice)}</span>
                <span className={`text-[10px] font-mono font-semibold ${pnlColor(upside)}`}>
                  {fmtPercent(upside)}
                </span>
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

// ── Model Weights Visualization (Valuation Tab) ──────────────────────────

function ModelWeightsBar({ weights }: { weights: { dcf: number; relative: number; ddm: number; asset: number } }) {
  const models = [
    { key: 'DCF', weight: weights.dcf, color: 'bg-emerald-500/80', textColor: 'text-emerald-600 dark:text-emerald-400' },
    { key: 'Relative', weight: weights.relative, color: 'bg-sky-500/80', textColor: 'text-sky-600 dark:text-sky-400' },
    { key: 'DDM', weight: weights.ddm, color: 'bg-amber-500/80', textColor: 'text-amber-600 dark:text-amber-400' },
    { key: 'Asset', weight: weights.asset, color: 'bg-purple-500/80', textColor: 'text-purple-600 dark:text-purple-400' },
  ];

  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-2 pt-4 px-4">
        <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
          <BarChart3 className="size-3.5" />
          Model Weights
        </CardTitle>
      </CardHeader>
      <CardContent className="px-4 pb-4 space-y-3">
        <div className="h-3 rounded-full overflow-hidden flex">
          {models.map(m => (
            m.weight > 0 ? (
              <motion.div
                key={m.key}
                initial={{ width: 0 }}
                animate={{ width: `${m.weight * 100}%` }}
                transition={{ duration: 0.6, ease: 'easeOut' }}
                className={`h-full ${m.color} ${
                  m.key === 'DCF' ? 'rounded-l-full' : m.key === 'Asset' ? 'rounded-r-full' : ''
                }`}
                title={`${m.key}: ${(m.weight * 100).toFixed(0)}%`}
              />
            ) : null
          ))}
        </div>
        <div className="flex items-center gap-4">
          {models.map(m =>
            m.weight > 0 ? (
              <div key={m.key} className="flex items-center gap-1.5">
                <span className={`size-2 rounded-full ${m.color}`} />
                <span className={`text-[11px] font-medium ${m.textColor}`}>
                  {m.key}
                </span>
                <span className="text-[11px] font-mono tabular-nums text-muted-foreground">
                  {(m.weight * 100).toFixed(0)}%
                </span>
              </div>
            ) : null
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// ── Main Page Component ────────────────────────────────────────────────

export default function StockDetailPage() {
  const params = useParams();
  const symbol = (params.symbol as string)?.toUpperCase() || '';

  const [data, setData] = useState<CompanyData>({
    fairValue: null,
    fundamentals: null,
    liveQuote: null,
  });
  const [initialLoading, setInitialLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('overview');
  const [watched, setWatched] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  // Check if symbol exists in EGX database
  const stockInfo = EGX_STOCKS.find(s => s.symbol === symbol);
  const symbolExists = !!stockInfo || symbol.length > 0;

  // ── Data Fetching ──────────────────────────────────────────────

  const fetchFairValue = useCallback(async () => {
    try {
      const res = await fetch(`/api/analysis/fair-value?symbol=${encodeURIComponent(symbol)}`, { cache: 'no-store' });
      if (!res.ok) return;
      const fvData: FairValueResult = await res.json();
      setData(prev => ({ ...prev, fairValue: fvData }));
    } catch (err) {
      console.error('[StockDetail] Fair value fetch error:', err);
    }
  }, [symbol]);

  const fetchFundamentals = useCallback(async () => {
    try {
      const res = await fetch(`/api/analysis/fundamentals?symbols=${encodeURIComponent(symbol)}`, { cache: 'no-store' });
      if (!res.ok) return;
      const fundMap = await res.json();
      const fundData: FundamentalData = fundMap[symbol] || null;
      setData(prev => ({ ...prev, fundamentals: fundData }));
    } catch (err) {
      console.error('[StockDetail] Fundamentals fetch error:', err);
    }
  }, [symbol]);

  const fetchLiveQuote = useCallback(async () => {
    try {
      const res = await fetch(`/api/market-data/live?symbols=${encodeURIComponent(symbol)}`, { cache: 'no-store' });
      if (!res.ok) return;
      const json = await res.json();
      const stockData = json.stocks?.[symbol];
      if (stockData) {
        setData(prev => ({
          ...prev,
          liveQuote: {
            price: stockData.price,
            changePercent: stockData.changePercent,
            changeAbs: stockData.changeAbs,
            volume: stockData.volume,
          },
        }));
      }
      setLastUpdated(new Date());
    } catch (err) {
      console.error('[StockDetail] Live quote fetch error:', err);
    }
  }, [symbol]);

  // Initial load: fetch all data
  const fetchAllData = useCallback(async () => {
    if (!symbol) return;
    setInitialLoading(true);
    setError(null);

    try {
      await Promise.allSettled([fetchFairValue(), fetchFundamentals(), fetchLiveQuote()]);
    } catch (err) {
      console.error('[StockDetail] Initial fetch error:', err);
      setError('Failed to load stock data');
    } finally {
      setInitialLoading(false);
    }
  }, [symbol, fetchFairValue, fetchFundamentals, fetchLiveQuote]);

  // ── Auto-refresh during market hours ──────────────────────────
  const fairValueRefresh = useAutoRefresh({
    key: `fv-${symbol}`,
    intervalMs: REFRESH_INTERVALS.SCREENER,
    fetchFn: fetchFairValue,
    enabled: !initialLoading && symbolExists,
  });

  const livePriceRefresh = useAutoRefresh({
    key: `live-${symbol}`,
    intervalMs: REFRESH_INTERVALS.STOCKS,
    fetchFn: fetchLiveQuote,
    enabled: !initialLoading && symbolExists,
  });

  // ── Lifecycle ──────────────────────────────────────────────────
  useEffect(() => {
    if (!symbol) return;
    void fetchAllData();
    setWatched(isWatched(symbol));
  }, [fetchAllData, symbol]);

  const toggleWatch = () => {
    if (watched) {
      removeFromWatchlist(symbol);
      setWatched(false);
    } else {
      addToWatchlist(symbol);
      setWatched(true);
    }
  };

  const isRefreshing = fairValueRefresh.isRefreshing || livePriceRefresh.isRefreshing;

  // ── Derived Data ───────────────────────────────────────────────
  const name = data.fairValue?.name || stockInfo?.name || symbol;
  const sector = data.fairValue?.sector || stockInfo?.sector || '—';
  const price = data.liveQuote?.price || data.fundamentals?.price || data.fairValue?.currentPrice || 0;
  const changePercent = data.liveQuote?.changePercent || data.fundamentals?.change || 0;
  const marketCap = data.fundamentals?.marketCap || 0;
  const fvStatus = data.fairValue?.status || 'N/A';
  const weightedFairValue = data.fairValue?.weightedFairValue || 0;
  const weightedUpside = data.fairValue?.weightedUpside || 0;

  // ── Not Found ─────────────────────────────────────────────────
  if (!symbol) {
    return <NotFoundState />;
  }

  // ── Loading State ──────────────────────────────────────────────
  if (initialLoading) {
    return (
      <main className="min-h-screen bg-background">
        <HeaderSkeleton />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          {/* Tab bar skeleton */}
          <div className="flex justify-center mb-6">
            <Skeleton className="h-10 w-[520px] rounded-lg" />
          </div>
          <TabContentSkeleton />
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-background">
      {/* ── Error Banner ────────────────────────────────────────── */}
      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="bg-red-50 dark:bg-red-950/30 border-b border-red-200 dark:border-red-800"
          >
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm text-red-600 dark:text-red-400">
                <AlertTriangle className="size-4" />
                <span>{error}</span>
              </div>
              <Button variant="outline" size="sm" onClick={() => void fetchAllData()} className="gap-1.5 h-7 text-xs">
                <RefreshCw className="size-3" /> Retry
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Sticky Header ──────────────────────────────────────── */}
      <motion.div {...headerFade} className="sticky top-0 z-50 w-full backdrop-blur-xl bg-background/80 border-b border-border/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 sm:py-4">
          <div className="flex items-start sm:items-center justify-between gap-3">
            {/* Left: Back + Info */}
            <div className="flex items-start sm:items-center gap-3 min-w-0">
              {/* Back button */}
              <Button asChild variant="ghost" size="icon" className="shrink-0 size-9 -ml-1 hover:bg-muted/50">
                <Link href="/analysis" aria-label="Back to Analysis">
                  <ArrowLeft className="size-4" />
                </Link>
              </Button>

              <div className="min-w-0 space-y-1 sm:space-y-0">
                {/* Title Row */}
                <div className="flex items-center gap-2 flex-wrap">
                  <h1 className="text-lg sm:text-xl font-bold tracking-tight truncate">{name}</h1>
                  <Badge variant="secondary" className="font-mono text-[11px] px-1.5 py-0 shrink-0">{symbol}</Badge>
                  <Badge variant="outline" className="text-[10px] px-1.5 py-0 shrink-0">
                    <Building2 className="size-3 mr-0.5" />
                    {sector}
                  </Badge>
                </div>

                {/* Price + Metrics Row */}
                <div className="flex items-center gap-3 flex-wrap">
                  {/* Price */}
                  <span className="text-xl sm:text-2xl font-bold font-mono tabular-nums tracking-tight">
                    {price > 0 ? fmtCurrency(price) : '—'}
                  </span>

                  {/* Change */}
                  {changePercent !== 0 && (
                    <span className={`text-sm font-semibold font-mono tabular-nums ${pnlColor(changePercent)}`}>
                      {fmtPercent(changePercent)}
                    </span>
                  )}

                  <Separator orientation="vertical" className="h-5" />

                  {/* Market Cap */}
                  {marketCap > 0 && (
                    <span className="text-xs text-muted-foreground">
                      MCap: <span className="font-medium text-foreground">{formatMarketCap(marketCap)}</span>
                    </span>
                  )}

                  {/* Valuation Status Badge */}
                  {data.fairValue && fvStatus !== 'N/A' && (
                    <Badge variant="outline" className={`text-[11px] gap-1 px-2 ${valuationStatusColor(fvStatus)}`}>
                      {valuationStatusIcon(fvStatus)}
                      {fvStatus}
                    </Badge>
                  )}

                  {/* Fair Value + Upside */}
                  {weightedFairValue > 0 && (
                    <>
                      <span className="text-xs text-muted-foreground hidden sm:inline">
                        FV: <span className="font-mono font-medium text-foreground">{fmtCurrency(weightedFairValue)}</span>
                      </span>
                      <Badge
                        variant="outline"
                        className={`text-[11px] font-mono font-semibold px-1.5 py-0 ${pnlColor(weightedUpside)}`}
                      >
                        {weightedUpside >= 0 ? <TrendingUp className="size-3 mr-0.5" /> : <TrendingDown className="size-3 mr-0.5" />}
                        {fmtPercent(weightedUpside)}
                      </Badge>
                    </>
                  )}

                  {/* Refresh indicator */}
                  {isRefreshing && (
                    <RefreshCw className="size-3 animate-spin text-muted-foreground" />
                  )}
                </div>
              </div>
            </div>

            {/* Right: Actions */}
            <div className="flex items-center gap-2 shrink-0">
              {/* Last updated */}
              {lastUpdated && (
                <span className="text-[10px] text-muted-foreground hidden sm:flex items-center gap-1">
                  <Clock className="size-3" />
                  {timeAgo(lastUpdated)}
                </span>
              )}

              {/* Watchlist Toggle */}
              <Button
                variant={watched ? 'default' : 'outline'}
                size="sm"
                className="gap-1.5 h-8 text-xs"
                onClick={toggleWatch}
              >
                <Star className={`size-3.5 ${watched ? 'fill-current' : ''}`} />
                <span className="hidden sm:inline">{watched ? 'Watching' : 'Watch'}</span>
              </Button>
            </div>
          </div>
        </div>
      </motion.div>

      {/* ── Main Content ───────────────────────────────────────── */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          {/* Tab Navigation */}
          <div className="flex justify-center mb-6">
            <TabsList className="bg-muted/50 h-auto p-1 flex-wrap gap-1">
              <TabsTrigger value="overview" className="gap-1.5 text-xs sm:text-sm px-3 py-2 data-[state=active]:bg-background data-[state=active]:shadow-sm">
                <Eye className="size-3.5" />
                Overview
              </TabsTrigger>
              <TabsTrigger value="valuation" className="gap-1.5 text-xs sm:text-sm px-3 py-2 data-[state=active]:bg-background data-[state=active]:shadow-sm">
                <BarChart3 className="size-3.5" />
                Valuation
              </TabsTrigger>
              <TabsTrigger value="technicals" className="gap-1.5 text-xs sm:text-sm px-3 py-2 data-[state=active]:bg-background data-[state=active]:shadow-sm">
                <Activity className="size-3.5" />
                Technicals
              </TabsTrigger>
              <TabsTrigger value="montecarlo" className="gap-1.5 text-xs sm:text-sm px-3 py-2 data-[state=active]:bg-background data-[state=active]:shadow-sm">
                <Zap className="size-3.5" />
                Monte Carlo
              </TabsTrigger>
              <TabsTrigger value="research" className="gap-1.5 text-xs sm:text-sm px-3 py-2 data-[state=active]:bg-background data-[state=active]:shadow-sm">
                <Brain className="size-3.5" />
                Research
              </TabsTrigger>
              <TabsTrigger value="peers" className="gap-1.5 text-xs sm:text-sm px-3 py-2 data-[state=active]:bg-background data-[state=active]:shadow-sm">
                <ChevronRight className="size-3.5" />
                Peers
              </TabsTrigger>
              <TabsTrigger value="sectormodels" className="gap-1.5 text-xs sm:text-sm px-3 py-2 data-[state=active]:bg-background data-[state=active]:shadow-sm">
                <Building2 className="size-3.5" />
                <span className="hidden sm:inline">Sector Models</span>
                <span className="sm:hidden">Sectors</span>
              </TabsTrigger>
              <TabsTrigger value="audit" className="gap-1.5 text-xs sm:text-sm px-3 py-2 data-[state=active]:bg-background data-[state=active]:shadow-sm">
                <FileSearch className="size-3.5" />
                <span className="hidden sm:inline">Audit Trail</span>
                <span className="sm:hidden">Audit</span>
              </TabsTrigger>
            </TabsList>
          </div>

          {/* ────────────────────────────────────────────────────── */}
          {/* Tab 1: Overview                                      */}
          {/* ────────────────────────────────────────────────────── */}
          <TabsContent value="overview" className="mt-0">
            <AnimatePresence mode="wait">
              <motion.div key="overview" variants={tabVariants} initial="initial" animate="animate" exit="exit" transition={{ duration: 0.3 }} className="space-y-6">
                {/* TradingView Chart */}
                <TradingViewChart symbol={symbol} />

                {/* 3-Column Grid: Gauge + Metrics + Targets */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {/* Fair Value Gauge */}
                  <div className="flex items-start justify-center">
                    <div className="w-full max-w-sm">
                      <FairValueGauge
                        currentPrice={data.fairValue?.currentPrice || price}
                        fairValue={data.fairValue?.weightedFairValue || 0}
                        upside={data.fairValue?.weightedUpside || 0}
                        status={data.fairValue?.status || 'N/A'}
                      />
                    </div>
                  </div>

                  {/* Key Metrics */}
                  <KeyMetricsCard data={data.fundamentals} fairValue={data.fairValue} />

                  {/* Price Targets */}
                  <PriceTargetsCard fairValue={data.fairValue} />
                </div>

                {/* AI Fair Value Analysis */}
                <div className="space-y-3">
                  <h2 className="text-lg font-semibold flex items-center gap-2">
                    <Sparkles className="size-4 text-primary" />
                    AI-Powered Fair Value
                  </h2>
                  <p className="text-xs text-muted-foreground">
                    Combines V1, V2, V3 mathematical models with AI analyst assessment for institutional-grade fair value
                  </p>
                  <AIFairValueCard symbol={symbol} />
                </div>
              </motion.div>
            </AnimatePresence>
          </TabsContent>

          {/* ────────────────────────────────────────────────────── */}
          {/* Tab 2: Valuation                                     */}
          {/* ────────────────────────────────────────────────────── */}
          <TabsContent value="valuation" className="mt-0">
            <AnimatePresence mode="wait">
              <motion.div key="valuation" variants={tabVariants} initial="initial" animate="animate" exit="exit" transition={{ duration: 0.3 }} className="space-y-6">
                {/* Valuation Model Cards (4-column) */}
                <div className="space-y-3">
                  <h2 className="text-lg font-semibold flex items-center gap-2">
                    <BarChart3 className="size-4 text-muted-foreground" />
                    Valuation Breakdown
                  </h2>
                  <p className="text-xs text-muted-foreground">4 independent valuation models with weighted composite</p>
                  {data.fairValue ? (
                    <ValuationBreakdown
                      result={data.fairValue}
                      currentPrice={data.fairValue.currentPrice}
                    />
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                      {Array.from({ length: 4 }).map((_, i) => (
                        <Skeleton key={i} className="h-52 rounded-xl" />
                      ))}
                    </div>
                  )}
                </div>

                {/* Model Weights */}
                {data.fairValue && (
                  <ModelWeightsBar weights={data.fairValue.modelWeights} />
                )}

                {/* Sensitivity Matrix */}
                <div className="space-y-3">
                  <h2 className="text-lg font-semibold flex items-center gap-2">
                    <Activity className="size-4 text-muted-foreground" />
                    DCF Sensitivity Analysis
                  </h2>
                  <p className="text-xs text-muted-foreground">Fair value under different WACC and terminal growth assumptions</p>
                  <SensitivityMatrix symbol={symbol} />
                </div>

                {/* Ratio Dashboard */}
                <div className="space-y-3">
                  <h2 className="text-lg font-semibold flex items-center gap-2">
                    <Shield className="size-4 text-muted-foreground" />
                    Financial Ratios
                  </h2>
                  <p className="text-xs text-muted-foreground">Key metrics across valuation, profitability, growth, and financial health</p>
                  <RatioDashboard data={data.fundamentals} />
                </div>

                {/* Confidence & Data Quality */}
                <div className="space-y-3">
                  <h2 className="text-lg font-semibold flex items-center gap-2">
                    <Gauge className="size-4 text-muted-foreground" />
                    Valuation Confidence & Data Quality
                  </h2>
                  <p className="text-xs text-muted-foreground">Assessment of data reliability, reporting quality, and forecast certainty</p>
                  <ConfidenceScorePanel symbol={symbol} />
                </div>
              </motion.div>
            </AnimatePresence>
          </TabsContent>

          {/* ────────────────────────────────────────────────────── */}
          {/* Tab 3: Technicals                                    */}
          {/* ────────────────────────────────────────────────────── */}
          <TabsContent value="technicals" className="mt-0">
            <AnimatePresence mode="wait">
              <motion.div key="technicals" variants={tabVariants} initial="initial" animate="animate" exit="exit" transition={{ duration: 0.3 }} className="space-y-6">
                <div className="space-y-3">
                  <h2 className="text-lg font-semibold flex items-center gap-2">
                    <Activity className="size-4 text-muted-foreground" />
                    Technical Analysis
                  </h2>
                  <p className="text-xs text-muted-foreground">
                    RSI, MACD, Stochastic, Moving Averages, Bollinger Bands, Support/Resistance levels
                  </p>
                  <TechnicalAnalysisSection symbol={symbol} />
                </div>
              </motion.div>
            </AnimatePresence>
          </TabsContent>

          {/* ────────────────────────────────────────────────────── */}
          {/* Tab 4: Monte Carlo                                   */}
          {/* ────────────────────────────────────────────────────── */}
          <TabsContent value="montecarlo" className="mt-0">
            <AnimatePresence mode="wait">
              <motion.div key="montecarlo" variants={tabVariants} initial="initial" animate="animate" exit="exit" transition={{ duration: 0.3 }} className="space-y-6">
                <div className="space-y-3">
                  <h2 className="text-lg font-semibold flex items-center gap-2">
                    <Zap className="size-4 text-muted-foreground" />
                    Monte Carlo Simulation
                  </h2>
                  <p className="text-xs text-muted-foreground">
                    Fair value distribution from 10,000+ DCF simulations with probability analysis and confidence intervals
                  </p>
                  <MonteCarloChart symbol={symbol} />
                </div>
              </motion.div>
            </AnimatePresence>
          </TabsContent>

          {/* ────────────────────────────────────────────────────── */}
          {/* Tab 5: Research                                      */}
          {/* ────────────────────────────────────────────────────── */}
          <TabsContent value="research" className="mt-0">
            <AnimatePresence mode="wait">
              <motion.div key="research" variants={tabVariants} initial="initial" animate="animate" exit="exit" transition={{ duration: 0.3 }} className="space-y-6">
                <div className="space-y-3">
                  <h2 className="text-lg font-semibold flex items-center gap-2">
                    <Brain className="size-4 text-muted-foreground" />
                    Institutional Research Report
                  </h2>
                  <p className="text-xs text-muted-foreground">
                    AI-powered equity research with fundamental analysis, valuation commentary, and investment thesis
                  </p>
                  <ResearchReport symbol={symbol} />
                </div>
              </motion.div>
            </AnimatePresence>
          </TabsContent>

          {/* ────────────────────────────────────────────────────── */}
          {/* Tab 7: Sector-Specific Models                         */}
          {/* ────────────────────────────────────────────────────── */}
          <TabsContent value="sectormodels" className="mt-0">
            <AnimatePresence mode="wait">
              <motion.div key="sectormodels" variants={tabVariants} initial="initial" animate="animate" exit="exit" transition={{ duration: 0.3 }} className="space-y-6">
                <div className="space-y-3">
                  <h2 className="text-lg font-semibold flex items-center gap-2">
                    <Building2 className="size-4 text-muted-foreground" />
                    Sector-Specific Valuation Models
                  </h2>
                  <p className="text-xs text-muted-foreground">
                    Models automatically selected and weighted based on sector classification — Banks use P/B + ROE, Real Estate uses NAV, etc.
                  </p>
                  <SectorModelsPanel symbol={symbol} />
                </div>
              </motion.div>
            </AnimatePresence>
          </TabsContent>

          {/* ────────────────────────────────────────────────────── */}
          {/* Tab 8: Audit Trail                                   */}
          {/* ────────────────────────────────────────────────────── */}
          <TabsContent value="audit" className="mt-0">
            <AnimatePresence mode="wait">
              <motion.div key="audit" variants={tabVariants} initial="initial" animate="animate" exit="exit" transition={{ duration: 0.3 }} className="space-y-6">
                <div className="space-y-3">
                  <h2 className="text-lg font-semibold flex items-center gap-2">
                    <FileSearch className="size-4 text-muted-foreground" />
                    Auditable Calculations & Assumptions
                  </h2>
                  <p className="text-xs text-muted-foreground">
                    Every input, assumption, formula, and intermediate calculation is fully transparent — no black-box valuation
                  </p>
                  <AuditTrailPanel symbol={symbol} />
                </div>
              </motion.div>
            </AnimatePresence>
          </TabsContent>

          {/* ────────────────────────────────────────────────────── */}
          {/* Tab 6: Peers                                         */}
          {/* ────────────────────────────────────────────────────── */}
          <TabsContent value="peers" className="mt-0">
            <AnimatePresence mode="wait">
              <motion.div key="peers" variants={tabVariants} initial="initial" animate="animate" exit="exit" transition={{ duration: 0.3 }} className="space-y-6">
                <div className="space-y-3">
                  <h2 className="text-lg font-semibold flex items-center gap-2">
                    <ChevronRight className="size-4 text-muted-foreground" />
                    Peer Comparison
                  </h2>
                  <p className="text-xs text-muted-foreground">
                    Key metrics compared to sector peers — green highlights indicate best-in-class values
                  </p>
                  <PeerComparisonTable symbol={symbol} />
                </div>
              </motion.div>
            </AnimatePresence>
          </TabsContent>
        </Tabs>

        {/* Bottom Padding */}
        <div className="h-12" />
      </div>
    </main>
  );
}
