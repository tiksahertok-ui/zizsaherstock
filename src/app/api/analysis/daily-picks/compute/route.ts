/**
 * POST /api/analysis/daily-picks/compute
 *
 * Trigger endpoint for nightly batch computation.
 * Designed to be called by an external cron job (Vercel Cron,
 * GitHub Actions, or any scheduler) after market close.
 *
 * EGX market hours: Sun-Thu 10:00-14:45 Cairo time.
 * Recommended schedule: 15:30 Cairo daily (after session close + 45min buffer).
 *
 * Also supports manual trigger via ?force=true.
 *
 * Body (optional):
 *   { "secret": "<CRON_SECRET>" }
 *
 * If DAILY_PICKS_CRON_SECRET env var is set, the secret must match.
 */

import { NextRequest, NextResponse } from 'next/server';
import { fetchTechnicalIndicators, fetchQuotesLive } from '@/lib/market-data';
import { EGX_STOCKS } from '@/lib/egx-stocks';
import { runTechnicalScreener, createLogger, type Timeframe } from '@/lib/technical-screener';
import { fetchFundamentals } from '@/lib/fundamentals';
import { computeDailyPicksV2, DAILY_PICKS_VERSION, type MarketContext } from '@/lib/daily-picks-v2';
import prisma from '@/lib/db';

function getTodayDate(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Cairo' });
}

export async function POST(request: NextRequest) {
  const startTime = Date.now();
  const log = createLogger();

  try {
    // Secret validation (if configured)
    const cronSecret = process.env.DAILY_PICKS_CRON_SECRET;
    if (cronSecret) {
      const body = await request.json().catch(() => ({}));
      if (body.secret !== cronSecret) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
    }

    const { searchParams } = new URL(request.url);
    const timeframe = (searchParams.get('timeframe') as Timeframe) || 'daily';
    const force = searchParams.get('force') === 'true';

    // Check if batch already exists for today (idempotency)
    const batchDate = getTodayDate();
    if (!force) {
      const existing = await prisma.dailyPickBatch.findFirst({
        where: { batchDate, timeframe },
        include: { picks: true },
      });
      if (existing) {
        return NextResponse.json({
          status: 'already_exists',
          batchId: existing.id,
          batchDate,
          picks: existing.picks.length,
          message: 'Batch already computed for today. Use ?force=true to recompute.',
        });
      }
    }

    log.log('info', 'DailyPicks:Compute', `Starting nightly batch computation for ${batchDate}`);

    // 1. Fetch technical data
    const allSymbols = EGX_STOCKS.map(s => s.symbol);
    const techData = await fetchTechnicalIndicators(allSymbols);
    const dataRatio = Object.keys(techData).length / allSymbols.length;
    log.log('info', 'DailyPicks:Compute', `Technical data: ${Object.keys(techData).length}/${allSymbols.length}`);

    if (Object.keys(techData).length < 10) {
      return NextResponse.json({ error: 'Insufficient technical data', count: Object.keys(techData).length }, { status: 503 });
    }

    // 2. Fetch fundamentals
    const fundData = await fetchFundamentals(allSymbols);
    const fundRatio = Object.keys(fundData).length / allSymbols.length;
    log.log('info', 'DailyPicks:Compute', `Fundamental data: ${Object.keys(fundData).length}/${allSymbols.length}`);

    // 3. Market context
    let marketContext: MarketContext | null = null;
    try {
      const quotes = await fetchQuotesLive(['CASE:EGX30']);
      const egx30 = quotes['CASE:EGX30'] || quotes['EGX30'];
      if (egx30?.close) {
        const changePct = egx30.changePercent || 0;
        marketContext = {
          egx30Level: egx30.close,
          egx30ChangePct: changePct,
          marketVolatility: Math.abs(changePct) > 2 ? 'high' : Math.abs(changePct) > 0.8 ? 'medium' : 'low',
          regime: changePct > 0.5 ? 'bullish' : changePct < -0.5 ? 'bearish' : 'ranging',
          timestamp: new Date().toISOString(),
        };
      }
    } catch (e) { /* non-critical */ }

    // 4. Run screener
    const avgVolumes: Record<string, number> = {};
    for (const [sym, t] of Object.entries(techData)) avgVolumes[sym] = t.avgVolume30d > 0 ? t.avgVolume30d : t.volume;
    const stockInfo = EGX_STOCKS.filter(s => techData[s.symbol]?.close > 0).map(s => ({ symbol: s.symbol, name: s.name, sector: s.sector }));
    const screenerResult = await runTechnicalScreener(techData, stockInfo, avgVolumes, { timeframe }, log);

    // 5. Compute picks
    const result = computeDailyPicksV2(screenerResult.stocks, fundData, marketContext);
    log.log('info', 'DailyPicks:Compute', `${result.picks.length} picks, ${result.nextInLine.length} next-in-line`);

    // 6. Persist
    const batch = await prisma.dailyPickBatch.create({
      data: {
        batchDate, timeframe, version: result.version,
        totalUniverse: result.totalUniverse,
        fundamentalPass: result.fundamentalPass,
        technicalPass: result.technicalPass,
        finalPicks: result.picks.length,
        pickCountNote: result.countNote,
        dataCompleteness: Math.round(dataRatio * 100),
        fundamentalCompleteness: Math.round(fundRatio * 100),
        marketContextJson: JSON.stringify(marketContext || {}),
        sectorDistJson: JSON.stringify(result.sectorDistribution),
        paramsSnapshotJson: JSON.stringify(result.paramsSnapshot),
        picks: { create: [
          ...result.picks.map(p => ({
            rank: p.rank, isNextInLine: false,
            symbol: p.symbol, name: p.name, sector: p.sector,
            signal: p.signal, confidence: p.confidence,
            nextSessionScore: p.nextSessionScore,
            scoreBreakdownJson: JSON.stringify(p.scoreBreakdown),
            topRationaleJson: JSON.stringify(p.topRationale),
            fundamentalGateJson: JSON.stringify(p.fundamentalGate),
            closePrice: p.indicators.close,
            entryPrice: p.entryPrice, stopLoss: p.stopLoss,
            takeProfit1: p.takeProfits[0]?.price,
            takeProfit2: p.takeProfits[1]?.price,
            takeProfit3: p.takeProfits[2]?.price,
            riskReward: p.riskReward,
          })),
          ...result.nextInLine.map(p => ({
            rank: p.rank, isNextInLine: true,
            symbol: p.symbol, name: p.name, sector: p.sector,
            signal: p.signal, confidence: p.confidence,
            nextSessionScore: p.nextSessionScore,
            scoreBreakdownJson: JSON.stringify(p.scoreBreakdown),
            topRationaleJson: JSON.stringify(p.topRationale),
            fundamentalGateJson: JSON.stringify(p.fundamentalGate),
            closePrice: p.indicators.close,
            entryPrice: p.entryPrice, stopLoss: p.stopLoss,
            takeProfit1: p.takeProfits[0]?.price,
            takeProfit2: p.takeProfits[1]?.price,
            takeProfit3: p.takeProfits[2]?.price,
            riskReward: p.riskReward,
          })),
        ] },
      },
    });

    const elapsed = Date.now() - startTime;
    log.log('info', 'DailyPicks:Compute', `Batch persisted: ${batch.id} (${elapsed}ms)`);

    // 7. Evaluate yesterday's batch outcomes (A.4)
    //    After computing today's picks, check if yesterday's batch
    //    has pending outcomes and evaluate them.
    let outcomeResult: { batchDate: string; evaluatedCount: number; hitRate: number; avgReturn: number; totalReturn: number; evaluatedAt: string } | null = null;
    try {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayStr = yesterday.toLocaleDateString('en-CA', { timeZone: 'Africa/Cairo' });
      const pendingBatch = await prisma.dailyPickBatch.findFirst({
        where: { batchDate: yesterdayStr, outcomeStatus: 'pending' },
        include: { picks: { where: { isNextInLine: false } } },
      });
      if (pendingBatch && pendingBatch.picks.length > 0) {
        const symbols = pendingBatch.picks.map(p => p.symbol);
        const quotes = await fetchQuotesLive(symbols);
        let hits = 0, totalReturn = 0, evaluatedCount = 0;
        for (const pick of pendingBatch.picks) {
          const q = quotes[pick.symbol];
          if (!q || !q.close) continue;
          const returnPct = pick.entryPrice > 0 ? ((q.close - pick.entryPrice) / pick.entryPrice) * 100 : 0;
          const slHit = (q.low || q.close) <= pick.stopLoss;
          const tp1Hit = pick.takeProfit1 ? (q.high || q.close) >= pick.takeProfit1 : false;
          let note = '';
          if (slHit) note = `وقف خسارة عند ${(q.low || q.close).toFixed(2)}`;
          else if (tp1Hit) note = `وصل المستهدف الأول ${pick.takeProfit1?.toFixed(2)}`;
          else note = `عائد ${returnPct >= 0 ? '+' : ''}${returnPct.toFixed(2)}%`;
          await prisma.dailyPickRecord.update({
            where: { id: pick.id },
            data: {
              nextDayOpen: q.close, nextDayClose: q.close,
              maxPrice: q.high || q.close, minPrice: q.low || q.close,
              realizedReturn: Math.round(returnPct * 100) / 100,
              stopHit: slHit, tp1Hit, outcomeNote: note,
            },
          });
          if (returnPct > 0) hits++;
          totalReturn += returnPct;
          evaluatedCount++;
        }
        const avgRet = evaluatedCount > 0 ? totalReturn / evaluatedCount : 0;
        const hitRateVal = evaluatedCount > 0 ? (hits / evaluatedCount) * 100 : 0;
        const outcomeData = {
          evaluatedAt: new Date().toISOString(), evaluatedCount,
          hitRate: Math.round(hitRateVal * 10) / 10,
          avgReturn: Math.round(avgRet * 100) / 100,
          totalReturn: Math.round(totalReturn * 100) / 100,
        };
        await prisma.dailyPickBatch.update({
          where: { id: pendingBatch.id },
          data: { outcomeStatus: 'evaluated', outcomeJson: JSON.stringify(outcomeData) },
        });
        outcomeResult = { batchDate: yesterdayStr, ...outcomeData };
        log.log('info', 'DailyPicks:Compute', `Evaluated yesterday's outcomes: hitRate=${hitRateVal.toFixed(1)}%, avgReturn=${avgRet.toFixed(2)}%`);
      }
    } catch (e) {
      log.log('warn', 'DailyPicks:Compute', `Outcome evaluation failed (non-critical): ${e instanceof Error ? e.message : String(e)}`);
    }

    return NextResponse.json({
      status: 'success',
      batchId: batch.id, batchDate, version: result.version,
      picks: result.picks.length, nextInLine: result.nextInLine.length,
      fundamentalPass: result.fundamentalPass, technicalPass: result.technicalPass,
      totalUniverse: result.totalUniverse, countNote: result.countNote,
      marketContext, elapsedMs: elapsed,
      outcomeEvaluation: outcomeResult,
    });
  } catch (error) {
    log.log('error', 'DailyPicks:Compute', `Failed: ${error instanceof Error ? error.message : String(error)}`);
    return NextResponse.json(
      { error: 'Batch computation failed', details: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}
