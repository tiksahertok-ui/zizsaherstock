/**
 * GET /api/analysis/daily-picks/monitor
 *
 * P2-3 + A.4: Feature-specific monitoring endpoint.
 * Returns coverage, concentration, outcomes, and recent history.
 *
 * Query params:
 *   days — number of days to look back (default: 30, max: 90)
 */

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const days = Math.min(90, Math.max(1, parseInt(searchParams.get('days') || '30')));

    const since = new Date();
    since.setDate(since.getDate() - days);
    since.setHours(0, 0, 0, 0);

    const batches = await prisma.dailyPickBatch.findMany({
      where: { createdAt: { gte: since } },
      orderBy: { createdAt: 'desc' },
      include: { picks: { orderBy: { rank: 'asc' } } },
    });

    // ── KPI: Coverage ──
    const totalBatches = batches.length;
    const nonEmptyBatches = batches.filter(b => b.finalPicks > 0).length;
    const coverage = totalBatches > 0 ? (nonEmptyBatches / totalBatches) * 100 : 0;

    // ── KPI: Empty-streak detection ──
    let emptyStreak = 0;
    for (const b of batches) {
      if (b.finalPicks === 0) emptyStreak++;
      else break;
    }

    // ── KPI: Sector + Symbol frequency ──
    const sectorFrequency: Record<string, number> = {};
    const symbolFrequency: Record<string, number> = {};
    let totalPicks = 0;

    for (const batch of batches) {
      const mainPicks = batch.picks.filter(p => !p.isNextInLine);
      for (const pick of mainPicks) {
        totalPicks++;
        sectorFrequency[pick.sector] = (sectorFrequency[pick.sector] || 0) + 1;
        symbolFrequency[pick.symbol] = (symbolFrequency[pick.symbol] || 0) + 1;
      }
    }

    const topSymbols = Object.entries(symbolFrequency)
      .sort(([, a], [, b]) => b - a).slice(0, 10)
      .map(([symbol, count]) => ({ symbol, count, pct: Math.round((count / Math.max(totalPicks, 1)) * 100) }));

    const sectorDist = Object.entries(sectorFrequency)
      .sort(([, a], [, b]) => b - a)
      .map(([sector, count]) => ({ sector, count, pct: Math.round((count / Math.max(totalPicks, 1)) * 100) }));

    // ── KPI: Data health trend ──
    const avgTechCompleteness = batches.length > 0
      ? batches.reduce((sum, b) => sum + b.dataCompleteness, 0) / batches.length : 0;
    const avgFundCompleteness = batches.length > 0
      ? batches.reduce((sum, b) => sum + b.fundamentalCompleteness, 0) / batches.length : 0;

    // ── KPI: Version consistency ──
    const versions = new Set(batches.map(b => b.version));

    // ── KPI: Pipeline funnel (v2) ──
    const avgFundPass = batches.length > 0
      ? batches.reduce((sum, b) => sum + b.fundamentalPass, 0) / batches.length : 0;
    const avgTechPass = batches.length > 0
      ? batches.reduce((sum, b) => sum + b.technicalPass, 0) / batches.length : 0;

    // ── KPI: Outcome tracking (A.4) ──
    const evaluatedBatches = batches.filter(b => b.outcomeStatus === 'evaluated');
    let totalHitRate = 0;
    let totalAvgReturn = 0;
    let outcomeCount = 0;

    for (const b of evaluatedBatches) {
      if (b.outcomeJson && b.outcomeJson !== '{}') {
        try {
          const outcome = JSON.parse(b.outcomeJson);
          totalHitRate += outcome.hitRate || 0;
          totalAvgReturn += outcome.avgReturn || 0;
          outcomeCount++;
        } catch { /* skip malformed */ }
      }
    }

    // ── Recent history (last 10 batches) ──
    const recentBatches = batches.slice(0, 10).map(b => {
      const mainPicks = b.picks.filter((p: any) => !p.isNextInLine);
      const outcome = (b.outcomeJson && b.outcomeJson !== '{}') ? JSON.parse(b.outcomeJson) : null;
      return {
        date: b.batchDate, version: b.version, picks: b.finalPicks,
        fundamentalPass: b.fundamentalPass, technicalPass: b.technicalPass,
        candidates: b.technicalPass, completeness: Math.round(b.dataCompleteness),
        topPick: mainPicks[0] ? { symbol: mainPicks[0].symbol, score: mainPicks[0].nextSessionScore } : null,
        sectors: [...new Set(mainPicks.map((p: any) => p.sector))],
        outcomeStatus: b.outcomeStatus,
        hitRate: outcome?.hitRate,
        avgReturn: outcome?.avgReturn,
      };
    });

    return NextResponse.json({
      period: { days, from: since.toISOString(), to: new Date().toISOString() },
      coverage: {
        totalBatches, nonEmptyBatches,
        coveragePct: Math.round(coverage * 10) / 10, emptyStreak,
        status: coverage >= 80 ? 'healthy' : coverage >= 50 ? 'degraded' : 'critical',
      },
      pipeline: {
        avgFundamentalPass: Math.round(avgFundPass),
        avgTechnicalPass: Math.round(avgTechPass),
        avgTechCompleteness: Math.round(avgTechCompleteness * 10) / 10,
        avgFundCompleteness: Math.round(avgFundCompleteness * 10) / 10,
      },
      concentration: {
        sectorCount: Object.keys(sectorFrequency).length,
        uniqueSymbols: Object.keys(symbolFrequency).length,
        topSectors: sectorDist.slice(0, 5),
        topSymbols,
        isConcentrated: Object.keys(sectorFrequency).length <= 2 && totalBatches > 5,
      },
      outcomes: {
        evaluatedBatches: outcomeCount,
        totalBatches: batches.length,
        avgHitRate: outcomeCount > 0 ? Math.round((totalHitRate / outcomeCount) * 10) / 10 : null,
        avgReturn: outcomeCount > 0 ? Math.round((totalAvgReturn / outcomeCount) * 100) / 100 : null,
        note: outcomeCount < 10 ? `تحتاج ${10 - outcomeCount} دفعات إضافية لنتائج موثوقة` : undefined,
      },
      dataHealth: {
        avgTechCompleteness: Math.round(avgTechCompleteness * 10) / 10,
        avgFundCompleteness: Math.round(avgFundCompleteness * 10) / 10,
        versions: [...versions],
      },
      recentBatches,
    });
  } catch (error) {
    return NextResponse.json(
      { error: 'Monitor query failed', details: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}
