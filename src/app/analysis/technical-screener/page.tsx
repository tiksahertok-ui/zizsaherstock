'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Search, Filter, Download, RefreshCw, TrendingUp, TrendingDown, Minus,
  Shield, Target, AlertTriangle, BarChart3, ChevronDown, ChevronUp,
  ArrowUpDown, Zap, Eye, X, CheckCircle, XCircle,
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'

// ── Types ──────────────────────────────────────────────────────
type SignalType = 'Strong Buy' | 'Buy' | 'Hold' | 'Sell' | 'Strong Sell'

interface TakeProfitTarget { level: number; price: number; basis: string; probability: string }
interface SignalRationale { tag: string; weight: number; direction: number; description: string }

interface ScreenerStock {
  symbol: string; name: string; sector: string
  signal: SignalType; confidence: number
  entryPrice: number; stopLoss: number; stopLossPct: number
  takeProfits: TakeProfitTarget[]; riskReward: number; positionSize: number
  rationale: SignalRationale[]; tags: string[]
  indicators: { rsi: number; macd: number; macdSignal: number; stochK: number; stochD: number; atr: number; bbUpper: number; bbLower: number; sma20: number; sma50: number; sma200: number; ema20: number; ema50: number; ema200: number; volume: number; close: number; recommendAll: number; bbWidth: number; priceVsSma200: number; priceVsBB: number }
  riskFlags: string[]; generatedAt: string
}

interface ScreenerSummary {
  total: number; strongBuy: number; buy: number; hold: number; sell: number; strongSell: number
  avgConfidence: number; filteredTotal: number
  topSignals: { symbol: string; signal: SignalType; confidence: number }[]
  sectorBreakdown: Record<string, { bullish: number; bearish: number; neutral: number }>
}

interface BacktestResult {
  period: string; totalSignals: number; winRate: number; avgReturn: number
  avgWin: number; avgLoss: number; profitFactor: number; maxDrawdown: number; sharpeRatio: number
}

// ── Constants ──────────────────────────────────────────────────
const SIGNAL_STYLES: Record<SignalType, { bg: string; text: string; border: string; icon: typeof TrendingUp }> = {
  'Strong Buy': { bg: 'bg-emerald-600/15 dark:bg-emerald-500/15', text: 'text-emerald-700 dark:text-emerald-400', border: 'border-emerald-600/30', icon: TrendingUp },
  'Buy': { bg: 'bg-emerald-500/10 dark:bg-emerald-400/10', text: 'text-emerald-600 dark:text-emerald-500', border: 'border-emerald-500/20', icon: TrendingUp },
  'Hold': { bg: 'bg-amber-500/10 dark:bg-amber-400/10', text: 'text-amber-600 dark:text-amber-400', border: 'border-amber-500/20', icon: Minus },
  'Sell': { bg: 'bg-red-500/10 dark:bg-red-400/10', text: 'text-red-600 dark:text-red-500', border: 'border-red-500/20', icon: TrendingDown },
  'Strong Sell': { bg: 'bg-red-600/15 dark:bg-red-500/15', text: 'text-red-700 dark:text-red-400', border: 'border-red-600/30', icon: TrendingDown },
}

const SECTORS = ['All', 'Financials', 'Real Estate', 'Materials', 'Communications', 'Energy', 'Consumer Staples', 'Healthcare', 'Industrials', 'Consumer Discretionary', 'Utilities', 'Technology']

// ── Component ──────────────────────────────────────────────────
export default function TechnicalScreenerPage() {
  // Filters
  const [sector, setSector] = useState('All')
  const [signalFilter, setSignalFilter] = useState('All')
  const [minConfidence, setMinConfidence] = useState('40')
  const [searchQuery, setSearchQuery] = useState('')
  const [sortField, setSortField] = useState('confidence')
  const [sortDir, setSortDir] = useState<'desc' | 'asc'>('desc')
  const [showBacktest, setShowBacktest] = useState(false)
  const [backtestPeriod, setBacktestPeriod] = useState('1M')

  // Data
  const [stocks, setStocks] = useState<ScreenerStock[]>([])
  const [summary, setSummary] = useState<ScreenerSummary | null>(null)
  const [backtest, setBacktest] = useState<BacktestResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [expandedRow, setExpandedRow] = useState<string | null>(null)
  const [lastUpdated, setLastUpdated] = useState<string>('')

  // ── Fetch screener data ──
  const fetchScreener = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (sector !== 'All') params.set('sector', sector)
      if (signalFilter !== 'All') params.set('signal', signalFilter)
      if (minConfidence) params.set('minConfidence', minConfidence)
      params.set('sort', sortField)
      if (showBacktest) { params.set('backtest', 'true'); params.set('backtestPeriod', backtestPeriod) }

      const res = await fetch(`/api/analysis/technical-screener?${params}`)
      if (!res.ok) throw new Error('Screener failed')
      const data = await res.json()
      setStocks(data.stocks || [])
      setSummary(data.summary || null)
      setBacktest(data.backtest || null)
      setLastUpdated(data.generatedAt || new Date().toISOString())
    } catch (err) {
      toast.error('فشل تحميل بيانات الفرز')
      console.error(err)
    } finally { setLoading(false) }
  }, [sector, signalFilter, minConfidence, sortField, showBacktest, backtestPeriod])

  useEffect(() => { fetchScreener() }, [fetchScreener])

  // ── Filtered + sorted data ──
  const filteredStocks = useMemo(() => {
    let list = [...stocks]
    if (searchQuery) {
      const q = searchQuery.toUpperCase()
      list = list.filter(s => s.symbol.includes(q) || s.name.toUpperCase().includes(q))
    }
    list.sort((a, b) => {
      const mul = sortDir === 'desc' ? -1 : 1
      if (sortField === 'confidence') return (a.confidence - b.confidence) * mul
      if (sortField === 'riskReward') return (a.riskReward - b.riskReward) * mul
      if (sortField === 'entryPrice') return (a.entryPrice - b.entryPrice) * mul
      return 0
    })
    return list
  }, [stocks, searchQuery, sortField, sortDir])

  // ── CSV Export ──
  const handleExport = async () => {
    try {
      const params = new URLSearchParams({ format: 'csv' })
      if (sector !== 'All') params.set('sector', sector)
      const res = await fetch(`/api/analysis/technical-screener?${params}`)
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a'); a.href = url; a.download = `egx_screener_${new Date().toISOString().slice(0, 10)}.csv`; a.click()
      URL.revokeObjectURL(url)
      toast.success('تم تصدير الملف')
    } catch { toast.error('فشل التصدير') }
  }

  // ── Signal badge ──
  const SignalBadge = ({ signal }: { signal: SignalType }) => {
    const s = SIGNAL_STYLES[signal]
    return (
      <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-semibold border ${s.bg} ${s.text} ${s.border}`}>
        <s.icon className="w-3 h-3" />
        {signal}
      </span>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b bg-background/80 backdrop-blur-xl sticky top-0 z-40">
        <div className="max-w-[1600px] mx-auto px-4 sm:px-6 py-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <h1 className="text-xl font-bold tracking-tight flex items-center gap-2">
                <Zap className="w-5 h-5 text-emerald-600" />
                EGX Technical Screener
              </h1>
              <p className="text-sm text-muted-foreground mt-0.5">
                Daily Buy/Sell signals with targets &amp; risk controls
                {lastUpdated && <span className="ml-2">• Updated {new Date(lastUpdated).toLocaleTimeString()}</span>}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={handleExport} className="gap-1.5">
                <Download className="w-3.5 h-3.5" /> CSV
              </Button>
              <Button size="sm" onClick={fetchScreener} disabled={loading} className="gap-1.5 bg-emerald-600 hover:bg-emerald-700">
                <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
                {loading ? 'Scanning...' : 'Refresh'}
              </Button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-[1600px] mx-auto px-4 sm:px-6 py-4 space-y-4">
        {/* Filters Bar */}
        <Card className="border-dashed">
          <CardContent className="p-4">
            <div className="flex flex-wrap gap-3 items-end">
              <div className="flex-1 min-w-[200px]">
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Search</label>
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input placeholder="Symbol or name..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="pl-9 h-9" />
                </div>
              </div>
              <div className="w-40">
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Sector</label>
                <Select value={sector} onValueChange={setSector}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>{SECTORS.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="w-36">
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Signal</label>
                <Select value={signalFilter} onValueChange={setSignalFilter}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {['All', 'Strong Buy', 'Buy', 'Hold', 'Sell', 'Strong Sell'].map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="w-28">
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Min Conf %</label>
                <Input type="number" min="0" max="100" value={minConfidence} onChange={e => setMinConfidence(e.target.value)} className="h-9" />
              </div>
              <div className="w-36">
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Sort</label>
                <Select value={sortField} onValueChange={v => { setSortField(v); setSortDir('desc') }}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="confidence">Confidence</SelectItem>
                    <SelectItem value="riskReward">Risk:Reward</SelectItem>
                    <SelectItem value="entryPrice">Price</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button variant="ghost" size="icon" className="h-9 w-9" onClick={() => setSortDir(d => d === 'desc' ? 'asc' : 'desc')}>
                <ArrowUpDown className={`w-4 h-4 ${sortDir === 'asc' ? 'rotate-180' : ''} transition-transform`} />
              </Button>
              <div className="flex items-center gap-2">
                <label className="text-xs font-medium text-muted-foreground">Backtest</label>
                <input type="checkbox" checked={showBacktest} onChange={e => setShowBacktest(e.target.checked)} className="rounded" />
                {showBacktest && (
                  <Select value={backtestPeriod} onValueChange={v => setBacktestPeriod(v)}>
                    <SelectTrigger className="h-9 w-20"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1W">1W</SelectItem><SelectItem value="1M">1M</SelectItem>
                      <SelectItem value="3M">3M</SelectItem><SelectItem value="6M">6M</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Summary Cards */}
        {summary && (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {[
              { label: 'Total', value: summary.total, color: 'text-foreground' },
              { label: 'Strong Buy', value: summary.strongBuy, color: 'text-emerald-600 dark:text-emerald-400' },
              { label: 'Buy', value: summary.buy, color: 'text-emerald-500' },
              { label: 'Hold', value: summary.hold, color: 'text-amber-500' },
              { label: 'Sell', value: summary.sell, color: 'text-red-500' },
              { label: 'Strong Sell', value: summary.strongSell, color: 'text-red-600 dark:text-red-400' },
            ].map(c => (
              <Card key={c.label} className="py-3 px-4">
                <div className="text-2xl font-bold {c.color}">{c.value}</div>
                <div className="text-xs text-muted-foreground">{c.label}</div>
              </Card>
            ))}
          </div>
        )}

        {/* Backtest Results */}
        {backtest && (
          <Card className="border-emerald-600/30">
            <CardHeader className="pb-3 pt-4 px-4"><CardTitle className="text-sm font-semibold flex items-center gap-2"><BarChart3 className="w-4 h-4" />Backtest Results ({backtest.period})</CardTitle></CardHeader>
            <CardContent className="px-4 pb-4">
              <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-4">
                {[
                  { label: 'Win Rate', value: `${backtest.winRate}%`, good: backtest.winRate > 50 },
                  { label: 'Avg Return', value: `${backtest.avgReturn}%`, good: backtest.avgReturn > 0 },
                  { label: 'Avg Win', value: `${backtest.avgWin}%`, good: true },
                  { label: 'Avg Loss', value: `${backtest.avgLoss}%`, good: backtest.avgLoss > -5 },
                  { label: 'Profit Factor', value: `${backtest.profitFactor}x`, good: backtest.profitFactor > 1 },
                  { label: 'Max Drawdown', value: `${backtest.maxDrawdown}%`, good: backtest.maxDrawdown > -10 },
                  { label: 'Sharpe Ratio', value: backtest.sharpeRatio.toFixed(2), good: backtest.sharpeRatio > 0.5 },
                ].map(m => (
                  <div key={m.label}>
                    <div className={`text-lg font-bold ${m.good ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500'}`}>{m.value}</div>
                    <div className="text-[11px] text-muted-foreground">{m.label}</div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Stock Table */}
        {loading && stocks.length === 0 ? (
          <div className="flex items-center justify-center py-20"><RefreshCw className="w-6 h-6 animate-spin text-emerald-600" /></div>
        ) : (
          <Card>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/30">
                    <th className="text-left px-4 py-3 font-medium">Symbol</th>
                    <th className="text-left px-3 py-3 font-medium">Signal</th>
                    <th className="text-right px-3 py-3 font-medium">Entry</th>
                    <th className="text-right px-3 py-3 font-medium">Stop-Loss</th>
                    <th className="text-right px-3 py-3 font-medium">TP1</th>
                    <th className="text-right px-3 py-3 font-medium">TP2</th>
                    <th className="text-right px-3 py-3 font-medium">TP3</th>
                    <th className="text-center px-3 py-3 font-medium">R:R</th>
                    <th className="text-center px-3 py-3 font-medium">Conf%</th>
                    <th className="text-center px-3 py-3 font-medium">Pos%</th>
                    <th className="text-left px-3 py-3 font-medium">Tags</th>
                    <th className="w-10"></th>
                  </tr>
                </thead>
                <tbody>
                  {filteredStocks.map((s, i) => {
                    const isExpanded = expandedRow === s.symbol
                    const styles = SIGNAL_STYLES[s.signal]
                    return (
                      <>
                        <motion.tr
                          key={s.symbol}
                          className={`border-b hover:bg-muted/20 cursor-pointer transition-colors ${isExpanded ? 'bg-muted/10' : ''}`}
                          onClick={() => setExpandedRow(isExpanded ? null : s.symbol)}
                          initial={{ opacity: 0, y: 5 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: Math.min(i * 0.02, 0.5) }}
                        >
                          <td className="px-4 py-3">
                            <div className="font-semibold">{s.symbol}</div>
                            <div className="text-xs text-muted-foreground truncate max-w-[120px]">{s.name}</div>
                          </td>
                          <td className="px-3 py-3"><SignalBadge signal={s.signal} /></td>
                          <td className="text-right px-3 py-3 font-mono text-xs">{s.entryPrice.toFixed(2)}</td>
                          <td className="text-right px-3 py-3 font-mono text-xs text-red-500">{s.stopLoss.toFixed(2)}<div className="text-[10px] text-muted-foreground">-{s.stopLossPct}%</div></td>
                          {s.takeProfits.map(tp => (
                            <td key={tp.level} className={`text-right px-3 py-3 font-mono text-xs ${tp.probability === 'High' ? 'text-emerald-600' : tp.probability === 'Medium' ? 'text-amber-500' : 'text-muted-foreground'}`}>{tp.price.toFixed(2)}<div className="text-[10px]">{tp.basis}</div></td>
                          ))}
                          {Array.from({ length: 3 - s.takeProfits.length }).map((_, j) => <td key={`e${j}`} className="px-3 py-3">-</td>)}
                          <td className="text-center px-3 py-3"><span className={`font-semibold ${s.riskReward >= 2 ? 'text-emerald-600' : s.riskReward >= 1 ? 'text-amber-500' : 'text-red-500'}`}>{s.riskReward}</span></td>
                          <td className="text-center px-3 py-3">
                            <div className="w-12 h-1.5 bg-muted rounded-full mx-auto overflow-hidden">
                              <div className={`h-full rounded-full ${s.confidence >= 65 ? 'bg-emerald-500' : s.confidence >= 45 ? 'bg-amber-500' : 'bg-red-500'}`} style={{ width: `${s.confidence}%` }} />
                            </div>
                            <span className="text-[11px] mt-0.5 block">{s.confidence}</span>
                          </td>
                          <td className="text-center px-3 py-3 text-xs">{s.positionSize}%</td>
                          <td className="px-3 py-3">
                            <div className="flex flex-wrap gap-1">
                              {s.tags.slice(0, 3).map(t => <Badge key={t} variant="secondary" className="text-[10px] px-1.5 py-0 h-5">{t}</Badge>)}
                              {s.tags.length > 3 && <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-5">+{s.tags.length - 3}</Badge>}
                            </div>
                            {s.riskFlags.length > 0 && <div className="flex items-center gap-1 mt-1 text-[10px] text-amber-500"><AlertTriangle className="w-3 h-3" />{s.riskFlags[0]}</div>}
                          </td>
                          <td className="px-3 py-3">{isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}</td>
                        </motion.tr>
                        {/* Expanded Detail Row */}
                        <AnimatePresence>
                          {isExpanded && (
                            <motion.tr key={`${s.symbol}-detail`} initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}>
                              <td colSpan={12} className="px-6 py-4 bg-muted/10 border-b">
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                  {/* Indicators */}
                                  <div>
                                    <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Indicators</h4>
                                    <div className="space-y-1.5 text-xs font-mono">
                                      <div className="flex justify-between"><span className="text-muted-foreground">RSI (14)</span><span className={s.indicators.rsi > 70 ? 'text-red-500' : s.indicators.rsi < 30 ? 'text-emerald-500' : ''}>{s.indicators.rsi.toFixed(1)}</span></div>
                                      <div className="flex justify-between"><span className="text-muted-foreground">MACD</span><span className={s.indicators.macd > 0 ? 'text-emerald-500' : 'text-red-500'}>{s.indicators.macd.toFixed(3)}</span></div>
                                      <div className="flex justify-between"><span className="text-muted-foreground">Stoch K/D</span><span>{s.indicators.stochK.toFixed(1)} / {s.indicators.stochD.toFixed(1)}</span></div>
                                      <div className="flex justify-between"><span className="text-muted-foreground">ATR</span><span>{s.indicators.atr.toFixed(3)}</span></div>
                                      <div className="flex justify-between"><span className="text-muted-foreground">BB Width</span><span>{s.indicators.bbWidth.toFixed(1)}%</span></div>
                                      <div className="flex justify-between"><span className="text-muted-foreground">vs SMA200</span><span className={s.indicators.priceVsSma200 > 0 ? 'text-emerald-500' : 'text-red-500'}>{s.indicators.priceVsSma200 > 0 ? '+' : ''}{s.indicators.priceVsSma200.toFixed(1)}%</span></div>
                                      <div className="flex justify-between"><span className="text-muted-foreground">TV Rating</span><span>{s.indicators.recommendAll > 0 ? '+' : ''}{s.indicators.recommendAll.toFixed(2)}</span></div>
                                    </div>
                                  </div>
                                  {/* Moving Averages */}
                                  <div>
                                    <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Moving Averages vs Price ({s.close.toFixed(2)})</h4>
                                    <div className="space-y-1.5 text-xs">
                                      {([['SMA20', s.indicators.sma20], ['SMA50', s.indicators.sma50], ['SMA200', s.indicators.sma200], ['EMA20', s.indicators.ema20], ['EMA50', s.indicators.ema50], ['EMA200', s.indicators.ema200]] as const).map(([label, val]) => val > 0 && (
                                        <div key={label} className="flex justify-between font-mono">
                                          <span className="text-muted-foreground">{label}</span>
                                          <span className={s.close > val ? 'text-emerald-500' : 'text-red-500'}>{val.toFixed(2)} {s.close > val ? '▲' : '▼'}</span>
                                        </div>
                                      ))}
                                    </div>
                                    <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mt-4 mb-2">Risk</h4>
                                    <div className="space-y-1.5 text-xs">
                                      <div className="flex justify-between"><span className="text-muted-foreground">Max Risk/Trade</span><span>2%</span></div>
                                      <div className="flex justify-between"><span className="text-muted-foreground">Position Size</span><span>{s.positionSize}%</span></div>
                                      <div className="flex justify-between"><span className="text-muted-foreground">Risk Amount</span><span>{(s.positionSize * s.stopLossPct / 100).toFixed(3)}%</span></div>
                                    </div>
                                  </div>
                                  {/* Rationale */}
                                  <div>
                                    <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Signal Rationale</h4>
                                    <div className="space-y-1.5">
                                      {s.rationale.filter(r => r.direction !== 0).sort((a, b) => b.weight - a.weight).map((r, i) => (
                                        <div key={i} className={`flex items-start gap-2 text-xs p-1.5 rounded ${r.direction > 0 ? 'bg-emerald-500/5' : 'bg-red-500/5'}`}>
                                          {r.direction > 0 ? <CheckCircle className="w-3 h-3 text-emerald-500 mt-0.5 shrink-0" /> : <XCircle className="w-3 h-3 text-red-500 mt-0.5 shrink-0" />}
                                          <div><span className="font-medium">{r.tag}</span><span className="text-muted-foreground ml-1">({r.weight})</span><div className="text-muted-foreground">{r.description}</div></div>
                                        </div>
                                      ))}
                                    </div>
                                    {s.riskFlags.length > 0 && (
                                      <div className="mt-3">
                                        <h4 className="text-xs font-semibold text-amber-500 uppercase tracking-wider mb-1.5 flex items-center gap-1"><AlertTriangle className="w-3 h-3" />Risk Flags</h4>
                                        {s.riskFlags.map(f => <div key={f} className="text-xs text-amber-600 dark:text-amber-400">• {f}</div>)}
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </td>
                            </motion.tr>
                          )}
                        </AnimatePresence>
                      </>
                    )
                  })}
                </tbody>
              </table>
              {filteredStocks.length === 0 && !loading && (
                <div className="text-center py-16 text-muted-foreground">
                  <Filter className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  <p>No stocks match your filters</p>
                </div>
              )}
            </div>
          </Card>
        )}
      </div>
    </div>
  )
}
