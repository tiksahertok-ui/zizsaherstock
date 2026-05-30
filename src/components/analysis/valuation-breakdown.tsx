'use client';

import React from 'react';
import {
  TrendingUp, TrendingDown, Minus, Calculator, GitCompareArrows,
  Banknote, Building2, Info,
} from 'lucide-react';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import { fmtCurrency, fmtPercent, pnlColor, fmtNumber } from '@/utils/formatters';
import type { FairValueResult, DCFResult, RelativeResult, DDMResult, AssetResult } from '@/lib/fair-value-engine';

// ── Types ──────────────────────────────────────────────────────

interface ValuationBreakdownProps {
  result: FairValueResult;
  currentPrice: number;
}

// ── Helpers ─────────────────────────────────────────────────────

function modelUpside(modelValue: number, currentPrice: number) {
  if (modelValue <= 0 || currentPrice <= 0) return null;
  return ((modelValue - currentPrice) / currentPrice) * 100;
}

function indicatorDot(value: number | null) {
  if (value === null || value === undefined) return null;
  const color = value > 15
    ? 'text-emerald-500'
    : value < -15
      ? 'text-red-500'
      : 'text-amber-500';
  const icon = value > 15
    ? <TrendingUp className="size-3.5" />
    : value < -15
      ? <TrendingDown className="size-3.5" />
      : <Minus className="size-3.5" />;
  return <span className={`${color}`}>{icon}</span>;
}

function DataRow({ label, value, muted }: { label: string; value: string | number | null; muted?: boolean }) {
  return (
    <div className="flex justify-between items-center py-1">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className={`text-xs font-mono tabular-nums ${muted ? 'text-muted-foreground' : 'font-medium'}`}>
        {value ?? '—'}
      </span>
    </div>
  );
}

// ── DCF Card ────────────────────────────────────────────────────

function DCFCard({ dcf, currentPrice }: { dcf: DCFResult | null; currentPrice: number }) {
  const upside = dcf ? modelUpside(dcf.intrinsicValue, currentPrice) : null;
  return (
    <Card className="py-4 gap-3">
      <CardHeader className="pb-0 pt-0 px-4">
        <CardTitle className="text-sm flex items-center gap-2">
          <div className="size-7 rounded-md bg-emerald-500/10 flex items-center justify-center">
            <Calculator className="size-3.5 text-emerald-600 dark:text-emerald-400" />
          </div>
          <span>DCF Model</span>
          {indicatorDot(upside)}
        </CardTitle>
      </CardHeader>
      <CardContent className="px-4 pt-0">
        {dcf ? (
          <div className="space-y-0.5">
            <DataRow label="Intrinsic Value" value={fmtCurrency(dcf.intrinsicValue)} />
            <DataRow label="Upside vs Price" value={upside !== null ? fmtPercent(upside) : null} />
            <Separator className="my-1.5" />
            <DataRow label="WACC" value={`${(dcf.wacc * 100).toFixed(1)}%`} muted />
            <DataRow label="Growth Rate" value={`${(dcf.growthRate * 100).toFixed(1)}%`} muted />
            <DataRow label="FCF Yield" value={`${(dcf.fcfYield * 100).toFixed(1)}%`} muted />
            <DataRow label="Terminal Value" value={fmtCurrency(dcf.terminalValue)} muted />
          </div>
        ) : (
          <p className="text-xs text-muted-foreground italic">Insufficient data for DCF</p>
        )}
      </CardContent>
    </Card>
  );
}

// ── Relative Card ───────────────────────────────────────────────

function RelativeCard({ relative, currentPrice }: { relative: RelativeResult | null; currentPrice: number }) {
  const upside = relative ? modelUpside(relative.weightedValue, currentPrice) : null;
  return (
    <Card className="py-4 gap-3">
      <CardHeader className="pb-0 pt-0 px-4">
        <CardTitle className="text-sm flex items-center gap-2">
          <div className="size-7 rounded-md bg-blue-500/10 flex items-center justify-center">
            <GitCompareArrows className="size-3.5 text-blue-600 dark:text-blue-400" />
          </div>
          <span>Relative Valuation</span>
          {indicatorDot(upside)}
        </CardTitle>
      </CardHeader>
      <CardContent className="px-4 pt-0">
        {relative ? (
          <div className="space-y-0.5">
            <DataRow label="Weighted Value" value={fmtCurrency(relative.weightedValue)} />
            <DataRow label="Upside vs Price" value={upside !== null ? fmtPercent(upside) : null} />
            <Separator className="my-1.5" />
            <div className="flex justify-between items-center py-1">
              <span className="text-xs text-muted-foreground">P/E Fair Value</span>
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-muted-foreground">(Sect. Avg: {relative.sectorAvgPE.toFixed(1)}x)</span>
                <span className="text-xs font-mono tabular-nums font-medium">{fmtCurrency(relative.peFairValue)}</span>
              </div>
            </div>
            <div className="flex justify-between items-center py-1">
              <span className="text-xs text-muted-foreground">P/B Fair Value</span>
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-muted-foreground">(Sect. Avg: {relative.sectorAvgPB.toFixed(1)}x)</span>
                <span className="text-xs font-mono tabular-nums font-medium">{fmtCurrency(relative.pbFairValue)}</span>
              </div>
            </div>
            <div className="flex justify-between items-center py-1">
              <span className="text-xs text-muted-foreground">EV/EBITDA FV</span>
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-muted-foreground">(Sect. Avg: {relative.sectorAvgEVEbitda.toFixed(1)}x)</span>
                <span className="text-xs font-mono tabular-nums font-medium">{fmtCurrency(relative.evEbitdaFairValue)}</span>
              </div>
            </div>
            <div className="flex justify-between items-center py-1">
              <span className="text-xs text-muted-foreground">P/S Fair Value</span>
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-muted-foreground">(Sect. Avg: {relative.sectorAvgPS.toFixed(1)}x)</span>
                <span className="text-xs font-mono tabular-nums font-medium">{fmtCurrency(relative.psFairValue)}</span>
              </div>
            </div>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground italic">Insufficient data for relative valuation</p>
        )}
      </CardContent>
    </Card>
  );
}

// ── DDM Card ─────────────────────────────────────────────────────

function DDMCard({ ddm, currentPrice }: { ddm: DDMResult | null; currentPrice: number }) {
  const upside = ddm ? modelUpside(ddm.intrinsicValue, currentPrice) : null;
  return (
    <Card className="py-4 gap-3">
      <CardHeader className="pb-0 pt-0 px-4">
        <CardTitle className="text-sm flex items-center gap-2">
          <div className="size-7 rounded-md bg-amber-500/10 flex items-center justify-center">
            <Banknote className="size-3.5 text-amber-600 dark:text-amber-400" />
          </div>
          <span>Dividend Model</span>
          {indicatorDot(upside)}
        </CardTitle>
      </CardHeader>
      <CardContent className="px-4 pt-0">
        {ddm ? (
          <div className="space-y-0.5">
            <DataRow label="Intrinsic Value" value={fmtCurrency(ddm.intrinsicValue)} />
            <DataRow label="Upside vs Price" value={upside !== null ? fmtPercent(upside) : null} />
            <Separator className="my-1.5" />
            <DataRow label="Div. Growth Rate" value={`${ddm.dividendGrowthRate.toFixed(1)}%`} muted />
            <DataRow label="Required Return" value={`${(ddm.requiredReturn * 100).toFixed(1)}%`} muted />
            <DataRow label="Payout Ratio" value={`${ddm.payoutRatio.toFixed(0)}%`} muted />
          </div>
        ) : (
          <p className="text-xs text-muted-foreground italic">No dividend data for DDM</p>
        )}
      </CardContent>
    </Card>
  );
}

// ── Asset Card ─────────────────────────────────────────────────

function AssetCard({ asset, currentPrice }: { asset: AssetResult | null; currentPrice: number }) {
  const upside = asset ? modelUpside(asset.intrinsicValue, currentPrice) : null;
  return (
    <Card className="py-4 gap-3">
      <CardHeader className="pb-0 pt-0 px-4">
        <CardTitle className="text-sm flex items-center gap-2">
          <div className="size-7 rounded-md bg-purple-500/10 flex items-center justify-center">
            <Building2 className="size-3.5 text-purple-600 dark:text-purple-400" />
          </div>
          <span>Asset-Based</span>
          {indicatorDot(upside)}
        </CardTitle>
      </CardHeader>
      <CardContent className="px-4 pt-0">
        {asset ? (
          <div className="space-y-0.5">
            <DataRow label="Intrinsic Value" value={fmtCurrency(asset.intrinsicValue)} />
            <DataRow label="Upside vs Price" value={upside !== null ? fmtPercent(upside) : null} />
            <Separator className="my-1.5" />
            <DataRow label="Book Value/Share" value={fmtCurrency(asset.bookValuePerShare)} muted />
            <DataRow label="Adjusted BVPS" value={fmtCurrency(asset.adjustedBVPS)} muted />
            <DataRow label="ROE Premium" value={`${asset.premium > 0 ? '+' : ''}${asset.premium.toFixed(1)}%`} muted />
          </div>
        ) : (
          <p className="text-xs text-muted-foreground italic">No book value data</p>
        )}
      </CardContent>
    </Card>
  );
}

// ── Skeleton ────────────────────────────────────────────────────

function BreakdownSkeleton() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <Card key={i} className="py-4 gap-3">
          <CardHeader className="pb-0 pt-0 px-4">
            <div className="flex items-center gap-2">
              <Skeleton className="size-7 rounded-md" />
              <Skeleton className="h-4 w-24" />
            </div>
          </CardHeader>
          <CardContent className="px-4 pt-0 space-y-1.5">
            <Skeleton className="h-3.5 w-full" />
            <Skeleton className="h-3.5 w-full" />
            <Skeleton className="h-3.5 w-3/4" />
            <Skeleton className="h-3.5 w-full" />
            <Skeleton className="h-3.5 w-5/6" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// ── Main Component ──────────────────────────────────────────────

export default function ValuationBreakdown({ result, currentPrice }: ValuationBreakdownProps) {
  if (!result) return <BreakdownSkeleton />;

  const { dcf, relative, ddm, asset, modelWeights, weightedFairValue } = result;
  const activeModels = [dcf, relative, ddm, asset].filter(Boolean).length;

  return (
    <div className="space-y-4">
      {/* Model Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <DCFCard dcf={dcf} currentPrice={currentPrice} />
        <RelativeCard relative={relative} currentPrice={currentPrice} />
        <DDMCard ddm={ddm} currentPrice={currentPrice} />
        <AssetCard asset={asset} currentPrice={currentPrice} />
      </div>

      {/* Weighted Average Bar */}
      {weightedFairValue > 0 && activeModels > 0 && (
        <Card className="py-3 px-4">
          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <div className="flex items-center gap-2 text-sm">
              <Info className="size-4 text-muted-foreground" />
              <span className="text-muted-foreground font-medium">Weighted Fair Value</span>
            </div>

            {/* Model weight indicators */}
            <div className="flex-1 flex items-center gap-1">
              {modelWeights.dcf > 0 && (
                <div
                  className="h-2 rounded-l-full bg-emerald-500/70"
                  style={{ width: `${modelWeights.dcf * 100}%` }}
                  title={`DCF: ${(modelWeights.dcf * 100).toFixed(0)}%`}
                />
              )}
              {modelWeights.relative > 0 && (
                <div
                  className="h-2 bg-blue-500/70"
                  style={{ width: `${modelWeights.relative * 100}%` }}
                  title={`Relative: ${(modelWeights.relative * 100).toFixed(0)}%`}
                />
              )}
              {modelWeights.ddm > 0 && (
                <div
                  className="h-2 bg-amber-500/70"
                  style={{ width: `${modelWeights.ddm * 100}%` }}
                  title={`DDM: ${(modelWeights.ddm * 100).toFixed(0)}%`}
                />
              )}
              {modelWeights.asset > 0 && (
                <div
                  className="h-2 rounded-r-full bg-purple-500/70"
                  style={{ width: `${modelWeights.asset * 100}%` }}
                  title={`Asset: ${(modelWeights.asset * 100).toFixed(0)}%`}
                />
              )}
            </div>

            <div className="flex items-center gap-3">
              <span className="text-sm font-bold font-mono tabular-nums">
                {fmtCurrency(weightedFairValue)}
              </span>
              <span className={`text-xs font-semibold font-mono tabular-nums ${pnlColor(result.weightedUpside)}`}>
                {fmtPercent(result.weightedUpside)}
              </span>
            </div>
          </div>

          {/* Weight Legend */}
          <div className="flex flex-wrap items-center gap-3 mt-2">
            {[
              { key: 'DCF', weight: modelWeights.dcf, color: 'bg-emerald-500/70' },
              { key: 'Relative', weight: modelWeights.relative, color: 'bg-blue-500/70' },
              { key: 'DDM', weight: modelWeights.ddm, color: 'bg-amber-500/70' },
              { key: 'Asset', weight: modelWeights.asset, color: 'bg-purple-500/70' },
            ].map(m => m.weight > 0 ? (
              <div key={m.key} className="flex items-center gap-1.5">
                <span className={`size-2 rounded-sm ${m.color}`} />
                <span className="text-[10px] text-muted-foreground">
                  {m.key} {(m.weight * 100).toFixed(0)}%
                </span>
              </div>
            ) : null)}
          </div>
        </Card>
      )}
    </div>
  );
}
