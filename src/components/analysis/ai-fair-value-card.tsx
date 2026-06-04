'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Brain,
  TrendingUp,
  TrendingDown,
  Shield,
  AlertTriangle,
  RefreshCw,
  Bot,
  Sparkles,
  Target,
  ChevronDown,
  ChevronUp,
  BarChart3,
  Activity,
  CheckCircle2,
  AlertCircle,
  Gauge,
  Zap,
} from 'lucide-react';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import { Progress } from '@/components/ui/progress';

import { fmtCurrency, fmtPercent, pnlColor } from '@/utils/formatters';

// ── Types ──────────────────────────────────────────────────────────

interface AIFairValueCardProps {
  symbol: string;
}

interface AIAnalysisResult {
  fairValue: number;
  confidence: 'High' | 'Moderate' | 'Low';
  confidenceScore: number;
  justification: string;
  keyFactors: string[];
  riskFactors: string[];
  catalysts: string[];
  comparisonWithModels: string;
}

interface MathematicalFairValue {
  v1Weighted: number;
  v2Weighted: number;
  v3Weighted: number;
  bestModel: string;
  activeModels: string[];
  modelBreakdown: Record<string, { value: number; weight: number }>;
}

interface DataQualityInfo {
  score: number;
  grade: string;
  missingFields: string[];
  warnings: string[];
}

interface AIFairValueResponse {
  symbol: string;
  stockName: string;
  sector: string;
  currentPrice: number;
  mathematicalFairValue: MathematicalFairValue;
  aiAnalysis: AIAnalysisResult | null;
  compositeFairValue: number;
  compositeUpside: number;
  recommendation: 'Buy' | 'Hold' | 'Sell';
  dataQuality: DataQualityInfo;
  generatedAt: string;
  aiSource: 'ai' | 'mathematical_only';
}

// ── Animation Variants ─────────────────────────────────────────────

const containerVariants = {
  hidden: { opacity: 0, y: 12 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.4, ease: 'easeOut' as const },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 8 },
  visible: { opacity: 1, y: 0 },
};

// ── Color Helpers ──────────────────────────────────────────────────

function getConfidenceColor(confidence: string, score: number) {
  if (confidence === 'High' || score >= 70) {
    return {
      bg: 'bg-emerald-500/15',
      text: 'text-emerald-700 dark:text-emerald-400',
      border: 'border-emerald-200 dark:border-emerald-800',
      progress: 'bg-emerald-500',
      dot: 'bg-emerald-500',
    };
  }
  if (confidence === 'Moderate' || score >= 40) {
    return {
      bg: 'bg-amber-500/15',
      text: 'text-amber-700 dark:text-amber-400',
      border: 'border-amber-200 dark:border-amber-800',
      progress: 'bg-amber-500',
      dot: 'bg-amber-500',
    };
  }
  return {
    bg: 'bg-red-500/15',
    text: 'text-red-700 dark:text-red-400',
    border: 'border-red-200 dark:border-red-800',
    progress: 'bg-red-500',
    dot: 'bg-red-500',
  };
}

function getRecommendationStyle(rec: string) {
  switch (rec) {
    case 'Buy':
      return {
        bg: 'bg-emerald-500',
        text: 'text-white',
        icon: <TrendingUp className="size-4" />,
      };
    case 'Sell':
      return {
        bg: 'bg-red-500',
        text: 'text-white',
        icon: <TrendingDown className="size-4" />,
      };
    default:
      return {
        bg: 'bg-amber-500',
        text: 'text-white',
        icon: <Shield className="size-4" />,
      };
  }
}

function getUpsideColor(upside: number): string {
  if (upside > 10) return 'text-emerald-600 dark:text-emerald-400';
  if (upside < -10) return 'text-red-600 dark:text-red-400';
  return 'text-amber-600 dark:text-amber-400';
}

// ── Confidence Gauge ──────────────────────────────────────────────

function ConfidenceGauge({ score, confidence }: { score: number; confidence: string }) {
  const colors = getConfidenceColor(confidence, score);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">Confidence Score</span>
        <span className={`text-xs font-semibold ${colors.text}`}>
          {score}/100 — {confidence}
        </span>
      </div>
      <div className="h-2 bg-muted rounded-full overflow-hidden">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${score}%` }}
          transition={{ duration: 1.2, ease: 'easeOut', delay: 0.3 }}
          className={`h-full rounded-full ${colors.progress}`}
        />
      </div>
    </div>
  );
}

// ── Model Comparison Bars ─────────────────────────────────────────

function ModelComparisonBars({ math, currentPrice }: { math: MathematicalFairValue; currentPrice: number }) {
  const models = [
    { label: 'V1 Base', value: math.v1Weighted, color: 'bg-sky-500', textColor: 'text-sky-600 dark:text-sky-400' },
    { label: 'V2 Advanced', value: math.v2Weighted, color: 'bg-violet-500', textColor: 'text-violet-600 dark:text-violet-400' },
    { label: 'V3 Sector', value: math.v3Weighted, color: 'bg-amber-500', textColor: 'text-amber-600 dark:text-amber-400' },
  ];

  const allValues = models.map(m => m.value).filter(v => v > 0);
  const maxValue = allValues.length > 0 ? Math.max(...allValues, currentPrice * 1.5) : 1;

  return (
    <div className="space-y-2.5">
      <div className="flex items-center gap-1.5">
        <BarChart3 className="size-3.5 text-muted-foreground" />
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Model Comparison</span>
      </div>
      <div className="space-y-2">
        {models.map((m, i) => (
          <div key={m.label} className="space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-medium text-muted-foreground">{m.label}</span>
              <span className={`text-xs font-mono font-semibold tabular-nums ${m.textColor}`}>
                {m.value > 0 ? fmtCurrency(m.value) : 'N/A'}
              </span>
            </div>
            <div className="h-1.5 bg-muted rounded-full overflow-hidden">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: m.value > 0 ? `${Math.max(5, (m.value / maxValue) * 100)}%` : '0%' }}
                transition={{ duration: 0.8, ease: 'easeOut', delay: 0.2 + i * 0.15 }}
                className={`h-full rounded-full ${m.color}`}
              />
            </div>
          </div>
        ))}
      </div>
      {/* Current price reference line */}
      {currentPrice > 0 && maxValue > 0 && (
        <div className="pt-1">
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-muted-foreground">Current Price</span>
            <span className="text-[11px] font-mono font-semibold">{fmtCurrency(currentPrice)}</span>
          </div>
          <div className="relative h-1 mt-0.5">
            <div
              className="absolute h-full w-0.5 bg-foreground/60 z-10 rounded-full"
              style={{ left: `${Math.max(0, Math.min(100, (currentPrice / maxValue) * 100))}%` }}
            />
          </div>
        </div>
      )}
    </div>
  );
}

// ── Recommendation Badge ──────────────────────────────────────────

function RecommendationBadge({ recommendation, upside }: { recommendation: string; upside: number }) {
  const style = getRecommendationStyle(recommendation);

  return (
    <motion.div
      initial={{ scale: 0.8, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ type: 'spring', stiffness: 200, damping: 15, delay: 0.5 }}
      className="flex flex-col items-center gap-2 py-4"
    >
      <div className={`flex items-center gap-2 px-6 py-2.5 rounded-full ${style.bg} shadow-lg`}>
        <span className={style.text}>{style.icon}</span>
        <span className={`text-lg font-bold ${style.text}`}>{recommendation}</span>
      </div>
      <div className="text-center">
        <span className={`text-xl font-bold font-mono tabular-nums ${getUpsideColor(upside)}`}>
          {upside >= 0 ? '+' : ''}{fmtPercent(upside)}
        </span>
        <p className="text-[10px] text-muted-foreground mt-0.5">Composite Upside</p>
      </div>
    </motion.div>
  );
}

// ── Key Factors / Risk Factors Lists ────────────────────────────────

function FactorList({
  title,
  icon,
  items,
  accentColor,
}: {
  title: string;
  icon: React.ReactNode;
  items: string[];
  accentColor: string;
}) {
  if (items.length === 0) return null;

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1.5">
        {icon}
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{title}</span>
      </div>
      <ul className="space-y-1.5">
        {items.map((item, i) => (
          <motion.li
            key={i}
            variants={itemVariants}
            initial="hidden"
            animate="visible"
            transition={{ delay: i * 0.05 }}
            className="flex items-start gap-2 text-xs text-foreground/80"
          >
            <span className={`mt-1 size-1.5 rounded-full shrink-0 ${accentColor}`} />
            <span>{item}</span>
          </motion.li>
        ))}
      </ul>
    </div>
  );
}

// ── Skeleton Loading ──────────────────────────────────────────────

function AIFairValueSkeleton() {
  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-3 pt-4 px-5">
        <div className="flex items-center gap-2">
          <div className="size-8 rounded-lg bg-primary/10 animate-pulse flex items-center justify-center">
            <Brain className="size-4 text-primary/50" />
          </div>
          <div className="space-y-1.5 flex-1">
            <Skeleton className="h-4 w-48" />
            <Skeleton className="h-3 w-32" />
          </div>
        </div>
      </CardHeader>
      <CardContent className="px-5 pb-5 space-y-4">
        {/* Gauge placeholder */}
        <div className="flex justify-center">
          <div className="flex flex-col items-center gap-2 w-full max-w-xs">
            <Skeleton className="h-24 w-48 rounded-2xl" />
            <Skeleton className="h-10 w-28 rounded-full" />
          </div>
        </div>
        {/* Model comparison */}
        <div className="space-y-2">
          <Skeleton className="h-3 w-32" />
          <Skeleton className="h-2 w-full rounded-full" />
          <Skeleton className="h-2 w-full rounded-full" />
          <Skeleton className="h-2 w-full rounded-full" />
        </div>
        {/* Factors */}
        <div className="space-y-2">
          <Skeleton className="h-3 w-28" />
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-4/5" />
          <Skeleton className="h-3 w-full" />
        </div>
      </CardContent>
    </Card>
  );
}

// ── Main Component ──────────────────────────────────────────────

export default function AIFairValueCard({ symbol }: AIFairValueCardProps) {
  const [data, setData] = useState<AIFairValueResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/analysis/ai-fair-value?symbol=${encodeURIComponent(symbol)}`, {
        cache: 'no-store',
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json: AIFairValueResponse = await res.json();
      setData(json);
    } catch (err) {
      console.error('[AIFairValueCard] Fetch error:', err);
      setError('Failed to load AI fair value analysis');
    } finally {
      setLoading(false);
    }
  }, [symbol]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  // Loading state
  if (loading) return <AIFairValueSkeleton />;

  // Error state
  if (error || !data) {
    return (
      <Card className="overflow-hidden border-red-200 dark:border-red-800">
        <CardContent className="flex flex-col items-center gap-3 py-8">
          <div className="size-10 rounded-xl bg-red-500/10 flex items-center justify-center">
            <AlertCircle className="size-5 text-red-500" />
          </div>
          <p className="text-sm text-red-600 dark:text-red-400 font-medium">{error || 'No data available'}</p>
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5 h-8 text-xs"
            onClick={() => void fetchData()}
          >
            <RefreshCw className="size-3" />
            Retry
          </Button>
        </CardContent>
      </Card>
    );
  }

  const { aiAnalysis, mathematicalFairValue, compositeFairValue, compositeUpside, recommendation, dataQuality, aiSource, currentPrice, sector, stockName, generatedAt } = data;
  const confidenceScore = aiAnalysis?.confidenceScore ?? dataQuality.score;
  const confidenceLabel = aiAnalysis?.confidence ?? 'Moderate';

  return (
    <motion.div variants={containerVariants} initial="hidden" animate="visible">
      <Card className="overflow-hidden">
        <CardHeader className="pb-2 pt-4 px-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="size-8 rounded-lg bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center">
                <Brain className="size-4 text-primary" />
              </div>
              <div>
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  AI Fair Value Analysis
                  <Sparkles className="size-3.5 text-primary" />
                </CardTitle>
                <div className="flex items-center gap-2 mt-0.5">
                  <Badge variant="outline" className="text-[10px] font-mono px-1.5 py-0">
                    {stockName}
                  </Badge>
                  <span className="text-[10px] text-muted-foreground">
                    {aiSource === 'ai' ? 'AI + Mathematical' : 'Mathematical Only'}
                  </span>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {dataQuality.score > 0 && (
                <Badge
                  variant="outline"
                  className={`text-[10px] ${getConfidenceColor('', dataQuality.score).text}`}
                >
                  Data: {dataQuality.grade}
                </Badge>
              )}
              <Button
                variant="ghost"
                size="icon"
                className="size-7"
                onClick={() => setExpanded(prev => !prev)}
              >
                {expanded ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}
              </Button>
            </div>
          </div>
        </CardHeader>

        <CardContent className="px-5 pb-5">
          <AnimatePresence mode="wait">
            {expanded && (
              <motion.div
                key="content"
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.3 }}
                className="space-y-5"
              >
                {/* ── Recommendation Badge ── */}
                <RecommendationBadge recommendation={recommendation} upside={compositeUpside} />

                <Separator />

                {/* ── Confidence Score ── */}
                <ConfidenceGauge score={confidenceScore} confidence={confidenceLabel} />

                {/* ── Composite Fair Value ── */}
                <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50 border border-border/50">
                  <div>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Composite Fair Value</p>
                    <p className="text-lg font-bold font-mono tabular-nums">
                      {compositeFairValue > 0 ? fmtCurrency(compositeFairValue) : 'N/A'}
                      <span className="text-xs text-muted-foreground font-normal ml-1.5">EGP</span>
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider">vs. Current</p>
                    <p className={`text-lg font-bold font-mono tabular-nums ${getUpsideColor(compositeUpside)}`}>
                      {compositeUpside >= 0 ? '+' : ''}{fmtPercent(compositeUpside)}
                    </p>
                  </div>
                </div>

                <Separator />

                {/* ── AI Fair Value ── */}
                {aiAnalysis && (
                  <motion.div
                    variants={itemVariants}
                    initial="hidden"
                    animate="visible"
                    className="p-4 rounded-lg bg-primary/5 border border-primary/10 space-y-3"
                  >
                    <div className="flex items-center gap-2">
                      <Bot className="size-4 text-primary" />
                      <span className="text-xs font-semibold uppercase tracking-wider text-primary">AI Assessment</span>
                    </div>

                    {/* AI fair value vs composite */}
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-[10px] text-muted-foreground">AI Fair Value</p>
                        <p className="text-base font-bold font-mono tabular-nums text-primary">
                          {fmtCurrency(aiAnalysis.fairValue)} EGP
                        </p>
                      </div>
                      <Badge
                        variant="outline"
                        className={`text-[11px] font-semibold ${getConfidenceColor(aiAnalysis.confidence, aiAnalysis.confidenceScore).text} ${getConfidenceColor(aiAnalysis.confidence, aiAnalysis.confidenceScore).border}`}
                      >
                        <CheckCircle2 className="size-3 mr-1" />
                        {aiAnalysis.confidence} ({aiAnalysis.confidenceScore}%)
                      </Badge>
                    </div>

                    {/* Justification */}
                    <p className="text-xs text-foreground/80 leading-relaxed">{aiAnalysis.justification}</p>

                    {/* Comparison */}
                    {aiAnalysis.comparisonWithModels && (
                      <div className="flex items-start gap-2 p-2.5 rounded-md bg-muted/30">
                        <Gauge className="size-3.5 text-muted-foreground mt-0.5 shrink-0" />
                        <p className="text-[11px] text-foreground/70 leading-relaxed italic">
                          {aiAnalysis.comparisonWithModels}
                        </p>
                      </div>
                    )}
                  </motion.div>
                )}

                {/* ── Model Comparison ── */}
                <ModelComparisonBars math={mathematicalFairValue} currentPrice={currentPrice} />

                <Separator />

                {/* ── Key Factors / Risks / Catalysts ── */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <FactorList
                    title="Key Factors"
                    icon={<Zap className="size-3.5 text-emerald-500" />}
                    items={aiAnalysis?.keyFactors || []}
                    accentColor="bg-emerald-500"
                  />
                  <FactorList
                    title="Risk Factors"
                    icon={<AlertTriangle className="size-3.5 text-red-500" />}
                    items={aiAnalysis?.riskFactors || []}
                    accentColor="bg-red-500"
                  />
                  <FactorList
                    title="Catalysts"
                    icon={<Target className="size-3.5 text-sky-500" />}
                    items={aiAnalysis?.catalysts || []}
                    accentColor="bg-sky-500"
                  />
                </div>

                {/* ── Data Quality Warnings ── */}
                {dataQuality.warnings.length > 0 && (
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-1.5">
                      <Activity className="size-3.5 text-muted-foreground" />
                      <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Data Notes</span>
                    </div>
                    {dataQuality.warnings.map((w, i) => (
                      <p key={i} className="text-[11px] text-muted-foreground leading-relaxed">
                        • {w}
                      </p>
                    ))}
                  </div>
                )}

                {/* ── Timestamp ── */}
                <div className="flex items-center justify-between pt-1">
                  <span className="text-[10px] text-muted-foreground">
                    {mathematicalFairValue.activeModels.length} models active | {dataQuality.grade} data quality
                  </span>
                  <span className="text-[10px] text-muted-foreground">
                    Generated {generatedAt ? new Date(generatedAt).toLocaleTimeString() : 'N/A'}
                  </span>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </CardContent>
      </Card>
    </motion.div>
  );
}
