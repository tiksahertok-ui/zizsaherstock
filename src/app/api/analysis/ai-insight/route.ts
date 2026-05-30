import { NextRequest, NextResponse } from "next/server";
import { fetchFundamentals } from "@/lib/fundamentals";
import { calculateFairValue } from "@/lib/fair-value-engine";
import { EGX_STOCKS } from "@/lib/egx-stocks";

/**
 * GET /api/analysis/ai-insight?symbol=COMI
 * Generates AI-powered investment analysis using z-ai-web-dev-sdk.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const symbol = searchParams.get("symbol")?.toUpperCase().trim();

    if (!symbol) {
      return NextResponse.json({ error: "symbol parameter required" }, { status: 400 });
    }

    // Fetch fundamentals
    const fundData = await fetchFundamentals([symbol]);
    const f = fundData[symbol];

    if (!f || !f.hasData) {
      return NextResponse.json({ error: `No data for ${symbol}` }, { status: 404 });
    }

    const sector = EGX_STOCKS.find(s => s.symbol === symbol)?.sector || 'Other';
    const fv = calculateFairValue(f, sector);

    // Build prompt for AI analysis
    const prompt = buildAnalysisPrompt(f, fv, sector);

    // Call AI
    let aiInsight = "Analysis unavailable";
    try {
      const ZAI = await import('z-ai-web-dev-sdk');
      const zai = await (ZAI.default || ZAI).create();
      const completion = await zai.chat.completions.create({
        messages: [
          {
            role: "system",
            content: `You are a professional Egyptian equity research analyst writing for institutional investors. 
Write concise, data-driven investment analysis in English. Use bullet points. Be specific with numbers. 
Reference the actual financial data provided. Sound like a Seeking Alpha or Bloomberg analyst. 
Keep your response under 400 words. Focus on actionable insights.`
          },
          { role: "user", content: prompt }
        ],
        max_tokens: 800,
        temperature: 0.3,
      });
      aiInsight = completion.choices[0]?.message?.content || aiInsight;
    } catch (aiErr) {
      console.error("AI insight error:", aiErr);
      aiInsight = generateFallbackInsight(f, fv, sector);
    }

    return NextResponse.json({
      symbol,
      insight: aiInsight,
      fairValue: fv,
      fundamentals: {
        pe: f.pe, pb: f.pb, evEbitda: f.evEbitda,
        roe: f.roe, roa: f.roa,
        grossMargin: f.grossMargin, netMargin: f.netMargin,
        revenueGrowth: f.revenueGrowth, earningsGrowth: f.earningsGrowth,
        debtEquity: f.debtEquity, dividendYield: f.dividendYield,
        marketCap: f.marketCap,
      },
    }, {
      headers: { "Cache-Control": "public, max-age=600, stale-while-revalidate=120" },
    });
  } catch (error) {
    console.error("AI insight error:", error);
    return NextResponse.json({ error: "Failed to generate insight" }, { status: 503 });
  }
}

function buildAnalysisPrompt(f: import('@/lib/fundamentals').FundamentalData, fv: import('@/lib/fair-value-engine').FairValueResult, sector: string): string {
  const parts = [
    `Analyze ${f.name} (${f.symbol}), an Egyptian ${sector} company listed on EGX.`,
    ``,
    `**Current Market Data:**`,
    `- Price: ${f.price} EGP`,
    `- Market Cap: ${f.marketCap > 0 ? `${(f.marketCap / 1e9).toFixed(1)}B EGP` : 'N/A'}`,
    `- 52W Range: ${f.week52Low} - ${f.week52High} EGP`,
    `- Beta: ${f.beta > 0 ? f.beta.toFixed(2) : 'N/A'}`,
    ``,
    `**Valuation:**`,
    `- P/E: ${f.pe > 0 ? f.pe.toFixed(1) : 'N/A'}`,
    `- P/B: ${f.pb > 0 ? f.pb.toFixed(1) : 'N/A'}`,
    `- EV/EBITDA: ${f.evEbitda > 0 ? f.evEbitda.toFixed(1) : 'N/A'}`,
    ``,
    `**Fair Value Analysis:**`,
    `- Fair Value: ${fv.weightedFairValue.toFixed(2)} EGP`,
    `- Upside: ${fv.weightedUpside > 0 ? '+' : ''}${fv.weightedUpside.toFixed(1)}%`,
    `- Status: ${fv.status}`,
    `- Confidence: ${fv.confidence} (${fv.activeModels}/4 models)`,
    ``,
    `**Profitability:**`,
    `- Revenue: ${f.revenue > 0 ? `${(f.revenue / 1e9).toFixed(1)}B` : 'N/A'} EGP`,
    `- Net Income: ${f.netIncome !== 0 ? `${(f.netIncome / 1e6).toFixed(0)}M` : 'N/A'} EGP`,
    `- Gross Margin: ${f.grossMargin > 0 ? `${f.grossMargin.toFixed(1)}%` : 'N/A'}`,
    `- Net Margin: ${f.netMargin > 0 ? `${f.netMargin.toFixed(1)}%` : 'N/A'}`,
    `- ROE: ${f.roe > 0 ? `${f.roe.toFixed(1)}%` : 'N/A'}`,
    `- ROA: ${f.roa > 0 ? `${f.roa.toFixed(1)}%` : 'N/A'}`,
    ``,
    `**Growth:**`,
    `- Revenue Growth (YoY): ${f.revenueGrowth !== 0 ? `${f.revenueGrowth.toFixed(1)}%` : 'N/A'}`,
    `- Earnings Growth (YoY): ${f.earningsGrowth !== 0 ? `${f.earningsGrowth.toFixed(1)}%` : 'N/A'}`,
    ``,
    `**Financial Health:**`,
    `- Debt/Equity: ${f.debtEquity >= 0 ? f.debtEquity.toFixed(2) : 'N/A'}`,
    `- Dividend Yield: ${f.dividendYield > 0 ? `${f.dividendYield.toFixed(1)}%` : 'N/A'}`,
    `- FCF: ${f.freeCashFlow !== 0 ? `${(f.freeCashFlow / 1e6).toFixed(0)}M` : 'N/A'} EGP`,
    ``,
    `Write a concise investment analysis covering:`,
    `1. Key strengths and risks`,
    `2. Valuation assessment`,
    `3. Investment recommendation (Buy/Hold/Sell)`,
    `4. Key catalysts to watch`,
  ];

  return parts.join('\n');
}

function generateFallbackInsight(
  f: import('@/lib/fundamentals').FundamentalData,
  fv: import('@/lib/fair-value-engine').FairValueResult,
  sector: string
): string {
  const lines: string[] = [];

  lines.push(`## ${f.name} (${f.symbol}) — ${sector} Sector Analysis\n`);

  // Valuation summary
  if (fv.status !== 'N/A') {
    const verdict = fv.status === 'Undervalued' ? 'appears undervalued' :
      fv.status === 'Overvalued' ? 'appears overvalued' : 'is fairly valued';
    lines.push(`**Valuation:** ${f.symbol} ${verdict} at ${f.price} EGP, with a calculated fair value of ${fv.weightedFairValue.toFixed(2)} EGP (${fv.weightedUpside > 0 ? '+' : ''}${fv.weightedUpside.toFixed(1)}% ${fv.weightedUpside > 0 ? 'upside' : 'downside'}). ${fv.activeModels} of 4 valuation models were used (${fv.confidence} confidence).\n`);
  }

  // Profitability
  if (f.roe > 0) {
    lines.push(`**Profitability:** ROE of ${f.roe.toFixed(1)}% ${f.roe > 15 ? 'is above market average, indicating efficient capital allocation.' : 'is below the market average of ~15%.'} ${f.grossMargin > 0 ? `Gross margin stands at ${f.grossMargin.toFixed(1)}%.` : ''} ${f.netMargin > 0 ? `Net margin is ${f.netMargin.toFixed(1)}%.` : ''}\n`);
  }

  // Growth
  if (f.revenueGrowth !== 0) {
    const growthTrend = f.revenueGrowth > 10 ? 'strong growth' : f.revenueGrowth > 0 ? 'moderate growth' : 'revenue contraction';
    lines.push(`**Growth:** Revenue grew ${Math.abs(f.revenueGrowth).toFixed(1)}% YoY, indicating ${growthTrend}. ${f.earningsGrowth > 0 ? `Earnings grew ${f.earningsGrowth.toFixed(1)}%.` : ''}\n`);
  }

  // Financial health
  if (f.debtEquity >= 0) {
    lines.push(`**Financial Health:** D/E ratio of ${f.debtEquity.toFixed(2)} ${f.debtEquity > 2 ? 'is elevated, suggesting higher financial risk.' : 'is within acceptable range.'} ${f.dividendYield > 0 ? `Dividend yield of ${f.dividendYield.toFixed(1)}% provides income to shareholders.` : ''}\n`);
  }

  lines.push(`**Data Quality:** ${fv.dataQuality || 0}/100 — ${fv.activeModels} valuation models active.\n`);
  lines.push(`*Analysis based on TradingView fundamental data. Not financial advice.*`);

  return lines.join('\n');
}
