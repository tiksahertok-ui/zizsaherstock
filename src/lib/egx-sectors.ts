/**
 * EGX Sector Benchmarks & Averages
 * ──────────────────────────────────
 * Provides sector-level benchmark data used for relative valuation.
 * These are typical Egyptian market benchmarks based on EGX data patterns.
 * Updated dynamically when fundamental data is fetched.
 */

// ── Static Sector Benchmarks (Egyptian Market Averages) ────────
// These serve as fallbacks when dynamic calculation isn't available

export interface SectorBenchmark {
  sector: string;
  avgPE: number;
  avgPB: number;
  avgEV_EBITDA: number;
  avgPS: number;
  avgROE: number;
  avgDebtEquity: number;
  avgGrossMargin: number;
  avgNetMargin: number;
  avgDividendYield: number;
  avgRevenueGrowth: number;
  count: number;
}

// Conservative Egyptian market benchmarks based on typical EGX ranges
export const DEFAULT_SECTOR_BENCHMARKS: Record<string, SectorBenchmark> = {
  "Financials": {
    sector: "Financials",
    avgPE: 8.5, avgPB: 1.2, avgEV_EBITDA: 6.5, avgPS: 2.8,
    avgROE: 18, avgDebtEquity: 4.5, avgGrossMargin: 45, avgNetMargin: 22,
    avgDividendYield: 6.5, avgRevenueGrowth: 12, count: 55,
  },
  "Materials": {
    sector: "Materials",
    avgPE: 7.5, avgPB: 1.5, avgEV_EBITDA: 5.5, avgPS: 1.2,
    avgROE: 15, avgDebtEquity: 1.8, avgGrossMargin: 25, avgNetMargin: 10,
    avgDividendYield: 8.0, avgRevenueGrowth: 8, count: 20,
  },
  "Real Estate": {
    sector: "Real Estate",
    avgPE: 9.0, avgPB: 0.9, avgEV_EBITDA: 7.0, avgPS: 2.5,
    avgROE: 12, avgDebtEquity: 2.0, avgGrossMargin: 40, avgNetMargin: 18,
    avgDividendYield: 7.0, avgRevenueGrowth: 15, count: 25,
  },
  "Healthcare": {
    sector: "Healthcare",
    avgPE: 12.0, avgPB: 2.0, avgEV_EBITDA: 8.0, avgPS: 3.0,
    avgROE: 16, avgDebtEquity: 0.8, avgGrossMargin: 50, avgNetMargin: 15,
    avgDividendYield: 5.5, avgRevenueGrowth: 18, count: 15,
  },
  "Consumer Defensive": {
    sector: "Consumer Defensive",
    avgPE: 10.0, avgPB: 1.8, avgEV_EBITDA: 7.0, avgPS: 1.5,
    avgROE: 17, avgDebtEquity: 1.2, avgGrossMargin: 30, avgNetMargin: 8,
    avgDividendYield: 7.5, avgRevenueGrowth: 10, count: 20,
  },
  "Industrials": {
    sector: "Industrials",
    avgPE: 8.0, avgPB: 1.3, avgEV_EBITDA: 5.5, avgPS: 1.0,
    avgROE: 14, avgDebtEquity: 1.5, avgGrossMargin: 22, avgNetMargin: 7,
    avgDividendYield: 8.5, avgRevenueGrowth: 9, count: 35,
  },
  "Consumer Discretionary": {
    sector: "Consumer Discretionary",
    avgPE: 11.0, avgPB: 1.6, avgEV_EBITDA: 7.5, avgPS: 1.8,
    avgROE: 13, avgDebtEquity: 2.5, avgGrossMargin: 35, avgNetMargin: 6,
    avgDividendYield: 6.0, avgRevenueGrowth: 14, count: 20,
  },
  "Utilities": {
    sector: "Utilities",
    avgPE: 10.5, avgPB: 1.4, avgEV_EBITDA: 7.0, avgPS: 2.0,
    avgROE: 15, avgDebtEquity: 3.0, avgGrossMargin: 40, avgNetMargin: 15,
    avgDividendYield: 7.0, avgRevenueGrowth: 6, count: 10,
  },
  "Energy": {
    sector: "Energy",
    avgPE: 7.0, avgPB: 1.1, avgEV_EBITDA: 4.5, avgPS: 0.8,
    avgROE: 16, avgDebtEquity: 2.0, avgGrossMargin: 28, avgNetMargin: 12,
    avgDividendYield: 9.0, avgRevenueGrowth: 5, count: 8,
  },
  "Technology": {
    sector: "Technology",
    avgPE: 15.0, avgPB: 2.5, avgEV_EBITDA: 10.0, avgPS: 4.0,
    avgROE: 20, avgDebtEquity: 0.5, avgGrossMargin: 55, avgNetMargin: 18,
    avgDividendYield: 4.0, avgRevenueGrowth: 25, count: 5,
  },
  "Communication Services": {
    sector: "Communication Services",
    avgPE: 11.0, avgPB: 1.5, avgEV_EBITDA: 6.0, avgPS: 2.2,
    avgROE: 15, avgDebtEquity: 1.8, avgGrossMargin: 42, avgNetMargin: 12,
    avgDividendYield: 6.5, avgRevenueGrowth: 11, count: 8,
  },
};

// Market-wide Egyptian averages (all sectors combined)
export const EGYPT_MARKET_AVG = {
  avgPE: 9.5,
  avgPB: 1.4,
  avgEV_EBITDA: 6.5,
  avgROE: 15,
  avgDebtEquity: 2.0,
  avgDividendYield: 7.0,
  riskFreeRate: 0.27,    // ~27% CBE overnight rate (2025)
  marketRiskPremium: 0.08, // Egypt equity risk premium
  terminalGrowth: 0.05,   // 5% long-term growth for Egypt
};

/**
 * Compute dynamic sector averages from real fundamental data.
 */
export function computeSectorAverages(
  allFundamentals: Record<string, { sector?: string } & {
    pe: number; pb: number; evEbitda: number; ps: number;
    roe: number; debtEquity: number; grossMargin: number; netMargin: number;
    dividendYield: number; revenueGrowth: number;
  }>
): Record<string, SectorBenchmark> {
  const sectorData = new Map<string, {
    pe: number[]; pb: number[]; evEbitda: number[]; ps: number[];
    roe: number[]; debtEquity: number[]; grossMargin: number[]; netMargin: number[];
    dividendYield: number[]; revenueGrowth: number[];
  }>();

  for (const [sym, f] of Object.entries(allFundamentals)) {
    if (!f.pe || f.pe <= 0 || f.pe > 200) continue; // Skip invalid P/E

    const sector = f.sector || 'Other';
    if (!sectorData.has(sector)) {
      sectorData.set(sector, {
        pe: [], pb: [], evEbitda: [], ps: [],
        roe: [], debtEquity: [], grossMargin: [], netMargin: [],
        dividendYield: [], revenueGrowth: [],
      });
    }
    const data = sectorData.get(sector)!;
    if (f.pe > 0 && f.pe < 200) data.pe.push(f.pe);
    if (f.pb > 0) data.pb.push(f.pb);
    if (f.evEbitda > 0) data.evEbitda.push(f.evEbitda);
    if (f.ps > 0) data.ps.push(f.ps);
    if (f.roe > 0 && f.roe < 100) data.roe.push(f.roe);
    if (f.debtEquity >= 0) data.debtEquity.push(f.debtEquity);
    if (f.grossMargin > 0) data.grossMargin.push(f.grossMargin);
    if (f.netMargin > 0) data.netMargin.push(f.netMargin);
    if (f.dividendYield >= 0 && f.dividendYield < 50) data.dividendYield.push(f.dividendYield);
    if (f.revenueGrowth !== 0) data.revenueGrowth.push(f.revenueGrowth);
  }

  const result: Record<string, SectorBenchmark> = { ...DEFAULT_SECTOR_BENCHMARKS };
  for (const [sector, data] of sectorData.entries()) {
    const avg = (arr: number[]) => arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
    result[sector] = {
      sector,
      avgPE: avg(data.pe) || DEFAULT_SECTOR_BENCHMARKS[sector]?.avgPE || 9.5,
      avgPB: avg(data.pb) || DEFAULT_SECTOR_BENCHMARKS[sector]?.avgPB || 1.4,
      avgEV_EBITDA: avg(data.evEbitda) || DEFAULT_SECTOR_BENCHMARKS[sector]?.avgEV_EBITDA || 6.5,
      avgPS: avg(data.ps) || DEFAULT_SECTOR_BENCHMARKS[sector]?.avgPS || 1.5,
      avgROE: avg(data.roe) || DEFAULT_SECTOR_BENCHMARKS[sector]?.avgROE || 15,
      avgDebtEquity: avg(data.debtEquity) || DEFAULT_SECTOR_BENCHMARKS[sector]?.avgDebtEquity || 2.0,
      avgGrossMargin: avg(data.grossMargin) || DEFAULT_SECTOR_BENCHMARKS[sector]?.avgGrossMargin || 30,
      avgNetMargin: avg(data.netMargin) || DEFAULT_SECTOR_BENCHMARKS[sector]?.avgNetMargin || 10,
      avgDividendYield: avg(data.dividendYield) || DEFAULT_SECTOR_BENCHMARKS[sector]?.avgDividendYield || 7,
      avgRevenueGrowth: avg(data.revenueGrowth) || DEFAULT_SECTOR_BENCHMARKS[sector]?.avgRevenueGrowth || 10,
      count: data.pe.length,
    };
  }

  return result;
}

/**
 * Get sector benchmark for a stock. Falls back to market averages.
 */
export function getSectorBenchmark(
  sector: string,
  dynamicSectors?: Record<string, SectorBenchmark>
): SectorBenchmark {
  const source = dynamicSectors || DEFAULT_SECTOR_BENCHMARKS;
  return source[sector] || source['Financials'] || {
    sector: 'Other',
    avgPE: EGYPT_MARKET_AVG.avgPE,
    avgPB: EGYPT_MARKET_AVG.avgPB,
    avgEV_EBITDA: EGYPT_MARKET_AVG.avgEV_EBITDA,
    avgPS: 1.5,
    avgROE: EGYPT_MARKET_AVG.avgROE,
    avgDebtEquity: EGYPT_MARKET_AVG.avgDebtEquity,
    avgGrossMargin: 30,
    avgNetMargin: EGYPT_MARKET_AVG.avgNetMargin,
    avgDividendYield: EGYPT_MARKET_AVG.avgDividendYield,
    avgRevenueGrowth: 10,
    count: 0,
  };
}
