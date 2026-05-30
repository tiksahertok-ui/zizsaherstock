'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft, Building2, TrendingUp, TrendingDown, Loader2,
  BarChart3, ExternalLink,
} from 'lucide-react';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';

import FairValueGauge from '@/components/analysis/fair-value-gauge';
import ValuationBreakdown from '@/components/analysis/valuation-breakdown';
import RatioDashboard from '@/components/analysis/ratio-dashboard';
import AIAnalysisCard from '@/components/analysis/ai-analysis-card';

import { fmtCurrency, fmtPercent, fmtNumber, pnlColor } from '@/utils/formatters';
import type { FairValueResult } from '@/lib/fair-value-engine';
import type { FundamentalData } from '@/lib/fundamentals';
import { EGX_STOCKS } from '@/lib/egx-stocks';

// ── Types ──────────────────────────────────────────────────────

interface CompanyData {
  fairValue: FairValueResult | null;
  fundamentals: FundamentalData | null;
}

// ── Header Skeleton ────────────────────────────────────────────

function HeaderSkeleton() {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <Skeleton className="h-8 w-8" />
        <Skeleton className="h-6 w-32" />
      </div>
      <div className="flex items-center gap-4">
        <Skeleton className="h-8 w-24" />
        <Skeleton className="h-8 w-16" />
        <Skeleton className="h-5 w-20 rounded" />
      </div>
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────

export default function CompanyAnalysisPage() {
  const params = useParams();
  const symbol = (params.symbol as string)?.toUpperCase() || '';

  const [data, setData] = useState<CompanyData>({ fairValue: null, fundamentals: null });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    if (!symbol) return;
    setLoading(true);
    setError(null);

    try {
      const [fvRes, fundRes] = await Promise.allSettled([
        fetch(`/api/analysis/fair-value?symbol=${encodeURIComponent(symbol)}`, { cache: 'no-store' }),
        fetch(`/api/analysis/fundamentals?symbols=${encodeURIComponent(symbol)}`, { cache: 'no-store' }),
      ]);

      let fvData: FairValueResult | null = null;
      let fundData: FundamentalData | null = null;

      if (fvRes.status === 'fulfilled' && fvRes.value.ok) {
        fvData = await fvRes.value.json();
      }

      if (fundRes.status === 'fulfilled' && fundRes.value.ok) {
        const fundMap = await fundRes.value.json();
        fundData = fundMap[symbol] || null;
      }

      setData({ fairValue: fvData, fundamentals: fundData });
    } catch (err) {
      console.error('Company data fetch error:', err);
      setError('Failed to load company data');
    } finally {
      setLoading(false);
    }
  }, [symbol]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  // Stock info from EGX_STOCKS
  const stockInfo = EGX_STOCKS.find(s => s.symbol === symbol);
  const name = data.fairValue?.name || stockInfo?.name || symbol;
  const sector = data.fairValue?.sector || stockInfo?.sector || '—';
  const price = data.fundamentals?.price || data.fairValue?.currentPrice || 0;
  const change = data.fundamentals?.change || 0;
  const marketCap = data.fundamentals?.marketCap || 0;

  return (
    <main className="min-h-screen bg-background">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {/* Back button */}
        <Link href="/analysis">
          <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground hover:text-foreground -ml-2">
            <ArrowLeft className="size-4" />
            Back to Analysis
          </Button>
        </Link>

        {/* Error State */}
        {error && !loading && (
          <Card className="border-red-200 dark:border-red-800">
            <CardContent className="flex items-center justify-between py-6">
              <div className="flex items-center gap-3">
                <TrendingDown className="size-5 text-red-500" />
                <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
              </div>
              <Button variant="outline" size="sm" onClick={() => void fetchData()}>
                Retry
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Company Header */}
        <Card className="py-4">
          <CardContent className="px-5">
            {loading ? (
              <HeaderSkeleton />
            ) : (
              <div className="space-y-3">
                {/* Title Row */}
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="size-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                      <Building2 className="size-5 text-primary" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <h1 className="text-xl font-bold tracking-tight">{name}</h1>
                        <Badge variant="secondary" className="font-mono text-xs">
                          {symbol}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-sm text-muted-foreground">{sector}</span>
                        {marketCap > 0 && (
                          <>
                            <span className="text-muted-foreground">·</span>
                            <span className="text-sm text-muted-foreground">
                              {marketCap >= 1e9
                                ? `${(marketCap / 1e9).toFixed(1)}B EGP`
                                : marketCap >= 1e6
                                  ? `${(marketCap / 1e6).toFixed(0)}M EGP`
                                  : fmtCurrency(marketCap)}
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Price Row */}
                {price > 0 && (
                  <div className="flex items-center gap-4 flex-wrap">
                    <span className="text-2xl font-bold font-mono tabular-nums">
                      {fmtCurrency(price)}
                    </span>
                    {change !== 0 && (
                      <span className={`text-sm font-semibold font-mono tabular-nums ${pnlColor(change)}`}>
                        {fmtPercent(change)}
                      </span>
                    )}
                    {data.fairValue?.status && data.fairValue.status !== 'N/A' && (
                      <>
                        <Separator orientation="vertical" className="h-6" />
                        <Badge
                          variant="outline"
                          className={
                            data.fairValue.status === 'Undervalued'
                              ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800'
                              : data.fairValue.status === 'Fairly Valued'
                                ? 'bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-800'
                                : 'bg-red-500/15 text-red-700 dark:text-red-400 border-red-200 dark:border-red-800'
                          }
                        >
                          {data.fairValue.status}
                        </Badge>
                      </>
                    )}
                    {data.fairValue?.confidence && (
                      <span className="text-xs text-muted-foreground">
                        Confidence: {data.fairValue.confidence} ({data.fairValue.activeModels}/{data.fairValue.totalModels} models)
                      </span>
                    )}
                  </div>
                )}

                {/* Quick Stats */}
                {data.fundamentals && (
                  <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-muted-foreground mt-1">
                    {data.fundamentals.pe > 0 && (
                      <span>P/E: <span className="text-foreground font-medium tabular-nums">{data.fundamentals.pe.toFixed(1)}</span></span>
                    )}
                    {data.fundamentals.pb > 0 && (
                      <span>P/B: <span className="text-foreground font-medium tabular-nums">{data.fundamentals.pb.toFixed(2)}</span></span>
                    )}
                    {data.fundamentals.roe > 0 && (
                      <span>ROE: <span className="text-foreground font-medium tabular-nums">{data.fundamentals.roe.toFixed(1)}%</span></span>
                    )}
                    {data.fundamentals.dividendYield > 0 && (
                      <span>Div Yield: <span className="text-foreground font-medium tabular-nums">{data.fundamentals.dividendYield.toFixed(1)}%</span></span>
                    )}
                    {data.fundamentals.week52High > 0 && (
                      <span>52W: <span className="text-foreground font-medium tabular-nums">{fmtCurrency(data.fundamentals.week52Low)} – {fmtCurrency(data.fundamentals.week52High)}</span></span>
                    )}
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Fair Value Gauge */}
        <div className="max-w-md mx-auto">
          {loading ? (
            <Card className="py-4">
              <CardContent className="flex justify-center py-10">
                <Skeleton className="h-40 w-64 rounded-full" />
              </CardContent>
            </Card>
          ) : data.fairValue ? (
            <FairValueGauge
              currentPrice={data.fairValue.currentPrice}
              fairValue={data.fairValue.weightedFairValue}
              upside={data.fairValue.weightedUpside}
              status={data.fairValue.status}
            />
          ) : null}
        </div>

        {/* Price Targets */}
        {!loading && data.fairValue && data.fairValue.bullishTarget > 0 && (
          <div className="grid grid-cols-3 gap-4 max-w-2xl mx-auto">
            <Card className="py-3 px-4 text-center border-red-200 dark:border-red-800">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium mb-1">Bearish</p>
              <p className="text-base font-bold font-mono tabular-nums text-red-600 dark:text-red-400">
                {fmtCurrency(data.fairValue.bearishTarget)}
              </p>
            </Card>
            <Card className="py-3 px-4 text-center border-primary/30">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium mb-1">Base</p>
              <p className="text-base font-bold font-mono tabular-nums">
                {fmtCurrency(data.fairValue.baseTarget)}
              </p>
            </Card>
            <Card className="py-3 px-4 text-center border-emerald-200 dark:border-emerald-800">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium mb-1">Bullish</p>
              <p className="text-base font-bold font-mono tabular-nums text-emerald-600 dark:text-emerald-400">
                {fmtCurrency(data.fairValue.bullishTarget)}
              </p>
            </Card>
          </div>
        )}

        {/* Section Title Helper */}
        {!loading && data.fairValue && (
          <>
            {/* Valuation Breakdown */}
            <div className="space-y-2">
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <BarChart3 className="size-4 text-muted-foreground" />
                Valuation Breakdown
              </h2>
              <p className="text-xs text-muted-foreground">
                4 independent valuation models with weighted composite
              </p>
            </div>
            <ValuationBreakdown
              result={data.fairValue}
              currentPrice={data.fairValue.currentPrice}
            />

            {/* Ratio Dashboard */}
            <div className="space-y-2">
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <TrendingUp className="size-4 text-muted-foreground" />
                Financial Ratios
              </h2>
              <p className="text-xs text-muted-foreground">
                Key metrics across valuation, profitability, growth, and financial health
              </p>
            </div>
            <RatioDashboard data={data.fundamentals} />

            {/* AI Analysis */}
            <div className="space-y-2">
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <ExternalLink className="size-4 text-muted-foreground" />
                AI Investment Analysis
              </h2>
              <p className="text-xs text-muted-foreground">
                AI-powered fundamental analysis with investment insights
              </p>
            </div>
            <AIAnalysisCard symbol={symbol} />
          </>
        )}

        {/* Bottom Padding */}
        <div className="h-8" />
      </div>
    </main>
  );
}
