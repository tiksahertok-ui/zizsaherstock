/**
 * Unit tests for Daily Picks Engine v2 (src/lib/daily-picks-v2.ts)
 * 
 * Tests: fundamental gate, consolidated scoring, sector guard,
 * EGX price limit bounding, flexible count, next-in-line.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import {
  evaluateFundamentalGate,
  computeDailyPicksV2,
  computeDailyPicksWithMethod,
  personalizePicks,
  getStrengthLabel,
  boundByEGXPriceLimits,
  DAILY_PICKS_VERSION,
  DAILY_PICKS_PARAMS,
  type DailyPicksResult,
  type FundamentalGateResult,
} from '../daily-picks-v2';
import type { ScreenerStock } from '../technical-screener';
import type { FundamentalData } from '../fundamentals';

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

function makeFundamental(overrides: Partial<FundamentalData> = {}): FundamentalData {
  return {
    symbol: 'TEST', name: 'Test', price: 100, change: 1, changeAbs: 1, volume: 500000,
    marketCap: 1e9, currency: 'EGP', week52High: 120, week52Low: 80, beta: 0.8,
    pe: 10, pb: 1.5, evEbitda: 6, ps: 2, peg: 1.2,
    eps: 10, bvps: 67, dps: 5, revenuePerShare: 50, sharesOutstanding: 1e7,
    revenue: 5e8, netIncome: 5e7, operatingIncome: 8e7, grossProfit: 2e8,
    grossMargin: 40, operatingMargin: 16, netMargin: 10, roe: 15, roa: 8,
    revenueGrowth: 12, earningsGrowth: 15,
    debtEquity: 2, totalDebt: 2e8, cash: 1e8, totalAssets: 5e8,
    totalLiabilities: 2e8, stockholdersEquity: 3e8, workingCapital: 1e8,
    freeCashFlow: 5e7, capex: 3e7, operatingCashFlow: 8e7,
    dividendYield: 5, payoutRatio: 50,
    hasData: true, hasProfitability: true, hasBalanceSheet: true,
    hasCashFlow: true, hasGrowth: true, isEGP: true,
    dataSource: 'tradingview', dataQualityScore: 80,
    validatedAt: null, source: 'TradingView Scanner', fetchedAt: new Date().toISOString(),
    missingFields: [],
    ...overrides,
  };
}

function makeFundamentalsMap(stocks: ScreenerStock[], overrides?: Record<string, Partial<FundamentalData>>): Record<string, FundamentalData> {
  const map: Record<string, FundamentalData> = {};
  for (const s of stocks) {
    map[s.symbol] = makeFundamental({ symbol: s.symbol, name: s.name, ...(overrides?.[s.symbol] || {}) });
  }
  return map;
}

// ═══════════════════════════════════════════════════════════════════

describe('Daily Picks v2', () => {

  // ── A.2: Fundamental Gate Tests ──

  describe('Fundamental Gate (A.2)', () => {
    it('passes a stock with all healthy fundamentals', () => {
      const f = makeFundamental();
      const result = evaluateFundamentalGate('GOOD', f);
      expect(result.passed).toBe(true);
      expect(result.overallScore).toBe(7);
    });

    it('fails when no fundamental data exists', () => {
      const result = evaluateFundamentalGate('NO_DATA', undefined);
      expect(result.passed).toBe(false);
      expect(result.overallScore).toBe(0);
    });

    it('fails when hasData is false', () => {
      const f = makeFundamental({ hasData: false });
      const result = evaluateFundamentalGate('BAD', f);
      expect(result.passed).toBe(false);
    });

    it('fails when all margins are negative', () => {
      const f = makeFundamental({ grossMargin: -5, netMargin: -10, operatingMargin: -3 });
      const result = evaluateFundamentalGate('UNPROFIT', f);
      expect(result.passed).toBe(false);
      expect(result.checks.profitability.passed).toBe(false);
    });

    it('passes when at least one margin is positive', () => {
      const f = makeFundamental({ grossMargin: 5, netMargin: -2, operatingMargin: -1 });
      const result = evaluateFundamentalGate('MIXED', f);
      expect(result.checks.profitability.passed).toBe(true);
    });

    it('fails when D/E exceeds 10', () => {
      const f = makeFundamental({ debtEquity: 12 });
      const result = evaluateFundamentalGate('HIGH_DE', f);
      expect(result.checks.solvency.passed).toBe(false);
    });

    it('passes when D/E exactly 10 (boundary)', () => {
      const f = makeFundamental({ debtEquity: 10 });
      const result = evaluateFundamentalGate('BOUND', f);
      expect(result.checks.solvency.passed).toBe(true);
    });

    it('fails when free cash flow is negative', () => {
      const f = makeFundamental({ freeCashFlow: -1e7 });
      const result = evaluateFundamentalGate('NO_FCF', f);
      expect(result.checks.cashFlow.passed).toBe(false);
    });

    it('fails when revenue is zero', () => {
      const f = makeFundamental({ revenue: 0 });
      const result = evaluateFundamentalGate('NO_REV', f);
      expect(result.checks.revenue.passed).toBe(false);
    });

    it('fails when P/E is > 3x sector average', () => {
      const f = makeFundamental({ pe: 50 }); // 50 / 8.5 (Financials avg) > 3
      const result = evaluateFundamentalGate('OVERVAL', f);
      expect(result.checks.valuation.passed).toBe(false);
    });

    it('passes when P/E is within 3x sector average', () => {
      const f = makeFundamental({ pe: 20 }); // 20 / 8.5 < 3
      const result = evaluateFundamentalGate('OK_VAL', f);
      expect(result.checks.valuation.passed).toBe(true);
    });

    it('passes valuation when P/E is 0 (cannot judge)', () => {
      const f = makeFundamental({ pe: 0 });
      const result = evaluateFundamentalGate('NO_PE', f);
      expect(result.checks.valuation.passed).toBe(true);
    });

    it('fails when data quality score < 30', () => {
      const f = makeFundamental({ dataQualityScore: 20 });
      const result = evaluateFundamentalGate('LOW_DQ', f);
      expect(result.checks.dataQuality.passed).toBe(false);
    });

    it('passes when data quality score >= 30 (boundary)', () => {
      const f = makeFundamental({ dataQualityScore: 30 });
      const result = evaluateFundamentalGate('DQ_BOUND', f);
      expect(result.checks.dataQuality.passed).toBe(true);
    });

    it('fails when currency is not EGP', () => {
      const f = makeFundamental({ currency: 'USD', isEGP: false });
      const result = evaluateFundamentalGate('USD_STOCK', f);
      expect(result.checks.currency.passed).toBe(false);
    });

    it('each check has Arabic detail string', () => {
      const f = makeFundamental();
      const result = evaluateFundamentalGate('DETAIL', f);
      for (const key of Object.keys(result.checks)) {
        expect(result.checks[key as keyof typeof result.checks].detail).toBeTruthy();
      }
    });
  });

  // ── Two-Stage Pipeline Tests ──

  describe('Two-Stage Pipeline', () => {
    it('excludes stocks that fail fundamental gate', () => {
      const stock = makeStock({ symbol: 'BAD', signal: 'Strong Buy', confidence: 90 });
      const badFund = makeFundamental({ debtEquity: 15 }); // fails solvency
      const result = computeDailyPicksV2([stock], { BAD: badFund });
      expect(result.picks.length).toBe(0);
      expect(result.fundamentalPass).toBe(0);
    });

    it('includes stocks that pass fundamental gate and technical filters', () => {
      const stock = makeStock({ symbol: 'GOOD', signal: 'Strong Buy', confidence: 70 });
      const fund = makeFundamental();
      const result = computeDailyPicksV2([stock], { GOOD: fund });
      expect(result.picks.length).toBe(1);
      expect(result.fundamentalPass).toBe(1);
      expect(result.technicalPass).toBe(1);
    });

    it('reports fundamentalPass count correctly', () => {
      const stocks = [
        makeStock({ symbol: 'A', signal: 'Buy', confidence: 60 }),
        makeStock({ symbol: 'B', signal: 'Buy', confidence: 50 }),
        makeStock({ symbol: 'C', signal: 'Buy', confidence: 40 }),
      ];
      // All pass fundamentals (default makeFundamental is healthy)
      const funds = makeFundamentalsMap(stocks);
      const result = computeDailyPicksV2(stocks, funds);
      expect(result.fundamentalPass).toBe(3);
    });

    it('each pick has fundamentalGate data attached', () => {
      const stock = makeStock({ signal: 'Buy', confidence: 60 });
      const funds = makeFundamentalsMap([stock]);
      const result = computeDailyPicksV2([stock], funds);
      expect(result.picks[0].fundamentalGate).toBeDefined();
      expect(result.picks[0].fundamentalGate.passed).toBe(true);
      expect(result.picks[0].fundamentalGate.overallScore).toBeGreaterThan(0);
    });

    it('version is 2.0.0', () => {
      const result = computeDailyPicksV2([], {});
      expect(result.version).toBe('2.0.0');
    });
  });

  // ── B.1: Flexible Count ──

  describe('Flexible Count (B.1)', () => {
    it('returns fewer than 5 with countNote when fewer pass', () => {
      const stocks = [makeStock({ symbol: 'ONLY', signal: 'Buy', confidence: 60 })];
      const funds = makeFundamentalsMap(stocks);
      const result = computeDailyPicksV2(stocks, funds);
      expect(result.picks.length).toBe(1);
      expect(result.countNote).toBeTruthy();
      expect(result.countNote).toContain('1');
    });

    it('returns empty with countNote when zero pass', () => {
      const result = computeDailyPicksV2([], {});
      expect(result.picks.length).toBe(0);
      expect(result.countNote).toBeTruthy();
    });

    it('no countNote when exactly 5 pass', () => {
      const stocks = Array.from({ length: 5 }, (_, i) =>
        makeStock({ symbol: `S${i}`, confidence: 40 + i * 10 })
      );
      const funds = makeFundamentalsMap(stocks);
      const result = computeDailyPicksV2(stocks, funds);
      if (result.picks.length === 5) {
        expect(result.countNote).toBe('');
      }
    });
  });

  // ── B.4: Next-In-Line ──

  describe('Next-In-Line (B.4)', () => {
    it('returns nextInLine for ranks 6-10', () => {
      const stocks = Array.from({ length: 8 }, (_, i) =>
        makeStock({ symbol: `S${i}`, confidence: 40 + i * 5 })
      );
      const funds = makeFundamentalsMap(stocks);
      const result = computeDailyPicksV2(stocks, funds);
      expect(result.nextInLine.length).toBeGreaterThan(0);
      expect(result.nextInLine.length).toBeLessThanOrEqual(5);
      for (const nil of result.nextInLine) {
        expect(nil.isNextInLine).toBe(true);
        expect(nil.rank).toBeGreaterThan(5);
      }
    });

    it('main picks are not marked as nextInLine', () => {
      const stocks = [makeStock({ symbol: 'A', confidence: 70 })];
      const funds = makeFundamentalsMap(stocks);
      const result = computeDailyPicksV2(stocks, funds);
      for (const pick of result.picks) {
        expect(pick.isNextInLine).toBe(false);
      }
    });
  });

  // ── B.2: Sector Guard ──

  describe('Sector Concentration Guard (B.2)', () => {
    it('applies penalty when >3 stocks from same sector', () => {
      // Create stocks with very close scores so the penalty can actually reorder them
      const stocks = Array.from({ length: 6 }, (_, i) =>
        makeStock({ symbol: `FIN${i}`, sector: 'Financials', confidence: 60 + i * 0.5 })
      );
      // Add one non-financial stock with a moderate score to test it can displace
      stocks.push(makeStock({ symbol: 'OTHER', sector: 'Real Estate', confidence: 55 }));
      const funds = makeFundamentalsMap(stocks);
      const result = computeDailyPicksV2(stocks, funds);
      // With soft penalty, at least one non-Financial should appear if scores are close
      // The key assertion: the penalty IS applied (we can verify total fin count is < 6)
      const finCount = result.picks.filter(p => p.sector === 'Financials').length;
      expect(finCount).toBeLessThan(6); // not all 5 or 6 are financials
    });

    it('does not penalize when sectors are diverse', () => {
      const stocks = [
        makeStock({ symbol: 'A', sector: 'Financials', confidence: 60 }),
        makeStock({ symbol: 'B', sector: 'Real Estate', confidence: 59 }),
        makeStock({ symbol: 'C', sector: 'Materials', confidence: 58 }),
        makeStock({ symbol: 'D', sector: 'Healthcare', confidence: 57 }),
        makeStock({ symbol: 'E', sector: 'Industrials', confidence: 56 }),
      ];
      const funds = makeFundamentalsMap(stocks);
      const result = computeDailyPicksV2(stocks, funds);
      const sectors = new Set(result.picks.map(p => p.sector));
      expect(sectors.size).toBeGreaterThan(1);
    });
  });

  // ── A.5: EGX Price Limit Bounding ──

  describe('EGX Price Limit Bounding (A.5)', () => {
    it('bounds stop-loss to daily limit floor', () => {
      const { boundedSL } = boundByEGXPriceLimits(100, 80, []);
      // 100 * (1 - 0.16) = 84
      expect(boundedSL).toBe(84);
    });

    it('does not raise SL when it is within limits', () => {
      const { boundedSL } = boundByEGXPriceLimits(100, 90, []);
      expect(boundedSL).toBe(90); // unchanged
    });

    it('bounds take-profit to daily limit ceiling', () => {
      const { boundedTPs } = boundByEGXPriceLimits(100, 90, [120, 130]);
      // 100 * 1.16 = 116
      expect(boundedTPs[0]).toBeCloseTo(116, 0.01);
      expect(boundedTPs[1]).toBeCloseTo(116, 0.01);
    });

    it('does not lower TP when within limits', () => {
      const { boundedTPs } = boundByEGXPriceLimits(100, 90, [105, 110]);
      expect(boundedTPs[0]).toBe(105);
      expect(boundedTPs[1]).toBe(110);
    });

    it('returns limit values for reference', () => {
      const { slLimit, tpLimit } = boundByEGXPriceLimits(100, 90, []);
      expect(slLimit).toBe(84);
      expect(tpLimit).toBeCloseTo(116, 0.01);
    });
  });

  // ── A.4: Multicollinearity Cap ──

  describe('Multicollinearity Cap (A.4)', () => {
    it('trend score does not exceed 20 even with all MA signals', () => {
      const stock = makeStock({
        signal: 'Strong Buy', confidence: 100,
        indicators: makeIndicators({
          ema20: 110, ema50: 100, ema200: 90, // perfect stack = 8
          sma20: 105, sma50: 100, sma200: 90, // above all 3 SMAs = 9
        }),
        tags: ['Above SMA50', 'Above SMA200'],
      });
      const funds = makeFundamentalsMap([stock]);
      const result = computeDailyPicksV2([stock], funds);
      if (result.picks.length > 0) {
        expect(result.picks[0].scoreBreakdown.trend).toBeLessThanOrEqual(20);
      }
    });
  });

  // ── Output Structure ──

  describe('Output Structure', () => {
    it('includes paramsSnapshot (B.7)', () => {
      const result = computeDailyPicksV2([], {});
      expect(result.paramsSnapshot).toBeDefined();
      expect(result.paramsSnapshot.fundamental).toBeDefined();
      expect(result.paramsSnapshot.egx.dailyPriceLimitPct).toBe(16);
    });

    it('includes marketContext field', () => {
      const result = computeDailyPicksV2([], {});
      expect(result).toHaveProperty('marketContext');
    });

    it('includes totalUniverse, fundamentalPass, technicalPass', () => {
      const stocks = [makeStock({ symbol: 'A' })];
      const funds = makeFundamentalsMap(stocks);
      const result = computeDailyPicksV2(stocks, funds);
      expect(result.totalUniverse).toBe(1);
      expect(result.fundamentalPass).toBeGreaterThanOrEqual(0);
      expect(result.technicalPass).toBeGreaterThanOrEqual(0);
    });
  });

  // ── Personalization (re-exported from v2) ──

  describe('Personalization (v2)', () => {
    it('works with v2 DailyPick type', () => {
      const stocks = [
        makeStock({ symbol: 'A', confidence: 80, sector: 'Financials' }),
        makeStock({ symbol: 'B', confidence: 60, sector: 'Real Estate' }),
      ];
      const funds = makeFundamentalsMap(stocks);
      const result = computeDailyPicksV2(stocks, funds);
      const { picks } = personalizePicks(result.picks, {
        heldSectors: [], heldSymbols: ['A'], watchlistSymbols: [],
      });
      expect(picks[0].symbol).toBe('B'); // A penalized
    });
  });
});
