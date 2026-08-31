/**
 * POST /api/analysis/daily-picks/compute
 *
 * §3 Engineering #5: Scheduled batch computation endpoint.
 * Designed to be called by a cron job / scheduled function
 * at a fixed daily time (e.g., 10:00 AM Cairo = after EGX market open).
 *
 * This ensures a stable, once-daily batch (P1-4) rather than
 * continuous client-side recomputation.
 *
 * Body (optional):
 *   timeframe — daily | weekly | monthly
 *
 * Response: same as GET /api/analysis/daily-picks?force=true
 * Plus: scheduling metadata.
 */

import { NextRequest, NextResponse } from 'next/server';
import { fetchTechnicalIndicators } from '@/lib/market-data';
import { EGX_STOCKS } from '@/lib/egx-stocks';
import { runTechnicalScreener, createLogger, type Timeframe } from '@/lib/technical-screener';
import { computeDailyPicks, DAILY_PICKS_VERSION, type DailyPicksResult } from '@/lib/daily-picks';
import prisma from '@/lib/db';

function getTodayDate(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Cairo' });
}

async function persistBatch(result: DailyPicksResult, timeframe: string, dataCompleteness: number) {
  try {
    const batch = await prisma.dailyPickBatch.create({
      data: {
        batchDate: getTodayDate(), timeframe, version: DAILY_PICKS_VERSION,
        totalCandidates: result.totalCandidates, totalUniverse: result.totalUniverse,
        sectorDistJson: JSON.stringify(result.sectorDistribution), dataCompleteness,
        picks: { create: result.picks.map(pick => ({
          rank: pick.rank, symbol: pick.symbol, name: pick.name, sector: pick.sector,
          signal: pick.signal, confidence: pick.confidence, nextSessionScore: pick.nextSessionScore,
          scoreBreakdownJson: JSON.stringify(pick.scoreBreakdown),
          entryPrice: pick.entryPrice, stopLoss: pick.stopLoss, riskReward: pick.riskReward,
          closePrice: pick.indicators.close, topRationaleJson: JSON.stringify(pick.topRationale),
        })) },
      },
    });
    return batch.id;
  } catch (error) {
    console.error('[Compute] Persistence failed:', error);
    return null;
  }
}

export async function POST(request: NextRequest) {
  const startTime = Date.now();
  const log = createLogger();

  try {
    let timeframe: Timeframe = 'daily';
    try {
      const body = await request.json();
      if (body.timeframe) timeframe = body.timeframe;
    } catch { /* empty body is fine */ }

    if (!['daily', 'weekly', 'monthly'].includes(timeframe)) {
      return NextResponse.json({ error: 'Invalid timeframe' }, { status: 400 });
    }

    // Check if already computed today
    const existing = await prisma.dailyPickBatch.findFirst({
      where: { batchDate: getTodayDate(), timeframe },
    });
    if (existing) {
      return NextResponse.json({
        status: 'already_computed',
        batchId: existing.id,
        batchDate: existing.batchDate,
        pickCount: await prisma.dailyPickRecord.count({ where: { batchId: existing.id } }),
        message: 'Batch already exists for today. Use GET with ?force=true to recompute.',
      });
    }

    // Full computation pipeline
    const allSymbols = EGX_STOCKS.map(s => s.symbol);
    log.log('info', 'Compute', `Scheduled computation for ${getTodayDate()} (${timeframe})`);

    const techData = await fetchTechnicalIndicators(allSymbols);
    const dataRatio = Object.keys(techData).length / allSymbols.length;
    if (Object.keys(techData).length < 10) {
      return NextResponse.json({ error: 'Insufficient data', dataPoints: Object.keys(techData).length }, { status: 503 });
    }

    const avgVolumes: Record<string, number> = {};
    for (const [sym, t] of Object.entries(techData)) avgVolumes[sym] = t.avgVolume30d > 0 ? t.avgVolume30d : t.volume;
    const stockInfo = EGX_STOCKS.filter(s => techData[s.symbol]?.close > 0).map(s => ({ symbol: s.symbol, name: s.name, sector: s.sector }));
    const screenerResult = await runTechnicalScreener(techData, stockInfo, avgVolumes, { timeframe }, log);
    const result = computeDailyPicks(screenerResult.stocks);

    const batchId = await persistBatch(result, timeframe, Math.round(dataRatio * 100));

    return NextResponse.json({
      status: 'computed',
      batchId,
      batchDate: getTodayDate(),
      timeframe,
      pickCount: result.picks.length,
      candidates: result.totalCandidates,
      universe: result.totalUniverse,
      dataCompleteness: Math.round(dataRatio * 100),
      version: DAILY_PICKS_VERSION,
      picks: result.picks.map(p => ({ rank: p.rank, symbol: p.symbol, score: p.nextSessionScore, rationale: p.topRationale })),
      elapsedMs: Date.now() - startTime,
      // Recommended cron schedule for EGX
      cronHint: '0 10 * * 1-5', // 10:00 AM Cairo, Sun-Thu (EGX trading days)
    });
  } catch (error) {
    const elapsed = Date.now() - startTime;
    log.log('error', 'Compute', `Failed: ${error instanceof Error ? error.message : String(error)}`);
    return NextResponse.json({ error: 'Scheduled computation failed', details: error instanceof Error ? error.message : String(error), elapsedMs: elapsed }, { status: 503 });
  }
}
