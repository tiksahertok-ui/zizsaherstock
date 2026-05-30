'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft, Building2, TrendingUp, TrendingDown, BarChart3, ExternalLink,
  Star, RefreshCw, Loader2,
} from 'lucide-react';

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';

import FairValueGauge from '@/components/analysis/fair-value-gauge';
import ValuationBreakdown from '@/components/analysis/valuation-breakdown';
import RatioDashboard from '@/components/analysis/ratio-dashboard';
import AIAnalysisCard from '@/components/analysis/ai-analysis-card';
import TradingViewChart from '@/components/analysis/tradingview-chart';
import TechnicalAnalysisSection from '@/components/analysis/technical-analysis-section';
import SensitivityMatrix from '@/components/analysis/sensitivity-matrix';
import PeerComparisonTable from '@/components/analysis/peer-comparison-table';

import { fmtCurrency, fmtPercent, pnlColor } from '@/utils/formatters';
import type { FairValueResult } from '@/lib/fair-value-engine';
import type { FundamentalData } from '@/lib/fundamentals';
import { EGX_STOCKS } from '@/lib/egx-stocks';
import { isWatched, addToWatchlist, removeFromWatchlist } from '@/lib/watchlist-store';

// ── Types ──────────────────────────────────────────────────────

interface CompanyData {
  fairValue: FairValueResult | null;
  fundamentals: FundamentalData | null;
}

const tabVariants = {
  initial: { opacity: 0, x: 10 },
  animate: { opacity: 1, x: 0 },
  exit: { opacity: 0, x: -10 },
};

// ── Skeletons ──────────────────────────────────────────────────

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

function ChartSkeleton() {
  return (
    <Card className="overflow-hidden">
      <CardContent className="flex items-center justify-center" style={{ height: '500px' }}>
        <div className="text-center space-y-3">
          <Skeleton className="h-8 w-64 mx-auto" />
          <Skeleton className="h-4 w-48 mx-auto" />
        </div>
      </CardContent>
    </Card>
  );
}

// ── Main Page ──────────────────────────────────────────────────

export default function CompanyAnalysisPage() {
  const params = useParams();
  const symbol = (params.symbol as string)?.toUpperCase() || '';

  const [data, setData] = useState<CompanyData>({ fairValue: null, fundamentals: null });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('overview');
  const [watched, setWatched] = useState(false);

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
    setWatched(isWatched(symbol));
  }, [fetchData, symbol]);

  const toggleWatch = () => {
    if (watched) {
      removeFromWatchlist(symbol);
      setWatched(false);
    } else {
      addToWatchlist(symbol);
      setWatched(true);
    }
  };

  // Stock info
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
                <RefreshCw className="size-3 mr-1" /> Retry
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
                        <Badge variant="secondary" className="font-mono text-xs">{symbol}</Badge>
                        <Badge variant="outline" className="text-[10px]">{sector}</Badge>
                      </div>
                      <div className="flex items-center gap-2 mt-0.5">
                        {marketCap > 0 && (
                          <span className="text-sm text-muted-foreground">
                            {marketCap >= 1e9
                              ? `${(marketCap / 1e9).toFixed(1)}B EGP`
                              : marketCap >= 1e6
                                ? `${(marketCap / 1e6).toFixed(0)}M EGP`
                                : fmtCurrency(marketCap)}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Watchlist Button */}
                  <Button
                    variant={watched ? 'default' : 'outline'}
                    size="sm"
                    className="gap-1.5"
                    onClick={toggleWatch}
                  >
                    <Star className={`size-3.5 ${watched ? 'fill-current' : ''}`} />
                    {watched ? 'Watching' : 'Watch'}
                  </Button>
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

        {/* Tab Navigation */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <div className="flex justify-center">
            <TabsList className="bg-muted/50 flex-wrap">
              <TabsTrigger value="overview" className="gap-1.5 text-xs sm:text-sm">
                <Building2 className="size-3.5" /> Overview
              </TabsTrigger>
              <TabsTrigger value="valuation" className="gap-1.5 text-xs sm:text-sm">
                <BarChart3 className="size-3.5" /> Valuation
              </TabsTrigger>
              <TabsTrigger value="technicals" className="gap-1.5 text-xs sm:text-sm">
                <TrendingUp className="size-3.5" /> Technicals
              </TabsTrigger>
              <TabsTrigger value="peers" className="gap-1.5 text-xs sm:text-sm">
                <ExternalLink className="size-3.5" /> Peers
              </TabsTrigger>
              <TabsTrigger value="research" className="gap-1.5 text-xs sm:text-sm">
                <Star className="size-3.5" /> Research
              </TabsTrigger>
            </TabsList>
          </div>

          {/* Overview Tab: Chart + Fair Value Gauge */}
          <TabsContent value="overview" className="mt-6 space-y-6">
            <AnimatePresence mode="wait">
              <motion.div key="overview" variants={tabVariants} initial="initial" animate="animate" exit="exit" className="space-y-6">
                {/* TradingView Chart */}
                <div className="space-y-3">
                  <h2 className="text-lg font-semibold flex items-center gap-2">
                    <BarChart3 className="size-4 text-muted-foreground" />
                    Price Chart
                  </h2>
                  {loading ? <ChartSkeleton /> : <TradingViewChart symbol={symbol} />}
                </div>

                {/* Fair Value Gauge */}
                <div className="space-y-3">
                  <h2 className="text-lg font-semibold flex items-center gap-2">
                    <TrendingUp className="size-4 text-muted-foreground" />
                    Fair Value Analysis
                  </h2>
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
              </motion.div>
            </AnimatePresence>
          </TabsContent>

          {/* Valuation Tab */}
          <TabsContent value="valuation" className="mt-6 space-y-6">
            <AnimatePresence mode="wait">
              <motion.div key="valuation" variants={tabVariants} initial="initial" animate="animate" exit="exit" className="space-y-6">
                {/* Valuation Breakdown */}
                <div className="space-y-3">
                  <h2 className="text-lg font-semibold flex items-center gap-2">
                    <BarChart3 className="size-4 text-muted-foreground" />
                    Valuation Breakdown
                  </h2>
                  <p className="text-xs text-muted-foreground">4 independent valuation models with weighted composite</p>
                  {!loading && data.fairValue ? (
                    <ValuationBreakdown result={data.fairValue} currentPrice={data.fairValue.currentPrice} />
                  ) : (
                    <Skeleton className="h-48 w-full rounded-lg" />
                  )}
                </div>

                {/* Sensitivity Analysis */}
                <div className="space-y-3">
                  <h2 className="text-lg font-semibold flex items-center gap-2">
                    <TrendingUp className="size-4 text-muted-foreground" />
                    DCF Sensitivity Analysis
                  </h2>
                  <p className="text-xs text-muted-foreground">Fair value under different WACC and growth assumptions</p>
                  <SensitivityMatrix symbol={symbol} />
                </div>

                {/* Financial Ratios */}
                <div className="space-y-3">
                  <h2 className="text-lg font-semibold flex items-center gap-2">
                    <TrendingUp className="size-4 text-muted-foreground" />
                    Financial Ratios
                  </h2>
                  <p className="text-xs text-muted-foreground">Key metrics across valuation, profitability, growth, and financial health</p>
                  <RatioDashboard data={data.fundamentals} />
                </div>
              </motion.div>
            </AnimatePresence>
          </TabsContent>

          {/* Technicals Tab */}
          <TabsContent value="technicals" className="mt-6 space-y-6">
            <AnimatePresence mode="wait">
              <motion.div key="technicals" variants={tabVariants} initial="initial" animate="animate" exit="exit" className="space-y-6">
                {/* Technical Analysis */}
                <div className="space-y-3">
                  <h2 className="text-lg font-semibold flex items-center gap-2">
                    <TrendingUp className="size-4 text-muted-foreground" />
                    Technical Indicators
                  </h2>
                  <p className="text-xs text-muted-foreground">RSI, MACD, Stochastic, Moving Averages, and TradingView aggregated rating</p>
                  <TechnicalAnalysisSection symbol={symbol} />
                </div>
              </motion.div>
            </AnimatePresence>
          </TabsContent>

          {/* Peers Tab */}
          <TabsContent value="peers" className="mt-6 space-y-6">
            <AnimatePresence mode="wait">
              <motion.div key="peers" variants={tabVariants} initial="initial" animate="animate" exit="exit" className="space-y-6">
                <div className="space-y-3">
                  <h2 className="text-lg font-semibold flex items-center gap-2">
                    <ExternalLink className="size-4 text-muted-foreground" />
                    Peer Comparison
                  </h2>
                  <p className="text-xs text-muted-foreground">Key metrics compared to sector peers</p>
                  <PeerComparisonTable symbol={symbol} />
                </div>
              </motion.div>
            </AnimatePresence>
          </TabsContent>

          {/* Research Tab */}
          <TabsContent value="research" className="mt-6 space-y-6">
            <AnimatePresence mode="wait">
              <motion.div key="research" variants={tabVariants} initial="initial" animate="animate" exit="exit" className="space-y-6">
                <div className="space-y-3">
                  <h2 className="text-lg font-semibold flex items-center gap-2">
                    <ExternalLink className="size-4 text-muted-foreground" />
                    AI Investment Analysis
                  </h2>
                  <p className="text-xs text-muted-foreground">AI-powered fundamental analysis with investment insights</p>
                  <AIAnalysisCard symbol={symbol} />
                </div>
              </motion.div>
            </AnimatePresence>
          </TabsContent>
        </Tabs>

        {/* Bottom Padding */}
        <div className="h-8" />
      </div>
    </main>
  );
}
