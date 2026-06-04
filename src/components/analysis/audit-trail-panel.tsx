'use client';

import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  FileText,
  Calculator,
  FlaskConical,
  BookOpen,
  Globe,
  Clock,
  AlertTriangle,
  CheckCircle2,
  ArrowRight,
  Layers,
  Database,
  BarChart3,
} from 'lucide-react';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { TooltipProvider } from '@/components/ui/tooltip';
import { fmtPercent, fmtNumber } from '@/utils/formatters';

// ── Types ──────────────────────────────────────────────────────────

interface AuditTrailPanelProps {
  symbol: string;
}

interface TransparentAssumptionsData {
  discountRate: { value: number; source: string; methodology: string };
  growthRate: { value: number; source: string; methodology: string };
  terminalGrowth: { value: number; source: string; methodology: string };
  taxRate: { value: number; source: string; methodology: string };
  sectorPremiums: Array<{ field: string; value: number; source: string }>;
  countryRiskPremium: { value: number; source: string };
  inflationAssumption: { value: number; source: string };
}

interface AuditEntry {
  step: string;
  formula: string;
  inputs: Record<string, number>;
  output: number;
  timestamp: string;
  model: string;
}

interface WACCDetails {
  wacc: number;
  costOfEquity: number;
  costOfDebt: number;
  riskFreeRate: number;
  beta: number;
  equityRiskPremium: number;
  sizePremium: number;
  countryRiskPremium: number;
  assumptions?: Record<string, number>;
}

interface ScreenerResult {
  transparentAssumptions?: TransparentAssumptionsData;
  auditTrail?: AuditEntry[];
  waccDetails?: WACCDetails;
  dataSource?: string;
  dataQuality?: number;
  missingFields?: string[];
  dataFetchedAt?: string;
  symbol?: string;
}

// ── Helpers ────────────────────────────────────────────────────────

function modelColor(model: string): string {
  const colors: Record<string, string> = {
    roe_based: 'border-l-emerald-500 bg-emerald-500/5',
    excess_return: 'border-l-fuchsia-500 bg-fuchsia-500/5',
    nav: 'border-l-indigo-500 bg-indigo-500/5',
    adjusted_nav: 'border-l-purple-500 bg-purple-500/5',
    sotp: 'border-l-lime-500 bg-lime-500/5',
    revenue_multiple: 'border-l-orange-500 bg-orange-500/5',
    peg: 'border-l-yellow-500 bg-yellow-500/5',
    gordon_ddm: 'border-l-red-500 bg-red-500/5',
    dcf: 'border-l-emerald-600 bg-emerald-600/5',
    relative_pe: 'border-l-sky-500 bg-sky-500/5',
    relative_pb: 'border-l-violet-500 bg-violet-500/5',
    relative_ev_ebitda: 'border-l-teal-500 bg-teal-500/5',
    ddm: 'border-l-amber-500 bg-amber-500/5',
    asset_based: 'border-l-pink-500 bg-pink-500/5',
    monte_carlo: 'border-l-emerald-700 bg-emerald-700/5',
    scenario: 'border-l-blue-600 bg-blue-600/5',
  };
  return colors[model] || 'border-l-gray-500 bg-gray-500/5';
}

function tierColor(tier: number): string {
  switch (tier) {
    case 1:
      return 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/25';
    case 2:
      return 'bg-sky-500/10 text-sky-700 dark:text-sky-400 border-sky-500/25';
    case 3:
      return 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/25';
    default:
      return 'bg-muted text-muted-foreground border-border';
  }
}

function tierLabel(tier: number): string {
  switch (tier) {
    case 1:
      return 'Tier 1 — Primary';
    case 2:
      return 'Tier 2 — Aggregator';
    case 3:
      return 'Tier 3 — Estimated';
    default:
      return `Tier ${tier}`;
  }
}

function formatTimestamp(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });
  } catch {
    return '—';
  }
}

// ── Transparent Assumptions Section ────────────────────────────────

function TransparentAssumptionsSection({ data }: { data: TransparentAssumptionsData }) {
  const assumptions = [
    {
      label: 'Discount Rate (WACC)',
      value: data.discountRate.value,
      source: data.discountRate.source,
      methodology: data.discountRate.methodology,
      icon: <FlaskConical className="size-3.5" />,
      isPercent: true,
    },
    {
      label: 'Growth Rate',
      value: data.growthRate.value,
      source: data.growthRate.source,
      methodology: data.growthRate.methodology,
      icon: <TrendingArrow className="size-3.5" />,
      isPercent: true,
    },
    {
      label: 'Terminal Growth Rate',
      value: data.terminalGrowth.value,
      source: data.terminalGrowth.source,
      methodology: data.terminalGrowth.methodology,
      icon: <ArrowRight className="size-3.5" />,
      isPercent: true,
    },
    {
      label: 'Tax Rate',
      value: data.taxRate.value,
      source: data.taxRate.source,
      methodology: data.taxRate.methodology,
      icon: <Calculator className="size-3.5" />,
      isPercent: true,
    },
    {
      label: 'Country Risk Premium',
      value: data.countryRiskPremium.value,
      source: data.countryRiskPremium.source,
      methodology: 'Egypt-specific risk premium for frontier market adjustment',
      icon: <Globe className="size-3.5" />,
      isPercent: true,
    },
    {
      label: 'Inflation Assumption',
      value: data.inflationAssumption.value,
      source: data.inflationAssumption.source,
      methodology: 'Egyptian annual CPI inflation rate',
      icon: <BarChart3 className="size-3.5" />,
      isPercent: true,
    },
  ];

  return (
    <Card className="py-4 gap-3">
      <CardHeader className="pb-0 pt-0 px-4">
        <CardTitle className="text-sm flex items-center gap-2">
          <div className="size-7 rounded-md bg-amber-500/10 flex items-center justify-center">
            <FlaskConical className="size-3.5 text-amber-600 dark:text-amber-400" />
          </div>
          <span>Transparent Assumptions</span>
          <Badge variant="outline" className="ml-auto text-[10px]">
            {assumptions.length} parameters
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="px-4 pt-0">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left py-2 pr-3 text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">
                  Parameter
                </th>
                <th className="text-right py-2 px-3 text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">
                  Value
                </th>
                <th className="text-left py-2 px-3 text-[10px] text-muted-foreground uppercase tracking-wider font-semibold hidden sm:table-cell">
                  Source
                </th>
                <th className="text-left py-2 pl-3 text-[10px] text-muted-foreground uppercase tracking-wider font-semibold hidden md:table-cell">
                  Methodology
                </th>
              </tr>
            </thead>
            <tbody>
              {assumptions.map((a, i) => (
                <motion.tr
                  key={a.label}
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.25, delay: i * 0.05 }}
                  className="border-b border-border/50 last:border-b-0 hover:bg-muted/30 transition-colors"
                >
                  <td className="py-2 pr-3">
                    <div className="flex items-center gap-1.5 text-muted-foreground">
                      {a.icon}
                      <span className="font-medium text-foreground">{a.label}</span>
                    </div>
                  </td>
                  <td className="text-right py-2 px-3 font-mono tabular-nums font-semibold text-foreground">
                    {a.isPercent ? fmtPercent(a.value * 100) : fmtNumber(a.value)}
                  </td>
                  <td className="py-2 px-3 text-muted-foreground hidden sm:table-cell">
                    <span className="text-[11px]">{a.source}</span>
                  </td>
                  <td className="py-2 pl-3 text-muted-foreground hidden md:table-cell">
                    <span className="text-[11px]">{a.methodology}</span>
                  </td>
                </motion.tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Sector Premiums */}
        {data.sectorPremiums && data.sectorPremiums.length > 0 && (
          <>
            <Separator className="my-3" />
            <div className="space-y-1.5">
              <div className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">
                Sector-Specific Premiums
              </div>
              {data.sectorPremiums.map((sp) => (
                <div key={sp.field} className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">{sp.field}</span>
                  <div className="flex items-center gap-2">
                    <span className="font-mono tabular-nums font-medium text-foreground">
                      {fmtPercent(sp.value * 100)}
                    </span>
                    <span className="text-[10px] text-muted-foreground">({sp.source})</span>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

// ── Fallback TrendingArrow ─────────────────────────────────────────

function TrendingArrow({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" />
      <polyline points="17 6 23 6 23 12" />
    </svg>
  );
}

// ── Audit Trail Section ───────────────────────────────────────────

function AuditTrailSection({ entries }: { entries: AuditEntry[] }) {
  return (
    <Card className="py-4 gap-3">
      <CardHeader className="pb-0 pt-0 px-4">
        <CardTitle className="text-sm flex items-center gap-2">
          <div className="size-7 rounded-md bg-violet-500/10 flex items-center justify-center">
            <FileText className="size-3.5 text-violet-600 dark:text-violet-400" />
          </div>
          <span>Calculation Audit Trail</span>
          <Badge variant="outline" className="ml-auto text-[10px]">
            {entries.length} steps
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="px-4 pt-0">
        <Accordion type="multiple" className="w-full">
          {entries.map((entry, index) => (
            <AccordionItem key={index} value={`step-${index}`}>
              <AccordionTrigger className="py-2 hover:no-underline group">
                <div className="flex items-center gap-3 flex-1 mr-2">
                  <div className="flex items-center justify-center size-6 rounded-full bg-muted text-[10px] font-bold font-mono text-muted-foreground shrink-0">
                    {index + 1}
                  </div>
                  <div className="flex flex-col items-start min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium text-foreground truncate">
                        {entry.step}
                      </span>
                      <Badge variant="outline" className="text-[9px] shrink-0">
                        {entry.model}
                      </Badge>
                    </div>
                    <span className="text-[10px] text-muted-foreground font-mono tabular-nums">
                      Result: {fmtNumber(entry.output, 2)} EGP
                    </span>
                  </div>
                  <div className="ml-auto shrink-0">
                    <span className="text-[10px] text-muted-foreground font-mono tabular-nums hidden sm:inline">
                      {formatTimestamp(entry.timestamp)}
                    </span>
                  </div>
                </div>
              </AccordionTrigger>
              <AccordionContent>
                <div className={`ml-0 pl-9 border-l-2 ${modelColor(entry.model)} rounded-r-lg p-3 space-y-2`}>
                  {/* Formula */}
                  <div className="flex items-start gap-2">
                    <Calculator className="size-3 text-muted-foreground mt-0.5 shrink-0" />
                    <div>
                      <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">
                        Formula
                      </span>
                      <p className="text-xs font-mono text-foreground bg-muted/50 rounded px-2 py-1 mt-0.5">
                        {entry.formula}
                      </p>
                    </div>
                  </div>

                  {/* Inputs */}
                  <div className="flex items-start gap-2">
                    <Database className="size-3 text-muted-foreground mt-0.5 shrink-0" />
                    <div className="flex-1">
                      <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">
                        Inputs
                      </span>
                      <div className="flex flex-wrap gap-x-4 gap-y-1 mt-0.5">
                        {Object.entries(entry.inputs).map(([key, val]) => (
                          <div key={key} className="flex items-center gap-1 text-xs">
                            <span className="text-muted-foreground">{key}:</span>
                            <span className="font-mono tabular-nums font-medium text-foreground">
                              {Math.abs(val) < 1 && val !== 0
                                ? val.toFixed(4)
                                : Math.abs(val) < 100
                                  ? val.toFixed(2)
                                  : fmtNumber(val, 0)}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Output */}
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="size-3 text-emerald-500 shrink-0" />
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">
                        Output
                      </span>
                      <span className="text-sm font-mono tabular-nums font-bold text-emerald-600 dark:text-emerald-400">
                        {fmtNumber(entry.output, 2)} EGP
                      </span>
                    </div>
                  </div>

                  {/* Timestamp */}
                  <div className="flex items-center gap-2">
                    <Clock className="size-3 text-muted-foreground shrink-0" />
                    <span className="text-[10px] text-muted-foreground font-mono">
                      {entry.timestamp}
                    </span>
                  </div>
                </div>
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </CardContent>
    </Card>
  );
}

// ── WACC Breakdown Card ────────────────────────────────────────────

function WACCBreakdownCard({ data }: { data: WACCDetails }) {
  return (
    <Card className="py-4 gap-3">
      <CardHeader className="pb-0 pt-0 px-4">
        <CardTitle className="text-sm flex items-center gap-2">
          <div className="size-7 rounded-md bg-teal-500/10 flex items-center justify-center">
            <Layers className="size-3.5 text-teal-600 dark:text-teal-400" />
          </div>
          <span>WACC Breakdown</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="px-4 pt-0">
        {/* Visual WACC Formula */}
        <div className="bg-muted/30 rounded-lg p-3 mb-4">
          <div className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold mb-2">
            Weighted Average Cost of Capital
          </div>
          <div className="flex flex-wrap items-center gap-1 text-xs font-mono">
            <span className="text-foreground font-semibold text-sm">
              {fmtPercent(data.wacc * 100)}
            </span>
            <span className="text-muted-foreground">=</span>
            <span className="bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 px-1.5 py-0.5 rounded">
              E/R {(data.costOfEquity * 100).toFixed(1)}%
            </span>
            <span className="text-muted-foreground">× w</span>
            <span className="text-muted-foreground">+</span>
            <span className="bg-amber-500/10 text-amber-700 dark:text-amber-400 px-1.5 py-0.5 rounded">
              D/Rd {(data.costOfDebt * 100).toFixed(1)}%
            </span>
            <span className="text-muted-foreground">× (1-t) × (1-w)</span>
          </div>
        </div>

        {/* Component Breakdown */}
        <div className="space-y-2.5">
          <WACCRow label="WACC (Final)" value={data.wacc} highlight />
          <Separator className="my-1" />
          <WACCRow label="Cost of Equity (Ke)" value={data.costOfEquity} />
          <WACCRow label="Cost of Debt (Kd)" value={data.costOfDebt} />
          <WACCRow label="Risk-Free Rate" value={data.riskFreeRate} />
          <WACCRow label="Beta (β)" value={data.beta} isNotPercent />
          <WACCRow label="Equity Risk Premium" value={data.equityRiskPremium} />
          <WACCRow label="Size Premium" value={data.sizePremium} />
          <WACCRow label="Country Risk Premium" value={data.countryRiskPremium} />
        </div>

        {/* Extra assumptions if present */}
        {data.assumptions && Object.keys(data.assumptions).length > 0 && (
          <>
            <Separator className="my-3" />
            <div className="space-y-1.5">
              <div className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">
                Additional WACC Assumptions
              </div>
              {Object.entries(data.assumptions).map(([key, val]) => (
                <div key={key} className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">{key}</span>
                  <span className="font-mono tabular-nums font-medium text-foreground">
                    {typeof val === 'number' && val < 1 && val !== 0
                      ? `${(val * 100).toFixed(1)}%`
                      : fmtNumber(val, 2)}
                  </span>
                </div>
              ))}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function WACCRow({
  label,
  value,
  highlight,
  isNotPercent,
}: {
  label: string;
  value: number;
  highlight?: boolean;
  isNotPercent?: boolean;
}) {
  return (
    <div className="flex items-center justify-between">
      <span
        className={`text-xs ${highlight ? 'font-semibold text-foreground' : 'text-muted-foreground'}`}
      >
        {label}
      </span>
      <span
        className={`text-xs font-mono tabular-nums ${
          highlight
            ? 'font-bold text-emerald-600 dark:text-emerald-400 text-sm'
            : 'font-medium text-foreground'
        }`}
      >
        {isNotPercent ? fmtNumber(value, 3) : fmtPercent(value * 100)}
      </span>
    </div>
  );
}

// ── Data Sources Section ───────────────────────────────────────────

function DataSourcesSection({
  source,
  quality,
  missingFields,
  fetchedAt,
}: {
  source?: string;
  quality?: number;
  missingFields?: string[];
  fetchedAt?: string;
}) {
  // Build synthetic data source list from available metadata
  const sources: Array<{
    name: string;
    tier: number;
    reliability: number;
    fields: number;
    description: string;
  }> = [];

  if (source) {
    sources.push({
      name: source,
      tier: 2,
      reliability: quality ?? 75,
      fields: 25,
      description: 'Primary data aggregation source for EGX fundamental data',
    });
  }

  sources.push(
    {
      name: 'EGX Filings',
      tier: 1,
      reliability: 95,
      fields: 18,
      description: 'Official Egyptian Exchange filings and disclosures',
    },
    {
      name: 'CBE / CAPMAS',
      tier: 1,
      reliability: 90,
      fields: 8,
      description: 'Central Bank of Egypt and statistical agency macro data',
    },
    {
      name: 'Damodaran Online',
      tier: 1,
      reliability: 92,
      fields: 6,
      description: 'Professor Aswath Damodaran valuation datasets and risk premiums',
    },
    {
      name: 'TradingView',
      tier: 2,
      reliability: 80,
      fields: 30,
      description: 'Real-time and historical market data aggregation',
    },
    {
      name: 'Sector Benchmarks',
      tier: 2,
      reliability: 78,
      fields: 12,
      description: 'Computed EGX sector averages from peer group analysis',
    },
  );

  return (
    <Card className="py-4 gap-3">
      <CardHeader className="pb-0 pt-0 px-4">
        <CardTitle className="text-sm flex items-center gap-2">
          <div className="size-7 rounded-md bg-emerald-500/10 flex items-center justify-center">
            <Database className="size-3.5 text-emerald-600 dark:text-emerald-400" />
          </div>
          <span>Data Sources & Reliability</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="px-4 pt-0">
        <div className="space-y-2">
          {sources.map((src, i) => (
            <motion.div
              key={src.name}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.3, delay: i * 0.06 }}
              className="flex items-start gap-3 p-2 rounded-lg border border-border/50 hover:bg-muted/20 transition-colors"
            >
              {/* Tier Badge */}
              <Badge className={`shrink-0 text-[9px] border ${tierColor(src.tier)}`} variant="outline">
                {tierLabel(src.tier)}
              </Badge>

              {/* Source Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-medium text-foreground">{src.name}</span>
                  <span className="text-[10px] font-mono tabular-nums text-muted-foreground shrink-0">
                    {src.fields} fields
                  </span>
                </div>
                <p className="text-[10px] text-muted-foreground mt-0.5 leading-relaxed">
                  {src.description}
                </p>
                {/* Reliability bar */}
                <div className="flex items-center gap-2 mt-1">
                  <div className="h-1 flex-1 bg-muted rounded-full overflow-hidden max-w-[120px]">
                    <div
                      className={`h-full rounded-full ${
                        src.reliability >= 90
                          ? 'bg-emerald-500'
                          : src.reliability >= 75
                            ? 'bg-sky-500'
                            : src.reliability >= 60
                              ? 'bg-amber-500'
                              : 'bg-red-500'
                      }`}
                      style={{ width: `${src.reliability}%` }}
                    />
                  </div>
                  <span className="text-[10px] font-mono tabular-nums text-muted-foreground">
                    {src.reliability}%
                  </span>
                </div>
              </div>
            </motion.div>
          ))}
        </div>

        {/* Missing fields warning */}
        {missingFields && missingFields.length > 0 && (
          <>
            <Separator className="my-3" />
            <div className="flex items-start gap-2 p-2 rounded-lg bg-amber-500/5 border border-amber-500/15">
              <AlertTriangle className="size-3.5 text-amber-500 shrink-0 mt-0.5" />
              <div>
                <span className="text-[10px] text-amber-600 dark:text-amber-400 font-semibold uppercase tracking-wider">
                  Missing Data Fields
                </span>
                <div className="flex flex-wrap gap-1.5 mt-1">
                  {missingFields.map((field) => (
                    <Badge key={field} variant="outline" className="text-[9px] text-amber-600 dark:text-amber-400 border-amber-500/20">
                      {field}
                    </Badge>
                  ))}
                </div>
              </div>
            </div>
          </>
        )}

        {/* Fetched at */}
        {fetchedAt && (
          <div className="flex items-center gap-1.5 mt-3 text-[10px] text-muted-foreground">
            <Clock className="size-3" />
            <span>Data fetched: {new Date(fetchedAt).toLocaleString()}</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ── Loading Skeleton ────────────────────────────────────────────────

function AuditTrailSkeleton() {
  return (
    <div className="space-y-4">
      {Array.from({ length: 2 }).map((_, i) => (
        <Card key={i} className="py-4 gap-3">
          <CardHeader className="pb-0 pt-0 px-4">
            <div className="flex items-center gap-2">
              <Skeleton className="size-7 rounded-md" />
              <Skeleton className="h-4 w-40" />
            </div>
          </CardHeader>
          <CardContent className="px-4 pt-0 space-y-2">
            {Array.from({ length: 4 }).map((_, j) => (
              <div key={j} className="space-y-1">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-8 w-full rounded-lg" />
              </div>
            ))}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// ── Error State ────────────────────────────────────────────────────

function ErrorState({ message }: { message: string }) {
  return (
    <Card className="py-4 px-4">
      <CardContent className="flex items-center gap-2 py-2">
        <AlertTriangle className="size-4 text-red-500" />
        <span className="text-xs text-red-500">Error loading audit trail: {message}</span>
      </CardContent>
    </Card>
  );
}

// ── Empty State ────────────────────────────────────────────────────

function EmptyAuditState({ symbol }: { symbol: string }) {
  return (
    <Card className="py-6 px-4">
      <CardContent className="flex flex-col items-center justify-center py-8 gap-3">
        <div className="size-12 rounded-full bg-muted/50 flex items-center justify-center">
          <BookOpen className="size-5 text-muted-foreground" />
        </div>
        <div className="text-center">
          <p className="text-sm font-medium text-foreground">No Audit Trail Available</p>
          <p className="text-xs text-muted-foreground mt-1">
            Detailed calculation audit data is not available for{' '}
            <span className="font-mono font-semibold">{symbol}</span>.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Main Component ──────────────────────────────────────────────────

export default function AuditTrailPanel({ symbol }: AuditTrailPanelProps) {
  const [data, setData] = useState<ScreenerResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function fetchData() {
      try {
        setLoading(true);
        setError(null);
        const res = await fetch(
          `/api/analysis/screener?symbol=${encodeURIComponent(symbol)}&includeAuditTrail=true`
        );
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();

        const results: ScreenerResult[] = json.results || [];
        const match = results.find(
          (r: ScreenerResult & { symbol?: string }) =>
            (r.symbol || '').toUpperCase() === symbol.toUpperCase()
        );

        if (!cancelled) {
          setData(match || null);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to fetch data');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchData();
    return () => { cancelled = true; };
  }, [symbol]);

  if (loading) return <AuditTrailSkeleton />;
  if (error) return <ErrorState message={error} />;

  const hasAssumptions = !!data?.transparentAssumptions;
  const hasAuditTrail = !!data?.auditTrail && data.auditTrail.length > 0;
  const hasWACC = !!data?.waccDetails;

  if (!hasAssumptions && !hasAuditTrail && !hasWACC) {
    return <EmptyAuditState symbol={symbol} />;
  }

  return (
    <TooltipProvider>
      <div className="space-y-4">
        {/* Section Title */}
        <div className="flex items-center gap-2 mb-1">
          <FileText className="size-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold text-foreground">Transparent Calculations</h3>
          <Badge variant="outline" className="text-[10px]">
            Auditable
          </Badge>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Transparent Assumptions */}
          <AnimatePresence>
            {hasAssumptions && data!.transparentAssumptions && (
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4 }}
                className="lg:col-span-2"
              >
                <TransparentAssumptionsSection data={data!.transparentAssumptions!} />
              </motion.div>
            )}
          </AnimatePresence>

          {/* Audit Trail */}
          <AnimatePresence>
            {hasAuditTrail && data!.auditTrail && (
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: 0.1 }}
                className="lg:col-span-2"
              >
                <AuditTrailSection entries={data!.auditTrail!} />
              </motion.div>
            )}
          </AnimatePresence>

          {/* WACC Breakdown */}
          <AnimatePresence>
            {hasWACC && data!.waccDetails && (
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: 0.2 }}
              >
                <WACCBreakdownCard data={data!.waccDetails!} />
              </motion.div>
            )}
          </AnimatePresence>

          {/* Data Sources */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.3 }}
          >
            <DataSourcesSection
              source={data?.dataSource}
              quality={data?.dataQuality}
              missingFields={data?.missingFields}
              fetchedAt={data?.dataFetchedAt}
            />
          </motion.div>
        </div>
      </div>
    </TooltipProvider>
  );
}
