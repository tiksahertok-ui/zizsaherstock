/**
 * GET /api/analysis/daily-picks
 *
 * Server-side daily picks computation with persistence (P0-3, P1-4).
 *
 * Architecture (post-audit, v2):
 *   1. Check for persisted batch for today's date → serve if exists (P1-4)
 *   2. Otherwise, compute fresh: screener → daily-picks engine
 *   3. Persist batch to DB for history/monitoring/A/B (P0-3)
 *   4. Include confidence baseline comparison (P1-1)
 *   5. Cache in-memory for 5-min within same day
 *
 * Query params:
 *   timeframe  — daily | weekly | monthly (default: daily)
 *   force      — "true" to force recompute even if persisted batch exists
 *
 * Persistence: Each computation creates a DailyPickBatch + DailyPickRecord rows.
 * Monitoring: GET /api/analysis/daily-picks/monitor for history/stats.
 */

import { NextRequest, NextResponse } from 'next/server';
import { fetchTechnicalIndicators } from '@/lib/market-data';
import { EGX_STOCKS } from '@/lib/egx-stocks';
import { runTechnicalScreener, createLogger, type Timeframe } from '@/lib/technical-screener';
import { computeDailyPicks, DAILY_PICKS_VERSION, type DailyPicksResult } from '@/lib/daily-picks';
import prisma from '@/lib/db';

// In-memory cache (supplementary to DB persistence)
let cached: { data: string; ts: number; key: string } | null = null;
const CACHE_TTL = 300_000; // 5 minutes — aligned with screener

/** Get today's date as ISO date string (Egypt timezone) */
function getTodayDate(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Cairo' }); // YYYY-MM-DD
}

/** Persist a computed batch to the database */
async function persistBatch(result: DailyPicksResult, timeframe: string, dataCompleteness: number) {
  const batchDate = getTodayDate();
  try {
    const batch = await prisma.dailyPickBatch.create({
      data: {
        batchDate,
        timeframe,
        version: DAILY_PICKS_VERSION,
        totalCandidates: result.totalCandidates,
        totalUniverse: result.totalUniverse,
        sectorDistJson: JSON.stringify(result.sectorDistribution),
        dataCompleteness,
        picks: {
          create: result.picks.map(pick => ({
            rank: pick.rank,
            symbol: pick.symbol,
            name: pick.name,
            sector: pick.sector,
            signal: pick.signal,
            confidence: pick.confidence,
            nextSessionScore: pick.nextSessionScore,
            scoreBreakdownJson: JSON.stringify(pick.scoreBreakdown),
            entryPrice: pick.entryPrice,
            stopLoss: pick.stopLoss,
            riskReward: pick.riskReward,
            closePrice: pick.indicators.close,
            topRationaleJson: JSON.stringify(pick.topRationale),
          })),
        },
      },
    });
    return batch.id;
  } catch (error) {
    // Don't fail the API if persistence fails — log and continue
    console.error('[DailyPicks] Persistence failed:', error instanceof Error ? error.message : String(error));
    return null;
  }
}

/** Load today's persisted batch from DB */
async function loadPersistedBatch(timeframe: string): Promise<DailyPicksResult | null> {
  const batchDate = getTodayDate();
  try {
    const batch = await prisma.dailyPickBatch.findFirst({
      where: { batchDate, timeframe },
      orderBy: { createdAt: 'desc' },
      include: { picks: { orderBy: { rank: 'asc' } } },
    });
    if (!batch) return null;

    const picks: DailyPicksResult['picks'] = batch.picks.map(p => ({
      symbol: p.symbol,
      name: p.name,
      sector: p.sector,
      signal: p.signal as 'Buy' | 'Strong Buy',
      confidence: p.confidence,
      entryPrice: p.entryPrice,
      entryDetail: { price: p.entryPrice, strategy: '', basis: '', discount: 0 },
      stopLoss: p.stopLoss,
      stopLossPct: 0,
      takeProfits: [],
      riskReward: p.riskReward,
      positionSize: 0,
      rationale: [],
      tags: [],
      timeframe: timeframe as Timeframe,
      horizon: 'short-term',
      indicators: {
        rsi: 0, macd: 0, macdSignal: 0, stochK: 0, stochD: 0,
        atr: 0, bbUpper: 0, bbLower: 0, sma20: 0, sma50: 0, sma200: 0,
        ema20: 0, ema50: 0, ema200: 0, volume: 0, close: p.closePrice,
        recommendAll: 0, bbWidth: 0, priceVsSma200: 0, priceVsBB: 0,
      },
      dataQuality: { score: 0, grade: '', missingIndicators: [], anomalies: [] },
      riskFlags: [],
      generatedAt: batch.createdAt.toISOString(),
      nextSessionScore: p.nextSessionScore,
      scoreBreakdown: JSON.parse(p.scoreBreakdownJson),
      rank: p.rank,
      topRationale: JSON.parse(p.topRationaleJson),
    }));

    return {
      picks,
      totalCandidates: batch.totalCandidates,
      totalUniverse: batch.totalUniverse,
      version: batch.version,
      generatedAt: batch.createdAt.toISOString(),
      sectorDistribution: JSON.parse(batch.sectorDistJson),
    };
  } catch (error) {
    console.error('[DailyPicks] Failed to load persisted batch:', error);
    return null;
  }
}

/** P1-1: Compare our ranking against a naive confidence-only baseline */
function buildConfidenceBaseline(stocks: DailyPicksResult['picks']) {
  // What the top-5 would be if we just sorted by screener confidence
  const byConfidence = [...stocks].sort((a, b) => b.confidence - a.confidence).slice(0, 5);
  return {
    method: 'screener_confidence_only',
    picks: byConfidence.map(s => ({ symbol: s.symbol, confidence: s.confidence, nextSessionScore: s.nextSessionScore })),
    note: 'Baseline for future A/B testing: if nextSessionScore does not outperform this, retire it.',
  };
}

export async function GET(request: NextRequest) {
  const startTime = Date.now();
  const log = createLogger();

  try {
    const { searchParams } = new URL(request.url);
    const timeframe = (searchParams.get('timeframe') as Timeframe) || 'daily';
    const forceRecompute = searchParams.get('force') === 'true';
    const cacheKey = `timeframe=${timeframe}`;

    // Validate timeframe
    if (!['daily', 'weekly', 'monthly'].includes(timeframe)) {
      return NextResponse.json(
        { error: 'Invalid timeframe', validOptions: ['daily', 'weekly', 'monthly'] },
        { status: 400 },
      );
    }

    // ── P1-4: Serve persisted batch for today if exists (unless forced) ──
    if (!forceRecompute) {
      const persisted = await loadPersistedBatch(timeframe);
      if (persisted && persisted.picks.length > 0) {
        log.log('info', 'DailyPicks', `Serving persisted batch for ${getTodayDate()} (${persisted.picks.length} picks)`);
        const responseData = JSON.stringify({
          ...persisted,
          dataQuality: { dataPoints: persisted.totalUniverse, completeness: 0, degraded: false },
          fromCache: 'db_persisted',
          _meta: {
            elapsedMs: Date.now() - startTime,
            scoringVersion: DAILY_PICKS_VERSION,
            methodology: 'indicator-alignment-heuristic',
            disclaimer: 'This ranking is based on technical indicator alignment, NOT validated against realized outcomes.',
          },
        });
        return new NextResponse(responseData, {
          headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=300, stale-while-revalidate=60', 'X-Cache': 'DB' },
        });
      }
    }

    // Check in-memory cache
    if (cached && Date.now() - cached.ts < CACHE_TTL && cached.key === cacheKey) {
      return new NextResponse(cached.data, {
        headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=300, stale-while-revalidate=60', 'X-Cache': 'HIT' },
      });
    }

    // ── Step 1: Fetch technical indicators ──
    const allSymbols = EGX_STOCKS.map(s => s.symbol);
    log.log('info', 'DailyPicks', `Fetching technical data for ${allSymbols.length} stocks (${timeframe})`);

    const techData = await fetchTechnicalIndicators(allSymbols);
    const dataRatio = Object.keys(techData).length / allSymbols.length;

    if (Object.keys(techData).length < 10) {
      return NextResponse.json(
        { error: 'Insufficient market data', details: `Only ${Object.keys(techData).length} stocks returned` },
        { status: 503 },
      );
    }

    // ── Step 2: Run technical screener ──
    const avgVolumes: Record<string, number> = {};
    for (const [sym, t] of Object.entries(techData)) {
      avgVolumes[sym] = t.avgVolume30d > 0 ? t.avgVolume30d : t.volume;
    }

    const stockInfo = EGX_STOCKS
      .filter(s => techData[s.symbol]?.close > 0)
      .map(s => ({ symbol: s.symbol, name: s.name, sector: s.sector }));

    const screenerResult = await runTechnicalScreener(techData, stockInfo, avgVolumes, { timeframe }, log);
    log.log('info', 'DailyPicks', `Screener: ${screenerResult.stocks.length} stocks, ${screenerResult.stocks.filter(s => s.signal === 'Buy' || s.signal === 'Strong Buy').length} bullish`);

    // ── Step 3: Compute daily picks ──
    const result: DailyPicksResult = computeDailyPicks(screenerResult.stocks);
    log.log('info', 'DailyPicks', `${result.picks.length} picks from ${result.totalCandidates} candidates (universe: ${result.totalUniverse})`);

    // ── Step 4: P0-3 — Persist to DB ──
    const batchId = await persistBatch(result, timeframe, Math.round(dataRatio * 100));
    log.log('info', 'DailyPicks', `Persisted batch ${batchId} for ${getTodayDate()}`);

    // ── Step 5: P1-1 — Confidence baseline comparison ──
    const confidenceBaseline = buildConfidenceBaseline(result.picks);

    // ── Step 6: Concentration/diversity check (§9 governance) ──
    const sectorCounts = result.sectorDistribution;
    const maxSectorPicks = Math.max(...Object.values(sectorCounts), 0);
    const concentration = result.picks.length > 0 ? maxSectorPicks / result.picks.length : 0;

    // ── Step 7: Build response ──
    const elapsed = Date.now() - startTime;
    const responseData = JSON.stringify({
      ...result,
      dataQuality: {
        dataPoints: Object.keys(techData).length,
        completeness: Math.round(dataRatio * 100),
        degraded: dataRatio < 0.77,
      },
      screenerGeneratedAt: screenerResult.generatedAt,
      confidenceBaseline,
      diversity: {
        sectorDistribution: sectorCounts,
        concentrationRatio: Math.round(concentration * 100) / 100, // 0-1, 1 = all same sector
        sectorCount: Object.keys(sectorCounts).length,
        isConcentrated: concentration > 0.6, // >60% in one sector
      },
      _meta: {
        elapsedMs: elapsed,
        scoringVersion: DAILY_PICKS_VERSION,
        methodology: 'indicator-alignment-heuristic',
        batchId,
        batchDate: getTodayDate(),
        disclaimer: 'This ranking is based on technical indicator alignment, NOT validated against realized outcomes.',
      },
    });

    cached = { data: responseData, ts: Date.now(), key: cacheKey };

    return new NextResponse(responseData, {
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=300, stale-while-revalidate=60', 'X-Cache': 'MISS' },
    });
  } catch (error) {
    const elapsed = Date.now() - startTime;
    log.log('error', 'DailyPicks', `Failed after ${elapsed}ms: ${error instanceof Error ? error.message : String(error)}`);
    return NextResponse.json(
      { error: 'Daily picks computation failed', details: error instanceof Error ? error.message : String(error), elapsedMs: elapsed },
      { status: 503 },
    );
  }
}
