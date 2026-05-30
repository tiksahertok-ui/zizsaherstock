'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  BarChart3, TrendingUp, TrendingDown, LayoutDashboard, Search,
  Star, Map, Target, Activity, Sparkles,
} from 'lucide-react';
import Link from 'next/link';

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';

import StockScreener from '@/components/analysis/stock-screener';
import MarketOverviewStats from '@/components/analysis/market-overview-stats';
import SectorOverview from '@/components/analysis/sector-overview';
import WatchlistPanel from '@/components/analysis/watchlist-panel';

import { fmtCurrency, fmtPercent, pnlColor } from '@/utils/formatters';

// ── Types ──────────────────────────────────────────────────────

interface TopOpportunity {
  symbol: string;
  name: string;
  sector: string;
  price: number;
  fairValue: number;
  upside: number;
  status: string;
  confidence: string;
  dataQuality: number;
}

// ── Page Transition ────────────────────────────────────────────

const pageVariants = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -8 },
};

// ── Skeletons ──────────────────────────────────────────────────

function OpportunitiesSkeleton() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3">
      {Array.from({ length: 5 }).map((_, i) => (
        <Card key={i} className="py-3 px-4">
          <Skeleton className="h-24 w-full" />
        </Card>
      ))}
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────

export default function AnalysisPage() {
  const [activeTab, setActiveTab] = useState('overview');
  const [opportunities, setOpportunities] = useState<TopOpportunity[]>([]);
  const [opLoading, setOpLoading] = useState(true);
  const [screenerSector, setScreenerSector] = useState<string | null>(null);

  const fetchTopOpportunities = useCallback(async () => {
    try {
      const res = await fetch('/api/analysis/screener?limit=260&sort=upside&minQuality=40', { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        const results = (data.results || []).filter(
          (r: { status: string; confidence: string; weightedUpside: number }) =>
            r.status === 'Undervalued' && r.confidence !== 'Low' && r.weightedUpside > 10
        ).slice(0, 5);
        setOpportunities(results.map((r: { symbol: string; name: string; sector: string; currentPrice: number; weightedFairValue: number; weightedUpside: number; status: string; confidence: string; dataQuality: number }) => ({
          symbol: r.symbol,
          name: r.name,
          sector: r.sector,
          price: r.currentPrice,
          fairValue: r.weightedFairValue,
          upside: r.weightedUpside,
          status: r.status,
          confidence: r.confidence,
          dataQuality: r.dataQuality,
        })));
      }
    } catch (err) {
      console.error('Top opportunities fetch error:', err);
    } finally {
      setOpLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchTopOpportunities();
  }, [fetchTopOpportunities]);

  const handleSectorClick = (sector: string) => {
    setScreenerSector(sector);
    setActiveTab('screener');
  };

  const handleBestOpportunityClick = (symbol: string) => {
    // Navigate to the stock page
    window.location.href = `/analysis/${symbol}`;
  };

  return (
    <main className="min-h-screen bg-background">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {/* Hero Section */}
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-primary/10 via-primary/5 to-transparent border border-primary/10"
        >
          <div className="relative px-6 py-8 sm:px-8 sm:py-10">
            <div className="flex items-center gap-3 mb-3">
              <div className="size-12 rounded-xl bg-primary/15 flex items-center justify-center">
                <BarChart3 className="size-6 text-primary" />
              </div>
              <div>
                <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
                  EGX Financial Intelligence
                </h1>
                <p className="text-sm text-muted-foreground mt-0.5">
                  Multi-model fair value analysis across 260 Egyptian stocks
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2 mt-4">
              <Badge variant="secondary" className="text-[11px]">
                <Activity className="size-3 mr-1" /> Real-time TradingView Data
              </Badge>
              <Badge variant="secondary" className="text-[11px]">
                <Sparkles className="size-3 mr-1" /> 5-Model Valuation Engine
              </Badge>
              <Badge variant="secondary" className="text-[11px]">
                <Target className="size-3 mr-1" /> DCF, Relative, DDM, Asset-Based
              </Badge>
              <Badge variant="secondary" className="text-[11px]">
                <Star className="size-3 mr-1" /> Watchlist & Screener
              </Badge>
            </div>
          </div>
        </motion.div>

        {/* Tabs Navigation */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <div className="flex justify-center">
            <TabsList className="bg-muted/50">
              <TabsTrigger value="overview" className="gap-1.5">
                <LayoutDashboard className="size-3.5" />
                <span className="hidden sm:inline">Overview</span>
              </TabsTrigger>
              <TabsTrigger value="screener" className="gap-1.5">
                <Search className="size-3.5" />
                <span className="hidden sm:inline">Screener</span>
              </TabsTrigger>
              <TabsTrigger value="watchlist" className="gap-1.5">
                <Star className="size-3.5" />
                <span className="hidden sm:inline">Watchlist</span>
              </TabsTrigger>
              <TabsTrigger value="map" className="gap-1.5">
                <Map className="size-3.5" />
                <span className="hidden sm:inline">Market Map</span>
              </TabsTrigger>
            </TabsList>
          </div>

          {/* Overview Tab */}
          <TabsContent value="overview" className="mt-6 space-y-6">
            <AnimatePresence mode="wait">
              <motion.div key="overview" variants={pageVariants} initial="initial" animate="animate" exit="exit" className="space-y-6">
                {/* Quick Stats */}
                <MarketOverviewStats onBestOpportunityClick={handleBestOpportunityClick} />

                {/* Sector Performance */}
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <TrendingUp className="size-4 text-muted-foreground" />
                    <h2 className="text-lg font-semibold">Sector Performance</h2>
                    <span className="text-xs text-muted-foreground">Click to filter</span>
                  </div>
                  <SectorOverview onSectorClick={handleSectorClick} />
                </div>

                {/* Top Opportunities */}
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <Target className="size-4 text-muted-foreground" />
                    <h2 className="text-lg font-semibold">Top Opportunities</h2>
                    <Badge variant="outline" className="text-[10px]">
                      High Confidence · Undervalued
                    </Badge>
                  </div>
                  {opLoading ? (
                    <OpportunitiesSkeleton />
                  ) : opportunities.length > 0 ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3">
                      {opportunities.map((opp, i) => (
                        <motion.div
                          key={opp.symbol}
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: i * 0.05 }}
                        >
                          <Link href={`/analysis/${opp.symbol}`}>
                            <Card className="py-3 px-4 hover:shadow-md transition-shadow cursor-pointer border-emerald-200/30 dark:border-emerald-800/30">
                              <div className="space-y-2">
                                <div className="flex items-center justify-between">
                                  <span className="font-mono font-bold text-sm">{opp.symbol}</span>
                                  <Badge variant="outline" className="text-[9px] px-1.5 py-0 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800">
                                    {opp.confidence}
                                  </Badge>
                                </div>
                                <p className="text-[11px] text-muted-foreground truncate">{opp.name}</p>
                                <div className="flex items-baseline justify-between">
                                  <span className="text-sm font-mono font-semibold tabular-nums">
                                    {fmtCurrency(opp.price)}
                                  </span>
                                  <span className={`text-sm font-mono font-bold tabular-nums ${pnlColor(opp.upside)}`}>
                                    {fmtPercent(opp.upside)}
                                  </span>
                                </div>
                                <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                                  <Badge variant="secondary" className="text-[9px] px-1.5 py-0">{opp.sector}</Badge>
                                  {opp.fairValue > 0 && (
                                    <span>FV: {fmtCurrency(opp.fairValue)}</span>
                                  )}
                                </div>
                              </div>
                            </Card>
                          </Link>
                        </motion.div>
                      ))}
                    </div>
                  ) : (
                    <Card className="py-8">
                      <p className="text-center text-sm text-muted-foreground">No high-confidence opportunities found</p>
                    </Card>
                  )}
                </div>
              </motion.div>
            </AnimatePresence>
          </TabsContent>

          {/* Screener Tab */}
          <TabsContent value="screener" className="mt-6">
            <AnimatePresence mode="wait">
              <motion.div key="screener" variants={pageVariants} initial="initial" animate="animate" exit="exit">
                <StockScreener />
              </motion.div>
            </AnimatePresence>
          </TabsContent>

          {/* Watchlist Tab */}
          <TabsContent value="watchlist" className="mt-6">
            <AnimatePresence mode="wait">
              <motion.div key="watchlist" variants={pageVariants} initial="initial" animate="animate" exit="exit" className="space-y-3">
                <div className="flex items-center gap-2">
                  <Star className="size-4 text-muted-foreground" />
                  <h2 className="text-lg font-semibold">My Watchlist</h2>
                </div>
                <WatchlistPanel />
              </motion.div>
            </AnimatePresence>
          </TabsContent>

          {/* Market Map Tab */}
          <TabsContent value="map" className="mt-6">
            <AnimatePresence mode="wait">
              <motion.div key="map" variants={pageVariants} initial="initial" animate="animate" exit="exit" className="space-y-3">
                <div className="flex items-center gap-2">
                  <Map className="size-4 text-muted-foreground" />
                  <h2 className="text-lg font-semibold">Market Sector Map</h2>
                </div>
                <SectorOverview />
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
