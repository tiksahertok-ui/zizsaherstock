/**
 * AI Fair Value Batch Analysis Endpoint
 * ══════════════════════════════════════
 * Runs AI-enhanced fair value analysis on multiple stocks simultaneously.
 *
 * POST /api/analysis/ai-fair-value/batch
 * Body: { "symbols": ["COMI", "ORAS", "SWDY"] }
 *
 * Features:
 *   - Parallel fundamental data fetching
 *   - V3 sector-specific valuation for each stock
 *   - AI analysis for up to 5 stocks (most impactful)
 *   - Mathematical-only for the rest (AI is expensive)
 *   - Results ranked by composite upside/downside
 *   - 10-minute cache
 */

import { NextRequest, NextResponse } from 'next/server';
import { fetchFundamentals, type FundamentalData } from '@/lib/fundamentals';
import { calculateFairValue, type FairValueResult } from '@/lib/fair-value-engine';
import { calculateFairValueV2, type FairValueResultV2 } from '@/lib/fair-value-engine-v2';
import { calculateFairValueV3, type FairValueResultV3 } from '@/lib/fair-value-engine-v3';
import { computeSectorAverages, getSectorBenchmark } from '@/lib/egx-sectors';
import { EGX_STOCKS } from '@/lib/egx-stocks';

// ── Types ──────────────────────────────────────────────────────────

interface BatchStockResult {
  symbol: string;
  stockName: string;
  sector: string;
  currentPrice: number;
  compositeFairValue: number;
  compositeUpside: number;
  recommendation: 'Buy' | 'Hold' | 'Sell';
  v3FairValue: number;
  v3Upside: number;
  v2FairValue: number;
  v1FairValue: number;
  activeModels: string[];
  dataQualityScore: number;
  aiAnalysis: {
    fairValue: number;
    confidence: string;
    confidenceScore: number;
    justification: string;
    keyFactors: string[];
    riskFactors: string[];
    catalysts: string[];
    comparisonWithModels: string;
  } | null;
  aiSource: 'ai' | 'mathematical_only';
}

// ── Cache ──────────────────────────────────────────────────────────

const batchCache = new Map<string, { data: BatchStockResult[]; ts: number }>();
const BATCH_CACHE_TTL = 10 * 60 * 1000; // 10 minutes
const MAX_AI_ANALYSIS = 5; // Only run AI on top N stocks to save costs

// ── AI System Prompt (simplified for batch) ───────────────────────

const BATCH_AI_SYSTEM_PROMPT = `You are a senior equity analyst specializing in EGX-listed Egyptian equities. Provide a concise fair value assessment.

You MUST respond with valid JSON only (no markdown, no code fences):

{
  "fairValue": <number in EGP>,
  "confidence": "<High | Moderate | Low>",
  "confidenceScore": <number 0-100>,
  "justification": "<2-3 sentence professional justification>",
  "keyFactors": ["<factor1>", "<factor2>", "<factor3>"],
  "riskFactors": ["<risk1>", "<risk2>"],
  "catalysts": ["<catalyst1>"],
  "comparisonWithModels": "<1-2 sentence comparison with mathematical models>"
}

Guidelines:
- All values in EGP
- Consider Egyptian macro: high rates (~27%), inflation (~23%), frontier market risk
- Be within ±20% of model outputs unless strong conviction
- High confidence only if data quality is good (score > 70)`;

// ── Helper: Build Batch AI Prompt ──────────────────────────────

function buildBatchAIPrompt(
  f: FundamentalData,
  v1: FairValueResult,
  v2: FairValueResultV2,
  v3: FairValueResultV3,
  stockName: string,
  sector: string,
): string {
  const fmt = (n: number, d = 2) => (n > 0 ? n.toFixed(d) : 'N/A');
  const fmtBig = (n: number) => {
    const abs = Math.abs(n);
    if (abs >= 1e9) return `${(n / 1e9).toFixed(1)}B EGP`;
    if (abs >= 1e6) return `${(n / 1e6).toFixed(0)}M EGP`;
    return `${n.toFixed(0)} EGP`;
  };

  const v3Models = v3.sectorSpecificModels || [];

  return [
    `Analyze this EGX stock: ${stockName} (${f.symbol}) — Sector: ${sector}`,
    ``,
    `Price: ${fmt(f.price)} EGP | MCap: ${fmtBig(f.marketCap)} | P/E: ${fmt(f.pe)} | P/B: ${fmt(f.pb)}`,
    `ROE: ${f.roe.toFixed(1)}% | Margin: ${f.netMargin.toFixed(1)}% | D/E: ${f.debtEquity.toFixed(2)}`,
    `Revenue: ${fmtBig(f.revenue)} | Net Income: ${fmtBig(f.netIncome)} | FCF: ${fmtBig(f.freeCashFlow)}`,
    `Revenue Growth: ${f.revenueGrowth.toFixed(1)}% | Earnings Growth: ${f.earningsGrowth.toFixed(1)}%`,
    `Dividend Yield: ${f.dividendYield.toFixed(1)}% | Beta: ${f.beta.toFixed(2)}`,
    ``,
    `V1 Weighted FV: ${fmt(v1.weightedFairValue)} EGP (${v1.status})`,
    `V2 Weighted FV: ${fmt(v2.weightedFairValue)} EGP (Risk: ${v2.riskScore}/100)`,
    `V3 Weighted FV: ${fmt(v3.v3FairValue)} EGP (${v3.v3Status})`,
    `V3 Confidence: ${v3.valuationConfidence.level} (${v3.valuationConfidence.score}/100)`,
    `Data Quality: ${v3.v3DataQuality.overall}/100 (${v3.v3DataQuality.grade})`,
    ``,
    `Active V3 Models (${v3.modelSelection.selectedModels.length}):`,
    ...v3Models.map(m => `  - ${m.modelName}: ${fmt(m.fairValue)} EGP (w: ${(m.weight * 100).toFixed(0)}%)`),
    ``,
    `Provide your fair value assessment in JSON format.`,
  ].join('\n');
}

// ── Helper: Parse AI Response ─────────────────────────────────────

function parseAIResponse(text: string) {
  try {
    const parsed = JSON.parse(text.trim());
    if (parsed.fairValue && parsed.justification) {
      return {
        fairValue: typeof parsed.fairValue === 'number' ? parsed.fairValue : 0,
        confidence: ['High', 'Moderate', 'Low'].includes(parsed.confidence) ? parsed.confidence : 'Moderate',
        confidenceScore: typeof parsed.confidenceScore === 'number' ? Math.min(100, Math.max(0, parsed.confidenceScore)) : 60,
        justification: String(parsed.justification),
        keyFactors: Array.isArray(parsed.keyFactors) ? parsed.keyFactors.map(String).slice(0, 5) : [],
        riskFactors: Array.isArray(parsed.riskFactors) ? parsed.riskFactors.map(String).slice(0, 4) : [],
        catalysts: Array.isArray(parsed.catalysts) ? parsed.catalysts.map(String).slice(0, 3) : [],
        comparisonWithModels: String(parsed.comparisonWithModels || ''),
      };
    }
  } catch {
    const jsonMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
    if (jsonMatch) {
      return parseAIResponse(jsonMatch[1]);
    }
  }
  return null;
}

// ── Helper: Compute recommendation ─────────────────────────────────

function getRecommendation(upside: number, confidence: number): 'Buy' | 'Hold' | 'Sell' {
  if (upside > 15 && confidence > 50) return 'Buy';
  if (upside < -15 && confidence > 50) return 'Sell';
  if (upside > 10) return 'Buy';
  if (upside < -10) return 'Sell';
  return 'Hold';
}

// ── POST Handler ────────────────────────────────────────────────────

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body = await request.json() as { symbols?: string[] };
    const symbols = (body.symbols || [])
      .map((s: string) => s.toUpperCase().trim())
      .filter(Boolean);

    if (symbols.length === 0) {
      return NextResponse.json({ error: 'symbols array required in body' }, { status: 400 });
    }

    if (symbols.length > 20) {
      return NextResponse.json({ error: 'Maximum 20 symbols per batch request' }, { status: 400 });
    }

    // Validate symbols
    const validSymbols: string[] = [];
    for (const sym of symbols) {
      if (EGX_STOCKS.find(s => s.symbol === sym)) {
        validSymbols.push(sym);
      }
    }

    if (validSymbols.length === 0) {
      return NextResponse.json({ error: 'No valid EGX symbols provided' }, { status: 400 });
    }

    // ── Check cache ──
    const cacheKey = validSymbols.sort().join(',');
    const cached = batchCache.get(cacheKey);
    if (cached && Date.now() - cached.ts < BATCH_CACHE_TTL) {
      return NextResponse.json({ results: cached.data });
    }

    // ── Fetch fundamentals for all symbols ──
    const fundData = await fetchFundamentals(validSymbols);

    // ── Compute sector benchmarks ──
    const sectorBenchmarks = computeSectorAverages(
      Object.fromEntries(
        Object.entries(fundData).map(([sym, fd]) => {
          const sec = EGX_STOCKS.find(s => s.symbol === sym)?.sector || 'Other';
          return [sym, { ...fd, sector: sec }];
        })
      )
    );

    // ── Process each stock ──
    const results: BatchStockResult[] = [];

    for (const symbol of validSymbols) {
      const stockInfo = EGX_STOCKS.find(s => s.symbol === symbol);
      const f = fundData[symbol];

      if (!f || !f.hasData) continue;

      const sector = stockInfo?.sector || 'Other';
      const stockName = stockInfo?.name || symbol;
      const bench = getSectorBenchmark(sector, sectorBenchmarks);

      // Run valuation engines
      let v1: FairValueResult, v2: FairValueResultV2, v3: FairValueResultV3;
      try {
        v1 = calculateFairValue(f, sector, sectorBenchmarks);
        v2 = calculateFairValueV2(f, sector, sectorBenchmarks);
        v3 = calculateFairValueV3(f, sector, sectorBenchmarks);
      } catch {
        // Skip this stock if valuation fails
        continue;
      }

      const activeModels = v3.modelSelection?.selectedModels || [];
      const v3FV = v3.v3FairValue;
      const v3Upside = v3.v3Upside;
      const v2FV = v2.weightedFairValue;
      const v1FV = v1.weightedFairValue;

      // Determine composite fair value
      let compositeFV: number;
      const v3Val = v3FV > 0 ? v3FV : v2FV;
      const v2Val = v2FV > 0 ? v2FV : v1FV;
      compositeFV = v3Val * 0.6 + v2Val * 0.4;

      const compositeUpside = f.price > 0 ? ((compositeFV - f.price) / f.price) * 100 : 0;

      results.push({
        symbol,
        stockName,
        sector,
        currentPrice: f.price,
        compositeFairValue: compositeFV,
        compositeUpside,
        recommendation: getRecommendation(compositeUpside, v3.valuationConfidence.score),
        v3FairValue: v3FV,
        v3Upside,
        v2FairValue: v2FV,
        v1FairValue: v1FV,
        activeModels,
        dataQualityScore: v3.v3DataQuality.overall || f.dataQualityScore,
        aiAnalysis: null,
        aiSource: 'mathematical_only',
      });
    }

    // ── Sort by composite upside (highest first) ──
    results.sort((a, b) => b.compositeUpside - a.compositeUpside);

    // ── Run AI analysis on top N stocks ──
    const aiEligible = results
      .filter(r => r.dataQualityScore >= 40 && r.activeModels.length >= 2)
      .slice(0, MAX_AI_ANALYSIS);

    if (aiEligible.length > 0) {
      try {
        const ZAI = await import('z-ai-web-dev-sdk') as any;
        const zai = await (ZAI.default || ZAI).create();

        // Run AI calls in parallel
        const aiPromises = aiEligible.map(async (result) => {
          const f = fundData[result.symbol];
          const stockInfo = EGX_STOCKS.find(s => s.symbol === result.symbol);
          const sector = stockInfo?.sector || 'Other';
          const bench = getSectorBenchmark(sector, sectorBenchmarks);

          if (!f || !f.hasData) return null;

          let v1: FairValueResult, v2: FairValueResultV2, v3: FairValueResultV3;
          try {
            v1 = calculateFairValue(f, sector, sectorBenchmarks);
            v2 = calculateFairValueV2(f, sector, sectorBenchmarks);
            v3 = calculateFairValueV3(f, sector, sectorBenchmarks);
          } catch {
            return null;
          }

          const prompt = buildBatchAIPrompt(f, v1, v2, v3, result.stockName, sector);

          try {
            const completion = await zai.chat.completions.create({
              messages: [
                { role: 'system', content: BATCH_AI_SYSTEM_PROMPT },
                { role: 'user', content: prompt },
              ],
              max_tokens: 800,
              temperature: 0.2,
            });

            const aiText = completion.choices?.[0]?.message?.content?.trim();
            if (aiText) {
              const parsed = parseAIResponse(aiText);
              if (parsed && parsed.fairValue > 0) {
                return { result, ai: parsed };
              }
            }
          } catch {
            return null;
          }

          return null;
        });

        const aiResults = await Promise.allSettled(aiPromises);

        // Merge AI results into batch results
        for (const res of aiResults) {
          if (res.status === 'fulfilled' && res.value) {
            const { result, ai } = res.value;

            // Recalculate composite with AI
            const v3Val = result.v3FairValue > 0 ? result.v3FairValue : result.v2FairValue;
            const v2Val = result.v2FairValue > 0 ? result.v2FairValue : result.v1FairValue;
            const v1Val = result.v1FairValue > 0 ? result.v1FairValue : v2Val;
            const aiVal = ai.fairValue;

            const newComposite = (v3Val * 0.40 + v2Val * 0.30 + v1Val * 0.15 + aiVal * 0.15);
            const newUpside = result.currentPrice > 0 ? ((newComposite - result.currentPrice) / result.currentPrice) * 100 : 0;

            result.compositeFairValue = newComposite;
            result.compositeUpside = newUpside;
            result.aiAnalysis = ai;
            result.aiSource = 'ai';
            result.recommendation = getRecommendation(newUpside, ai.confidenceScore);
          }
        }

        // Re-sort after AI analysis
        results.sort((a, b) => b.compositeUpside - a.compositeUpside);
      } catch (aiErr) {
        console.error('[Batch AI Fair Value] AI batch analysis failed:', aiErr);
      }
    }

    // ── Cache ──
    batchCache.set(cacheKey, { data: results, ts: Date.now() });

    return NextResponse.json({ results }, {
      headers: { 'Cache-Control': 'public, max-age=300, stale-while-revalidate=60' },
    });
  } catch (error) {
    console.error('[Batch AI Fair Value] Endpoint error:', error);
    return NextResponse.json({ error: 'Failed to run batch AI fair value analysis' }, { status: 503 });
  }
}
