/**
 * GET /api/analysis/daily-picks
 *
 * FLAGSHIP FEATURE v2 — Two-stage pipeline:
 *   A.2: Fundamental quality gate (fetches fundamentals, applies thresholds)
 *   A.4: Consolidated technical scoring (single methodology)
 *   A.5: EGX-specific adaptations (price limits, liquidity, settlement)
 *   P0-3: DB persistence (append-only batch history)
 *   P1-1: A/B ranking (?ranking=nextSessionScore|confidence)
 *   P1-2: Personalization (?personalize=true + auth session)
 *   P1-4: Daily batch cadence (serve persisted, ?force=true to recompute)
 *   B.1: Flexible count (returns <5 with note)
 *   B.2: Sector concentration guard
 *   B.4: Next-in-line transparency (ranks 6-10)
 *   B.5: Market context per batch
 *   B.7: Versioned parameters
 *   §5: Diversity tracking
 *   §9: Governance (disclaimer, methodology)
 *
 * Query params:
 *   timeframe   — daily | weekly | monthly (default: daily)
 *   force       — "true" to force recompute
 *   ranking     — nextSessionScore | confidence (A/B, default: nextSessionScore)
 *   personalize  — "true" to apply holdings-aware re-ranking (requires auth)
 *   method      — v1 | v2 (default: v2; v1 for backward compat / shadow mode §7)
 */

import { NextRequest, NextResponse } from 'next/server';
import { fetchTechnicalIndicators, fetchQuotesLive } from '@/lib/market-data';
import { EGX_STOCKS } from '@/lib/egx-stocks';
import { runTechnicalScreener, createLogger, type Timeframe } from '@/lib/technical-screener';
import { fetchFundamentals } from '@/lib/fundamentals';
import {
  computeDailyPicksV2, computeDailyPicksWithMethod,
  personalizePicks, DAILY_PICKS_VERSION,
  type DailyPicksResult, type RankingMethod, type UserContext,
  type MarketContext,
} from '@/lib/daily-picks-v2';
import prisma from '@/lib/db';
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';

// V1 import for shadow mode (§7)
import { computeDailyPicks as computeDailyPicksV1, DAILY_PICKS_VERSION as V1_VERSION } from '@/lib/daily-picks';

// In-memory cache
let cached: { data: string; ts: number; key: string } | null = null;
const CACHE_TTL = 300_000;

function getTodayDate(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Cairo' });
}

/** B.5: Fetch market context (EGX30 level, change, volatility estimate) */
async function fetchMarketContext(): Promise<MarketContext | null> {
  try {
    // EGX30 index ticker on TradingView
    const quotes = await fetchQuotesLive(['CASE:EGX30']);
    const egx30 = quotes['CASE:EGX30'];
    if (!egx30 || !egx30.price) return null;
    const changePct = egx30.changePercent || 0;
    return {
      egx30Level: egx30.price,
      egx30ChangePct: changePct,
      marketVolatility: Math.abs(changePct) > 2 ? 'high' : Math.abs(changePct) > 0.8 ? 'medium' : 'low',
      regime: changePct > 0.5 ? 'bullish' : changePct < -0.5 ? 'bearish' : 'ranging',
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    console.error('[DailyPicks] Market context fetch failed:', error instanceof Error ? error.message : String(error));
    return null;
  }
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
    return {
      heldSectors: holdings.map(h => h.sector || 'Unknown'),
      heldSymbols: holdings.map(h => h.symbol),
      watchlistSymbols: (user.user_metadata.watchlist as string[]) || [],
    };
  } catch {
    return { heldSectors: [], heldSymbols: [], watchlistSymbols: [] };
  }
}

/** Persist batch to DB (append-only, immutable) */
async function persistBatch(result: DailyPicksResult, timeframe: string, dataCompleteness: number, fundCompleteness: number, marketContext: MarketContext | null) {
  const batchDate = getTodayDate();
  try {
    const batch = await prisma.dailyPickBatch.create({
      data: {
        batchDate, timeframe, version: result.version,
        totalUniverse: result.totalUniverse,
        fundamentalPass: result.fundamentalPass,
        technicalPass: result.technicalPass,
        finalPicks: result.picks.length,
        pickCountNote: result.countNote,
        dataCompleteness,
        fundamentalCompleteness: fundCompleteness,
        marketContextJson: JSON.stringify(marketContext || {}),
        sectorDistJson: JSON.stringify(result.sectorDistribution),
        paramsSnapshotJson: JSON.stringify(result.paramsSnapshot),
        picks: { create: [
          ...result.picks.map(pick => ({
            rank: pick.rank, isNextInLine: false,
            symbol: pick.symbol, name: pick.name, sector: pick.sector,
            signal: pick.signal, confidence: pick.confidence,
            nextSessionScore: pick.nextSessionScore,
            scoreBreakdownJson: JSON.stringify(pick.scoreBreakdown),
            topRationaleJson: JSON.stringify(pick.topRationale),
            fundamentalGateJson: JSON.stringify(pick.fundamentalGate),
            closePrice: pick.indicators.close,
            entryPrice: pick.entryPrice, stopLoss: pick.stopLoss,
            takeProfit1: pick.takeProfits[0]?.price,
            takeProfit2: pick.takeProfits[1]?.price,
            takeProfit3: pick.takeProfits[2]?.price,
            riskReward: pick.riskReward,
          })),
          ...result.nextInLine.map(pick => ({
            rank: pick.rank, isNextInLine: true,
            symbol: pick.symbol, name: pick.name, sector: pick.sector,
            signal: pick.signal, confidence: pick.confidence,
            nextSessionScore: pick.nextSessionScore,
            scoreBreakdownJson: JSON.stringify(pick.scoreBreakdown),
            topRationaleJson: JSON.stringify(pick.topRationale),
            fundamentalGateJson: JSON.stringify(pick.fundamentalGate),
            closePrice: pick.indicators.close,
            entryPrice: pick.entryPrice, stopLoss: pick.stopLoss,
            takeProfit1: pick.takeProfits[0]?.price,
            takeProfit2: pick.takeProfits[1]?.price,
            takeProfit3: pick.takeProfits[2]?.price,
            riskReward: pick.riskReward,
          })),
        ] },
      },
    });
    return batch.id;
  } catch (error) {
    console.error('[DailyPicks] Persistence failed:', error instanceof Error ? error.message : String(error));
    return null;
  }
}

/** Load today's persisted batch (immutable for the session) */
async function loadPersistedBatch(timeframe: string): Promise<any | null> {
  const batchDate = getTodayDate();
  try {
    const batch = await prisma.dailyPickBatch.findFirst({
      where: { batchDate, timeframe },
      orderBy: { createdAt: 'desc' },
      include: { picks: { orderBy: { rank: 'asc' } } },
    });
    if (!batch) return null;

    const mainPicks = batch.picks.filter(p => !p.isNextInLine);
    const nextInLine = batch.picks.filter(p => p.isNextInLine);

    const reconstructPick = (p: any) => ({
      symbol: p.symbol, name: p.name, sector: p.sector,
      signal: p.signal as 'Buy' | 'Strong Buy', confidence: p.confidence,
      entryPrice: p.entryPrice, entryDetail: { price: p.entryPrice, strategy: '', basis: '', discount: 0 },
      stopLoss: p.stopLoss, stopLossPct: 0,
      takeProfits: [p.takeProfit1, p.takeProfit2, p.takeProfit3].filter(Boolean).map((price, idx) => ({
        level: idx + 1, price, basis: '', probability: idx === 0 ? 'High' : idx === 1 ? 'Medium' : 'Low',
      })),
      riskReward: p.riskReward, positionSize: 0,
      rationale: [], tags: [], timeframe: timeframe as Timeframe, horizon: 'short-term',
      indicators: { rsi: 0, macd: 0, macdSignal: 0, stochK: 0, stochD: 0, atr: 0, bbUpper: 0, bbLower: 0, sma20: 0, sma50: 0, sma200: 0, ema20: 0, ema50: 0, ema200: 0, volume: 0, close: p.closePrice, recommendAll: 0, bbWidth: 0, priceVsSma200: 0, priceVsBB: 0 },
      dataQuality: { score: 0, grade: '', missingIndicators: [], anomalies: [] }, riskFlags: [],
      generatedAt: batch.createdAt.toISOString(),
      nextSessionScore: p.nextSessionScore,
      scoreBreakdown: JSON.parse(p.scoreBreakdownJson || '{}'),
      rank: p.rank,
      topRationale: JSON.parse(p.topRationaleJson || '[]'),
      fundamentalGate: JSON.parse(p.fundamentalGateJson || '{}'),
      isNextInLine: p.isNextInLine,
    });

    return {
      picks: mainPicks.map(reconstructPick),
      nextInLine: nextInLine.map(reconstructPick),
      totalUniverse: batch.totalUniverse,
      fundamentalPass: batch.fundamentalPass,
      technicalPass: batch.technicalPass,
      version: batch.version,
      generatedAt: batch.createdAt.toISOString(),
      sectorDistribution: JSON.parse(batch.sectorDistJson || '{}'),
      countNote: batch.pickCountNote,
      marketContext: JSON.parse(batch.marketContextJson || 'null'),
      _meta: { batchId: batch.id, batchDate: batch.batchDate, fromCache: 'db_persisted' },
    };
  } catch (error) {
    console.error('[DailyPicks] Load failed:', error);
    return null;
  }
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
    const method = searchParams.get('method') || 'v2'; // v1 (shadow) | v2 (default)

    // Validate
    if (!['daily', 'weekly', 'monthly'].includes(timeframe)) {
      return NextResponse.json({ error: 'Invalid timeframe' }, { status: 400 });
    }
    if (!['nextSessionScore', 'confidence'].includes(rankingMethod)) {
      return NextResponse.json({ error: 'Invalid ranking method', validOptions: ['nextSessionScore', 'confidence'] }, { status: 400 });
    }
    if (!['v1', 'v2'].includes(method)) {
      return NextResponse.json({ error: 'Invalid method', validOptions: ['v1', 'v2'] }, { status: 400 });
    }

    const cacheKey = `tf=${timeframe}&r=${rankingMethod}&p=${doPersonalize}&m=${method}`;

    // P1-4: Serve persisted batch (immutable for the session)
    if (!forceRecompute && !doPersonalize && rankingMethod === 'nextSessionScore' && method === 'v2') {
      const persisted = await loadPersistedBatch(timeframe);
      if (persisted && persisted.picks.length >= 0) {
        log.log('info', 'DailyPicks', `DB cache hit for ${getTodayDate()}`);
        const maxSector = Math.max(...Object.values(persisted.sectorDistribution), 0);
        const conc = persisted.picks.length > 0 ? maxSector / persisted.picks.length : 0;
        return new NextResponse(JSON.stringify({
          ...persisted,
          diversity: { sectorDistribution: persisted.sectorDistribution, concentrationRatio: Math.round(conc * 100) / 100, sectorCount: Object.keys(persisted.sectorDistribution).length, isConcentrated: conc > 0.6 },
          _meta: {
            ...persisted._meta,
            elapsedMs: Date.now() - startTime,
            scoringVersion: persisted.version,
            rankingMethod,
            methodology: 'two-stage: fundamental-gate + technical-scoring',
            personalized: false,
            batchDate: getTodayDate(),
          },
        }), { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=300', 'X-Cache': 'DB' } });
      }
    }

    // In-memory cache
    if (cached && Date.now() - cached.ts < CACHE_TTL && cached.key === cacheKey) {
      return new NextResponse(cached.data, { headers: { 'Content-Type': 'application/json', 'X-Cache': 'HIT' } });
    }

    // ═══ COMPUTE FRESH ═══
    log.log('info', 'DailyPicks', `Computing fresh batch (method=${method}, ranking=${rankingMethod})`);

    // Fetch technical data
    const allSymbols = EGX_STOCKS.map(s => s.symbol);
    log.log('info', 'DailyPicks', `Fetching technical data for ${allSymbols.length} stocks`);
    const techData = await fetchTechnicalIndicators(allSymbols);
    const dataRatio = Object.keys(techData).length / allSymbols.length;
    if (Object.keys(techData).length < 10) {
      return NextResponse.json({ error: 'Insufficient technical data' }, { status: 503 });
    }

    // Fetch fundamentals (A.2 — required for gate)
    log.log('info', 'DailyPicks', `Fetching fundamental data for ${allSymbols.length} stocks`);
    const fundData = await fetchFundamentals(allSymbols);
    const fundRatio = Object.keys(fundData).length / allSymbols.length;
    log.log('info', 'DailyPicks', `Fundamentals: ${Object.keys(fundData).length}/${allSymbols.length} (${Math.round(fundRatio * 100)}%)`);

    // Fetch market context (B.5)
    const marketContext = await fetchMarketContext();
    log.log('info', 'DailyPicks', `Market context: EGX30=${marketContext?.egx30Level}, regime=${marketContext?.regime}`);

    // Run technical screener
    const avgVolumes: Record<string, number> = {};
    for (const [sym, t] of Object.entries(techData)) avgVolumes[sym] = t.avgVolume30d > 0 ? t.avgVolume30d : t.volume;
    const stockInfo = EGX_STOCKS.filter(s => techData[s.symbol]?.close > 0).map(s => ({ symbol: s.symbol, name: s.name, sector: s.sector }));
    const screenerResult = await runTechnicalScreener(techData, stockInfo, avgVolumes, { timeframe }, log);

    // Run daily picks pipeline
    let result: DailyPicksResult;
    if (method === 'v1') {
      // Shadow mode (§7): run v1 for comparison
      const v1Result = computeDailyPicksV1(screenerResult.stocks);
      result = {
        ...v1Result as any,
        fundamentalPass: v1Result.totalCandidates, // v1 doesn't have gate
        technicalPass: v1Result.totalCandidates,
        nextInLine: [],
        countNote: '',
        marketContext,
        paramsSnapshot: {} as any,
        version: V1_VERSION,
      };
    } else {
      // V2: two-stage pipeline
      result = computeDailyPicksWithMethod(screenerResult.stocks, fundData, rankingMethod, marketContext);
    }

    log.log('info', 'DailyPicks', `${result.picks.length} picks (+${result.nextInLine.length} next-in-line) from ${result.totalUniverse} universe, ${result.fundamentalPass} passed fundamentals, ${result.technicalPass} passed technicals`);

    // P1-2: Personalization (only v2, nextSessionScore)
    let personalizationAdj: Array<{ symbol: string; originalRank: number; newRank: number; reason: string }> | null = null;
    if (doPersonalize && rankingMethod === 'nextSessionScore' && method === 'v2') {
      const userCtx = await getUserContext();
      if (userCtx.heldSectors.length || userCtx.heldSymbols.length) {
        const { picks: personalized, adjustments } = personalizePicks(result.picks, userCtx);
        (result as any).picks = personalized;
        personalizationAdj = adjustments;
      }
    }

    // P0-3: Persist (v2 default only, not personalized/A/B/shadow)
    const shouldPersist = method === 'v2' && !doPersonalize && rankingMethod === 'nextSessionScore';
    const batchId = shouldPersist
      ? await persistBatch(result, timeframe, Math.round(dataRatio * 100), Math.round(fundRatio * 100), marketContext)
      : null;

    // Concentration check
    const maxSector = Math.max(...Object.values(result.sectorDistribution), 0);
    const conc = result.picks.length > 0 ? maxSector / result.picks.length : 0;

    const elapsed = Date.now() - startTime;
    const responseData = JSON.stringify({
      ...result,
      dataQuality: { techPoints: Object.keys(techData).length, techCompleteness: Math.round(dataRatio * 100), fundPoints: Object.keys(fundData).length, fundCompleteness: Math.round(fundRatio * 100) },
      personalization: doPersonalize ? { enabled: !!personalizationAdj && personalizationAdj.length > 0, adjustments: personalizationAdj } : { enabled: false, adjustments: null },
      diversity: { sectorDistribution: result.sectorDistribution, concentrationRatio: Math.round(conc * 100) / 100, sectorCount: Object.keys(result.sectorDistribution).length, isConcentrated: conc > 0.6 },
      _meta: {
        elapsedMs: elapsed,
        scoringVersion: result.version,
        rankingMethod,
        methodology: method === 'v1' ? 'v1-indicator-alignment-heuristic' : rankingMethod === 'confidence' ? 'v2-fundamental-gate + confidence-ranking' : 'v2-fundamental-gate + technical-scoring',
        batchId,
        batchDate: getTodayDate(),
        personalized: doPersonalize && !!personalizationAdj,
        method,
        disclaimer: 'يستند هذا التحليل إلى محاذاة المؤشرات الفنية مع بوابة جودة أساسية. ليس توصية مالية — لا يُدّعي أداءً مستقبلياً مضموناً. لم يُثبت بعد عبر اختبار أمامي.',
      },
    });

    cached = { data: responseData, ts: Date.now(), key: cacheKey };
    return new NextResponse(responseData, {
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=300', 'X-Cache': 'MISS' },
    });
  } catch (error) {
    const elapsed = Date.now() - startTime;
    log.log('error', 'DailyPicks', `Failed: ${error instanceof Error ? error.message : String(error)}`);
    return NextResponse.json(
      { error: 'Failed', details: error instanceof Error ? error.message : String(error), elapsedMs: elapsed },
      { status: 503 },
    );
  }
}
