'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { RefreshCw, Info } from 'lucide-react';
import { fmtCurrency } from '@/utils/formatters';

interface SensitivityMatrixProps {
  symbol: string;
}

interface SensitivityResponse {
  symbol: string;
  currentPrice: number;
  baseWacc: number;
  baseGrowth: number;
  waccRates: number[];
  growthRates: number[];
  matrix: Array<{ wacc: number; growthRate: number; fairValue: number }>;
}

function cellColor(fairValue: number, currentPrice: number): string {
  if (fairValue <= 0) return 'bg-muted text-muted-foreground';
  const upside = ((fairValue - currentPrice) / currentPrice) * 100;
  if (upside > 50) return 'bg-emerald-500/30 text-emerald-800 dark:text-emerald-200';
  if (upside > 25) return 'bg-emerald-500/20 text-emerald-800 dark:text-emerald-200';
  if (upside > 10) return 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300';
  if (upside > -10) return 'bg-amber-500/10 text-amber-700 dark:text-amber-300';
  if (upside > -25) return 'bg-red-500/10 text-red-700 dark:text-red-300';
  return 'bg-red-500/20 text-red-800 dark:text-red-200';
}

function isBaseCase(wacc: number, growthRate: number, baseWacc: number, baseGrowth: number): boolean {
  return Math.abs(wacc - baseWacc) < 0.03 && Math.abs(growthRate - baseGrowth) < 0.03;
}

function MatrixSkeleton() {
  return (
    <Card className="py-3 px-4">
      <Skeleton className="h-6 w-48 mb-3" />
      <Skeleton className="h-72 w-full" />
    </Card>
  );
}

export default function SensitivityMatrix({ symbol }: SensitivityMatrixProps) {
  const [data, setData] = useState<SensitivityResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchSensitivity = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/analysis/sensitivity?symbol=${encodeURIComponent(symbol)}`, { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setData(json);
    } catch (err) {
      console.error('Sensitivity fetch error:', err);
      setError('Failed to load sensitivity data');
    } finally {
      setLoading(false);
    }
  }, [symbol]);

  useEffect(() => {
    void fetchSensitivity();
  }, [fetchSensitivity]);

  if (loading) return <MatrixSkeleton />;
  if (error) {
    return (
      <Card className="border-red-200 dark:border-red-800">
        <CardContent className="flex items-center justify-between py-4">
          <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
          <Button variant="outline" size="sm" onClick={() => void fetchSensitivity()} className="gap-1.5">
            <RefreshCw className="size-3" /> Retry
          </Button>
        </CardContent>
      </Card>
    );
  }
  if (!data) return null;

  const { waccRates, growthRates, matrix, currentPrice, baseWacc, baseGrowth } = data;

  return (
    <Card className="py-3 px-4">
      <CardHeader className="pb-2 pt-0 px-0">
        <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
          <Info className="size-3" />
          DCF Sensitivity Analysis
          <span className="text-[10px] font-normal ml-auto">
            Current Price: {fmtCurrency(currentPrice)} · Base WACC: {(baseWacc * 100).toFixed(0)}% · Base Growth: {(baseGrowth * 100).toFixed(0)}%
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="px-0 pt-0">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr>
                <th className="px-2 py-1.5 text-left text-[10px] text-muted-foreground font-medium border-b">
                  WACC ↓ / Growth →
                </th>
                <th className="px-2 py-1.5 text-right text-[10px] text-muted-foreground font-medium border-b" colSpan={1}>
                  Current Price
                </th>
                {growthRates.map(g => (
                  <th key={g} className="px-2 py-1.5 text-right text-[10px] text-muted-foreground font-medium border-b">
                    {(g * 100).toFixed(1)}%
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {waccRates.map(wacc => (
                <tr key={wacc}>
                  <td className="px-2 py-1.5 text-left text-[10px] font-medium text-muted-foreground border-b border-r">
                    {(wacc * 100).toFixed(0)}%
                  </td>
                  {growthRates.map(growth => {
                    const cell = matrix.find(m => m.wacc === wacc && m.growthRate === growth);
                    const fv = cell?.fairValue || 0;
                    const isBase = isBaseCase(wacc, growth, baseWacc, baseGrowth);
                    return (
                      <td
                        key={growth}
                        className={`px-2 py-1.5 text-right font-mono tabular-nums font-medium border-b min-w-[80px] ${cellColor(fv, currentPrice)} ${isBase ? 'ring-2 ring-primary ring-inset' : ''}`}
                        title={`WACC: ${(wacc * 100).toFixed(0)}%, Growth: ${(growth * 100).toFixed(1)}%, FV: ${fmtCurrency(fv)}`}
                      >
                        {fv > 0 ? fmtCurrency(fv) : '—'}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Legend */}
        <div className="flex items-center gap-4 mt-3 pt-2 border-t">
          <div className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-sm bg-emerald-500/20" />
            <span className="text-[10px] text-muted-foreground">Undervalued</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-sm bg-amber-500/20" />
            <span className="text-[10px] text-muted-foreground">Fair Range</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-sm bg-red-500/20" />
            <span className="text-[10px] text-muted-foreground">Overvalued</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-sm ring-2 ring-primary" />
            <span className="text-[10px] text-muted-foreground">Base Case</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
