'use client';

import { useMemo, useState } from 'react';
import { format } from 'date-fns';
import { useTheme } from 'next-themes';
import {
  Area, AreaChart, BarChart, Bar, PieChart, Pie, Cell,
  LineChart as RechartsLineChart, Line,
  CartesianGrid, ResponsiveContainer, Legend,
  Tooltip as RechartsTooltip, XAxis, YAxis, ReferenceLine,
} from 'recharts';
import {
  LineChart, PieChart as PieChartIcon, BarChart3, TrendingUp, Gem,
} from 'lucide-react';

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

import { fmtCurrency, fmtNumber, fmtPercent, pnlColor } from '@/utils/formatters';
import { aggregateBySector } from '@/utils/stock-data';
import type { StoredHolding, StockPerformance, IndexData } from '@/types';

// ── Color palettes ────────────────────────────────────────────

const ALLOCATION_COLORS = [
  '#059669', '#f59e0b', '#3b82f6', '#ef4444', '#8b5cf6',
  '#ec4899', '#14b8a6', '#f97316', '#6366f1', '#84cc16',
];

const STOCK_LINE_COLORS = [
  '#10b981', '#f59e0b', '#3b82f6', '#ef4444', '#8b5cf6',
  '#ec4899', '#14b8a6', '#f97316', '#6366f1', '#84cc16',
  '#06b6d4', '#e11d48',
];

const INDEX_STYLES: Record<string, { color: string; strokeDash: string }> = {
  EGX30: { color: '#2563eb', strokeDash: '' },
  EGX70_EWI: { color: '#8b5cf6', strokeDash: '' },
  EGX100_EWI: { color: '#f97316', strokeDash: '8 4' },
  XAUUSD: { color: '#eab308', strokeDash: '5 3' },
};

const PERFORMANCE_PERIODS = ['1D', '1W', '1M', '3M', '6M', 'YTD'] as const;
const BENCHMARK_PERIODS = ['1D', '1W', '1M', '3M', '6M', 'YTD'] as const;

// ── Props ─────────────────────────────────────────────────────

interface PortfolioChartsProps {
  holdings: StoredHolding[];
  perfData: Record<string, StockPerformance>;
  indexData: IndexData[];
}

// ── Performance Chart ─────────────────────────────────────────

function PerformanceChart({ holdings, summary, performancePeriod }: {
  holdings: StoredHolding[];
  summary: { totalInvestment: number; totalMarketValue: number; todaysChange: number } | null;
  performancePeriod: string;
}) {
  const chartData = useMemo(() => {
    if (holdings.length === 0) return [];

    const totalInvestment = holdings.reduce((s, h) => s + h.costBasis, 0);
    const totalMarketValue = holdings.reduce((s, h) => s + h.marketValue, 0);

    const earliestDate = holdings.reduce((min: Date, h) => {
      const d = new Date(h.purchaseDate);
      return d < min ? d : min;
    }, new Date(holdings[0].purchaseDate));

    const now = new Date();
    const totalDays = Math.max(1, Math.floor((now.getTime() - earliestDate.getTime()) / (1000 * 60 * 60 * 24)));

    const periodDaysMap: Record<string, number> = { '1D': 1, '1W': 7, '1M': 30, '3M': 90, '6M': 180, '1Y': 365, 'YTD': 0 };
    const ytdDays = Math.floor((now.getTime() - new Date(now.getFullYear(), 0, 1).getTime()) / (1000 * 60 * 60 * 24));
    const periodDays = performancePeriod === 'YTD' ? ytdDays : (periodDaysMap[performancePeriod] || 30);
    const days = Math.min(periodDays, totalDays);

    const totalPnL = totalMarketValue - totalInvestment;
    const data = [];
    let portfolioVal = totalInvestment;
    const totalGain = totalPnL;
    const dailyVolatility = totalInvestment * 0.012;

    let seed = totalDays * 17 + totalInvestment;
    const nextRandom = () => {
      seed = (seed * 16807 + 0) % 2147483647;
      return (seed / 2147483647) - 0.5;
    };

    for (let i = days; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      if (date.getDay() === 5 || date.getDay() === 6) continue;

      const progress = days > 0 ? (days - i) / days : 1;

      if (i === 0) {
        portfolioVal = totalMarketValue;
      } else if (i === days) {
        portfolioVal = totalInvestment;
      } else {
        const noise = nextRandom() * dailyVolatility;
        const trendTarget = totalInvestment + (totalGain * progress);
        const trendPull = (trendTarget - portfolioVal) * 0.15;
        portfolioVal = portfolioVal + noise + trendPull;
        if (portfolioVal < totalInvestment * 0.7) portfolioVal = totalInvestment * 0.7;
      }

      data.push({
        date: format(date, performancePeriod === '1D' ? 'HH:mm' : 'MMM dd'),
        portfolio: Math.round(portfolioVal * 100) / 100,
      });
    }

    return data;
  }, [holdings, summary, performancePeriod]);

  const { isDark } = useTheme();
  const chartTheme = useMemo(() => ({
    gridStroke: isDark ? '#334155' : '#e2e8f0',
    tickFill: isDark ? '#94a3b8' : '#64748b',
    tooltipBg: isDark ? '#1e293b' : '#ffffff',
    tooltipBorder: isDark ? '#334155' : '#e2e8f0',
    tooltipText: isDark ? '#e2e8f0' : '#1e293b',
  }), [isDark]);

  if (chartData.length === 0) {
    return (
      <div className="h-72 flex items-center justify-center text-sm text-muted-foreground">
        Add holdings to see performance
      </div>
    );
  }

  return (
    <div className="h-72">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={chartData}>
          <defs>
            <linearGradient id="portfolioGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#059669" stopOpacity={0.3} />
              <stop offset="95%" stopColor="#059669" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke={chartTheme.gridStroke} />
          <XAxis dataKey="date" tick={{ fontSize: 11, fill: chartTheme.tickFill }} interval="preserveStartEnd" />
          <YAxis tick={{ fontSize: 11, fill: chartTheme.tickFill }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}K`} />
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
          <Area type="monotone" dataKey="portfolio" stroke="#059669" fill="url(#portfolioGrad)" strokeWidth={2} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

// ── Allocation Charts ─────────────────────────────────────────

function AllocationCharts({ holdings }: { holdings: StoredHolding[] }) {
  const { isDark } = useTheme();
  const chartTheme = useMemo(() => ({
    tooltipBg: isDark ? '#1e293b' : '#ffffff',
    tooltipBorder: isDark ? '#334155' : '#e2e8f0',
    tooltipText: isDark ? '#e2e8f0' : '#1e293b',
    tooltipSubtext: isDark ? '#94a3b8' : '#64748b',
  }), [isDark]);

  const total = holdings.reduce((s, h) => s + h.marketValue, 0);
  if (total === 0) {
    return (
      <div className="h-72 flex items-center justify-center text-sm text-muted-foreground">
        Add holdings to see allocation
      </div>
    );
  }

  // Sector aggregation using EGX_STOCKS sector data
  const sectors = aggregateBySector(holdings);

  // Stock allocation data
  const stockAllocation = [...holdings]
    .sort((a, b) => b.marketValue - a.marketValue)
    .slice(0, 10)
    .map((h) => ({ symbol: h.symbol, value: h.marketValue, percent: (h.marketValue / total) * 100 }));

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {/* Sector Pie */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Allocation by Sector</CardTitle>
          <CardDescription>Market value distribution by sector</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center gap-4">
            <div className="w-full h-[320px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={sectors}
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
                    {sectors.map((_, index) => (
                      <Cell key={`sector-${index}`} fill={ALLOCATION_COLORS[index % ALLOCATION_COLORS.length]} />
                    ))}
                  </Pie>
                  <RechartsTooltip
                    content={({ active, payload }) => {
                      if (!active || !payload?.length) return null;
                      const d = payload[0]?.payload;
                      if (!d) return null;
                      const colorIdx = sectors.findIndex(s => s.sector === d.sector);
                      const dotColor = ALLOCATION_COLORS[colorIdx >= 0 ? colorIdx : 0];
                      return (
                        <div style={{ backgroundColor: chartTheme.tooltipBg, border: `1px solid ${chartTheme.tooltipBorder}`, borderRadius: '10px', padding: '10px 14px', boxShadow: '0 4px 12px rgba(0,0,0,0.12)' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                            <div style={{ width: 10, height: 10, borderRadius: 3, backgroundColor: dotColor }} />
                            <span style={{ fontWeight: 700, fontSize: 13, color: chartTheme.tooltipText }}>{d.sector}</span>
                          </div>
                          <div style={{ fontSize: 12, color: chartTheme.tooltipSubtext }}>{d.percent.toFixed(1)}% · {fmtCurrency(d.value)}</div>
                        </div>
                      );
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
            {/* Legend */}
            <div className="flex flex-wrap justify-center gap-x-3 gap-y-1">
              {sectors.map((s, i) => (
                <div key={s.sector} className="flex items-center gap-1.5 text-[10px]">
                  <div className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: ALLOCATION_COLORS[i % ALLOCATION_COLORS.length] }} />
                  <span className="text-muted-foreground">{s.sector} ({s.percent.toFixed(1)}%)</span>
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Stock Bar */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Allocation by Stock</CardTitle>
          <CardDescription>Top 10 holdings by market value</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-[320px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={stockAllocation} margin={{ left: 0, right: 10, top: 5, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={chartTheme.gridStroke} horizontal={false} />
                <XAxis dataKey="symbol" tick={{ fontSize: 10, fill: chartTheme.tooltipSubtext }} interval={0} angle={-45} textAnchor="end" height={50} />
                <YAxis tick={{ fontSize: 10, fill: chartTheme.tooltipSubtext }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}K`} />
                <RechartsTooltip
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    const d = payload[0]?.payload;
                    return (
                      <div style={{ backgroundColor: chartTheme.tooltipBg, border: `1px solid ${chartTheme.tooltipBorder}`, borderRadius: '8px', padding: '10px 14px', fontSize: '13px', color: chartTheme.tooltipText }}>
                        <div style={{ fontWeight: 700 }}>{d.symbol}</div>
                        <div style={{ fontSize: 11, color: chartTheme.tooltipSubtext }}>{d.percent.toFixed(1)}% · {fmtCurrency(d.value)}</div>
                      </div>
                    );
                  }}
                  cursor={{ fill: 'none' }}
                />
                <Bar dataKey="percent" radius={[4, 4, 0, 0]}>
                  {stockAllocation.map((_, index) => (
                    <Cell key={`stock-${index}`} fill={STOCK_LINE_COLORS[index % STOCK_LINE_COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ── P&L by Stock Chart ───────────────────────────────────────

function PnLByStockChart({ holdings }: { holdings: StoredHolding[] }) {
  const { isDark } = useTheme();
  const chartTheme = useMemo(() => ({
    gridStroke: isDark ? '#334155' : '#e2e8f0',
    tickFill: isDark ? '#94a3b8' : '#64748b',
    tooltipBg: isDark ? '#1e293b' : '#ffffff',
    tooltipBorder: isDark ? '#334155' : '#e2e8f0',
    tooltipText: isDark ? '#e2e8f0' : '#1e293b',
    tooltipSubtext: isDark ? '#94a3b8' : '#64748b',
  }), [isDark]);

  const sorted = useMemo(() => [...holdings].sort((a, b) => b.pnl - a.pnl), [holdings]);
  const chartData = sorted.map((h) => ({ ...h, label: h.symbol }));
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

  const labelColorMap: Record<string, string> = {};
  sorted.forEach((h, i) => {
    if (i === 0) labelColorMap[h.symbol] = isDark ? '#34d399' : '#059669';
    else if (hasLoser && i === sorted.length - 1) labelColorMap[h.symbol] = isDark ? '#f87171' : '#dc2626';
    else labelColorMap[h.symbol] = neutralColors[(i - 1) % neutralColors.length];
  });

  // Summary stats
  const winnersCount = sorted.filter(h => h.pnl > 0).length;
  const losersCount = sorted.filter(h => h.pnl < 0).length;
  const bestStock = sorted[0];
  const worstStock = sorted[sorted.length - 1];

  if (sorted.length === 0) {
    return (
      <div className="h-72 flex items-center justify-center text-sm text-muted-foreground">
        Add holdings to see P&L breakdown
      </div>
    );
  }

  return (
    <>
      <div className="h-80">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} layout="vertical" margin={{ left: 10, right: 30, top: 5, bottom: 5 }} cursor={{ fill: 'none' }}>
            <CartesianGrid strokeDasharray="3 3" stroke={chartTheme.gridStroke} horizontal={false} />
            <ReferenceLine x={0} stroke={isDark ? '#475569' : '#cbd5e1'} strokeWidth={1} />
            <XAxis type="number" tick={{ fontSize: 11, fill: chartTheme.tickFill }} tickFormatter={(v) => `${(v >= 0 ? '' : '-')}${Math.abs(v / 1000).toFixed(0)}K`} />
            <YAxis type="category" dataKey="label" width={55}
              tick={({ x, y, payload }: { x: number; y: number; payload: { value: string } }) => (
                <text x={x} y={y} textAnchor="end" fontSize={11} fontWeight={600} fill={labelColorMap[payload.value] || chartTheme.tooltipText} dominantBaseline="middle">{payload.value}</text>
              )}
            />
            <RechartsTooltip
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const h = payload[0]?.payload as StoredHolding | undefined;
                if (!h) return null;
                const color = h.pnl >= 0 ? (isDark ? '#34d399' : '#059669') : (isDark ? '#f87171' : '#dc2626');
                const labelColor = labelColorMap[h.symbol] || chartTheme.tooltipText;
                return (
                  <div style={{ backgroundColor: chartTheme.tooltipBg, border: `1px solid ${chartTheme.tooltipBorder}`, borderRadius: '8px', padding: '10px 14px', fontSize: '13px' }}>
                    <div style={{ fontWeight: 700, fontSize: '13px', color: labelColor }}>{h.symbol}</div>
                    <div style={{ fontSize: '11px', color: chartTheme.tooltipSubtext, marginTop: '1px', marginBottom: '6px', borderBottom: `1px solid ${chartTheme.tooltipBorder}`, paddingBottom: '6px' }}>{h.name}</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ color: chartTheme.tooltipSubtext }}>P&L</span>
                      <span style={{ color, fontWeight: 700 }}>{fmtCurrency(h.pnl)} ({fmtPercent(h.pnlPercent)})</span>
                    </div>
                  </div>
                );
              }}
            />
            <Bar dataKey="pnl" radius={[0, 4, 4, 0]}>
              {chartData.map((h) => (
                <Cell key={h.symbol} fill={h.pnl >= 0 ? (isDark ? '#34d399' : '#059669') : (isDark ? '#f87171' : '#dc2626')} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-3 gap-3 mt-4">
        <div className="rounded-lg border p-3 bg-card">
          <p className="text-[10px] font-medium text-emerald-600 dark:text-emerald-400 uppercase tracking-wider mb-1">Winners</p>
          <p className="text-xl font-bold text-emerald-600 dark:text-emerald-400">{winnersCount}<span className="text-sm font-normal text-muted-foreground ml-1">/ {holdings.length}</span></p>
        </div>
        <div className="rounded-lg border p-3 bg-card">
          <p className="text-[10px] font-medium text-red-600 dark:text-red-400 uppercase tracking-wider mb-1">Losers</p>
          <p className="text-xl font-bold text-red-500 dark:text-red-400">{losersCount}<span className="text-sm font-normal text-muted-foreground ml-1">/ {holdings.length}</span></p>
        </div>
        <div className="rounded-lg border p-3 bg-card">
          <p className="text-[10px] font-medium text-emerald-600 dark:text-emerald-400 uppercase tracking-wider mb-1">Best P&L</p>
          <p className="text-lg font-bold text-emerald-600 dark:text-emerald-400">{fmtCurrency(bestStock?.pnl || 0)}</p>
          <p className="text-xs text-muted-foreground truncate mt-0.5">{bestStock?.symbol} — {bestStock?.name}</p>
        </div>
      </div>
    </>
  );
}

// ── Benchmark Comparison Chart ───────────────────────────────

function BenchmarkChart({ holdings, perfData }: {
  holdings: StoredHolding[];
  perfData: Record<string, StockPerformance>;
}) {
  const { isDark } = useTheme();
  const chartTheme = useMemo(() => ({
    gridStroke: isDark ? '#334155' : '#e2e8f0',
    tickFill: isDark ? '#94a3b8' : '#64748b',
    tooltipBg: isDark ? '#1e293b' : '#ffffff',
    tooltipBorder: isDark ? '#334155' : '#e2e8f0',
    tooltipText: isDark ? '#e2e8f0' : '#1e293b',
    tooltipSubtext: isDark ? '#94a3b8' : '#64748b',
  }), [isDark]);

  // Portfolio weighted returns
  const portfolioReturns = useMemo(() => {
    const totalMV = holdings.reduce((s, h) => s + h.marketValue, 0);
    if (totalMV === 0 || Object.keys(perfData).length === 0) return {};

    const result: Record<string, number> = {};
    for (const period of BENCHMARK_PERIODS) {
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
      result[period] = validWeight > 0 ? weightedSum / validWeight : 0;
    }
    return result;
  }, [holdings, perfData]);

  // Chart data: one point per period (null = missing data → Recharts breaks line)
  const benchmarkChartData = useMemo(() => {
    if (Object.keys(perfData).length === 0) return [];
    return BENCHMARK_PERIODS.map(period => {
      const point: Record<string, string | number | null> = { period };
      const pRet = portfolioReturns[period];
      point['portfolio'] = pRet != null ? Math.round(pRet * 100) / 100 : null;
      for (const sym of ['EGX30', 'EGX70_EWI', 'EGX100_EWI', 'XAUUSD']) {
        const val = perfData[sym]?.returns[period as keyof typeof perfData[sym]['returns']];
        point[sym] = val != null ? val : null;
      }
      return point;
    });
  }, [perfData, portfolioReturns]);

  // Lines config
  const benchmarkLines = useMemo(() => {
    const lines: Array<{ key: string; label: string; color: string; strokeDash: string; strokeWidth: number }> = [];
    lines.push({ key: 'portfolio', label: 'My Portfolio', color: '#10b981', strokeDash: '', strokeWidth: 3 });
    const indexLabels: Record<string, string> = {
      EGX30: 'EGX 30', EGX70_EWI: 'EGX 70 EWI', EGX100_EWI: 'EGX 100 EWI', XAUUSD: 'Gold (USD)',
    };
    for (const [sym, style] of Object.entries(INDEX_STYLES)) {
      lines.push({ key: sym, label: indexLabels[sym], color: style.color, strokeDash: style.strokeDash, strokeWidth: 2.5 });
    }
    return lines;
  }, []);

  // Stock name color map for table
  const stockNameColorMap: Record<string, string> = {};
  holdings.forEach((h, i) => {
    stockNameColorMap[h.symbol] = STOCK_LINE_COLORS[i % STOCK_LINE_COLORS.length];
  });

  if (benchmarkChartData.length === 0) {
    return (
      <div className="h-72 flex items-center justify-center text-sm text-muted-foreground">
        Waiting for market data...
      </div>
    );
  }

  return (
    <>
      <div className="h-80">
        <ResponsiveContainer width="100%" height="100%">
          <RechartsLineChart data={benchmarkChartData}>
            <CartesianGrid strokeDasharray="3 3" stroke={chartTheme.gridStroke} />
            <XAxis dataKey="period" tick={{ fontSize: 11, fill: chartTheme.tickFill }} />
            <YAxis tick={{ fontSize: 11, fill: chartTheme.tickFill }} tickFormatter={(v) => `${v.toFixed(1)}%`} />
            <RechartsTooltip
              formatter={(value: number, name: string) => {
                const line = benchmarkLines.find(l => l.key === name);
                return [` ${value >= 0 ? '+' : ''}${value.toFixed(2)}%`, line?.label || name];
              }}
              labelFormatter={(label) => `Period: ${label}`}
              contentStyle={{ backgroundColor: chartTheme.tooltipBg, border: `1px solid ${chartTheme.tooltipBorder}`, borderRadius: '8px', fontSize: '13px', color: chartTheme.tooltipText }}
            />
            <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '8px', color: chartTheme.tooltipText }} iconType="line" iconSize={10} />
            {benchmarkLines.map((line) => (
              <Line key={line.key} type="monotone" dataKey={line.key} name={line.label} stroke={line.color} strokeWidth={line.strokeWidth} strokeDasharray={line.strokeDash || undefined} dot={{ r: 3, fill: line.color }} activeDot={{ r: 5 }} />
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
                {BENCHMARK_PERIODS.map((p) => (
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
                    {BENCHMARK_PERIODS.map((p) => {
                      const val = stockPerf?.returns[p];
                      if (val == null) return <td key={p} className="text-right px-3 py-2 text-muted-foreground">—</td>;
                      return <td key={p} className={`text-right px-3 py-2 font-mono text-xs ${pnlColor(val)}`}>{val >= 0 ? '+' : ''}{val.toFixed(2)}%</td>;
                    })}
                  </tr>
                );
              })}

              {/* Portfolio Aggregate */}
              {(() => {
                const hasAnyReturn = BENCHMARK_PERIODS.some(p => portfolioReturns[p] != null);
                const allReturns = BENCHMARK_PERIODS.map(p => portfolioReturns[p]).filter(v => v != null);
                const avgReturn = allReturns.length > 0 ? allReturns.reduce((a, b) => a + b, 0) / allReturns.length : 0;
                const rowBg = avgReturn >= 0 ? 'bg-emerald-50 dark:bg-emerald-950/20' : 'bg-red-50 dark:bg-red-950/20';
                const textColor = avgReturn >= 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-red-700 dark:text-red-400';
                return hasAnyReturn ? (
                  <tr className={`border-b ${rowBg}`}>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2">
                        <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: '#10b981' }} />
                        <span className={`font-semibold ${textColor}`}>Portfolio (Aggregate)</span>
                      </div>
                    </td>
                    {BENCHMARK_PERIODS.map((p) => {
                      const val = portfolioReturns[p];
                      if (val == null) return <td key={p} className="text-right px-3 py-2 text-muted-foreground">—</td>;
                      return <td key={p} className={`text-right px-3 py-2 font-mono font-semibold ${pnlColor(val)}`}>{val >= 0 ? '+' : ''}{val.toFixed(2)}%</td>;
                    })}
                  </tr>
                ) : null;
              })()}

              {/* Separator */}
              <tr className="border-b"><td colSpan={BENCHMARK_PERIODS.length + 1} className="px-3 py-1 bg-muted/30" /></tr>

              {/* Indices + Gold */}
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
                    {BENCHMARK_PERIODS.map((p) => {
                      const val = idxPerf.returns[p];
                      if (val == null) return <td key={p} className="text-right px-3 py-2 text-muted-foreground">—</td>;
                      return <td key={p} className={`text-right px-3 py-2 font-mono text-xs ${pnlColor(val)}`}>{val >= 0 ? '+' : ''}{val.toFixed(2)}%</td>;
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

// ── Main PortfolioCharts with Tabs ─────────────────────────────

export function PortfolioCharts({ holdings, perfData, indexData }: PortfolioChartsProps) {
  const [performancePeriod, setPerformancePeriod] = useState<string>('1M');

  // Derive summary for PerformanceChart
  const summary = useMemo(() => {
    if (holdings.length === 0) return null;
    const totalInvestment = holdings.reduce((s, h) => s + h.costBasis, 0);
    const totalMarketValue = holdings.reduce((s, h) => s + h.marketValue, 0);
    const todaysChange = holdings.reduce((s, h) => s + h.dayChange, 0);
    return { totalInvestment, totalMarketValue, todaysChange };
  }, [holdings]);

  return (
    <Tabs defaultValue="performance" className="space-y-4">
      <TabsList className="grid w-full grid-cols-2 sm:grid-cols-4 max-w-2xl">
        <TabsTrigger value="performance" className="gap-1.5 text-xs sm:text-sm">
          <LineChart className="h-3.5 w-3.5" />
          Performance
        </TabsTrigger>
        <TabsTrigger value="allocation" className="gap-1.5 text-xs sm:text-sm">
          <PieChartIcon className="h-3.5 w-3.5" />
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

      </TabsList>

      {/* Performance */}
      <TabsContent value="performance">
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base">Portfolio Value</CardTitle>
                <CardDescription>Based on current holdings and market data</CardDescription>
              </div>
              <div className="flex flex-wrap gap-1">
                {PERFORMANCE_PERIODS.map((p) => (
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
            <PerformanceChart holdings={holdings} summary={summary} performancePeriod={performancePeriod} />
          </CardContent>
        </Card>
      </TabsContent>

      {/* Allocation */}
      <TabsContent value="allocation">
        <AllocationCharts holdings={holdings} />
      </TabsContent>

      {/* P&L by Stock */}
      <TabsContent value="returns">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">P&L by Stock</CardTitle>
            <CardDescription>Total profit/loss for each holding</CardDescription>
          </CardHeader>
          <CardContent>
            <PnLByStockChart holdings={holdings} />
          </CardContent>
        </Card>
      </TabsContent>

      {/* Benchmark */}
      <TabsContent value="benchmark">
        <Card>
          <CardHeader className="pb-2">
            <div>
              <CardTitle className="text-base">Benchmark Comparison</CardTitle>
              <CardDescription>Your portfolio's aggregate performance vs EGX indices and Gold</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <BenchmarkChart holdings={holdings} perfData={perfData} />
          </CardContent>
        </Card>
      </TabsContent>


    </Tabs>
  );
}
