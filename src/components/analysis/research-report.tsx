'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  FileText,
  Copy,
  Printer,
  RefreshCw,
  Brain,
  Check,
  AlertCircle,
  Calendar,
  TrendingUp,
  Building2,
  Loader2,
  ChevronRight,
} from 'lucide-react';

import { Card, CardContent, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from '@/components/ui/table';
import { EGX_STOCKS } from '@/lib/egx-stocks';

// ── Types ──────────────────────────────────────────────────────

interface ResearchReportProps {
  symbol: string;
}

interface ResearchReportData {
  symbol: string;
  report: string;
  generatedAt: string;
  dataSource: 'ai' | 'rule-based';
}

// ── Constants ──────────────────────────────────────────────────

const SECTION_HEADING_REGEX = /^##\s+(.+)/;
const SUB_HEADING_REGEX = /^###\s+(.+)/;
const BULLET_REGEX = /^[-*]\s+(.+)/;
const NUMBERED_REGEX = /^\d+\.\s+(.+)/;
const TABLE_ROW_REGEX = /^\|(.+)\|$/;
const TABLE_SEPARATOR_REGEX = /^\|[-:| ]+\|$/;

const ANIMATION_VARIANTS = {
  container: {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.04,
        delayChildren: 0.1,
      },
    },
  },
  item: {
    hidden: { opacity: 0, y: 12 },
    visible: {
      opacity: 1,
      y: 0,
      transition: { duration: 0.35, ease: [0.25, 0.46, 0.45, 0.94] },
    },
  },
};

// ── Inline Markdown Renderer ────────────────────────────────────

function renderInline(text: string): React.ReactNode[] {
  // Handles **bold**, *italic*, and `code` inline patterns
  const parts: React.ReactNode[] = [];
  const regex = /\*\*(.+?)\*\*|\*(.+?)\*|`(.+?)`/g;
  let lastIndex = 0;
  let match;
  let key = 0;

  while ((match = regex.exec(text)) !== null) {
    // Text before the match
    if (match.index > lastIndex) {
      parts.push(<span key={`t-${key++}`}>{text.slice(lastIndex, match.index)}</span>);
    }
    if (match[1]) {
      parts.push(
        <strong key={`b-${key++}`} className="font-semibold text-foreground">
          {match[1]}
        </strong>
      );
    } else if (match[2]) {
      parts.push(
        <em key={`i-${key++}`} className="italic text-foreground/80">
          {match[2]}
        </em>
      );
    } else if (match[3]) {
      parts.push(
        <code
          key={`c-${key++}`}
          className="rounded bg-muted px-1.5 py-0.5 text-xs font-mono text-foreground/90"
        >
          {match[3]}
        </code>
      );
    }
    lastIndex = regex.lastIndex;
  }

  // Remaining text
  if (lastIndex < text.length) {
    parts.push(<span key={`r-${key++}`}>{text.slice(lastIndex)}</span>);
  }

  return parts.length > 0 ? parts : [<span key="full">{text}</span>];
}

// ── Table Renderer ─────────────────────────────────────────────

function renderTable(rows: string[]): React.ReactNode {
  const parsedRows = rows
    .map((row) => row.match(TABLE_ROW_REGEX)?.[1])
    .filter(Boolean)
    .map((row) =>
      row.split('|').map((cell) => cell.trim())
    );

  if (parsedRows.length < 2) return null;

  // First row is the header, check if second row is separator
  let headerCells: string[] = [];
  let dataRows: string[][] = [];

  // Detect header separator (contains ---)
  const secondRowCells = parsedRows[1];
  const isSeparator = secondRowCells.every((cell) => /^[-:]+$/.test(cell));

  if (isSeparator) {
    headerCells = parsedRows[0];
    dataRows = parsedRows.slice(2);
  } else {
    // No separator, treat first row as header
    headerCells = parsedRows[0];
    dataRows = parsedRows.slice(1);
  }

  return (
    <div className="my-4 overflow-x-auto rounded-lg border border-border/60">
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/40 hover:bg-muted/40">
            {headerCells.map((cell, idx) => (
              <TableHead
                key={`th-${idx}`}
                className="text-xs font-semibold text-foreground/80 uppercase tracking-wider whitespace-nowrap px-3 py-2"
              >
                {renderInline(cell)}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {dataRows.map((row, rowIdx) => (
            <TableRow key={`tr-${rowIdx}`} className="hover:bg-muted/30">
              {row.map((cell, cellIdx) => (
                <TableCell
                  key={`td-${rowIdx}-${cellIdx}`}
                  className="text-sm py-2.5 px-3 whitespace-nowrap"
                >
                  {renderInline(cell)}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

// ── Main Markdown Renderer ───────────────────────────────────

function renderMarkdown(text: string): React.ReactNode[] {
  const lines = text.split('\n');
  const elements: React.ReactNode[] = [];
  let currentBulletItems: React.ReactNode[] = [];
  let currentNumberedItems: { number: string; content: string }[] = [];
  let tableRows: string[] = [];
  let inTable = false;
  let globalKey = 0;

  const flushBullets = () => {
    if (currentBulletItems.length > 0) {
      elements.push(
        <ul
          key={`ul-${globalKey++}`}
          className="space-y-1.5 my-2 ml-1 pl-5 border-l-2 border-muted-foreground/15"
        >
          {currentBulletItems}
        </ul>
      );
      currentBulletItems = [];
    }
  };

  const flushNumbered = () => {
    if (currentNumberedItems.length > 0) {
      elements.push(
        <ol
          key={`ol-${globalKey++}`}
          className="space-y-1.5 my-2 ml-1 pl-5"
        >
          {currentNumberedItems.map((item, idx) => (
            <li
              key={`oli-${idx}`}
              className="text-sm leading-relaxed text-foreground/90 flex gap-2"
            >
              <span className="font-semibold text-primary/70 min-w-[1.5rem] tabular-nums">
                {idx + 1}.
              </span>
              <span className="flex-1">{renderInline(item.content)}</span>
            </li>
          ))}
        </ol>
      );
      currentNumberedItems = [];
    }
  };

  const flushTable = () => {
    if (inTable && tableRows.length > 0) {
      elements.push(renderTable(tableRows));
      tableRows = [];
      inTable = false;
    }
  };

  const flushLists = () => {
    flushBullets();
    flushNumbered();
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // Table row detection
    if (TABLE_ROW_REGEX.test(trimmed) || TABLE_SEPARATOR_REGEX.test(trimmed)) {
      flushLists();
      inTable = true;
      tableRows.push(trimmed);
      continue;
    }

    // Flush table if we were in a table but this line is not a table row
    if (inTable) {
      flushTable();
    }

    // Empty line → flush and add spacing
    if (!trimmed) {
      flushLists();
      continue;
    }

    // H1 heading (single # — typically the title)
    if (trimmed.startsWith('# ') && !trimmed.startsWith('## ')) {
      flushLists();
      const content = trimmed.replace(/^#\s+/, '');
      elements.push(
        <h1
          key={`h1-${globalKey++}`}
          className="text-xl sm:text-2xl font-bold text-foreground mt-6 mb-2 tracking-tight"
        >
          {renderInline(content)}
        </h1>
      );
      continue;
    }

    // ## Section Heading
    if (SECTION_HEADING_REGEX.test(trimmed)) {
      flushLists();
      const content = trimmed.replace(/^##\s+/, '');
      elements.push(
        <div key={`s2-${globalKey++}`} className="mt-8 mb-4 first:mt-0">
          <Separator className="mb-3" />
          <h2 className="text-base sm:text-lg font-bold text-foreground flex items-center gap-2.5">
            <ChevronRight className="size-3.5 text-primary shrink-0" />
            {renderInline(content)}
          </h2>
        </div>
      );
      continue;
    }

    // ### Sub-heading
    if (SUB_HEADING_REGEX.test(trimmed)) {
      flushLists();
      const content = trimmed.replace(/^###\s+/, '');
      elements.push(
        <h3
          key={`h3-${globalKey++}`}
          className="text-sm sm:text-base font-semibold text-foreground/90 mt-5 mb-2 pl-1 border-l-2 border-primary/40 py-0.5"
        >
          {renderInline(content)}
        </h3>
      );
      continue;
    }

    // Bullet list (- or *)
    if (BULLET_REGEX.test(trimmed)) {
      const content = trimmed.replace(/^[-*]\s+/, '');
      const indent = line.length - line.trimStart().length;
      const isNested = indent >= 4;
      currentBulletItems.push(
        <li
          key={`bli-${globalKey++}`}
          className={`text-sm leading-relaxed text-foreground/85 flex gap-2 ${isNested ? 'pl-4' : ''}`}
        >
          <span className="mt-1.5 size-1.5 rounded-full bg-primary/50 shrink-0" />
          <span className="flex-1">{renderInline(content)}</span>
        </li>
      );
      continue;
    }

    // Numbered list
    if (NUMBERED_REGEX.test(trimmed)) {
      const content = trimmed.replace(/^\d+\.\s+/, '');
      currentNumberedItems.push({ number: '', content });
      continue;
    }

    // Regular paragraph
    flushLists();

    // Special treatment for disclaimer / italic lines
    if (trimmed.startsWith('*') && trimmed.endsWith('*') && !trimmed.startsWith('**')) {
      elements.push(
        <p
          key={`disc-${globalKey++}`}
          className="text-xs text-muted-foreground/70 italic mt-6 pt-3 border-t border-border/40"
        >
          {renderInline(trimmed)}
        </p>
      );
    } else {
      elements.push(
        <p
          key={`p-${globalKey++}`}
          className="text-sm leading-[1.75] text-foreground/85 mb-1"
        >
          {renderInline(trimmed)}
        </p>
      );
    }
  }

  // Final flush
  flushLists();
  flushTable();

  return elements;
}

// ── Loading Skeleton ──────────────────────────────────────────

function ReportSkeleton() {
  return (
    <Card className="overflow-hidden print:shadow-none print:border-0">
      {/* Header skeleton */}
      <div className="bg-gradient-to-r from-muted/80 to-muted/40 px-6 py-5 print:bg-white">
        <div className="flex items-center gap-3 mb-3">
          <Skeleton className="size-10 rounded-xl" />
          <div className="space-y-2 flex-1">
            <Skeleton className="h-5 w-48" />
            <Skeleton className="h-3.5 w-32" />
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Skeleton className="h-6 w-16 rounded-full" />
          <Skeleton className="h-6 w-20 rounded-full" />
          <Skeleton className="h-3 w-28 ml-auto" />
        </div>
      </div>

      <Separator />

      {/* Body skeleton */}
      <CardContent className="p-6 space-y-6">
        {/* Title skeleton */}
        <Skeleton className="h-7 w-3/5" />

        {/* Section 1 */}
        <div className="space-y-3">
          <Skeleton className="h-5 w-1/3" />
          <div className="space-y-2 ml-4 pl-4 border-l-2 border-muted">
            <Skeleton className="h-3.5 w-full" />
            <Skeleton className="h-3.5 w-5/6" />
            <Skeleton className="h-3.5 w-4/6" />
            <Skeleton className="h-3.5 w-full" />
          </div>
        </div>

        {/* Section 2 */}
        <div className="space-y-3">
          <Skeleton className="h-5 w-2/5" />
          <div className="rounded-lg border border-border/30 overflow-hidden">
            <div className="grid grid-cols-4 gap-0">
              {[...Array(4)].map((_, i) => (
                <Skeleton key={`th-${i}`} className="h-8 bg-muted/50" />
              ))}
              {[...Array(5)].map((_, i) =>
                [...Array(4)].map((_, j) => (
                  <Skeleton key={`td-${i}-${j}`} className="h-9 border-t border-border/20" />
                ))
              )}
            </div>
          </div>
        </div>

        {/* Section 3 */}
        <div className="space-y-3">
          <Skeleton className="h-5 w-1/3" />
          <Skeleton className="h-3.5 w-full" />
          <Skeleton className="h-3.5 w-11/12" />
          <Skeleton className="h-3.5 w-full" />
          <Skeleton className="h-3.5 w-3/4" />
        </div>

        {/* Section 4 */}
        <div className="space-y-3">
          <Skeleton className="h-5 w-2/5" />
          <div className="space-y-2 ml-4 pl-4 border-l-2 border-muted">
            <Skeleton className="h-3.5 w-full" />
            <Skeleton className="h-3.5 w-5/6" />
            <Skeleton className="h-3.5 w-4/5" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Error State ───────────────────────────────────────────────

function ErrorState({
  message,
  onRetry,
  isRetrying,
}: {
  message: string;
  onRetry: () => void;
  isRetrying: boolean;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.97 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.3 }}
    >
      <Card className="border-red-200 dark:border-red-900/50 overflow-hidden">
        <CardContent className="p-6">
          <div className="flex flex-col sm:flex-row items-start gap-4">
            <div className="size-11 rounded-xl bg-red-100 dark:bg-red-950/50 flex items-center justify-center shrink-0">
              <AlertCircle className="size-5 text-red-600 dark:text-red-400" />
            </div>
            <div className="flex-1 space-y-2">
              <h3 className="text-sm font-semibold text-red-600 dark:text-red-400">
                Report Generation Failed
              </h3>
              <p className="text-sm text-muted-foreground leading-relaxed">{message}</p>
              <Button
                variant="outline"
                size="sm"
                className="mt-1 gap-2 border-red-200 dark:border-red-800 hover:bg-red-50 dark:hover:bg-red-950/30"
                onClick={onRetry}
                disabled={isRetrying}
              >
                {isRetrying ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <RefreshCw className="size-3.5" />
                )}
                {isRetrying ? 'Retrying...' : 'Retry Report'}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}

// ── Main Component ────────────────────────────────────────────

export default function ResearchReport({ symbol }: ResearchReportProps) {
  const [reportData, setReportData] = useState<ResearchReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [isRetrying, setIsRetrying] = useState(false);
  const reportRef = useRef<HTMLDivElement>(null);

  const stockInfo = EGX_STOCKS.find((s) => s.symbol === symbol.toUpperCase());
  const companyName = stockInfo?.name || symbol;

  const fetchReport = useCallback(async (isRetry = false) => {
    setLoading(true);
    setError(null);
    if (isRetry) setIsRetrying(true);

    try {
      const res = await fetch(
        `/api/analysis/research-report?symbol=${encodeURIComponent(symbol)}`,
        { cache: 'no-store' }
      );
      if (!res.ok) {
        const errData = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
        throw new Error(errData.error || `Server error (${res.status})`);
      }
      const data: ResearchReportData = await res.json();
      setReportData(data);
    } catch (err) {
      console.error('Research report fetch error:', err);
      setError(
        err instanceof Error ? err.message : 'Failed to generate research report'
      );
    } finally {
      setLoading(false);
      setIsRetrying(false);
    }
  }, [symbol]);

  useEffect(() => {
    void fetchReport();
  }, [fetchReport]);

  const handleCopy = useCallback(async () => {
    if (!reportData?.report) return;
    try {
      await navigator.clipboard.writeText(reportData.report);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // Fallback for older browsers
      const textArea = document.createElement('textarea');
      textArea.value = reportData.report;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }
  }, [reportData]);

  const handlePrint = useCallback(() => {
    window.print();
  }, []);

  const handleRetry = useCallback(() => {
    void fetchReport(true);
  }, [fetchReport]);

  const formatDateTime = (isoString: string) => {
    try {
      const date = new Date(isoString);
      return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return isoString;
    }
  };

  // ── Loading State ──
  if (loading) return <ReportSkeleton />;

  // ── Error State ──
  if (error) {
    return (
      <ErrorState
        message={error}
        onRetry={handleRetry}
        isRetrying={isRetrying}
      />
    );
  }

  // ── No Data ──
  if (!reportData?.report) return null;

  return (
    <motion.div
      ref={reportRef}
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: [0.25, 0.46, 0.45, 0.94] }}
      className="print:p-0"
    >
      <Card className="overflow-hidden print:shadow-none print:border-0 print:rounded-none">
        {/* ── Header ── */}
        <div className="bg-gradient-to-br from-muted/90 via-muted/60 to-muted/30 px-4 sm:px-6 py-4 sm:py-5 print:bg-white print:border-b print:border-gray-300">
          <div className="flex items-start justify-between gap-3">
            {/* Left: Icon + Title */}
            <div className="flex items-center gap-3 min-w-0">
              <div className="size-10 sm:size-11 rounded-xl bg-primary/10 flex items-center justify-center shrink-0 print:bg-gray-100">
                <FileText className="size-5 text-primary print:text-gray-700" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h1 className="text-base sm:text-lg font-bold text-foreground tracking-tight print:text-black">
                    Equity Research Report
                  </h1>
                </div>
                <div className="flex items-center gap-2 mt-1 flex-wrap">
                  <Badge
                    variant="secondary"
                    className="font-mono text-[11px] px-2 py-0.5 print:border print:border-gray-400 print:bg-gray-100 print:text-gray-800"
                  >
                    <Building2 className="size-3 mr-0.5" />
                    {symbol.toUpperCase()}
                  </Badge>
                  <span className="text-xs sm:text-sm text-muted-foreground truncate print:text-gray-600">
                    {companyName}
                  </span>
                </div>
              </div>
            </div>

            {/* Right: Actions (hidden on very small screens) */}
            <div className="flex items-center gap-1.5 shrink-0 print:hidden">
              {/* Copy */}
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0 gap-0"
                onClick={handleCopy}
                title="Copy report to clipboard"
              >
                <AnimatePresence mode="wait">
                  {copied ? (
                    <motion.div
                      key="check"
                      initial={{ scale: 0.5, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      exit={{ scale: 0.5, opacity: 0 }}
                      transition={{ duration: 0.15 }}
                    >
                      <Check className="size-3.5 text-emerald-500" />
                    </motion.div>
                  ) : (
                    <motion.div
                      key="copy"
                      initial={{ scale: 0.5, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      exit={{ scale: 0.5, opacity: 0 }}
                      transition={{ duration: 0.15 }}
                    >
                      <Copy className="size-3.5" />
                    </motion.div>
                  )}
                </AnimatePresence>
              </Button>

              {/* Print */}
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0 gap-0"
                onClick={handlePrint}
                title="Print report"
              >
                <Printer className="size-3.5" />
              </Button>

              {/* Refresh */}
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0 gap-0"
                onClick={handleRetry}
                disabled={isRetrying}
                title="Refresh report"
              >
                <RefreshCw
                  className={`size-3.5 ${isRetrying ? 'animate-spin' : ''}`}
                />
              </Button>
            </div>
          </div>

          {/* Metadata row */}
          <div className="flex items-center gap-2.5 mt-3 flex-wrap">
            <Badge
              variant="outline"
              className="text-[10px] gap-1 print:border print:border-gray-400 print:text-gray-600"
            >
              {reportData.dataSource === 'ai' ? (
                <>
                  <Brain className="size-3" />
                  AI Generated
                </>
              ) : (
                <>
                  <TrendingUp className="size-3" />
                  Rule-Based
                </>
              )}
            </Badge>
            <div className="flex items-center gap-1 text-[11px] text-muted-foreground print:text-gray-500">
              <Calendar className="size-3" />
              <span>{formatDateTime(reportData.generatedAt)}</span>
            </div>
            <div className="text-[10px] text-muted-foreground/50 print:text-gray-400 ml-auto hidden sm:block">
              EGX Equity Research • For informational purposes only
            </div>
          </div>
        </div>

        <Separator className="print:border-gray-300" />

        {/* ── Report Body ── */}
        <CardContent className="p-4 sm:p-6 lg:p-8 print:p-6 print:max-w-none">
          <AnimatePresence>
            <motion.div
              key={`${symbol}-${reportData.generatedAt}`}
              variants={ANIMATION_VARIANTS.container}
              initial="hidden"
              animate="visible"
              className="max-w-4xl mx-auto"
            >
              <div className="research-report prose-sm space-y-0">
                {renderMarkdown(reportData.report)}
              </div>
            </motion.div>
          </AnimatePresence>
        </CardContent>

        <Separator className="print:border-gray-300" />

        {/* ── Footer ── */}
        <CardFooter className="px-4 sm:px-6 py-3 bg-muted/20 print:bg-white print:border-t print:border-gray-300">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 w-full">
            <p className="text-[10px] sm:text-[11px] text-muted-foreground/60 leading-relaxed max-w-2xl print:text-gray-400">
              <strong className="text-muted-foreground/80">Disclaimer:</strong> This report
              is generated by automated analysis systems and is for informational purposes only.
              It does not constitute investment advice, a recommendation, or a solicitation to
              buy or sell any securities. Past performance is not indicative of future results.
              Always consult a qualified financial advisor before making investment decisions.
            </p>
            <div className="flex items-center gap-1.5 shrink-0 print:hidden">
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-[11px] gap-1.5 text-muted-foreground hover:text-foreground"
                onClick={handleCopy}
              >
                {copied ? (
                  <Check className="size-3 text-emerald-500" />
                ) : (
                  <Copy className="size-3" />
                )}
                {copied ? 'Copied' : 'Copy'}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-[11px] gap-1.5 text-muted-foreground hover:text-foreground"
                onClick={handlePrint}
              >
                <Printer className="size-3" />
                Print
              </Button>
            </div>
          </div>
        </CardFooter>
      </Card>

      {/* ── Print Styles ── */}
      <style jsx global>{`
        @media print {
          .research-report {
            font-size: 11pt !important;
            line-height: 1.6 !important;
            color: #1a1a1a !important;
          }
          .research-report h1 {
            font-size: 16pt !important;
            page-break-before: avoid;
          }
          .research-report h2 {
            font-size: 13pt !important;
            page-break-after: avoid;
            page-break-inside: avoid;
          }
          .research-report h3 {
            font-size: 11pt !important;
            page-break-after: avoid;
          }
          .research-report table {
            page-break-inside: avoid;
          }
          .research-report ul,
          .research-report ol {
            page-break-inside: avoid;
          }
        }
      `}</style>
    </motion.div>
  );
}
