/**
 * Unit tests for Daily Picks Engine (src/lib/daily-picks.ts)
 * 
 * Tests: filtering, scoring, ranking, edge cases, boundary values.
 * Follows same patterns as technical-screener.test.ts.
 */
import { describe, it, expect } from 'vitest';
import {
  computeDailyPicks,
  getStrengthLabel,
  DAILY_PICKS_PARAMS,
  DAILY_PICKS_VERSION,
  type DailyPicksResult,
} from '../daily-picks';
import type { ScreenerStock } from '../technical-screener';

// ── Helpers ──────────────────────────────────────────────────────

function makeIndicators(overrides: Record<string, number> = {}) {
  return {
    rsi: 55, macd: 0.5, macdSignal: 0.3, stochK: 50, stochD: 45,
    atr: 2, bbUpper: 105, bbLower: 95, sma20: 90, sma50: 85, sma200: 75,
    ema20: 95, ema50: 85, ema200: 78, volume: 1_000_000, close: 100,
    recommendAll: 0.5, bbWidth: 10, priceVsSma200: 33, priceVsBB: 0.5,
    ...overrides,
  };
}

function makeStock(overrides: Partial<ScreenerStock> = {}): ScreenerStock {
  return {
    symbol: 'TEST', name: 'Test Stock', sector: 'Financials',
    signal: 'Buy', confidence: 60, entryPrice: 98, stopLoss: 94, stopLossPct: 4,
    takeProfits: [{ level: 1, price: 104, basis: 'SMA50', probability: 'High' }],
    riskReward: 1.5, positionSize: 10, rationale: [], tags: ['Above SMA50'],
    timeframe: 'daily', horizon: 'short-term',
    entryDetail: { price: 98, strategy: 'شراء فوري', basis: 'Close', discount: 0 },
    indicators: makeIndicators(),
    dataQuality: { score: 90, grade: 'A', missingIndicators: [], anomalies: [] },
    riskFlags: [], generatedAt: new Date().toISOString(),
    ...overrides,
  };
}

// ═══════════════════════════════════════════════════════════════════

describe('computeDailyPicks', () => {
  // ── Filter Tests ──

  describe('Filtering', () => {
    it('rejects Hold signals', () => {
      const result = computeDailyPicks([makeStock({ signal: 'Hold' })]);
      expect(result.picks.length).toBe(0);
      expect(result.totalCandidates).toBe(0);
    });

    it('rejects Sell signals', () => {
      const result = computeDailyPicks([makeStock({ signal: 'Sell' })]);
      expect(result.picks.length).toBe(0);
    });

    it('rejects confidence < 40', () => {
      const result = computeDailyPicks([makeStock({ confidence: 39 })]);
      expect(result.picks.length).toBe(0);
    });

    it('accepts confidence exactly 40 (boundary)', () => {
      const result = computeDailyPicks([makeStock({ confidence: 40 })]);
      expect(result.picks.length).toBe(1);
    });

    it('rejects riskReward < 1.5', () => {
      const result = computeDailyPicks([makeStock({ riskReward: 1.49 })]);
      expect(result.picks.length).toBe(0);
    });

    it('accepts riskReward exactly 1.5 (boundary)', () => {
      const result = computeDailyPicks([makeStock({ riskReward: 1.5 })]);
      expect(result.picks.length).toBe(1);
    });

    it('rejects RSI > 75', () => {
      const result = computeDailyPicks([makeStock({ indicators: makeIndicators({ rsi: 76 }) })]);
      expect(result.picks.length).toBe(0);
    });

    it('accepts RSI exactly 75 (boundary)', () => {
      const result = computeDailyPicks([makeStock({ indicators: makeIndicators({ rsi: 75 }) })]);
      expect(result.picks.length).toBe(1);
    });

    it('rejects fully bearish MACD (both negative, macd < signal)', () => {
      const result = computeDailyPicks([makeStock({
        indicators: makeIndicators({ macd: -0.5, macdSignal: -0.3 }),
      })]);
      expect(result.picks.length).toBe(0);
    });

    it('accepts bullish MACD (positive histogram)', () => {
      const result = computeDailyPicks([makeStock({
        indicators: makeIndicators({ macd: 0.5, macdSignal: 0.3 }),
      })]);
      expect(result.picks.length).toBe(1);
    });

    it('reports totalCandidates and totalUniverse correctly', () => {
      const stocks = [
        makeStock({ symbol: 'A', signal: 'Strong Buy' }),
        makeStock({ symbol: 'B', signal: 'Buy' }),
        makeStock({ symbol: 'C', signal: 'Hold' }),
        makeStock({ symbol: 'D', signal: 'Sell', confidence: 20 }),
      ];
      const result = computeDailyPicks(stocks);
      expect(result.totalUniverse).toBe(4);
      expect(result.totalCandidates).toBe(2);
    });
  });

  // ── Scoring Tests ──

  describe('Scoring', () => {
    it('Strong Buy scores higher than Buy (same other factors)', () => {
      const result = computeDailyPicks([
        makeStock({ symbol: 'SB', signal: 'Strong Buy' }),
        makeStock({ symbol: 'B', signal: 'Buy' }),
      ]);
      expect(result.picks[0].symbol).toBe('SB');
      expect(result.picks[0].nextSessionScore).toBeGreaterThan(result.picks[1].nextSessionScore);
    });

    it('higher confidence scores higher (same signal type)', () => {
      const result = computeDailyPicks([
        makeStock({ symbol: 'HIGH', signal: 'Buy', confidence: 90 }),
        makeStock({ symbol: 'LOW', signal: 'Buy', confidence: 45 }),
      ]);
      expect(result.picks[0].symbol).toBe('HIGH');
    });

    it('score is between 0 and 100', () => {
      const stock = makeStock({ signal: 'Strong Buy', confidence: 100 });
      const result = computeDailyPicks([stock]);
      expect(result.picks[0].nextSessionScore).toBeGreaterThan(0);
      expect(result.picks[0].nextSessionScore).toBeLessThanOrEqual(100);
    });

    it('perfect EMA stack gives higher trend score', () => {
      const perfect = makeStock({ symbol: 'PERF', indicators: makeIndicators({ ema20: 100, ema50: 90, ema200: 80 }) });
      const partial = makeStock({ symbol: 'PART', indicators: makeIndicators({ ema20: 100, ema50: 90, ema200: 100 }) }); // broken stack
      const result = computeDailyPicks([perfect, partial]);
      expect(result.picks[0].symbol).toBe('PERF');
    });

    it('volume spike tag gives higher volume score', () => {
      const spike = makeStock({ symbol: 'VOL', tags: ['Volume Spike Up'] });
      const normal = makeStock({ symbol: 'NOR', tags: ['Some Other Tag'] });
      const result = computeDailyPicks([spike, normal]);
      expect(result.picks[0].symbol).toBe('VOL');
    });

    it('higher riskReward scores higher', () => {
      const good = makeStock({ symbol: 'GOOD', riskReward: 3.5 });
      const ok = makeStock({ symbol: 'OK', riskReward: 1.5 });
      const result = computeDailyPicks([good, ok]);
      expect(result.picks[0].symbol).toBe('GOOD');
    });

    it('BB Squeeze tag adds pattern bonus', () => {
      const squeeze = makeStock({ symbol: 'SQZ', tags: ['BB Squeeze'] });
      const noSqueeze = makeStock({ symbol: 'NO', tags: [] });
      const result = computeDailyPicks([squeeze, noSqueeze]);
      expect(result.picks[0].symbol).toBe('SQZ');
    });
  });

  // ── Ranking Tests ──

  describe('Ranking', () => {
    it('returns at most maxPicks stocks', () => {
      const stocks = Array.from({ length: 10 }, (_, i) =>
        makeStock({ symbol: `S${i}`, confidence: 50 + i * 5 })
      );
      const result = computeDailyPicks(stocks);
      expect(result.picks.length).toBeLessThanOrEqual(DAILY_PICKS_PARAMS.maxPicks);
    });

    it('picks are sorted by score descending', () => {
      const stocks = Array.from({ length: 7 }, (_, i) =>
        makeStock({ symbol: `S${i}`, confidence: 40 + i * 8 })
      );
      const result = computeDailyPicks(stocks);
      for (let i = 1; i < result.picks.length; i++) {
        expect(result.picks[i - 1].nextSessionScore).toBeGreaterThanOrEqual(result.picks[i].nextSessionScore);
      }
    });

    it('each pick has a rank starting from 1', () => {
      const result = computeDailyPicks([
        makeStock({ symbol: 'A', confidence: 80 }),
        makeStock({ symbol: 'B', confidence: 60 }),
      ]);
      expect(result.picks[0].rank).toBe(1);
      expect(result.picks[1].rank).toBe(2);
    });
  });

  // ── Output Structure Tests ──

  describe('Output structure', () => {
    it('includes version', () => {
      const result = computeDailyPicks([makeStock()]);
      expect(result.version).toBe(DAILY_PICKS_VERSION);
    });

    it('includes generatedAt timestamp', () => {
      const result = computeDailyPicks([makeStock()]);
      expect(result.generatedAt).toBeTruthy();
      expect(new Date(result.generatedAt).getTime()).not.toBeNaN();
    });

    it('includes sector distribution', () => {
      const result = computeDailyPicks([
        makeStock({ symbol: 'A', sector: 'Financials' }),
        makeStock({ symbol: 'B', sector: 'Financials' }),
        makeStock({ symbol: 'C', sector: 'Real Estate' }),
      ]);
      expect(result.sectorDistribution['Financials']).toBe(2);
      expect(result.sectorDistribution['Real Estate']).toBe(1);
    });

    it('each pick has scoreBreakdown with all 6 dimensions', () => {
      const result = computeDailyPicks([makeStock()]);
      const pick = result.picks[0];
      expect(pick.scoreBreakdown).toBeDefined();
      expect(pick.scoreBreakdown.signal).toBeGreaterThanOrEqual(0);
      expect(pick.scoreBreakdown.trend).toBeGreaterThanOrEqual(0);
      expect(pick.scoreBreakdown.momentum).toBeGreaterThanOrEqual(0);
      expect(pick.scoreBreakdown.volume).toBeGreaterThanOrEqual(0);
      expect(pick.scoreBreakdown.riskReward).toBeGreaterThanOrEqual(0);
      expect(pick.scoreBreakdown.pattern).toBeGreaterThanOrEqual(0);
      expect(pick.scoreBreakdown.total).toBe(pick.nextSessionScore);
    });

    it('each pick has topRationale array', () => {
      const result = computeDailyPicks([makeStock({ signal: 'Strong Buy', tags: ['Volume Spike Up', 'BB Squeeze'] })]);
      const pick = result.picks[0];
      expect(Array.isArray(pick.topRationale)).toBe(true);
      expect(pick.topRationale.length).toBeLessThanOrEqual(4);
    });
  });

  // ── Edge Cases ──

  describe('Edge cases', () => {
    it('returns empty picks for empty input', () => {
      const result = computeDailyPicks([]);
      expect(result.picks.length).toBe(0);
      expect(result.totalUniverse).toBe(0);
      expect(result.totalCandidates).toBe(0);
    });

    it('returns empty picks when no stock passes filters', () => {
      const result = computeDailyPicks([
        makeStock({ signal: 'Hold' }),
        makeStock({ signal: 'Sell' }),
      ]);
      expect(result.picks.length).toBe(0);
    });

    it('handles zero RSI (missing data) without crashing', () => {
      const result = computeDailyPicks([makeStock({ indicators: makeIndicators({ rsi: 0 }) })]);
      expect(result.picks.length).toBe(1); // should pass filters
    });

    it('handles zero Stochastic (missing data) without crashing', () => {
      const result = computeDailyPicks([makeStock({ indicators: makeIndicators({ stochK: 0, stochD: 0 }) })]);
      expect(result.picks.length).toBe(1);
    });

    it('handles zero EMAs (missing data) without crashing', () => {
      const result = computeDailyPicks([makeStock({ indicators: makeIndicators({ ema20: 0, ema50: 0, ema200: 0, sma20: 0, sma50: 0, sma200: 0 }) })]);
      expect(result.picks.length).toBe(1);
    });

    it('respects custom maxPicks via params override', () => {
      const result = computeDailyPicks(
        Array.from({ length: 10 }, (_, i) => makeStock({ symbol: `S${i}`, confidence: 40 + i * 5 })),
        { maxPicks: 2 },
      );
      expect(result.picks.length).toBe(2);
    });
  });
});

// ── Strength Label Tests ──

describe('getStrengthLabel', () => {
  it('returns قوية جداً for score >= 75', () => {
    const label = getStrengthLabel(80);
    expect(label.label).toBe('قوية جداً');
  });

  it('returns قوية for score >= 55', () => {
    const label = getStrengthLabel(60);
    expect(label.label).toBe('قوية');
  });

  it('returns متوسطة for score < 55', () => {
    const label = getStrengthLabel(40);
    expect(label.label).toBe('متوسطة');
  });

  it('boundary: 75 is قوية جداً', () => {
    expect(getStrengthLabel(75).label).toBe('قوية جداً');
  });

  it('boundary: 55 is قوية', () => {
    expect(getStrengthLabel(55).label).toBe('قوية');
  });

  it('boundary: 54 is متوسطة', () => {
    expect(getStrengthLabel(54).label).toBe('متوسطة');
  });

  it('returns both color and bgColor', () => {
    const result = getStrengthLabel(80);
    expect(result.color).toBeTruthy();
    expect(result.bgColor).toBeTruthy();
  });
});
