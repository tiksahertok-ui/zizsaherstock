'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  BarChart3, TrendingUp, TrendingDown, Target, Activity, Loader2,
} from 'lucide-react';

import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import StockScreener from '@/components/analysis/stock-screener';
import { fmtPercent, pnlColor } from '@/utils/formatters';

// ── Types ──────────────────────────────────────────────────────

interface ScreenerSummary {
  total: number;
  undervalued: number;
  fairlyValued: number;
  overvalued: number;
  highConfidence: number;
}

// ── Stats Card Skeleton ─────────────────────────────────────────

function StatsSkeleton() {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <Card key={i} className="py-4 px-5">
          <div className="flex items-center gap-3">
            <Skeleton className="size-10 rounded-lg" />
            <div className="space-y-1.5">
              <Skeleton className="h-3 w-16" />
              <Skeleton className="h-6 w-12" />
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────

export default function AnalysisPage() {
  const [summary, setSummary] = useState<ScreenerSummary | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchSummary = useCallback(async () => {
    try {
      const res = await fetch('/api/analysis/screener?limit=100&sort=upside', { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        setSummary(data.summary || null);
      }
    } catch (err) {
      console.error('Summary fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchSummary();
  }, [fetchSummary]);

  // Calculate avg upside for undervalued stocks (derived from screener data later)
  const avgUpside = summary ? 0 : 0;

  return (
    <main className="min-h-screen bg-background">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {/* Header */}
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <div className="size-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <BarChart3 className="size-5 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">EGX Financial Analysis</h1>
              <p className="text-sm text-muted-foreground">
                Multi-model fair value analysis across 220 Egyptian stocks
              </p>
            </div>
          </div>
        </div>

        {/* Summary Stats */}
        {loading ? (
          <StatsSkeleton />
        ) : summary ? (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <Card className="py-4 px-5">
              <div className="flex items-center gap-3">
                <div className="size-10 rounded-lg bg-blue-500/10 flex items-center justify-center">
                  <Activity className="size-5 text-blue-600 dark:text-blue-400" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium">
                    Total Analyzed
                  </p>
                  <p className="text-2xl font-bold tabular-nums leading-none">
                    {summary.total}
                  </p>
                </div>
              </div>
            </Card>

            <Card className="py-4 px-5">
              <div className="flex items-center gap-3">
                <div className="size-10 rounded-lg bg-emerald-500/10 flex items-center justify-center">
                  <TrendingUp className="size-5 text-emerald-600 dark:text-emerald-400" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium">
                    Undervalued
                  </p>
                  <p className="text-2xl font-bold tabular-nums leading-none text-emerald-600 dark:text-emerald-400">
                    {summary.undervalued}
                  </p>
                  {summary.total > 0 && (
                    <p className="text-[10px] text-muted-foreground tabular-nums">
                      {((summary.undervalued / summary.total) * 100).toFixed(0)}% of total
                    </p>
                  )}
                </div>
              </div>
            </Card>

            <Card className="py-4 px-5">
              <div className="flex items-center gap-3">
                <div className="size-10 rounded-lg bg-amber-500/10 flex items-center justify-center">
                  <Target className="size-5 text-amber-600 dark:text-amber-400" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium">
                    Fairly Valued
                  </p>
                  <p className="text-2xl font-bold tabular-nums leading-none text-amber-600 dark:text-amber-400">
                    {summary.fairlyValued}
                  </p>
                  {summary.total > 0 && (
                    <p className="text-[10px] text-muted-foreground tabular-nums">
                      {((summary.fairlyValued / summary.total) * 100).toFixed(0)}% of total
                    </p>
                  )}
                </div>
              </div>
            </Card>

            <Card className="py-4 px-5">
              <div className="flex items-center gap-3">
                <div className="size-10 rounded-lg bg-red-500/10 flex items-center justify-center">
                  <TrendingDown className="size-5 text-red-600 dark:text-red-400" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium">
                    Overvalued
                  </p>
                  <p className="text-2xl font-bold tabular-nums leading-none text-red-600 dark:text-red-400">
                    {summary.overvalued}
                  </p>
                  {summary.total > 0 && (
                    <p className="text-[10px] text-muted-foreground tabular-nums">
                      {((summary.overvalued / summary.total) * 100).toFixed(0)}% of total
                    </p>
                  )}
                </div>
              </div>
            </Card>
          </div>
        ) : null}

        {/* Stock Screener */}
        <StockScreener />
      </div>
    </main>
  );
}
