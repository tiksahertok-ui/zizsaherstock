'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Star, Trash2, Plus, Loader2, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { fmtCurrency, fmtPercent, pnlColor } from '@/utils/formatters';
import { getWatchlist, removeFromWatchlist, addToWatchlist } from '@/lib/watchlist-store';

interface WatchlistPanelProps {
  symbols?: string[];
}

interface WatchlistStock {
  symbol: string;
  price: number;
  change: number;
  fairValue: number;
  upside: number;
  status: string;
  name: string;
}

function statusBadge(status: string) {
  const map: Record<string, { cls: string; icon: React.ReactNode }> = {
    'Undervalued': { cls: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800', icon: <TrendingUp className="size-2.5" /> },
    'Fairly Valued': { cls: 'bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-800', icon: <Minus className="size-2.5" /> },
    'Overvalued': { cls: 'bg-red-500/15 text-red-700 dark:text-red-400 border-red-200 dark:border-red-800', icon: <TrendingDown className="size-2.5" /> },
    'N/A': { cls: 'bg-muted text-muted-foreground border-border', icon: <Minus className="size-2.5" /> },
  };
  const { cls, icon } = map[status] || map['N/A'];
  return (
    <Badge variant="outline" className={`gap-0.5 text-[10px] px-1.5 py-0 ${cls}`}>
      {icon}
      {status}
    </Badge>
  );
}

function WatchlistSkeleton() {
  return (
    <div className="space-y-2">
      {Array.from({ length: 5 }).map((_, i) => (
        <Card key={i} className="py-3 px-4"><Skeleton className="h-8 w-full" /></Card>
      ))}
    </div>
  );
}

function EmptyState() {
  return (
    <Card className="py-8 px-4">
      <div className="flex flex-col items-center gap-3 text-muted-foreground">
        <Star className="size-8 opacity-30" />
        <p className="text-sm font-medium">No stocks in watchlist</p>
        <p className="text-xs text-center max-w-[200px]">
          Browse the screener and click the star icon to add stocks to your watchlist.
        </p>
      </div>
    </Card>
  );
}

export default function WatchlistPanel({ symbols }: WatchlistPanelProps) {
  const [watchlist, setWatchlist] = useState<string[]>([]);
  const [stocks, setStocks] = useState<WatchlistStock[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchWatchlistData = useCallback(async () => {
    const list = symbols || getWatchlist();
    setWatchlist(list);

    if (list.length === 0) {
      setStocks([]);
      setLoading(false);
      return;
    }

    try {
      const res = await fetch(`/api/analysis/screener?limit=260&minQuality=0&sort=upside`, { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        const results = (data.results || []) as Array<{
          symbol: string;
          name: string;
          currentPrice: number;
          weightedUpside: number;
          weightedFairValue: number;
          status: string;
        }>;
        const filtered = results.filter(r => list.includes(r.symbol));
        setStocks(filtered.map(r => ({
          symbol: r.symbol,
          price: r.currentPrice,
          change: 0, // Will be populated from the summary data
          fairValue: r.weightedFairValue,
          upside: r.weightedUpside,
          status: r.status,
          name: r.name,
        })));
      }
    } catch (err) {
      console.error('Watchlist fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, [symbols]);

  useEffect(() => {
    void fetchWatchlistData();
  }, [fetchWatchlistData]);

  const handleRemove = (symbol: string) => {
    removeFromWatchlist(symbol);
    setWatchlist(prev => prev.filter(s => s !== symbol));
    setStocks(prev => prev.filter(s => s.symbol !== symbol));
  };

  if (loading) return <WatchlistSkeleton />;
  if (watchlist.length === 0 || stocks.length === 0) return <EmptyState />;

  return (
    <div className="space-y-2">
      <AnimatePresence mode="popLayout">
        {stocks.map(stock => (
          <motion.div
            key={stock.symbol}
            layout
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
            transition={{ duration: 0.2 }}
          >
            <Card className="py-3 px-4">
              <div className="flex items-center gap-3">
                {/* Symbol & Name */}
                <Link href={`/analysis/${stock.symbol}`} className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-semibold text-sm">{stock.symbol}</span>
                    {statusBadge(stock.status)}
                  </div>
                  <p className="text-[11px] text-muted-foreground truncate mt-0.5">{stock.name}</p>
                </Link>

                {/* Price */}
                <div className="text-right">
                  <p className="text-sm font-mono font-semibold tabular-nums">{fmtCurrency(stock.price)}</p>
                  {stock.fairValue > 0 && (
                    <p className={`text-[11px] font-mono tabular-nums ${pnlColor(stock.upside)}`}>
                      {fmtPercent(stock.upside)}
                    </p>
                  )}
                </div>

                {/* Remove */}
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 w-7 p-0 text-muted-foreground hover:text-red-500 shrink-0"
                  onClick={() => handleRemove(stock.symbol)}
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </div>
            </Card>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
