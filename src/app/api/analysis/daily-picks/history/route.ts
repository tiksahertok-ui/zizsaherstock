/**
 * GET /api/analysis/daily-picks/history
 *
 * Browse past daily picks batches (A.3 append-only history, §5 monitoring).
 *
 * Query params:
 *   date     — specific date "YYYY-MM-DD" (optional)
 *   from     — start date (default: 30 days ago)
 *   to       — end date (default: today)
 *   limit    — max batches to return (default: 30, max: 90)
 *   includeNextInLine — "true" to include next-in-line picks (default: false)
 *   includeOutcomes   — "true" to include outcome data (default: true)
 */

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';

function getTodayDate(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Cairo' });
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const specificDate = searchParams.get('date');
    const fromDate = searchParams.get('from');
    const toDate = searchParams.get('to') || getTodayDate();
    const limit = Math.min(90, Math.max(1, parseInt(searchParams.get('limit') || '30')));
    const includeNIL = searchParams.get('includeNextInLine') === 'true';
    const includeOutcomes = searchParams.get('includeOutcomes') !== 'false';

    // Single date lookup
    if (specificDate) {
      const batch = await prisma.dailyPickBatch.findFirst({
        where: { batchDate: specificDate },
        orderBy: { createdAt: 'desc' },
        include: { picks: { orderBy: { rank: 'asc' }, where: includeNIL ? undefined : { isNextInLine: false } } },
      });
      if (!batch) return NextResponse.json({ error: 'No batch found for this date' }, { status: 404 });
      return NextResponse.json(formatBatch(batch, includeOutcomes));
    }

    // Range query
    const since = fromDate || new Date(Date.now() - 30 * 86400000).toLocaleDateString('en-CA', { timeZone: 'Africa/Cairo' });

    const batches = await prisma.dailyPickBatch.findMany({
      where: { batchDate: { gte: since, lte: toDate } },
      orderBy: { batchDate: 'desc' },
      take: limit,
      include: { picks: { orderBy: { rank: 'asc' }, where: includeNIL ? undefined : { isNextInLine: false } } },
    });

    return NextResponse.json({
      query: { from: since, to: toDate, count: batches.length },
      batches: batches.map(b => formatBatch(b, includeOutcomes)),
    });
  } catch (error) {
    return NextResponse.json(
      { error: 'History query failed', details: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}

function formatBatch(batch: any, includeOutcomes: boolean) {
  const mainPicks = batch.picks.filter((p: any) => !p.isNextInLine);
  const nil = batch.picks.filter((p: any) => p.isNextInLine);
  return {
    batchId: batch.id, batchDate: batch.batchDate, version: batch.version,
    timeframe: batch.timeframe, createdAt: batch.createdAt,
    totalUniverse: batch.totalUniverse, fundamentalPass: batch.fundamentalPass,
    technicalPass: batch.technicalPass, finalPicks: batch.finalPicks,
    pickCountNote: batch.pickCountNote,
    dataCompleteness: batch.dataCompleteness, fundamentalCompleteness: batch.fundamentalCompleteness,
    marketContext: batch.marketContextJson ? JSON.parse(batch.marketContextJson) : null,
    sectorDistribution: JSON.parse(batch.sectorDistJson || '{}'),
    outcomeStatus: batch.outcomeStatus,
    outcome: includeOutcomes && batch.outcomeJson !== '{}' ? JSON.parse(batch.outcomeJson) : null,
    picks: mainPicks.map(formatPick),
    nextInLine: nil.map(formatPick),
  };
}

function formatPick(p: any) {
  return {
    rank: p.rank, symbol: p.symbol, name: p.name, sector: p.sector,
    signal: p.signal, confidence: p.confidence, nextSessionScore: p.nextSessionScore,
    scoreBreakdown: JSON.parse(p.scoreBreakdownJson || '{}'),
    topRationale: JSON.parse(p.topRationaleJson || '[]'),
    fundamentalGate: JSON.parse(p.fundamentalGateJson || '{}'),
    closePrice: p.closePrice, entryPrice: p.entryPrice, stopLoss: p.stopLoss,
    takeProfit1: p.takeProfit1, takeProfit2: p.takeProfit2, takeProfit3: p.takeProfit3,
    riskReward: p.riskReward,
    nextDayOpen: p.nextDayOpen, nextDayClose: p.nextDayClose,
    realizedReturn: p.realizedReturn, stopHit: p.stopHit, tp1Hit: p.tp1Hit,
    outcomeNote: p.outcomeNote,
  };
}
