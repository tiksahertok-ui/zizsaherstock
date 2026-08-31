'use client';

import { useState, useEffect, useCallback, useMemo, Fragment } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search, Download, RefreshCw, TrendingUp, TrendingDown, Minus,
  Shield, Target, AlertTriangle, BarChart3, ChevronDown, ChevronUp,
  ArrowUpDown, Zap, CheckCircle, XCircle, ArrowLeft,
  Radio, Clock, Loader2, Activity, Crosshair, CalendarDays, FileWarning,
  Flame, Eye, LayoutGrid, LayoutList, Filter, ChevronRight,
  ArrowUpRight, ArrowDownRight, Gauge, Layers, TrendingUpIcon,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

// ── Types ────────────────────────────────────────────────
type SignalType = 'Strong Buy' | 'Buy' | 'Hold' | 'Sell' | 'Strong Sell';

interface TakeProfitTarget { level: number; price: number; basis: string; probability: string; }
interface SignalRationale { tag: string; weight: number; direction: number; description: string; }
interface DataQuality { score: number; grade: string; missingIndicators: string[]; anomalies: string[]; }

interface EntryPriceDetail {
  price: number; strategy: string; basis: string; discount: number;
}

// ── Daily Picks types (from server-side API) ──
interface DailyPickScoreBreakdown { signal: number; trend: number; momentum: number; volume: number; riskReward: number; pattern: number; total: number; }
interface DailyPick extends ScreenerStock {
  nextSessionScore: number;
  scoreBreakdown: DailyPickScoreBreakdown;
  rank: number;
  topRationale: string[];
}

interface ScreenerStock {
  symbol: string; name: string; sector: string;
  signal: SignalType; confidence: number;
  entryPrice: number; entryDetail: EntryPriceDetail;
  stopLoss: number; stopLossPct: number;
  takeProfits: TakeProfitTarget[]; riskReward: number; positionSize: number;
  rationale: SignalRationale[]; tags: string[];
  timeframe: string; horizon: string;
  indicators: {
    rsi: number; macd: number; macdSignal: number; stochK: number; stochD: number;
    atr: number; bbUpper: number; bbLower: number; sma20: number; sma50: number;
    sma200: number; ema20: number; ema50: number; ema200: number;
    volume: number; close: number; recommendAll: number; bbWidth: number;
    priceVsSma200: number; priceVsBB: number;
  };
  dataQuality: DataQuality;
  riskFlags: string[]; generatedAt: string;
}

interface ScreenerSummary {
  total: number; strongBuy: number; buy: number; hold: number; sell: number; strongSell: number;
  avgConfidence: number; filteredTotal: number;
  topSignals: { symbol: string; signal: SignalType; confidence: number }[];
  sectorBreakdown: Record<string, { bullish: number; bearish: number; neutral: number }>;
  timeframe: string;
  dataQualityStats: { avgScore: number; stocksWithAnomalies: number; missingDataCount: number };
}

// ── Constants ────────────────────────────────────────────────
const SIGNAL_CONFIG: Record<SignalType, {
  bg: string; text: string; border: string; icon: typeof TrendingUp;
  glow: string; gradient: string; pill: string;
  dotColor: string;
}> = {
  'Strong Buy': {
    bg: 'bg-emerald-500/[0.08]', text: 'text-emerald-600 dark:text-emerald-400',
    border: 'border-emerald-500/25', icon: TrendingUp,
    glow: 'shadow-[0_0_30px_-5px_rgba(16,185,129,0.15)]',
    gradient: 'from-emerald-500/20 to-emerald-600/5',
    pill: 'bg-emerald-500 text-white border-emerald-500',
    dotColor: 'bg-emerald-500',
  },
  'Buy': {
    bg: 'bg-emerald-500/[0.06]', text: 'text-emerald-500 dark:text-emerald-400',
    border: 'border-emerald-500/15', icon: TrendingUp,
    glow: '', gradient: 'from-emerald-400/10 to-emerald-500/5',
    pill: 'bg-emerald-500/90 text-white border-emerald-400',
    dotColor: 'bg-emerald-400',
  },
  'Hold': {
    bg: 'bg-amber-500/[0.06]', text: 'text-amber-600 dark:text-amber-400',
    border: 'border-amber-500/15', icon: Minus,
    glow: '', gradient: 'from-amber-400/10 to-amber-500/5',
    pill: 'bg-amber-500/90 text-white border-amber-400',
    dotColor: 'bg-amber-400',
  },
  'Sell': {
    bg: 'bg-red-500/[0.06]', text: 'text-red-500 dark:text-red-400',
    border: 'border-red-500/15', icon: TrendingDown,
    glow: '', gradient: 'from-red-400/10 to-red-500/5',
    pill: 'bg-red-500/90 text-white border-red-400',
    dotColor: 'bg-red-400',
  },
  'Strong Sell': {
    bg: 'bg-red-500/[0.08]', text: 'text-red-600 dark:text-red-400',
    border: 'border-red-500/25', icon: TrendingDown,
    glow: 'shadow-[0_0_30px_-5px_rgba(239,68,68,0.15)]',
    gradient: 'from-red-500/20 to-red-600/5',
    pill: 'bg-red-600 text-white border-red-500',
    dotColor: 'bg-red-500',
  },
};

const SIGNAL_AR: Record<SignalType, string> = {
  'Strong Buy': 'شراء قوي', Buy: 'شراء', Hold: 'انتظار', Sell: 'تقليل', 'Strong Sell': 'تجنب',
};

const SECTORS = [
  'All', 'Financials', 'Real Estate', 'Materials', 'Healthcare',
  'Industrials', 'Consumer Discretionary', 'Consumer Defensive',
  'Energy', 'Technology',
];
const TIMEFRAMES = [{ value: 'daily', label: 'يومي' }, { value: 'weekly', label: 'أسبوعي' }, { value: 'monthly', label: 'شهري' }];
const INDICATOR_LIST = ['SMA20', 'SMA50', 'SMA200', 'EMA20', 'EMA50', 'EMA200'] as const;
const DQ_GRADE_COLORS: Record<string, string> = { 'A+': 'text-emerald-600', A: 'text-emerald-500', 'B+': 'text-blue-500', B: 'text-blue-400', 'C+': 'text-amber-500', C: 'text-amber-400', D: 'text-orange-500', F: 'text-red-500' };

// ── Animation Variants ────────────────────────────────────────────────
const fadeInUp = { initial: { opacity: 0, y: 12 }, animate: { opacity: 1, y: 0 } };
const stagger = { animate: { transition: { staggerChildren: 0.04 } } };
const scaleIn = { initial: { opacity: 0, scale: 0.96 }, animate: { opacity: 1, scale: 1 } };

// ── Component ────────────────────────────────────────────────
export default function ScreenerPage() {
  const [sector, setSector] = useState('All');
  const [signalFilter, setSignalFilter] = useState('All');
  const [minConfidence, setMinConfidence] = useState('0');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortField, setSortField] = useState('confidence');
  const [sortDir, setSortDir] = useState<'desc' | 'asc'>('desc');
  const [timeframe, setTimeframe] = useState('daily');
  const [stocks, setStocks] = useState<ScreenerStock[]>([]);
  const [summary, setSummary] = useState<ScreenerSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string>('');
  const [viewMode, setViewMode] = useState<'table' | 'cards'>('table');

  // ── Daily Picks state (server-computed) ──
  const [dailyPicks, setDailyPicks] = useState<DailyPick[]>([]);
  const [dailyPicksLoading, setDailyPicksLoading] = useState(true);
  const [dailyPicksMeta, setDailyPicksMeta] = useState<{ totalCandidates: number; version: string; generatedAt: string; disclaimer: string; batchDate?: string; diversity?: { sectorDistribution: Record<string, number>; concentrationRatio: number; sectorCount: number; isConcentrated: boolean } } | null>(null);

  const fetchDailyPicks = useCallback(async () => {
    setDailyPicksLoading(true);
    try {
      const res = await fetch(`/api/analysis/daily-picks?timeframe=${timeframe}`);
      if (!res.ok) throw new Error('fail');
      const data = await res.json();
      setDailyPicks(data.picks || []);
      setDailyPicksMeta({
        totalCandidates: data.totalCandidates,
        version: data._meta?.scoringVersion,
        generatedAt: data.generatedAt,
        disclaimer: data._meta?.disclaimer,
        batchDate: data._meta?.batchDate,
        diversity: data.diversity,
      });
    } catch { /* silent — picks are supplementary, not critical */ }
    finally { setDailyPicksLoading(false); }
  }, [timeframe]);

  useEffect(() => { fetchDailyPicks(); }, [fetchDailyPicks]);

  const fetchScreener = useCallback(async () => {
    setLoading(true);
    try {
      const p = new URLSearchParams();
      if (sector !== 'All') p.set('sector', sector);
      if (signalFilter !== 'All') p.set('signal', signalFilter);
      if (parseInt(minConfidence) > 0) p.set('minConfidence', minConfidence);
      p.set('sort', sortField); p.set('timeframe', timeframe);
      const res = await fetch('/api/analysis/technical-screener?' + p);
      if (!res.ok) throw new Error('fail');
      const data = await res.json();
      setStocks(data.stocks || []); setSummary(data.summary || null);
      setLastUpdated(data.generatedAt || new Date().toISOString());
    } catch { toast.error('فشل تحميل بيانات الفحص'); } finally { setLoading(false); }
  }, [sector, signalFilter, minConfidence, sortField, timeframe]);

  useEffect(() => { fetchScreener(); }, [fetchScreener]);

  const filteredStocks = useMemo(() => {
    let list = [...stocks];
    if (searchQuery) { const q = searchQuery.toUpperCase(); list = list.filter(s => s.symbol.includes(q) || s.name.toUpperCase().includes(q)); }
    list.sort((a, b) => {
      const mul = sortDir === 'desc' ? -1 : 1;
      if (sortField === 'confidence') return (a.confidence - b.confidence) * mul;
      if (sortField === 'riskReward') return (a.riskReward - b.riskReward) * mul;
      if (sortField === 'entryPrice') return (a.entryPrice - b.entryPrice) * mul;
      if (sortField === 'rsi') return (a.indicators.rsi - b.indicators.rsi) * mul;
      return 0;
    });
    return list;
  }, [stocks, searchQuery, sortField, sortDir]);

  const handleExport = async () => {
    try {
      const p = new URLSearchParams({ format: 'csv', timeframe });
      if (sector !== 'All') p.set('sector', sector);
      const res = await fetch('/api/analysis/technical-screener?' + p);
      const blob = await res.blob(); const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = 'egx_screener_' + timeframe + '_' + new Date().toISOString().slice(0, 10) + '.csv'; a.click(); URL.revokeObjectURL(url);
      toast.success('تم تصدير CSV');
    } catch { toast.error('فشل التصدير'); }
  };

  const SignalBadge = ({ signal, size = 'sm' }: { signal: SignalType; size?: 'sm' | 'md' }) => {
    const cfg = SIGNAL_CONFIG[signal];
    const Icon = cfg.icon;
    const sizeClasses = size === 'md'
      ? 'px-3 py-1.5 text-xs gap-1.5 rounded-lg'
      : 'px-2 py-0.5 text-[10px] gap-1 rounded-md';
    return (
      <span className={cfg.pill + ' inline-flex items-center font-bold border ' + sizeClasses}>
        <Icon className={size === 'md' ? 'w-3 h-3' : 'w-2.5 h-2.5'} />
        {SIGNAL_AR[signal]}
      </span>
    );
  };

  const ConfidenceRing = ({ value, size = 36 }: { value: number; size?: number }) => {
    const r = (size - 6) / 2;
    const circ = 2 * Math.PI * r;
    const offset = circ - (value / 100) * circ;
    const color = value >= 65 ? '#10b981' : value >= 45 ? '#f59e0b' : '#ef4444';
    return (
      <div className="relative" style={{ width: size, height: size }}>
        <svg className="-rotate-90" width={size} height={size}>
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="currentColor" strokeWidth={3} className="text-muted/50" />
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={3} strokeDasharray={circ} strokeDashoffset={offset} strokeLinecap="round" className="transition-all duration-700" />
        </svg>
        <span className="absolute inset-0 flex items-center justify-center text-[10px] font-bold" style={{ color }}>{value}</span>
      </div>
    );
  };

  const bullCount = summary ? summary.strongBuy + summary.buy : 0;
  const bearCount = summary ? summary.sell + summary.strongSell : 0;
  const tfLabel = TIMEFRAMES.find(t => t.value === timeframe)?.label || 'يومي';
  const pctOf = (n: number, total: number) => total > 0 ? ((n / total) * 100).toFixed(1) : '0';

  // ── Price Targets Panel ──
  const PriceTargetsBar = ({ s, compact = false }: { s: ScreenerStock; compact?: boolean }) => {
    const entry = s.entryPrice;
    const sl = s.stopLoss;
    const tps = s.takeProfits;
    const isBull = s.signal.includes('Buy');
    const isBear = s.signal.includes('Sell');

    // All price levels for range calculation
    const allPrices = [sl, entry, s.indicators.close, ...tps.map(tp => tp.price)].filter(p => p > 0);
    const minP = Math.min(...allPrices);
    const maxP = Math.max(...allPrices);
    const range = maxP - minP || 1;
    // Add 8% padding so markers don't sit on edges
    const pad = range * 0.08;
    const pos = (p: number) => ((p - minP + pad) / (range + pad * 2)) * 100;
    const entryPos = pos(entry);
    const slPos = pos(sl);

    // Probability theme config
    const probTheme: Record<string, { dot: string; text: string; bg: string; border: string; ring: string }> = {
      High:   { dot: 'bg-emerald-400', text: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-500/[0.06]', border: 'border-emerald-500/20', ring: 'ring-emerald-500/30' },
      Medium: { dot: 'bg-amber-400',  text: 'text-amber-600 dark:text-amber-400',  bg: 'bg-amber-500/[0.06]',  border: 'border-amber-500/20',  ring: 'ring-amber-500/30' },
      Low:    { dot: 'bg-slate-400',  text: 'text-slate-500 dark:text-slate-400',  bg: 'bg-slate-500/[0.04]', border: 'border-slate-400/15', ring: 'ring-slate-400/20' },
    };
    const probAr: Record<string, string> = { High: 'مرتفع', Medium: 'متوسط', Low: 'منخفض' };

    if (compact) {
      return (
        <div className="relative h-2 rounded-full overflow-hidden bg-muted/40 border border-border/30">
          {/* Risk zone */}
          <div className="absolute inset-y-0 left-0 bg-gradient-to-r from-red-500/15 to-red-500/5" style={{ width: entryPos + '%' }} />
          {/* Reward zone */}
          <div className="absolute inset-y-0 bg-gradient-to-l from-emerald-500/15 to-emerald-500/5" style={{ left: entryPos + '%' }} />
          {/* SL marker */}
          <TooltipProvider delayDuration={200}><Tooltip><TooltipTrigger asChild>
            <div className="absolute top-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full bg-red-500 border-[1.5px] border-background z-20 shadow-sm shadow-red-500/30" style={{ left: `calc(${slPos}% - 5px)` }} />
          </TooltipTrigger><TooltipContent side="bottom" className="text-[10px]"><span className="text-red-500 font-semibold">وقف</span> {sl.toFixed(2)}</TooltipContent></Tooltip></TooltipProvider>
          {/* Entry marker */}
          <TooltipProvider delayDuration={200}><Tooltip><TooltipTrigger asChild>
            <div className="absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-blue-500 border-2 border-background z-30 shadow-sm shadow-blue-500/40" style={{ left: `calc(${entryPos}% - 6px)` }} />
          </TooltipTrigger><TooltipContent side="bottom" className="text-[10px]"><span className="text-blue-500 font-semibold">دخول</span> {entry.toFixed(2)}</TooltipContent></Tooltip></TooltipProvider>
          {/* TP markers */}
          {tps.map((tp) => (
            <TooltipProvider key={tp.level} delayDuration={200}><Tooltip><TooltipTrigger asChild>
              <div className={"absolute top-1/2 -translate-y-1/2 w-2 h-2 rounded-full z-20 border-[1.5px] border-background shadow-sm " + (tp.probability === 'High' ? 'bg-emerald-400 shadow-emerald-500/30' : tp.probability === 'Medium' ? 'bg-amber-400 shadow-amber-500/30' : 'bg-slate-400')} style={{ left: `calc(${pos(tp.price)}% - 4px)` }} />
            </TooltipTrigger><TooltipContent side="bottom" className="text-[10px]"><span className="text-emerald-500 font-semibold">مستهدف {tp.level}</span> {tp.price.toFixed(2)} <span className="text-muted-foreground">(+{((tp.price - entry) / entry * 100).toFixed(1)}%)</span></TooltipContent></Tooltip></TooltipProvider>
          ))}
          {/* Current price marker */}
          <TooltipProvider delayDuration={200}><Tooltip><TooltipTrigger asChild>
            <div className="absolute top-1/2 -translate-y-1/2 w-2 h-2 rounded-full z-10 bg-foreground/50 border-[1.5px] border-background" style={{ left: `calc(${pos(s.indicators.close)}% - 4px)` }} />
          </TooltipTrigger><TooltipContent side="top" className="text-[10px]"><span className="font-semibold">آخر إغلاق</span> {s.indicators.close.toFixed(2)}</TooltipContent></Tooltip></TooltipProvider>
        </div>
      );
    }

    // ── Full panel (expanded row) ──
    const rrColor = s.riskReward >= 2 ? 'text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border-emerald-500/20' : s.riskReward >= 1 ? 'text-amber-600 dark:text-amber-400 bg-amber-500/10 border-amber-500/20' : s.riskReward > 0 ? 'text-red-500 bg-red-500/10 border-red-500/20' : 'text-muted-foreground bg-muted/50 border-border/30';
    const tp1PctFromEntry = tps[0] ? ((tps[0].price - entry) / entry * 100) : 0;
    // For R:R display: use natural sign (positive for bull TP, negative for bear TP)
    const tp1DisplayPct = tps[0] ? tp1PctFromEntry : 0;

    return (
      <div className="space-y-4">
        {/* ── Visual Price Scale ── */}
        <div className="relative">
          {/* Track */}
          <div className="relative h-10 rounded-xl overflow-hidden bg-muted/20 border border-border/30">
            {/* Risk zone (red tint) */}
            <div className="absolute inset-y-0 left-0 bg-gradient-to-r from-red-500/[0.12] to-red-500/[0.03]" style={{ width: entryPos + '%' }} />
            {/* Reward zone (green tint) */}
            <div className="absolute inset-y-0 bg-gradient-to-l from-emerald-500/[0.12] to-emerald-500/[0.03]" style={{ left: entryPos + '%' }} />
            {/* Center entry line */}
            <div className="absolute inset-y-0 w-0.5 bg-blue-500/80 z-20" style={{ left: entryPos + '%' }} />
            {/* SL vertical marker */}
            <div className="absolute inset-y-0 w-px bg-red-500/50 z-10" style={{ left: slPos + '%' }} />
            {/* TP vertical markers */}
            {tps.map(tp => (
              <div key={tp.level} className={"absolute inset-y-0 w-px z-10 " + (tp.probability === 'High' ? 'bg-emerald-500/60' : tp.probability === 'Medium' ? 'bg-amber-500/40' : 'bg-slate-400/30')} style={{ left: pos(tp.price) + '%' }} />
            ))}
            {/* Current price vertical marker */}
            <div className="absolute inset-y-0 w-px bg-foreground/30 z-10" style={{ left: pos(s.indicators.close) + '%' }} />
            {/* Quarter grid lines */}
            {[0.25, 0.5, 0.75].map(p => <div key={p} className="absolute inset-y-0 w-px bg-border/15" style={{ left: (p * 100) + '%' }} />)}
          </div>

          {/* Floating labels above/below the track */}
          <div className="relative -mt-10 h-10 pointer-events-none">
            {/* SL label */}
            <div className="absolute top-0 z-30 pointer-events-auto" style={{ left: slPos + '%', transform: 'translateX(-50%)' }}>
              <div className="flex flex-col items-center">
                <span className="text-[9px] font-bold text-red-500 bg-red-500/10 border border-red-500/20 px-1.5 py-0.5 rounded-md whitespace-nowrap shadow-sm">{sl.toFixed(2)}</span>
                <span className="w-px h-1.5 bg-red-500/40" />
              </div>
            </div>
            {/* Entry label */}
            <div className="absolute top-0 z-30 pointer-events-auto" style={{ left: entryPos + '%', transform: 'translateX(-50%)' }}>
              <div className="flex flex-col items-center">
                <span className="text-[9px] font-bold text-blue-600 dark:text-blue-400 bg-blue-500/10 border border-blue-500/25 px-1.5 py-0.5 rounded-md whitespace-nowrap shadow-sm ring-1 ring-blue-500/10">{entry.toFixed(2)}</span>
                <span className="w-px h-1.5 bg-blue-500/60" />
              </div>
            </div>
            {/* Current price label */}
            <div className="absolute bottom-0 z-30 pointer-events-auto" style={{ left: pos(s.indicators.close) + '%', transform: 'translateX(-50%)' }}>
              <div className="flex flex-col-reverse items-center">
                <span className="text-[8px] font-semibold text-foreground/70 bg-muted/80 border border-border/40 px-1 py-0.5 rounded whitespace-nowrap">آخر إغلاق {s.indicators.close.toFixed(2)}</span>
                <span className="w-px h-1.5 bg-foreground/30" />
              </div>
            </div>
            {/* TP labels — alternate top/bottom to avoid overlap */}
            {tps.map((tp, idx) => {
              const theme = probTheme[tp.probability] || probTheme.Low;
              const isTop = idx % 2 === 0;
              return (
                <div key={tp.level} className={"absolute z-30 pointer-events-auto " + (isTop ? 'top-0' : 'bottom-0')} style={{ left: pos(tp.price) + '%', transform: 'translateX(-50%)' }}>
                  <div className={"flex flex-col items-center " + (isTop ? '' : 'flex-col-reverse')}>
                    <span className={"text-[9px] font-bold border px-1.5 py-0.5 rounded-md whitespace-nowrap shadow-sm " + theme.text + ' ' + theme.bg + ' ' + theme.border}>
                      {tp.price.toFixed(2)}
                    </span>
                    <span className={"w-px h-1.5 " + (tp.probability === 'High' ? 'bg-emerald-500/40' : tp.probability === 'Medium' ? 'bg-amber-500/30' : 'bg-slate-400/20')} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* ── Level Cards Grid ── */}
        <div className="grid grid-cols-5 gap-2">
          {/* Stop Loss Card */}
          <div className="rounded-lg border border-red-500/20 bg-red-500/[0.03] overflow-hidden">
            <div className="h-0.5 bg-gradient-to-r from-red-500/60 to-red-500/20" />
            <div className="p-2.5 text-center">
              <div className="flex items-center justify-center gap-1.5 mb-2">
                <div className="w-5 h-5 rounded-md bg-red-500/10 flex items-center justify-center"><Shield className="w-3 h-3 text-red-500" /></div>
              </div>
              <div className="text-[9px] font-semibold text-red-500/70 uppercase tracking-wider mb-1">وقف الخسارة</div>
              <div className="text-sm font-bold font-mono text-red-600 dark:text-red-400">{sl.toFixed(2)}</div>
              <div className="flex items-center justify-center gap-0.5 mt-1">
                <ArrowDownRight className="w-2.5 h-2.5 text-red-500" />
                <span className="text-[10px] font-semibold text-red-500">{s.stopLossPct.toFixed(1)}%</span>
              </div>
            </div>
          </div>

          {/* Entry Card */}
          <div className="rounded-lg border border-blue-500/20 bg-blue-500/[0.03] overflow-hidden">
            <div className="h-0.5 bg-gradient-to-r from-blue-500/60 to-blue-500/20" />
            <div className="p-2.5 text-center">
              <div className="flex items-center justify-center gap-1.5 mb-2">
                <div className="w-5 h-5 rounded-md bg-blue-500/10 flex items-center justify-center"><Target className="w-3 h-3 text-blue-500" /></div>
              </div>
              <div className="text-[9px] font-semibold text-blue-500/70 uppercase tracking-wider mb-1">سعر الدخول</div>
              <div className="text-sm font-bold font-mono text-blue-600 dark:text-blue-400">{entry.toFixed(2)}</div>
              <div className="text-[10px] text-muted-foreground/60 mt-1">— ج.م</div>
              {s.entryDetail?.discount > 0.1 && s.entryDetail?.strategy && s.entryDetail.strategy !== 'شراء فوري' && (
                <div className="text-center mt-1 pt-1 border-t border-blue-500/10">
                  <div className="text-[8px] text-amber-600/80 font-medium">{s.entryDetail.strategy}</div>
                  <div className="text-[7px] text-emerald-600/60">-{s.entryDetail.discount.toFixed(1)}% عن {s.indicators.close.toFixed(2)}</div>
                </div>
              )}
            </div>
          </div>

          {/* TP Cards */}
          {tps.map((tp) => {
            const theme = probTheme[tp.probability] || probTheme.Low;
            const gain = ((tp.price - entry) / entry * 100);
            return (
              <div key={tp.level} className={"rounded-lg border overflow-hidden " + theme.border + ' ' + theme.bg}>
                <div className={"h-0.5 " + (tp.probability === 'High' ? 'bg-gradient-to-r from-emerald-500/60 to-emerald-500/20' : tp.probability === 'Medium' ? 'bg-gradient-to-r from-amber-500/60 to-amber-500/20' : 'bg-gradient-to-r from-slate-400/40 to-slate-400/10')} />
                <div className="p-2.5 text-center">
                  <div className="flex items-center justify-center gap-1.5 mb-2">
                    <div className={"w-5 h-5 rounded-md flex items-center justify-center " + theme.bg}>
                      <Crosshair className={"w-3 h-3 " + theme.text} />
                    </div>
                    <span className={"text-[9px] font-bold px-1.5 py-0.5 rounded " + theme.text + ' ' + theme.bg}>{probAr[tp.probability] || tp.probability}</span>
                  </div>
                  <div className="text-[9px] font-semibold text-muted-foreground/70 uppercase tracking-wider mb-1">مستهدف {tp.level}</div>
                  <div className={"text-sm font-bold font-mono " + theme.text}>{tp.price.toFixed(2)}</div>
                  <div className={"flex items-center justify-center gap-0.5 mt-1 " + (gain >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500')}>
                    {gain >= 0 ? <ArrowUpRight className="w-2.5 h-2.5" /> : <ArrowDownRight className="w-2.5 h-2.5" />}
                    <span className="text-[10px] font-semibold">{gain >= 0 ? '+' : ''}{gain.toFixed(1)}%</span>
                  </div>
                  <div className="text-[8px] text-muted-foreground/50 mt-1 truncate" title={tp.basis}>{tp.basis}</div>
                </div>
              </div>
            );
          })}
        </div>

        {/* ── Risk:Reward + Position Summary ── */}
        <div className="flex items-center justify-between pt-1">
          <div className="flex items-center gap-4 text-[10px] text-muted-foreground">
            <span>المخاطرة: <span className="font-mono font-bold text-foreground">{Math.abs(s.stopLossPct).toFixed(1)}%</span></span>
            <span className="text-border/50">|</span>
            <span>العائد TP1: <span className={"font-mono font-bold " + (tp1DisplayPct >= 0 ? 'text-emerald-600' : 'text-red-500')}>{tp1DisplayPct >= 0 ? '+' : ''}{tp1DisplayPct.toFixed(1)}%</span></span>
            <span className="text-border/50 hidden sm:inline">|</span>
            <span className="hidden sm:inline">مركز: <span className="font-mono font-bold text-foreground">{s.positionSize}%</span></span>
          </div>
          <div className={"flex items-center gap-1.5 text-[10px] font-bold px-2.5 py-1 rounded-lg border " + rrColor}>
            <Gauge className="w-3 h-3" />
            R:R {s.riskReward > 0 ? s.riskReward.toFixed(1) : 'N/A'}:1
          </div>
        </div>
      </div>
    );
  };

  // ── Loading Skeleton ──
  if (loading && stocks.length === 0) {
    return (
      <div className="min-h-screen bg-background">
        <div className="border-b bg-background/80 backdrop-blur-xl sticky top-0 z-40">
          <div className="max-w-[1700px] mx-auto px-4 sm:px-6 py-4">
            <div className="flex items-center gap-3">
              <Skeleton className="h-8 w-8 rounded-full" />
              <div className="space-y-1.5"><Skeleton className="h-5 w-48" /><Skeleton className="h-3 w-64" /></div>
            </div>
          </div>
        </div>
        <div className="max-w-[1700px] mx-auto px-4 sm:px-6 py-4 space-y-4">
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-2.5">
            {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-xl" />)}
          </div>
          <Skeleton className="h-10 rounded-xl" />
          <Skeleton className="h-12 rounded-xl" />
          {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-14 rounded-lg" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* ═══ HEADER ═══ */}
      <div className="border-b bg-background/80 backdrop-blur-xl sticky top-0 z-40">
        <div className="max-w-[1700px] mx-auto px-4 sm:px-6">
          <div className="flex items-center justify-between h-14">
            {/* Left */}
            <div className="flex items-center gap-3">
              <TooltipProvider><Tooltip><TooltipTrigger asChild>
                <Link href="/dashboard"><Button variant="ghost" size="icon" className="rounded-xl h-9 w-9 hover:bg-muted/80"><ArrowLeft className="w-4 h-4" /></Button>
              </Link></TooltipTrigger><TooltipContent>العودة</TooltipContent></Tooltip></TooltipProvider>
              <Separator orientation="vertical" className="h-6" />
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-700 flex items-center justify-center shadow-lg shadow-emerald-500/20">
                  <Zap className="w-4 h-4 text-white" />
                </div>
                <div>
                  <h1 className="text-base font-bold tracking-tight leading-none">فاحص البورصة المصرية</h1>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    <p className="text-[11px] text-muted-foreground">{stocks.length} سهم &middot; {tfLabel}{lastUpdated && <span className="mr-1.5">&middot; {new Date(lastUpdated).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })}</span>}</p>
                  </div>
                </div>
              </div>
            </div>
            {/* Right */}
            <div className="flex items-center gap-1.5">
              <TooltipProvider><Tooltip><TooltipTrigger asChild>
                <Button variant="outline" size="sm" onClick={handleExport} className="gap-1.5 text-xs h-8 rounded-lg border-dashed"><Download className="w-3.5 h-3.5" />تصدير</Button>
              </TooltipTrigger><TooltipContent>تصدير CSV</TooltipContent></Tooltip></TooltipProvider>
              <Button size="sm" onClick={fetchScreener} disabled={loading} className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs h-8 rounded-lg shadow-lg shadow-emerald-600/20">
                <RefreshCw className={"w-3.5 h-3.5 " + (loading ? 'animate-spin' : '')} />
                {loading ? 'جاري...' : 'تحديث'}
              </Button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-[1700px] mx-auto px-4 sm:px-6 py-5 space-y-5">

                {/* ═══ DAILY PICKS ═══ */}
        {!dailyPicksLoading && (
          <motion.section {...fadeInUp} transition={{ duration: 0.4 }}>
            <div className="rounded-2xl border border-border/60 bg-card overflow-hidden">
              {/* Header */}
              <div className="px-4 sm:px-5 py-3.5 flex items-center justify-between border-b border-border/40">
                <div className="flex items-center gap-2.5">
                  <div className="relative">
                    <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-700 flex items-center justify-center shadow-lg shadow-emerald-500/20">
                      <Flame className="w-4 h-4 text-white" />
                    </div>
                    <div className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-amber-400 border-2 border-card animate-pulse" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="text-sm font-bold tracking-tight">أقوى 5 إعدادات فنية صعودية</h2>
                      {dailyPicksMeta?.generatedAt && <span className="text-[10px] text-muted-foreground">{new Date(dailyPicksMeta.generatedAt).toLocaleDateString('ar-EG', { weekday: 'long', day: 'numeric', month: 'short' })}</span>}
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-0.5">أسهم ذات محاذاة تقنية صعودية (اتجاه/زخم/حجم/أنماط) — ليست توصية مالية</p>
                    {dailyPicksMeta?.diversity?.isConcentrated && (
                      <p className="text-[9px] text-amber-500 mt-0.5">تحذير تركز: {Object.entries(dailyPicksMeta.diversity.sectorDistribution)[0]?.[0]} ({Math.round(Object.entries(dailyPicksMeta.diversity.sectorDistribution)[0]?.[1] / dailyPicks.length * 100)}%) — راجع التباين القطاعي</p>
                    )}
                  </div>
                </div>
                {dailyPicks.length > 0 && (
                  <div className="flex items-center gap-2">
                    {dailyPicksMeta && <span className="text-[8px] text-muted-foreground">{dailyPicksMeta.totalCandidates} مرشح</span>}
                    <Badge className="text-[9px] bg-emerald-500 text-white border-emerald-500 h-5 rounded-md px-2 font-bold gap-1">
                      <TrendingUp className="w-2.5 h-2.5" />{dailyPicks.length} إعداد
                    </Badge>
                  </div>
                )}
              </div>

              {/* Content: Picks or Empty State */}
              {dailyPicks.length > 0 ? (
              <div className="px-4 sm:px-5 pt-4 pb-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-2.5">
                  {dailyPicks.map((s, i) => {
                    const isStrong = s.signal === 'Strong Buy';
                    const isTop = i === 0;
                    const tp1 = s.takeProfits[0];
                    const tp2 = s.takeProfits[1];
                    const tp3 = s.takeProfits[2];
                    const rrColor = s.riskReward >= 2 ? 'text-emerald-600' : s.riskReward >= 1 ? 'text-amber-500' : 'text-red-500';
                    const rrBg = s.riskReward >= 2 ? 'bg-emerald-500/10' : s.riskReward >= 1 ? 'bg-amber-500/10' : 'text-red-500';
                    const nss = s.nextSessionScore || 0;
                    const nssLabel = nss >= 75 ? 'قوية جداً' : nss >= 55 ? 'قوية' : 'متوسطة';
                    const nssColor = nss >= 75 ? 'text-emerald-600 bg-emerald-500/10' : nss >= 55 ? 'text-amber-600 bg-amber-500/10' : 'text-muted-foreground bg-muted';
                    return (
                      <motion.div
                        key={s.symbol}
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.05, duration: 0.25 }}
                        className={[
                          'rounded-xl border overflow-hidden transition-all duration-200 cursor-pointer group',
                          isTop
                            ? 'border-emerald-500/25 bg-gradient-to-b from-emerald-500/[0.06] to-card hover:shadow-lg hover:shadow-emerald-500/5 ring-1 ring-emerald-500/10'
                            : isStrong
                              ? 'border-emerald-500/15 bg-card hover:border-emerald-500/30 hover:shadow-md'
                              : 'border-border/40 bg-card hover:border-emerald-400/20 hover:shadow-sm'
                        ].join(' ')}
                        onClick={() => { setViewMode('table'); setTimeout(() => {
                          const el = document.getElementById('row-' + s.symbol);
                          if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); setExpandedRow(s.symbol); }
                        }, 50); }}
                      >
                        <div className={["h-0.5",
                          isTop ? 'bg-gradient-to-r from-emerald-400 via-emerald-500 to-emerald-600' :
                          isStrong ? 'bg-emerald-500/60' : 'bg-emerald-400/30'
                        ].join(' ')} />

                        <div className="p-3 space-y-2">
                          {/* Header: Rank + Symbol + Score */}
                          <div className="flex items-start justify-between gap-1.5">
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-1.5">
                                <span className={["text-[9px] font-bold w-4 h-4 rounded-md flex items-center justify-center shrink-0",
                                  isTop ? 'bg-amber-400 text-white' : 'bg-muted text-muted-foreground'
                                ].join(' ')}>{i + 1}</span>
                                <span className="font-bold text-sm">{s.symbol}</span>
                                <SignalBadge signal={s.signal} size="sm" />
                              </div>
                              <div className="flex items-center gap-2 mt-0.5">
                                <p className="text-[9px] text-muted-foreground truncate">{s.name}</p>
                                <span className="text-[9px] font-mono font-semibold text-foreground/80 bg-muted/60 px-1 py-0 rounded">{s.indicators.close.toFixed(2)} ج.م</span>
                              </div>
                            </div>
                            <div className="flex flex-col items-center gap-1">
                              <ConfidenceRing value={s.confidence} size={30} />
                              <span className={["text-[7px] font-bold px-1.5 py-0.5 rounded leading-none", nssColor].join(' ')}>{nss}%</span>
                            </div>
                          </div>

                          {/* Rationale Tags (explainability) */}
                          {s.topRationale && s.topRationale.length > 0 && (
                            <div className="flex flex-wrap gap-1">
                              {s.topRationale.map((r, ri) => (
                                <span key={ri} className="text-[7px] font-medium text-emerald-600/80 dark:text-emerald-400/80 bg-emerald-500/[0.07] border border-emerald-500/10 px-1.5 py-0.5 rounded-md">{r}</span>
                              ))}
                            </div>
                          )}

                          {/* Entry: Smart price with strategy */}
                          <div className="rounded-lg bg-blue-500/[0.06] border border-blue-500/10 px-2.5 py-2">
                            <div className="flex items-center justify-between mb-1">
                              <div className="flex items-center gap-1.5">
                                <Target className="w-2.5 h-2.5 text-blue-500" />
                                <span className="text-[8px] font-semibold text-blue-500/70 uppercase">شراء حول</span>
                              </div>
                              {s.entryDetail?.discount > 0.1 && (
                                <span className="text-[7px] font-medium text-emerald-600 bg-emerald-500/10 px-1 py-0.5 rounded">-{s.entryDetail.discount.toFixed(1)}% عن السعر</span>
                              )}
                            </div>
                            <div className="text-sm font-bold font-mono text-blue-600 dark:text-blue-400">{s.entryPrice.toFixed(2)} ج.م</div>
                            {s.entryDetail?.strategy && s.entryDetail.strategy !== 'شراء فوري' && (
                              <div className="mt-1 pt-1 border-t border-blue-500/10">
                                <div className="flex items-center gap-1">
                                  <Zap className="w-2.5 h-2.5 text-amber-500/70" />
                                  <span className="text-[8px] font-semibold text-amber-600/80 dark:text-amber-400/80">{s.entryDetail.strategy}</span>
                                </div>
                                <p className="text-[7px] text-muted-foreground/60 mt-0.5 mr-4 leading-relaxed">{s.entryDetail.basis}</p>
                              </div>
                            )}
                          </div>

                          {/* SL */}
                          <div className="flex items-center justify-between rounded-md bg-red-500/[0.05] border border-red-500/10 px-2 py-1.5">
                            <div className="flex items-center gap-1">
                              <Shield className="w-2.5 h-2.5 text-red-500" />
                              <span className="text-[8px] font-semibold text-red-500/70 uppercase">وقف خسارة</span>
                            </div>
                            <div className="text-[10px] font-bold font-mono text-red-500">{s.stopLoss.toFixed(2)}</div>
                          </div>

                          {/* TP1 / TP2 / TP3 Targets */}
                          <div className="space-y-1">
                            {[tp1, tp2, tp3].map((tp, idx) => {
                              if (!tp) return null;
                              const pct = ((tp.price - s.entryPrice) / s.entryPrice * 100);
                              const colors = ['text-emerald-600 dark:text-emerald-400', 'text-blue-600 dark:text-blue-400', 'text-purple-600 dark:text-purple-400'];
                              const bgColors = ['bg-emerald-500/[0.05] border-emerald-500/10', 'bg-blue-500/[0.05] border-blue-500/10', 'bg-purple-500/[0.05] border-purple-500/10'];
                              const probLabels: Record<string, string> = { 'High': 'مرتفع', 'Medium': 'متوسط', 'Low': 'منخفض' };
                              const probColors: Record<string, string> = { 'High': 'text-emerald-600', 'Medium': 'text-amber-600', 'Low': 'text-muted-foreground' };
                              return (
                                <div key={idx} className={["flex items-center justify-between rounded-md border px-2 py-1", bgColors[idx]].join(' ')}>
                                  <div className="flex items-center gap-1.5">
                                    <Crosshair className={["w-2.5 h-2.5", colors[idx]].join(' ')} />
                                    <span className="text-[8px] font-semibold text-muted-foreground">TP{idx + 1}</span>
                                    <span className="text-[7px] text-muted-foreground/60">{tp.basis}</span>
                                  </div>
                                  <div className="flex items-center gap-1.5">
                                    <span className={["text-[7px] font-medium", probColors[tp.probability] || 'text-muted-foreground'].join(' ')}>{probLabels[tp.probability] || tp.probability}</span>
                                    <span className={["text-[10px] font-bold font-mono", colors[idx]].join(' ')}>{tp.price.toFixed(2)}</span>
                                    <span className={["text-[7px] font-medium", colors[idx]].join(' ')}>+{pct.toFixed(1)}%</span>
                                  </div>
                                </div>
                              );
                            })}
                          </div>

                          {/* Footer: R:R */}
                          <div className="flex items-center justify-between pt-0.5">
                            <div className="flex items-center gap-1.5 text-[9px]">
                              <div className={["flex items-center gap-0.5 px-1.5 py-0.5 rounded font-bold", rrColor, rrBg].join(' ')}>
                                <Gauge className="w-2 h-2" />{s.riskReward.toFixed(1)}:1
                              </div>
                              <span className="text-[7px] text-muted-foreground">{nssLabel}</span>
                            </div>
                            <span className="text-[9px] text-muted-foreground/50 group-hover:text-muted-foreground transition-colors flex items-center gap-0.5">التفاصيل <ChevronRight className="w-2.5 h-2.5" /></span>
                          </div>
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
              </div>
              ) : (
                /* ── Empty State (P2-1 fix) ── */
                <div className="px-4 sm:px-5 py-10">
                  <div className="flex flex-col items-center justify-center text-center">
                    <div className="w-12 h-12 rounded-2xl bg-muted/50 flex items-center justify-center mb-3">
                      <Activity className="w-6 h-6 text-muted-foreground/40" />
                    </div>
                    <p className="text-sm font-medium text-muted-foreground">لا توجد إعدادات فنية صعودية قوية اليوم</p>
                    <p className="text-[11px] text-muted-foreground/60 mt-1.5 max-w-sm">لم تلتقِ أي أسهم بمعايير المحاذاة الفنية الصعودية (ثقة ≥ 40، مخاطرة:عائد ≥ 1.5، RSI ≤ 75). جرّب تغيير الإطار الزمني أو راجع البيانات لاحقاً.</p>
                  </div>
                </div>
              )}

              {/* Disclaimer footer */}
              <div className="px-4 sm:px-5 py-2 border-t border-border/30 bg-muted/20">
                <p className="text-[8px] text-muted-foreground/50 text-center">
                  هذا الترتيب مبني على محاذاة المؤشرات الفنية فقط وليس مدعوماً بنتائج تاريخية مُتحقَّق منها. لا يُعدّ توصية مالية. {dailyPicksMeta?.version && `v${dailyPicksMeta.version}`} {dailyPicksMeta?.batchDate && `| دفعة: ${dailyPicksMeta.batchDate}`} {dailyPicksMeta?.diversity && `| ${dailyPicksMeta.diversity.sectorCount} قطاعات`}
                </p>
              </div>

            </div>
          </motion.section>
        )}
{/* ═══ STATS + DISTRIBUTION ═══ */}
        {summary && (
          <motion.div className="grid grid-cols-1 lg:grid-cols-4 gap-4" {...fadeInUp} transition={{ duration: 0.4, delay: 0.05 }}>
            {/* Signal Count Cards */}
            <div className="lg:col-span-3 grid grid-cols-3 sm:grid-cols-6 gap-2">
              {[
                { label: 'الإجمالي', value: summary.total, icon: BarChart3, color: 'text-foreground', sub: 'جودة: ' + summary.dataQualityStats.avgScore },
                { label: 'شراء قوي', value: summary.strongBuy, icon: TrendingUp, color: 'text-emerald-600 dark:text-emerald-400', sub: pctOf(summary.strongBuy, summary.total) + '%', accent: 'border-emerald-500/20 bg-emerald-500/[0.03]' },
                { label: 'شراء', value: summary.buy, icon: TrendingUp, color: 'text-emerald-500', sub: pctOf(summary.buy, summary.total) + '%', accent: 'border-emerald-400/15 bg-emerald-400/[0.02]' },
                { label: 'انتظار', value: summary.hold, icon: Minus, color: 'text-amber-500', sub: pctOf(summary.hold, summary.total) + '%', accent: 'border-amber-400/15 bg-amber-400/[0.02]' },
                { label: 'تقليل', value: summary.sell, icon: TrendingDown, color: 'text-red-500', sub: pctOf(summary.sell, summary.total) + '%', accent: 'border-red-400/15 bg-red-400/[0.02]' },
                { label: 'تجنب', value: summary.strongSell, icon: TrendingDown, color: 'text-red-600 dark:text-red-400', sub: pctOf(summary.strongSell, summary.total) + '%', accent: 'border-red-500/20 bg-red-500/[0.03]' },
              ].map((c, i) => {
                const Icon = c.icon;
                return (
                  <motion.div key={c.label} {...scaleIn} transition={{ delay: i * 0.03 }}>
                    <Card className={"py-3 px-3.5 rounded-xl border transition-colors hover:border-border/80 " + (c.accent || '')}>
                      <div className="flex items-center justify-between mb-1">
                        <Icon className={"w-3.5 h-3.5 " + c.color} />
                        {c.value > 0 && c.label !== 'الإجمالي' && <span className={"text-[9px] font-semibold px-1.5 py-0.5 rounded-md " + c.color + ' bg-current/5'}>{c.sub}</span>}
                      </div>
                      <div className={c.color + ' text-2xl font-bold tracking-tight leading-none'}>{c.value}</div>
                      <div className="text-[10px] text-muted-foreground mt-1 leading-tight">{c.label}{c.label === 'الإجمالي' && <span className="block text-[9px] mt-0.5 opacity-60">{c.sub}</span>}</div>
                    </Card>
                  </motion.div>
                );
              })}
            </div>

            {/* Signal Distribution Panel */}
            <Card className="rounded-xl p-4 flex flex-col justify-center">
              <div className="flex items-center gap-1.5 mb-3">
                <Activity className="w-3.5 h-3.5 text-muted-foreground" />
                <span className="text-xs font-semibold">توزيع الإشارات</span>
              </div>
              {/* Stacked bar */}
              <div className="flex h-3 rounded-full overflow-hidden bg-muted/50 mb-3 ring-1 ring-border/30">
                {summary.strongBuy > 0 && <div className="bg-emerald-600 transition-all duration-700" style={{ width: pctOf(summary.strongBuy, summary.total) + '%' }} />}
                {summary.buy > 0 && <div className="bg-emerald-400 transition-all duration-700" style={{ width: pctOf(summary.buy, summary.total) + '%' }} />}
                {summary.hold > 0 && <div className="bg-amber-400 transition-all duration-700" style={{ width: pctOf(summary.hold, summary.total) + '%' }} />}
                {summary.sell > 0 && <div className="bg-red-400 transition-all duration-700" style={{ width: pctOf(summary.sell, summary.total) + '%' }} />}
                {summary.strongSell > 0 && <div className="bg-red-600 transition-all duration-700" style={{ width: pctOf(summary.strongSell, summary.total) + '%' }} />}
              </div>
              {/* Legend */}
              <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-[10px]">
                <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-emerald-600" />{summary.strongBuy} شراء قوي</div>
                <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-emerald-400" />{summary.buy} شراء</div>
                <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-amber-400" />{summary.hold} انتظار</div>
                <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-red-400" />{summary.sell + summary.strongSell} بيع</div>
              </div>
              {/* Bull vs Bear */}
              <div className="flex items-center justify-between mt-3 pt-3 border-t border-border/50">
                <div className="flex items-center gap-1.5 text-[10px]">
                  <ArrowUpRight className="w-3 h-3 text-emerald-500" />
                  <span className="text-emerald-600 font-semibold">{bullCount}</span>
                  <span className="text-muted-foreground">صعودي</span>
                </div>
                <div className="flex items-center gap-1.5 text-[10px]">
                  <span className="text-muted-foreground">هبوطي</span>
                  <span className="text-red-500 font-semibold">{bearCount}</span>
                  <ArrowDownRight className="w-3 h-3 text-red-500" />
                </div>
              </div>
            </Card>
          </motion.div>
        )}

        {/* ═══ TOOLBAR: Filters + View Toggle + Count ═══ */}
        <motion.div {...fadeInUp} transition={{ duration: 0.3, delay: 0.1 }}>
          <Card className="rounded-xl border-border/60 overflow-hidden">
            <CardContent className="p-3">
              <div className="flex flex-wrap gap-2.5 items-end">
                {/* Search */}
                <div className="flex-1 min-w-[200px]">
                  <label className="text-[10px] font-semibold text-muted-foreground mb-1 block uppercase tracking-wider">بحث</label>
                  <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground/60" />
                    <Input placeholder="الرمز أو الاسم..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="pl-8 h-9 text-xs rounded-lg bg-muted/30 border-border/50 focus:bg-background" />
                  </div>
                </div>
                {/* Timeframe */}
                <div className="w-[120px]">
                  <label className="text-[10px] font-semibold text-muted-foreground mb-1 block uppercase tracking-wider">الإطار الزمني</label>
                  <Select value={timeframe} onValueChange={v => setTimeframe(v)}>
                    <SelectTrigger className="h-9 text-xs rounded-lg bg-muted/30 border-border/50"><CalendarDays className="w-3 h-3 mr-1 text-muted-foreground/60" /><SelectValue /></SelectTrigger>
                    <SelectContent>{TIMEFRAMES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                {/* Sector */}
                <div className="w-[140px]">
                  <label className="text-[10px] font-semibold text-muted-foreground mb-1 block uppercase tracking-wider">القطاع</label>
                  <Select value={sector} onValueChange={setSector}>
                    <SelectTrigger className="h-9 text-xs rounded-lg bg-muted/30 border-border/50"><SelectValue /></SelectTrigger>
                    <SelectContent>{SECTORS.map(s => <SelectItem key={s} value={s}>{s === 'All' ? 'جميع القطاعات' : s}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                {/* Signal */}
                <div className="w-[120px]">
                  <label className="text-[10px] font-semibold text-muted-foreground mb-1 block uppercase tracking-wider">الإشارة</label>
                  <Select value={signalFilter} onValueChange={setSignalFilter}>
                    <SelectTrigger className="h-9 text-xs rounded-lg bg-muted/30 border-border/50"><SelectValue /></SelectTrigger>
                    <SelectContent>{['All', 'Strong Buy', 'Buy', 'Hold', 'Sell', 'Strong Sell'].map(s => <SelectItem key={s} value={s}>{s === 'All' ? 'الكل' : SIGNAL_AR[s as SignalType]}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                {/* Min Confidence */}
                <div className="w-[90px]">
                  <label className="text-[10px] font-semibold text-muted-foreground mb-1 block uppercase tracking-wider">أقل ثقة %</label>
                  <Input type="number" min="0" max="100" value={minConfidence} onChange={e => setMinConfidence(e.target.value)} className="h-9 text-xs rounded-lg bg-muted/30 border-border/50" />
                </div>
                {/* Sort */}
                <div className="w-[120px]">
                  <label className="text-[10px] font-semibold text-muted-foreground mb-1 block uppercase tracking-wider">ترتيب</label>
                  <Select value={sortField} onValueChange={v => { setSortField(v); setSortDir('desc'); }}>
                    <SelectTrigger className="h-9 text-xs rounded-lg bg-muted/30 border-border/50"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="confidence">الثقة</SelectItem>
                      <SelectItem value="riskReward">المخاطرة:العائد</SelectItem>
                      <SelectItem value="entryPrice">السعر</SelectItem>
                      <SelectItem value="rsi">RSI</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Button variant="ghost" size="icon" className="h-9 w-9 rounded-lg hover:bg-muted/80" onClick={() => setSortDir(d => d === 'desc' ? 'asc' : 'desc')}>
                  <ArrowUpDown className={"w-3.5 h-3.5 transition-transform " + (sortDir === 'asc' ? 'rotate-180' : '')} />
                </Button>
                {/* Separator */}
                <Separator orientation="vertical" className="h-9 hidden sm:block" />
                {/* View Toggle */}
                <Tabs value={viewMode} onValueChange={v => setViewMode(v as 'table' | 'cards')}>
                  <TabsList className="h-9 p-0.5 rounded-lg bg-muted/50">
                    <TabsTrigger value="table" className="h-8 px-2.5 rounded-md text-xs gap-1 data-[state=active]:bg-background data-[state=active]:shadow-sm"><LayoutList className="w-3.5 h-3.5" /></TabsTrigger>
                    <TabsTrigger value="cards" className="h-8 px-2.5 rounded-md text-xs gap-1 data-[state=active]:bg-background data-[state=active]:shadow-sm"><LayoutGrid className="w-3.5 h-3.5" /></TabsTrigger>
                  </TabsList>
                </Tabs>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Results count */}
        <div className="flex items-center justify-between px-1">
          <p className="text-xs text-muted-foreground">
            عرض <span className="font-bold text-foreground">{filteredStocks.length}</span> من <span className="font-semibold">{stocks.length}</span> سهم
          </p>
          <p className="text-[10px] text-muted-foreground/60 hidden sm:block">RSI(14) &bull; MACD(12,26,9) &bull; Stoch(14,3,3) &bull; BB(20,2) &bull; ATR(14)</p>
        </div>

        {/* ═══ TABLE VIEW ═══ */}
        {viewMode === 'table' && (
          <Card className="rounded-xl overflow-hidden border-border/60 shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/20">
                    <th className="text-right px-4 py-3 font-semibold text-[11px] text-muted-foreground uppercase tracking-wider">السهم</th>
                    <th className="text-right px-3 py-3 font-semibold text-[11px] text-muted-foreground uppercase tracking-wider">الإشارة</th>
                    <th className="text-right px-3 py-3 font-semibold text-[11px] text-muted-foreground uppercase tracking-wider">الدخول</th>
                    <th className="text-right px-3 py-3 font-semibold text-[11px] text-muted-foreground uppercase tracking-wider">وقف الخسارة</th>
                    <th className="text-right px-3 py-3 font-semibold text-[11px] text-muted-foreground uppercase tracking-wider">مستهدف 1</th>
                    <th className="text-right px-3 py-3 font-semibold text-[11px] text-muted-foreground uppercase tracking-wider">مستهدف 2</th>
                    <th className="text-right px-3 py-3 font-semibold text-[11px] text-muted-foreground uppercase tracking-wider">مستهدف 3</th>
                    <th className="text-center px-3 py-3 font-semibold text-[11px] text-muted-foreground uppercase tracking-wider">مخ:عائد</th>
                    <th className="text-center px-3 py-3 font-semibold text-[11px] text-muted-foreground uppercase tracking-wider">ثقة%</th>
                    <th className="text-center px-3 py-3 font-semibold text-[11px] text-muted-foreground uppercase tracking-wider">مركز%</th>
                    <th className="text-right px-3 py-3 font-semibold text-[11px] text-muted-foreground uppercase tracking-wider">المؤشرات</th>
                    <th className="w-8"></th>
                  </tr>
                </thead>
                <tbody>
                  {filteredStocks.map((s, i) => {
                    const isExpanded = expandedRow === s.symbol;
                    const dqColor = DQ_GRADE_COLORS[s.dataQuality.grade] || 'text-muted-foreground';
                    const sigCfg = SIGNAL_CONFIG[s.signal];
                    return (
                      <Fragment key={s.symbol}>
                        <motion.tr
                          id={'row-' + s.symbol}
                          className={"border-b border-border/40 cursor-pointer transition-all duration-150 " +
                            (isExpanded ? 'bg-muted/15' : 'hover:bg-muted/30') +
                            (s.signal === 'Strong Buy' ? ' hover:bg-emerald-500/[0.03]' : '') +
                            (s.signal === 'Strong Sell' ? ' hover:bg-red-500/[0.03]' : '')}
                          onClick={() => setExpandedRow(isExpanded ? null : s.symbol)}
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          transition={{ delay: Math.min(i * 0.01, 0.4) }}
                        >
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <div className={"w-7 h-7 rounded-lg flex items-center justify-center text-[10px] font-bold " + sigCfg.bg + ' ' + sigCfg.text}>
                                {s.symbol.slice(0, 2)}
                              </div>
                              <div>
                                <div className="flex items-center gap-1.5">
                                  <span className="font-semibold text-xs">{s.symbol}</span>
                                  <span className={"text-[9px] font-bold px-1 py-0 rounded " + dqColor + ' bg-muted/50'}>{s.dataQuality.grade}</span>
                                </div>
                                <div className="text-[10px] text-muted-foreground truncate max-w-[120px] hidden lg:block">{s.name.length > 30 ? s.name.slice(0, 30) + '...' : s.name}</div>
                                <div className="text-[10px] font-mono font-semibold text-foreground/80 mt-0.5">آخر إغلاق: {s.indicators.close.toFixed(2)} ج.م</div>
                              </div>
                            </div>
                          </td>
                          <td className="px-3 py-3"><SignalBadge signal={s.signal} /></td>
                          <td className="text-right px-3 py-3">
                            <div className="font-mono text-xs font-medium">{s.entryPrice.toFixed(2)}</div>
                            {s.entryDetail?.discount > 0.1 && (
                              <div className="text-[8px] text-amber-600/70 mt-0.5">{s.entryDetail.strategy} -{s.entryDetail.discount.toFixed(1)}%</div>
                            )}
                          </td>
                          <td className="text-right px-3 py-3">
                            <span className="font-mono text-xs text-red-500 font-medium">{s.stopLoss.toFixed(2)}</span>
                            <div className="text-[10px] text-muted-foreground">-{s.stopLossPct}%</div>
                          </td>
                          {s.takeProfits.map(tp => (
                            <td key={tp.level} className={"text-right px-3 py-3 " + (tp.probability === 'High' ? 'text-emerald-600' : tp.probability === 'Medium' ? 'text-amber-500' : 'text-muted-foreground')}>
                              <span className="font-mono text-xs font-medium">{tp.price.toFixed(2)}</span>
                              <div className="text-[9px] text-muted-foreground">{tp.basis}</div>
                            </td>
                          ))}
                          {Array.from({ length: 3 - s.takeProfits.length }).map((_, j) => <td key={"e" + j} className="px-3 py-3 text-muted-foreground/40 text-xs">&mdash;</td>)}
                          <td className="text-center px-3 py-3">
                            <span className={"font-bold text-xs px-1.5 py-0.5 rounded-md " + (s.riskReward === 0 ? 'text-muted-foreground bg-muted/30' : s.riskReward >= 2 ? 'text-emerald-600 bg-emerald-500/10' : s.riskReward >= 1 ? 'text-amber-500 bg-amber-500/10' : 'text-red-500 bg-red-500/10')}>
                              {s.riskReward === 0 ? 'N/A' : s.riskReward.toFixed(1)}:1
                            </span>
                          </td>
                          <td className="text-center px-3 py-3">
                            <div className="flex flex-col items-center gap-0.5">
                              <div className="w-12 h-1.5 bg-muted/50 rounded-full overflow-hidden">
                                <div className={"h-full rounded-full transition-all duration-500 " + (s.confidence >= 65 ? 'bg-emerald-500' : s.confidence >= 45 ? 'bg-amber-500' : 'bg-red-500')} style={{ width: s.confidence + '%' }} />
                              </div>
                              <span className="text-[10px] font-semibold">{s.confidence}</span>
                            </div>
                          </td>
                          <td className="text-center px-3 py-3 text-xs font-medium">{s.positionSize}%</td>
                          <td className="px-3 py-3">
                            <div className="flex flex-wrap gap-1 max-w-[140px]">
                              {s.tags.slice(0, 2).map(t => <Badge key={t} variant="secondary" className="text-[9px] px-1.5 py-0 h-4 rounded-md bg-muted/50">{t}</Badge>)}
                              {s.tags.length > 2 && <Badge variant="outline" className="text-[9px] px-1.5 py-0 h-4 rounded-md">+{s.tags.length - 2}</Badge>}
                            </div>
                            {s.riskFlags.length > 0 && (
                              <div className="flex items-center gap-0.5 mt-0.5 text-[9px] text-amber-500">
                                <AlertTriangle className="w-2.5 h-2.5" /><span className="truncate max-w-[120px]">{s.riskFlags[0]}</span>
                              </div>
                            )}
                          </td>
                          <td className="px-2 py-3">
                            <motion.div animate={{ rotate: isExpanded ? 180 : 0 }} transition={{ duration: 0.2 }}>
                              <ChevronDown className="w-4 h-4 text-muted-foreground/50" />
                            </motion.div>
                          </td>
                        </motion.tr>

                        {/* Expanded Detail */}
                        <AnimatePresence>
                          {isExpanded && (
                            <motion.tr
                              key={s.symbol + '-detail'}
                              initial={{ opacity: 0 }}
                              animate={{ opacity: 1 }}
                              exit={{ opacity: 0 }}
                              transition={{ duration: 0.25 }}
                            >
                              <td colSpan={12} className="px-0 py-0">
                                <motion.div
                                  initial={{ height: 0, opacity: 0 }}
                                  animate={{ height: 'auto', opacity: 1 }}
                                  exit={{ height: 0, opacity: 0 }}
                                  transition={{ duration: 0.3, ease: 'easeInOut' }}
                                  className="overflow-hidden"
                                >
                                  <div className="px-6 py-5 bg-muted/[0.03] border-t border-b border-border/30">
                                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                                      {/* Column 1: Price Levels */}
                                      <div>
                                        <h4 className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-1.5">
                                          <Target className="w-3.5 h-3.5" /> مناطق الدخول والخروج
                                        </h4>
                                        <div className="bg-background rounded-xl p-4 border border-border/50 shadow-sm">
                                          <PriceTargetsBar s={s} />
                                        </div>
                                      </div>

                                      {/* Column 2: Indicators */}
                                      <div>
                                        <h4 className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-1.5">
                                          <Activity className="w-3.5 h-3.5" /> المؤشرات الفنية
                                        </h4>
                                        <div className="bg-background rounded-xl p-4 border border-border/50 shadow-sm space-y-2 text-xs font-mono">
                                          <IndRow label="RSI (14)" value={s.indicators.rsi.toFixed(1)} extra={s.indicators.rsi > 70 ? ' تشبع شرائي' : s.indicators.rsi < 30 ? ' تشبع بيعي' : ''} color={s.indicators.rsi > 70 ? 'text-red-500' : s.indicators.rsi < 30 ? 'text-emerald-500' : ''} />
                                          <IndRow label="MACD" value={s.indicators.macd.toFixed(3)} extra={s.indicators.macd > s.indicators.macdSignal ? ' صعودي' : ' هبوطي'} color={s.indicators.macd > s.indicators.macdSignal ? 'text-emerald-500' : 'text-red-500'} />
                                          <IndRow label="Stochastic K/D" value={`${s.indicators.stochK.toFixed(1)} / ${s.indicators.stochD.toFixed(1)}`} color={s.indicators.stochK > 80 ? 'text-red-500' : s.indicators.stochK < 20 ? 'text-emerald-500' : ''} />
                                          <Separator className="my-1" />
                                          <IndRow label="ATR(14)" value={s.indicators.atr.toFixed(3)} />
                                          <IndRow label="عرض BB" value={s.indicators.bbWidth.toFixed(1) + '%'} />
                                          <IndRow label="BB علوي/سفلي" value={`${s.indicators.bbUpper.toFixed(2)} / ${s.indicators.bbLower.toFixed(2)}`} />
                                          <Separator className="my-1" />
                                          <IndRow label="مقابل SMA200" value={`${s.indicators.priceVsSma200 > 0 ? '+' : ''}${s.indicators.priceVsSma200.toFixed(1)}%`} color={s.indicators.priceVsSma200 > 0 ? 'text-emerald-500' : 'text-red-500'} />
                                          <IndRow label="تقييم TradingView" value={`${s.indicators.recommendAll > 0 ? '+' : ''}${s.indicators.recommendAll.toFixed(2)}`} color={s.indicators.recommendAll > 0 ? 'text-emerald-500' : s.indicators.recommendAll < 0 ? 'text-red-500' : ''} />
                                          <IndRow label="الحجم" value={(s.indicators.volume / 1000000).toFixed(1) + 'M'} />
                                          <IndRow label="جودة البيانات" value={`${s.dataQuality.grade} (${s.dataQuality.score})`} color={DQ_GRADE_COLORS[s.dataQuality.grade] || ''} />
                                        </div>
                                        <div className="bg-background rounded-xl p-4 border border-border/50 shadow-sm mt-3">
                                          <h4 className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider mb-2.5 flex items-center gap-1.5">
                                            <Layers className="w-3.5 h-3.5" /> المتوسطات المتحركة
                                          </h4>
                                          <div className="space-y-1.5 text-xs">
                                            {INDICATOR_LIST.map(label => {
                                              const key = label.toLowerCase() as 'sma20' | 'sma50' | 'sma200' | 'ema20' | 'ema50' | 'ema200';
                                              const val = s.indicators[key];
                                              if (!val || val <= 0) return null;
                                              const above = s.entryPrice > val;
                                              const pct = ((s.entryPrice - val) / val * 100);
                                              return (
                                                <div key={label} className="flex justify-between font-mono text-[11px]">
                                                  <span className="text-muted-foreground">{label}</span>
                                                  <span className={above ? 'text-emerald-500' : 'text-red-500'}>
                                                    {val.toFixed(2)}
                                                    <span className="ml-1.5">{above ? '\u25b2' : '\u25bc'}{above ? '+' : ''}{pct.toFixed(1)}%</span>
                                                  </span>
                                                </div>
                                              );
                                            })}
                                          </div>
                                        </div>
                                      </div>

                                      {/* Column 3: Rationale */}
                                      <div>
                                        <h4 className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-1.5">
                                          <Crosshair className="w-3.5 h-3.5" /> مبررات الإشارة
                                        </h4>
                                        <div className="space-y-1.5 max-h-[500px] overflow-y-auto pr-1">
                                          {s.rationale.filter(r => r.direction !== 0).sort((a, b) => b.weight - a.weight).map((r, idx) => (
                                            <motion.div
                                              key={idx}
                                              initial={{ opacity: 0, x: -8 }}
                                              animate={{ opacity: 1, x: 0 }}
                                              transition={{ delay: idx * 0.04 }}
                                              className={"flex items-start gap-2.5 text-xs p-2.5 rounded-lg border " + (r.direction > 0 ? 'bg-emerald-500/[0.03] border-emerald-500/10' : 'bg-red-500/[0.03] border-red-500/10')}
                                            >
                                              <span className="mt-0.5 shrink-0">
                                                {r.direction > 0
                                                  ? <CheckCircle className="w-3.5 h-3.5 text-emerald-500" />
                                                  : <XCircle className="w-3.5 h-3.5 text-red-500" />}
                                              </span>
                                              <div className="min-w-0">
                                                <div className="flex items-center gap-1.5">
                                                  <span className="font-semibold text-[11px]">{r.tag}</span>
                                                  <Badge variant="outline" className="text-[9px] px-1 py-0 h-4 rounded-md">{r.weight}</Badge>
                                                </div>
                                                <div className="text-muted-foreground text-[11px] leading-relaxed mt-0.5">{r.description}</div>
                                              </div>
                                            </motion.div>
                                          ))}
                                        </div>
                                        {s.riskFlags.length > 0 && (
                                          <div className="mt-4 bg-amber-500/[0.04] border border-amber-500/15 rounded-lg p-3">
                                            <h4 className="text-[11px] font-bold text-amber-600 dark:text-amber-400 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                                              <AlertTriangle className="w-3.5 h-3.5" /> تحذيرات المخاطر
                                            </h4>
                                            {s.riskFlags.map(f => <div key={f} className="text-[11px] text-amber-600 dark:text-amber-400 py-0.5">{f}</div>)}
                                          </div>
                                        )}
                                        {s.dataQuality.anomalies.length > 0 && (
                                          <div className="mt-3 bg-orange-500/[0.04] border border-orange-500/15 rounded-lg p-3">
                                            <h4 className="text-[11px] font-bold text-orange-600 dark:text-orange-400 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                                              <FileWarning className="w-3.5 h-3.5" /> شذوذ البيانات
                                            </h4>
                                            {s.dataQuality.anomalies.map(a => <div key={a} className="text-[11px] text-orange-600 dark:text-orange-400 py-0.5">{a}</div>)}
                                          </div>
                                        )}
                                      </div>
                                    </div>
                                  </div>
                                </motion.div>
                              </td>
                            </motion.tr>
                          )}
                        </AnimatePresence>
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
              {filteredStocks.length === 0 && !loading && (
                <div className="text-center py-20 text-muted-foreground">
                  <div className="w-16 h-16 rounded-2xl bg-muted/30 flex items-center justify-center mx-auto mb-3">
                    <Search className="w-7 h-7 opacity-30" />
                  </div>
                  <p className="text-sm font-medium">لا توجد أسهم تطابق الفلتر</p>
                  <p className="text-xs mt-1 opacity-60">جرب تغيير معايير البحث</p>
                </div>
              )}
            </div>
          </Card>
        )}

        {/* ═══ CARDS VIEW ═══ */}
        {viewMode === 'cards' && (
          <motion.div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3" {...stagger}>
            {filteredStocks.map((s, i) => {
              const sigCfg = SIGNAL_CONFIG[s.signal];
              const tp1Pct = s.takeProfits[0] ? ((s.takeProfits[0].price - s.entryPrice) / s.entryPrice * 100) : 0;
              return (
                <motion.div
                  key={s.symbol}
                  {...fadeInUp}
                  transition={{ delay: Math.min(i * 0.02, 0.4) }}
                  className={"rounded-xl border p-4 transition-all duration-200 cursor-pointer group hover:shadow-lg " + sigCfg.bg + ' ' + sigCfg.border}
                >
                  {/* Header */}
                  <div className="flex items-start justify-between mb-3">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-sm">{s.symbol}</span>
                        <SignalBadge signal={s.signal} />
                      </div>
                      <p className="text-[10px] text-muted-foreground truncate max-w-[160px]">{s.name}</p>
                      <div className="text-[10px] font-mono font-semibold text-foreground/80 bg-muted/60 px-1.5 py-0 rounded">آخر إغلاق: {s.indicators.close.toFixed(2)} ج.م</div>
                    </div>
                    <ConfidenceRing value={s.confidence} size={36} />
                  </div>

                  {/* Price Bar compact */}
                  <PriceTargetsBar s={s} compact />

                  {/* Key metrics */}
                  <div className="grid grid-cols-3 gap-2 mt-3 pt-3 border-t border-border/30">
                    <div className="text-center">
                      <div className="text-[9px] text-muted-foreground">الدخول</div>
                      <div className="text-xs font-mono font-semibold mt-0.5">{s.entryPrice.toFixed(2)}</div>
                      {s.entryDetail?.discount > 0.1 && s.entryDetail?.strategy && s.entryDetail.strategy !== 'شراء فوري' && (
                        <div className="text-[8px] text-amber-600/70 mt-0.5">{s.entryDetail.strategy} -{s.entryDetail.discount.toFixed(1)}%</div>
                      )}
                    </div>
                    <div className="text-center">
                      <div className="text-[9px] text-muted-foreground">مخ:عائد</div>
                      <div className={"text-xs font-bold mt-0.5 " + (s.riskReward >= 2 ? 'text-emerald-600' : s.riskReward >= 1 ? 'text-amber-500' : 'text-red-500')}>{s.riskReward.toFixed(1)}:1</div>
                    </div>
                    <div className="text-center">
                      <div className="text-[9px] text-muted-foreground">المستهدف 1</div>
                      <div className={"text-xs font-bold mt-0.5 flex items-center justify-center gap-0.5 " + (s.signal.includes('Buy') ? 'text-emerald-600' : s.signal.includes('Sell') ? 'text-red-500' : 'text-muted-foreground')}>
                        {s.signal.includes('Buy') ? <ArrowUpRight className="w-3 h-3" /> : s.signal.includes('Sell') ? <ArrowDownRight className="w-3 h-3" /> : null}
                        {tp1Pct.toFixed(1)}%
                      </div>
                    </div>
                  </div>

                  {/* Tags */}
                  <div className="flex flex-wrap gap-1 mt-2.5">
                    {s.tags.slice(0, 3).map(t => <Badge key={t} variant="secondary" className="text-[9px] px-1.5 py-0 h-4 rounded-md bg-muted/50">{t}</Badge>)}
                    {s.tags.length > 3 && <Badge variant="outline" className="text-[9px] px-1.5 py-0 h-4 rounded-md">+{s.tags.length - 3}</Badge>}
                  </div>

                  {/* Stop Loss + Position */}
                  <div className="flex items-center justify-between mt-3 pt-2.5 border-t border-border/30 text-[10px]">
                    <span className="text-red-500">وقف: {s.stopLoss.toFixed(2)} <span className="opacity-60">(-{s.stopLossPct}%)</span></span>
                    <span className="text-muted-foreground">مركز: {s.positionSize}%</span>
                  </div>
                </motion.div>
              );
            })}
            {filteredStocks.length === 0 && !loading && (
              <div className="col-span-full text-center py-20 text-muted-foreground">
                <div className="w-16 h-16 rounded-2xl bg-muted/30 flex items-center justify-center mx-auto mb-3">
                  <Search className="w-7 h-7 opacity-30" />
                </div>
                <p className="text-sm font-medium">لا توجد أسهم تطابق الفلتر</p>
                <p className="text-xs mt-1 opacity-60">جرب تغيير معايير البحث</p>
              </div>
            )}
          </motion.div>
        )}

        {/* Footer */}
        <div className="text-center py-4 text-[10px] text-muted-foreground/50 space-y-0.5">
          <p>البيانات: TradingView &bull; {stocks.length} سهم بورصة مصرية &bull; RSI(14) MACD(12,26,9) Stoch(14,3,3) BB(20,2) ATR(14) SMA/EMA(20/50/200)</p>
          <p>أوزان الإشارات: التريند 30% &bull; الزخم 25% &bull; التذبذب 15% &bull; الحجم 10% &bull; قوة التريند 10% &bull; توافق TradingView 10%</p>
        </div>
      </div>
    </div>
  );
}

// ── Helper Component: Indicator Row ──
function IndRow({ label, value, extra, color }: { label: string; value: string; extra?: string; color?: string }) {
  return (
    <div className="flex justify-between items-center">
      <span className="text-muted-foreground font-sans text-[11px]">{label}</span>
      <span className={(color || '') + ' font-medium'}>
        {value}{extra && <span className={"font-sans " + (color || 'text-muted-foreground')}>{extra}</span>}
      </span>
    </div>
  );
}
