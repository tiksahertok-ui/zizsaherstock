'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Sparkles, AlertCircle, RefreshCw, Bot } from 'lucide-react';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';

// ── Types ──────────────────────────────────────────────────────

interface AIAnalysisCardProps {
  symbol: string;
}

interface AIInsightResponse {
  symbol: string;
  insight: string;
  fairValue?: {
    weightedFairValue: number;
    weightedUpside: number;
    status: string;
    confidence: string;
  };
  fundamentals?: Record<string, number>;
}

// ── Markdown Renderer ───────────────────────────────────────────
// Simple markdown → JSX renderer for the AI output.
// Handles: ## headers, **bold**, *italic*, bullet lists, paragraphs.

function renderMarkdown(text: string): React.ReactNode[] {
  const lines = text.split('\n');
  const elements: React.ReactNode[] = [];
  let currentListItems: React.ReactNode[] = [];
  let listKey = 0;

  const flushList = () => {
    if (currentListItems.length > 0) {
      elements.push(
        <ul key={`list-${listKey++}`} className="list-disc list-outside ml-4 space-y-1 mb-2">
          {currentListItems}
        </ul>
      );
      currentListItems = [];
    }
  };

  lines.forEach((line, i) => {
    const trimmed = line.trim();

    // Empty line → flush and add spacing
    if (!trimmed) {
      flushList();
      return;
    }

    // Header (## or ###)
    if (trimmed.startsWith('###')) {
      flushList();
      const content = trimmed.replace(/^###\s+/, '');
      elements.push(
        <h3 key={i} className="text-sm font-semibold mt-3 mb-1">
          {renderInline(content)}
        </h3>
      );
      return;
    }
    if (trimmed.startsWith('##')) {
      flushList();
      const content = trimmed.replace(/^##\s+/, '');
      elements.push(
        <h2 key={i} className="text-base font-semibold mt-4 mb-2">
          {renderInline(content)}
        </h2>
      );
      return;
    }

    // Bullet list (- or *)
    if (trimmed.startsWith('- ') || trimmed.startsWith('* ') || /^\d+\.\s/.test(trimmed)) {
      const content = trimmed.replace(/^[-*]\s+/, '').replace(/^\d+\.\s+/, '');
      currentListItems.push(
        <li key={`li-${i}`} className="text-sm leading-relaxed text-foreground/90">
          {renderInline(content)}
        </li>
      );
      return;
    }

    // Regular paragraph
    flushList();
    elements.push(
      <p key={`p-${i}`} className="text-sm leading-relaxed text-foreground/90 mb-1">
        {renderInline(trimmed)}
      </p>
    );
  });

  flushList();
  return elements;
}

function renderInline(text: string): React.ReactNode[] {
  // Split by **bold** and *italic* patterns
  const parts: React.ReactNode[] = [];
  const regex = /\*\*(.+?)\*\*|\*(.+?)\*/g;
  let lastIndex = 0;
  let match;
  let key = 0;

  while ((match = regex.exec(text)) !== null) {
    // Text before the match
    if (match.index > lastIndex) {
      parts.push(<span key={key++}>{text.slice(lastIndex, match.index)}</span>);
    }
    if (match[1]) {
      // Bold
      parts.push(
        <strong key={key++} className="font-semibold text-foreground">
          {match[1]}
        </strong>
      );
    } else if (match[2]) {
      // Italic
      parts.push(
        <em key={key++} className="italic text-foreground/80">
          {match[2]}
        </em>
      );
    }
    lastIndex = regex.lastIndex;
  }

  // Remaining text
  if (lastIndex < text.length) {
    parts.push(<span key={key++}>{text.slice(lastIndex)}</span>);
  }

  return parts.length > 0 ? parts : [text];
}

// ── Skeleton ────────────────────────────────────────────────────

function AISkeleton() {
  return (
    <Card className="py-4">
      <CardHeader className="pb-0 pt-0 px-4">
        <div className="flex items-center gap-2">
          <div className="size-7 rounded-md bg-primary/10 animate-pulse flex items-center justify-center">
            <Bot className="size-3.5 text-primary/50" />
          </div>
          <Skeleton className="h-4 w-36" />
        </div>
      </CardHeader>
      <CardContent className="px-4 pt-3 space-y-3">
        <div className="space-y-2">
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-5/6" />
          <Skeleton className="h-3 w-4/6" />
        </div>
        <div className="space-y-2">
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-3/4" />
          <Skeleton className="h-3 w-5/6" />
        </div>
        <div className="space-y-2">
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-2/3" />
        </div>
      </CardContent>
    </Card>
  );
}

// ── Main Component ──────────────────────────────────────────────

export default function AIAnalysisCard({ symbol }: AIAnalysisCardProps) {
  const [insight, setInsight] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchInsight = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/analysis/ai-insight?symbol=${encodeURIComponent(symbol)}`, {
        cache: 'no-store',
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: AIInsightResponse = await res.json();
      setInsight(data.insight || null);
    } catch (err) {
      console.error('AI insight fetch error:', err);
      setError('Failed to generate AI analysis');
    } finally {
      setLoading(false);
    }
  }, [symbol]);

  useEffect(() => {
    void fetchInsight();
  }, [fetchInsight]);

  // Loading state
  if (loading) return <AISkeleton />;

  // Error state
  if (error) {
    return (
      <Card className="py-4 border-red-200 dark:border-red-800">
        <CardContent className="px-4 py-0">
          <div className="flex items-start gap-3">
            <AlertCircle className="size-5 text-red-500 mt-0.5 shrink-0" />
            <div className="flex-1">
              <p className="text-sm text-red-600 dark:text-red-400 font-medium">{error}</p>
              <Button
                variant="ghost"
                size="sm"
                className="mt-2 h-7 text-xs gap-1.5"
                onClick={() => void fetchInsight()}
              >
                <RefreshCw className="size-3" />
                Retry
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  // No insight
  if (!insight) return null;

  return (
    <Card className="py-4">
      <CardHeader className="pb-0 pt-0 px-4">
        <CardTitle className="text-sm flex items-center gap-2">
          <div className="size-7 rounded-md bg-primary/10 flex items-center justify-center">
            <Sparkles className="size-3.5 text-primary" />
          </div>
          <span>AI Analysis</span>
          <span className="text-[10px] text-muted-foreground font-normal ml-auto">
            Powered by AI
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="px-4 pt-3">
        <div className="prose-sm max-w-none text-muted-foreground">
          {renderMarkdown(insight)}
        </div>
      </CardContent>
    </Card>
  );
}
