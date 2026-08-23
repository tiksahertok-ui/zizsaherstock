'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search, Download, RefreshCw, TrendingUp, TrendingDown, Minus,
  Shield, Target, AlertTriangle, BarChart3, ChevronDown, ChevronUp,
  ArrowUpDown, Zap, CheckCircle, XCircle, ArrowLeft,
  Radio, Clock, Loader2, Activity, Crosshair, CalendarDays, FileWarning,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';

// ── Types ────────────────────────────────────────────────
type SignalType = 'Strong Buy' | 'Buy' | 'Hold' | 'Sell' | 'Strong Sell';

interface TakeProfitTarget { level: number; price: number; basis: string; probability: string; }
interface SignalRationale { tag: string; weight: number; direction: number; description: string; }
interface DataQuality { score: number; grade: string; missingIndicators: string[]; anomalies: string[]; }

interface ScreenerStock {
  symbol: string; name: string; sector: string;
  signal: SignalType; confidence: number;
  entryPrice: number; stopLoss: number; stopLossPct: number;
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

interface SampleTrade { symbol: string; signal: SignalType; confidence: number; entryPrice: number; exitPrice: number; returnPct: number; slHit: boolean; tp1Hit: boolean; correct: boolean; }

interface BacktestResult {
  period: string; totalSignals: number; activeSignals: number; winRate: number; avgReturn: number;
  avgWin: number; avgLoss: number; expectancy: number; profitFactor: number;
  maxDrawdown: number; sharpeRatio: number; tradeFrequency: number;
  sampleTrades: SampleTrade[];
}

// ── Constants ────────────────────────────────────────────────
const SIGNAL_STYLES: Record<SignalType, { bg: string; text: string; border: string; icon: typeof TrendingUp; glow: string }> = {
  'Strong Buy': { bg: 'bg-emerald-600/15 dark:bg-emerald-500/15', text: 'text-emerald-700 dark:text-emerald-400', border: 'border-emerald-600/30', icon: TrendingUp, glow: '' },
  'Buy': { bg: 'bg-emerald-500/10 dark:bg-emerald-400/10', text: 'text-emerald-600 dark:text-emerald-500', border: 'border-emerald-500/20', icon: TrendingUp, glow: '' },
  'Hold': { bg: 'bg-amber-500/10 dark:bg-amber-400/10', text: 'text-amber-600 dark:text-amber-400', border: 'border-amber-500/20', icon: Minus, glow: '' },
  'Sell': { bg: 'bg-red-500/10 dark:bg-red-400/10', text: 'text-red-600 dark:text-red-500', border: 'border-red-500/20', icon: TrendingDown, glow: '' },
  'Strong Sell': { bg: 'bg-red-600/15 dark:bg-red-500/15', text: 'text-red-700 dark:text-red-400', border: 'border-red-600/30', icon: TrendingDown, glow: '' },
};

const SECTORS = ['All', 'Financials', 'Real Estate', 'Materials', 'Communications', 'Energy', 'Consumer Staples', 'Healthcare', 'Industrials', 'Consumer Discretionary', 'Utilities', 'Technology'];
const TIMEFRAMES = [{ value: 'daily', label: 'Daily' }, { value: 'weekly', label: 'Weekly' }, { value: 'monthly', label: 'Monthly' }];
const INDICATOR_LIST = ['SMA20', 'SMA50', 'SMA200', 'EMA20', 'EMA50', 'EMA200'] as const;
const DQ_GRADE_COLORS: Record<string, string> = { 'A+': 'text-emerald-600', A: 'text-emerald-500', 'B+': 'text-blue-500', B: 'text-blue-400', 'C+': 'text-amber-500', C: 'text-amber-400', D: 'text-orange-500', F: 'text-red-500' };

// ── Component ────────────────────────────────────────────────
export default function ScreenerPage() {
  const [sector, setSector] = useState('All');
  const [signalFilter, setSignalFilter] = useState('All');
  const [minConfidence, setMinConfidence] = useState('0');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortField, setSortField] = useState('confidence');
  const [sortDir, setSortDir] = useState<'desc' | 'asc'>('desc');
  const [timeframe, setTimeframe] = useState('daily');
  const [showBacktest, setShowBacktest] = useState(false);
  const [backtestPeriod, setBacktestPeriod] = useState('1M');
  const [showBullishOnly, setShowBullishOnly] = useState(false);
  const [stocks, setStocks] = useState<ScreenerStock[]>([]);
  const [summary, setSummary] = useState<ScreenerSummary | null>(null);
  const [backtest, setBacktest] = useState<BacktestResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string>('');
  const [progress, setProgress] = useState(0);

  const fetchScreener = useCallback(async () => {
    setLoading(true); setProgress(10);
    try {
      const p = new URLSearchParams();
      if (sector !== 'All') p.set('sector', sector);
      if (signalFilter !== 'All') p.set('signal', signalFilter);
      if (parseInt(minConfidence) > 0) p.set('minConfidence', minConfidence);
      p.set('sort', sortField); p.set('timeframe', timeframe);
      if (showBacktest) { p.set('backtest', 'true'); p.set('backtestPeriod', backtestPeriod); }
      setProgress(30);
      const res = await fetch('/api/analysis/technical-screener?' + p);
      if (!res.ok) throw new Error('fail');
      setProgress(70);
      const data = await res.json();
      setStocks(data.stocks || []); setSummary(data.summary || null); setBacktest(data.backtest || null);
      setLastUpdated(data.generatedAt || new Date().toISOString());
      setProgress(100);
    } catch { toast.error('Failed to load screener data'); } finally { setTimeout(() => setLoading(false), 300); }
  }, [sector, signalFilter, minConfidence, sortField, showBacktest, backtestPeriod, timeframe]);

  useEffect(() => { fetchScreener(); }, [fetchScreener]);

  const filteredStocks = useMemo(() => {
    let list = [...stocks];
    if (showBullishOnly) list = list.filter(s => s.signal === 'Strong Buy' || s.signal === 'Buy');
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
  }, [stocks, searchQuery, sortField, sortDir, showBullishOnly]);

  const handleExport = async () => {
    try {
      const p = new URLSearchParams({ format: 'csv', timeframe });
      if (sector !== 'All') p.set('sector', sector);
      const res = await fetch('/api/analysis/technical-screener?' + p);
      const blob = await res.blob(); const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = 'egx_screener_' + timeframe + '_' + new Date().toISOString().slice(0, 10) + '.csv'; a.click(); URL.revokeObjectURL(url);
      toast.success('CSV exported');
    } catch { toast.error('Export failed'); }
  };

  const SignalBadge = ({ signal }: { signal: SignalType }) => {
    const s = SIGNAL_STYLES[signal];
    return (<span className={s.bg + ' ' + s.text + ' ' + s.border + ' inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold border'}><s.icon className="w-3 h-3" />{signal}</span>);
  };

  const bullCount = summary ? summary.strongBuy + summary.buy : 0;
  const bearCount = summary ? summary.sell + summary.strongSell : 0;
  const tfLabel = TIMEFRAMES.find(t => t.value === timeframe)?.label || 'Daily';
  const pctOf = (n: number, total: number) => total > 0 ? ((n / total) * 100).toFixed(1) : '0';

  return (
    <div className="min-h-screen bg-background">
      {/* HEADER */}
      <div className="border-b bg-gradient-to-r from-background via-background to-emerald-500/5 backdrop-blur-xl sticky top-0 z-40">
        <div className="max-w-[1700px] mx-auto px-4 sm:px-6 py-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="flex items-center gap-3">
              <Link href="/dashboard"><Button variant="ghost" size="icon" className="rounded-full h-8 w-8"><ArrowLeft className="w-4 h-4" /></Button></Link>
              <div>
                <h1 className="text-xl font-bold tracking-tight flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-emerald-500 to-emerald-700 flex items-center justify-center"><Zap className="w-3.5 h-3.5 text-white" /></div>
                  EGX Technical Screener
                </h1>
                <div className="flex items-center gap-2 mt-0.5">
                  <Radio className="w-3 h-3 text-emerald-500 animate-pulse" />
                  <p className="text-xs text-muted-foreground">{stocks.length} stocks &bull; {tfLabel} &bull; All EGX listed{lastUpdated && <span className="ml-1.5">&bull; <Clock className="w-3 h-3 inline mx-0.5" />{new Date(lastUpdated).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</span>}</p>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={handleExport} className="gap-1.5 text-xs"><Download className="w-3.5 h-3.5" /> CSV</Button>
              <Button size="sm" onClick={fetchScreener} disabled={loading} className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs"><RefreshCw className={"w-3.5 h-3.5 " + (loading ? 'animate-spin' : '')} />{loading ? 'Scanning...' : 'Refresh'}</Button>
            </div>
          </div>
        </div>
        {loading && progress < 100 && <div className="h-0.5 bg-muted overflow-hidden"><div className="h-full bg-emerald-500 transition-all duration-300" style={{ width: progress + '%' }} /></div>}
      </div>

      <div className="max-w-[1700px] mx-auto px-4 sm:px-6 py-4 space-y-4">
        {/* SUMMARY CARDS */}
        {summary && (
          <motion.div className="grid grid-cols-3 sm:grid-cols-6 gap-2.5" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
            {[
              { label: 'Total', value: summary.total, color: 'text-foreground', sub: 'DQ avg: ' + summary.dataQualityStats.avgScore },
              { label: 'Strong Buy', value: summary.strongBuy, color: 'text-emerald-600 dark:text-emerald-400', sub: pctOf(summary.strongBuy, summary.total) + '%' },
              { label: 'Buy', value: summary.buy, color: 'text-emerald-500', sub: pctOf(summary.buy, summary.total) + '%' },
              { label: 'Hold', value: summary.hold, color: 'text-amber-500', sub: pctOf(summary.hold, summary.total) + '%' },
              { label: 'Sell', value: summary.sell, color: 'text-red-500', sub: pctOf(summary.sell, summary.total) + '%' },
              { label: 'Strong Sell', value: summary.strongSell, color: 'text-red-600 dark:text-red-400', sub: pctOf(summary.strongSell, summary.total) + '%' },
            ].map(c => (
              <Card key={c.label} className="py-2.5 px-3">
                <div className={c.color + ' text-xl font-bold'}>{c.value}</div>
                <div className="text-[10px] text-muted-foreground leading-tight">{c.label}</div>
                <div className="text-[10px] text-muted-foreground/70 mt-0.5">{c.sub}</div>
              </Card>
            ))}
          </motion.div>
        )}

        {/* SIGNAL DISTRIBUTION */}
        {summary && summary.total > 0 && (
          <Card className="py-3 px-4">
            <div className="flex items-center gap-3 mb-1.5">
              <Activity className="w-3.5 h-3.5 text-muted-foreground" />
              <span className="text-xs font-medium text-muted-foreground">Signal Distribution</span>
              <span className="text-[10px] text-emerald-600 dark:text-emerald-400 ml-auto font-medium">{bullCount} Bullish</span>
              <span className="text-[10px] text-muted-foreground">vs</span>
              <span className="text-[10px] text-red-500 ml-auto font-medium">{bearCount} Bearish</span>
              {summary.dataQualityStats.stocksWithAnomalies > 0 && <span className="text-[10px] text-amber-500 ml-2 flex items-center gap-0.5"><FileWarning className="w-3 h-3" />{summary.dataQualityStats.stocksWithAnomalies} anomalies</span>}
            </div>
            <div className="flex h-2.5 rounded-full overflow-hidden bg-muted">
              {summary.strongBuy > 0 && <div className="bg-emerald-600 transition-all duration-500" style={{ width: pctOf(summary.strongBuy, summary.total) + '%' }} />}
              {summary.buy > 0 && <div className="bg-emerald-400 transition-all duration-500" style={{ width: pctOf(summary.buy, summary.total) + '%' }} />}
              {summary.hold > 0 && <div className="bg-amber-400 transition-all duration-500" style={{ width: pctOf(summary.hold, summary.total) + '%' }} />}
              {summary.sell > 0 && <div className="bg-red-400 transition-all duration-500" style={{ width: pctOf(summary.sell, summary.total) + '%' }} />}
              {summary.strongSell > 0 && <div className="bg-red-600 transition-all duration-500" style={{ width: pctOf(summary.strongSell, summary.total) + '%' }} />}
            </div>
            <div className="flex justify-between mt-1 text-[9px] text-muted-foreground"><span>Strong Buy</span><span>Buy</span><span>Hold</span><span>Sell</span><span>Strong Sell</span></div>
          </Card>
        )}

        {/* BACKTEST */}
        {backtest && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
            <Card className="border-emerald-600/30">
              <CardHeader className="pb-3 pt-4 px-4"><CardTitle className="text-sm font-semibold flex items-center gap-2"><BarChart3 className="w-4 h-4 text-emerald-600" />Backtest ({backtest.period}) — {backtest.activeSignals} active</CardTitle></CardHeader>
              <CardContent className="px-4 pb-4">
                <div className="grid grid-cols-2 sm:grid-cols-5 lg:grid-cols-10 gap-3">
                  {[
                    { label: 'Win Rate', value: backtest.winRate + '%', good: backtest.winRate > 50 },
                    { label: 'Avg Return', value: backtest.avgReturn + '%', good: backtest.avgReturn > 0 },
                    { label: 'Avg Win', value: '+' + backtest.avgWin + '%', good: true },
                    { label: 'Avg Loss', value: backtest.avgLoss + '%', good: backtest.avgLoss > -5 },
                    { label: 'Expectancy', value: backtest.expectancy + '%', good: backtest.expectancy > 0 },
                    { label: 'Profit Factor', value: backtest.profitFactor + 'x', good: backtest.profitFactor > 1 },
                    { label: 'Max DD', value: backtest.maxDrawdown + '%', good: backtest.maxDrawdown > -10 },
                    { label: 'Sharpe', value: backtest.sharpeRatio.toFixed(2), good: backtest.sharpeRatio > 0.5 },
                    { label: 'Trade Freq', value: backtest.tradeFrequency + '%', good: backtest.tradeFrequency > 20 },
                    { label: 'Signals', value: backtest.activeSignals + '/' + backtest.totalSignals, good: true },
                  ].map(m => (
                    <div key={m.label}>
                      <div className={"text-lg font-bold " + (m.good ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500')}>{m.value}</div>
                      <div className="text-[11px] text-muted-foreground">{m.label}</div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}

        {/* FILTERS */}
        <Card className="border-dashed">
          <CardContent className="p-3">
            <div className="flex flex-wrap gap-2.5 items-end">
              <div className="flex-1 min-w-[180px]">
                <label className="text-[10px] font-medium text-muted-foreground mb-1 block uppercase tracking-wider">Search</label>
                <div className="relative"><Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" /><Input placeholder="Symbol or name..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="pl-8 h-8 text-xs" /></div>
              </div>
              <div className="w-28">
                <label className="text-[10px] font-medium text-muted-foreground mb-1 block uppercase tracking-wider">Timeframe</label>
                <Select value={timeframe} onValueChange={v => setTimeframe(v)}><SelectTrigger className="h-8 text-xs"><CalendarDays className="w-3 h-3 mr-1" /><SelectValue /></SelectTrigger><SelectContent>{TIMEFRAMES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent></Select>
              </div>
              <div className="w-36">
                <label className="text-[10px] font-medium text-muted-foreground mb-1 block uppercase tracking-wider">Sector</label>
                <Select value={sector} onValueChange={setSector}><SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger><SelectContent>{SECTORS.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent></Select>
              </div>
              <div className="w-32">
                <label className="text-[10px] font-medium text-muted-foreground mb-1 block uppercase tracking-wider">Signal</label>
                <Select value={signalFilter} onValueChange={setSignalFilter}><SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger><SelectContent>{['All', 'Strong Buy', 'Buy', 'Hold', 'Sell', 'Strong Sell'].map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent></Select>
              </div>
              <div className="w-24">
                <label className="text-[10px] font-medium text-muted-foreground mb-1 block uppercase tracking-wider">Min Conf%</label>
                <Input type="number" min="0" max="100" value={minConfidence} onChange={e => setMinConfidence(e.target.value)} className="h-8 text-xs" />
              </div>
              <div className="w-28">
                <label className="text-[10px] font-medium text-muted-foreground mb-1 block uppercase tracking-wider">Sort</label>
                <Select value={sortField} onValueChange={v => { setSortField(v); setSortDir('desc'); }}><SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="confidence">Confidence</SelectItem><SelectItem value="riskReward">Risk:Reward</SelectItem><SelectItem value="entryPrice">Price</SelectItem><SelectItem value="rsi">RSI</SelectItem></SelectContent></Select>
              </div>
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setSortDir(d => d === 'desc' ? 'asc' : 'desc')}><ArrowUpDown className={"w-3.5 h-3.5 " + (sortDir === 'asc' ? 'rotate-180' : '') + ' transition-transform'} /></Button>
              <Separator orientation="vertical" className="h-6" />
              <Button variant={showBullishOnly ? 'default' : 'outline'} size="sm" className={"h-8 text-xs gap-1 " + (showBullishOnly ? 'bg-emerald-600 hover:bg-emerald-700' : '')} onClick={() => setShowBullishOnly(!showBullishOnly)}><TrendingUp className="w-3 h-3" />Bullish</Button>
              <div className="flex items-center gap-1.5">
                <label className="text-[10px] font-medium text-muted-foreground">BT</label>
                <input type="checkbox" checked={showBacktest} onChange={e => setShowBacktest(e.target.checked)} className="rounded accent-emerald-600" />
                {showBacktest && <Select value={backtestPeriod} onValueChange={v => setBacktestPeriod(v)}><SelectTrigger className="h-8 w-16 text-xs"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="1W">1W</SelectItem><SelectItem value="1M">1M</SelectItem><SelectItem value="3M">3M</SelectItem><SelectItem value="6M">6M</SelectItem></SelectContent></Select>}
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="flex items-center justify-between px-1">
          <p className="text-xs text-muted-foreground">Showing <span className="font-semibold text-foreground">{filteredStocks.length}</span> of {stocks.length} stocks</p>
          <p className="text-[10px] text-muted-foreground hidden sm:block">RSI(14) • MACD(12,26,9) • Stoch(14,3,3) • BB(20,2) • ATR(14) • SMA/EMA</p>
        </div>

        {/* TABLE */}
        {loading && stocks.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3"><Loader2 className="w-8 h-8 animate-spin text-emerald-600" /><p className="text-sm text-muted-foreground">Scanning all 260 EGX stocks ({tfLabel})...</p></div>
        ) : (
          <Card className="overflow-hidden"><div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b bg-muted/30">
            <th className="text-left px-4 py-2.5 font-medium text-xs">Stock</th>
            <th className="text-left px-3 py-2.5 font-medium text-xs">Signal</th>
            <th className="text-right px-3 py-2.5 font-medium text-xs">Entry</th>
            <th className="text-right px-3 py-2.5 font-medium text-xs">Stop-Loss</th>
            <th className="text-right px-3 py-2.5 font-medium text-xs">TP1</th>
            <th className="text-right px-3 py-2.5 font-medium text-xs">TP2</th>
            <th className="text-right px-3 py-2.5 font-medium text-xs">TP3</th>
            <th className="text-center px-3 py-2.5 font-medium text-xs">R:R</th>
            <th className="text-center px-3 py-2.5 font-medium text-xs">Conf%</th>
            <th className="text-center px-3 py-2.5 font-medium text-xs">Pos%</th>
            <th className="text-left px-3 py-2.5 font-medium text-xs">Tags</th>
            <th className="w-8"></th>
          </tr></thead><tbody>
          {filteredStocks.map((s, i) => {
            const isExpanded = expandedRow === s.symbol;
            const dqColor = DQ_GRADE_COLORS[s.dataQuality.grade] || 'text-muted-foreground';
            return (<>
              <motion.tr key={s.symbol} className={"border-b hover:bg-muted/20 cursor-pointer transition-colors " + (isExpanded ? 'bg-muted/10' : '') + (s.signal === 'Strong Buy' ? ' hover:bg-emerald-500/5' : '')} onClick={() => setExpandedRow(isExpanded ? null : s.symbol)} initial={{ opacity: 0, y: 3 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i * 0.008, 0.3) }}>
                <td className="px-4 py-2.5"><div className="flex items-center gap-2"><div className="font-semibold text-xs">{s.symbol}</div><span className={"text-[9px] font-bold " + dqColor}>{s.dataQuality.grade}</span></div><div className="text-[10px] text-muted-foreground truncate max-w-[120px] hidden lg:block">{s.name.length > 30 ? s.name.slice(0, 30) + '...' : s.name}</div></td>
                <td className="px-3 py-2.5"><SignalBadge signal={s.signal} /></td>
                <td className="text-right px-3 py-2.5 font-mono text-xs">{s.entryPrice.toFixed(2)}</td>
                <td className="text-right px-3 py-2.5"><span className="font-mono text-xs text-red-500">{s.stopLoss.toFixed(2)}</span><div className="text-[10px] text-muted-foreground">-{s.stopLossPct}%</div></td>
                {s.takeProfits.map(tp => (<td key={tp.level} className={"text-right px-3 py-2.5 " + (tp.probability === 'High' ? 'text-emerald-600' : tp.probability === 'Medium' ? 'text-amber-500' : 'text-muted-foreground')}><span className="font-mono text-xs">{tp.price.toFixed(2)}</span><div className="text-[9px] text-muted-foreground">{tp.basis}</div></td>))}
                {Array.from({ length: 3 - s.takeProfits.length }).map((_, j) => <td key={"e" + j} className="px-3 py-2.5 text-muted-foreground text-xs">-</td>)}
                <td className="text-center px-3 py-2.5"><span className={"font-bold text-xs " + (s.riskReward >= 2 ? 'text-emerald-600' : s.riskReward >= 1 ? 'text-amber-500' : 'text-red-500')}>{s.riskReward.toFixed(1)}</span></td>
                <td className="text-center px-3 py-2.5"><div className="flex flex-col items-center gap-0.5"><div className="w-10 h-1.5 bg-muted rounded-full overflow-hidden"><div className={"h-full rounded-full " + (s.confidence >= 65 ? 'bg-emerald-500' : s.confidence >= 45 ? 'bg-amber-500' : 'bg-red-500')} style={{ width: s.confidence + '%' }} /></div><span className="text-[10px] font-medium">{s.confidence}</span></div></td>
                <td className="text-center px-3 py-2.5 text-xs">{s.positionSize}%</td>
                <td className="px-3 py-2.5"><div className="flex flex-wrap gap-1 max-w-[140px]">{s.tags.slice(0, 2).map(t => <Badge key={t} variant="secondary" className="text-[9px] px-1.5 py-0 h-4">{t}</Badge>)}{s.tags.length > 2 && <Badge variant="outline" className="text-[9px] px-1.5 py-0 h-4">+{s.tags.length - 2}</Badge>}</div>{s.riskFlags.length > 0 && <div className="flex items-center gap-0.5 mt-0.5 text-[9px] text-amber-500"><AlertTriangle className="w-2.5 h-2.5" /><span className="truncate max-w-[120px]">{s.riskFlags[0]}</span></div>}</td>
                <td className="px-2 py-2.5">{isExpanded ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}</td>
              </motion.tr>
              <AnimatePresence>{isExpanded && (
                <motion.tr key={s.symbol + '-detail'} initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.2 }}>
                  <td colSpan={12} className="px-4 py-5 bg-muted/10 border-b">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                      <div><h4 className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-2.5 flex items-center gap-1.5"><Activity className="w-3 h-3" /> Technical Indicators</h4><div className="space-y-1.5 text-xs font-mono">
                        <div className="flex justify-between"><span className="text-muted-foreground">RSI (14)</span><span className={s.indicators.rsi > 70 ? 'text-red-500 font-semibold' : s.indicators.rsi < 30 ? 'text-emerald-500 font-semibold' : ''}>{s.indicators.rsi.toFixed(1)}{s.indicators.rsi > 70 ? ' Overbought' : s.indicators.rsi < 30 ? ' Oversold' : ''}</span></div>
                        <div className="flex justify-between"><span className="text-muted-foreground">MACD</span><span className={s.indicators.macd > s.indicators.macdSignal ? 'text-emerald-500' : 'text-red-500'}>{s.indicators.macd.toFixed(3)}{s.indicators.macd > s.indicators.macdSignal ? ' Bullish' : ' Bearish'}</span></div>
                        <div className="flex justify-between"><span className="text-muted-foreground">Stochastic K/D</span><span className={s.indicators.stochK > 80 ? 'text-red-500' : s.indicators.stochK < 20 ? 'text-emerald-500' : ''}>{s.indicators.stochK.toFixed(1)} / {s.indicators.stochD.toFixed(1)}</span></div>
                        <Separator className="my-1" />
                        <div className="flex justify-between"><span className="text-muted-foreground">ATR(14)</span><span>{s.indicators.atr.toFixed(3)}</span></div>
                        <div className="flex justify-between"><span className="text-muted-foreground">BB Width</span><span>{s.indicators.bbWidth.toFixed(1)}%</span></div>
                        <div className="flex justify-between"><span className="text-muted-foreground">BB Upper/Lower</span><span>{s.indicators.bbUpper.toFixed(2)} / {s.indicators.bbLower.toFixed(2)}</span></div>
                        <Separator className="my-1" />
                        <div className="flex justify-between"><span className="text-muted-foreground">vs SMA200</span><span className={s.indicators.priceVsSma200 > 0 ? 'text-emerald-500' : 'text-red-500'}>{s.indicators.priceVsSma200 > 0 ? '+' : ''}{s.indicators.priceVsSma200.toFixed(1)}%</span></div>
                        <div className="flex justify-between"><span className="text-muted-foreground">TV Rating</span><span className={s.indicators.recommendAll > 0 ? 'text-emerald-500' : s.indicators.recommendAll < 0 ? 'text-red-500' : ''}>{s.indicators.recommendAll > 0 ? '+' : ''}{s.indicators.recommendAll.toFixed(2)}</span></div>
                        <div className="flex justify-between"><span className="text-muted-foreground">Volume</span><span>{(s.indicators.volume / 1000000).toFixed(1)}M</span></div>
                        <div className="flex justify-between"><span className="text-muted-foreground">Data Quality</span><span className={dqColor}>{s.dataQuality.grade} ({s.dataQuality.score})</span></div>
                      </div></div>
                      <div><h4 className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-2.5 flex items-center gap-1.5"><TrendingUp className="w-3 h-3" /> Moving Averages vs {s.close.toFixed(2)} EGP</h4><div className="space-y-1.5 text-xs">
                        {INDICATOR_LIST.map(label => { const key = label.toLowerCase() as 'sma20' | 'sma50' | 'sma200' | 'ema20' | 'ema50' | 'ema200'; const val = s.indicators[key]; if (!val || val <= 0) return null; const above = s.close > val; const pct = ((s.close - val) / val * 100); return (<div key={label} className="flex justify-between font-mono"><span className="text-muted-foreground">{label}</span><span className={above ? 'text-emerald-500' : 'text-red-500'}>{val.toFixed(2)} <span className="ml-1.5">{above ? '\u25b2' : '\u25bc'}{above ? '+' : ''}{pct.toFixed(1)}%</span></span></div>); })}
                      </div><Separator className="my-3" /><h4 className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-2.5 flex items-center gap-1.5"><Shield className="w-3 h-3" /> Risk Management</h4><div className="space-y-1.5 text-xs font-mono">
                        <div className="flex justify-between"><span className="text-muted-foreground">Timeframe</span><span>{s.timeframe} ({s.horizon})</span></div>
                        <div className="flex justify-between"><span className="text-muted-foreground">Max Risk/Trade</span><span>2%</span></div>
                        <div className="flex justify-between"><span className="text-muted-foreground">Position Size</span><span className="font-semibold">{s.positionSize}%</span></div>
                        <div className="flex justify-between"><span className="text-muted-foreground">Stop-Loss</span><span className="text-red-500">{s.stopLoss.toFixed(2)} (-{s.stopLossPct}%)</span></div>
                        <div className="flex justify-between"><span className="text-muted-foreground">Risk Amount</span><span>{(s.positionSize * s.stopLossPct / 100).toFixed(3)}%</span></div>
                        {s.takeProfits.map(tp => (<div key={tp.level} className="flex justify-between"><span className="text-muted-foreground">TP{tp.level}</span><span className="text-emerald-500">{tp.price.toFixed(2)} ({tp.basis}) <span className="text-muted-foreground">{tp.probability}</span></span></div>))}
                      </div></div>
                      <div><h4 className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-2.5 flex items-center gap-1.5"><Crosshair className="w-3 h-3" /> Signal Rationale</h4><div className="space-y-1.5 max-h-[280px] overflow-y-auto">
                        {s.rationale.filter(r => r.direction !== 0).sort((a, b) => b.weight - a.weight).map((r, i) => (<div key={i} className={"flex items-start gap-2 text-xs p-2 rounded-lg " + (r.direction > 0 ? 'bg-emerald-500/5 border border-emerald-500/10' : 'bg-red-500/5 border border-red-500/10')}><span className="mt-0.5 shrink-0">{r.direction > 0 ? <CheckCircle className="w-3.5 h-3.5 text-emerald-500" /> : <XCircle className="w-3.5 h-3.5 text-red-500" />}</span><div className="min-w-0"><div className="flex items-center gap-1.5"><span className="font-semibold">{r.tag}</span><Badge variant="outline" className="text-[9px] px-1 py-0 h-3.5">{r.weight}</Badge></div><div className="text-muted-foreground leading-relaxed mt-0.5">{r.description}</div></div></div>))}
                      </div>{s.riskFlags.length > 0 && <div className="mt-3"><h4 className="text-[10px] font-bold text-amber-500 uppercase tracking-wider mb-1.5 flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> Risk Flags</h4>{s.riskFlags.map(f => <div key={f} className="text-xs text-amber-600 dark:text-amber-400 py-0.5">• {f}</div>)}</div>}{s.dataQuality.anomalies.length > 0 && <div className="mt-3"><h4 className="text-[10px] font-bold text-orange-500 uppercase tracking-wider mb-1.5 flex items-center gap-1"><FileWarning className="w-3 h-3" /> Data Anomalies</h4>{s.dataQuality.anomalies.map(a => <div key={a} className="text-xs text-orange-600 dark:text-orange-400 py-0.5">• {a}</div>)}</div>}</div>
                    </div>
                  </td>
                </motion.tr>)}
              </AnimatePresence></>)})}
          </tbody></table>
          {filteredStocks.length === 0 && !loading && <div className="text-center py-16 text-muted-foreground"><Search className="w-8 h-8 mx-auto mb-2 opacity-30" /><p className="text-sm">No stocks match your filters</p></div>}
          </div></Card>
        )}

        <div className="text-center py-4 text-[10px] text-muted-foreground space-y-0.5">
          <p>Data: TradingView • {stocks.length} EGX stocks • RSI(14) MACD(12,26,9) Stoch(14,3,3) BB(20,2) ATR(14) SMA/EMA(20/50/200)</p>
          <p>Signal weights: Trend 30% • Momentum 25% • Volatility 20% • Volume 15% • TV Consensus 10%</p>
        </div>
      </div>
    </div>);
}
