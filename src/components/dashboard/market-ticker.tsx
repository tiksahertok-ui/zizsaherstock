'use client';

import { TrendingUp, TrendingDown, BarChart3, DollarSign, Gem, CircleDot } from 'lucide-react';

import { fmtCurrency, fmtPercent, pnlColor } from '@/utils/formatters';
import type { IndexData, ExtrasData, PriceChange } from '@/types';

// ── Constants ──────────────────────────────────────────────────

const TICKER_NAME_COLORS: Record<string, string> = {
  EGX30: 'text-emerald-600 dark:text-emerald-400',
  EGX70_EWI: 'text-violet-600 dark:text-violet-400',
  EGX100_EWI: 'text-amber-600 dark:text-amber-400',
  'USD/EGP': 'text-sky-600 dark:text-sky-400',
  Gold: 'text-amber-500 dark:text-amber-400',
};

const INDEX_STYLES: Record<string, { icon: typeof BarChart3; iconBg: string }> = {
  EGX30: { icon: BarChart3, iconBg: 'bg-emerald-100 dark:bg-emerald-900/40' },
  EGX70_EWI: { icon: BarChart3, iconBg: 'bg-violet-100 dark:bg-violet-900/40' },
  EGX100_EWI: { icon: BarChart3, iconBg: 'bg-amber-100 dark:bg-amber-900/40' },
};

// ── StatusBadge ────────────────────────────────────────────────

function StatusBadge({ status, label }: { status: 'live' | 'closed'; label: string }) {
  return (
    <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-muted/60">
      <CircleDot className={`w-2.5 h-2.5 ${status === 'live' ? 'text-emerald-500 animate-pulse' : 'text-muted-foreground'}`} />
      <span className="text-[10px] font-semibold uppercase tracking-wider">
        {label} {status === 'live' ? 'Open' : 'Closed'}
      </span>
    </div>
  );
}

// ── MarketTicker Component ────────────────────────────────────

interface MarketTickerProps {
  indexData: IndexData[];
  extrasData: ExtrasData | null;
  goldEgpChanges: Record<string, PriceChange>;
  usdEgpClientChange: PriceChange;
  marketStatus?: ExtrasData['marketStatus'];
}

export function MarketTicker({
  indexData,
  extrasData,
  goldEgpChanges,
  usdEgpClientChange,
  marketStatus,
}: MarketTickerProps) {
  return (
    <div className="flex items-center gap-2 sm:gap-3 overflow-x-auto pb-1 scrollbar-none">
      {/* Market Status */}
      {marketStatus && (
        <StatusBadge status={marketStatus.egx} label="EGX" />
      )}

      {/* Indices */}
      {indexData.map((idx) => {
        const style = INDEX_STYLES[idx.symbol] ?? { icon: BarChart3, iconBg: 'bg-muted' };
        const Icon = style.icon;
        const isUp = idx.changePercent >= 0;

        return (
          <div
            key={idx.symbol}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-muted/40 border border-border/40 flex-shrink-0"
          >
            <div className={`w-6 h-6 rounded-md ${style.iconBg} flex items-center justify-center`}>
              <Icon className="w-3 h-3 text-foreground" />
            </div>
            <div className="flex flex-col">
              <span className={`text-[10px] font-bold uppercase tracking-wider ${TICKER_NAME_COLORS[idx.symbol] ?? 'text-foreground'}`}>
                {idx.name}
              </span>
              <div className="flex items-center gap-1">
                <span className="text-xs font-bold">{fmtNumber(idx.currentPrice, 2)}</span>
                {isUp ? (
                  <TrendingUp className="w-3 h-3 text-emerald-500" />
                ) : (
                  <TrendingDown className="w-3 h-3 text-red-500" />
                )}
                <span className={`text-[10px] font-semibold ${pnlColor(idx.changePercent)}`}>
                  {fmtPercent(idx.changePercent)}
                </span>
              </div>
            </div>
          </div>
        );
      })}

      {/* USD/EGP */}
      {extrasData && extrasData.usdEgp.rate > 0 && (
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-muted/40 border border-border/40 flex-shrink-0">
          <div className="w-6 h-6 rounded-md bg-sky-100 dark:bg-sky-900/40 flex items-center justify-center">
            <DollarSign className="w-3 h-3 text-sky-600 dark:text-sky-400" />
          </div>
          <div className="flex flex-col">
            <span className={`text-[10px] font-bold uppercase tracking-wider ${TICKER_NAME_COLORS['USD/EGP']}`}>
              USD/EGP
            </span>
            <div className="flex items-center gap-1">
              <span className="text-xs font-bold">{extrasData.usdEgp.rate.toFixed(2)}</span>
              {usdEgpClientChange.changePercent !== 0 && (
                <span className={`text-[10px] font-semibold ${pnlColor(usdEgpClientChange.changePercent)}`}>
                  {fmtPercent(usdEgpClientChange.changePercent)}
                </span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Gold 24K */}
      {extrasData && extrasData.gold.perGram24kEgp > 0 && (
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-muted/40 border border-border/40 flex-shrink-0">
          <div className="w-6 h-6 rounded-md bg-amber-100 dark:bg-amber-900/40 flex items-center justify-center">
            <Gem className="w-3 h-3 text-amber-600 dark:text-amber-400" />
          </div>
          <div className="flex flex-col">
            <span className={`text-[10px] font-bold uppercase tracking-wider ${TICKER_NAME_COLORS['Gold']}`}>
              Gold 24K/g
            </span>
            <div className="flex items-center gap-1">
              <span className="text-xs font-bold">{fmtCurrency(extrasData.gold.perGram24kEgp)}</span>
              {goldEgpChanges['24k'] && goldEgpChanges['24k'].changePercent !== 0 && (
                <span className={`text-[10px] font-semibold ${pnlColor(goldEgpChanges['24k'].changePercent)}`}>
                  {fmtPercent(goldEgpChanges['24k'].changePercent)}
                </span>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function fmtNumber(value: number, decimals: number): string {
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
}
