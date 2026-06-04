import { NextRequest, NextResponse } from "next/server";
import { fetchFundamentals } from "@/lib/fundamentals";
import { calculateDCF } from "@/lib/fair-value-engine";
import { EGX_STOCKS } from "@/lib/egx-stocks";
import { EGYPT_MARKET_AVG } from "@/lib/egx-sectors";

/**
 * GET /api/analysis/sensitivity?symbol=COMI
 * Returns DCF sensitivity matrix: 5x5 grid of WACC vs Growth Rate.
 * Cache: 120s
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
    if (!f || !f.hasData || f.eps <= 0) {
      return NextResponse.json({ error: `Insufficient data for ${symbol} DCF sensitivity` }, { status: 404 });
    }

    const sector = EGX_STOCKS.find(s => s.symbol === symbol)?.sector || "Other";

    // WACC range: 10% to 30% in 5 steps
    const waccRates = [0.10, 0.15, 0.20, 0.25, 0.30];
    // Growth rate range: 0% to 25% in 5 steps
    const growthRates = [0, 0.0625, 0.125, 0.1875, 0.25];

    const matrix: Array<{
      wacc: number;
      growthRate: number;
      fairValue: number;
    }> = [];

    const terminalGrowth = EGYPT_MARKET_AVG.terminalGrowth;
    const projectionYears = 5;

    for (const wacc of waccRates) {
      for (const growthRate of growthRates) {
        // Validate: growth must be < terminal for TV, and terminal must be < wacc
        if (growthRate >= wacc || terminalGrowth >= wacc) {
          matrix.push({ wacc, growthRate, fairValue: 0 });
          continue;
        }

        const revPerShare = f.revenuePerShare > 0 ? f.revenuePerShare : (f.revenue > 0 ? f.revenue / f.sharesOutstanding : f.eps * 8);
        const opMargin = f.operatingMargin > 0 ? f.operatingMargin / 100 : f.netMargin > 0 ? f.netMargin / 100 * 1.5 : 0.12;
        const capExRatio = f.capex > 0 && f.revenue > 0 ? Math.abs(f.capex) / f.revenue : 0.04;
        const fcfMargin = Math.max(0.03, opMargin - capExRatio);

        const projectedFCF: number[] = [];
        let currentRevPS = revPerShare;
        for (let i = 0; i < projectionYears; i++) {
          const yearGrowth = growthRate * Math.pow(terminalGrowth / growthRate, i / (projectionYears - 1));
          currentRevPS *= (1 + yearGrowth);
          projectedFCF.push(currentRevPS * fcfMargin);
        }

        const lastFCF = projectedFCF[projectedFCF.length - 1];
        const terminalValue = (lastFCF * (1 + terminalGrowth)) / (wacc - terminalGrowth);

        let pvFCF = 0;
        for (let i = 0; i < projectionYears; i++) {
          pvFCF += projectedFCF[i] / Math.pow(1 + wacc, i + 1);
        }
        const pvTerminal = terminalValue / Math.pow(1 + wacc, projectionYears);

        const intrinsicValue = pvFCF + pvTerminal;

        matrix.push({ wacc, growthRate, fairValue: Math.round(intrinsicValue * 100) / 100 });
      }
    }

    // Find the base case (using the stock's actual DCF assumptions)
    const baseDCF = calculateDCF(f);
    const baseWacc = baseDCF?.wacc || 0.20;
    const baseGrowth = baseDCF?.growthRate || 0.10;

    return NextResponse.json({
      symbol,
      sector,
      currentPrice: f.price,
      baseWacc,
      baseGrowth,
      waccRates,
      growthRates,
      matrix,
    }, {
      headers: { "Cache-Control": "public, max-age=120, stale-while-revalidate=30" },
    });
  } catch (error) {
    console.error("Sensitivity error:", error);
    return NextResponse.json({ error: "Failed to calculate sensitivity" }, { status: 503 });
  }
}
