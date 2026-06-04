/**
 * AI-Powered Fair Value Analysis Endpoint
 * ══════════════════════════════════════
 * Combines mathematical valuation models (V1, V2, V3) with AI analysis
 * to produce a comprehensive fair value assessment for EGX stocks.
 *
 * GET /api/analysis/ai-fair-value?symbol=COMI
 *
 * Features:
 *   - V1: DCF, Relative, DDM, Asset-Based (4 models)
 *   - V2: Multi-Stage DCF, Monte Carlo, Multi-Stage DDM, Liquidation, Scenario
 *   - V3: Sector-specific models (ROE-Based, EVA, NAV, Adjusted NAV, SOTP, etc.)
 *   - AI: Senior equity analyst assessment with justification
 *   - 10-minute cache for AI results
 *   - Graceful fallback to mathematical-only if AI fails
 */

import { NextRequest, NextResponse } from 'next/server';
import { fetchFundamentals, type FundamentalData } from '@/lib/fundamentals';
import { calculateFairValue, type FairValueResult } from '@/lib/fair-value-engine';
import { calculateFairValueV2, type FairValueResultV2 } from '@/lib/fair-value-engine-v2';
import { calculateFairValueV3, type FairValueResultV3 } from '@/lib/fair-value-engine-v3';
import { computeSectorAverages, getSectorBenchmark, getSectorValuationProfile } from '@/lib/egx-sectors';
import { EGX_STOCKS } from '@/lib/egx-stocks';

// ── Types ──────────────────────────────────────────────────────────

interface AIAnalysisResult {
  fairValue: number;
  confidence: 'High' | 'Moderate' | 'Low';
  confidenceScore: number;
  justification: string;
  keyFactors: string[];
  riskFactors: string[];
  catalysts: string[];
  comparisonWithModels: string;
}

interface MathematicalFairValue {
  v1Weighted: number;
  v2Weighted: number;
  v3Weighted: number;
  bestModel: string;
  activeModels: string[];
  modelBreakdown: Record<string, { value: number; weight: number }>;
}

interface DataQualityInfo {
  score: number;
  grade: string;
  missingFields: string[];
  warnings: string[];
}

interface AIFairValueResponse {
  symbol: string;
  stockName: string;
  sector: string;
  currentPrice: number;
  mathematicalFairValue: MathematicalFairValue;
  aiAnalysis: AIAnalysisResult | null;
  compositeFairValue: number;
  compositeUpside: number;
  recommendation: 'Buy' | 'Hold' | 'Sell';
  dataQuality: DataQualityInfo;
  generatedAt: string;
  aiSource: 'ai' | 'mathematical_only';
}

// ── In-memory Cache (10-minute TTL) ───────────────────────────────

const aiCache = new Map<string, { data: AIFairValueResponse; ts: number }>();
const AI_CACHE_TTL = 10 * 60 * 1000; // 10 minutes

// ── System Prompt for AI ─────────────────────────────────────────

const AI_SYSTEM_PROMPT = `You are a senior equity research analyst at a top-tier investment bank (EFG Hermes / Goldman Sachs / Morgan Stanley quality) specializing in Egyptian equities listed on the Egyptian Exchange (EGX).

Your task is to analyze a stock's fundamental data and mathematical valuation model outputs, then provide your professional fair value assessment.

You MUST respond with valid JSON matching this exact schema (no markdown, no code fences, only raw JSON):

{
  "fairValue": <number - your assessed fair value per share in EGP>,
  "confidence": "<High | Moderate | Low>",
  "confidenceScore": <number 0-100>,
  "justification": "<string - 2-3 sentence professional justification for your fair value>",
  "keyFactors": ["<string - positive factor 1>", "<string - positive factor 2>", "<string - positive factor 3>", "<string - positive factor 4>"],
  "riskFactors": ["<string - risk factor 1>", "<string - risk factor 2>", "<string - risk factor 3>"],
  "catalysts": ["<string - potential catalyst 1>", "<string - potential catalyst 2>"],
  "comparisonWithModels": "<string - 2-3 sentence comparison of your assessment vs the mathematical models>"
}

Guidelines:
- Your fair value should be in EGP (Egyptian Pounds) only
- Consider the Egyptian macro environment: high interest rates (~27%), inflation (~23%), FX volatility
- Sector-specific factors matter enormously on EGX (banks vs real estate vs industrials)
- If data quality is low, set confidence to "Low" and confidenceScore below 50
- Be balanced — acknowledge both upside and downside risks
- Your assessment should generally be within ±20% of the mathematical models unless you have strong conviction otherwise
- Higher weight should be given to sector-specific models (e.g., ROE-based for banks, NAV for real estate)
- Consider the CBE (Central Bank of Egypt) policy trajectory and its impact on financials
- Factor in Egypt's sovereign risk (B-/B rating) and frontier market discount`;

// ── Helper: Build AI User Prompt ─────────────────────────────────

function buildAIPrompt(
  f: FundamentalData,
  v1: FairValueResult,
  v2: FairValueResultV2,
  v3: FairValueResultV3,
  stockName: string,
  sector: string,
  bench: ReturnType<typeof getSectorBenchmark>,
): string {
  const fmt = (n: number, d = 2) => (n > 0 ? n.toFixed(d) : 'N/A');
  const fmtBig = (n: number) => {
    const abs = Math.abs(n);
    if (abs >= 1e9) return `${(n / 1e9).toFixed(1)}B EGP`;
    if (abs >= 1e6) return `${(n / 1e6).toFixed(0)}M EGP`;
    if (abs >= 1e3) return `${(n / 1e3).toFixed(0)}K EGP`;
    return `${n.toFixed(0)} EGP`;
  };

  // V3 sector-specific model breakdown
  const v3Models = v3.sectorSpecificModels || [];
  const v3ModelBreakdown = v3Models
    .map(m => `  - ${m.modelName}: ${fmt(m.fairValue)} EGP (weight: ${(m.weight * 100).toFixed(0)}%, confidence: ${(m.confidence * 100).toFixed(0)}%) - ${m.description}`)
    .join('\n');

  // V2 advanced models
  const v2Breakdown: string[] = [];
  if (v2.multiStageDCF) v2Breakdown.push(`  - Multi-Stage DCF: ${fmt(v2.multiStageDCF.intrinsicValuePerShare)} EGP (WACC: ${(v2.multiStageDCF.wacc * 100).toFixed(1)}%)`);
  if (v2.monteCarlo) v2Breakdown.push(`  - Monte Carlo Mean: ${fmt(v2.monteCarlo.mean)} EGP (P5: ${fmt(v2.monteCarlo.percentiles.p5)}, P95: ${fmt(v2.monteCarlo.percentiles.p95)})`);
  if (v2.multiStageDDM) v2Breakdown.push(`  - Multi-Stage DDM: ${fmt(v2.multiStageDDM.intrinsicValuePerShare)} EGP`);
  if (v2.liquidation) v2Breakdown.push(`  - Liquidation Value: ${fmt(v2.liquidation.perShareValue)} EGP`);
  if (v2.scenarioAnalysis) {
    v2Breakdown.push(
      `  - Scenario Analysis:`,
      `    Bull: ${fmt(v2.scenarioAnalysis.bull.fairValue)} EGP (${v2.scenarioAnalysis.bull.fairValue > 0 && f.price > 0 ? '+' : ''}${((v2.scenarioAnalysis.bull.fairValue - f.price) / f.price * 100).toFixed(1)}%)`,
      `    Base: ${fmt(v2.scenarioAnalysis.base.fairValue)} EGP`,
      `    Bear: ${fmt(v2.scenarioAnalysis.bear.fairValue)} EGP (${v2.scenarioAnalysis.bear.fairValue > 0 && f.price > 0 ? '+' : ''}${((v2.scenarioAnalysis.bear.fairValue - f.price) / f.price * 100).toFixed(1)}%)`
    );
  }
  if (v2.riskScore !== undefined) v2Breakdown.push(`  - Composite Risk Score: ${v2.riskScore}/100`);

  // V1 model breakdown
  const v1Breakdown: string[] = [];
  if (v1.dcf) v1Breakdown.push(`  - DCF: ${fmt(v1.dcf.intrinsicValue)} EGP (WACC: ${(v1.dcf.wacc * 100).toFixed(1)}%, growth: ${(v1.dcf.growthRate * 100).toFixed(1)}%)`);
  if (v1.relative) v1Breakdown.push(`  - Relative: ${fmt(v1.relative.weightedValue)} EGP (P/E: ${fmt(v1.relative.peFairValue)}, P/B: ${fmt(v1.relative.pbFairValue)}, EV/EBITDA: ${fmt(v1.relative.evEbitdaFairValue)})`);
  if (v1.ddm) v1Breakdown.push(`  - DDM: ${fmt(v1.ddm.intrinsicValue)} EGP (growth: ${v1.ddm.dividendGrowthRate.toFixed(1)}%, required return: ${(v1.ddm.requiredReturn * 100).toFixed(1)}%)`);
  if (v1.asset) v1Breakdown.push(`  - Asset-Based: ${fmt(v1.asset.intrinsicValue)} EGP (BVPS: ${fmt(v1.asset.bookValuePerShare)}, ROE premium: ${v1.asset.premium.toFixed(0)}%)`);

  const prompt = [
    `Provide your AI fair value assessment for this EGX stock:`,
    ``,
    `═══════════════════════════════════════════════════════════`,
    `  ${stockName} (${f.symbol})`,
    `  Sector: ${sector} | Egyptian Exchange (EGX)`,
    `═══════════════════════════════════════════════════════════`,
    ``,
    `─── FUNDAMENTAL DATA ───`,
    `Current Price: ${fmt(f.price)} EGP`,
    `Market Cap: ${fmtBig(f.marketCap)}`,
    `Shares Outstanding: ${fmtBig(f.sharesOutstanding)}`,
    ``,
    `Valuation Ratios:`,
    `  P/E: ${fmt(f.pe)} (Sector Avg: ${fmt(bench.avgPE)})`,
    `  P/B: ${fmt(f.pb)} (Sector Avg: ${fmt(bench.avgPB)})`,
    `  EV/EBITDA: ${fmt(f.evEbitda)} (Sector Avg: ${fmt(bench.avgEV_EBITDA)})`,
    `  P/S: ${fmt(f.ps)} (Sector Avg: ${fmt(bench.avgPS)})`,
    `  PEG: ${fmt(f.peg)}`,
    `  Beta: ${fmt(f.beta)}`,
    ``,
    `Profitability:`,
    `  Revenue: ${fmtBig(f.revenue)}`,
    `  Net Income: ${fmtBig(f.netIncome)}`,
    `  Operating Income: ${fmtBig(f.operatingIncome)}`,
    `  Gross Margin: ${f.grossMargin.toFixed(1)}%`,
    `  Operating Margin: ${f.operatingMargin.toFixed(1)}%`,
    `  Net Margin: ${f.netMargin.toFixed(1)}%`,
    `  ROE: ${f.roe.toFixed(1)}% (Sector Avg: ${bench.avgROE.toFixed(1)}%)`,
    `  ROA: ${f.roa.toFixed(1)}%`,
    `  EPS: ${fmt(f.eps)} EGP`,
    ``,
    `Growth:`,
    `  Revenue Growth (YoY): ${f.revenueGrowth.toFixed(1)}% (Sector Avg: ${bench.avgRevenueGrowth.toFixed(1)}%)`,
    `  Earnings Growth (YoY): ${f.earningsGrowth.toFixed(1)}%`,
    ``,
    `Balance Sheet:`,
    `  Total Debt: ${fmtBig(f.totalDebt)}`,
    `  Debt/Equity: ${f.debtEquity.toFixed(2)} (Sector Avg: ${bench.avgDebtEquity.toFixed(2)})`,
    `  Cash: ${fmtBig(f.cash)}`,
    `  Total Assets: ${fmtBig(f.totalAssets)}`,
    `  Total Liabilities: ${fmtBig(f.totalLiabilities)}`,
    `  Stockholders' Equity: ${fmtBig(f.stockholdersEquity)}`,
    `  BVPS: ${fmt(f.bvps)} EGP`,
    ``,
    `Cash Flow:`,
    `  Operating Cash Flow: ${fmtBig(f.operatingCashFlow)}`,
    `  Free Cash Flow: ${fmtBig(f.freeCashFlow)}`,
    `  CapEx: ${fmtBig(Math.abs(f.capex))}`,
    ``,
    `Dividends:`,
    `  Dividend Yield: ${f.dividendYield.toFixed(1)}% (Sector Avg: ${bench.avgDividendYield.toFixed(1)}%)`,
    `  Payout Ratio: ${f.payoutRatio.toFixed(1)}%`,
    `  DPS: ${fmt(f.dps)} EGP`,
    ``,
    `─── V1 MATHEMATICAL MODELS (4 models) ───`,
    `V1 Weighted Fair Value: ${fmt(v1.weightedFairValue)} EGP (${v1.weightedUpside >= 0 ? '+' : ''}${v1.weightedUpside.toFixed(1)}% upside)`,
    `Status: ${v1.status} | Confidence: ${v1.confidence} (${v1.activeModels}/${v1.totalModels} models active)`,
    `Model Breakdown:`,
    ...v1Breakdown,
    ``,
    `─── V2 ADVANCED MODELS ───`,
    `V2 Weighted Fair Value: ${fmt(v2.weightedFairValue)} EGP`,
    `Risk Score: ${v2.riskScore}/100 | Margin of Safety: ${v2.marginOfSafety.toFixed(1)}%`,
    `Advanced Model Breakdown:`,
    ...v2Breakdown,
    ``,
    `─── V3 SECTOR-SPECIFIC MODELS ───`,
    `V3 Weighted Fair Value: ${fmt(v3.v3FairValue)} EGP (${v3.v3Upside >= 0 ? '+' : ''}${v3.v3Upside.toFixed(1)}% upside)`,
    `V3 Status: ${v3.v3Status}`,
    `Valuation Confidence: ${v3.valuationConfidence.level} (${v3.valuationConfidence.score}/100)`,
    `Data Quality: ${v3.v3DataQuality.overall}/100 (Grade: ${v3.v3DataQuality.grade})`,
    ``,
    `Auto-Selected Models (${v3.modelSelection.selectedModels.length}):`,
    v3ModelBreakdown,
    ``,
    `─── WACC DETAILS ───`,
    `Cost of Equity: ${(v3.waccDetails.costOfEquity * 100).toFixed(2)}%`,
    `Cost of Debt (after-tax): ${(v3.waccDetails.costOfDebt * 100).toFixed(2)}%`,
    `WACC: ${(v3.waccDetails.wacc * 100).toFixed(2)}%`,
    `Risk-Free Rate: ${(v3.waccDetails.riskFreeRate * 100).toFixed(2)}%`,
    `Beta: ${v3.waccDetails.beta}`,
    `Country Risk Premium: ${(v3.waccDetails.countryRiskPremium * 100).toFixed(2)}%`,
    `Debt Ratio: ${(v3.waccDetails.debtRatio * 100).toFixed(1)}% | Equity Ratio: ${(v3.waccDetails.equityRatio * 100).toFixed(1)}%`,
    ``,
    `Based on all the above data, provide your professional fair value assessment in JSON format as specified.`,
  ].join('\n');

  return prompt;
}

// ── Helper: Parse AI Response ─────────────────────────────────────

function parseAIResponse(text: string): AIAnalysisResult | null {
  try {
    // Try direct JSON parse first
    const parsed = JSON.parse(text.trim());
    if (parsed.fairValue && parsed.justification) {
      return {
        fairValue: typeof parsed.fairValue === 'number' ? parsed.fairValue : 0,
        confidence: ['High', 'Moderate', 'Low'].includes(parsed.confidence) ? parsed.confidence : 'Moderate',
        confidenceScore: typeof parsed.confidenceScore === 'number' ? Math.min(100, Math.max(0, parsed.confidenceScore)) : 60,
        justification: String(parsed.justification),
        keyFactors: Array.isArray(parsed.keyFactors) ? parsed.keyFactors.map(String).slice(0, 6) : [],
        riskFactors: Array.isArray(parsed.riskFactors) ? parsed.riskFactors.map(String).slice(0, 5) : [],
        catalysts: Array.isArray(parsed.catalysts) ? parsed.catalysts.map(String).slice(0, 4) : [],
        comparisonWithModels: String(parsed.comparisonWithModels || ''),
      };
    }
  } catch {
    // Try extracting JSON from markdown code fences
    const jsonMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
    if (jsonMatch) {
      return parseAIResponse(jsonMatch[1]);
    }
  }
  return null;
}

// ── Helper: Compute Data Quality ─────────────────────────────────

function computeDataQuality(f: FundamentalData, v3DataQuality: { overall: number; grade: string }): DataQualityInfo {
  const warnings: string[] = [];
  if (!f.isEGP) warnings.push('Currency is not EGP — valuation models assume EGP inputs');
  if (f.dataQualityScore < 40) warnings.push(`Low data quality score (${f.dataQualityScore}/100)`);
  if (f.pe <= 0) warnings.push('Missing P/E ratio');
  if (f.roe <= 0) warnings.push('Missing ROE');
  if (f.revenue <= 0) warnings.push('Missing revenue');
  if (f.operatingIncome <= 0) warnings.push('Missing operating income');

  return {
    score: v3DataQuality.overall || f.dataQualityScore,
    grade: v3DataQuality.grade || 'C',
    missingFields: f.missingFields || [],
    warnings,
  };
}

// ── Helper: Compute Mathematical Fair Value Breakdown ─────────────

function computeMathematicalBreakdown(
  v1: FairValueResult,
  v2: FairValueResultV2,
  v3: FairValueResultV3,
): MathematicalFairValue {
  const modelBreakdown: Record<string, { value: number; weight: number }> = {};

  // V1 models
  if (v1.dcf && v1.dcf.intrinsicValue > 0) modelBreakdown['dcf'] = { value: v1.dcf.intrinsicValue, weight: v1.modelWeights.dcf };
  if (v1.relative && v1.relative.weightedValue > 0) modelBreakdown['relative'] = { value: v1.relative.weightedValue, weight: v1.modelWeights.relative };
  if (v1.ddm && v1.ddm.intrinsicValue > 0) modelBreakdown['ddm'] = { value: v1.ddm.intrinsicValue, weight: v1.modelWeights.ddm };
  if (v1.asset && v1.asset.intrinsicValue > 0) modelBreakdown['asset'] = { value: v1.asset.intrinsicValue, weight: v1.modelWeights.asset };

  // V2 models
  if (v2.multiStageDCF && v2.multiStageDCF.intrinsicValuePerShare > 0) {
    modelBreakdown['multi_stage_dcf'] = { value: v2.multiStageDCF.intrinsicValuePerShare, weight: 0.15 };
  }
  if (v2.monteCarlo && v2.monteCarlo.median > 0) {
    modelBreakdown['monte_carlo'] = { value: v2.monteCarlo.median, weight: 0.10 };
  }

  // V3 sector-specific models
  for (const model of v3.sectorSpecificModels || []) {
    if (model.fairValue > 0) {
      modelBreakdown[model.modelName] = { value: model.fairValue, weight: model.weight };
    }
  }

  // Find the best (highest confidence × weight) model
  let bestModel = 'composite';
  let bestScore = 0;
  for (const [name, data] of Object.entries(modelBreakdown)) {
    const score = data.weight * (data.value > 0 ? 1 : 0);
    if (score > bestScore) {
      bestScore = score;
      bestModel = name;
    }
  }

  return {
    v1Weighted: v1.weightedFairValue,
    v2Weighted: v2.weightedFairValue,
    v3Weighted: v3.v3FairValue,
    bestModel,
    activeModels: Object.keys(modelBreakdown),
    modelBreakdown,
  };
}

// ── Helper: Compute Recommendation ─────────────────────────────────

function computeRecommendation(
  compositeUpside: number,
  confidenceScore: number,
): 'Buy' | 'Hold' | 'Sell' {
  if (compositeUpside > 15 && confidenceScore > 50) return 'Buy';
  if (compositeUpside < -15 && confidenceScore > 50) return 'Sell';
  if (compositeUpside > 10) return 'Buy';
  if (compositeUpside < -10) return 'Sell';
  return 'Hold';
}

// ── GET Handler ─────────────────────────────────────────────────────

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const { searchParams } = new URL(request.url);
    const symbol = searchParams.get('symbol')?.toUpperCase().trim();

    if (!symbol) {
      return NextResponse.json({ error: 'symbol parameter required (e.g., ?symbol=COMI)' }, { status: 400 });
    }

    // ── Check cache ──
    const cached = aiCache.get(symbol);
    if (cached && Date.now() - cached.ts < AI_CACHE_TTL) {
      return NextResponse.json(cached.data, {
        headers: { 'Cache-Control': 'public, max-age=300, stale-while-revalidate=60' },
      });
    }

    // ── Look up stock info ──
    const stockEntry = EGX_STOCKS.find(s => s.symbol === symbol);
    if (!stockEntry) {
      return NextResponse.json({ error: `Unknown symbol: ${symbol}` }, { status: 404 });
    }

    const sector = stockEntry.sector || 'Other';
    const stockName = stockEntry.name || symbol;

    // ── Fetch fundamentals ──
    const sectorPeers = EGX_STOCKS
      .filter(s => s.sector === sector && s.symbol !== symbol)
      .slice(0, 10)
      .map(s => s.symbol);
    const allSymbols = [symbol, ...sectorPeers];

    const fundData = await fetchFundamentals(allSymbols);
    const f = fundData[symbol];
    if (!f || !f.hasData) {
      return NextResponse.json({ error: `No fundamental data for ${symbol}` }, { status: 404 });
    }

    // ── Compute sector benchmarks ──
    const peerFundamentals: Record<string, {
      sector?: string;
      pe: number; pb: number; evEbitda: number; ps: number;
      roe: number; debtEquity: number; grossMargin: number; netMargin: number;
      dividendYield: number; revenueGrowth: number;
    }> = {};

    for (const [sym, fd] of Object.entries(fundData)) {
      if (!fd.hasData) continue;
      const peerSector = EGX_STOCKS.find(s => s.symbol === sym)?.sector || 'Other';
      peerFundamentals[sym] = {
        sector: peerSector,
        pe: fd.pe, pb: fd.pb, evEbitda: fd.evEbitda, ps: fd.ps,
        roe: fd.roe, debtEquity: fd.debtEquity, grossMargin: fd.grossMargin,
        netMargin: fd.netMargin, dividendYield: fd.dividendYield, revenueGrowth: fd.revenueGrowth,
      };
    }
    const sectorBenchmarks = computeSectorAverages(peerFundamentals);
    const bench = getSectorBenchmark(sector, sectorBenchmarks);

    // ── Run all valuation engines ──
    const v1 = calculateFairValue(f, sector, sectorBenchmarks);
    const v2 = calculateFairValueV2(f, sector, sectorBenchmarks);
    const v3 = calculateFairValueV3(f, sector, sectorBenchmarks);

    // ── Mathematical breakdown ──
    const mathematicalFairValue = computeMathematicalBreakdown(v1, v2, v3);
    const dataQuality = computeDataQuality(f, v3.v3DataQuality);

    // ── AI Analysis ──
    let aiAnalysis: AIAnalysisResult | null = null;
    let aiSource: 'ai' | 'mathematical_only' = 'mathematical_only';

    try {
      const ZAI = await import('z-ai-web-dev-sdk') as any;
      const zai = await (ZAI.default || ZAI).create();

      const userPrompt = buildAIPrompt(f, v1, v2, v3, stockName, sector, bench);

      const completion = await zai.chat.completions.create({
        messages: [
          { role: 'system', content: AI_SYSTEM_PROMPT },
          { role: 'user', content: userPrompt },
        ],
        max_tokens: 1500,
        temperature: 0.2, // Low temperature for more consistent analytical output
      });

      const aiText = completion.choices?.[0]?.message?.content?.trim();
      if (aiText) {
        const parsed = parseAIResponse(aiText);
        if (parsed && parsed.fairValue > 0) {
          aiAnalysis = parsed;
          aiSource = 'ai';
        }
      }
    } catch (aiErr) {
      console.error('[AI Fair Value] AI analysis failed, using mathematical fallback:', aiErr);
    }

    // ── Compute composite fair value ──
    // Weight: 40% V3 (sector-aware), 30% V2 (advanced), 15% V1 (base), 15% AI
    let compositeFairValue: number;
    let compositeUpside: number;

    if (aiAnalysis && aiAnalysis.fairValue > 0) {
      const v3Val = v3.v3FairValue > 0 ? v3.v3FairValue : v2.weightedFairValue;
      const v2Val = v2.weightedFairValue > 0 ? v2.weightedFairValue : v1.weightedFairValue;
      const v1Val = v1.weightedFairValue > 0 ? v1.weightedFairValue : v2Val;
      const aiVal = aiAnalysis.fairValue;

      const totalWeight = 0.40 + 0.30 + 0.15 + 0.15;
      compositeFairValue = (
        v3Val * 0.40 +
        v2Val * 0.30 +
        v1Val * 0.15 +
        aiVal * 0.15
      ) / totalWeight;
    } else {
      // Fallback: blend V3 and V2
      const v3Val = v3.v3FairValue > 0 ? v3.v3FairValue : v2.weightedFairValue;
      const v2Val = v2.weightedFairValue > 0 ? v2.weightedFairValue : v1.weightedFairValue;
      compositeFairValue = v3Val * 0.6 + v2Val * 0.4;
    }

    compositeFairValue = Math.max(compositeFairValue, 0);
    compositeUpside = f.price > 0 ? ((compositeFairValue - f.price) / f.price) * 100 : 0;

    const confidenceScore = aiAnalysis?.confidenceScore ?? v3.valuationConfidence.score;
    const recommendation = computeRecommendation(compositeUpside, confidenceScore);

    // ── Build response ──
    const response: AIFairValueResponse = {
      symbol,
      stockName,
      sector,
      currentPrice: f.price,
      mathematicalFairValue,
      aiAnalysis,
      compositeFairValue,
      compositeUpside,
      recommendation,
      dataQuality,
      generatedAt: new Date().toISOString(),
      aiSource,
    };

    // ── Cache result ──
    aiCache.set(symbol, { data: response, ts: Date.now() });

    return NextResponse.json(response, {
      headers: { 'Cache-Control': 'public, max-age=300, stale-while-revalidate=60' },
    });
  } catch (error) {
    console.error('[AI Fair Value] Endpoint error:', error);
    return NextResponse.json({ error: 'Failed to generate AI fair value analysis' }, { status: 503 });
  }
}
