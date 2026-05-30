'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  ArrowUpDown, ArrowUp, ArrowDown, Filter, TrendingUp,
  TrendingDown, Minus, ChevronRight, X, RotateCcw, SlidersHorizontal, Star, RefreshCw,
} from 'lucide-react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { Card, CardContent } from '@/components/ui/card';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Slider } from '@/components/ui/slider';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

import { fmtCurrency, fmtPercent, pnlColor } from '@/utils/formatters';
import type { FairValueResult, ValuationStatus } from '@/lib/fair-value-engine';
import { EGX_STOCKS } from '@/lib/egx-stocks';
import { isWatched, addToWatchlist, removeFromWatchlist } from '@/lib/watchlist-store';

// ── Types ──────────────────────────────────────────────────────

interface ScreenerProps {
  defaultSector?: string | null;
}

interface ScreenerSummary {
  total: number;
  undervalued: number;
  fairlyValued: number;
  overvalued: number;
  highConfidence: number;
  filteredTotal: number;
}

// ── Constants ───────────────────────────────────────────────────

const SECTORS = Array.from(new Set(EGX_STOCKS.map(s => s.sector))).sort();
const STATUS_OPTIONS: Array<{ label: string; value: string }> = [
  { label: 'All', value: 'All' },
  { label: 'Undervalued', value: 'Undervalued' },
  { label: 'Fairly Valued', value: 'Fairly Valued' },
  { label: 'Overvalued', value: 'Overvalued' },
];
const SORT_OPTIONS: Array<{ label: string; value: string }> = [
  { label: 'Upside %', value: 'upside' },
  { label: 'Top Gainers', value: 'top_gainers' },
  { label: 'Top Losers', value: 'top_losers' },
  { label: 'Data Quality', value: 'quality' },
  { label: 'Confidence', value: 'confidence' },
  { label: 'Market Cap', value: 'marketcap' },
  { label: 'P/E Ratio', value: 'pe' },
];

interface FilterState {
  sector: string;
  status: string;
  minQuality: number;
  sort: string;
  sortDir: 'asc' | 'desc';
  minPrice: string;
  maxPrice: string;
  minMarketCap: string;
  maxMarketCap: string;
  minPE: string;
  maxPE: string;
  minROE: string;
  maxDebtEquity: string;
  minDividendYield: string;
  minRevenueGrowth: string;
  minUpside: string;
  maxUpside: string;
  showFilters: boolean;
}

const defaultFilters: FilterState = {
  sector: 'All',
  status: 'All',
  minQuality: 0,
  sort: 'upside',
  sortDir: 'desc',
  minPrice: '',
  maxPrice: '',
  minMarketCap: '',
  maxMarketCap: '',
  minPE: '',
  maxPE: '',
  minROE: '',
  maxDebtEquity: '',
  minDividendYield: '',
  minRevenueGrowth: '',
  minUpside: '',
  maxUpside: '',
  showFilters: false,
};

// ── Helpers ─────────────────────────────────────────────────────

function statusBadge(status: ValuationStatus) {
  const map: Record<ValuationStatus, { cls: string; icon: React.ReactNode }> = {
    'Undervalued': { cls: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800', icon: <TrendingUp className="size-3" /> },
    'Fairly Valued': { cls: 'bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-800', icon: <Minus className="size-3" /> },
    'Overvalued': { cls: 'bg-red-500/15 text-red-700 dark:text-red-400 border-red-200 dark:border-red-800', icon: <TrendingDown className="size-3" /> },
    'N/A': { cls: 'bg-muted text-muted-foreground border-border', icon: <Minus className="size-3" /> },
  };
  const { cls, icon } = map[status] || map['N/A'];
  return (
    <Badge variant="outline" className={`gap-1 text-[11px] px-2 py-0 ${cls}`}>
      {icon}
      {status}
    </Badge>
  );
}

function confidenceDot(confidence: string) {
  const colors: Record<string, string> = { High: 'bg-emerald-500', Medium: 'bg-amber-500', Low: 'bg-red-500' };
  return (
    <span className="inline-flex items-center gap-1.5 text-xs">
      <span className={`size-2 rounded-full ${colors[confidence] || 'bg-muted-foreground'}`} />
      {confidence}
    </span>
  );
}

function qualityBar(score: number) {
  const color = score >= 70 ? 'bg-emerald-500' : score >= 40 ? 'bg-amber-500' : 'bg-red-500';
  return (
    <div className="flex items-center gap-2 min-w-[80px]">
      <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all duration-500 ${color}`} style={{ width: `${score}%` }} />
      </div>
      <span className="text-[11px] text-muted-foreground tabular-nums w-7 text-right">{score}</span>
    </div>
  );
}

// ── Skeleton ────────────────────────────────────────────────────

function ScreenerSkeleton() {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-16 rounded-lg" />)}
      </div>
      <div className="rounded-lg border">
        <div className="px-4 py-3 border-b space-y-2"><Skeleton className="h-4 w-48" /></div>
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="px-4 py-3 border-b flex gap-4 items-center">
            <Skeleton className="h-4 w-16" />
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-4 w-14" />
            <Skeleton className="h-4 w-14" />
            <Skeleton className="h-4 w-16" />
            <Skeleton className="h-5 w-20 rounded" />
            <Skeleton className="h-4 w-16" />
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Component ──────────────────────────────────────────────────

export default function StockScreener({ defaultSector }: ScreenerProps) {
  const [results, setResults] = useState<FairValueResult[]>([]);
  const [summary, setSummary] = useState<ScreenerSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<FilterState>({ ...defaultFilters, sector: defaultSector || 'All' });
  const [watchedSymbols, setWatchedSymbols] = useState<Set<string>>(new Set());
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const prevDefaultSector = useRef(defaultSector);

  // Load watchlist
  useEffect(() => {
    const list = typeof window !== 'undefined' ? JSON.parse(localStorage.getItem('egx_watchlist') || '[]') : [];
    setWatchedSymbols(new Set(list));
  }, []);

  // Sync defaultSector prop changes from parent (e.g. sector click in Overview)
  useEffect(() => {
    if (defaultSector !== undefined && defaultSector !== prevDefaultSector.current) {
      prevDefaultSector.current = defaultSector;
      if (defaultSector) {
        setFilters(f => ({ ...f, sector: defaultSector }));
      }
    }
  }, [defaultSector]);

  const fetchScreener = useCallback(async (isRefresh = false) => {
    if (isRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    setError(null);
    try {
      const params = new URLSearchParams();
      if (filters.sector && filters.sector !== 'All') params.set('sector', filters.sector);
      if (filters.status && filters.status !== 'All') params.set('status', filters.status);
      if (filters.minQuality > 0) params.set('minQuality', String(filters.minQuality));
      if (filters.sort) params.set('sort', filters.sort);
      params.set('limit', '260');
      if (filters.minPrice) params.set('minPrice', filters.minPrice);
      if (filters.maxPrice) params.set('maxPrice', filters.maxPrice);
      if (filters.minMarketCap) params.set('minMarketCap', filters.minMarketCap);
      if (filters.maxMarketCap) params.set('maxMarketCap', filters.maxMarketCap);
      if (filters.minPE) params.set('minPE', filters.minPE);
      if (filters.maxPE) params.set('maxPE', filters.maxPE);
      if (filters.minROE) params.set('minROE', filters.minROE);
      if (filters.maxDebtEquity) params.set('maxDebtEquity', filters.maxDebtEquity);
      if (filters.minDividendYield) params.set('minDividendYield', filters.minDividendYield);
      if (filters.minRevenueGrowth) params.set('minRevenueGrowth', filters.minRevenueGrowth);
      if (filters.minUpside) params.set('minUpside', filters.minUpside);
      if (filters.maxUpside) params.set('maxUpside', filters.maxUpside);

      const res = await fetch(`/api/analysis/screener?${params.toString()}`, { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setResults(data.results || []);
      setSummary(data.summary || null);
      setLastUpdated(new Date());
    } catch (err) {
      console.error('Screener fetch error:', err);
      setError('Failed to load screener data');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [filters]);

  useEffect(() => {
    void fetchScreener();
  }, [fetchScreener]);

  const handleSortToggle = (field: string) => {
    if (filters.sort === field) {
      setFilters(f => ({ ...f, sortDir: f.sortDir === 'desc' ? 'asc' : 'desc' }));
    } else {
      setFilters(f => ({ ...f, sort: field, sortDir: 'desc' }));
    }
  };

  const SortIcon = ({ field }: { field: string }) => {
    if (filters.sort !== field) return <ArrowUpDown className="size-3 opacity-40" />;
    return filters.sortDir === 'desc' ? <ArrowDown className="size-3 text-primary" /> : <ArrowUp className="size-3 text-primary" />;
  };

  const toggleWatch = (symbol: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (watchedSymbols.has(symbol)) {
      removeFromWatchlist(symbol);
      setWatchedSymbols(prev => { const n = new Set(prev); n.delete(symbol); return n; });
    } else {
      addToWatchlist(symbol);
      setWatchedSymbols(prev => new Set(prev).add(symbol));
    }
  };

  const resetFilters = () => setFilters(defaultFilters);

  const hasActiveFilters = filters.sector !== 'All' || filters.status !== 'All' || filters.minQuality > 0 ||
    filters.minPrice || filters.maxPrice || filters.minMarketCap || filters.maxMarketCap ||
    filters.minPE || filters.maxPE || filters.minROE || filters.maxDebtEquity ||
    filters.minDividendYield || filters.minRevenueGrowth || filters.minUpside || filters.maxUpside;

  return (
    <div className="space-y-4">
      {/* Filter Controls Row 1: Main Filters */}
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground font-medium">Sector</label>
          <Select value={filters.sector} onValueChange={v => setFilters(f => ({ ...f, sector: v }))}>
            <SelectTrigger className="w-[150px] h-8 text-xs">
              <SelectValue placeholder="All Sectors" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="All">All Sectors</SelectItem>
              {SECTORS.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1">
          <label className="text-xs text-muted-foreground font-medium">Status</label>
          <Select value={filters.status} onValueChange={v => setFilters(f => ({ ...f, status: v }))}>
            <SelectTrigger className="w-[150px] h-8 text-xs">
              <SelectValue placeholder="All" />
            </SelectTrigger>
            <SelectContent>
              {STATUS_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1">
          <label className="text-xs text-muted-foreground font-medium">Sort By</label>
          <Select value={filters.sort} onValueChange={v => setFilters(f => ({ ...f, sort: v, sortDir: 'desc' }))}>
            <SelectTrigger className="w-[140px] h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SORT_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1 min-w-[160px]">
          <label className="text-xs text-muted-foreground font-medium">
            Min Quality: <span className="text-foreground tabular-nums">{filters.minQuality}</span>
          </label>
          <Slider
            value={[filters.minQuality]}
            min={0}
            max={100}
            step={10}
            onValueChange={v => setFilters(f => ({ ...f, minQuality: v[0] }))}
            className="w-full"
          />
        </div>

        <Button
          variant="outline"
          size="sm"
          className="h-8 gap-1.5"
          onClick={() => setFilters(f => ({ ...f, showFilters: !f.showFilters }))}
        >
          <SlidersHorizontal className="size-3.5" />
          Filters
          {hasActiveFilters && (
            <Badge variant="secondary" className="text-[9px] px-1 h-4 ml-1">Active</Badge>
          )}
        </Button>

        {hasActiveFilters && (
          <Button variant="ghost" size="sm" className="h-8 gap-1.5" onClick={resetFilters}>
            <RotateCcw className="size-3" />
            Reset
          </Button>
        )}

        {/* Refresh Button */}
        <Button
          variant="outline"
          size="sm"
          className="h-8 gap-1.5 ml-auto"
          onClick={() => void fetchScreener(true)}
          disabled={loading || refreshing}
        >
          <RefreshCw className={`size-3.5 ${refreshing ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* Advanced Filters Panel */}
      <AnimatePresence>
        {filters.showFilters && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <Card className="py-4 px-5">
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {/* Price Range */}
                <div className="space-y-1">
                  <label className="text-[11px] text-muted-foreground font-medium">Min Price (EGP)</label>
                  <Input
                    type="number"
                    placeholder="0"
                    className="h-8 text-xs"
                    value={filters.minPrice}
                    onChange={e => setFilters(f => ({ ...f, minPrice: e.target.value }))}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[11px] text-muted-foreground font-medium">Max Price (EGP)</label>
                  <Input
                    type="number"
                    placeholder="∞"
                    className="h-8 text-xs"
                    value={filters.maxPrice}
                    onChange={e => setFilters(f => ({ ...f, maxPrice: e.target.value }))}
                  />
                </div>
                {/* Market Cap */}
                <div className="space-y-1">
                  <label className="text-[11px] text-muted-foreground font-medium">Min Market Cap</label>
                  <Select value={filters.minMarketCap} onValueChange={v => setFilters(f => ({ ...f, minMarketCap: v }))}>
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue placeholder="Any" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">Any</SelectItem>
                      <SelectItem value="100000000">100M+</SelectItem>
                      <SelectItem value="500000000">500M+</SelectItem>
                      <SelectItem value="1000000000">1B+</SelectItem>
                      <SelectItem value="10000000000">10B+</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {/* P/E Range */}
                <div className="space-y-1">
                  <label className="text-[11px] text-muted-foreground font-medium">P/E Range</label>
                  <div className="flex gap-1">
                    <Input
                      type="number"
                      placeholder="Min"
                      className="h-8 text-xs"
                      value={filters.minPE}
                      onChange={e => setFilters(f => ({ ...f, minPE: e.target.value }))}
                    />
                    <Input
                      type="number"
                      placeholder="Max"
                      className="h-8 text-xs"
                      value={filters.maxPE}
                      onChange={e => setFilters(f => ({ ...f, maxPE: e.target.value }))}
                    />
                  </div>
                </div>
                {/* Min ROE */}
                <div className="space-y-1">
                  <label className="text-[11px] text-muted-foreground font-medium">Min ROE (%)</label>
                  <Input
                    type="number"
                    placeholder="0"
                    className="h-8 text-xs"
                    value={filters.minROE}
                    onChange={e => setFilters(f => ({ ...f, minROE: e.target.value }))}
                  />
                </div>
                {/* Max D/E */}
                <div className="space-y-1">
                  <label className="text-[11px] text-muted-foreground font-medium">Max Debt/Equity</label>
                  <Input
                    type="number"
                    placeholder="∞"
                    className="h-8 text-xs"
                    value={filters.maxDebtEquity}
                    onChange={e => setFilters(f => ({ ...f, maxDebtEquity: e.target.value }))}
                  />
                </div>
                {/* Min Div Yield */}
                <div className="space-y-1">
                  <label className="text-[11px] text-muted-foreground font-medium">Min Div. Yield (%)</label>
                  <Input
                    type="number"
                    placeholder="0"
                    className="h-8 text-xs"
                    value={filters.minDividendYield}
                    onChange={e => setFilters(f => ({ ...f, minDividendYield: e.target.value }))}
                  />
                </div>
                {/* Min Revenue Growth */}
                <div className="space-y-1">
                  <label className="text-[11px] text-muted-foreground font-medium">Min Revenue Growth (%)</label>
                  <Input
                    type="number"
                    placeholder="0"
                    className="h-8 text-xs"
                    value={filters.minRevenueGrowth}
                    onChange={e => setFilters(f => ({ ...f, minRevenueGrowth: e.target.value }))}
                  />
                </div>
                {/* Min Upside */}
                <div className="space-y-1">
                  <label className="text-[11px] text-muted-foreground font-medium">Min Upside (%)</label>
                  <Input
                    type="number"
                    placeholder="0"
                    className="h-8 text-xs"
                    value={filters.minUpside}
                    onChange={e => setFilters(f => ({ ...f, minUpside: e.target.value }))}
                  />
                </div>
                {/* Max Upside */}
                <div className="space-y-1">
                  <label className="text-[11px] text-muted-foreground font-medium">Max Upside (%)</label>
                  <Input
                    type="number"
                    placeholder="∞"
                    className="h-8 text-xs"
                    value={filters.maxUpside}
                    onChange={e => setFilters(f => ({ ...f, maxUpside: e.target.value }))}
                  />
                </div>
              </div>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Loading State */}
      {loading && <ScreenerSkeleton />}

      {/* Error State */}
      {error && !loading && (
        <Card className="border-red-200 dark:border-red-800">
          <CardContent className="flex items-center justify-between py-4">
            <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
            <button onClick={() => void fetchScreener()} className="text-sm text-primary underline underline-offset-2 hover:text-primary/80">Retry</button>
          </CardContent>
        </Card>
      )}

      {/* Summary Bar */}
      {!loading && summary && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Card className="py-3 px-4">
            <div className="flex items-center gap-2">
              <div className="size-8 rounded-lg bg-primary/10 flex items-center justify-center">
                <Filter className="size-4 text-primary" />
              </div>
              <div>
                <p className="text-[11px] text-muted-foreground uppercase tracking-wider">Filtered</p>
                <p className="text-lg font-semibold tabular-nums leading-none">{summary.filteredTotal ?? summary.total}</p>
              </div>
            </div>
          </Card>
          <Card className="py-3 px-4">
            <div className="flex items-center gap-2">
              <div className="size-8 rounded-lg bg-emerald-500/10 flex items-center justify-center">
                <TrendingUp className="size-4 text-emerald-600 dark:text-emerald-400" />
              </div>
              <div>
                <p className="text-[11px] text-muted-foreground uppercase tracking-wider">Undervalued</p>
                <p className="text-lg font-semibold tabular-nums leading-none text-emerald-600 dark:text-emerald-400">{summary.undervalued}</p>
              </div>
            </div>
          </Card>
          <Card className="py-3 px-4">
            <div className="flex items-center gap-2">
              <div className="size-8 rounded-lg bg-amber-500/10 flex items-center justify-center">
                <Minus className="size-4 text-amber-600 dark:text-amber-400" />
              </div>
              <div>
                <p className="text-[11px] text-muted-foreground uppercase tracking-wider">Fair</p>
                <p className="text-lg font-semibold tabular-nums leading-none text-amber-600 dark:text-amber-400">{summary.fairlyValued}</p>
              </div>
            </div>
          </Card>
          <Card className="py-3 px-4">
            <div className="flex items-center gap-2">
              <div className="size-8 rounded-lg bg-red-500/10 flex items-center justify-center">
                <TrendingDown className="size-4 text-red-600 dark:text-red-400" />
              </div>
              <div>
                <p className="text-[11px] text-muted-foreground uppercase tracking-wider">Overvalued</p>
                <p className="text-lg font-semibold tabular-nums leading-none text-red-600 dark:text-red-400">{summary.overvalued}</p>
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* Results Table */}
      {!loading && (
        <Card className="py-0">
          <CardContent className="p-0">
            <div className="max-h-[600px] overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/30 hover:bg-muted/30">
                    <TableHead className="w-8" />
                    <TableHead className="w-[80px]">
                      <button onClick={() => handleSortToggle('upside')} className="flex items-center gap-1 hover:text-foreground">
                        Symbol <SortIcon field="upside" />
                      </button>
                    </TableHead>
                    <TableHead className="hidden md:table-cell">Name</TableHead>
                    <TableHead className="hidden sm:table-cell">Sector</TableHead>
                    <TableHead className="text-right">
                      <button onClick={() => handleSortToggle('pe')} className="flex items-center gap-1 ml-auto hover:text-foreground">
                        Price <SortIcon field="pe" />
                      </button>
                    </TableHead>
                    <TableHead className="text-right hidden sm:table-cell">Fair Value</TableHead>
                    <TableHead className="text-right">
                      <button onClick={() => handleSortToggle('upside')} className="flex items-center gap-1 ml-auto hover:text-foreground">
                        Upside <SortIcon field="upside" />
                      </button>
                    </TableHead>
                    <TableHead className="text-center">Status</TableHead>
                    <TableHead className="hidden lg:table-cell text-center">
                      <button onClick={() => handleSortToggle('confidence')} className="flex items-center gap-1 ml-auto hover:text-foreground">
                        Conf. <SortIcon field="confidence" />
                      </button>
                    </TableHead>
                    <TableHead className="hidden md:table-cell">
                      <button onClick={() => handleSortToggle('quality')} className="flex items-center gap-1 hover:text-foreground">
                        Quality <SortIcon field="quality" />
                      </button>
                    </TableHead>
                    <TableHead className="w-8" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {results.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={10} className="text-center py-12 text-muted-foreground">
                        {error ? 'Failed to load results' : 'No stocks match your filters'}
                      </TableCell>
                    </TableRow>
                  )}
                  {results.map((r) => (
                    <TableRow key={r.symbol} className="cursor-pointer group">
                      <TableCell className="px-2">
                        <button
                          onClick={(e) => toggleWatch(r.symbol, e)}
                          className="opacity-40 group-hover:opacity-100 transition-opacity"
                        >
                          <Star className={`size-3.5 ${watchedSymbols.has(r.symbol) ? 'fill-amber-400 text-amber-400' : 'text-muted-foreground'}`} />
                        </button>
                      </TableCell>
                      <TableCell className="font-mono font-semibold text-sm">
                        <Link href={`/analysis/${r.symbol}`} className="hover:underline">{r.symbol}</Link>
                      </TableCell>
                      <TableCell className="hidden md:table-cell text-sm text-muted-foreground max-w-[200px] truncate">
                        {r.name}
                      </TableCell>
                      <TableCell className="hidden sm:table-cell">
                        <Badge variant="secondary" className="text-[10px] px-1.5 py-0">{r.sector}</Badge>
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm tabular-nums">
                        {fmtCurrency(r.currentPrice)}
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm tabular-nums hidden sm:table-cell text-muted-foreground">
                        {r.weightedFairValue > 0 ? fmtCurrency(r.weightedFairValue) : '—'}
                      </TableCell>
                      <TableCell className={`text-right font-mono text-sm tabular-nums font-medium ${pnlColor(r.weightedUpside)}`}>
                        {fmtPercent(r.weightedUpside)}
                      </TableCell>
                      <TableCell className="text-center">{statusBadge(r.status)}</TableCell>
                      <TableCell className="hidden lg:table-cell text-center">{confidenceDot(r.confidence)}</TableCell>
                      <TableCell className="hidden md:table-cell">{qualityBar(r.dataQuality)}</TableCell>
                      <TableCell>
                        <Link href={`/analysis/${r.symbol}`} className="opacity-0 group-hover:opacity-100 transition-opacity">
                          <ChevronRight className="size-4 text-muted-foreground" />
                        </Link>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            {results.length > 0 && (
              <div className="px-4 py-2 border-t bg-muted/20 flex items-center justify-between">
                <p className="text-[11px] text-muted-foreground">
                  Showing {results.length} of {summary?.filteredTotal ?? summary?.total ?? results.length} stocks
                  &middot; Data from TradingView
                </p>
                {lastUpdated && (
                  <p className="text-[11px] text-muted-foreground">
                    Updated: {lastUpdated.toLocaleTimeString()}
                  </p>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
