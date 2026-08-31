/**
 * POST /api/analysis/daily-picks/feedback
 *
 * §9 Governance: User feedback on daily picks.
 * This is an ENGAGEMENT signal (relevance), NOT a ground-truth outcome signal.
 * Per audit: "opted-in feedback is subject to selection bias
 * (only engaged users respond) and shouldn't be the only measure
 * of whether picks are actually good."
 *
 * Body:
 *   symbol    — stock symbol
 *   batchDate — ISO date (optional, defaults to today)
 *   action    — "useful" | "not_useful" | "acted_on" | "dismissed"
 *
 * No user PII stored. Only aggregate counts for monitoring.
 */

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';

// Simple in-memory feedback store (upgrade to DB table when volume warrants)
// For now, this is sufficient for the monitoring endpoint to read.
const feedbackStore: Array<{
  symbol: string;
  batchDate: string;
  action: string;
  timestamp: string;
}> = [];

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { symbol, batchDate, action } = body;

    if (!symbol || !action) {
      return NextResponse.json({ error: 'Missing symbol or action' }, { status: 400 });
    }

    const validActions = ['useful', 'not_useful', 'acted_on', 'dismissed'];
    if (!validActions.includes(action)) {
      return NextResponse.json({ error: 'Invalid action', validActions }, { status: 400 });
    }

    const date = batchDate || new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Cairo' });

    feedbackStore.push({
      symbol,
      batchDate: date,
      action,
      timestamp: new Date().toISOString(),
    });

    // Keep store bounded (last 1000 entries)
    if (feedbackStore.length > 1000) feedbackStore.splice(0, feedbackStore.length - 1000);

    return NextResponse.json({ ok: true, symbol, batchDate: date, action });
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }
}

/** GET: return aggregate feedback stats (for monitoring) */
export async function GET() {
  const total = feedbackStore.length;
  const byAction: Record<string, number> = {};
  const bySymbol: Record<string, number> = {};

  for (const f of feedbackStore) {
    byAction[f.action] = (byAction[f.action] || 0) + 1;
    bySymbol[f.symbol] = (bySymbol[f.symbol] || 0) + 1;
  }

  return NextResponse.json({
    totalFeedback: total,
    byAction,
    topFeedbackSymbols: Object.entries(bySymbol)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10)
      .map(([symbol, count]) => ({ symbol, count })),
  });
}