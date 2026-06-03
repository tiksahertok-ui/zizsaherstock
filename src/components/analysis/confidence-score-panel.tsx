'use client';

import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ShieldCheck,
  ShieldAlert,
  Gauge,
  BarChart3,
  CheckCircle2,
  Info,
  TrendingUp,
  Layers,
  Database,
  Clock,
  Target,
  Zap,
  Activity,
} from 'lucide-react';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { fmtNumber } from '@/utils/formatters';

// ── Types ──────────────────────────────────────────────────────────

interface ConfidenceScorePanelProps {
  symbol: string;
}

interface ValuationConfidenceData {
  level: 'Very High' | 'High' | 'Moderate' | 'Low' | 'Very Low';
  score: number;
  factors: {
    dataAvailability: number;
    reportingQuality: number;
    forecastCertainty: number;
    earningsStability: number;
    sectorMaturity: number;
  };
  explanation: string;
}

interface DataQualityData {
  overall: number;
  grade: string;
  completeness: number;
  consistency: number;
  timeliness: number;
  accuracy: number;
}

interface ModelSelectionData {
  selectedModels: string[];
  weights: Record<string, number>;
  reason: string;
  sectorProfile: string;
}

interface ScreenerResult {
  valuationConfidence?: ValuationConfidenceData;
  dataQualityV3?: DataQualityData;
  modelSelection?: ModelSelectionData;
}

// ── Helpers ────────────────────────────────────────────────────────

function confidenceColor(level: string): string {
  switch (level) {
    case 'Very High':
      return 'text-emerald-500 dark:text-emerald-400';
    case 'High':
      return 'text-emerald-600 dark:text-emerald-500';
    case 'Moderate':
      return 'text-amber-500 dark:text-amber-400';
    case 'Low':
      return 'text-orange-500 dark:text-orange-400';
    case 'Very Low':
      return 'text-red-500 dark:text-red-400';
    default:
      return 'text-muted-foreground';
  }
}

function confidenceRingColor(level: string): string {
  switch (level) {
    case 'Very High':
    case 'High':
      return 'stroke-emerald-500 dark:stroke-emerald-400';
    case 'Moderate':
      return 'stroke-amber-500 dark:stroke-amber-400';
    case 'Low':
      return 'stroke-orange-500 dark:stroke-orange-400';
    case 'Very Low':
      return 'stroke-red-500 dark:stroke-red-400';
    default:
      return 'stroke-muted-foreground';
  }
}

function gradeColor(grade: string): string {
  if (grade.startsWith('A')) return 'text-emerald-500 dark:text-emerald-400';
  if (grade.startsWith('B')) return 'text-sky-500 dark:text-sky-400';
  if (grade.startsWith('C')) return 'text-amber-500 dark:text-amber-400';
  if (grade === 'D') return 'text-orange-500 dark:text-orange-400';
  return 'text-red-500 dark:text-red-400';
}

function gradeBg(grade: string): string {
  if (grade.startsWith('A')) return 'bg-emerald-500/10 border-emerald-500/25';
  if (grade.startsWith('B')) return 'bg-sky-500/10 border-sky-500/25';
  if (grade.startsWith('C')) return 'bg-amber-500/10 border-amber-500/25';
  if (grade === 'D') return 'bg-orange-500/10 border-orange-500/25';
  return 'bg-red-500/10 border-red-500/25';
}

function modelLabel(name: string): string {
  const labels: Record<string, string> = {
    dcf: 'DCF',
    relative_pe: 'P/E Relative',
    relative_pb: 'P/B Relative',
    relative_ev_ebitda: 'EV/EBITDA',
    relative_ps: 'P/S Relative',
    ddm: 'Multi-Stage DDM',
    asset_based: 'Asset-Based',
    nav: 'NAV (Real Estate)',
    adjusted_nav: 'Adjusted NAV',
    roe_based: 'ROE-Based',
    excess_return: 'Excess Return',
    sotp: 'SOTP',
    revenue_multiple: 'Revenue Multiple',
    peg: 'PEG Model',
    gordon_ddm: 'Gordon Growth DDM',
    monte_carlo: 'Monte Carlo',
    scenario: 'Scenario Analysis',
  };
  return labels[name] || name;
}

const MODEL_COLORS: Record<string, string> = {
  dcf: 'bg-emerald-500',
  relative_pe: 'bg-sky-500',
  relative_pb: 'bg-violet-500',
  relative_ev_ebitda: 'bg-teal-500',
  relative_ps: 'bg-cyan-500',
  ddm: 'bg-amber-500',
  asset_based: 'bg-pink-500',
  nav: 'bg-indigo-500',
  adjusted_nav: 'bg-purple-500',
  roe_based: 'bg-rose-500',
  excess_return: 'bg-fuchsia-500',
  sotp: 'bg-lime-500',
  revenue_multiple: 'bg-orange-500',
  peg: 'bg-yellow-500',
  gordon_ddm: 'bg-red-500',
  monte_carlo: 'bg-emerald-600',
  scenario: 'bg-blue-600',
};

// ── Sub-Factor Bar ─────────────────────────────────────────────────

function SubFactorBar({
  label,
  value,
  icon,
  delay,
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
  delay: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, x: -12 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.35, delay }}
      className="group"
    >
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-1.5">
          <span className="text-muted-foreground group-hover:text-foreground transition-colors">
            {icon}
          </span>
          <span className="text-[11px] text-muted-foreground font-medium">{label}</span>
        </div>
        <span className="text-[11px] font-mono tabular-nums font-semibold text-foreground">
          {fmtNumber(value, 0)}
        </span>
      </div>
      <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${Math.min(value, 100)}%` }}
          transition={{ duration: 0.6, delay: delay + 0.15, ease: 'easeOut' }}
          className={`h-full rounded-full ${
            value >= 80
              ? 'bg-emerald-500'
              : value >= 60
                ? 'bg-amber-500'
                : 'bg-red-500'
          }`}
        />
      </div>
    </motion.div>
  );
}

// ── Circular Score Badge ──────────────────────────────────────────

function CircularScoreBadge({ score, level }: { score: number; level: string }) {
  const radius = 36;
  const strokeWidth = 4;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;

  return (
    <div className="relative flex items-center justify-center">
      <svg width="96" height="96" viewBox="0 0 96 96" className="-rotate-90">
        <circle
          cx="48"
          cy="48"
          r={radius}
          fill="none"
          strokeWidth={strokeWidth}
          className="stroke-muted/40"
        />
        <motion.circle
          cx="48"
          cy="48"
          r={radius}
          fill="none"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: offset }}
          transition={{ duration: 1, ease: 'easeOut', delay: 0.3 }}
          className={confidenceRingColor(level)}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <motion.span
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.4, delay: 0.5 }}
          className={`text-2xl font-bold font-mono tabular-nums ${confidenceColor(level)}`}
        >
          {score}
        </motion.span>
      </div>
    </div>
  );
}

// ── Letter Grade Badge ──────────────────────────────────────────────

function LetterGradeBadge({ grade }: { grade: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.4, delay: 0.3 }}
      className={`inline-flex items-center justify-center size-16 rounded-xl border-2 ${gradeBg(grade)}`}
    >
      <span className={`text-3xl font-bold font-mono ${gradeColor(grade)}`}>{grade}</span>
    </motion.div>
  );
}

// ── Valuation Confidence Card ────────────────────────────────────────

function ValuationConfidenceCard({ data }: { data: ValuationConfidenceData }) {
  const confidenceIcon =
    data.level === 'Very High' || data.level === 'High' ? (
      <ShieldCheck className="size-4 text-emerald-500 dark:text-emerald-400" />
    ) : data.level === 'Moderate' ? (
      <Info className="size-4 text-amber-500 dark:text-amber-400" />
    ) : (
      <ShieldAlert className="size-4 text-red-500 dark:text-red-400" />
    );

  return (
    <Card className="py-4 gap-3">
      <CardHeader className="pb-0 pt-0 px-4">
        <CardTitle className="text-sm flex items-center gap-2">
          <div className="size-7 rounded-md bg-emerald-500/10 flex items-center justify-center">
            <ShieldCheck className="size-3.5 text-emerald-600 dark:text-emerald-400" />
          </div>
          <span>Valuation Confidence</span>
          <Badge variant="outline" className="ml-auto text-[10px]">
            V3 Engine
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="px-4 pt-0">
        <div className="flex flex-col sm:flex-row items-center gap-4 mb-4">
          <CircularScoreBadge score={data.score} level={data.level} />
          <div className="flex-1 text-center sm:text-left">
            <div className="flex items-center gap-2 justify-center sm:justify-start">
              {confidenceIcon}
              <span className={`text-lg font-semibold ${confidenceColor(data.level)}`}>
                {data.level}
              </span>
            </div>
            <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
              {data.explanation}
            </p>
          </div>
        </div>

        <Separator className="my-3" />

        <div className="space-y-3">
          <SubFactorBar
            label="Data Availability"
            value={data.factors.dataAvailability}
            icon={<Database className="size-3" />}
            delay={0.1}
          />
          <SubFactorBar
            label="Reporting Quality"
            value={data.factors.reportingQuality}
            icon={<CheckCircle2 className="size-3" />}
            delay={0.18}
          />
          <SubFactorBar
            label="Forecast Certainty"
            value={data.factors.forecastCertainty}
            icon={<Target className="size-3" />}
            delay={0.26}
          />
          <SubFactorBar
            label="Earnings Stability"
            value={data.factors.earningsStability}
            icon={<TrendingUp className="size-3" />}
            delay={0.34}
          />
          <SubFactorBar
            label="Sector Maturity"
            value={data.factors.sectorMaturity}
            icon={<Activity className="size-3" />}
            delay={0.42}
          />
        </div>
      </CardContent>
    </Card>
  );
}

// ── Data Quality Card ───────────────────────────────────────────────

function DataQualityCard({ data }: { data: DataQualityData }) {
  return (
    <Card className="py-4 gap-3">
      <CardHeader className="pb-0 pt-0 px-4">
        <CardTitle className="text-sm flex items-center gap-2">
          <div className="size-7 rounded-md bg-sky-500/10 flex items-center justify-center">
            <Gauge className="size-3.5 text-sky-600 dark:text-sky-400" />
          </div>
          <span>Data Quality</span>
          <Badge variant="outline" className="ml-auto text-[10px]">
            Institutional Grade
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="px-4 pt-0">
        <div className="flex flex-col sm:flex-row items-center gap-4 mb-4">
          <LetterGradeBadge grade={data.grade} />
          <div className="flex-1 text-center sm:text-left">
            <div className="text-sm font-semibold text-foreground">
              Overall Score:{' '}
              <span className="font-mono tabular-nums">{fmtNumber(data.overall, 0)}</span>
              <span className="text-muted-foreground text-xs">/100</span>
            </div>
            <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
              Institutional-grade data quality assessment based on completeness, consistency,
              timeliness, and accuracy metrics.
            </p>
          </div>
        </div>

        <Separator className="my-3" />

        <div className="space-y-3">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="group">
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-1.5">
                      <Database className="size-3 text-muted-foreground" />
                      <span className="text-[11px] text-muted-foreground font-medium">Completeness</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] text-muted-foreground">30%</span>
                      <span className="text-[11px] font-mono tabular-nums font-semibold text-foreground">
                        {fmtNumber(data.completeness, 0)}
                      </span>
                    </div>
                  </div>
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${Math.min(data.completeness, 100)}%` }}
                    transition={{ duration: 0.6, delay: 0.15, ease: 'easeOut' }}
                    className={`h-1.5 w-full bg-muted rounded-full overflow-hidden`}
                  >
                    <div
                      className={`h-full rounded-full ${
                        data.completeness >= 80 ? 'bg-emerald-500' : data.completeness >= 60 ? 'bg-amber-500' : 'bg-red-500'
                      }`}
                      style={{ width: '100%' }}
                    />
                  </motion.div>
                </div>
              </TooltipTrigger>
              <TooltipContent side="right">
                <p className="text-xs">Percentage of expected fields populated — weighted 30%</p>
              </TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <div className="group">
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-1.5">
                      <BarChart3 className="size-3 text-muted-foreground" />
                      <span className="text-[11px] text-muted-foreground font-medium">Consistency</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] text-muted-foreground">25%</span>
                      <span className="text-[11px] font-mono tabular-nums font-semibold text-foreground">
                        {fmtNumber(data.consistency, 0)}
                      </span>
                    </div>
                  </div>
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${Math.min(data.consistency, 100)}%` }}
                    transition={{ duration: 0.6, delay: 0.22, ease: 'easeOut' }}
                    className="h-1.5 w-full bg-muted rounded-full overflow-hidden"
                  >
                    <div
                      className={`h-full rounded-full ${
                        data.consistency >= 80 ? 'bg-emerald-500' : data.consistency >= 60 ? 'bg-amber-500' : 'bg-red-500'
                      }`}
                      style={{ width: '100%' }}
                    />
                  </motion.div>
                </div>
              </TooltipTrigger>
              <TooltipContent side="right">
                <p className="text-xs">Cross-source agreement rate — weighted 25%</p>
              </TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <div className="group">
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-1.5">
                      <Clock className="size-3 text-muted-foreground" />
                      <span className="text-[11px] text-muted-foreground font-medium">Timeliness</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] text-muted-foreground">25%</span>
                      <span className="text-[11px] font-mono tabular-nums font-semibold text-foreground">
                        {fmtNumber(data.timeliness, 0)}
                      </span>
                    </div>
                  </div>
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${Math.min(data.timeliness, 100)}%` }}
                    transition={{ duration: 0.6, delay: 0.29, ease: 'easeOut' }}
                    className="h-1.5 w-full bg-muted rounded-full overflow-hidden"
                  >
                    <div
                      className={`h-full rounded-full ${
                        data.timeliness >= 80 ? 'bg-emerald-500' : data.timeliness >= 60 ? 'bg-amber-500' : 'bg-red-500'
                      }`}
                      style={{ width: '100%' }}
                    />
                  </motion.div>
                </div>
              </TooltipTrigger>
              <TooltipContent side="right">
                <p className="text-xs">Data freshness — how recently data was updated — weighted 25%</p>
              </TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <div className="group">
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-1.5">
                      <Target className="size-3 text-muted-foreground" />
                      <span className="text-[11px] text-muted-foreground font-medium">Accuracy</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] text-muted-foreground">20%</span>
                      <span className="text-[11px] font-mono tabular-nums font-semibold text-foreground">
                        {fmtNumber(data.accuracy, 0)}
                      </span>
                    </div>
                  </div>
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${Math.min(data.accuracy, 100)}%` }}
                    transition={{ duration: 0.6, delay: 0.36, ease: 'easeOut' }}
                    className="h-1.5 w-full bg-muted rounded-full overflow-hidden"
                  >
                    <div
                      className={`h-full rounded-full ${
                        data.accuracy >= 80 ? 'bg-emerald-500' : data.accuracy >= 60 ? 'bg-amber-500' : 'bg-red-500'
                      }`}
                      style={{ width: '100%' }}
                    />
                  </motion.div>
                </div>
              </TooltipTrigger>
              <TooltipContent side="right">
                <p className="text-xs">Sanity check pass rate — weighted 20%</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Model Selection Card ────────────────────────────────────────────

function ModelSelectionCard({ data }: { data: ModelSelectionData }) {
  return (
    <Card className="py-4 gap-3">
      <CardHeader className="pb-0 pt-0 px-4">
        <CardTitle className="text-sm flex items-center gap-2">
          <div className="size-7 rounded-md bg-violet-500/10 flex items-center justify-center">
            <Layers className="size-3.5 text-violet-600 dark:text-violet-400" />
          </div>
          <span>Model Selection</span>
          <Badge variant="outline" className="ml-auto text-[10px]">
            {data.selectedModels.length} models
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="px-4 pt-0">
        {/* Weight Bar */}
        <div className="mb-4">
          <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-2 font-semibold">
            Model Weights
          </div>
          <div className="flex items-center gap-0.5 h-6 rounded-lg overflow-hidden bg-muted/40">
            {data.selectedModels.map((model, i) => {
              const weight = data.weights[model] ?? 0;
              const color = MODEL_COLORS[model] || 'bg-gray-500';
              return (
                <motion.div
                  key={model}
                  initial={{ width: 0 }}
                  animate={{ width: `${weight * 100}%` }}
                  transition={{ duration: 0.5, delay: i * 0.08, ease: 'easeOut' }}
                  className={`h-full ${color} flex items-center justify-center overflow-hidden`}
                  title={`${modelLabel(model)}: ${(weight * 100).toFixed(0)}%`}
                >
                  <span className="text-[9px] font-semibold text-white px-1 whitespace-nowrap">
                    {weight >= 0.1 ? `${(weight * 100).toFixed(0)}%` : ''}
                  </span>
                </motion.div>
              );
            })}
          </div>
        </div>

        {/* Model Legend */}
        <div className="space-y-1.5 mb-4">
          {data.selectedModels.map((model, i) => {
            const weight = data.weights[model] ?? 0;
            return (
              <motion.div
                key={model}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: 0.2 + i * 0.06 }}
                className="flex items-center justify-between"
              >
                <div className="flex items-center gap-2">
                  <span className={`size-2.5 rounded-sm ${MODEL_COLORS[model] || 'bg-gray-500'}`} />
                  <span className="text-xs text-foreground font-medium">{modelLabel(model)}</span>
                </div>
                <span className="text-xs font-mono tabular-nums text-muted-foreground">
                  {(weight * 100).toFixed(0)}%
                </span>
              </motion.div>
            );
          })}
        </div>

        <Separator className="my-3" />

        {/* Selection Reason */}
        <div className="space-y-1">
          <div className="flex items-center gap-1.5">
            <Zap className="size-3 text-muted-foreground" />
            <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">
              Selection Rationale
            </span>
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed">{data.reason}</p>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Loading Skeleton ────────────────────────────────────────────────

function ConfidencePanelSkeleton() {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
      {Array.from({ length: 3 }).map((_, i) => (
        <Card key={i} className="py-4 gap-3">
          <CardHeader className="pb-0 pt-0 px-4">
            <div className="flex items-center gap-2">
              <Skeleton className="size-7 rounded-md" />
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-4 w-14 ml-auto" />
            </div>
          </CardHeader>
          <CardContent className="px-4 pt-0 space-y-3">
            <div className="flex items-center gap-4">
              <Skeleton className="size-20 rounded-full" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-3 w-full" />
                <Skeleton className="h-3 w-3/4" />
              </div>
            </div>
            <Skeleton className="h-px w-full" />
            <div className="space-y-2">
              {Array.from({ length: 4 }).map((_, j) => (
                <div key={j} className="space-y-1">
                  <Skeleton className="h-3 w-28" />
                  <Skeleton className="h-1.5 w-full rounded-full" />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// ── Empty State ────────────────────────────────────────────────────

function EmptyState({ symbol }: { symbol: string }) {
  return (
    <Card className="py-6 px-4">
      <CardContent className="flex flex-col items-center justify-center py-8 gap-3">
        <div className="size-12 rounded-full bg-muted/50 flex items-center justify-center">
          <ShieldAlert className="size-5 text-muted-foreground" />
        </div>
        <div className="text-center">
          <p className="text-sm font-medium text-foreground">No Confidence Data</p>
          <p className="text-xs text-muted-foreground mt-1">
            Confidence scoring is not available for <span className="font-mono font-semibold">{symbol}</span>.
            The stock may not have sufficient data for V3 analysis.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Main Component ──────────────────────────────────────────────────

export default function ConfidenceScorePanel({ symbol }: ConfidenceScorePanelProps) {
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

        // The API returns { results: [...], summary: {...} }
        // Find the matching symbol in the results array
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

  if (loading) return <ConfidencePanelSkeleton />;
  if (error) {
    return (
      <Card className="py-4 px-4">
        <CardContent className="flex items-center gap-2 py-2">
          <ShieldAlert className="size-4 text-red-500" />
          <span className="text-xs text-red-500">Error loading confidence data: {error}</span>
        </CardContent>
      </Card>
    );
  }

  const hasConfidence = !!data?.valuationConfidence;
  const hasDataQuality = !!data?.dataQualityV3;
  const hasModelSelection = !!data?.modelSelection;

  if (!hasConfidence && !hasDataQuality && !hasModelSelection) {
    return <EmptyState symbol={symbol} />;
  }

  return (
    <TooltipProvider>
      <div className="space-y-4">
        {/* Section Title */}
        <div className="flex items-center gap-2 mb-1">
          <Gauge className="size-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold text-foreground">Confidence & Quality Assessment</h3>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
          {/* Valuation Confidence */}
          <AnimatePresence>
            {hasConfidence && data!.valuationConfidence && (
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4 }}
              >
                <ValuationConfidenceCard data={data!.valuationConfidence!} />
              </motion.div>
            )}
          </AnimatePresence>

          {/* Data Quality */}
          <AnimatePresence>
            {hasDataQuality && data!.dataQualityV3 && (
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: 0.1 }}
              >
                <DataQualityCard data={data!.dataQualityV3!} />
              </motion.div>
            )}
          </AnimatePresence>

          {/* Model Selection */}
          <AnimatePresence>
            {hasModelSelection && data!.modelSelection && (
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: 0.2 }}
                className="lg:col-span-2 xl:col-span-1"
              >
                <ModelSelectionCard data={data!.modelSelection!} />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </TooltipProvider>
  );
}
