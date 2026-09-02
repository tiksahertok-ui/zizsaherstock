/**
 * GET /api/analysis/daily-picks/track-record
 *
 * A.4 Walk-Forward Validation — Track Record API
 *
 * Returns the cumulative performance track record of Daily Picks,
 * including walk-forward metrics, score calibration, and per-batch outcomes.
 *
 * Query params:
 *   days  — lookback period in days (default: 90, max: 365)
 *
 * Used by the UI to display:
 *   - Hit rate badge on the Daily Picks section
 *   - Score-outcome correlation
 *   - Consistency metric
 *   - Per-batch outcome history
 */

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { computeWalkForwardMetrics, type OutcomeEvaluation } from '@/lib/daily-picks-v2';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const days = Math.min(365, Math.max(1, parseInt(searchParams.get('days') || '90')));

    const since = new Date();
    since.setDate(since.getDate() - days);
    since.setHours(0, 0, 0, 0);

    // Fetch evaluated batches with their picks
    const batches = await prisma.dailyPickBatch.findMany({
      where: {
        createdAt: { gte: since },
        outcomeStatus: 'evaluated',
      },
      orderBy: { batchDate: 'desc' },
      include: {
        picks: {
          orderBy: { rank: 'asc' },
          where: { isNextInLine: false },
        },
      },
    });

    // Also count total batches in period (including unevaluated)
    const totalBatchesInPeriod = await prisma.dailyPickBatch.count({
      where: { createdAt: { gte: since } },
    });

    // Build OutcomeEvaluation[] for walk-forward metrics
    const evaluations: OutcomeEvaluation[] = batches.map(batch => {
      const evaluatedPicks = batch.picks.filter(p => p.realizedReturn !== null);
      const wins = evaluatedPicks.filter(p => (p.realizedReturn || 0) > 0);
      const totalReturn = evaluatedPicks.reduce((s, p) => s + (p.realizedReturn || 0), 0);

      return {
        batchDate: batch.batchDate,
        batchId: batch.id,
        picks: evaluatedPicks.map(p => ({
          symbol: p.symbol,
          rank: p.rank,
          entryPrice: p.entryPrice,
          nextDayClose: p.nextDayClose || p.closePrice,
          realizedReturn: p.realizedReturn || 0,
          stopHit: p.stopHit,
          tp1Hit: p.tp1Hit,
          nextSessionScore: p.nextSessionScore,
          scoreBreakdown: JSON.parse(p.scoreBreakdownJson || '{}'),
        })),
        hitRate: evaluatedPicks.length > 0 ? (wins.length / evaluatedPicks.length) * 100 : 0,
        avgReturn: evaluatedPicks.length > 0 ? totalReturn / evaluatedPicks.length : 0,
        totalReturn,
        topPickReturn: batch.picks[0]?.realizedReturn || 0,
        winCount: wins.length,
        lossCount: evaluatedPicks.length - wins.length,
        evaluatedAt: batch.outcomeJson ? JSON.parse(batch.outcomeJson).evaluatedAt || '' : '',
      };
    });

    // Compute walk-forward metrics
    const metrics = computeWalkForwardMetrics(evaluations);

    // Per-batch outcome summary for UI
    const perBatch = batches.map(b => {
      const mainPicks = b.picks.filter(p => !p.isNextInLine);
      const evaluatedPicks = mainPicks.filter(p => p.realizedReturn !== null);
      const outcome = b.outcomeJson && b.outcomeJson !== '{}' ? JSON.parse(b.outcomeJson) : null;

      return {
        batchDate: b.batchDate,
        version: b.version,
        pickCount: mainPicks.length,
        topPick: mainPicks[0] ? {
          symbol: mainPicks[0].symbol,
          score: mainPicks[0].nextSessionScore,
          return: mainPicks[0].realizedReturn,
          stopHit: mainPicks[0].stopHit,
          tp1Hit: mainPicks[0].tp1Hit,
        } : null,
        hitRate: outcome?.hitRate ?? null,
        avgReturn: outcome?.avgReturn ?? null,
        outcomeStatus: b.outcomeStatus,
        evaluatedPicks: evaluatedPicks.length,
      };
    });

    // Quick summary for the UI badge
    const summary = {
      evaluatedBatches: metrics.evaluatedBatches,
      totalBatches: totalBatchesInPeriod,
      evaluationRate: totalBatchesInPeriod > 0
        ? Math.round((metrics.evaluatedBatches / totalBatchesInPeriod) * 100) : 0,
      avgHitRate: metrics.avgHitRate,
      avgReturn: metrics.avgReturnPerPick,
      consistency: metrics.consistencyPct,
      scoreReturnCorrelation: metrics.scoreReturnCorrelation,
      isStatisticallySignificant: metrics.evaluatedBatches >= 10,
      significanceNote: metrics.significanceNote,
    };

    return NextResponse.json({
      period: { days, from: since.toISOString(), to: new Date().toISOString() },
      summary,
      metrics,
      perBatch,
    });
  } catch (error) {
    return NextResponse.json(
      { error: 'Track record query failed', details: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}
