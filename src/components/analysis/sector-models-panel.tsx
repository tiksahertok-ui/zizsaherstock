'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import {
  Building2, Calculator, GitCompareArrows, Banknote, Layers,
  TrendingUp, TrendingDown, Minus, Shield, Info, AlertTriangle,
  RefreshCw, Target, BarChart3, Percent, ArrowUpRight, ArrowDownRight,
  Activity, Scale,
} from 'lucide-react';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import { Button } from '@/components/ui/button';
import { fmtCurrency, fmtPercent, fmtNumber } from '@/utils/formatters';

// ══════════════════════════════════════════════════════════════════════
// Types — mirrors the API response shape
// ══════════════════════════════════════════════════════════════════════

interface SectorModelsPanelProps {
  symbol: string;
}

interface SelectedModelBreakdown {
  model: string;
  fairValue: number;
  weight: number;       // percentage (e.g., 30.0)
  confidence: number;  // percentage (e.g., 75.0)
  assumptions: Record<string, number>;
}

interface ValuationConfidenceSummary {
  level: string;
  score: number;
}

interface TransparentAssumptionItem {
  value: number;  // already in percentage form
  source: string;
}

interface TransparentAssumptionsSummary {
  discountRate: TransparentAssumptionItem;
  growthRate: TransparentAssumptionItem;
  terminalGrowth: TransparentAssumptionItem;
  countryRiskPremium: TransparentAssumptionItem;
}

interface WACCDetails {
  costOfEquity: number;       // decimal
  costOfDebt: number;         // decimal
  wacc: number;               // decimal
  riskFreeRate: number;       // decimal
  beta: number;
  equityRiskPremium: number;  // decimal
  countryRiskPremium: number; // decimal
  sizePremium: number;        // decimal
  taxRate: number;            // decimal
  debtRatio: number;          // decimal
  equityRatio: number;        // decimal
  assumptions: {
    riskFreeSource: string;
    betaSource: string;
    crpMethodology: string;
    sizePremMethodology: string;
  };
}

interface SectorBenchmark {
  sector: string;
  avgPE: number;
  avgPB: number;
  avgEV_EBITDA: number;
  avgROE: number;
  count: number;
}

interface StockSectorValuationResponse {
  symbol: string;
  name: string;
  sector: string;
  selectedModels: SelectedModelBreakdown[];
  compositeFairValue: number;
  upside: number;
  valuationConfidence: ValuationConfidenceSummary;
  transparentAssumptions: TransparentAssumptionsSummary;
  waccDetails: WACCDetails;
  sectorBenchmark: SectorBenchmark;
}

// ══════════════════════════════════════════════════════════════════════
// Constants & Mappings
// ══════════════════════════════════════════════════════════════════════

/** Map internal model names to human-readable labels */
const MODEL_LABELS: Record<string, string> = {
  roe_based: 'ROE-Based',
  excess_return: 'EVA (Excess Return)',
  nav: 'NAV Valuation',
  adjusted_nav: 'Adjusted NAV',
  sotp: 'SOTP',
  revenue_multiple: 'Revenue Multiple',
  peg: 'PEG Valuation',
  gordon_ddm: 'Gordon DDM',
  dcf: 'DCF',
  relative_pe: 'P/E Relative',
  relative_pb: 'P/B Relative',
  relative_ev_ebitda: 'EV/EBITDA Relative',
  relative_ps: 'P/S Relative',
  ddm: 'DDM',
  asset_based: 'Asset-Based',
};

/** Map internal model names to icon elements */
const MODEL_ICONS: Record<string, React.ReactNode> = {
  roe_based: <TrendingUp className="size-3.5" />,
  excess_return: <Activity className="size-3.5" />,
  nav: <Layers className="size-3.5" />,
  adjusted_nav: <Layers className="size-3.5" />,
  sotp: <Layers className="size-3.5" />,
  revenue_multiple: <BarChart3 className="size-3.5" />,
  peg: <Target className="size-3.5" />,
  gordon_ddm: <Banknote className="size-3.5" />,
  dcf: <Calculator className="size-3.5" />,
  relative_pe: <GitCompareArrows className="size-3.5" />,
  relative_pb: <Scale className="size-3.5" />,
  relative_ev_ebitda: <GitCompareArrows className="size-3.5" />,
  relative_ps: <GitCompareArrows className="size-3.5" />,
  ddm: <Banknote className="size-3.5" />,
  asset_based: <Building2 className="size-3.5" />,
};

/** Distinct color scheme per model (tailwind classes) */
const MODEL_COLORS: Record<string, { bg: string; icon: string; badge: string }> = {
  roe_based:         { bg: 'bg-emerald-500/10', icon: 'text-emerald-600 dark:text-emerald-400', badge: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800' },
  excess_return:     { bg: 'bg-teal-500/10', icon: 'text-teal-600 dark:text-teal-400', badge: 'bg-teal-500/15 text-teal-700 dark:text-teal-400 border-teal-200 dark:border-teal-800' },
  nav:               { bg: 'bg-purple-500/10', icon: 'text-purple-600 dark:text-purple-400', badge: 'bg-purple-500/15 text-purple-700 dark:text-purple-400 border-purple-200 dark:border-purple-800' },
  adjusted_nav:      { bg: 'bg-fuchsia-500/10', icon: 'text-fuchsia-600 dark:text-fuchsia-400', badge: 'bg-fuchsia-500/15 text-fuchsia-700 dark:text-fuchsia-400 border-fuchsia-200 dark:border-fuchsia-800' },
  sotp:              { bg: 'bg-violet-500/10', icon: 'text-violet-600 dark:text-violet-400', badge: 'bg-violet-500/15 text-violet-700 dark:text-violet-400 border-violet-200 dark:border-violet-800' },
  revenue_multiple:  { bg: 'bg-cyan-500/10', icon: 'text-cyan-600 dark:text-cyan-400', badge: 'bg-cyan-500/15 text-cyan-700 dark:text-cyan-400 border-cyan-200 dark:border-cyan-800' },
  peg:               { bg: 'bg-orange-500/10', icon: 'text-orange-600 dark:text-orange-400', badge: 'bg-orange-500/15 text-orange-700 dark:text-orange-400 border-orange-200 dark:border-orange-800' },
  gordon_ddm:        { bg: 'bg-amber-500/10', icon: 'text-amber-600 dark:text-amber-400', badge: 'bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-800' },
  dcf:               { bg: 'bg-emerald-500/10', icon: 'text-emerald-600 dark:text-emerald-400', badge: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800' },
  relative_pe:       { bg: 'bg-sky-500/10', icon: 'text-sky-600 dark:text-sky-400', badge: 'bg-sky-500/15 text-sky-700 dark:text-sky-400 border-sky-200 dark:border-sky-800' },
  relative_pb:       { bg: 'bg-indigo-500/10', icon: 'text-indigo-600 dark:text-indigo-400', badge: 'bg-indigo-500/15 text-indigo-700 dark:text-indigo-400 border-indigo-200 dark:border-indigo-800' },
  relative_ev_ebitda:{ bg: 'bg-blue-500/10', icon: 'text-blue-600 dark:text-blue-400', badge: 'bg-blue-500/15 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-800' },
  relative_ps:       { bg: 'bg-lime-500/10', icon: 'text-lime-600 dark:text-lime-400', badge: 'bg-lime-500/15 text-lime-700 dark:text-lime-400 border-lime-200 dark:border-lime-800' },
  ddm:               { bg: 'bg-amber-500/10', icon: 'text-amber-600 dark:text-amber-400', badge: 'bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-800' },
  asset_based:       { bg: 'bg-rose-500/10', icon: 'text-rose-600 dark:text-rose-400', badge: 'bg-rose-500/15 text-rose-700 dark:text-rose-400 border-rose-200 dark:border-rose-800' },
};

/** Fallback color scheme for unknown models */
const DEFAULT_MODEL_COLORS = { bg: 'bg-muted', icon: 'text-muted-foreground', badge: 'bg-muted text-muted-foreground border-border' };

/** Sector description snippets for the info card */
const SECTOR_DESCRIPTIONS: Record<string, string> = {
  'Financials': 'Egyptian banks trade primarily on P/BV. ROE-based and DDM models carry high weight given stable dividend streams and interest rate sensitivity.',
  'Materials': 'Cyclical sector tied to construction demand. EV/EBITDA and DCF preferred over P/E due to debt variability across the commodity cycle.',
  'Real Estate': 'NAV-based valuation is primary for Egyptian developers. P/B and adjusted NAV carry significant weight given land bank assets and development pipelines.',
  'Healthcare': 'Growth sector driven by demographics. PEG and DCF carry higher weight reflecting expansion potential with moderate leverage typical.',
  'Consumer Defensive': 'Stable demand with inflation-linked pricing power. Balanced model weights reflect predictable cash flows and long dividend histories.',
  'Industrials': 'Broad sector tied to infrastructure spending. EV/EBITDA and DCF preferred for capital-intensive businesses with longer projection horizons.',
  'Consumer Discretionary': 'Highly sensitive to consumer confidence. P/S and growth models carry higher weight reflecting margin variability and expansion potential.',
  'Technology': 'Small but growing sector. PEG ratio is critical for growth stocks. Highest DCF weight with low DDM — most reinvest rather than pay dividends.',
  'Energy': 'Commodity-linked with high dividend yields. EV/EBITDA and DDM carry higher weight given stable but capital-intensive cash flow profiles.',
  'Communication Services': 'Dominant operators have near-monopoly characteristics. Moderate growth from data services drives balanced model weighting.',
  'Utilities': 'Regulated sector with stable cash flows. DDM and asset-based models are primary given regulated yield characteristics and high debt ratios.',
};

// ══════════════════════════════════════════════════════════════════════
// Helpers
// ══════════════════════════════════════════════════════════════════════

function confidenceColor(score: number): string {
  if (score >= 70) return 'text-emerald-600 dark:text-emerald-400';
  if (score >= 50) return 'text-amber-600 dark:text-amber-400';
  return 'text-red-600 dark:text-red-400';
}

function confidenceLevelColor(level: string): string {
  switch (level.toLowerCase()) {
    case 'high': return 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800';
    case 'medium': return 'bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-800';
    case 'low': return 'bg-red-500/15 text-red-700 dark:text-red-400 border-red-200 dark:border-red-800';
    default: return 'bg-muted text-muted-foreground border-border';
  }
}

function formatAssumptionKey(key: string): string {
  return key
    .replace(/([A-Z])/g, ' $1')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase())
    .trim();
}

function formatAssumptionValue(key: string, value: number): string {
  // Rates and ratios as percentages
  if (['CoE', 'ROE', 'GrowthRate', 'WACC', 'TerminalGrowth', 'DPS', 'DividendYield', 'EPS'].includes(key)) {
    return `${(value * 100).toFixed(2)}%`;
  }
  // Large numbers as currency
  if (value > 1_000_000) return fmtCurrency(value);
  // Small ratios
  if (value < 1 && value > 0) return value.toFixed(4);
  return fmtNumber(value);
}

function getModelColors(modelKey: string) {
  return MODEL_COLORS[modelKey] ?? DEFAULT_MODEL_COLORS;
}

function pnlTextColor(value: number): string {
  if (value > 0) return 'text-emerald-600 dark:text-emerald-400';
  if (value < 0) return 'text-red-600 dark:text-red-400';
  return 'text-muted-foreground';
}

// ══════════════════════════════════════════════════════════════════════
// Animation Variants
// ══════════════════════════════════════════════════════════════════════

const fadeUp = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.35, ease: 'easeOut' as const },
};

const stagger = {
  animate: { transition: { staggerChildren: 0.06 } },
};

// ══════════════════════════════════════════════════════════════════════
// Sub-Components
// ══════════════════════════════════════════════════════════════════════

// ── Data Row ──────────────────────────────────────────────────────────

function DataRow({
  label,
  value,
  muted,
}: {
  label: string;
  value: string | number | null | undefined;
  muted?: boolean;
}) {
  return (
    <div className="flex justify-between items-center py-1">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className={`text-xs font-mono tabular-nums ${muted ? 'text-muted-foreground' : 'font-medium'}`}>
        {value ?? '—'}
      </span>
    </div>
  );
}

// ── Sector Info Card ──────────────────────────────────────────────────

function SectorInfoCard({ data }: { data: StockSectorValuationResponse }) {
  const description = SECTOR_DESCRIPTIONS[data.sector]
    || 'Sector-specific valuation models selected based on industry characteristics, capital structure, and cash flow profile.';

  return (
    <motion.div {...fadeUp}>
      <Card className="py-3 px-4">
        <CardHeader className="pb-2 pt-0 px-0 gap-1">
          <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
            <Building2 className="size-3" />
            Sector Valuation Models
            <Badge variant="secondary" className="text-[10px] ml-1">{data.sector}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="px-0 pt-0 space-y-3">
          {/* Composite Summary */}
          <div className="flex items-center gap-3">
            <div>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Composite Fair Value</p>
              <p className="text-lg font-bold font-mono tabular-nums">{fmtCurrency(data.compositeFairValue)}</p>
            </div>
            <div className="h-8 w-px bg-border" />
            <div>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Upside</p>
              <div className="flex items-center gap-1">
                {data.upside > 0 ? (
                  <ArrowUpRight className="size-3.5 text-emerald-600 dark:text-emerald-400" />
                ) : data.upside < 0 ? (
                  <ArrowDownRight className="size-3.5 text-red-600 dark:text-red-400" />
                ) : (
                  <Minus className="size-3.5 text-muted-foreground" />
                )}
                <span className={`text-sm font-semibold font-mono tabular-nums ${pnlTextColor(data.upside)}`}>
                  {fmtPercent(data.upside)}
                </span>
              </div>
            </div>
            <div className="h-8 w-px bg-border" />
            <div>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Confidence</p>
              <Badge variant="outline" className={`text-[10px] ${confidenceLevelColor(data.valuationConfidence.level)}`}>
                {data.valuationConfidence.level} ({data.valuationConfidence.score}%)
              </Badge>
            </div>
          </div>

          {/* Sector description */}
          <p className="text-xs text-muted-foreground leading-relaxed">
            {description}
          </p>

          {/* Model weight bar */}
          {data.selectedModels.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Model Weights</p>
              <div className="flex items-center gap-0.5 h-2 rounded-full overflow-hidden">
                {data.selectedModels.map((m) => {
                  const colors = getModelColors(m.model);
                  return (
                    <div
                      key={m.model}
                      className={`h-full ${colors.bg} transition-all duration-500`}
                      style={{ width: `${m.weight}%`, minWidth: 4 }}
                      title={`${MODEL_LABELS[m.model] || m.model}: ${m.weight.toFixed(0)}%`}
                    />
                  );
                })}
              </div>
              <div className="flex flex-wrap gap-x-3 gap-y-1">
                {data.selectedModels.map((m) => {
                  const colors = getModelColors(m.model);
                  return (
                    <div key={m.model} className="flex items-center gap-1.5">
                      <span className={`size-2 rounded-sm ${colors.bg} ${colors.icon}`} />
                      <span className="text-[10px] text-muted-foreground">
                        {MODEL_LABELS[m.model] || m.model} ({m.weight.toFixed(0)}%)
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}

// ── Model Breakdown Card ──────────────────────────────────────────────

function ModelBreakdownCard({
  model,
  index,
}: {
  model: SelectedModelBreakdown;
  index: number;
}) {
  const label = MODEL_LABELS[model.model] || model.model.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  const icon = MODEL_ICONS[model.model] || <Calculator className="size-3.5" />;
  const colors = getModelColors(model.model);

  return (
    <motion.div
      {...fadeUp}
      transition={{ duration: 0.35, ease: 'easeOut', delay: index * 0.06 }}
    >
      <Card className="py-3 px-4">
        <CardHeader className="pb-0 pt-0 px-0 gap-1">
          <CardTitle className="text-sm flex items-center gap-2">
            <div className={`size-7 rounded-md ${colors.bg} flex items-center justify-center ${colors.icon}`}>
              {icon}
            </div>
            <span className="font-medium">{label}</span>
            <Badge variant="outline" className={`text-[10px] ml-auto ${colors.badge}`}>
              Weight: {model.weight.toFixed(0)}%
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="px-0 pt-2">
          <div className="space-y-0.5">
            {/* Fair Value */}
            <div className="flex justify-between items-center py-1">
              <span className="text-xs text-muted-foreground">Fair Value</span>
              <span className="text-sm font-bold font-mono tabular-nums">
                {fmtCurrency(model.fairValue)}
              </span>
            </div>

            {/* Confidence Score */}
            <div className="flex justify-between items-center py-1">
              <span className="text-xs text-muted-foreground">Confidence</span>
              <div className="flex items-center gap-2">
                <div className="w-16 h-1.5 rounded-full bg-muted overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-700 ${
                      model.confidence >= 70
                        ? 'bg-emerald-500'
                        : model.confidence >= 50
                          ? 'bg-amber-500'
                          : 'bg-red-500'
                    }`}
                    style={{ width: `${model.confidence}%` }}
                  />
                </div>
                <span className={`text-xs font-mono tabular-nums font-medium ${confidenceColor(model.confidence)}`}>
                  {model.confidence.toFixed(0)}%
                </span>
              </div>
            </div>

            <Separator className="my-1" />

            {/* Assumptions */}
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider mt-1">Key Assumptions</p>
            {Object.entries(model.assumptions).map(([key, val]) => (
              <div key={key} className="flex justify-between items-center py-0.5">
                <span className="text-[11px] text-muted-foreground">{formatAssumptionKey(key)}</span>
                <span className="text-[11px] font-mono tabular-nums font-medium">
                  {formatAssumptionValue(key, val)}
                </span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}

// ── WACC Details Card ─────────────────────────────────────────────────

function WACCDetailsCard({ wacc }: { wacc: WACCDetails }) {
  const debtEquityRatio = wacc.equityRatio > 0
    ? wacc.debtRatio / wacc.equityRatio
    : 0;

  return (
    <motion.div {...fadeUp}>
      <Card className="py-3 px-4">
        <CardHeader className="pb-2 pt-0 px-0 gap-1">
          <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
            <Percent className="size-3" />
            WACC (Weighted Average Cost of Capital)
          </CardTitle>
        </CardHeader>
        <CardContent className="px-0 pt-0">
          {/* Primary WACC Values */}
          <div className="grid grid-cols-3 gap-3 mb-3">
            <div className="text-center p-2 rounded-lg bg-primary/5">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Cost of Equity</p>
              <p className="text-sm font-bold font-mono tabular-nums">{(wacc.costOfEquity * 100).toFixed(2)}%</p>
            </div>
            <div className="text-center p-2 rounded-lg bg-primary/5">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Cost of Debt</p>
              <p className="text-sm font-bold font-mono tabular-nums">{(wacc.costOfDebt * 100).toFixed(2)}%</p>
            </div>
            <div className="text-center p-2 rounded-lg bg-primary/10 ring-1 ring-primary/20">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">WACC</p>
              <p className="text-sm font-bold font-mono tabular-nums text-primary">{(wacc.wacc * 100).toFixed(2)}%</p>
            </div>
          </div>

          <Separator className="my-2" />

          {/* Component Breakdown */}
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Component Breakdown</p>
          <div className="grid grid-cols-2 gap-x-4 gap-y-0.5">
            <DataRow label="Risk-Free Rate" value={`${(wacc.riskFreeRate * 100).toFixed(2)}%`} />
            <DataRow label="Beta (β)" value={wacc.beta.toFixed(2)} />
            <DataRow label="Equity Risk Premium" value={`${(wacc.equityRiskPremium * 100).toFixed(2)}%`} />
            <DataRow label="Country Risk Premium" value={`${(wacc.countryRiskPremium * 100).toFixed(2)}%`} />
            <DataRow label="Size Premium" value={`${(wacc.sizePremium * 100).toFixed(2)}%`} />
            <DataRow label="Tax Rate" value={`${(wacc.taxRate * 100).toFixed(1)}%`} />
            <DataRow label="Equity Ratio (E/V)" value={`${(wacc.equityRatio * 100).toFixed(1)}%`} />
            <DataRow label="Debt Ratio (D/V)" value={`${(wacc.debtRatio * 100).toFixed(1)}%`} />
          </div>

          {/* Derived D/E */}
          <Separator className="my-2" />
          <div className="flex justify-between items-center">
            <span className="text-xs text-muted-foreground">Debt / Equity Ratio</span>
            <span className="text-xs font-mono tabular-nums font-medium">{debtEquityRatio.toFixed(2)}x</span>
          </div>

          {/* Sources */}
          <Separator className="my-2" />
          <div className="space-y-1">
            <div className="flex items-start gap-1.5">
              <Info className="size-3 mt-0.5 text-muted-foreground shrink-0" />
              <p className="text-[10px] text-muted-foreground leading-relaxed">
                <span className="font-medium">Rf source:</span> {wacc.assumptions.riskFreeSource}
              </p>
            </div>
            <div className="flex items-start gap-1.5">
              <Info className="size-3 mt-0.5 text-muted-foreground shrink-0" />
              <p className="text-[10px] text-muted-foreground leading-relaxed">
                <span className="font-medium">Beta:</span> {wacc.assumptions.betaSource === 'provided' ? 'User-provided' : 'Sector default'}
              </p>
            </div>
            <div className="flex items-start gap-1.5">
              <Info className="size-3 mt-0.5 text-muted-foreground shrink-0" />
              <p className="text-[10px] text-muted-foreground leading-relaxed">
                <span className="font-medium">CRP:</span> {wacc.assumptions.crpMethodology}
              </p>
            </div>
            <div className="flex items-start gap-1.5">
              <Info className="size-3 mt-0.5 text-muted-foreground shrink-0" />
              <p className="text-[10px] text-muted-foreground leading-relaxed">
                <span className="font-medium">Size premium:</span> {wacc.assumptions.sizePremMethodology}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}

// ── Transparent Assumptions Card ───────────────────────────────────────

function TransparentAssumptionsCard({
  assumptions,
}: {
  assumptions: TransparentAssumptionsSummary;
}) {
  const items: Array<{ key: string; label: string; icon: React.ReactNode; data: TransparentAssumptionItem }> = [
    {
      key: 'discountRate',
      label: 'Discount Rate (WACC)',
      icon: <Percent className="size-3.5 text-emerald-600 dark:text-emerald-400" />,
      data: assumptions.discountRate,
    },
    {
      key: 'growthRate',
      label: 'Growth Rate',
      icon: <TrendingUp className="size-3.5 text-sky-600 dark:text-sky-400" />,
      data: assumptions.growthRate,
    },
    {
      key: 'terminalGrowth',
      label: 'Terminal Growth Rate',
      icon: <Target className="size-3.5 text-amber-600 dark:text-amber-400" />,
      data: assumptions.terminalGrowth,
    },
    {
      key: 'countryRiskPremium',
      label: 'Country Risk Premium',
      icon: <Shield className="size-3.5 text-rose-600 dark:text-rose-400" />,
      data: assumptions.countryRiskPremium,
    },
  ];

  return (
    <motion.div {...fadeUp}>
      <Card className="py-3 px-4">
        <CardHeader className="pb-2 pt-0 px-0 gap-1">
          <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
            <AlertTriangle className="size-3" />
            Transparent Assumptions
          </CardTitle>
        </CardHeader>
        <CardContent className="px-0 pt-0 space-y-2">
          {items.map((item) => (
            <div
              key={item.key}
              className="flex items-start gap-3 p-2 rounded-lg bg-muted/30"
            >
              <div className="size-7 rounded-md bg-background flex items-center justify-center shrink-0 mt-0.5">
                {item.icon}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-medium">{item.label}</p>
                  <span className="text-sm font-bold font-mono tabular-nums shrink-0">
                    {item.data.value.toFixed(2)}%
                  </span>
                </div>
                <p className="text-[10px] text-muted-foreground leading-relaxed mt-0.5">
                  Source: {item.data.source}
                </p>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </motion.div>
  );
}

// ── Sector Benchmark Comparison Card ───────────────────────────────────

function SectorBenchmarkCard({
  benchmark,
  stockMetrics,
}: {
  benchmark: SectorBenchmark;
  stockMetrics?: { pe?: number; pb?: number; evEbitda?: number; roe?: number };
}) {
  const comparisons: Array<{
    label: string;
    stock: number | undefined;
    sector: number;
    invert?: boolean;
  }> = [
    { label: 'P/E', stock: stockMetrics?.pe, sector: benchmark.avgPE },
    { label: 'P/B', stock: stockMetrics?.pb, sector: benchmark.avgPB },
    { label: 'EV/EBITDA', stock: stockMetrics?.evEbitda, sector: benchmark.avgEV_EBITDA },
    { label: 'ROE', stock: stockMetrics?.roe, sector: benchmark.avgROE, invert: true },
  ];

  return (
    <motion.div {...fadeUp}>
      <Card className="py-3 px-4">
        <CardHeader className="pb-2 pt-0 px-0 gap-1">
          <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
            <BarChart3 className="size-3" />
            Sector Benchmark Comparison
            <Badge variant="secondary" className="text-[10px] ml-1">
              {benchmark.sector}
              {benchmark.count > 0 && ` · ${benchmark.count} stocks`}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="px-0 pt-0">
          <div className="space-y-2.5">
            {comparisons.map((comp) => {
              const stockVal = comp.stock;
              const sectorVal = comp.sector;
              const hasStock = stockVal !== undefined && stockVal > 0;
              const diff = hasStock ? stockVal - sectorVal : 0;
              const isPositive = comp.invert ? diff >= 0 : diff < 0;
              const isNeutral = hasStock && Math.abs(diff) < sectorVal * 0.1;
              const diffColor = !hasStock
                ? 'text-muted-foreground'
                : isNeutral
                  ? 'text-muted-foreground'
                  : isPositive
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : 'text-red-600 dark:text-red-400';

              return (
                <div key={comp.label} className="space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium">{comp.label}</span>
                    <div className="flex items-center gap-2">
                      {hasStock && (
                        <>
                          <span className="text-xs font-mono tabular-nums">{stockVal.toFixed(1)}</span>
                          <span className="text-muted-foreground text-[10px]">vs</span>
                          <span className="text-xs font-mono tabular-nums text-muted-foreground">
                            {sectorVal.toFixed(1)}
                          </span>
                          <span className={`text-[10px] font-mono tabular-nums font-medium ${diffColor}`}>
                            ({diff > 0 ? '+' : ''}{diff.toFixed(1)})
                          </span>
                        </>
                      )}
                      {!hasStock && (
                        <span className="text-xs text-muted-foreground">Sector avg: {sectorVal.toFixed(1)}</span>
                      )}
                    </div>
                  </div>
                  {/* Visual bar comparison */}
                  <div className="flex items-center gap-1 h-1.5">
                    {/* Sector average bar */}
                    <div className="flex-1 h-full rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full rounded-full bg-muted-foreground/20"
                        style={{ width: '100%' }}
                      />
                    </div>
                    {/* Stock value indicator */}
                    {hasStock && (
                      <div
                        className={`h-3 w-0.5 rounded-full shrink-0 transition-all duration-500 ${
                          isNeutral ? 'bg-muted-foreground' : isPositive ? 'bg-emerald-500' : 'bg-red-500'
                        }`}
                        style={{
                          marginLeft: `${Math.max(-2, Math.min(2, (diff / sectorVal) * 50))}%`,
                        }}
                      />
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Legend */}
          <div className="flex items-center gap-3 mt-3 pt-2 border-t">
            <div className="flex items-center gap-1.5">
              <span className="size-1.5 rounded-full bg-muted-foreground/20" />
              <span className="text-[10px] text-muted-foreground">Sector Average</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="size-1.5 rounded-full bg-emerald-500" />
              <span className="text-[10px] text-muted-foreground">
                {comparisons[0].invert ? 'Above Sector' : 'Below Sector (Better)'}
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="size-1.5 rounded-full bg-red-500" />
              <span className="text-[10px] text-muted-foreground">
                {comparisons[0].invert ? 'Below Sector' : 'Above Sector (Premium)'}
              </span>
            </div>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}

// ══════════════════════════════════════════════════════════════════════
// Loading Skeleton
// ══════════════════════════════════════════════════════════════════════

function PanelSkeleton() {
  return (
    <div className="space-y-4">
      {/* Sector Info Skeleton */}
      <Card className="py-3 px-4">
        <Skeleton className="h-4 w-48 mb-3" />
        <div className="flex items-center gap-3 mb-3">
          <Skeleton className="h-8 w-24" />
          <Skeleton className="h-8 w-px" />
          <Skeleton className="h-8 w-16" />
          <Skeleton className="h-8 w-px" />
          <Skeleton className="h-6 w-20 rounded-full" />
        </div>
        <Skeleton className="h-3 w-full mb-2" />
        <Skeleton className="h-3 w-3/4 mb-3" />
        <Skeleton className="h-2 w-full rounded-full" />
      </Card>

      {/* Model Cards Skeleton */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <Card key={i} className="py-3 px-4">
            <div className="flex items-center gap-2 mb-2">
              <Skeleton className="size-7 rounded-md" />
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-5 w-16 rounded-full ml-auto" />
            </div>
            <Skeleton className="h-4 w-full mb-2" />
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-3/4" />
            <Skeleton className="h-3 w-5/6" />
          </Card>
        ))}
      </div>

      {/* WACC Skeleton */}
      <Card className="py-3 px-4">
        <Skeleton className="h-4 w-56 mb-3" />
        <div className="grid grid-cols-3 gap-3 mb-3">
          <Skeleton className="h-16 w-full rounded-lg" />
          <Skeleton className="h-16 w-full rounded-lg" />
          <Skeleton className="h-16 w-full rounded-lg" />
        </div>
        <div className="grid grid-cols-2 gap-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-4 w-full" />
          ))}
        </div>
      </Card>

      {/* Assumptions Skeleton */}
      <Card className="py-3 px-4">
        <Skeleton className="h-4 w-48 mb-3" />
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex items-start gap-3 p-2 rounded-lg mb-2">
            <Skeleton className="size-7 rounded-md shrink-0" />
            <div className="flex-1 space-y-1">
              <Skeleton className="h-3 w-32" />
              <Skeleton className="h-2.5 w-full" />
            </div>
          </div>
        ))}
      </Card>

      {/* Benchmark Skeleton */}
      <Card className="py-3 px-4">
        <Skeleton className="h-4 w-48 mb-3" />
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="mb-3">
            <Skeleton className="h-4 w-full mb-1" />
            <Skeleton className="h-1.5 w-full rounded-full" />
          </div>
        ))}
      </Card>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════
// Error State
// ══════════════════════════════════════════════════════════════════════

function ErrorState({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <Card className="border-red-200 dark:border-red-800">
      <CardContent className="flex flex-col items-center justify-center py-10 gap-3">
        <AlertTriangle className="size-8 text-red-500" />
        <p className="text-sm text-red-600 dark:text-red-400 text-center max-w-md">{message}</p>
        <Button variant="outline" size="sm" onClick={onRetry} className="gap-1.5">
          <RefreshCw className="size-3" /> Retry
        </Button>
      </CardContent>
    </Card>
  );
}

// ══════════════════════════════════════════════════════════════════════
// Main Component
// ══════════════════════════════════════════════════════════════════════

export default function SectorModelsPanel({ symbol }: SectorModelsPanelProps) {
  const [data, setData] = useState<StockSectorValuationResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/analysis/sector-valuation?symbol=${encodeURIComponent(symbol)}`,
        { cache: 'no-store' },
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      const json: StockSectorValuationResponse = await res.json();
      setData(json);
    } catch (err) {
      console.error('[SectorModelsPanel] fetch error:', err);
      setError(err instanceof Error ? err.message : 'Failed to load sector valuation data');
    } finally {
      setLoading(false);
    }
  }, [symbol]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  // ── Loading ──
  if (loading) return <PanelSkeleton />;

  // ── Error ──
  if (error) return <ErrorState message={error} onRetry={() => void fetchData()} />;

  // ── No data ──
  if (!data) return null;

  // ── Render ──
  return (
    <motion.section
      className="space-y-4"
      variants={stagger}
      initial="initial"
      animate="animate"
    >
      {/* 1. Sector Info Card */}
      <SectorInfoCard data={data} />

      {/* 2. Model Breakdown Cards */}
      {data.selectedModels.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {data.selectedModels.map((model, idx) => (
            <ModelBreakdownCard key={model.model} model={model} index={idx} />
          ))}
        </div>
      )}

      {/* 3. WACC Details Card */}
      <WACCDetailsCard wacc={data.waccDetails} />

      {/* 4. Transparent Assumptions Section */}
      <TransparentAssumptionsCard assumptions={data.transparentAssumptions} />

      {/* 5. Sector Benchmark Comparison */}
      <SectorBenchmarkCard benchmark={data.sectorBenchmark} />
    </motion.section>
  );
}
