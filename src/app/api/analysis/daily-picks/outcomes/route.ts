/**
 * POST /api/analysis/daily-picks/outcomes
 *
 * Evaluate past daily picks against realized prices (A.4 outcome tracking).
 * Updates each pick's next-day open/close, realized return, and SL/TP hit status.
 *
 * Designed to run after the next session opens (or at end of next session
 * for more complete data).
 *
 * Body:
 *   { "date": "YYYY-MM-DD" } — evaluate picks for this date
 *   { "evaluateAll": true } — evaluate all pending batches
 *   { "secret": "<CRON_SECRET>" } — if DAILY_PICKS_CRON_SECRET is set
 */

import { NextRequest, NextResponse } from 'next/server';
import { fetchQuotesLive } from '@/lib/market-data';
import prisma from '@/lib/db';

function getTodayDate(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Cairo' });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));

    // Secret validation
    const cronSecret = process.env.DAILY_PICKS_CRON_SECRET;
    if (cronSecret && body.secret !== cronSecret) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Find batches to evaluate
    let batches;
    if (body.evaluateAll) {
      batches = await prisma.dailyPickBatch.findMany({
        where: { outcomeStatus: 'pending' },
        orderBy: { batchDate: 'asc' },
        include: { picks: { where: { isNextInLine: false } } },
      });
    } else if (body.date) {
      const batch = await prisma.dailyPickBatch.findFirst({
        where: { batchDate: body.date },
        include: { picks: { where: { isNextInLine: false } } },
      });
      batches = batch ? [batch] : [];
    } else {
      // Default: evaluate yesterday's batch
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayStr = yesterday.toLocaleDateString('en-CA', { timeZone: 'Africa/Cairo' });
      const batch = await prisma.dailyPickBatch.findFirst({
        where: { batchDate: yesterdayStr, outcomeStatus: 'pending' },
        include: { picks: { where: { isNextInLine: false } } },
      });
      batches = batch ? [batch] : [];
    }

    if (batches.length === 0) {
      return NextResponse.json({ status: 'no_pending_batches', message: 'No pending batches to evaluate' });
    }

    const results = [];

    for (const batch of batches) {
      const symbols = batch.picks.map(p => p.symbol);
      const quotes = await fetchQuotesLive(symbols);

      let hits = 0;
      let totalReturn = 0;
      let evaluatedCount = 0;

      for (const pick of batch.picks) {
        const q = quotes[pick.symbol];
        if (!q || !q.price) continue;

        const entryPrice = pick.entryPrice;
        const openPrice = q.price; // use current price as proxy (intraday would need OHLC)
        const returnPct = entryPrice > 0 ? ((q.price - entryPrice) / entryPrice) * 100 : 0;
        const stopHit = q.price <= pick.stopLoss;
        const tp1Hit = pick.takeProfit1 ? q.price >= pick.takeProfit1 : false;

        let note = '';
        if (stopHit) note = `وقف خسارة عند ${q.price.toFixed(2)}`;
        else if (tp1Hit) note = `وصل المستهدف الأول ${pick.takeProfit1?.toFixed(2)}`;
        else note = `عائد ${returnPct >= 0 ? '+' : ''}${returnPct.toFixed(2)}%`;

        await prisma.dailyPickRecord.update({
          where: { id: pick.id },
          data: {
            nextDayOpen: openPrice,
            nextDayClose: q.price,
            realizedReturn: Math.round(returnPct * 100) / 100,
            stopHit,
            tp1Hit,
            outcomeNote: note,
          },
        });

        if (returnPct > 0) hits++;
        totalReturn += returnPct;
        evaluatedCount++;
      }

      const avgReturn = evaluatedCount > 0 ? totalReturn / evaluatedCount : 0;
      const hitRate = evaluatedCount > 0 ? (hits / evaluatedCount) * 100 : 0;

      // Update batch outcome
      const outcomeData = {
        evaluatedAt: new Date().toISOString(),
        evaluatedCount,
        hitRate: Math.round(hitRate * 10) / 10,
        avgReturn: Math.round(avgReturn * 100) / 100,
        totalReturn: Math.round(totalReturn * 100) / 100,
      };

      await prisma.dailyPickBatch.update({
        where: { id: batch.id },
        data: {
          outcomeStatus: 'evaluated',
          outcomeJson: JSON.stringify(outcomeData),
        },
      });

      results.push({
        batchDate: batch.batchDate,
        batchId: batch.id,
        ...outcomeData,
      });
    }

    return NextResponse.json({
      status: 'success',
      evaluatedBatches: results.length,
      results,
    });
  } catch (error) {
    return NextResponse.json(
      { error: 'Outcome evaluation failed', details: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}
