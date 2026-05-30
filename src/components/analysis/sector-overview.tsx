'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { motion } from 'framer-motion';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { fmtPercent, pnlColor } from '@/utils/formatters';

interface SectorOverviewProps {
  onSectorClick?: (sector: string) => void;
}

interface SectorData {
  sector: string;
  stockCount: number;
  avgChange: number;
  avgPE: number;
  avgROE: number;
  totalMarketCap: number;
  topPerformer: { symbol: string; name: string; change: number };
  worstPerformer: { symbol: string; name: string; change: number };
}

const container = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.05 },
  },
};

const item = {
  hidden: { opacity: 0, y: 10 },
  show: { opacity: 1, y: 0 },
};

function formatMcap(mcap: number): string {
  if (mcap >= 1e12) return `${(mcap / 1e12).toFixed(1)}T`;
  if (mcap >= 1e9) return `${(mcap / 1e9).toFixed(1)}B`;
  if (mcap >= 1e6) return `${(mcap / 1e6).toFixed(0)}M`;
  return '—';
}

function changeIcon(change: number) {
  if (change > 0.5) return <TrendingUp className="size-3 text-emerald-500" />;
  if (change < -0.5) return <TrendingDown className="size-3 text-red-500" />;
  return <Minus className="size-3 text-muted-foreground" />;
}

function sectorGradient(change: number): string {
  if (change > 2) return 'from-emerald-500/10 to-emerald-500/5 border-emerald-200/50 dark:border-emerald-800/50';
  if (change > 0) return 'from-emerald-500/5 to-transparent border-emerald-200/30 dark:border-emerald-800/30';
  if (change < -2) return 'from-red-500/10 to-red-500/5 border-red-200/50 dark:border-red-800/50';
  if (change < 0) return 'from-red-500/5 to-transparent border-red-200/30 dark:border-red-800/30';
  return 'from-muted to-muted/50 border-border';
}

function SectorSkeleton() {
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
      {Array.from({ length: 8 }).map((_, i) => (
        <Card key={i} className="py-3 px-4"><Skeleton className="h-24 w-full" /></Card>
      ))}
    </div>
  );
}

export default function SectorOverview({ onSectorClick }: SectorOverviewProps) {
  const [sectors, setSectors] = useState<SectorData[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchSectors = useCallback(async () => {
    try {
      const res = await fetch('/api/analysis/sector-overview', { cache: 'no-store' });
      if (res.ok) {
        const json = await res.json();
        setSectors(json.sectors || []);
      }
    } catch (err) {
      console.error('Sector overview error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchSectors();
  }, [fetchSectors]);

  if (loading) return <SectorSkeleton />;
  if (sectors.length === 0) return null;

  return (
    <motion.div
      variants={container}
      initial="hidden"
      animate="show"
      className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3"
    >
      {sectors.map(sector => (
        <motion.div key={sector.sector} variants={item}>
          <Card
            className={`py-3 px-4 cursor-pointer hover:shadow-md transition-shadow bg-gradient-to-br ${sectorGradient(sector.avgChange)} border`}
            onClick={() => onSectorClick?.(sector.sector)}
          >
            <div className="space-y-2">
              {/* Sector Name */}
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold truncate">{sector.sector}</p>
                {changeIcon(sector.avgChange)}
              </div>

              {/* Avg Change */}
              <div className="flex items-baseline gap-1">
                <span className={`text-lg font-bold font-mono tabular-nums ${pnlColor(sector.avgChange)}`}>
                  {fmtPercent(sector.avgChange)}
                </span>
              </div>

              {/* Details */}
              <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] text-muted-foreground">
                <span>{sector.stockCount} stocks</span>
                {sector.avgPE > 0 && <span>AVG P/E: {sector.avgPE.toFixed(1)}</span>}
                {sector.avgROE > 0 && <span>AVG ROE: {sector.avgROE.toFixed(1)}%</span>}
              </div>

              {/* Top Performer */}
              <div className="pt-1 border-t border-border/50">
                <p className="text-[10px] text-muted-foreground leading-tight">
                  <span className="font-medium text-foreground">{sector.topPerformer.symbol}</span>
                  <span className="ml-1">
                    <span className={`font-mono ${pnlColor(sector.topPerformer.change)}`}>
                      {fmtPercent(sector.topPerformer.change)}
                    </span>
                  </span>
                </p>
              </div>
            </div>
          </Card>
        </motion.div>
      ))}
    </motion.div>
  );
}
