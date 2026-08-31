/**
 * GET /api/analysis/daily-picks/monitor
 *
 * P2-3: Feature-specific monitoring endpoint.
 * Returns coverage, concentration, and recent pick history.
 *
 * Query params:
 *   days — number of days to look back (default: 30, max: 90)
 *
 * KPIs tracked (from audit §5):
 *   - Coverage: % of trading days with non-empty pick lists
 *   - Concentration: sector diversity across batches
 *   - Frequency: which stocks appear most often in picks
 *   - Data health: data completeness at time of each batch
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

    // ── Fetch batches in range ──
    const batches = await prisma.dailyPickBatch.findMany({
      where: { createdAt: { gte: since } },
      orderBy: { createdAt: 'desc' },
      include: { picks: { orderBy: { rank: 'asc' } } },
    });

    // ── KPI: Coverage ──
    const totalBatches = batches.length;
    const nonEmptyBatches = batches.filter(b => b.picks.length > 0).length;
    const coverage = totalBatches > 0 ? (nonEmptyBatches / totalBatches) * 100 : 0;

    // ── KPI: Empty-streak detection ──
    let emptyStreak = 0;
    for (const b of batches) {
      if (b.picks.length === 0) emptyStreak++;
      else break;
    }

    // ── KPI: Sector concentration over time ──
    const sectorFrequency: Record<string, number> = {};
    const symbolFrequency: Record<string, number> = {};
    let totalPicks = 0;

    for (const batch of batches) {
      for (const pick of batch.picks) {
        totalPicks++;
        sectorFrequency[pick.sector] = (sectorFrequency[pick.sector] || 0) + 1;
        symbolFrequency[pick.symbol] = (symbolFrequency[pick.symbol] || 0) + 1;
      }
    }

    // Top 10 most-picked symbols
    const topSymbols = Object.entries(symbolFrequency)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10)
      .map(([symbol, count]) => ({ symbol, count, pct: Math.round((count / Math.max(totalPicks, 1)) * 100) }));

    // Sector distribution
    const sectorDist = Object.entries(sectorFrequency)
      .sort(([, a], [, b]) => b - a)
      .map(([sector, count]) => ({ sector, count, pct: Math.round((count / Math.max(totalPicks, 1)) * 100) }));

    // ── KPI: Data health trend ──
    const avgCompleteness = batches.length > 0
      ? batches.reduce((sum, b) => sum + b.dataCompleteness, 0) / batches.length
      : 0;

    // ── KPI: Version consistency ──
    const versions = new Set(batches.map(b => b.version));

    // ── Recent history (last 10 batches) ──
    const recentBatches = batches.slice(0, 10).map(b => ({
      date: b.batchDate,
      version: b.version,
      picks: b.picks.length,
      candidates: b.totalCandidates,
      completeness: Math.round(b.dataCompleteness),
      topPick: b.picks[0] ? { symbol: b.picks[0].symbol, score: b.picks[0].nextSessionScore } : null,
      sectors: [...new Set(b.picks.map(p => p.sector))],
    }));

    return NextResponse.json({
      period: { days, from: since.toISOString(), to: new Date().toISOString() },
      coverage: {
        totalBatches,
        nonEmptyBatches,
        coveragePct: Math.round(coverage * 10) / 10,
        emptyStreak,
        status: coverage >= 80 ? 'healthy' : coverage >= 50 ? 'degraded' : 'critical',
      },
      concentration: {
        sectorCount: Object.keys(sectorFrequency).length,
        uniqueSymbols: Object.keys(symbolFrequency).length,
        topSectors: sectorDist.slice(0, 5),
        topSymbols,
        isConcentrated: Object.keys(sectorFrequency).length <= 2 && totalBatches > 5,
      },
      dataHealth: {
        avgCompleteness: Math.round(avgCompleteness * 10) / 10,
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
