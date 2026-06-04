'use client';

import { useState, useMemo } from 'react';
import {
  ShieldCheck,
  ShieldAlert,
  TrendingUp,
  TrendingDown,
  Minus,
  Activity,
  Search,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

import { pnlColor, pnlBgColor, fmtPercent, fmtCurrency, fmtNumber } from '@/utils/formatters';
import type { TechnicalAnalysisData, StoredHolding } from '@/types';

interface TechnicalAnalysisPanelProps {
  taData: Record<string, TechnicalAnalysisData>;
  holdings: StoredHolding[];
  taLoading: boolean;
}

// ── Signal badge ──────────────────────────────────────────────

function SignalBadge({ signal }: { signal: TechnicalAnalysisData['signal'] }) {
  const config: Record<string, { bg: string; text: string; icon: typeof TrendingUp }> = {
    'Strong Buy': { bg: 'bg-emerald-500/20 text-emerald-700 dark:text-emerald-400 border-emerald-300 dark:border-emerald-700', text: 'Strong Buy', icon: TrendingUp },
    'Buy': { bg: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800', text: 'Buy', icon: TrendingUp },
    'Neutral': { bg: 'bg-muted text-muted-foreground border-border', text: 'Neutral', icon: Minus },
    'Sell': { bg: 'bg-red-500/10 text-red-600 dark:text-red-400 border-red-200 dark:border-red-800', text: 'Sell', icon: TrendingDown },
    'Strong Sell': { bg: 'bg-red-500/20 text-red-700 dark:text-red-400 border-red-300 dark:border-red-700', text: 'Strong Sell', icon: TrendingDown },
  };
  const c = config[signal] ?? config['Neutral'];
  const Icon = c.icon;
  return (
    <Badge variant="outline" className={`text-xs font-semibold px-2 py-0.5 border ${c.bg}`}>
      <Icon className="w-3 h-3 mr-1" />
      {c.text}
    </Badge>
  );
}

// ── Mini bar gauge ────────────────────────────────────────────

function RatingGauge({ label, value, max = 10 }: { label: string; value: number; max?: number }) {
  const pct = Math.min(100, Math.max(0, (value / max) * 100));
  const color = value >= 7 ? 'bg-emerald-500' : value >= 4 ? 'bg-amber-500' : 'bg-red-500';

  return (
    <div className="space-y-0.5">
      <div className="flex items-center justify-between text-[10px]">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-semibold">{value}/{max}</span>
      </div>
      <div className="h-1.5 rounded-full bg-muted overflow-hidden">
        <div className={`h-full rounded-full ${color} transition-all`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

// ── Single Stock TA Card ──────────────────────────────────────

function StockTACard({ data }: { data: TechnicalAnalysisData }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-sm">{data.name}</CardTitle>
            <p className="text-xs text-muted-foreground">{fmtCurrency(data.currentPrice)}</p>
          </div>
          <SignalBadge signal={data.signal} />
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Overall Rating */}
        <RatingGauge label="Overall" value={data.rating} />

        {/* MA Rating */}
        <RatingGauge label="Moving Averages" value={data.ratingMA} />

        {/* Indicators Rating */}
        <RatingGauge label="Oscillators" value={data.ratingOther} />

        {/* Key Levels */}
        <div className="space-y-1.5">
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Key Levels</p>
          <div className="grid grid-cols-2 gap-2 text-[10px]">
            {data.nearestSupport && (
              <div className="rounded-md bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900 p-1.5">
                <span className="text-emerald-600 dark:text-emerald-400 font-semibold">Support</span>
                <p className="font-bold">{fmtCurrency(data.nearestSupport.price)}</p>
                <p className="text-muted-foreground">{data.nearestSupport.source}</p>
              </div>
            )}
            {data.nearestResistance && (
              <div className="rounded-md bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 p-1.5">
                <span className="text-red-600 dark:text-red-400 font-semibold">Resistance</span>
                <p className="font-bold">{fmtCurrency(data.nearestResistance.price)}</p>
                <p className="text-muted-foreground">{data.nearestResistance.source}</p>
              </div>
            )}
          </div>
        </div>

        {/* Expandable details */}
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setExpanded(!expanded)}
          className="w-full text-xs text-muted-foreground"
        >
          {expanded ? <ChevronUp className="w-3 h-3 mr-1" /> : <ChevronDown className="w-3 h-3 mr-1" />}
          {expanded ? 'Less Details' : 'More Details'}
        </Button>

        {expanded && (
          <div className="space-y-3 text-[10px] pt-1 border-t">
            {/* Moving Averages Table */}
            <div>
              <p className="font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Moving Averages</p>
              <div className="grid grid-cols-3 gap-1">
                {[
                  { label: 'SMA 20', value: data.ma.sma20 },
                  { label: 'SMA 50', value: data.ma.sma50 },
                  { label: 'SMA 100', value: data.ma.sma100 },
                  { label: 'SMA 200', value: data.ma.sma200 },
                  { label: 'EMA 20', value: data.ma.ema20 },
                  { label: 'EMA 50', value: data.ma.ema50 },
                ].map((ma) => (
                  <div key={ma.label} className="rounded bg-muted/40 p-1">
                    <span className="text-muted-foreground">{ma.label}</span>
                    <p className="font-semibold">{fmtCurrency(ma.value)}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Oscillators */}
            <div>
              <p className="font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Oscillators</p>
              <div className="grid grid-cols-2 gap-1">
                {[
                  { label: 'RSI (14)', value: data.rsi },
                  { label: 'Stochastic %K', value: data.stochK },
                  { label: 'Stochastic %D', value: data.stochD },
                  { label: 'MACD', value: data.macd },
                  { label: 'MACD Signal', value: data.macdSignal },
                  { label: 'ATR (14)', value: data.atr },
                ].map((osc) => (
                  <div key={osc.label} className="rounded bg-muted/40 p-1 flex items-center justify-between">
                    <span className="text-muted-foreground">{osc.label}</span>
                    <span className="font-semibold">{osc.value.toFixed(2)}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Bollinger Bands */}
            <div>
              <p className="font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Bollinger Bands</p>
              <div className="grid grid-cols-3 gap-1">
                <div className="rounded bg-muted/40 p-1">
                  <span className="text-muted-foreground">Upper</span>
                  <p className="font-semibold">{fmtCurrency(data.bb.upper)}</p>
                </div>
                <div className="rounded bg-muted/40 p-1">
                  <span className="text-muted-foreground">Lower</span>
                  <p className="font-semibold">{fmtCurrency(data.bb.lower)}</p>
                </div>
                <div className="rounded bg-muted/40 p-1">
                  <span className="text-muted-foreground">Width</span>
                  <p className="font-semibold">{data.bb.width.toFixed(2)}%</p>
                </div>
              </div>
            </div>

            {/* 52-Week Range */}
            <div>
              <p className="font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">52-Week Range</p>
              <div className="flex items-center gap-2">
                <span className="text-red-500 font-semibold">{fmtCurrency(data.week52Low)}</span>
                <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                  {(() => {
                    const range = data.week52High - data.week52Low;
                    const pct = range > 0 ? ((data.currentPrice - data.week52Low) / range) * 100 : 50;
                    return (
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-red-500 via-amber-500 to-emerald-500"
                        style={{ width: `${Math.min(100, Math.max(0, pct))}%` }}
                      />
                    );
                  })()}
                </div>
                <span className="text-emerald-500 font-semibold">{fmtCurrency(data.week52High)}</span>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ── Main TechnicalAnalysisPanel ───────────────────────────────

export function TechnicalAnalysisPanel({ taData, holdings, taLoading }: TechnicalAnalysisPanelProps) {
  const [searchQuery, setSearchQuery] = useState('');

  const holdingTaList = useMemo(() => {
    const filtered = searchQuery
      ? holdings.filter(h =>
          h.symbol.toLowerCase().includes(searchQuery.toLowerCase()) ||
          h.name.toLowerCase().includes(searchQuery.toLowerCase())
        )
      : holdings;

    return filtered
      .map(h => ({ holding: h, ta: taData[h.symbol] }))
      .filter(item => item.ta);
  }, [holdings, taData, searchQuery]);

  if (taLoading) {
    return (
      <Card>
        <CardContent className="p-6 text-center text-sm text-muted-foreground">
          <Activity className="w-4 h-4 animate-spin mx-auto mb-2" />
          Loading technical analysis...
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-violet-100 dark:bg-violet-900/40 flex items-center justify-center">
              <ShieldCheck className="w-4 h-4 text-violet-600 dark:text-violet-400" />
            </div>
            <div>
              <CardTitle className="text-sm">Technical Analysis</CardTitle>
              <p className="text-[10px] text-muted-foreground">S/R levels, MA, oscillators</p>
            </div>
          </div>
          <div className="relative w-full sm:w-48">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <Input
              placeholder="Search holdings..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-8 pl-8 text-xs"
            />
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {holdingTaList.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">
            {holdings.length === 0
              ? 'Add holdings to see technical analysis'
              : 'No technical analysis data available'}
          </p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {holdingTaList.map(({ ta }) => (
              <StockTACard key={ta.name} data={ta} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
