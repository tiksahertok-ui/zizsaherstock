'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Activity, Loader2, RefreshCw } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { fmtCurrency, pnlColor } from '@/utils/formatters';

interface TechnicalAnalysisSectionProps {
  symbol: string;
}

interface TechData {
  symbol: string;
  close: number;
  rsi: number;
  stochK: number;
  stochD: number;
  macd: number;
  macdSignal: number;
  sma20: number;
  sma50: number;
  sma100: number;
  sma200: number;
  ema20: number;
  ema50: number;
  ema100: number;
  ema200: number;
  bbUpper: number;
  bbLower: number;
  atr: number;
  recommendAll: number;
  recommendMA: number;
  recommendOther: number;
  week52High: number;
  week52Low: number;
}

function ratingLabel(val: number): { label: string; color: string } {
  if (val >= 1.5) return { label: 'Strong Buy', color: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800' };
  if (val >= 0.5) return { label: 'Buy', color: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800' };
  if (val >= -0.5) return { label: 'Neutral', color: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-200 dark:border-amber-800' };
  if (val >= -1.5) return { label: 'Sell', color: 'bg-red-500/10 text-red-600 dark:text-red-400 border-red-200 dark:border-red-800' };
  return { label: 'Strong Sell', color: 'bg-red-500/15 text-red-700 dark:text-red-400 border-red-200 dark:border-red-800' };
}

function rsiColor(rsi: number): string {
  if (rsi >= 70) return 'bg-red-500';
  if (rsi >= 60) return 'bg-amber-500';
  if (rsi <= 30) return 'bg-emerald-500';
  if (rsi <= 40) return 'bg-amber-500';
  return 'bg-primary';
}

function macdSignalLabel(macd: number, signal: number): { text: string; color: string } {
  if (macd > signal) return { text: 'Bullish', color: 'text-emerald-600 dark:text-emerald-400' };
  return { text: 'Bearish', color: 'text-red-600 dark:text-red-400' };
}

function maPosition(price: number, ma: number): { text: string; color: string } {
  if (ma <= 0) return { text: '—', color: 'text-muted-foreground' };
  if (price > ma) return { text: 'Above', color: 'text-emerald-600 dark:text-emerald-400' };
  return { text: 'Below', color: 'text-red-600 dark:text-red-400' };
}

function TechSkeleton() {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i} className="py-3 px-4"><Skeleton className="h-16 w-full" /></Card>
        ))}
      </div>
      <Card className="py-3 px-4"><Skeleton className="h-48 w-full" /></Card>
    </div>
  );
}

export default function TechnicalAnalysisSection({ symbol }: TechnicalAnalysisSectionProps) {
  const [data, setData] = useState<TechData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchTech = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/market-data/technical-analysis?symbols=${encodeURIComponent(symbol)}`, { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      const techMap = json as Record<string, TechData>;
      setData(techMap[symbol] || null);
    } catch (err) {
      console.error('Technical analysis error:', err);
      setError('Failed to load technical analysis');
    } finally {
      setLoading(false);
    }
  }, [symbol]);

  useEffect(() => {
    void fetchTech();
  }, [fetchTech]);

  if (loading) return <TechSkeleton />;
  if (error) {
    return (
      <Card className="border-red-200 dark:border-red-800">
        <CardContent className="flex items-center justify-between py-4">
          <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
          <Button variant="outline" size="sm" onClick={() => void fetchTech()} className="gap-1.5">
            <RefreshCw className="size-3" /> Retry
          </Button>
        </CardContent>
      </Card>
    );
  }
  if (!data) return null;

  const rating = ratingLabel(data.recommendAll);
  const macdSig = macdSignalLabel(data.macd, data.macdSignal);

  // Support/resistance from SMA levels closest to price
  const mas = [
    { label: 'SMA20', value: data.sma20 },
    { label: 'SMA50', value: data.sma50 },
    { label: 'SMA100', value: data.sma100 },
    { label: 'SMA200', value: data.sma200 },
    { label: 'EMA20', value: data.ema20 },
    { label: 'EMA50', value: data.ema50 },
    { label: 'EMA100', value: data.ema100 },
    { label: 'EMA200', value: data.ema200 },
  ].filter(m => m.value > 0);

  // Sort MAs by distance from price
  const sortedMAs = [...mas].sort((a, b) => Math.abs(a.value - data.close) - Math.abs(b.value - data.close));

  return (
    <div className="space-y-4">
      {/* Top row: RSI, MACD, Rating, Signal */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* RSI */}
        <Card className="py-3 px-4">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium mb-2">RSI (14)</p>
          <div className="flex items-end gap-2">
            <span className="text-2xl font-bold font-mono tabular-nums">{data.rsi > 0 ? data.rsi.toFixed(1) : '—'}</span>
            {data.rsi > 0 && (
              <span className={`text-[10px] px-1.5 py-0.5 rounded ${data.rsi >= 70 ? 'bg-red-500/10 text-red-600' : data.rsi <= 30 ? 'bg-emerald-500/10 text-emerald-600' : 'text-muted-foreground'}`}>
                {data.rsi >= 70 ? 'Overbought' : data.rsi <= 30 ? 'Oversold' : 'Normal'}
              </span>
            )}
          </div>
          {data.rsi > 0 && (
            <div className="mt-2 h-1.5 bg-muted rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full ${rsiColor(data.rsi)}`}
                style={{ width: `${Math.min(100, data.rsi)}%` }}
              />
            </div>
          )}
        </Card>

        {/* MACD */}
        <Card className="py-3 px-4">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium mb-2">MACD Signal</p>
          <div className="flex items-end gap-2">
            <span className={`text-sm font-semibold ${macdSig.color}`}>{macdSig.text}</span>
          </div>
          <div className="mt-1 space-y-0.5">
            <p className="text-[11px] text-muted-foreground">
              MACD: <span className="font-mono tabular-nums text-foreground">{data.macd.toFixed(2)}</span>
            </p>
            <p className="text-[11px] text-muted-foreground">
              Signal: <span className="font-mono tabular-nums text-foreground">{data.macdSignal.toFixed(2)}</span>
            </p>
          </div>
        </Card>

        {/* Stochastic */}
        <Card className="py-3 px-4">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium mb-2">Stochastic</p>
          <div className="flex items-end gap-2">
            <span className="text-lg font-bold font-mono tabular-nums">
              K: {data.stochK > 0 ? data.stochK.toFixed(1) : '—'}
            </span>
            <span className="text-lg font-bold font-mono tabular-nums text-muted-foreground">
              D: {data.stochD > 0 ? data.stochD.toFixed(1) : '—'}
            </span>
          </div>
          {data.stochK > 0 && (
            <p className={`text-[10px] mt-1 ${data.stochK >= 80 ? 'text-red-500' : data.stochK <= 20 ? 'text-emerald-500' : 'text-muted-foreground'}`}>
              {data.stochK >= 80 ? 'Overbought' : data.stochK <= 20 ? 'Oversold' : 'Normal'}
            </p>
          )}
        </Card>

        {/* Overall Rating */}
        <Card className="py-3 px-4">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium mb-2">Technical Rating</p>
          <Badge variant="outline" className={`text-xs ${rating.color}`}>
            {rating.label}
          </Badge>
          <div className="flex gap-3 mt-2">
            <div className="text-[11px] text-muted-foreground">
              MA: <span className={ratingLabel(data.recommendMA).color.includes('emerald') ? 'text-emerald-500' : ratingLabel(data.recommendMA).color.includes('red') ? 'text-red-500' : 'text-amber-500'}>
                {ratingLabel(data.recommendMA).label}
              </span>
            </div>
            <div className="text-[11px] text-muted-foreground">
              Osc: <span className={ratingLabel(data.recommendOther).color.includes('emerald') ? 'text-emerald-500' : ratingLabel(data.recommendOther).color.includes('red') ? 'text-red-500' : 'text-amber-500'}>
                {ratingLabel(data.recommendOther).label}
              </span>
            </div>
          </div>
        </Card>
      </div>

      {/* Moving Averages Table */}
      <Card className="py-3 px-4">
        <CardHeader className="pb-2 pt-0 px-0">
          <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
            <Activity className="size-3" />
            Moving Averages & Key Levels
          </CardTitle>
        </CardHeader>
        <CardContent className="px-0 pt-0">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {sortedMAs.map(ma => {
              const pos = maPosition(data.close, ma.value);
              return (
                <div key={ma.label} className="rounded-lg border px-3 py-2 bg-muted/30">
                  <p className="text-[10px] text-muted-foreground font-medium">{ma.label}</p>
                  <p className="text-sm font-mono font-semibold tabular-nums">{fmtCurrency(ma.value)}</p>
                  <p className={`text-[10px] font-medium ${pos.color}`}>
                    Price is {pos.text}
                  </p>
                </div>
              );
            })}
          </div>

          {/* BB and 52W */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-2">
            {data.bbUpper > 0 && (
              <div className="rounded-lg border px-3 py-2 bg-muted/30">
                <p className="text-[10px] text-muted-foreground font-medium">BB Upper</p>
                <p className="text-sm font-mono font-semibold tabular-nums">{fmtCurrency(data.bbUpper)}</p>
              </div>
            )}
            {data.bbLower > 0 && (
              <div className="rounded-lg border px-3 py-2 bg-muted/30">
                <p className="text-[10px] text-muted-foreground font-medium">BB Lower</p>
                <p className="text-sm font-mono font-semibold tabular-nums">{fmtCurrency(data.bbLower)}</p>
              </div>
            )}
            {data.atr > 0 && (
              <div className="rounded-lg border px-3 py-2 bg-muted/30">
                <p className="text-[10px] text-muted-foreground font-medium">ATR</p>
                <p className="text-sm font-mono font-semibold tabular-nums">{data.atr.toFixed(2)}</p>
              </div>
            )}
          </div>

          {/* 52W Range */}
          <div className="mt-3 pt-3 border-t">
            <div className="flex justify-between text-[11px] text-muted-foreground mb-1">
              <span>52W Low: <span className="font-mono text-foreground">{fmtCurrency(data.week52Low)}</span></span>
              <span>52W High: <span className="font-mono text-foreground">{fmtCurrency(data.week52High)}</span></span>
            </div>
            <div className="h-1.5 bg-muted rounded-full overflow-hidden relative">
              <div
                className="absolute h-full rounded-full bg-primary/40"
                style={{
                  left: `${data.week52High > data.week52Low ? ((data.week52Low) / data.week52High) * 100 : 0}%`,
                  right: '0%',
                }}
              />
              {data.week52High > data.week52Low && data.close > 0 && (
                <div
                  className="absolute h-full w-1 bg-primary rounded"
                  style={{
                    left: `${((data.close - data.week52Low) / (data.week52High - data.week52Low)) * 100}%`,
                  }}
                />
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
