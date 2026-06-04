/**
 * AI Equity Research Report Generator
 * ───────────────────────────────────
 * Institutional-grade equity research report endpoint for EGX stocks.
 * Generates comprehensive analyst-style reports with 10 structured sections
 * covering valuation, profitability, growth, financial health, cash flow,
 * dividends, risk assessment, investment thesis, and price targets.
 *
 * GET /api/analysis/research-report?symbol=XXXX
 */

import { NextRequest, NextResponse } from "next/server";
import { fetchFundamentals, type FundamentalData } from "@/lib/fundamentals";
import { calculateFairValue, type FairValueResult } from "@/lib/fair-value-engine";
import { computeSectorAverages, getSectorBenchmark, type SectorBenchmark } from "@/lib/egx-sectors";
import { EGX_STOCKS, findStock } from "@/lib/egx-stocks";

// ── Types ──────────────────────────────────────────────────────────

export interface ResearchReportResponse {
  symbol: string;
  report: string;
  generatedAt: string;
  dataSource: "ai" | "rule-based";
}

interface ReportContext {
  f: FundamentalData;
  fv: FairValueResult;
  bench: SectorBenchmark;
  stock: { symbol: string; name: string; sector: string };
}

// ── System Prompt ──────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are a senior Egyptian equity research analyst at a top-tier investment bank (Goldman Sachs / Morgan Stanley / EFG Hermes quality). You specialize in EGX-listed equities and produce institutional-grade research reports for portfolio managers and institutional investors.

Your writing style:
- Professional, precise, and data-driven
- Use specific numbers and percentages from the provided data
- Structure with clear markdown headings and bullet points
- Include actionable investment conclusions
- Reference sector benchmarks to contextualize every metric
- Write in English but use correct Egyptian market terminology
- Be balanced — acknowledge both bull and bear cases
- Keep total report under 1,500 words

Report structure must follow these 10 numbered sections exactly:
1. Company Overview
2. Valuation Analysis
3. Profitability Analysis
4. Growth Analysis
5. Financial Health
6. Cash Flow Quality
7. Dividend Analysis
8. Risk Assessment
9. Investment Thesis
10. Price Target & Recommendation

Format rules:
- Use ## for section headings with the section number (e.g., "## 1. Company Overview")
- Use bullet points (- ) for key data points
- Bold important metrics
- Add a one-line executive summary at the very top
- End with "Disclaimer: This report is for informational purposes only and does not constitute financial advice."`;

// ── Prompt Builder ────────────────────────────────────────────────

function buildResearchPrompt(ctx: ReportContext): string {
  const { f, fv, bench, stock } = ctx;
  const fmt = (n: number, decimals = 1) => n > 0 ? n.toFixed(decimals) : "N/A";
  const fmtBig = (n: number, unit: string) => {
    const abs = Math.abs(n);
    if (abs >= 1e9) return `${(n / 1e9).toFixed(1)}B ${unit}`;
    if (abs >= 1e6) return `${(n / 1e6).toFixed(0)}M ${unit}`;
    if (abs >= 1e3) return `${(n / 1e3).toFixed(0)}K ${unit}`;
    return `${n.toFixed(0)} ${unit}`;
  };

  const upsideSign = fv.weightedUpside > 0 ? "+" : "";
  const changeSign = f.change > 0 ? "+" : "";

  // Interest coverage proxy: Operating Income / Total Debt * 100
  const interestCoverage = f.totalDebt > 0 && f.operatingIncome > 0
    ? (f.operatingIncome / f.totalDebt).toFixed(2)
    : "N/A";

  // Current ratio proxy: Total Assets / Total Liabilities
  const currentRatio = f.totalLiabilities > 0 && f.totalAssets > 0
    ? (f.totalAssets / f.totalLiabilities).toFixed(2)
    : "N/A";

  // FCF margin
  const fcfMargin = f.revenue > 0 && f.freeCashFlow !== 0
    ? ((f.freeCashFlow / f.revenue) * 100).toFixed(1)
    : "N/A";

  // CapEx efficiency (OCF / CapEx)
  const capExEfficiency = f.capex !== 0 && f.operatingCashFlow !== 0
    ? (f.operatingCashFlow / Math.abs(f.capex)).toFixed(1) + "x"
    : "N/A";

  // Position in 52-week range
  const range52W = f.week52High > f.week52Low
    ? (((f.price - f.week52Low) / (f.week52High - f.week52Low)) * 100).toFixed(0)
    : "N/A";

  // Dividend sustainability assessment data
  const dividendCoverage = f.eps > 0 && f.dps > 0
    ? (f.eps / f.dps).toFixed(1) + "x"
    : "N/A";

  const prompt = [
    `Generate a full institutional equity research report for the following EGX stock.`,
    ``,
    `═══════════════════════════════════════════`,
    `  ${stock.name} (${stock.symbol})`,
    `  Sector: ${stock.sector} | Egyptian Exchange (EGX)`,
    `═══════════════════════════════════════════`,
    ``,
    `─── 1. COMPANY OVERVIEW ───`,
    `- Company: ${stock.name}`,
    `- Ticker: ${stock.symbol}`,
    `- Sector: ${stock.sector}`,
    `- Market Cap: ${fmtBig(f.marketCap, "EGP")}`,
    `- Current Price: ${fmt(f.price, 2)} EGP (${changeSign}${fmt(f.change)}% today)`,
    `- Volume: ${fmtBig(f.volume, "shares")}`,
    `- Shares Outstanding: ${fmtBig(f.sharesOutstanding, "")}`,
    ``,
    `─── 2. VALUATION ANALYSIS ───`,
    `- P/E (TTM): ${fmt(f.pe)}`,
    `- Sector Avg P/E: ${fmt(bench.avgPE)}`,
    `- P/E Premium/Discount: ${f.pe > 0 && bench.avgPE > 0 ? ((f.pe / bench.avgPE - 1) * 100).toFixed(1) + "%" : "N/A"}`,
    `- P/B: ${fmt(f.pb)} (Sector Avg: ${fmt(bench.avgPB)})`,
    `- EV/EBITDA: ${fmt(f.evEbitda)} (Sector Avg: ${fmt(bench.avgEV_EBITDA)})`,
    `- P/S: ${fmt(f.ps)} (Sector Avg: ${fmt(bench.avgPS)})`,
    `- PEG: ${fmt(f.peg)}`,
    ``,
    `─── FAIR VALUE (Multi-Model Weighted) ───`,
    `- Weighted Fair Value: ${fmt(fv.weightedFairValue, 2)} EGP`,
    `- Upside/Downside: ${upsideSign}${fmt(fv.weightedUpside)}%`,
    `- Valuation Status: ${fv.status}`,
    `- Confidence: ${fv.confidence} (${fv.activeModels}/${fv.totalModels} models active, Data Quality: ${fv.dataQuality}/100)`,
    ``,
    `─── Fair Value by Model ───`,
    `- DCF Intrinsic Value: ${fv.dcf ? fmt(fv.dcf.intrinsicValue, 2) + " EGP" : "N/A"}`,
    `  WACC: ${fv.dcf ? (fv.dcf.wacc * 100).toFixed(1) + "%" : "N/A"} | Growth: ${fv.dcf ? (fv.dcf.growthRate * 100).toFixed(1) + "%" : "N/A"} | FCF Yield: ${fv.dcf ? (fv.dcf.fcfYield * 100).toFixed(1) + "%" : "N/A"}`,
    `- Relative Valuation: ${fv.relative ? fmt(fv.relative.weightedValue, 2) + " EGP" : "N/A"}`,
    `  P/E-based: ${fv.relative ? fmt(fv.relative.peFairValue, 2) : "N/A"} | P/B-based: ${fv.relative ? fmt(fv.relative.pbFairValue, 2) : "N/A"} | EV/EBITDA-based: ${fv.relative ? fmt(fv.relative.evEbitdaFairValue, 2) : "N/A"}`,
    `- DDM Value: ${fv.ddm ? fmt(fv.ddm.intrinsicValue, 2) + " EGP" : "N/A"}`,
    `  Div Growth: ${fv.ddm ? fmt(fv.ddm.dividendGrowthRate) + "%" : "N/A"} | Required Return: ${fv.ddm ? (fv.ddm.requiredReturn * 100).toFixed(1) + "%" : "N/A"}`,
    `- Asset-Based Value: ${fv.asset ? fmt(fv.asset.intrinsicValue, 2) + " EGP" : "N/A"}`,
    `  BVPS: ${fv.asset ? fmt(fv.asset.bookValuePerShare, 2) : "N/A"} | ROE Premium: ${fv.asset ? fmt(fv.asset.premium, 0) + "%" : "N/A"}`,
    ``,
    `─── 3. PROFITABILITY ANALYSIS ───`,
    `- Revenue: ${fmtBig(f.revenue, "EGP")}`,
    `- Gross Profit: ${fmtBig(f.grossProfit, "EGP")}`,
    `- Operating Income (EBIT): ${fmtBig(f.operatingIncome, "EGP")}`,
    `- Net Income: ${fmtBig(f.netIncome, "EGP")}`,
    `- Gross Margin: ${fmt(f.grossMargin)}% (Sector Avg: ${fmt(bench.avgGrossMargin)}%)`,
    `- Operating Margin: ${fmt(f.operatingMargin)}%`,
    `- Net Margin: ${fmt(f.netMargin)}% (Sector Avg: ${fmt(bench.avgNetMargin)}%)`,
    `- ROE: ${fmt(f.roe)}% (Sector Avg: ${fmt(bench.avgROE)}%)`,
    `- ROA: ${fmt(f.roa)}%`,
    ``,
    `─── 4. GROWTH ANALYSIS ───`,
    `- Revenue Growth (YoY): ${fmt(f.revenueGrowth)}% (Sector Avg: ${fmt(bench.avgRevenueGrowth)}%)`,
    `- Earnings Growth (YoY): ${fmt(f.earningsGrowth)}%`,
    `- EPS (TTM): ${fmt(f.eps, 2)} EGP`,
    `- Revenue Per Share: ${fmt(f.revenuePerShare, 2)} EGP`,
    ``,
    `─── 5. FINANCIAL HEALTH ───`,
    `- Debt/Equity: ${fmt(f.debtEquity, 2)} (Sector Avg: ${fmt(bench.avgDebtEquity, 2)})`,
    `- Total Debt: ${fmtBig(f.totalDebt, "EGP")}`,
    `- Cash & Equivalents: ${fmtBig(f.cash, "EGP")}`,
    `- Total Assets: ${fmtBig(f.totalAssets, "EGP")}`,
    `- Total Liabilities: ${fmtBig(f.totalLiabilities, "EGP")}`,
    `- Stockholders' Equity: ${fmtBig(f.stockholdersEquity, "EGP")}`,
    `- Working Capital: ${fmtBig(f.workingCapital, "EGP")}`,
    `- Interest Coverage (proxy): ${interestCoverage}`,
    `- Liquidity (A/L ratio): ${currentRatio}`,
    ``,
    `─── 6. CASH FLOW QUALITY ───`,
    `- Operating Cash Flow: ${fmtBig(f.operatingCashFlow, "EGP")}`,
    `- Free Cash Flow: ${fmtBig(f.freeCashFlow, "EGP")}`,
    `- Capital Expenditures: ${fmtBig(Math.abs(f.capex), "EGP")}`,
    `- FCF Margin: ${fcfMargin}%`,
    `- CapEx Efficiency (OCF/CapEx): ${capExEfficiency}`,
    ``,
    `─── 7. DIVIDEND ANALYSIS ───`,
    `- Dividend Yield: ${fmt(f.dividendYield)}% (Sector Avg: ${fmt(bench.avgDividendYield)}%)`,
    `- Payout Ratio: ${fmt(f.payoutRatio)}%`,
    `- DPS: ${fmt(f.dps, 2)} EGP`,
    `- Dividend Coverage (EPS/DPS): ${dividendCoverage}`,
    ``,
    `─── 8. RISK ASSESSMENT ───`,
    `- Beta (1Y): ${fmt(f.beta, 2)}`,
    `- 52-Week High: ${fmt(f.week52High, 2)} EGP`,
    `- 52-Week Low: ${fmt(f.week52Low, 2)} EGP`,
    `- Position in 52W Range: ${range52W}%`,
    `- Volatility Indicator: ${f.beta > 1.3 ? "High" : f.beta > 0.8 ? "Moderate" : "Low"}`,
    ``,
    `─── 9. INVESTMENT THESIS ───`,
    `(Bull case arguments, Bear case arguments, Key catalysts, Key risks — synthesize from all data above)`,
    ``,
    `─── 10. PRICE TARGET & RECOMMENDATION ───`,
    `- Base Target: ${fmt(fv.baseTarget, 2)} EGP`,
    `- Bull Target: ${fmt(fv.bullishTarget, 2)} EGP`,
    `- Bear Target: ${fmt(fv.bearishTarget, 2)} EGP`,
    `- Current Price: ${fmt(f.price, 2)} EGP`,
    `(Provide rationale for each scenario and a final Buy/Hold/Sell recommendation)`,
  ];

  return prompt.join("\n");
}

// ── Rule-Based Report Generator ─────────────────────────────────────

export function generateRuleBasedReport(
  f: FundamentalData,
  fv: FairValueResult,
  bench: SectorBenchmark,
  stock: { symbol: string; name: string; sector: string }
): string {
  const fmt = (n: number, d = 1) => n > 0 ? n.toFixed(d) : "N/A";
  const fmtBig = (n: number, unit: string) => {
    const abs = Math.abs(n);
    if (abs >= 1e9) return `${(n / 1e9).toFixed(1)}B ${unit}`;
    if (abs >= 1e6) return `${(n / 1e6).toFixed(0)}M ${unit}`;
    if (abs >= 1e3) return `${(n / 1e6).toFixed(2)}M ${unit}`;
    return `${n.toFixed(0)} ${unit}`;
  };
  const sign = (n: number) => n > 0 ? "+" : "";

  const peVsSector = f.pe > 0 && bench.avgPE > 0
    ? ((f.pe / bench.avgPE - 1) * 100).toFixed(1) + "%"
    : "N/A";
  const rangePos = f.week52High > f.week52Low
    ? (((f.price - f.week52Low) / (f.week52High - f.week52Low)) * 100).toFixed(0) + "%"
    : "N/A";

  // Assessment helpers
  const roeVerdict = f.roe > bench.avgROE + 3 ? "superior to sector peers" :
    f.roe > bench.avgROE - 3 ? "in line with sector" : "below sector average";
  const marginVerdict = f.grossMargin > bench.avgGrossMargin ? "above sector average" :
    f.grossMargin > 0 ? "below sector average" : "not available";
  const debtVerdict = f.debtEquity > bench.avgDebtEquity + 1 ? "elevated, signaling higher leverage risk" :
    f.debtEquity > 0 ? "manageable within sector norms" : "conservatively positioned";
  const growthVerdict = f.revenueGrowth > bench.avgRevenueGrowth + 5 ? "outperforming sector growth rates" :
    f.revenueGrowth > 0 ? "tracking near sector averages" :
      f.revenueGrowth < -5 ? "contracting, warrants monitoring" : "flat";
  const fcfVerdict = f.freeCashFlow > 0 ? "positive, indicating healthy cash generation" :
    f.freeCashFlow < 0 ? "negative, potentially due to heavy capex or working capital needs" : "not available";

  // Investment thesis
  const upsidePct = fv.weightedUpside;
  const recommendation = upsidePct > 20 ? "**Buy**" :
    upsidePct > -10 ? "**Hold**" : "**Sell/Reduce**";
  const convRationale = upsidePct > 20
    ? `Fair value implies significant upside of ${fmt(upsidePct)}% from current levels, supported by ${fv.activeModels} valuation models.`
    : upsidePct > -10
      ? `Fair value is closely aligned with the current market price (${fmt(upsidePct)}% deviation), suggesting the stock is reasonably priced.`
      : `Fair value suggests the stock is overpriced by ${fmt(Math.abs(upsidePct))}%, indicating potential downside risk.`;

  const report: string[] = [];

  // Executive Summary
  report.push(`**Executive Summary:** ${stock.name} (${stock.symbol}), listed in the ${stock.sector} sector on the EGX, is currently priced at ${fmt(f.price, 2)} EGP with a market capitalization of ${fmtBig(f.marketCap, "EGP")}. The multi-model fair value analysis yields a target of ${fmt(fv.weightedFairValue, 2)} EGP (${sign(upsidePct)}${fmt(upsidePct)}% upside), with **${fv.confidence}** confidence. Recommendation: ${recommendation}.\n`);

  // Section 1
  report.push(`## 1. Company Overview`);
  report.push(`- **Company:** ${stock.name}`);
  report.push(`- **Ticker:** ${stock.symbol} | **Sector:** ${stock.sector}`);
  report.push(`- **Market Cap:** ${fmtBig(f.marketCap, "EGP")}`);
  report.push(`- **Current Price:** ${fmt(f.price, 2)} EGP (${sign(f.change)}${fmt(f.change)}% today)`);
  report.push(`- **52-Week Range:** ${fmt(f.week52Low, 2)} — ${fmt(f.week52High, 2)} EGP (currently at ${rangePos} of range)`);
  report.push(`- **Beta:** ${fmt(f.beta, 2)}\n`);

  // Section 2
  report.push(`## 2. Valuation Analysis`);
  report.push(`| Metric | Stock | Sector Avg | vs Sector |`);
  report.push(`|--------|-------|------------|-----------|`);
  report.push(`| P/E (TTM) | ${fmt(f.pe)} | ${fmt(bench.avgPE)} | ${peVsSector} |`);
  report.push(`| P/B | ${fmt(f.pb)} | ${fmt(bench.avgPB)} | ${f.pb > 0 && bench.avgPB > 0 ? ((f.pb / bench.avgPB - 1) * 100).toFixed(1) + "%" : "N/A"} |`);
  report.push(`| EV/EBITDA | ${fmt(f.evEbitda)} | ${fmt(bench.avgEV_EBITDA)} | ${f.evEbitda > 0 && bench.avgEV_EBITDA > 0 ? ((f.evEbitda / bench.avgEV_EBITDA - 1) * 100).toFixed(1) + "%" : "N/A"} |`);
  report.push(`| P/S | ${fmt(f.ps)} | ${fmt(bench.avgPS)} | ${f.ps > 0 && bench.avgPS > 0 ? ((f.ps / bench.avgPS - 1) * 100).toFixed(1) + "%" : "N/A"} |`);
  report.push(`- **Fair Value (Weighted):** ${fmt(fv.weightedFairValue, 2)} EGP — **${sign(upsidePct)}${fmt(upsidePct)}%** from current price`);
  report.push(`- **Status:** ${fv.status} | **Confidence:** ${fv.confidence} (${fv.activeModels}/4 models)`);
  report.push(`- **Model Breakdown:**`);
  if (fv.dcf) report.push(`  - DCF: ${fmt(fv.dcf.intrinsicValue, 2)} EGP (WACC ${(fv.dcf.wacc * 100).toFixed(1)}%, growth ${(fv.dcf.growthRate * 100).toFixed(1)}%)`);
  if (fv.relative) report.push(`  - Relative: ${fmt(fv.relative.weightedValue, 2)} EGP (P/E: ${fmt(fv.relative.peFairValue, 2)}, P/B: ${fmt(fv.relative.pbFairValue, 2)}, EV/EBITDA: ${fmt(fv.relative.evEbitdaFairValue, 2)})`);
  if (fv.ddm) report.push(`  - DDM: ${fmt(fv.ddm.intrinsicValue, 2)} EGP (div growth ${fmt(fv.ddm.dividendGrowthRate)}%, req. return ${(fv.ddm.requiredReturn * 100).toFixed(1)}%)`);
  if (fv.asset) report.push(`  - Asset: ${fmt(fv.asset.intrinsicValue, 2)} EGP (BVPS ${fmt(fv.asset.bookValuePerShare, 2)}, ROE premium ${fmt(fv.asset.premium, 0)}%)\n`);

  // Section 3
  report.push(`## 3. Profitability Analysis`);
  report.push(`- **Revenue:** ${fmtBig(f.revenue, "EGP")} | **Net Income:** ${fmtBig(f.netIncome, "EGP")}`);
  report.push(`- **Gross Margin:** ${fmt(f.grossMargin)}% (${marginVerdict}) — Sector: ${fmt(bench.avgGrossMargin)}%`);
  report.push(`- **Operating Margin:** ${fmt(f.operatingMargin)}%`);
  report.push(`- **Net Margin:** ${fmt(f.netMargin)}% — Sector: ${fmt(bench.avgNetMargin)}%`);
  report.push(`- **ROE:** ${fmt(f.roe)}% (${roeVerdict}) — Sector: ${fmt(bench.avgROE)}%`);
  report.push(`- **ROA:** ${fmt(f.roa)}%\n`);

  // Section 4
  report.push(`## 4. Growth Analysis`);
  report.push(`- **Revenue Growth (YoY):** ${fmt(f.revenueGrowth)}% — Sector Avg: ${fmt(bench.avgRevenueGrowth)}%`);
  report.push(`- **Earnings Growth (YoY):** ${fmt(f.earningsGrowth)}%`);
  report.push(`- **EPS (TTM):** ${fmt(f.eps, 2)} EGP`);
  report.push(`- **Assessment:** Revenue growth is **${growthVerdict}**.\n`);

  // Section 5
  report.push(`## 5. Financial Health`);
  report.push(`- **Debt/Equity:** ${fmt(f.debtEquity, 2)} (Sector: ${fmt(bench.avgDebtEquity, 2)}) — ${debtVerdict}`);
  report.push(`- **Total Debt:** ${fmtBig(f.totalDebt, "EGP")} | **Cash:** ${fmtBig(f.cash, "EGP")}`);
  report.push(`- **Total Assets:** ${fmtBig(f.totalAssets, "EGP")} | **Equity:** ${fmtBig(f.stockholdersEquity, "EGP")}`);
  report.push(`- **Working Capital:** ${fmtBig(f.workingCapital, "EGP")}\n`);

  // Section 6
  report.push(`## 6. Cash Flow Quality`);
  report.push(`- **Operating Cash Flow:** ${fmtBig(f.operatingCashFlow, "EGP")}`);
  report.push(`- **Free Cash Flow:** ${fmtBig(f.freeCashFlow, "EGP")} — ${fcfVerdict}`);
  report.push(`- **Capital Expenditures:** ${fmtBig(Math.abs(f.capex), "EGP")}`);
  report.push(`- **FCF Margin:** ${f.revenue > 0 && f.freeCashFlow !== 0 ? ((f.freeCashFlow / f.revenue) * 100).toFixed(1) + "%" : "N/A"}\n`);

  // Section 7
  report.push(`## 7. Dividend Analysis`);
  report.push(`- **Dividend Yield:** ${fmt(f.dividendYield)}% (Sector: ${fmt(bench.avgDividendYield)}%)`);
  report.push(`- **Payout Ratio:** ${fmt(f.payoutRatio)}%`);
  report.push(`- **DPS:** ${fmt(f.dps, 2)} EGP`);
  report.push(`- **Assessment:** ${f.dividendYield > bench.avgDividendYield ? "Above-average yield, attractive for income investors." : f.dividendYield > 0 ? "Yield is below sector average." : "No dividend currently paid."} ${f.payoutRatio > 80 && f.payoutRatio > 0 ? "High payout ratio may constrain future growth." : ""}\n`);

  // Section 8
  report.push(`## 8. Risk Assessment`);
  report.push(`- **Beta:** ${fmt(f.beta, 2)} — ${f.beta > 1.3 ? "Higher volatility than the market; expect larger price swings." : f.beta < 0.8 ? "Lower volatility; defensive characteristics." : "Market-level volatility."}`);
  report.push(`- **52-Week Range:** ${fmt(f.week52Low, 2)} — ${fmt(f.week52High, 2)} EGP (at ${rangePos})`);
  report.push(`- **Key Risk Factors:**`);
  if (f.debtEquity > 3) report.push(`  - High leverage (D/E: ${fmt(f.debtEquity, 2)}) amplifies downside in downturns`);
  if (f.earningsGrowth < -10) report.push(`  - Negative earnings growth of ${fmt(f.earningsGrowth)}% signals operational headwinds`);
  if (f.beta > 1.2) report.push(`  - Elevated beta indicates sensitivity to broader market movements`);
  if (f.freeCashFlow < 0 && f.capex > 0) report.push(`  - Negative FCF raises questions about capex sustainability`);
  if (f.payoutRatio > 90 && f.payoutRatio > 0) report.push(`  - Near-full payout ratio limits retained earnings for growth`);
  report.push("");

  // Section 9
  report.push(`## 9. Investment Thesis`);
  report.push(`**Bull Case:**`);
  if (upsidePct > 15) report.push(`- Stock trades at a ${fmt(Math.abs(upsidePct))}% discount to multi-model fair value`);
  if (f.roe > bench.avgROE) report.push(`- Superior ROE of ${fmt(f.roe)}% vs. sector ${fmt(bench.avgROE)}% demonstrates capital efficiency`);
  if (f.revenueGrowth > 10) report.push(`- Revenue growth of ${fmt(f.revenueGrowth)}% outpaces sector trend`);
  if (f.dividendYield > bench.avgDividendYield) report.push(`- Above-sector dividend yield of ${fmt(f.dividendYield)}% provides income cushion`);
  if (f.freeCashFlow > 0) report.push(`- Positive free cash flow generation supports deleveraging or shareholder returns`);

  report.push(`**Bear Case:**`);
  if (upsidePct < -10) report.push(`- Overvalued by ${fmt(Math.abs(upsidePct))}% relative to multi-model fair value`);
  if (f.debtEquity > bench.avgDebtEquity + 1) report.push(`- Elevated D/E of ${fmt(f.debtEquity, 2)} vs. sector ${fmt(bench.avgDebtEquity, 2)} increases financial risk`);
  if (f.earningsGrowth < 0) report.push(`- Declining earnings of ${fmt(f.earningsGrowth)}% YoY is a negative signal`);
  if (f.beta > 1.2) report.push(`- High beta of ${fmt(f.beta, 2)} exposes investors to outsized drawdowns`);
  if (f.grossMargin < bench.avgGrossMargin) report.push(`- Below-sector gross margin suggests pricing pressure or cost inefficiency`);

  report.push(`**Key Catalysts:**`);
  report.push(`- Potential re-rating as earnings growth stabilizes or accelerates`);
  report.push(`- Sector rotation into EGX defensive/growth names`);
  report.push(`- Macro: CBE rate trajectory and EGP stability`);

  report.push(`**Key Risks:**`);
  report.push(`- Egyptian macro headwinds (inflation, FX volatility)`);
  report.push(`- Sector-specific regulatory changes`);
  report.push(`- Global risk-off sentiment affecting emerging markets\n`);

  // Section 10
  report.push(`## 10. Price Target & Recommendation`);
  report.push(`| Scenario | Target Price | Upside/Downside |`);
  report.push(`|----------|-------------|-----------------|`);
  report.push(`| **Bull** | ${fmt(fv.bullishTarget, 2)} EGP | ${sign(((fv.bullishTarget / f.price - 1) * 100))}${(((fv.bullishTarget / f.price - 1) * 100).toFixed(1))}% |`);
  report.push(`| **Base** | ${fmt(fv.baseTarget, 2)} EGP | ${sign(upsidePct)}${fmt(upsidePct)}% |`);
  report.push(`| **Bear** | ${fmt(fv.bearishTarget, 2)} EGP | ${sign(((fv.bearishTarget / f.price - 1) * 100))}${(((fv.bearishTarget / f.price - 1) * 100).toFixed(1))}% |`);
  report.push(``);
  report.push(`**Recommendation: ${recommendation}** — ${convRationale} Data quality score: ${fv.dataQuality}/100.\n`);
  report.push(`*Disclaimer: This report is for informational purposes only and does not constitute financial advice.*`);

  return report.join("\n");
}

// ── GET Handler ─────────────────────────────────────────────────────

export async function GET(request: NextRequest): Promise<NextResponse<ResearchReportResponse | { error: string }>> {
  try {
    const { searchParams } = new URL(request.url);
    const symbol = searchParams.get("symbol")?.toUpperCase().trim();

    if (!symbol) {
      return NextResponse.json(
        { error: "Missing required parameter: symbol (e.g., ?symbol=COMI)" },
        { status: 400 }
      );
    }

    // Resolve stock info
    const stock = findStock(symbol);
    if (!stock) {
      return NextResponse.json(
        { error: `Symbol "${symbol}" not found in EGX stock database` },
        { status: 404 }
      );
    }

    // Fetch fundamentals for this stock
    const fundData = await fetchFundamentals([stock.symbol]);
    const f = fundData[stock.symbol];

    if (!f || !f.hasData) {
      return NextResponse.json(
        { error: `No fundamental data available for ${stock.symbol}` },
        { status: 404 }
      );
    }

    // Fetch all EGX fundamentals for dynamic sector averages
    let sectorBenchmarks: Record<string, SectorBenchmark> = {};
    try {
      const allFundData = await fetchFundamentals(
        EGX_STOCKS.map((s) => s.symbol)
      );
      // Merge sector info with fundamentals for computeSectorAverages
      const mergedForAverages = Object.fromEntries(
        Object.entries(allFundData).map(([sym, data]) => {
          const sectorInfo = EGX_STOCKS.find((s) => s.symbol === sym);
          return [sym, { ...data, sector: sectorInfo?.sector || "Other" }];
        })
      );
      sectorBenchmarks = computeSectorAverages(mergedForAverages);
    } catch (sectorErr) {
      console.warn("Sector averages computation failed, using defaults:", sectorErr);
    }

    // Calculate fair value with sector benchmarks
    const fv = calculateFairValue(f, stock.sector, sectorBenchmarks);

    // Get sector benchmark for this stock
    const bench = getSectorBenchmark(stock.sector, sectorBenchmarks);

    // Build context
    const ctx: ReportContext = { f, fv, bench, stock };
    const userPrompt = buildResearchPrompt(ctx);

    // Attempt AI generation
    let report = "";
    let dataSource: ResearchReportResponse["dataSource"] = "rule-based";

    try {
      const ZAI = await import("z-ai-web-dev-sdk") as any;
      const zai = await (ZAI.default || ZAI).create();
      const completion = await zai.chat.completions.create({
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userPrompt },
        ],
        max_tokens: 2000,
        temperature: 0.3,
      });
      const aiReport = completion.choices?.[0]?.message?.content?.trim();
      if (aiReport && aiReport.length > 200) {
        report = aiReport;
        dataSource = "ai";
      }
    } catch (aiErr) {
      console.error("AI research report generation failed, using rule-based fallback:", aiErr);
    }

    // Fallback to rule-based if AI didn't produce usable output
    if (!report) {
      report = generateRuleBasedReport(f, fv, bench, stock);
      dataSource = "rule-based";
    }

    const response: ResearchReportResponse = {
      symbol: stock.symbol,
      report,
      generatedAt: new Date().toISOString(),
      dataSource,
    };

    return NextResponse.json(response, {
      status: 200,
      headers: {
        "Cache-Control": "public, max-age=600, stale-while-revalidate=120",
      },
    });
  } catch (error) {
    console.error("Research report endpoint error:", error);
    return NextResponse.json(
      { error: "Failed to generate research report. Please try again." },
      { status: 503 }
    );
  }
}
