'use client';

import React from 'react';
import {
  DollarSign, TrendingUp, Heart, BarChart3, Activity, Banknote,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { fmtNumber, fmtPercent, fmtCurrency } from '@/utils/formatters';
import type { FundamentalData } from '@/lib/fundamentals';

// ── Types ──────────────────────────────────────────────────────

interface RatioDashboardProps {
  data: FundamentalData | null;
}

// ── Helpers ─────────────────────────────────────────────────────

type Indicator = 'good' | 'ok' | 'bad' | 'neutral';

function indicatorColor(v: Indicator): string {
  switch (v) {
    case 'good': return 'text-emerald-600 dark:text-emerald-400';
    case 'ok': return 'text-amber-600 dark:text-amber-400';
    case 'bad': return 'text-red-600 dark:text-red-400';
    default: return 'text-muted-foreground';
  }
}

function indicatorBg(v: Indicator): string {
  switch (v) {
    case 'good': return 'bg-emerald-500/8';
    case 'ok': return 'bg-amber-500/8';
    case 'bad': return 'bg-red-500/8';
    default: return '';
  }
}

function ratioIndicator(value: number, thresholds: { good: [number, number]; ok: [number, number] }): Indicator {
  const { good, ok } = thresholds;
  if (value >= good[0] && value <= good[1]) return 'good';
  if (value >= ok[0] && value <= ok[1]) return 'ok';
  return 'bad';
}

// ── Ratio Item ──────────────────────────────────────────────────

interface RatioItem {
  label: string;
  value: number;
  format: 'number' | 'percent' | 'currency';
  indicator: Indicator;
}

function RatioCard({
  title,
  icon,
  items,
}: {
  title: string;
  icon: React.ReactNode;
  items: RatioItem[];
}) {
  return (
    <Card className="py-3 px-4">
      <CardHeader className="pb-0 pt-0 px-0 gap-1">
        <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
          {icon}
          <span className="uppercase tracking-wider">{title}</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="px-0 pt-2">
        <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
          {items.map(item => (
            <div key={item.label} className={`rounded px-2 py-1.5 ${indicatorBg(item.indicator)}`}>
              <p className="text-[10px] text-muted-foreground leading-tight">{item.label}</p>
              <p className={`text-sm font-mono font-semibold tabular-nums leading-tight ${indicatorColor(item.indicator)}`}>
                {item.value === 0 ? '—' : (
                  item.format === 'percent'
                    ? `${item.value.toFixed(1)}%`
                    : item.format === 'currency'
                      ? fmtCurrency(item.value)
                      : fmtNumber(item.value)
                )}
              </p>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

// ── Build ratio items from FundamentalData ─────────────────────

function buildRatios(f: FundamentalData): Array<{
  title: string;
  icon: React.ReactNode;
  items: RatioItem[];
}> {
  return [
    // ── Valuation ──
    {
      title: 'Valuation',
      icon: <DollarSign className="size-3" />,
      items: [
        {
          label: 'P/E',
          value: f.pe,
          format: 'number',
          indicator: f.pe > 0 ? ratioIndicator(f.pe, { good: [5, 15], ok: [15, 25] }) : 'neutral',
        },
        {
          label: 'P/B',
          value: f.pb,
          format: 'number',
          indicator: f.pb > 0 ? ratioIndicator(f.pb, { good: [0.5, 2], ok: [2, 4] }) : 'neutral',
        },
        {
          label: 'EV/EBITDA',
          value: f.evEbitda,
          format: 'number',
          indicator: f.evEbitda > 0 ? ratioIndicator(f.evEbitda, { good: [4, 8], ok: [8, 15] }) : 'neutral',
        },
        {
          label: 'P/S',
          value: f.ps,
          format: 'number',
          indicator: f.ps > 0 ? ratioIndicator(f.ps, { good: [0.5, 2], ok: [2, 5] }) : 'neutral',
        },
        {
          label: 'PEG',
          value: f.peg,
          format: 'number',
          indicator: f.peg > 0 ? ratioIndicator(f.peg, { good: [0.5, 1], ok: [1, 2] }) : 'neutral',
        },
        {
          label: 'EPS',
          value: f.eps,
          format: 'currency',
          indicator: 'neutral',
        },
      ],
    },
    // ── Profitability ──
    {
      title: 'Profitability',
      icon: <TrendingUp className="size-3" />,
      items: [
        {
          label: 'Gross Margin',
          value: f.grossMargin,
          format: 'percent',
          indicator: f.grossMargin > 0 ? ratioIndicator(f.grossMargin, { good: [30, 100], ok: [15, 30] }) : 'neutral',
        },
        {
          label: 'Op. Margin',
          value: f.operatingMargin,
          format: 'percent',
          indicator: f.operatingMargin > 0 ? ratioIndicator(f.operatingMargin, { good: [15, 100], ok: [5, 15] }) : 'neutral',
        },
        {
          label: 'Net Margin',
          value: f.netMargin,
          format: 'percent',
          indicator: f.netMargin > 0 ? ratioIndicator(f.netMargin, { good: [10, 100], ok: [3, 10] }) : 'neutral',
        },
        {
          label: 'ROE',
          value: f.roe,
          format: 'percent',
          indicator: f.roe > 0 ? ratioIndicator(f.roe, { good: [15, 100], ok: [8, 15] }) : 'neutral',
        },
        {
          label: 'ROA',
          value: f.roa,
          format: 'percent',
          indicator: f.roa > 0 ? ratioIndicator(f.roa, { good: [5, 100], ok: [2, 5] }) : 'neutral',
        },
      ],
    },
    // ── Growth ──
    {
      title: 'Growth',
      icon: <Activity className="size-3" />,
      items: [
        {
          label: 'Revenue Gr.',
          value: f.revenueGrowth,
          format: 'percent',
          indicator: f.revenueGrowth !== 0 ? ratioIndicator(f.revenueGrowth, { good: [10, 100], ok: [0, 10] }) : 'neutral',
        },
        {
          label: 'Earnings Gr.',
          value: f.earningsGrowth,
          format: 'percent',
          indicator: f.earningsGrowth !== 0 ? ratioIndicator(f.earningsGrowth, { good: [10, 100], ok: [0, 10] }) : 'neutral',
        },
      ],
    },
    // ── Financial Health ──
    {
      title: 'Financial Health',
      icon: <Heart className="size-3" />,
      items: [
        {
          label: 'Debt/Equity',
          value: f.debtEquity,
          format: 'number',
          indicator: f.debtEquity >= 0 ? ratioIndicator(f.debtEquity, { good: [0, 0.5], ok: [0.5, 2] }) : 'neutral',
        },
        {
          label: 'Div. Yield',
          value: f.dividendYield,
          format: 'percent',
          indicator: f.dividendYield > 0 ? ratioIndicator(f.dividendYield, { good: [3, 100], ok: [1, 3] }) : 'neutral',
        },
        {
          label: 'Payout Ratio',
          value: f.payoutRatio,
          format: 'percent',
          indicator: f.payoutRatio > 0 ? ratioIndicator(f.payoutRatio, { good: [20, 60], ok: [0, 20] }) : 'neutral',
        },
      ],
    },
    // ── Cash Flow ──
    {
      title: 'Cash Flow',
      icon: <Banknote className="size-3" />,
      items: [
        {
          label: 'Free CF',
          value: f.freeCashFlow,
          format: 'currency',
          indicator: f.freeCashFlow > 0 ? 'good' : f.freeCashFlow < 0 ? 'bad' : 'neutral',
        },
        {
          label: 'Op. CF',
          value: f.operatingCashFlow,
          format: 'currency',
          indicator: f.operatingCashFlow > 0 ? 'good' : f.operatingCashFlow < 0 ? 'bad' : 'neutral',
        },
      ],
    },
  ];
}

// ── Skeleton ────────────────────────────────────────────────────

function DashboardSkeleton() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {Array.from({ length: 5 }).map((_, i) => (
        <Card key={i} className="py-3 px-4">
          <div className="flex items-center gap-1.5 mb-2">
            <Skeleton className="size-3 rounded" />
            <Skeleton className="h-3 w-20" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            {Array.from({ length: 4 }).map((_, j) => (
              <div key={j} className="space-y-1">
                <Skeleton className="h-2.5 w-12" />
                <Skeleton className="h-4 w-16" />
              </div>
            ))}
          </div>
        </Card>
      ))}
    </div>
  );
}

// ── Main Component ──────────────────────────────────────────────

export default function RatioDashboard({ data }: RatioDashboardProps) {
  if (!data) return <DashboardSkeleton />;

  const ratioGroups = buildRatios(data);

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {ratioGroups.map(group => (
        <RatioCard
          key={group.title}
          title={group.title}
          icon={group.icon}
          items={group.items}
        />
      ))}
    </div>
  );
}
