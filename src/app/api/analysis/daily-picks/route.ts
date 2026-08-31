/**
 * GET /api/analysis/daily-picks
 *
 * Server-side daily picks computation.
 * Replaces the former client-side useMemo from analysis/page.tsx.
 *
 * Architecture (post-audit):
 *   - Calls the technical-screener to get the full stock universe
 *   - Runs computeDailyPicks() from the extracted daily-picks module
 *   - Caches result for 5 minutes (same as underlying screener)
 *   - Returns ranked picks with score breakdowns and rationale
 *
 * Query params:
 *   timeframe — daily | weekly | monthly (default: daily)
 *
 * Cache: 5-min server-side, matches screener TTL
 * Future: persistence via daily_picks_history table (P0-3 follow-up)
 */

import { NextRequest, NextResponse } from 'next/server';
import { fetchTechnicalIndicators } from '@/lib/market-data';
import { EGX_STOCKS } from '@/lib/egx-stocks';
import { runTechnicalScreener, createLogger, type Timeframe } from '@/lib/technical-screener';
import { computeDailyPicks, DAILY_PICKS_VERSION, type DailyPicksResult } from '@/lib/daily-picks';

// In-memory cache
let cached: { data: string; ts: number; key: string } | null = null;
const CACHE_TTL = 300_000; // 5 minutes — aligned with screener

export async function GET(request: NextRequest) {
  const startTime = Date.now();
  const log = createLogger();

  try {
    const { searchParams } = new URL(request.url);
    const timeframe = (searchParams.get('timeframe') as Timeframe) || 'daily';
    const cacheKey = `timeframe=${timeframe}`;

    // Serve from cache if fresh
    if (cached && Date.now() - cached.ts < CACHE_TTL && cached.key === cacheKey) {
      return new NextResponse(cached.data, {
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'public, max-age=300, stale-while-revalidate=60',
          'X-Cache': 'HIT',
        },
      });
    }

    // Validate timeframe
    if (!['daily', 'weekly', 'monthly'].includes(timeframe)) {
      return NextResponse.json(
        { error: 'Invalid timeframe', validOptions: ['daily', 'weekly', 'monthly'] },
        { status: 400 },
      );
    }

    // ── Step 1: Fetch technical indicators (same pipeline as screener) ──
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

    // ── Step 2: Run technical screener to get scored stocks ──
    const avgVolumes: Record<string, number> = {};
    for (const [sym, t] of Object.entries(techData)) {
      avgVolumes[sym] = t.avgVolume30d > 0 ? t.avgVolume30d : t.volume;
    }

    const stockInfo = EGX_STOCKS
      .filter(s => techData[s.symbol]?.close > 0)
      .map(s => ({ symbol: s.symbol, name: s.name, sector: s.sector }));

    const screenerResult = await runTechnicalScreener(techData, stockInfo, avgVolumes, { timeframe }, log);
    log.log('info', 'DailyPicks', `Screener returned ${screenerResult.stocks.length} stocks, ${screenerResult.stocks.filter(s => s.signal === 'Buy' || s.signal === 'Strong Buy').length} bullish`);

    // ── Step 3: Compute daily picks from screener output ──
    const result: DailyPicksResult = computeDailyPicks(screenerResult.stocks);
    log.log('info', 'DailyPicks', `${result.picks.length} picks from ${result.totalCandidates} candidates (universe: ${result.totalUniverse})`);

    // ── Step 4: Build response ──
    const elapsed = Date.now() - startTime;
    const responseData = JSON.stringify({
      ...result,
      dataQuality: {
        dataPoints: Object.keys(techData).length,
        completeness: Math.round(dataRatio * 100),
        degraded: dataRatio < 0.77,
      },
      screenerGeneratedAt: screenerResult.generatedAt,
      _meta: {
        elapsedMs: elapsed,
        scoringVersion: DAILY_PICKS_VERSION,
        methodology: 'indicator-alignment-heuristic',
        disclaimer: 'This ranking is based on technical indicator alignment, NOT validated against realized outcomes.',
      },
    });

    cached = { data: responseData, ts: Date.now(), key: cacheKey };

    return new NextResponse(responseData, {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=300, stale-while-revalidate=60',
        'X-Cache': 'MISS',
      },
    });
  } catch (error) {
    const elapsed = Date.now() - startTime;
    log.log('error', 'DailyPicks', `Failed after ${elapsed}ms: ${error instanceof Error ? error.message : String(error)}`);
    return NextResponse.json(
      {
        error: 'Daily picks computation failed',
        details: error instanceof Error ? error.message : String(error),
        elapsedMs: elapsed,
      },
      { status: 503 },
    );
  }
}
