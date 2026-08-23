import { NextRequest, NextResponse } from 'next/server';
import { fetchTechnicalIndicators, fetchQuotesLive, fetchPerformance } from '@/lib/market-data';
import { EGX_STOCKS } from '@/lib/egx-stocks';
import { runTechnicalScreener, backtestSignals, DEFAULT_PARAMS, type ScreenerParameters } from '@/lib/technical-screener';

/**
 * GET /api/analysis/technical-screener
 *
 * Query params:
 *   sector, minConfidence, minPrice, maxPrice, signal,
 *   sort (confidence|riskReward), limit,
 *   backtest (true|false), backtestPeriod (1W|1M|3M|6M),
 *   format (json|csv|webhook)
 *
 * Cache: 120s
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const sector = searchParams.get('sector') || undefined;
    const minConfidence = parseInt(searchParams.get('minConfidence') || '0') || undefined;
    const minPrice = parseFloat(searchParams.get('minPrice') || '0') || undefined;
    const maxPrice = parseFloat(searchParams.get('maxPrice') || '0') || undefined;
    const signal = searchParams.get('signal') || undefined;
    const sort = searchParams.get('sort') || 'confidence';
    const limit = Math.min(260, parseInt(searchParams.get('limit') || '260'));
    const doBacktest = searchParams.get('backtest') === 'true';
    const backtestPeriod = (searchParams.get('backtestPeriod') as '1W' | '1M' | '3M' | '6M') || '1M';
    const format = searchParams.get('format') || 'json';

    // Build parameters
    const params: Partial<ScreenerParameters> = {};
    if (sector) params.sector = sector;
    if (minConfidence && minConfidence > 0) params.minConfidence = minConfidence;
    if (minPrice) params.minPrice = minPrice;
    if (maxPrice) params.maxPrice = maxPrice;

    // ── Step 1: Fetch technical indicators for all stocks ──
    const allSymbols = EGX_STOCKS.map(s => s.symbol);
    console.log(`[TechScreener] Fetching technical data for ${allSymbols.length} stocks...`);
    
    const techData = await fetchTechnicalIndicators(allSymbols);
    console.log(`[TechScreener] Got data for ${Object.keys(techData).length} stocks`);

    // ── Step 2: Fetch live quotes (for current prices & avg volume proxy) ──
    const liveData = await fetchQuotesLive(allSymbols);

    // Use current volume as proxy for avg volume (no historical vol data from TV scanner)
    const avgVolumes: Record<string, number> = {};
    for (const [sym, q] of Object.entries(liveData)) {
      avgVolumes[sym] = q.volume;
    }

    // ── Step 3: Run the screener engine ──
    const stockInfo = EGX_STOCKS
      .filter(s => techData[s.symbol]?.close > 0)
      .map(s => ({ symbol: s.symbol, name: s.name, sector: s.sector }));

    const result = await runTechnicalScreener(techData, stockInfo, avgVolumes, params);

    // ── Step 4: Filter by signal type if requested ──
    let filteredStocks = result.stocks;
    if (signal && signal !== 'All') {
      filteredStocks = filteredStocks.filter(s => s.signal === signal);
    }

    // ── Step 5: Sort ──
    if (sort === 'riskReward') {
      filteredStocks.sort((a, b) => b.riskReward - a.riskReward);
    } else {
      filteredStocks.sort((a, b) => b.confidence - a.confidence);
    }

    // ── Step 6: Apply limit ──
    const limited = filteredStocks.slice(0, limit);

    // ── Step 7: Backtesting (optional) ──
    let backtest = null;
    if (doBacktest) {
      const perfData = await fetchPerformance(result.stocks.map(s => s.symbol));
      const currentPrices: Record<string, number> = {};
      for (const s of result.stocks) {
        currentPrices[s.symbol] = s.entryPrice;
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
    }

    // ── Step 8: Output format ──
    if (format === 'csv') {
      const headers = 'Symbol,Name,Sector,Signal,Confidence,Entry,StopLoss,SL%,TP1,TP2,TP3,R:R,PosSize%,Tags,RSI,MACD,StochK,ATR,RecommendAll,RiskFlags';
      const rows = limited.map(s =>
        `${s.symbol},${s.name},${s.sector},${s.signal},${s.confidence},${s.entryPrice},${s.stopLoss},${s.stopLossPct},${s.takeProfits[0]?.price || ''},${s.takeProfits[1]?.price || ''},${s.takeProfits[2]?.price || ''},${s.riskReward},${s.positionSize},"${s.tags.join('; ')}",${s.indicators.rsi},${s.indicators.macd},${s.indicators.stochK},${s.indicators.atr},${s.indicators.recommendAll},"${s.riskFlags.join('; ')}"`
      );
      const csv = [headers, ...rows].join('\n');
      return new NextResponse(csv, {
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': 'attachment; filename="egx_technical_screener.csv"',
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
    }, {
      headers: { 'Cache-Control': 'public, max-age=120, stale-while-revalidate=30' },
    });
  } catch (error) {
    console.error('[TechScreener] Error:', error);
    return NextResponse.json({ error: 'Failed to run technical screener', details: error instanceof Error ? error.message : String(error) }, { status: 503 });
  }
}
