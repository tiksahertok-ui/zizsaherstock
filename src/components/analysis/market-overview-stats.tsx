'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Activity, TrendingUp, TrendingDown, BarChart3, Eye, Sparkles } from 'lucide-react';
import { motion } from 'framer-motion';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { fmtCurrency, fmtPercent, pnlColor } from '@/utils/formatters';

interface MarketOverviewStatsProps {
  onBestOpportunityClick?: (symbol: string) => void;
}

interface QuickStats {
  egx30Price: number;
  egx30Change: number;
  totalAnalyzed: number;
  bestOpportunity: { symbol: string; name: string; upside: number; price: number; status: string } | null;
  undervaluedCount: number;
  overvaluedCount: number;
  highConfidenceCount: number;
}

const container = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.08 },
  },
};

const item = {
  hidden: { opacity: 0, scale: 0.95 },
  show: { opacity: 1, scale: 1 },
};

function StatsSkeleton() {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <Card key={i} className="py-4 px-5">
          <Skeleton className="h-16 w-full" />
        </Card>
      ))}
    </div>
  );
}

export default function MarketOverviewStats({ onBestOpportunityClick }: MarketOverviewStatsProps) {
  const [stats, setStats] = useState<QuickStats | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchStats = useCallback(async () => {
    try {
      // Fetch screener summary
      const [screenerRes, egx30Res] = await Promise.allSettled([
        fetch('/api/analysis/screener?limit=260&minQuality=0&sort=upside', { cache: 'no-store' }),
        fetch('/api/market-data/live?symbols=EGX30', { cache: 'no-store' }),
      ]);

      let totalAnalyzed = 0;
      let undervaluedCount = 0;
      let overvaluedCount = 0;
      let highConfidenceCount = 0;
      let bestOpportunity: QuickStats['bestOpportunity'] = null;
      let egx30Price = 0;
      let egx30Change = 0;

      if (screenerRes.status === 'fulfilled' && screenerRes.value.ok) {
        const data = await screenerRes.value.json();
        totalAnalyzed = data.summary?.total || 0;
        undervaluedCount = data.summary?.undervalued || 0;
        overvaluedCount = data.summary?.overvalued || 0;
        highConfidenceCount = data.summary?.highConfidence || 0;

        // Find best opportunity: highest upside high-confidence stock
        const results = data.results || [];
        const highConfStocks = results.filter((r: { confidence: string; weightedUpside: number; status: string }) =>
          r.confidence === 'High' && r.status === 'Undervalued' && r.weightedUpside > 0
        );
        if (highConfStocks.length > 0) {
          const best = highConfStocks[0];
          bestOpportunity = {
            symbol: best.symbol,
            name: best.name,
            upside: best.weightedUpside,
            price: best.currentPrice,
            status: best.status,
          };
        }
      }

      if (egx30Res.status === 'fulfilled' && egx30Res.value.ok) {
        const data = await egx30Res.value.json();
        const egx30 = data['EGX30'];
        if (egx30) {
          egx30Price = egx30.close || 0;
          egx30Change = egx30.changePercent || 0;
        }
      }

      setStats({
        egx30Price,
        egx30Change,
        totalAnalyzed,
        bestOpportunity,
        undervaluedCount,
        overvaluedCount,
        highConfidenceCount,
      });
    } catch (err) {
      console.error('Stats fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchStats();
  }, [fetchStats]);

  if (loading) return <StatsSkeleton />;
  if (!stats) return null;

  const statCards = [
    {
      icon: <BarChart3 className="size-5 text-primary" />,
      bgClass: 'bg-primary/10',
      label: 'EGX30 Index',
      value: stats.egx30Price > 0 ? fmtCurrency(stats.egx30Price) : '—',
      subValue: stats.egx30Change !== 0 ? fmtPercent(stats.egx30Change) : null,
      subColor: pnlColor(stats.egx30Change),
    },
    {
      icon: <Eye className="size-5 text-emerald-600 dark:text-emerald-400" />,
      bgClass: 'bg-emerald-500/10',
      label: 'Analyzed Stocks',
      value: String(stats.totalAnalyzed),
      subValue: `${stats.undervaluedCount} undervalued`,
      subColor: 'text-muted-foreground',
    },
    {
      icon: <TrendingUp className="size-5 text-amber-600 dark:text-amber-400" />,
      bgClass: 'bg-amber-500/10',
      label: 'Best Opportunity',
      value: stats.bestOpportunity ? stats.bestOpportunity.symbol : '—',
      subValue: stats.bestOpportunity ? `${fmtPercent(stats.bestOpportunity.upside)} upside` : null,
      subColor: stats.bestOpportunity ? pnlColor(stats.bestOpportunity.upside) : 'text-muted-foreground',
      onClick: stats.bestOpportunity ? () => onBestOpportunityClick?.(stats.bestOpportunity!.symbol) : undefined,
    },
    {
      icon: <Sparkles className="size-5 text-purple-600 dark:text-purple-400" />,
      bgClass: 'bg-purple-500/10',
      label: 'High Confidence',
      value: String(stats.highConfidenceCount),
      subValue: `of ${stats.totalAnalyzed} stocks`,
      subColor: 'text-muted-foreground',
    },
  ];

  return (
    <motion.div
      variants={container}
      initial="hidden"
      animate="show"
      className="grid grid-cols-2 lg:grid-cols-4 gap-4"
    >
      {statCards.map((card, i) => (
        <motion.div key={i} variants={item}>
          <Card className={`py-4 px-5 ${card.onClick ? 'cursor-pointer hover:shadow-md transition-shadow' : ''}`} onClick={card.onClick}>
            <div className="flex items-center gap-3">
              <div className={`size-10 rounded-lg ${card.bgClass} flex items-center justify-center shrink-0`}>
                {card.icon}
              </div>
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium truncate">
                  {card.label}
                </p>
                <p className="text-xl font-bold tabular-nums leading-tight truncate">
                  {card.value}
                </p>
                {card.subValue && (
                  <p className={`text-[11px] tabular-nums ${card.subColor}`}>
                    {card.subValue}
                  </p>
                )}
              </div>
            </div>
          </Card>
        </motion.div>
      ))}
    </motion.div>
  );
}
