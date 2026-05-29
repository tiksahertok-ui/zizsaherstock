'use client';

import { useMemo } from 'react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
  Legend,
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

import { fmtCurrency, pnlColor } from '@/utils/formatters';
import { aggregateBySector } from '@/utils/stock-data';
import type { StoredHolding, StockPerformance, IndexData } from '@/types';

// ── Color palettes ────────────────────────────────────────────

const ALLOCATION_COLORS = [
  '#10b981', '#8b5cf6', '#f59e0b', '#ef4444', '#06b6d4',
  '#ec4899', '#84cc16', '#f97316', '#6366f1', '#14b8a6',
  '#e11d48', '#a855f7', '#0ea5e9', '#22c55e', '#eab308',
];

const CHART_COLORS = {
  positive: '#10b981',
  negative: '#ef4444',
  grid: 'hsl(var(--border))',
  text: 'hsl(var(--muted-foreground))',
};

// ── Props ─────────────────────────────────────────────────────

interface PortfolioChartsProps {
  holdings: StoredHolding[];
  perfData: Record<string, StockPerformance>;
  indexData: IndexData[];
}

// ── Custom Tooltip ────────────────────────────────────────────

function ChartTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ value: number; name?: string; color?: string }>; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border bg-background p-2.5 shadow-lg">
      {label && <p className="text-xs text-muted-foreground mb-1">{label}</p>}
      {payload.map((entry, i) => (
        <div key={i} className="flex items-center gap-2 text-xs">
          <div className="w-2 h-2 rounded-full" style={{ backgroundColor: entry.color }} />
          <span className="font-semibold">{fmtCurrency(entry.value)}</span>
          {entry.name && <span className="text-muted-foreground">({entry.name})</span>}
        </div>
      ))}
    </div>
  );
}

function PercentTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ value: number; name?: string; color?: string }>; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border bg-background p-2.5 shadow-lg">
      {label && <p className="text-xs text-muted-foreground mb-1">{label}</p>}
      {payload.map((entry, i) => (
        <div key={i} className="flex items-center gap-2 text-xs">
          <div className="w-2 h-2 rounded-full" style={{ backgroundColor: entry.color }} />
          <span className="font-semibold">{entry.value.toFixed(2)}%</span>
          {entry.name && <span className="text-muted-foreground">({entry.name})</span>}
        </div>
      ))}
    </div>
  );
}

// ── Performance Chart ─────────────────────────────────────────

function PerformanceChart({ holdings, perfData }: { holdings: StoredHolding[]; perfData: Record<string, StockPerformance> }) {
  const chartData = useMemo(() => {
    if (holdings.length === 0 || Object.keys(perfData).length === 0) return [];

    // Aggregate portfolio performance over time
    const allDates = new Set<string>();
    const holdingPerfs = holdings
      .filter(h => perfData[h.symbol])
      .map(h => ({ holding: h, perf: perfData[h.symbol] }));

    if (holdingPerfs.length === 0) return [];

    for (const { perf } of holdingPerfs) {
      for (const date of Object.keys(perf.returns)) {
        allDates.add(date);
      }
    }

    const sortedDates = Array.from(allDates).sort();
    const totalValue = holdings.reduce((s, h) => s + h.marketValue, 0);

    return sortedDates.map(date => {
      const totalReturn = holdingPerfs.reduce((sum, { holding, perf }) => {
        const weight = totalValue > 0 ? holding.marketValue / totalValue : 0;
        return sum + (perf.returns[date] ?? 0) * weight;
      }, 0);

      return {
        date: new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        return: Math.round(totalReturn * 100) / 100,
      };
    });
  }, [holdings, perfData]);

  if (chartData.length === 0) {
    return (
      <div className="h-[280px] flex items-center justify-center text-sm text-muted-foreground">
        No performance data yet
      </div>
    );
  }

  const isPositive = (chartData[chartData.length - 1]?.return ?? 0) >= 0;
  const strokeColor = isPositive ? CHART_COLORS.positive : CHART_COLORS.negative;

  return (
    <ResponsiveContainer width="100%" height={280}>
      <AreaChart data={chartData} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
        <defs>
          <linearGradient id="perfGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={strokeColor} stopOpacity={0.3} />
            <stop offset="100%" stopColor={strokeColor} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke={CHART_COLORS.grid} opacity={0.5} />
        <XAxis dataKey="date" tick={{ fontSize: 10, fill: CHART_COLORS.text }} tickLine={false} axisLine={false} />
        <YAxis tick={{ fontSize: 10, fill: CHART_COLORS.text }} tickLine={false} axisLine={false} tickFormatter={(v: number) => `${v.toFixed(1)}%`} />
        <Tooltip content={<PercentTooltip />} />
        <Area type="monotone" dataKey="return" stroke={strokeColor} fill="url(#perfGradient)" strokeWidth={2} name="Portfolio" />
      </AreaChart>
    </ResponsiveContainer>
  );
}

// ── Allocation Chart ──────────────────────────────────────────

function AllocationChart({ holdings }: { holdings: StoredHolding[] }) {
  const sectors = useMemo(() => aggregateBySector(holdings), [holdings]);

  if (sectors.length === 0) {
    return (
      <div className="h-[280px] flex items-center justify-center text-sm text-muted-foreground">
        Add holdings to see allocation
      </div>
    );
  }

  const data = sectors.map((s, i) => ({
    name: s.sector,
    value: Math.round(s.percent * 10) / 10,
    fill: ALLOCATION_COLORS[i % ALLOCATION_COLORS.length],
  }));

  return (
    <div className="flex flex-col items-center">
      <ResponsiveContainer width="100%" height={220}>
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            innerRadius={50}
            outerRadius={90}
            paddingAngle={2}
            dataKey="value"
          >
            {data.map((entry, i) => (
              <Cell key={i} fill={entry.fill} />
            ))}
          </Pie>
          <Tooltip content={({ active, payload }) => {
            if (!active || !payload?.[0]) return null;
            const entry = payload[0].payload;
            return (
              <div className="rounded-lg border bg-background p-2.5 shadow-lg text-xs">
                <div className="flex items-center gap-2 mb-1">
                  <div className="w-2 h-2 rounded-full" style={{ backgroundColor: entry.fill }} />
                  <span className="font-semibold">{entry.name}</span>
                </div>
                <span className="text-muted-foreground">{entry.value}%</span>
              </div>
            );
          }} />
        </PieChart>
      </ResponsiveContainer>
      {/* Legend */}
      <div className="flex flex-wrap justify-center gap-x-3 gap-y-1 mt-2">
        {data.map((entry, i) => (
          <div key={i} className="flex items-center gap-1.5 text-[10px]">
            <div className="w-2 h-2 rounded-sm" style={{ backgroundColor: entry.fill }} />
            <span className="text-muted-foreground">{entry.name} ({entry.value}%)</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Benchmark Chart ───────────────────────────────────────────

function BenchmarkChart({ perfData }: { perfData: Record<string, StockPerformance> }) {
  const chartData = useMemo(() => {
    const egx30 = perfData['EGX30'];
    if (!egx30) return [];

    return Object.entries(egx30.returns)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, ret]) => ({
        date: new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        egx30: Math.round(ret * 100) / 100,
      }));
  }, [perfData]);

  if (chartData.length === 0) {
    return (
      <div className="h-[280px] flex items-center justify-center text-sm text-muted-foreground">
        No benchmark data yet
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={280}>
      <LineChart data={chartData} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={CHART_COLORS.grid} opacity={0.5} />
        <XAxis dataKey="date" tick={{ fontSize: 10, fill: CHART_COLORS.text }} tickLine={false} axisLine={false} />
        <YAxis tick={{ fontSize: 10, fill: CHART_COLORS.text }} tickLine={false} axisLine={false} tickFormatter={(v: number) => `${v.toFixed(1)}%`} />
        <Tooltip content={<PercentTooltip />} />
        <Legend wrapperStyle={{ fontSize: 11 }} />
        <Line type="monotone" dataKey="egx30" stroke="#f59e0b" strokeWidth={2} dot={false} name="EGX 30" />
      </LineChart>
    </ResponsiveContainer>
  );
}

// ── Main PortfolioCharts ─────────────────────────────────────

export function PortfolioCharts({ holdings, perfData, indexData }: PortfolioChartsProps) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      {/* Performance Chart */}
      <Card className="lg:col-span-2">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold">Portfolio Performance</CardTitle>
        </CardHeader>
        <CardContent>
          <PerformanceChart holdings={holdings} perfData={perfData} />
        </CardContent>
      </Card>

      {/* Allocation Chart */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold">Sector Allocation</CardTitle>
        </CardHeader>
        <CardContent>
          <AllocationChart holdings={holdings} />
        </CardContent>
      </Card>

      {/* Benchmark Comparison */}
      <Card className="lg:col-span-3">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold">Benchmark Comparison</CardTitle>
        </CardHeader>
        <CardContent>
          <BenchmarkChart perfData={perfData} />
        </CardContent>
      </Card>
    </div>
  );
}
