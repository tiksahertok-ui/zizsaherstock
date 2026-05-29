'use client';

import { Gem, TrendingUp, TrendingDown, ArrowDownUp } from 'lucide-react';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

import { fmtCurrency, pnlColor, pnlBgColor, fmtPercent } from '@/utils/formatters';
import type { ExtrasData, PriceChange } from '@/types';

interface GoldPanelProps {
  extrasData: ExtrasData | null;
  goldEgpChanges: Record<string, PriceChange>;
}

export function GoldPanel({ extrasData, goldEgpChanges }: GoldPanelProps) {
  if (!extrasData || !extrasData.gold) return null;

  const gold = extrasData.gold;

  const karatEntries = [
    { key: '24k', label: '24K', price: gold.perGram24kEgp, high: gold.perGram24kHigh, low: gold.perGram24kLow },
    { key: '21k', label: '21K', price: gold.perGram21kEgp, high: gold.perGram21kHigh, low: gold.perGram21kLow },
    { key: '22k', label: '22K', price: gold.karats['22']?.price ?? 0, high: gold.karats['22']?.high ?? 0, low: gold.karats['22']?.low ?? 0 },
    { key: '18k', label: '18K', price: gold.karats['18']?.price ?? 0, high: gold.karats['18']?.high ?? 0, low: gold.karats['18']?.low ?? 0 },
  ];

  const poundPrice = gold.goldPoundEgp ?? 0;
  const poundChange = gold.poundChangePercent ?? 0;

  return (
    <Card className="border-amber-200/50 dark:border-amber-900/30">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-amber-100 dark:bg-amber-900/40 flex items-center justify-center">
              <Gem className="w-4 h-4 text-amber-600 dark:text-amber-400" />
            </div>
            <div>
              <CardTitle className="text-sm">Gold Prices (EGP)</CardTitle>
              {gold.egpSource && (
                <p className="text-[10px] text-muted-foreground mt-0.5">Source: {gold.egpSource}</p>
              )}
            </div>
          </div>
          {gold.changePercent !== 0 && (
            <Badge
              variant="outline"
              className={`text-[10px] font-semibold px-1.5 py-0 ${pnlBgColor(gold.changePercent)}`}
            >
              {gold.changePercent > 0 ? <TrendingUp className="w-2.5 h-2.5 mr-0.5" /> : <TrendingDown className="w-2.5 h-2.5 mr-0.5" />}
              {fmtPercent(gold.changePercent)}
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Karat Grid */}
        <div className="grid grid-cols-2 gap-2">
          {karatEntries.map((k) => {
            if (k.price <= 0) return null;
            const change = goldEgpChanges[k.key];
            const isUp = (change?.changePercent ?? 0) >= 0;

            return (
              <div
                key={k.key}
                className="rounded-lg border bg-muted/30 p-3"
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-bold text-amber-600 dark:text-amber-400">{k.label}</span>
                  {change && change.changePercent !== 0 && (
                    <span className={`text-[10px] font-semibold ${pnlColor(change.changePercent)}`}>
                      {fmtPercent(change.changePercent)}
                    </span>
                  )}
                </div>
                <p className="text-sm font-bold">{fmtCurrency(k.price)}</p>
                <div className="flex items-center gap-2 mt-1 text-[10px] text-muted-foreground">
                  {k.high > 0 && <span>H: {fmtCurrency(k.high)}</span>}
                  {k.low > 0 && <span>L: {fmtCurrency(k.low)}</span>}
                </div>
              </div>
            );
          })}
        </div>

        {/* Gold Pound */}
        {poundPrice > 0 && (
          <div className="rounded-lg border border-amber-200/50 dark:border-amber-900/30 bg-amber-50/50 dark:bg-amber-950/20 p-3">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-xs font-bold text-amber-600 dark:text-amber-400">Gold Pound</span>
                <p className="text-base font-bold mt-0.5">{fmtCurrency(poundPrice)}</p>
              </div>
              {poundChange !== 0 && (
                <Badge
                  variant="outline"
                  className={`text-[10px] font-semibold px-1.5 py-0 ${pnlBgColor(poundChange)}`}
                >
                  {fmtPercent(poundChange)}
                </Badge>
              )}
            </div>
          </div>
        )}

        {/* USD Gold reference */}
        {gold.usdPrice > 0 && (
          <div className="flex items-center justify-between text-xs text-muted-foreground pt-1 border-t">
            <span>XAUUSD (USD/oz)</span>
            <div className="flex items-center gap-2">
              <span className="font-semibold text-foreground">${gold.usdPrice.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
              {gold.usdChangePercent !== 0 && (
                <span className={`font-semibold ${pnlColor(gold.usdChangePercent)}`}>
                  {fmtPercent(gold.usdChangePercent)}
                </span>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
