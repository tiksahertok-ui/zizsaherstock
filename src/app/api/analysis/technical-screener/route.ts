import { NextRequest, NextResponse } from 'next/server';
import { fetchTechnicalIndicators, fetchQuotesLive, fetchPerformance } from '@/lib/market-data';
import { EGX_STOCKS } from '@/lib/egx-stocks';
import {
  runTechnicalScreener, backtestSignals, toCSV,
  DEFAULT_PARAMS, createLogger,
  type ScreenerParameters, type Timeframe,
} from '@/lib/technical-screener';

/**
 * GET /api/analysis/technical-screener
 *
 * Query params:
 *   sector       — filter by sector name
 *   minConfidence — minimum confidence (0-100)
 *   minPrice     — minimum stock price
 *   maxPrice     — maximum stock price (0 = no max)
 *   signal       — filter by signal type (Strong Buy|Buy|Hold|Sell|Strong Sell)
 *   sort         — confidence | riskReward | entryPrice | rsi
 *   limit        — max results (default 260, max 260)
 *   timeframe    — daily | weekly | monthly
 *   backtest     — true to include backtest
 *   backtestPeriod — 1W | 1M | 3M | 6M
 *   format       — json | csv
 *
 * Cache: 120s stale-while-revalidate
 */

// Simple in-memory cache for the full screener result
let cachedResult: { data: string; ts: number; params: string } | null = null;
const CACHE_TTL = 120_000;

export async function GET(request: NextRequest) {
  const startTime = Date.now();
  const log = createLogger();

  try {
    const { searchParams } = new URL(request.url);

    // ── Parse & validate params ──
    const sector = searchParams.get('sector') || undefined;
    const minConfidence = parseInt(searchParams.get('minConfidence') || '0') || undefined;
    const minPrice = parseFloat(searchParams.get('minPrice') || '0') || undefined;
    const maxPrice = parseFloat(searchParams.get('maxPrice') || '0') || undefined;
    const signal = searchParams.get('signal') || undefined;
    const sort = searchParams.get('sort') || 'confidence';
    const limit = Math.min(260, Math.max(1, parseInt(searchParams.get('limit') || '260')));
    const doBacktest = searchParams.get('backtest') === 'true';
    const backtestPeriod = (searchParams.get('backtestPeriod') as '1W' | '1M' | '3M' | '6M') || '1M';
    const format = searchParams.get('format') || 'json';
    const timeframe = (searchParams.get('timeframe') as Timeframe) || 'daily';

    // Validate timeframe
    if (!['daily', 'weekly', 'monthly'].includes(timeframe)) {
      return NextResponse.json(
        { error: 'Invalid timeframe', validOptions: ['daily', 'weekly', 'monthly'] },
        { status: 400 },
      );
    }

    // Validate sort field
    const validSorts = ['confidence', 'riskReward', 'entryPrice', 'rsi'];
    if (!validSorts.includes(sort)) {
      return NextResponse.json(
        { error: 'Invalid sort field', validOptions: validSorts },
        { status: 400 },
      );
    }

    // Build engine parameters
    const params: Partial<ScreenerParameters> = { timeframe };
    if (sector) params.sector = sector;
    if (minConfidence && minConfidence > 0) params.minConfidence = minConfidence;
    if (minPrice) params.minPrice = minPrice;
    if (maxPrice) params.maxPrice = maxPrice;

    // ── Step 1: Fetch technical indicators ──
    const allSymbols = EGX_STOCKS.map(s => s.symbol);
    log.log('info', 'API', `Fetching technical data for ${allSymbols.length} stocks (${timeframe})`);

    const techData = await fetchTechnicalIndicators(allSymbols);
    log.log('info', 'API', `Received data for ${Object.keys(techData).length}/${allSymbols.length} stocks`);

    if (Object.keys(techData).length < 10) {
      log.log('error', 'API', `Insufficient data: only ${Object.keys(techData).length} stocks returned`);
      return NextResponse.json(
        { error: 'Insufficient market data', details: `Only ${Object.keys(techData).length} stocks returned from data source` },
        { status: 503 },
      );
    }

    // ── Step 2: Fetch live quotes for volume ──
    const liveData = await fetchQuotesLive(allSymbols);
    const avgVolumes: Record<string, number> = {};
    for (const [sym, q] of Object.entries(liveData)) {
      avgVolumes[sym] = q.volume;
    }

    // ── Step 3: Run engine ──
    const stockInfo = EGX_STOCKS
      .filter(s => techData[s.symbol]?.close > 0)
      .map(s => ({ symbol: s.symbol, name: s.name, sector: s.sector }));

    const result = await runTechnicalScreener(techData, stockInfo, avgVolumes, params, log);

    // ── Step 4: Post-engine filters (signal, sort, limit) ──
    let filteredStocks = result.stocks;
    if (signal && signal !== 'All') {
      filteredStocks = filteredStocks.filter(s => s.signal === signal);
    }

    // Sort
    filteredStocks.sort((a, b) => {
      const mul = -1; // descending
      if (sort === 'confidence') return (a.confidence - b.confidence) * mul;
      if (sort === 'riskReward') return (a.riskReward - b.riskReward) * mul;
      if (sort === 'entryPrice') return (a.entryPrice - b.entryPrice) * mul;
      if (sort === 'rsi') return (a.indicators.rsi - b.indicators.rsi) * mul;
      return 0;
    });

    const limited = filteredStocks.slice(0, limit);

    // ── Step 5: Backtesting (optional) ──
    let backtest = null;
    if (doBacktest) {
      log.log('info', 'Backtest', `Running ${backtestPeriod} backtest on ${result.stocks.length} stocks`);
      const perfData = await fetchPerformance(result.stocks.map(s => s.symbol));

      // FIX: Use LIVE prices as current prices (not entry/scan prices)
      const currentPrices: Record<string, number> = {};
      for (const s of result.stocks) {
        currentPrices[s.symbol] = liveData[s.symbol]?.close || s.entryPrice;
      }

      const perfRecord: Record<string, { '1W': number; '1M': number; '3M': number; '6M': number }> = {};
      for (const [sym, p] of Object.entries(perfData)) {
        perfRecord[sym] = {
          '1W': p.returns['1W'],
          '1M': p.returns['1M'],
          '3M': p.returns['3M'],
          '6M': p.returns['6M'],
        };
      }

      backtest = backtestSignals(result.stocks, perfRecord, currentPrices, backtestPeriod);
      log.log('info', 'Backtest', `Win rate: ${backtest.winRate}%, Expectancy: ${backtest.expectancy}%, Sharpe: ${backtest.sharpeRatio}`);
    }

    // ── Step 6: Output ──
    const elapsed = Date.now() - startTime;
    log.log('info', 'API', `Completed in ${elapsed}ms — ${limited.length} stocks returned`);

    if (format === 'csv') {
      const csv = toCSV(limited);
      return new NextResponse(csv, {
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="egx_screener_${timeframe}_${new Date().toISOString().slice(0, 10)}.csv"`,
          'Cache-Control': 'public, max-age=120, stale-while-revalidate=30',
        },
      });
    }

    // JSON response
    return NextResponse.json({
      stocks: limited,
      summary: { ...result.summary, filteredTotal: limited.length },
      backtest,
      parameters: result.parameters,
      generatedAt: result.generatedAt,
      logs: log.logs,
      _meta: { elapsedMs: elapsed, dataPoints: Object.keys(techData).length },
    }, {
      headers: { 'Cache-Control': 'public, max-age=120, stale-while-revalidate=30' },
    });
  } catch (error) {
    const elapsed = Date.now() - startTime;
    log.log('error', 'API', `Failed after ${elapsed}ms: ${error instanceof Error ? error.message : String(error)}`);
    return NextResponse.json(
      {
        error: 'Technical screener failed',
        details: error instanceof Error ? error.message : String(error),
        elapsedMs: elapsed,
      },
      { status: 503 },
    );
  }
}
