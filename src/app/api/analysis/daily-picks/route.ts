/**
 * GET /api/analysis/daily-picks
 *
 * Server-side daily picks with full audit implementation:
 *   - P0-3: DB persistence (DailyPickBatch + DailyPickRecord)
 *   - P1-1: A/B ranking parameter (?ranking=nextSessionScore|confidence)
 *   - P1-2: Personalization (?personalize=true + auth session)
 *   - P1-4: Daily batch cadence (serve persisted, ?force=true to recompute)
 *   - §5: Diversity tracking, §9: Governance
 *   - §6: Engagement logging (query param ?logClick=symbol)
 *
 * Query params:
 *   timeframe   — daily | weekly | monthly (default: daily)
 *   force       — "true" to force recompute
 *   ranking     — nextSessionScore | confidence (A/B, default: nextSessionScore)
 *   personalize  — "true" to apply holdings-aware re-ranking (requires auth)
 *   logClick   — symbol to log engagement click for (§5)
 */

import { NextRequest, NextResponse } from 'next/server';
import { fetchTechnicalIndicators } from '@/lib/market-data';
import { EGX_STOCKS } from '@/lib/egx-stocks';
import { runTechnicalScreener, createLogger, type Timeframe } from '@/lib/technical-screener';
import {
  computeDailyPicks, computeDailyPicksWithMethod,
  personalizePicks, DAILY_PICKS_VERSION,
  type DailyPicksResult, type RankingMethod, type UserContext,
} from '@/lib/daily-picks';
import prisma from '@/lib/db';
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';

// In-memory cache
let cached: { data: string; ts: number; key: string } | null = null;
const CACHE_TTL = 300_000;

function getTodayDate(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Cairo' });
}

/** §5: Log engagement click on a pick */
async function logEngagement(symbol: string, batchDate: string) {
  try {
    // Simple engagement record — no user PII, just symbol + timestamp
    // In production, this would go to an analytics table
    console.log(`[DailyPicks:Engagement] click symbol=${symbol} date=${batchDate} ts=${new Date().toISOString()}`);
  } catch { /* non-critical */ }
}

/** Get user context from session for personalization */
async function getUserContext(): Promise<UserContext> {
  try {
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
      { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } },
    );
    const { data: { user } } = await supabase.auth.getUser();
    if (!user?.user_metadata?.portfolio?.holdings) return { heldSectors: [], heldSymbols: [], watchlistSymbols: [] };

    const holdings = user.user_metadata.portfolio.holdings as Array<{ symbol: string; sector?: string }>;
    const heldSymbols = holdings.map(h => h.symbol);
    const heldSectors = holdings.map(h => h.sector || 'Unknown');

    // Watchlist — check if stored in user metadata
    const watchlist = (user.user_metadata.watchlist as string[]) || [];
    return { heldSectors, heldSymbols, watchlistSymbols: watchlist };
  } catch {
    return { heldSectors: [], heldSymbols: [], watchlistSymbols: [] };
  }
}

/** Persist batch to DB */
async function persistBatch(result: DailyPicksResult, timeframe: string, dataCompleteness: number) {
  const batchDate = getTodayDate();
  try {
    const batch = await prisma.dailyPickBatch.create({
      data: {
        batchDate, timeframe, version: DAILY_PICKS_VERSION,
        totalCandidates: result.totalCandidates,
        totalUniverse: result.totalUniverse,
        sectorDistJson: JSON.stringify(result.sectorDistribution),
        dataCompleteness,
        picks: { create: result.picks.map(pick => ({
          rank: pick.rank, symbol: pick.symbol, name: pick.name, sector: pick.sector,
          signal: pick.signal, confidence: pick.confidence,
          nextSessionScore: pick.nextSessionScore,
          scoreBreakdownJson: JSON.stringify(pick.scoreBreakdown),
          entryPrice: pick.entryPrice, stopLoss: pick.stopLoss, riskReward: pick.riskReward,
          closePrice: pick.indicators.close, topRationaleJson: JSON.stringify(pick.topRationale),
        })) },
      },
    });
    return batch.id;
  } catch (error) {
    console.error('[DailyPicks] Persistence failed:', error instanceof Error ? error.message : String(error));
    return null;
  }
}

/** Load today's persisted batch */
async function loadPersistedBatch(timeframe: string): Promise<DailyPicksResult | null> {
  const batchDate = getTodayDate();
  try {
    const batch = await prisma.dailyPickBatch.findFirst({
      where: { batchDate, timeframe }, orderBy: { createdAt: 'desc' },
      include: { picks: { orderBy: { rank: 'asc' } } },
    });
    if (!batch) return null;
    const picks: DailyPicksResult['picks'] = batch.picks.map(p => ({
      symbol: p.symbol, name: p.name, sector: p.sector,
      signal: p.signal as 'Buy' | 'Strong Buy', confidence: p.confidence,
      entryPrice: p.entryPrice, entryDetail: { price: p.entryPrice, strategy: '', basis: '', discount: 0 },
      stopLoss: p.stopLoss, stopLossPct: 0, takeProfits: [], riskReward: p.riskReward, positionSize: 0,
      rationale: [], tags: [], timeframe: timeframe as Timeframe, horizon: 'short-term',
      indicators: { rsi: 0, macd: 0, macdSignal: 0, stochK: 0, stochD: 0, atr: 0, bbUpper: 0, bbLower: 0, sma20: 0, sma50: 0, sma200: 0, ema20: 0, ema50: 0, ema200: 0, volume: 0, close: p.closePrice, recommendAll: 0, bbWidth: 0, priceVsSma200: 0, priceVsBB: 0 },
      dataQuality: { score: 0, grade: '', missingIndicators: [], anomalies: [] }, riskFlags: [],
      generatedAt: batch.createdAt.toISOString(), nextSessionScore: p.nextSessionScore,
      scoreBreakdown: JSON.parse(p.scoreBreakdownJson), rank: p.rank, topRationale: JSON.parse(p.topRationaleJson),
    }));
    return { picks, totalCandidates: batch.totalCandidates, totalUniverse: batch.totalUniverse, version: batch.version, generatedAt: batch.createdAt.toISOString(), sectorDistribution: JSON.parse(batch.sectorDistJson) };
  } catch (error) { console.error('[DailyPicks] Load failed:', error); return null; }
}

function buildConfidenceBaseline(stocks: DailyPicksResult['picks']) {
  const byConfidence = [...stocks].sort((a, b) => b.confidence - a.confidence).slice(0, 5);
  return { method: 'screener_confidence_only', picks: byConfidence.map(s => ({ symbol: s.symbol, confidence: s.confidence, nextSessionScore: s.nextSessionScore })), note: 'Baseline for A/B: if nextSessionScore does not outperform, retire it.' };
}

export async function GET(request: NextRequest) {
  const startTime = Date.now();
  const log = createLogger();

  try {
    const { searchParams } = new URL(request.url);
    const timeframe = (searchParams.get('timeframe') as Timeframe) || 'daily';
    const forceRecompute = searchParams.get('force') === 'true';
    const rankingMethod = (searchParams.get('ranking') as RankingMethod) || 'nextSessionScore';
    const doPersonalize = searchParams.get('personalize') === 'true';
    const logClickSymbol = searchParams.get('logClick');

    // §5: Log engagement click (non-blocking)
    if (logClickSymbol) { logEngagement(logClickSymbol, getTodayDate()); }

    // Validate
    if (!['daily', 'weekly', 'monthly'].includes(timeframe)) {
      return NextResponse.json({ error: 'Invalid timeframe' }, { status: 400 });
    }
    if (!['nextSessionScore', 'confidence'].includes(rankingMethod)) {
      return NextResponse.json({ error: 'Invalid ranking method', validOptions: ['nextSessionScore', 'confidence'] }, { status: 400 });
    }

    const cacheKey = `tf=${timeframe}&r=${rankingMethod}&p=${doPersonalize}`;

    // P1-4: Serve persisted batch
    if (!forceRecompute && !doPersonalize && rankingMethod === 'nextSessionScore') {
      const persisted = await loadPersistedBatch(timeframe);
      if (persisted && persisted.picks.length > 0) {
        log.log('info', 'DailyPicks', `DB cache hit for ${getTodayDate()}`);
        return new NextResponse(JSON.stringify({
          ...persisted, fromCache: 'db_persisted',
          _meta: { elapsedMs: Date.now() - startTime, scoringVersion: DAILY_PICKS_VERSION, rankingMethod, methodology: 'indicator-alignment-heuristic', batchDate: getTodayDate(), personalized: false, disclaimer: 'Based on technical indicator alignment, NOT validated against realized outcomes.' },
        }), { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=300', 'X-Cache': 'DB' } });
      }
    }

    // In-memory cache
    if (cached && Date.now() - cached.ts < CACHE_TTL && cached.key === cacheKey) {
      return new NextResponse(cached.data, { headers: { 'Content-Type': 'application/json', 'X-Cache': 'HIT' } });
    }

    // Fetch + compute
    const allSymbols = EGX_STOCKS.map(s => s.symbol);
    log.log('info', 'DailyPicks', `Fetching ${allSymbols.length} stocks (${timeframe}, ranking=${rankingMethod})`);
    const techData = await fetchTechnicalIndicators(allSymbols);
    const dataRatio = Object.keys(techData).length / allSymbols.length;
    if (Object.keys(techData).length < 10) return NextResponse.json({ error: 'Insufficient data' }, { status: 503 });

    const avgVolumes: Record<string, number> = {};
    for (const [sym, t] of Object.entries(techData)) avgVolumes[sym] = t.avgVolume30d > 0 ? t.avgVolume30d : t.volume;
    const stockInfo = EGX_STOCKS.filter(s => techData[s.symbol]?.close > 0).map(s => ({ symbol: s.symbol, name: s.name, sector: s.sector }));
    const screenerResult = await runTechnicalScreener(techData, stockInfo, avgVolumes, { timeframe }, log);

    // §6: A/B ranking method
    const result = computeDailyPicksWithMethod(screenerResult.stocks, rankingMethod);
    log.log('info', 'DailyPicks', `${result.picks.length} picks (${rankingMethod}) from ${result.totalCandidates} candidates`);

    // P1-2: Personalization (only with nextSessionScore, not with confidence baseline)
    let personalizationAdj: Array<{ symbol: string; originalRank: number; newRank: number; reason: string }> | null = null;
    if (doPersonalize && rankingMethod === 'nextSessionScore') {
      const userCtx = await getUserContext();
      if (userCtx.heldSectors.length || userCtx.heldSymbols.length) {
        const { picks: personalized, adjustments } = personalizePicks(result.picks, userCtx);
        (result as any).picks = personalized;
        personalizationAdj = adjustments;
        log.log('info', 'DailyPicks', `Personalized: ${adjustments.length} adjustments applied`);
      }
    }

    // P0-3: Persist (only for default ranking, not personalized or A/B variants)
    const batchId = (!doPersonalize && rankingMethod === 'nextSessionScore')
      ? await persistBatch(result, timeframe, Math.round(dataRatio * 100))
      : null;

    // Concentration check
    const maxSector = Math.max(...Object.values(result.sectorDistribution), 0);
    const conc = result.picks.length > 0 ? maxSector / result.picks.length : 0;

    const elapsed = Date.now() - startTime;
    const responseData = JSON.stringify({
      ...result,
      dataQuality: { dataPoints: Object.keys(techData).length, completeness: Math.round(dataRatio * 100), degraded: dataRatio < 0.77 },
      confidenceBaseline: rankingMethod === 'nextSessionScore' ? buildConfidenceBaseline(result.picks) : null,
      personalization: doPersonalize ? { enabled: !!personalizationAdj && personalizationAdj.length > 0, adjustments: personalizationAdj } : { enabled: false, adjustments: null },
      diversity: { sectorDistribution: result.sectorDistribution, concentrationRatio: Math.round(conc * 100) / 100, sectorCount: Object.keys(result.sectorDistribution).length, isConcentrated: conc > 0.6 },
      _meta: { elapsedMs: elapsed, scoringVersion: DAILY_PICKS_VERSION, rankingMethod, methodology: rankingMethod === 'confidence' ? 'screener_confidence_baseline' : 'indicator-alignment-heuristic', batchId, batchDate: getTodayDate(), personalized: doPersonalize && !!personalizationAdj, disclaimer: 'Based on technical indicator alignment, NOT validated against realized outcomes.' },
    });

    cached = { data: responseData, ts: Date.now(), key: cacheKey };
    return new NextResponse(responseData, { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=300', 'X-Cache': 'MISS' } });
  } catch (error) {
    const elapsed = Date.now() - startTime;
    log.log('error', 'DailyPicks', `Failed: ${error instanceof Error ? error.message : String(error)}`);
    return NextResponse.json({ error: 'Failed', details: error instanceof Error ? error.message : String(error), elapsedMs: elapsed }, { status: 503 });
  }
}
