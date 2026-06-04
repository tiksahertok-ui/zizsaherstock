'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  TrendingUp,
  TrendingDown,
  RefreshCw,
  BarChart3,
  Activity,
  Sigma,
  Target,
  Percent,
  AlertTriangle,
  Layers,
} from 'lucide-react';
import { fmtCurrency, fmtPercent, fmtNumber, pnlColor } from '@/utils/formatters';

// ── Types ──────────────────────────────────────────────────────────

interface MonteCarloChartProps {
  symbol: string;
}

interface MonteCarloResults {
  mean: number;
  median: number;
  std: number;
  percentiles: {
    p5: number;
    p25: number;
    p50: number;
    p75: number;
    p95: number;
  };
}

interface MonteCarloDistributionBin {
  min: number;
  max: number;
  midpoint: number;
  count: number;
  probability: number;
}

interface MonteCarloResponse {
  symbol: string;
  currentPrice: number;
  simulations: number;
  results: MonteCarloResults;
  probabilityOfUpside: number;
  confidenceInterval: {
    lower: number;
    upper: number;
  };
  distribution: MonteCarloDistributionBin[];
  assumptions: Record<string, unknown>;
  calculatedAt: string;
}

// ── Constants ──────────────────────────────────────────────────────

const CHART_HEIGHT = 220;
const PADDING_X = 48;

// ── Helpers ────────────────────────────────────────────────────────

/** Map a price value to a percentage position (0-100) within the distribution range */
function priceToPercent(
  price: number,
  rangeMin: number,
  rangeMax: number,
): number {
  if (rangeMax === rangeMin) return 50;
  return ((price - rangeMin) / (rangeMax - rangeMin)) * 100;
}

/** Format a compact price label for the X axis */
function compactPrice(price: number): string {
  if (price >= 1000) return `${(price / 1000).toFixed(1)}k`;
  if (price >= 100) return price.toFixed(0);
  if (price >= 10) return price.toFixed(1);
  return price.toFixed(2);
}

// ── Loading Skeleton ───────────────────────────────────────────────

function MonteCarloSkeleton() {
  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Skeleton className="size-4 rounded" />
            <Skeleton className="h-4 w-48" />
          </div>
          <Skeleton className="h-6 w-20 rounded-full" />
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Chart skeleton */}
        <div className="relative">
          <div className="flex items-end gap-[2px]" style={{ height: CHART_HEIGHT }}>
            {Array.from({ length: 20 }).map((_, i) => (
              <div key={i} className="flex-1">
                <Skeleton
                  className="w-full rounded-t-sm"
                  style={{
                    height: `${Math.random() * 80 + 20}%`,
                    marginTop: 'auto',
                  }}
                />
              </div>
            ))}
          </div>
        </div>
        {/* X axis labels skeleton */}
        <div className="flex justify-between px-12">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-3 w-10" />
          ))}
        </div>
        {/* Stats skeleton */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 pt-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-20 rounded-lg" />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

// ── Error State ────────────────────────────────────────────────────

function MonteCarloError({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <Card className="border-red-200 dark:border-red-900/50">
      <CardContent className="flex flex-col items-center justify-center gap-3 py-10">
        <div className="flex items-center gap-2 text-red-500 dark:text-red-400">
          <AlertTriangle className="size-5" />
          <span className="text-sm font-medium">Simulation Failed</span>
        </div>
        <p className="text-sm text-muted-foreground text-center max-w-md">
          {message}
        </p>
        <Button
          variant="outline"
          size="sm"
          onClick={onRetry}
          className="gap-1.5"
        >
          <RefreshCw className="size-3" />
          Retry Simulation
        </Button>
      </CardContent>
    </Card>
  );
}

// ── Histogram Bar ──────────────────────────────────────────────────

function HistogramBar({
  bin,
  maxCount,
  isAboveCurrentPrice,
  index,
}: {
  bin: MonteCarloDistributionBin;
  maxCount: number;
  isAboveCurrentPrice: boolean;
  index: number;
}) {
  const heightPercent = maxCount > 0 ? (bin.count / maxCount) * 100 : 0;

  return (
    <div className="flex-1 flex flex-col items-center justify-end min-w-0 group relative">
      <motion.div
        initial={{ height: 0, opacity: 0 }}
        animate={{ height: `${heightPercent}%`, opacity: 1 }}
        transition={{
          height: {
            duration: 0.6,
            delay: index * 0.03,
            ease: [0.22, 1, 0.36, 1],
          },
          opacity: {
            duration: 0.3,
            delay: index * 0.03,
          },
        }}
        className={`
          w-full rounded-t-[3px] cursor-default transition-colors duration-150
          ${
            isAboveCurrentPrice
              ? 'bg-emerald-500/70 dark:bg-emerald-500/60 hover:bg-emerald-500 dark:hover:bg-emerald-500'
              : 'bg-red-500/50 dark:bg-red-500/40 hover:bg-red-500 dark:hover:bg-red-500'
          }
        `}
        title={`EGP ${bin.min.toFixed(2)} – ${bin.max.toFixed(2)}: ${bin.count.toLocaleString()} sims (${(bin.probability).toFixed(1)}%)`}
      />
    </div>
  );
}

// ── Percentile Marker ──────────────────────────────────────────────

function PercentileMarker({
  label,
  price,
  rangeMin,
  rangeMax,
  variant,
}: {
  label: string;
  price: number;
  rangeMin: number;
  rangeMax: number;
  variant: 'major' | 'minor';
}) {
  const position = priceToPercent(price, rangeMin, rangeMax);

  if (position < 0 || position > 100) return null;

  return (
    <div
      className="absolute top-0 h-full flex flex-col items-center pointer-events-none z-10"
      style={{
        left: `calc(${PADDING_X}px + (100% - ${PADDING_X * 2}px) * ${position / 100})`,
        transform: 'translateX(-50%)',
      }}
    >
      {/* Vertical tick line */}
      <div
        className={`w-px ${
          variant === 'major'
            ? 'bg-amber-500/60 dark:bg-amber-400/50'
            : 'bg-muted-foreground/20 dark:bg-muted-foreground/15'
        }`}
        style={{ height: CHART_HEIGHT - 8 }}
      />
      {/* Label pill */}
      <motion.div
        initial={{ opacity: 0, y: -4 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.8 }}
        className={`
          text-[9px] font-mono font-medium mt-1 px-1.5 py-0.5 rounded whitespace-nowrap
          ${
            variant === 'major'
              ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/20'
              : 'bg-muted/50 text-muted-foreground border border-border/50'
          }
        `}
      >
        {label}
      </motion.div>
    </div>
  );
}

// ── Current Price Line ────────────────────────────────────────────

function CurrentPriceLine({
  price,
  rangeMin,
  rangeMax,
  currency,
}: {
  price: number;
  rangeMin: number;
  rangeMax: number;
  currency: string;
}) {
  const position = priceToPercent(price, rangeMin, rangeMax);

  if (position < -2 || position > 102) return null;

  const clampedPosition = Math.max(0, Math.min(100, position));

  return (
    <div
      className="absolute top-0 h-full flex flex-col items-center pointer-events-none z-20"
      style={{
        left: `calc(${PADDING_X}px + (100% - ${PADDING_X * 2}px) * ${clampedPosition / 100})`,
        transform: 'translateX(-50%)',
      }}
    >
      {/* Dashed line */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5, delay: 0.6 }}
        className="w-px border-l border-dashed border-sky-400 dark:border-sky-500"
        style={{ height: CHART_HEIGHT - 6 }}
      />
      {/* Price label */}
      <motion.div
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.4, delay: 0.8, type: 'spring', stiffness: 200 }}
        className="mt-1 text-[10px] font-mono font-bold text-sky-500 dark:text-sky-400 px-1.5 py-0.5 rounded bg-sky-500/10 border border-sky-500/25 whitespace-nowrap"
      >
        {currency} {compactPrice(price)}
      </motion.div>
    </div>
  );
}

// ── Confidence Interval Band ───────────────────────────────────────

function ConfidenceBand({
  lower,
  upper,
  rangeMin,
  rangeMax,
}: {
  lower: number;
  upper: number;
  rangeMin: number;
  rangeMax: number;
}) {
  const leftPct = priceToPercent(lower, rangeMin, rangeMax);
  const rightPct = priceToPercent(upper, rangeMin, rangeMax);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.6, delay: 0.5 }}
      className="absolute top-0 h-full pointer-events-none z-[1] rounded"
      style={{
        left: `calc(${PADDING_X}px + (100% - ${PADDING_X * 2}px) * ${Math.max(0, leftPct) / 100})`,
        right: `calc(${PADDING_X}px + (100% - ${PADDING_X * 2}px) * ${(100 - Math.min(100, rightPct)) / 100})`,
        backgroundColor: 'rgba(168, 85, 247, 0.06)',
        borderTop: '2px solid rgba(168, 85, 247, 0.15)',
        borderBottom: '2px solid rgba(168, 85, 247, 0.15)',
      }}
      title={`90% Confidence Interval: EGP ${lower.toFixed(2)} – ${upper.toFixed(2)}`}
    />
  );
}

// ── Stats Card ─────────────────────────────────────────────────────

function StatCard({
  icon: Icon,
  label,
  value,
  subtext,
  colorClass,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  subtext?: string;
  colorClass: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="rounded-lg border bg-card p-3 space-y-1 hover:shadow-sm transition-shadow"
    >
      <div className="flex items-center gap-1.5">
        <Icon className={`size-3.5 ${colorClass}`} />
        <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">
          {label}
        </span>
      </div>
      <p className={`text-lg font-bold font-mono tabular-nums leading-none ${colorClass}`}>
        {value}
      </p>
      {subtext && (
        <p className="text-[10px] text-muted-foreground">{subtext}</p>
      )}
    </motion.div>
  );
}

// ── Main Component ─────────────────────────────────────────────────

export default function MonteCarloChart({ symbol }: MonteCarloChartProps) {
  const [data, setData] = useState<MonteCarloResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // ── Data fetching ─────────────────────────────────────────────
  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/analysis/monte-carlo?symbol=${encodeURIComponent(symbol)}`,
        { cache: 'no-store' },
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(
          body?.error || `HTTP ${res.status}: Failed to fetch Monte Carlo data`,
        );
      }
      const json: MonteCarloResponse = await res.json();
      setData(json);
    } catch (err) {
      console.error('[monte-carlo-chart] Fetch error:', err);
      setError(
        err instanceof Error
          ? err.message
          : 'An unexpected error occurred while running the simulation.',
      );
    } finally {
      setLoading(false);
    }
  }, [symbol]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  // ── Derived chart values ───────────────────────────────────────
  const { rangeMin, rangeMax, maxCount, xLabels } = useMemo(() => {
    if (!data || !data.distribution.length) {
      return { rangeMin: 0, rangeMax: 0, maxCount: 0, xLabels: [] };
    }

    const bins = data.distribution;
    const rMin = bins[0].min;
    const rMax = bins[bins.length - 1].max;
    const mCount = Math.max(...bins.map((b) => b.count));

    // Generate ~6 X-axis labels
    const labels: string[] = [];
    const numLabels = Math.min(7, bins.length);
    const step = Math.max(1, Math.floor(bins.length / numLabels));
    for (let i = 0; i < bins.length; i += step) {
      labels.push(compactPrice(bins[i].midpoint));
    }

    return { rangeMin: rMin, rangeMax: rMax, maxCount: mCount, xLabels: labels };
  }, [data]);

  // ── Render states ──────────────────────────────────────────────
  if (loading) return <MonteCarloSkeleton />;
  if (error) return <MonteCarloError message={error} onRetry={() => void fetchData()} />;
  if (!data) return null;

  const {
    currentPrice,
    simulations,
    results,
    probabilityOfUpside,
    confidenceInterval,
    distribution,
  } = data;

  const upsidePercent = probabilityOfUpside * 100;
  const meanVsPrice = currentPrice > 0
    ? ((results.mean - currentPrice) / currentPrice) * 100
    : 0;

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={symbol}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.3 }}
      >
        <Card className="overflow-hidden">
          {/* ── Header ──────────────────────────────────────────── */}
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <div className="flex items-center justify-center size-7 rounded-md bg-purple-500/10">
                  <BarChart3 className="size-4 text-purple-500 dark:text-purple-400" />
                </div>
                <div>
                  <CardTitle className="text-sm">
                    Monte Carlo Simulation
                  </CardTitle>
                  <p className="text-[10px] text-muted-foreground">
                    {simulations.toLocaleString()} DCF simulations &middot; Fair value
                    distribution
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Badge
                  variant="outline"
                  className={`text-[10px] font-mono ${pnlColor(meanVsPrice)}`}
                >
                  {meanVsPrice >= 0 ? (
                    <TrendingUp className="size-3 mr-0.5" />
                  ) : (
                    <TrendingDown className="size-3 mr-0.5" />
                  )}
                  {fmtPercent(meanVsPrice)} vs Price
                </Badge>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => void fetchData()}
                  className="size-7 p-0"
                  title="Re-run simulation"
                >
                  <RefreshCw className="size-3.5 text-muted-foreground" />
                </Button>
              </div>
            </div>
          </CardHeader>

          <CardContent className="space-y-4">
            {/* ── Histogram Chart ───────────────────────────────── */}
            <div className="relative">
              {/* Confidence interval band */}
              <ConfidenceBand
                lower={confidenceInterval.lower}
                upper={confidenceInterval.upper}
                rangeMin={rangeMin}
                rangeMax={rangeMax}
              />

              {/* Chart area */}
              <div className="relative" style={{ height: CHART_HEIGHT }}>
                {/* Bars container */}
                <div
                  className="absolute flex items-end gap-[2px] z-[5]"
                  style={{
                    height: '100%',
                    left: PADDING_X,
                    right: PADDING_X,
                  }}
                >
                  {distribution.map((bin, i) => {
                    const isAbove = bin.midpoint >= currentPrice;
                    return (
                      <HistogramBar
                        key={`${bin.min}-${bin.max}`}
                        bin={bin}
                        maxCount={maxCount}
                        isAboveCurrentPrice={isAbove}
                        index={i}
                      />
                    );
                  })}
                </div>

                {/* Percentile markers */}
                <PercentileMarker
                  label={`P5: ${compactPrice(results.percentiles.p5)}`}
                  price={results.percentiles.p5}
                  rangeMin={rangeMin}
                  rangeMax={rangeMax}
                  variant="minor"
                />
                <PercentileMarker
                  label={`P25: ${compactPrice(results.percentiles.p25)}`}
                  price={results.percentiles.p25}
                  rangeMin={rangeMin}
                  rangeMax={rangeMax}
                  variant="minor"
                />
                <PercentileMarker
                  label={`P50: ${compactPrice(results.percentiles.p50)}`}
                  price={results.percentiles.p50}
                  rangeMin={rangeMin}
                  rangeMax={rangeMax}
                  variant="major"
                />
                <PercentileMarker
                  label={`P75: ${compactPrice(results.percentiles.p75)}`}
                  price={results.percentiles.p75}
                  rangeMin={rangeMin}
                  rangeMax={rangeMax}
                  variant="minor"
                />
                <PercentileMarker
                  label={`P95: ${compactPrice(results.percentiles.p95)}`}
                  price={results.percentiles.p95}
                  rangeMin={rangeMin}
                  rangeMax={rangeMax}
                  variant="minor"
                />

                {/* Current price line */}
                <CurrentPriceLine
                  price={currentPrice}
                  rangeMin={rangeMin}
                  rangeMax={rangeMax}
                  currency="EGP"
                />
              </div>

              {/* ── X-axis labels ───────────────────────────────── */}
              <div
                className="flex justify-between mt-1.5"
                style={{
                  paddingLeft: PADDING_X,
                  paddingRight: PADDING_X,
                }}
              >
                {xLabels.map((label, i) => (
                  <span
                    key={i}
                    className="text-[9px] text-muted-foreground font-mono tabular-nums"
                  >
                    {label}
                  </span>
                ))}
              </div>
            </div>

            {/* ── Legend ────────────────────────────────────────── */}
            <div className="flex items-center flex-wrap gap-x-4 gap-y-1 pt-1 border-t">
              <div className="flex items-center gap-1.5">
                <span className="size-2.5 rounded-sm bg-emerald-500/70" />
                <span className="text-[10px] text-muted-foreground">
                  Above Current Price
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="size-2.5 rounded-sm bg-red-500/50" />
                <span className="text-[10px] text-muted-foreground">
                  Below Current Price
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="size-2.5 rounded-sm border border-dashed border-sky-400 dark:border-sky-500" />
                <span className="text-[10px] text-muted-foreground">
                  Current Price ({fmtCurrency(currentPrice)})
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="size-2.5 rounded-sm bg-purple-500/15 border border-purple-500/25" />
                <span className="text-[10px] text-muted-foreground">
                  90% Confidence Band
                </span>
              </div>
            </div>

            {/* ── Stats Cards ──────────────────────────────────── */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
              <StatCard
                icon={Sigma}
                label="Mean"
                value={fmtCurrency(results.mean)}
                subtext={`+${fmtPercent(meanVsPrice)} from price`}
                colorClass="text-purple-500 dark:text-purple-400"
              />
              <StatCard
                icon={Target}
                label="Median (P50)"
                value={fmtCurrency(results.median)}
                subtext={`P25: ${fmtCurrency(results.percentiles.p25)}`}
                colorClass="text-amber-500 dark:text-amber-400"
              />
              <StatCard
                icon={Activity}
                label="Std Deviation"
                value={fmtCurrency(results.std)}
                subtext={`CV: ${results.mean > 0 ? ((results.std / results.mean) * 100).toFixed(1) : '—'}%`}
                colorClass="text-sky-500 dark:text-sky-400"
              />
              <StatCard
                icon={Percent}
                label="Prob. of Upside"
                value={`${upsidePercent.toFixed(1)}%`}
                subtext={`${simulations.toLocaleString()} simulations`}
                colorClass={
                  probabilityOfUpside >= 0.5
                    ? 'text-emerald-500 dark:text-emerald-400'
                    : 'text-red-500 dark:text-red-400'
                }
              />
              <StatCard
                icon={Layers}
                label="90% CI"
                value={`${fmtCurrency(confidenceInterval.lower)}`}
                subtext={`to ${fmtCurrency(confidenceInterval.upper)}`}
                colorClass="text-purple-500 dark:text-purple-400"
              />
            </div>

            {/* ── Upside probability bar ───────────────────────── */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.5, delay: 1 }}
              className="pt-2 border-t"
            >
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">
                  Probability Distribution vs Current Price
                </span>
                <span
                  className={`text-xs font-semibold font-mono tabular-nums ${pnlColor(upsidePercent - 50)}`}
                >
                  {upsidePercent.toFixed(1)}% upside
                </span>
              </div>
              <div className="h-2 w-full rounded-full overflow-hidden bg-muted flex">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${upsidePercent}%` }}
                  transition={{ duration: 0.8, delay: 1.1, ease: 'easeOut' }}
                  className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-emerald-500 dark:from-emerald-500 dark:to-emerald-600"
                />
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${100 - upsidePercent}%` }}
                  transition={{ duration: 0.8, delay: 1.1, ease: 'easeOut' }}
                  className="h-full rounded-full bg-gradient-to-r from-red-400 to-red-500 dark:from-red-500 dark:to-red-600"
                />
              </div>
              <div className="flex items-center justify-between mt-1">
                <span className="text-[9px] text-red-500/70 dark:text-red-400/70 font-mono">
                  P5: {fmtCurrency(results.percentiles.p5)}
                </span>
                <span className="text-[9px] text-muted-foreground font-mono">
                  Current: {fmtCurrency(currentPrice)}
                </span>
                <span className="text-[9px] text-emerald-500/70 dark:text-emerald-400/70 font-mono">
                  P95: {fmtCurrency(results.percentiles.p95)}
                </span>
              </div>
            </motion.div>
          </CardContent>
        </Card>
      </motion.div>
    </AnimatePresence>
  );
}
