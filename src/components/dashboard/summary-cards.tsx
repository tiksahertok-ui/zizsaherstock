'use client';

import {
  Wallet,
  TrendingUp,
  CalendarCheck,
  Trophy,
  ArrowDownRight,
  ArrowUpRight,
} from 'lucide-react';

import { Card, CardContent } from '@/components/ui/card';
import { fmtCurrency, pnlColor, pnlBgColor, fmtPercent } from '@/utils/formatters';
import type { PortfolioSummary } from '@/types';

interface SummaryCardsProps {
  summary: PortfolioSummary;
}

export function SummaryCards({ summary }: SummaryCardsProps) {
  const cards = [
    {
      label: 'Total Invested',
      value: fmtCurrency(summary.totalInvestment),
      sub: `${summary.numberOfHoldings} position${summary.numberOfHoldings !== 1 ? 's' : ''}`,
      icon: Wallet,
      iconBg: 'bg-emerald-100 dark:bg-emerald-900/40',
      iconColor: 'text-emerald-600 dark:text-emerald-400',
    },
    {
      label: 'Market Value',
      value: fmtCurrency(summary.totalMarketValue),
      sub: fmtPercent(summary.totalPnLPercent) + ' total P&L',
      subColor: pnlColor(summary.totalPnL),
      icon: TrendingUp,
      iconBg: 'bg-violet-100 dark:bg-violet-900/40',
      iconColor: 'text-violet-600 dark:text-violet-400',
    },
    {
      label: "Today's Change",
      value: fmtCurrency(Math.abs(summary.todaysChange)),
      valuePrefix: summary.todaysChange >= 0 ? '+' : '-',
      valueColor: pnlColor(summary.todaysChange),
      sub: fmtPercent(summary.todaysChangePercent),
      subColor: pnlColor(summary.todaysChange),
      icon: CalendarCheck,
      iconBg: summary.todaysChange >= 0
        ? 'bg-emerald-100 dark:bg-emerald-900/40'
        : 'bg-red-100 dark:bg-red-900/40',
      iconColor: summary.todaysChange >= 0
        ? 'text-emerald-600 dark:text-emerald-400'
        : 'text-red-600 dark:text-red-400',
      trendIcon: summary.todaysChange >= 0 ? ArrowUpRight : ArrowDownRight,
      trendColor: pnlColor(summary.todaysChange),
    },
    {
      label: 'Best Performer',
      value: summary.bestPerformer?.symbol ?? '—',
      valueSize: 'text-lg',
      sub: summary.bestPerformer
        ? `${summary.bestPerformer.name} · ${fmtPercent(summary.bestPerformer.pnlPercent)}`
        : 'No holdings yet',
      subColor: summary.bestPerformer ? pnlColor(summary.bestPerformer.pnlPercent) : 'text-muted-foreground',
      icon: Trophy,
      iconBg: 'bg-amber-100 dark:bg-amber-900/40',
      iconColor: 'text-amber-600 dark:text-amber-400',
    },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
      {cards.map((card) => (
        <Card key={card.label} className="overflow-hidden border-border/60 bg-card/80">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                {card.label}
              </span>
              <div className={`w-7 h-7 rounded-lg ${card.iconBg} flex items-center justify-center`}>
                <card.icon className={`w-3.5 h-3.5 ${card.iconColor}`} />
              </div>
            </div>

            <div className="flex items-baseline gap-1.5">
              {card.valuePrefix && (
                <span className={`text-sm font-semibold ${card.valueColor}`}>
                  {card.valuePrefix}
                </span>
              )}
              <span
                className={`font-bold ${card.valueSize ?? 'text-base sm:text-lg'} ${
                  card.valueColor ?? ''
                }`}
              >
                {card.value}
              </span>
              {card.trendIcon && (
                <card.trendIcon className={`w-4 h-4 ${card.trendColor}`} />
              )}
            </div>

            <p className={`text-xs mt-1 font-medium ${card.subColor ?? 'text-muted-foreground'}`}>
              {card.sub}
            </p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
