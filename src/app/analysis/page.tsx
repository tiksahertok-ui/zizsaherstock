'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import {
  TrendingUp,
  TrendingDown,
  RefreshCw,
  Activity,
  BarChart3,
  Eye,
  Search,
  Star,
  Building2,
  Zap,
  LayoutDashboard,
  Map,
  Target,
  Sparkles,
  Minus,
  Clock,
  Radio,
  ArrowUpRight,
  ArrowDownRight,
  ChevronRight,
  Shield,
} from 'lucide-react';

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

import MarketOverviewStats from '@/components/analysis/market-overview-stats';
import SectorOverview from '@/components/analysis/sector-overview';
import StockScreener from '@/components/analysis/stock-screener';
import WatchlistPanel from '@/components/analysis/watchlist-panel';

import { useAutoRefresh, REFRESH_INTERVALS } from '@/hooks/use-auto-refresh';
import { getMarketStatus, getEgyptTime, isEgyptianHoliday } from '@/utils/market-status';
import { fmtCurrency, fmtPercent, pnlColor, timeAgo } from '@/utils/formatters';

// ═══════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════

interface ScreenerStock {
  symbol: string;
  name: string;
  sector: string;
  currentPrice: number;
  change: number;
  weightedUpside: number;
  weightedFairValue: number;
  status: string;
  confidence: string;
  dataQuality: number;
  marketCap: number;
}

interface ScreenerSummary {
  total: number;
  undervalued: number;
  fairlyValued: number;
  overvalued: number;
  highConfidence: number;
  filteredTotal: number;
}

interface TopOpportunity {
  symbol: string;
  name: string;
  sector: string;
  price: number;
  fairValue: number;
  upside: number;
  status: string;
  confidence: string;
  dataQuality: number;
}

interface BreadthData {
  advancers: number;
  decliners: number;
  unchanged: number;
}

type MarketStatusType = 'Live' | 'Pre-Market' | 'Closed';

// ═══════════════════════════════════════════════════════════════════
// Animation Variants
// ═══════════════════════════════════════════════════════════════════

const pageVariants = {
  initial: { opacity: 0, y: 12 },
  animate: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.35, ease: 'easeOut' as const },
  },
  exit: { opacity: 0, y: -12, transition: { duration: 0.2 } },
};

const staggerContainer = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.07 },
  },
};

const staggerItem = {
  hidden: { opacity: 0, y: 12, scale: 0.97 },
  show: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { duration: 0.3, ease: 'easeOut' as const },
  },
};

const fadeInUp = {
  initial: { opacity: 0, y: 16 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.4, ease: 'easeOut' as const } },
};

// ═══════════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════════

function determineMarketStatus(): {
  status: MarketStatusType;
  dotColor: string;
  dotRing: string;
} {
  const ms = getMarketStatus();
  if (ms.egx === 'live') {
    return {
      status: 'Live',
      dotColor: 'bg-emerald-400',
      dotRing: 'ring-emerald-400/40',
    };
  }

  // Pre-market check: 9:30–10:00 Egypt time on trading days
  const now = getEgyptTime();
  const day = now.getDay(); // 0=Sun … 5=Fri, 6=Sat
  const t = now.getHours() * 60 + now.getMinutes();

  if (day !== 5 && day !== 6 && !isEgyptianHoliday() && t >= 570 && t < 600) {
    return {
      status: 'Pre-Market',
      dotColor: 'bg-amber-400',
      dotRing: 'ring-amber-400/40',
    };
  }

  return {
    status: 'Closed',
    dotColor: 'bg-gray-400',
    dotRing: 'ring-gray-400/40',
  };
}

/** Compute a heatmap background colour based on % change */
function getHeatmapStyle(change: number): React.CSSProperties {
  const c = Math.max(-6, Math.min(6, change || 0));
  const intensity = Math.abs(c) / 6;

  if (c > 0) {
    return {
      backgroundColor: `rgba(16, 185, 129, ${(0.12 + intensity * 0.72).toFixed(3)})`,
    };
  }
  if (c < 0) {
    return {
      backgroundColor: `rgba(239, 68, 68, ${(0.12 + intensity * 0.72).toFixed(3)})`,
    };
  }
  return { backgroundColor: 'rgba(100, 116, 139, 0.22)' };
}

// ═══════════════════════════════════════════════════════════════════
// Skeleton Components
// ═══════════════════════════════════════════════════════════════════

function BreadthSkeleton() {
  return (
    <Card className="py-4 px-5">
      <div className="flex items-center gap-2 mb-3">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-4 w-48" />
      </div>
      <Skeleton className="h-3 w-full rounded-full" />
    </Card>
  );
}

function OpportunitiesSkeleton() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3">
      {Array.from({ length: 5 }).map((_, i) => (
        <Card key={i} className="py-3 px-4">
          <Skeleton className="h-28 w-full rounded" />
        </Card>
      ))}
    </div>
  );
}

function MarketMapSkeleton() {
  return (
    <div className="space-y-6">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="space-y-2">
          <Skeleton className="h-4 w-32" />
          <div className="grid grid-cols-[repeat(auto-fill,minmax(78px,1fr))] gap-1">
            {Array.from({ length: 12 }).map((_, j) => (
              <Skeleton key={j} className="h-[56px] w-full rounded" />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// Market Breadth Bar Component
// ═══════════════════════════════════════════════════════════════════

function MarketBreadthBar({ breadth }: { breadth: BreadthData }) {
  const total = breadth.advancers + breadth.decliners + breadth.unchanged;
  if (total === 0) return null;

  const advPct = (breadth.advancers / total) * 100;
  const flatPct = (breadth.unchanged / total) * 100;
  const decPct = (breadth.decliners / total) * 100;

  return (
    <Card className="py-4 px-5">
      <div className="flex items-center gap-3 mb-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Activity className="size-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold">Market Breadth</h3>
        </div>
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <span className="size-2 rounded-full bg-emerald-500" />
            {breadth.advancers} Advancers
          </span>
          <span className="flex items-center gap-1">
            <span className="size-2 rounded-full bg-gray-400" />
            {breadth.unchanged} Unchanged
          </span>
          <span className="flex items-center gap-1">
            <span className="size-2 rounded-full bg-red-500" />
            {breadth.decliners} Decliners
          </span>
        </div>
      </div>

      {/* Breadth Bar */}
      <div className="flex h-3 rounded-full overflow-hidden gap-px">
        <div
          className="bg-emerald-500 rounded-l-full transition-all duration-700 ease-out"
          style={{ width: `${advPct}%`, minWidth: breadth.advancers > 0 ? 4 : 0 }}
        />
        <div
          className="bg-gray-400/70 transition-all duration-700 ease-out"
          style={{ width: `${flatPct}%`, minWidth: breadth.unchanged > 0 ? 2 : 0 }}
        />
        <div
          className="bg-red-500 rounded-r-full transition-all duration-700 ease-out"
          style={{ width: `${decPct}%`, minWidth: breadth.decliners > 0 ? 4 : 0 }}
        />
      </div>

      {/* A/D Ratio */}
      <div className="mt-2 text-[11px] text-muted-foreground">
        A/D Ratio:{' '}
        <span className="font-mono font-medium text-foreground">
          {breadth.decliners > 0
            ? (breadth.advancers / breadth.decliners).toFixed(2)
            : '∞'}
        </span>
      </div>
    </Card>
  );
}

// ═══════════════════════════════════════════════════════════════════
// Opportunity Card Component
// ═══════════════════════════════════════════════════════════════════

function OpportunityCard({ opp }: { opp: TopOpportunity }) {
  return (
    <Link href={`/analysis/${opp.symbol}`} className="group block h-full">
      <Card className="py-3 px-4 hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200 cursor-pointer border-emerald-200/40 dark:border-emerald-800/40 bg-gradient-to-br from-emerald-500/[0.04] to-transparent h-full">
        <div className="space-y-2">
          {/* Header: Symbol + Confidence */}
          <div className="flex items-center justify-between">
            <span className="font-mono font-bold text-sm group-hover:text-primary transition-colors">
              {opp.symbol}
            </span>
            <Badge
              variant="outline"
              className="text-[9px] px-1.5 py-0 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-200/60 dark:border-emerald-800/60"
            >
              {opp.confidence}
            </Badge>
          </div>

          {/* Name */}
          <p className="text-[11px] text-muted-foreground truncate leading-tight">
            {opp.name}
          </p>

          {/* Price + Upside */}
          <div className="flex items-baseline justify-between gap-1">
            <span className="text-sm font-mono font-semibold tabular-nums">
              {fmtCurrency(opp.price)}
            </span>
            <div className="flex items-center gap-0.5">
              {opp.upside > 0 ? (
                <ArrowUpRight className="size-3 text-emerald-500" />
              ) : (
                <ArrowDownRight className="size-3 text-red-500" />
              )}
              <span
                className={`text-sm font-mono font-bold tabular-nums ${pnlColor(
                  opp.upside
                )}`}
              >
                {fmtPercent(opp.upside)}
              </span>
            </div>
          </div>

          {/* Footer: Sector + Fair Value */}
          <div className="flex items-center justify-between text-[10px] text-muted-foreground pt-1 border-t border-border/50">
            <Badge variant="secondary" className="text-[9px] px-1.5 py-0">
              {opp.sector}
            </Badge>
            {opp.fairValue > 0 && (
              <span className="font-mono">FV: {fmtCurrency(opp.fairValue)}</span>
            )}
          </div>
        </div>
      </Card>
    </Link>
  );
}

// ═══════════════════════════════════════════════════════════════════
// Heatmap Cell Component
// ═══════════════════════════════════════════════════════════════════

function HeatmapCell({ stock }: { stock: ScreenerStock }) {
  const change = stock.change ?? 0;

  return (
    <Link
      href={`/analysis/${stock.symbol}`}
      className="group rounded-md px-1.5 py-2 flex flex-col items-center justify-center hover:scale-[1.06] hover:ring-1 hover:ring-white/30 transition-all duration-150 cursor-pointer min-h-[54px]"
      style={getHeatmapStyle(change)}
      title={`${stock.symbol} — ${stock.name} — ${fmtPercent(change)}`}
    >
      <span className="font-mono font-bold text-[11px] text-white leading-tight truncate w-full text-center">
        {stock.symbol}
      </span>
      <span
        className={`text-[10px] font-mono tabular-nums leading-tight mt-0.5 ${
          change > 0
            ? 'text-emerald-100'
            : change < 0
              ? 'text-red-100'
              : 'text-gray-300'
        }`}
      >
        {change !== 0 ? fmtPercent(change) : '0.00%'}
      </span>
    </Link>
  );
}

// ═══════════════════════════════════════════════════════════════════
// Main Page Component
// ═══════════════════════════════════════════════════════════════════

export default function AnalysisPage() {
  const router = useRouter();

  // ── Tab state ───────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState('overview');
  const [screenerSector, setScreenerSector] = useState<string | null>(null);

  // ── Data state ──────────────────────────────────────────────
  const [allStocks, setAllStocks] = useState<ScreenerStock[]>([]);
  const [summary, setSummary] = useState<ScreenerSummary | null>(null);
  const [opportunities, setOpportunities] = useState<TopOpportunity[]>([]);
  const [breadth, setBreadth] = useState<BreadthData>({
    advancers: 0,
    decliners: 0,
    unchanged: 0,
  });
  const [dataLoading, setDataLoading] = useState(true);

  // ── Market status ───────────────────────────────────────────
  const [marketStatusInfo, setMarketStatusInfo] = useState(determineMarketStatus());
  const [lastUpdated, setLastUpdated] = useState<number>(Date.now());
  const [, setTick] = useState(0); // forces re-render for "updated X ago"

  // ── Refresh state ────────────────────────────────────────────
  const [isRefreshingGlobal, setIsRefreshingGlobal] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  // ── Market map state ────────────────────────────────────────
  const [mapSearch, setMapSearch] = useState('');
  const [mapSectorFilter, setMapSectorFilter] = useState('All');

  // ── Fetch Screener Data ──────────────────────────────────────
  const fetchScreenerData = useCallback(async () => {
    try {
      const res = await fetch(
        '/api/analysis/screener?limit=260&minQuality=0&sort=upside',
        { cache: 'no-store' }
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();

      const results: ScreenerStock[] = (data.results || []).map(
        (r: Record<string, unknown>) => ({
          symbol: r.symbol as string,
          name: r.name as string,
          sector: r.sector as string,
          currentPrice: r.currentPrice as number,
          change: (r.change as number) ?? 0,
          weightedUpside: r.weightedUpside as number,
          weightedFairValue: r.weightedFairValue as number,
          status: r.status as string,
          confidence: r.confidence as string,
          dataQuality: r.dataQuality as number,
          marketCap: r.marketCap as number,
        })
      );

      setAllStocks(results);
      setSummary(data.summary || null);

      // ── Compute market breadth ──
      let advancers = 0;
      let decliners = 0;
      let unchanged = 0;
      for (const r of results) {
        if (r.change > 0) advancers++;
        else if (r.change < 0) decliners++;
        else unchanged++;
      }
      setBreadth({ advancers, decliners, unchanged });

      // ── Extract top opportunities ──
      const topOpps = results
        .filter(
          (r) =>
            r.status === 'Undervalued' &&
            r.confidence !== 'Low' &&
            r.weightedUpside > 10
        )
        .slice(0, 5)
        .map((r) => ({
          symbol: r.symbol,
          name: r.name,
          sector: r.sector,
          price: r.currentPrice,
          fairValue: r.weightedFairValue,
          upside: r.weightedUpside,
          status: r.status,
          confidence: r.confidence,
          dataQuality: r.dataQuality,
        }));
      setOpportunities(topOpps);

      setLastUpdated(Date.now());
    } catch (err) {
      console.error('[AnalysisPage] Screener fetch error:', err);
    } finally {
      setDataLoading(false);
    }
  }, []);

  // ── Auto-refresh: screener data every 120 s during market hours ──
  const screenerAutoRefresh = useAutoRefresh({
    key: 'analysis-dashboard-screener',
    intervalMs: REFRESH_INTERVALS.SCREENER,
    fetchFn: fetchScreenerData,
    enabled: true,
  });

  // ── Market status polling (every 60 s) ──
  useEffect(() => {
    setMarketStatusInfo(determineMarketStatus());
    const interval = setInterval(() => {
      setMarketStatusInfo(determineMarketStatus());
    }, 60_000);
    return () => clearInterval(interval);
  }, []);

  // ── Tick for "Updated X ago" display ──
  useEffect(() => {
    const timer = setInterval(() => setTick((t) => t + 1), 15_000);
    return () => clearInterval(timer);
  }, []);

  // ── Initial fetch ──
  useEffect(() => {
    void fetchScreenerData();
  }, [fetchScreenerData]);

  // ── Tab visibility: refresh when user returns ──
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        void fetchScreenerData();
        setMarketStatusInfo(determineMarketStatus());
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [fetchScreenerData]);

  // ── Global Refresh ──
  const handleGlobalRefresh = useCallback(async () => {
    setIsRefreshingGlobal(true);
    setRefreshKey((k) => k + 1);
    try {
      await fetchScreenerData();
    } finally {
      setIsRefreshingGlobal(false);
    }
  }, [fetchScreenerData]);

  // ── Handlers ──
  const handleSectorClick = useCallback((sector: string) => {
    setScreenerSector(sector);
    setActiveTab('screener');
  }, []);

  const handleBestOpportunityClick = useCallback(
    (symbol: string) => {
      router.push(`/analysis/${symbol}`);
    },
    [router]
  );

  // ── Market Map: computed grouped + filtered data ──
  const mapSectors = useMemo(() => {
    const searchUp = mapSearch.toUpperCase().trim();
    const filtered = searchUp
      ? allStocks.filter(
          (s) =>
            s.symbol.toUpperCase().includes(searchUp) ||
            s.name.toUpperCase().includes(searchUp)
        )
      : allStocks;

    const sectorFiltered =
      mapSectorFilter !== 'All'
        ? filtered.filter((s) => s.sector === mapSectorFilter)
        : filtered;

    // Sort stocks within each sector by market cap descending
    const bySector: Record<string, ScreenerStock[]> = {};
    for (const stock of sectorFiltered) {
      if (!bySector[stock.sector]) bySector[stock.sector] = [];
      bySector[stock.sector].push(stock);
    }
    for (const sec of Object.keys(bySector)) {
      bySector[sec].sort((a, b) => b.marketCap - a.marketCap);
    }

    return Object.entries(bySector).sort(([a], [b]) => a.localeCompare(b));
  }, [allStocks, mapSearch, mapSectorFilter]);

  const sectorOptions = useMemo(() => {
    const sectors = new Set(allStocks.map((s) => s.sector));
    return ['All', ...Array.from(sectors).sort()];
  }, [allStocks]);

  const totalMapStocks = useMemo(
    () => mapSectors.reduce((sum, [, stocks]) => sum + stocks.length, 0),
    [mapSectors]
  );

  const isSpinning = isRefreshingGlobal || screenerAutoRefresh.isRefreshing;

  // ═══════════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════════

  return (
    <main className="min-h-screen bg-background">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {/* ═══════════════════════════════════════════════════════
            HEADER
        ═══════════════════════════════════════════════════════ */}
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-slate-900 via-blue-950 to-slate-950 border border-white/10 text-white"
        >
          {/* Subtle radial glow */}
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_20%_50%,rgba(59,130,246,0.10),transparent_70%)] pointer-events-none" />
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_80%_20%,rgba(139,92,246,0.06),transparent_60%)] pointer-events-none" />

          <div className="relative px-6 py-7 sm:px-8 sm:py-9">
            {/* Top row: Title + Refresh */}
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
              <div className="space-y-3 min-w-0">
                <div className="flex items-center gap-3">
                  <div className="size-11 rounded-xl bg-blue-500/20 border border-blue-400/30 flex items-center justify-center shrink-0 backdrop-blur-sm">
                    <BarChart3 className="size-5 text-blue-400" />
                  </div>
                  <div className="min-w-0">
                    <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold tracking-tight truncate">
                      EGX Equity Research Terminal
                    </h1>
                    <p className="text-xs sm:text-sm text-blue-200/60 mt-0.5">
                      Institutional-grade sector-specific fair value analysis with
                      multi-source verification across 260 Egyptian stocks (EGP)
                    </p>
                  </div>
                </div>

                {/* Status + Timestamp */}
                <div className="flex flex-wrap items-center gap-3">
                  <Badge
                    variant="outline"
                    className="gap-1.5 text-[11px] border-white/20 text-white bg-white/[0.06] backdrop-blur-sm"
                  >
                    <span
                      className={`size-2 rounded-full ${marketStatusInfo.dotColor} ${
                        marketStatusInfo.status === 'Live'
                          ? 'animate-pulse'
                          : ''
                      }`}
                    />
                    {marketStatusInfo.status}
                  </Badge>
                  <span className="text-[11px] text-blue-200/40 flex items-center gap-1">
                    <Clock className="size-3" />
                    Updated {timeAgo(new Date(lastUpdated))}
                  </span>
                </div>
              </div>

              {/* Refresh Button */}
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 border-white/20 text-white/90 bg-white/[0.06] hover:bg-white/10 hover:text-white shrink-0 self-start backdrop-blur-sm"
                onClick={handleGlobalRefresh}
                disabled={isSpinning}
              >
                <RefreshCw
                  className={`size-3.5 ${isSpinning ? 'animate-spin' : ''}`}
                />
                Refresh
              </Button>
            </div>

            {/* Quick Stats Badges */}
            <div className="flex flex-wrap gap-2 mt-5">
              <Badge
                variant="outline"
                className="text-[11px] border-white/10 text-blue-200/70 bg-white/[0.04]"
              >
                <Activity className="size-3 mr-1 text-blue-300/60" />
                {summary?.total ?? '—'} Stocks Analyzed
              </Badge>
              <Badge
                variant="outline"
                className="text-[11px] border-white/10 text-blue-200/70 bg-white/[0.04]"
              >
                <Zap className="size-3 mr-1 text-amber-300/60" />
                16 Valuation Models
              </Badge>
              <Badge
                variant="outline"
                className="text-[11px] border-white/10 text-blue-200/70 bg-white/[0.04]"
              >
                <Shield className="size-3 mr-1 text-emerald-300/60" />
                Sector-Specific Models
              </Badge>
              <Badge
                variant="outline"
                className="text-[11px] border-white/10 text-blue-200/70 bg-white/[0.04]"
              >
                <Radio className="size-3 mr-1 text-cyan-300/60" />
                Multi-Source Data
              </Badge>
              <Badge
                variant="outline"
                className="text-[11px] border-white/10 text-blue-200/70 bg-white/[0.04]"
              >
                <Building2 className="size-3 mr-1 text-purple-300/60" />
                EGP Only
              </Badge>
            </div>
          </div>
        </motion.div>

        {/* ═══════════════════════════════════════════════════════
            TABS
        ═══════════════════════════════════════════════════════ */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <div className="flex justify-center">
            <TabsList className="bg-muted/50">
              <TabsTrigger value="overview" className="gap-1.5 text-xs sm:text-sm">
                <LayoutDashboard className="size-3.5" />
                <span className="hidden sm:inline">Market Overview</span>
                <span className="sm:hidden">Overview</span>
              </TabsTrigger>
              <TabsTrigger value="screener" className="gap-1.5 text-xs sm:text-sm">
                <Search className="size-3.5" />
                <span className="hidden sm:inline">Stock Screener</span>
                <span className="sm:hidden">Screener</span>
              </TabsTrigger>
              <TabsTrigger value="watchlist" className="gap-1.5 text-xs sm:text-sm">
                <Star className="size-3.5" />
                Watchlist
              </TabsTrigger>
              <TabsTrigger value="map" className="gap-1.5 text-xs sm:text-sm">
                <Map className="size-3.5" />
                <span className="hidden sm:inline">Market Map</span>
                <span className="sm:hidden">Map</span>
              </TabsTrigger>
            </TabsList>
          </div>

          {/* ═══════════════════════════════════════════════════════
              TAB 1 — MARKET OVERVIEW
          ═══════════════════════════════════════════════════════ */}
          <TabsContent value="overview" className="mt-6">
            <AnimatePresence mode="wait">
              <motion.div
                key="overview"
                variants={pageVariants}
                initial="initial"
                animate="animate"
                exit="exit"
                className="space-y-6"
              >
                {/* 1. Overview Stat Cards (EGX30, Analyzed, Best Opp, High Confidence) */}
                <MarketOverviewStats
                  key={`stats-${refreshKey}`}
                  onBestOpportunityClick={handleBestOpportunityClick}
                />

                {/* 2. Market Breadth */}
                {dataLoading ? (
                  <motion.div {...fadeInUp} initial="initial" animate="animate">
                    <BreadthSkeleton />
                  </motion.div>
                ) : (
                  <motion.div {...fadeInUp}>
                    <MarketBreadthBar breadth={breadth} />
                  </motion.div>
                )}

                {/* 3. Sector Performance */}
                <section className="space-y-3">
                  <div className="flex items-center gap-2">
                    <TrendingUp className="size-4 text-muted-foreground" />
                    <h2 className="text-lg font-semibold">Sector Performance</h2>
                    <span className="text-[11px] text-muted-foreground">
                      Click a sector to filter the screener
                    </span>
                  </div>
                  <SectorOverview
                    key={`sectors-${refreshKey}`}
                    onSectorClick={handleSectorClick}
                  />
                </section>

                {/* 4. Top 5 Opportunities */}
                <section className="space-y-3">
                  <div className="flex items-center gap-2">
                    <Target className="size-4 text-muted-foreground" />
                    <h2 className="text-lg font-semibold">Top Opportunities</h2>
                    <Badge variant="outline" className="text-[10px]">
                      <Sparkles className="size-2.5 mr-0.5" />
                      High Confidence · Undervalued
                    </Badge>
                  </div>

                  {dataLoading ? (
                    <OpportunitiesSkeleton />
                  ) : opportunities.length > 0 ? (
                    <motion.div
                      variants={staggerContainer}
                      initial="hidden"
                      animate="show"
                      className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3"
                    >
                      {opportunities.map((opp) => (
                        <motion.div key={opp.symbol} variants={staggerItem}>
                          <OpportunityCard opp={opp} />
                        </motion.div>
                      ))}
                    </motion.div>
                  ) : (
                    <Card className="py-10">
                      <div className="flex flex-col items-center gap-2 text-muted-foreground">
                        <Target className="size-6 opacity-30" />
                        <p className="text-sm">
                          No high-confidence opportunities found
                        </p>
                        <p className="text-xs">
                          Try again when market data updates
                        </p>
                      </div>
                    </Card>
                  )}
                </section>
              </motion.div>
            </AnimatePresence>
          </TabsContent>

          {/* ═══════════════════════════════════════════════════════
              TAB 2 — STOCK SCREENER
          ═══════════════════════════════════════════════════════ */}
          <TabsContent value="screener" className="mt-6">
            <AnimatePresence mode="wait">
              <motion.div
                key="screener"
                variants={pageVariants}
                initial="initial"
                animate="animate"
                exit="exit"
              >
                <StockScreener defaultSector={screenerSector} />
              </motion.div>
            </AnimatePresence>
          </TabsContent>

          {/* ═══════════════════════════════════════════════════════
              TAB 3 — WATCHLIST
          ═══════════════════════════════════════════════════════ */}
          <TabsContent value="watchlist" className="mt-6">
            <AnimatePresence mode="wait">
              <motion.div
                key="watchlist"
                variants={pageVariants}
                initial="initial"
                animate="animate"
                exit="exit"
                className="space-y-3"
              >
                <div className="flex items-center gap-2">
                  <Eye className="size-4 text-muted-foreground" />
                  <h2 className="text-lg font-semibold">My Watchlist</h2>
                </div>
                <WatchlistPanel key={`watchlist-${refreshKey}`} />
              </motion.div>
            </AnimatePresence>
          </TabsContent>

          {/* ═══════════════════════════════════════════════════════
              TAB 4 — MARKET MAP (HEATMAP)
          ═══════════════════════════════════════════════════════ */}
          <TabsContent value="map" className="mt-6">
            <AnimatePresence mode="wait">
              <motion.div
                key="map"
                variants={pageVariants}
                initial="initial"
                animate="animate"
                exit="exit"
                className="space-y-4"
              >
                {/* Map Header + Controls */}
                <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Map className="size-4 text-muted-foreground" />
                    <h2 className="text-lg font-semibold">Market Heatmap</h2>
                    <Badge variant="outline" className="text-[10px]">
                      {totalMapStocks} Stocks
                    </Badge>
                    {mapSectorFilter !== 'All' && (
                      <Badge variant="secondary" className="text-[10px]">
                        {mapSectorFilter}
                      </Badge>
                    )}
                  </div>

                  <div className="flex items-center gap-2 w-full sm:w-auto sm:ml-auto">
                    {/* Search */}
                    <div className="relative flex-1 sm:flex-none sm:w-[200px]">
                      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
                      <Input
                        type="text"
                        placeholder="Search symbol or name…"
                        className="h-8 text-xs pl-8"
                        value={mapSearch}
                        onChange={(e) => setMapSearch(e.target.value)}
                      />
                    </div>

                    {/* Sector Filter */}
                    <Select
                      value={mapSectorFilter}
                      onValueChange={setMapSectorFilter}
                    >
                      <SelectTrigger className="w-[140px] h-8 text-xs">
                        <SelectValue placeholder="All Sectors" />
                      </SelectTrigger>
                      <SelectContent>
                        {sectorOptions.map((s) => (
                          <SelectItem key={s} value={s}>
                            {s}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Legend */}
                <div className="flex items-center gap-4 text-[10px] text-muted-foreground px-1">
                  <span className="flex items-center gap-1">
                    <span className="size-2.5 rounded-sm bg-emerald-500/70" />
                    Positive
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="size-2.5 rounded-sm bg-gray-400/40" />
                    Flat
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="size-2.5 rounded-sm bg-red-500/70" />
                    Negative
                  </span>
                  <span className="ml-auto hidden sm:inline">
                    Cell size indicates market cap · Click to view analysis
                  </span>
                </div>

                {/* Heatmap Grid */}
                {dataLoading ? (
                  <MarketMapSkeleton />
                ) : mapSectors.length > 0 ? (
                  <div className="space-y-5">
                    {mapSectors.map(([sector, stocks]) => (
                      <section key={sector}>
                        {/* Sector Header */}
                        <div className="flex items-center gap-2 mb-2 px-0.5">
                          <Building2 className="size-3 text-muted-foreground" />
                          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                            {sector}
                          </h3>
                          <Badge variant="secondary" className="text-[9px] px-1.5">
                            {stocks.length}
                          </Badge>
                          {/* Sector avg change */}
                          {(() => {
                            const avgChg =
                              stocks.reduce((s, st) => s + (st.change || 0), 0) /
                              stocks.length;
                            return (
                              <span
                                className={`text-[11px] font-mono tabular-nums ml-1 ${pnlColor(
                                  avgChg
                                )}`}
                              >
                                {fmtPercent(avgChg)}
                              </span>
                            );
                          })()}
                        </div>

                        {/* Stock Cells Grid */}
                        <div className="grid grid-cols-[repeat(auto-fill,minmax(78px,1fr))] gap-1">
                          {stocks.map((stock) => (
                            <HeatmapCell key={stock.symbol} stock={stock} />
                          ))}
                        </div>
                      </section>
                    ))}
                  </div>
                ) : (
                  <Card className="py-10">
                    <div className="flex flex-col items-center gap-2 text-muted-foreground">
                      <Map className="size-6 opacity-30" />
                      <p className="text-sm">
                        {mapSearch
                          ? 'No stocks match your search'
                          : 'No market data available'}
                      </p>
                      {mapSearch && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-xs"
                          onClick={() => {
                            setMapSearch('');
                            setMapSectorFilter('All');
                          }}
                        >
                          Clear filters
                        </Button>
                      )}
                    </div>
                  </Card>
                )}
              </motion.div>
            </AnimatePresence>
          </TabsContent>
        </Tabs>

        {/* Bottom Padding */}
        <div className="h-8" />
      </div>
    </main>
  );
}
