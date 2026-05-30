'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Users, Loader2, RefreshCw } from 'lucide-react';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { fmtCurrency, fmtNumber, pnlColor } from '@/utils/formatters';

interface PeerComparisonTableProps {
  symbol: string;
}

interface PeerData {
  symbol: string;
  name: string;
  sector: string;
  isTarget: boolean;
  price: number;
  marketCap: number;
  pe: number;
  pb: number;
  evEbitda: number;
  roe: number;
  netMargin: number;
  revenueGrowth: number;
  dividendYield: number;
}

function formatMcap(mcap: number): string {
  if (mcap >= 1e12) return `${(mcap / 1e12).toFixed(1)}T`;
  if (mcap >= 1e9) return `${(mcap / 1e9).toFixed(1)}B`;
  if (mcap >= 1e6) return `${(mcap / 1e6).toFixed(0)}M`;
  return fmtNumber(mcap, 0);
}

function bestInColumn(values: number[]): Set<number> {
  // Best = lowest PE/PB/EV_EBITDA, highest ROE/Margin/Growth/Yield
  return new Set<number>();
}

function TableSkeleton() {
  return (
    <Card className="py-3 px-4">
      <Skeleton className="h-6 w-48 mb-3" />
      <div className="space-y-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-8 w-full" />
        ))}
      </div>
    </Card>
  );
}

export default function PeerComparisonTable({ symbol }: PeerComparisonTableProps) {
  const [peers, setPeers] = useState<PeerData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchPeers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/analysis/peers?symbol=${encodeURIComponent(symbol)}`, { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setPeers(json.peers || []);
    } catch (err) {
      console.error('Peers fetch error:', err);
      setError('Failed to load peer data');
    } finally {
      setLoading(false);
    }
  }, [symbol]);

  useEffect(() => {
    void fetchPeers();
  }, [fetchPeers]);

  if (loading) return <TableSkeleton />;
  if (error) {
    return (
      <Card className="border-red-200 dark:border-red-800">
        <CardContent className="flex items-center justify-between py-4">
          <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
          <Button variant="outline" size="sm" onClick={() => void fetchPeers()} className="gap-1.5">
            <RefreshCw className="size-3" /> Retry
          </Button>
        </CardContent>
      </Card>
    );
  }
  if (peers.length === 0) return null;

  // Find best values for each column (for color coding)
  const validPEs = peers.filter(p => p.pe > 0);
  const bestPE = validPEs.length > 0 ? Math.min(...validPEs.map(p => p.pe)) : 0;
  const validPBs = peers.filter(p => p.pb > 0);
  const bestPB = validPBs.length > 0 ? Math.min(...validPBs.map(p => p.pb)) : 0;
  const validEVs = peers.filter(p => p.evEbitda > 0);
  const bestEV = validEVs.length > 0 ? Math.min(...validEVs.map(p => p.evEbitda)) : 0;
  const validROEs = peers.filter(p => p.roe > 0);
  const bestROE = validROEs.length > 0 ? Math.max(...validROEs.map(p => p.roe)) : 0;
  const validMargins = peers.filter(p => p.netMargin > 0);
  const bestMargin = validMargins.length > 0 ? Math.max(...validMargins.map(p => p.netMargin)) : 0;
  const validGrowths = peers.filter(p => p.revenueGrowth > 0);
  const bestGrowth = validGrowths.length > 0 ? Math.max(...validGrowths.map(p => p.revenueGrowth)) : 0;
  const validYields = peers.filter(p => p.dividendYield > 0);
  const bestYield = validYields.length > 0 ? Math.max(...validYields.map(p => p.dividendYield)) : 0;

  return (
    <Card className="py-3 px-4">
      <CardHeader className="pb-2 pt-0 px-0">
        <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
          <Users className="size-3" />
          Peer Comparison
          <Badge variant="secondary" className="text-[10px] ml-1">{peers[0]?.sector}</Badge>
          <span className="text-[10px] font-normal ml-auto">{peers.length} stocks</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="px-0 pt-0">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b">
                <th className="px-2 py-1.5 text-left text-[10px] text-muted-foreground font-medium">Symbol</th>
                <th className="px-2 py-1.5 text-right text-[10px] text-muted-foreground font-medium">Mkt Cap</th>
                <th className="px-2 py-1.5 text-right text-[10px] text-muted-foreground font-medium">P/E</th>
                <th className="px-2 py-1.5 text-right text-[10px] text-muted-foreground font-medium hidden sm:table-cell">P/B</th>
                <th className="px-2 py-1.5 text-right text-[10px] text-muted-foreground font-medium hidden md:table-cell">EV/EBITDA</th>
                <th className="px-2 py-1.5 text-right text-[10px] text-muted-foreground font-medium">ROE</th>
                <th className="px-2 py-1.5 text-right text-[10px] text-muted-foreground font-medium hidden lg:table-cell">Net Margin</th>
                <th className="px-2 py-1.5 text-right text-[10px] text-muted-foreground font-medium hidden lg:table-cell">Rev. Growth</th>
                <th className="px-2 py-1.5 text-right text-[10px] text-muted-foreground font-medium hidden md:table-cell">Div. Yield</th>
              </tr>
            </thead>
            <tbody>
              {peers.map(p => (
                <tr
                  key={p.symbol}
                  className={`border-b last:border-0 ${p.isTarget ? 'bg-primary/5 font-semibold' : 'hover:bg-muted/30'}`}
                >
                  <td className="px-2 py-1.5">
                    <Link href={`/analysis/${p.symbol}`} className="hover:underline flex items-center gap-1">
                      <span className="font-mono text-xs">{p.symbol}</span>
                      {p.isTarget && <Badge variant="outline" className="text-[8px] px-1 py-0 h-4">You</Badge>}
                    </Link>
                  </td>
                  <td className="px-2 py-1.5 text-right font-mono tabular-nums text-muted-foreground">
                    {p.marketCap > 0 ? formatMcap(p.marketCap) : '—'}
                  </td>
                  <td className={`px-2 py-1.5 text-right font-mono tabular-nums ${p.pe > 0 && p.pe === bestPE ? 'text-emerald-600 dark:text-emerald-400 font-bold' : ''}`}>
                    {p.pe > 0 ? p.pe.toFixed(1) : '—'}
                  </td>
                  <td className={`px-2 py-1.5 text-right font-mono tabular-nums hidden sm:table-cell ${p.pb > 0 && p.pb === bestPB ? 'text-emerald-600 dark:text-emerald-400 font-bold' : ''}`}>
                    {p.pb > 0 ? p.pb.toFixed(2) : '—'}
                  </td>
                  <td className={`px-2 py-1.5 text-right font-mono tabular-nums hidden md:table-cell ${p.evEbitda > 0 && p.evEbitda === bestEV ? 'text-emerald-600 dark:text-emerald-400 font-bold' : ''}`}>
                    {p.evEbitda > 0 ? p.evEbitda.toFixed(1) : '—'}
                  </td>
                  <td className={`px-2 py-1.5 text-right font-mono tabular-nums ${p.roe > 0 && p.roe === bestROE ? 'text-emerald-600 dark:text-emerald-400 font-bold' : ''}`}>
                    {p.roe > 0 ? `${p.roe.toFixed(1)}%` : '—'}
                  </td>
                  <td className={`px-2 py-1.5 text-right font-mono tabular-nums hidden lg:table-cell ${p.netMargin > 0 && Math.abs(p.netMargin - bestMargin) < 0.5 ? 'text-emerald-600 dark:text-emerald-400 font-bold' : ''}`}>
                    {p.netMargin > 0 ? `${p.netMargin.toFixed(1)}%` : '—'}
                  </td>
                  <td className={`px-2 py-1.5 text-right font-mono tabular-nums hidden lg:table-cell ${p.revenueGrowth !== 0 && p.revenueGrowth === bestGrowth ? 'text-emerald-600 dark:text-emerald-400 font-bold' : ''}`}>
                    {p.revenueGrowth !== 0 ? `${p.revenueGrowth > 0 ? '+' : ''}${p.revenueGrowth.toFixed(1)}%` : '—'}
                  </td>
                  <td className={`px-2 py-1.5 text-right font-mono tabular-nums hidden md:table-cell ${p.dividendYield > 0 && Math.abs(p.dividendYield - bestYield) < 0.5 ? 'text-emerald-600 dark:text-emerald-400 font-bold' : ''}`}>
                    {p.dividendYield > 0 ? `${p.dividendYield.toFixed(1)}%` : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-[10px] text-muted-foreground mt-2">
          Green highlights indicate best-in-class values. Low P/E, high ROE = favorable.
        </p>
      </CardContent>
    </Card>
  );
}
