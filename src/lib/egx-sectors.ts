/**
 * EGX Sector Benchmarks & Valuation Profiles
 * ────────────────────────────────────────────
 * Provides sector-level benchmark data and sector-specific valuation profiles
 * for use in relative valuation and fair value calculations.
 *
 * These are calibrated for the Egyptian market (EGX) based on observed data
 * patterns and CFA Institute standard valuation practices.
 *
 * Updated dynamically when fundamental data is fetched.
 */

// ── Core Sector Benchmark Interface (backward-compatible) ──────

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

// ── Sector-Specific Valuation Profile (CFA-standard) ─────────────

export interface SectorValuationProfile extends SectorBenchmark {
  // Model weights — different sectors weight models differently
  modelWeights: {
    dcf: number;       // Weight of DCF model
    relative: number;  // Weight of relative valuation
    ddm: number;       // Weight of dividend discount model
    asset: number;     // Weight of asset-based valuation
  };

  // DCF parameters per sector
  dcfParams: {
    baseGrowthRate: number;        // Default revenue growth assumption
    terminalGrowthRate: number;    // Terminal growth rate (g)
    defaultFCFMargin: number;      // Default FCF margin if not available
    capExRatio: number;            // Default CapEx/revenue ratio
    projectionYears: number;       // Number of years to project
  };

  // WACC parameters per sector
  waccParams: {
    defaultBeta: number;           // Sector average beta
    equityRiskPremium: number;     // Sector-specific ERP
    sizePremium: number;            // Size premium
    defaultDebtRatio: number;      // Typical debt/capital ratio
    costOfDebt: number;            // Typical borrowing cost
    taxRate: number;                // Effective tax rate
  };

  // Relative valuation emphasis — which multiples matter most
  relativeWeights: {
    pe: number;        // P/E weight in relative valuation
    pb: number;        // P/B weight
    evEbitda: number;  // EV/EBITDA weight
    ps: number;        // P/S weight
    peg: number;       // PEG weight (for growth sectors)
  };

  // Valuation thresholds
  thresholds: {
    undervaluedUpside: number;     // % upside to be "Undervalued" (default 15)
    overvaluedDownside: number;    // % downside to be "Overvalued" (default -15)
    highConfidenceQuality: number;  // Min data quality for "High" confidence
  };

  // Sector-specific notes
  notes: string;
}

// ── Static Sector Benchmarks (Egyptian Market Averages) ────────
// These serve as fallbacks when dynamic calculation isn't available

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
  "Utilities": {
    sector: "Utilities",
    avgPE: 10.5, avgPB: 1.4, avgEV_EBITDA: 7.0, avgPS: 2.0,
    avgROE: 15, avgDebtEquity: 3.0, avgGrossMargin: 40, avgNetMargin: 15,
    avgDividendYield: 7.0, avgRevenueGrowth: 6, count: 10,
  },
};

// ── Market-wide Egyptian averages (all sectors combined) ──────

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

// ── Sector-Specific Valuation Profiles ────────────────────────
// Full profiles with CFA-standard parameters calibrated for Egypt

export const SECTOR_VALUATION_PROFILES: Record<string, SectorValuationProfile> = {
  // ── 1. FINANCIALS (55 stocks) ──────────────────────────────
  // Banks and financial institutions. P/BV is the primary valuation metric.
  // DDM weight high due to consistent dividend streams. Banks ARE the debt
  // market, so debt ratio interpretation differs.
  "Financials": {
    sector: "Financials",
    avgPE: 8.5, avgPB: 1.2, avgEV_EBITDA: 6.5, avgPS: 2.8,
    avgROE: 18, avgDebtEquity: 4.5, avgGrossMargin: 45, avgNetMargin: 22,
    avgDividendYield: 6.5, avgRevenueGrowth: 12, count: 55,

    modelWeights: {
      dcf: 0.20,
      relative: 0.30,
      ddm: 0.30,
      asset: 0.20,
    },

    dcfParams: {
      baseGrowthRate: 0.08,
      terminalGrowthRate: 0.035,
      defaultFCFMargin: 0.15,
      capExRatio: 0.03,
      projectionYears: 5,
    },

    waccParams: {
      defaultBeta: 1.2,
      equityRiskPremium: 0.08,
      sizePremium: 0.02,
      defaultDebtRatio: 0.40,
      costOfDebt: 0.27,
      taxRate: 0.225,
    },

    relativeWeights: {
      pe: 0.20,
      pb: 0.35,
      evEbitda: 0.20,
      ps: 0.10,
      peg: 0.15,
    },

    thresholds: {
      undervaluedUpside: 15,
      overvaluedDownside: -15,
      highConfidenceQuality: 55,
    },

    notes: "Egyptian banks trade primarily on P/BV. DDM is highly relevant given stable dividend streams. High beta reflects interest rate sensitivity (CBE policy). Debt/equity ratios are inherently high for financials; interpret with caution.",
  },

  // ── 2. MATERIALS (20 stocks) ───────────────────────────────
  // Cyclical sector (cement, steel, chemicals). P/E and EV/EBITDA are key.
  // Higher DCF weight due to capital-intensive nature.
  "Materials": {
    sector: "Materials",
    avgPE: 7.5, avgPB: 1.5, avgEV_EBITDA: 5.5, avgPS: 1.2,
    avgROE: 15, avgDebtEquity: 1.8, avgGrossMargin: 25, avgNetMargin: 10,
    avgDividendYield: 8.0, avgRevenueGrowth: 8, count: 20,

    modelWeights: {
      dcf: 0.35,
      relative: 0.35,
      ddm: 0.15,
      asset: 0.15,
    },

    dcfParams: {
      baseGrowthRate: 0.06,
      terminalGrowthRate: 0.03,
      defaultFCFMargin: 0.10,
      capExRatio: 0.06,
      projectionYears: 7,
    },

    waccParams: {
      defaultBeta: 1.0,
      equityRiskPremium: 0.08,
      sizePremium: 0.03,
      defaultDebtRatio: 0.35,
      costOfDebt: 0.25,
      taxRate: 0.225,
    },

    relativeWeights: {
      pe: 0.30,
      pb: 0.20,
      evEbitda: 0.30,
      ps: 0.10,
      peg: 0.10,
    },

    thresholds: {
      undervaluedUpside: 15,
      overvaluedDownside: -15,
      highConfidenceQuality: 60,
    },

    notes: "Cyclical sector tied to construction demand and government infrastructure spending. EV/EBITDA preferred over P/E due to debt variability. Longer projection horizon captures full commodity cycle.",
  },

  // ── 3. REAL ESTATE (25 stocks) ─────────────────────────────
  // NAV-based valuation is king. P/B heavy, yield-focused (REIT-like).
  // Asset model has highest weight for NAV calculation.
  "Real Estate": {
    sector: "Real Estate",
    avgPE: 9.0, avgPB: 0.9, avgEV_EBITDA: 7.0, avgPS: 2.5,
    avgROE: 12, avgDebtEquity: 2.0, avgGrossMargin: 40, avgNetMargin: 18,
    avgDividendYield: 7.0, avgRevenueGrowth: 15, count: 25,

    modelWeights: {
      dcf: 0.25,
      relative: 0.20,
      ddm: 0.25,
      asset: 0.30,
    },

    dcfParams: {
      baseGrowthRate: 0.10,
      terminalGrowthRate: 0.04,
      defaultFCFMargin: 0.12,
      capExRatio: 0.05,
      projectionYears: 7,
    },

    waccParams: {
      defaultBeta: 0.9,
      equityRiskPremium: 0.08,
      sizePremium: 0.03,
      defaultDebtRatio: 0.45,
      costOfDebt: 0.26,
      taxRate: 0.225,
    },

    relativeWeights: {
      pe: 0.15,
      pb: 0.35,
      evEbitda: 0.20,
      ps: 0.15,
      peg: 0.15,
    },

    thresholds: {
      undervaluedUpside: 12,
      overvaluedDownside: -12,
      highConfidenceQuality: 55,
    },

    notes: "NAV-based valuation is primary for Egyptian developers: NAV = land bank + developments in progress - liabilities. P/B carries significant weight. DDM important for income-oriented investors. New Administrative Capital projects drive growth.",
  },

  // ── 4. HEALTHCARE (15 stocks) ───────────────────────────────
  // P/E and PEG focused with growth premium. Pharma and hospitals.
  // Higher growth assumptions reflect sector expansion in Egypt.
  "Healthcare": {
    sector: "Healthcare",
    avgPE: 12.0, avgPB: 2.0, avgEV_EBITDA: 8.0, avgPS: 3.0,
    avgROE: 16, avgDebtEquity: 0.8, avgGrossMargin: 50, avgNetMargin: 15,
    avgDividendYield: 5.5, avgRevenueGrowth: 18, count: 15,

    modelWeights: {
      dcf: 0.35,
      relative: 0.30,
      ddm: 0.10,
      asset: 0.25,
    },

    dcfParams: {
      baseGrowthRate: 0.12,
      terminalGrowthRate: 0.04,
      defaultFCFMargin: 0.14,
      capExRatio: 0.04,
      projectionYears: 7,
    },

    waccParams: {
      defaultBeta: 0.8,
      equityRiskPremium: 0.08,
      sizePremium: 0.03,
      defaultDebtRatio: 0.25,
      costOfDebt: 0.24,
      taxRate: 0.225,
    },

    relativeWeights: {
      pe: 0.30,
      pb: 0.15,
      evEbitda: 0.20,
      ps: 0.10,
      peg: 0.25,
    },

    thresholds: {
      undervaluedUpside: 18,
      overvaluedDownside: -18,
      highConfidenceQuality: 55,
    },

    notes: "Growth sector driven by population demographics and increasing healthcare spending. PEG ratio is particularly relevant given growth premium. Low leverage typical. Defensive characteristics in downturns.",
  },

  // ── 5. CONSUMER DEFENSIVE (20 stocks) ──────────────────────
  // Food, beverages, household products. Dividend + stability focus.
  // Balanced model weights reflecting stable, predictable cash flows.
  "Consumer Defensive": {
    sector: "Consumer Defensive",
    avgPE: 10.0, avgPB: 1.8, avgEV_EBITDA: 7.0, avgPS: 1.5,
    avgROE: 17, avgDebtEquity: 1.2, avgGrossMargin: 30, avgNetMargin: 8,
    avgDividendYield: 7.5, avgRevenueGrowth: 10, count: 20,

    modelWeights: {
      dcf: 0.25,
      relative: 0.25,
      ddm: 0.25,
      asset: 0.25,
    },

    dcfParams: {
      baseGrowthRate: 0.08,
      terminalGrowthRate: 0.04,
      defaultFCFMargin: 0.10,
      capExRatio: 0.04,
      projectionYears: 6,
    },

    waccParams: {
      defaultBeta: 0.7,
      equityRiskPremium: 0.07,
      sizePremium: 0.02,
      defaultDebtRatio: 0.30,
      costOfDebt: 0.24,
      taxRate: 0.225,
    },

    relativeWeights: {
      pe: 0.30,
      pb: 0.20,
      evEbitda: 0.20,
      ps: 0.15,
      peg: 0.15,
    },

    thresholds: {
      undervaluedUpside: 15,
      overvaluedDownside: -15,
      highConfidenceQuality: 60,
    },

    notes: "Stable demand regardless of economic conditions. Inflation-linked pricing power is a key advantage in Egypt. DDM is important — many consumer staples companies have long dividend histories. Balanced approach across all models.",
  },

  // ── 6. INDUSTRIALS (35 stocks) ──────────────────────────────
  // Diversified industrials. EV/EBITDA + P/E focused.
  // Capital-intensive with moderate growth.
  "Industrials": {
    sector: "Industrials",
    avgPE: 8.0, avgPB: 1.3, avgEV_EBITDA: 5.5, avgPS: 1.0,
    avgROE: 14, avgDebtEquity: 1.5, avgGrossMargin: 22, avgNetMargin: 7,
    avgDividendYield: 8.5, avgRevenueGrowth: 9, count: 35,

    modelWeights: {
      dcf: 0.35,
      relative: 0.35,
      ddm: 0.15,
      asset: 0.15,
    },

    dcfParams: {
      baseGrowthRate: 0.07,
      terminalGrowthRate: 0.035,
      defaultFCFMargin: 0.09,
      capExRatio: 0.05,
      projectionYears: 7,
    },

    waccParams: {
      defaultBeta: 1.0,
      equityRiskPremium: 0.08,
      sizePremium: 0.03,
      defaultDebtRatio: 0.35,
      costOfDebt: 0.25,
      taxRate: 0.225,
    },

    relativeWeights: {
      pe: 0.25,
      pb: 0.20,
      evEbitda: 0.30,
      ps: 0.15,
      peg: 0.10,
    },

    thresholds: {
      undervaluedUpside: 15,
      overvaluedDownside: -15,
      highConfidenceQuality: 60,
    },

    notes: "Broad sector including engineering, transport, and manufacturing. EV/EBITDA preferred due to capital structure variability. Tied to government infrastructure spending and private investment cycles. Longer projection horizon for CapEx-heavy businesses.",
  },

  // ── 7. CONSUMER DISCRETIONARY (20 stocks) ───────────────────
  // Retail, autos, luxury, entertainment. P/S + growth focused.
  // Higher DCF weight for growth, lower DDM.
  "Consumer Discretionary": {
    sector: "Consumer Discretionary",
    avgPE: 11.0, avgPB: 1.6, avgEV_EBITDA: 7.5, avgPS: 1.8,
    avgROE: 13, avgDebtEquity: 2.5, avgGrossMargin: 35, avgNetMargin: 6,
    avgDividendYield: 6.0, avgRevenueGrowth: 14, count: 20,

    modelWeights: {
      dcf: 0.30,
      relative: 0.35,
      ddm: 0.10,
      asset: 0.25,
    },

    dcfParams: {
      baseGrowthRate: 0.10,
      terminalGrowthRate: 0.04,
      defaultFCFMargin: 0.08,
      capExRatio: 0.04,
      projectionYears: 6,
    },

    waccParams: {
      defaultBeta: 1.1,
      equityRiskPremium: 0.08,
      sizePremium: 0.03,
      defaultDebtRatio: 0.35,
      costOfDebt: 0.25,
      taxRate: 0.225,
    },

    relativeWeights: {
      pe: 0.20,
      pb: 0.15,
      evEbitda: 0.20,
      ps: 0.25,
      peg: 0.20,
    },

    thresholds: {
      undervaluedUpside: 15,
      overvaluedDownside: -15,
      highConfidenceQuality: 55,
    },

    notes: "Highly sensitive to consumer confidence and purchasing power. P/S is useful given margin variability. Growth tied to Egypt's expanding middle class and urbanization. Moderate leverage for expansion.",
  },

  // ── 8. TECHNOLOGY (5 stocks) ────────────────────────────────
  // Software, IT services, fintech. P/S + PEG + DCF (growth-focused).
  // Highest DCF weight and highest growth assumptions.
  "Technology": {
    sector: "Technology",
    avgPE: 15.0, avgPB: 2.5, avgEV_EBITDA: 10.0, avgPS: 4.0,
    avgROE: 20, avgDebtEquity: 0.5, avgGrossMargin: 55, avgNetMargin: 18,
    avgDividendYield: 4.0, avgRevenueGrowth: 25, count: 5,

    modelWeights: {
      dcf: 0.40,
      relative: 0.30,
      ddm: 0.05,
      asset: 0.25,
    },

    dcfParams: {
      baseGrowthRate: 0.18,
      terminalGrowthRate: 0.05,
      defaultFCFMargin: 0.18,
      capExRatio: 0.03,
      projectionYears: 7,
    },

    waccParams: {
      defaultBeta: 1.3,
      equityRiskPremium: 0.09,
      sizePremium: 0.04,
      defaultDebtRatio: 0.15,
      costOfDebt: 0.23,
      taxRate: 0.225,
    },

    relativeWeights: {
      pe: 0.20,
      pb: 0.10,
      evEbitda: 0.15,
      ps: 0.20,
      peg: 0.35,
    },

    thresholds: {
      undervaluedUpside: 20,
      overvaluedDownside: -20,
      highConfidenceQuality: 45,
    },

    notes: "Small but growing sector on EGX. PEG ratio is critical for growth stocks. Highest growth assumptions reflect sector expansion potential. Low DDM weight — most tech companies reinvest rather than pay dividends. Higher size premium reflects small-cap risk.",
  },

  // ── 9. ENERGY (8 stocks) ────────────────────────────────────
  // Oil & gas, utilities. EV/EBITDA + dividend yield focus.
  "Energy": {
    sector: "Energy",
    avgPE: 7.0, avgPB: 1.1, avgEV_EBITDA: 4.5, avgPS: 0.8,
    avgROE: 16, avgDebtEquity: 2.0, avgGrossMargin: 28, avgNetMargin: 12,
    avgDividendYield: 9.0, avgRevenueGrowth: 5, count: 8,

    modelWeights: {
      dcf: 0.30,
      relative: 0.30,
      ddm: 0.20,
      asset: 0.20,
    },

    dcfParams: {
      baseGrowthRate: 0.05,
      terminalGrowthRate: 0.03,
      defaultFCFMargin: 0.12,
      capExRatio: 0.08,
      projectionYears: 7,
    },

    waccParams: {
      defaultBeta: 1.1,
      equityRiskPremium: 0.08,
      sizePremium: 0.03,
      defaultDebtRatio: 0.40,
      costOfDebt: 0.26,
      taxRate: 0.225,
    },

    relativeWeights: {
      pe: 0.15,
      pb: 0.20,
      evEbitda: 0.30,
      ps: 0.20,
      peg: 0.15,
    },

    thresholds: {
      undervaluedUpside: 12,
      overvaluedDownside: -12,
      highConfidenceQuality: 55,
    },

    notes: "Commodity-linked sector with high dividend yields. EV/EBITDA preferred given capital structure complexity. Lower growth assumptions but stable cash flows. Government-regulated pricing affects margins. Higher CapEx ratio reflects exploration/production spending.",
  },

  // ── 10. COMMUNICATION SERVICES (8 stocks) ──────────────────
  // Telecom, media. Similar to technology but more stable.
  "Communication Services": {
    sector: "Communication Services",
    avgPE: 11.0, avgPB: 1.5, avgEV_EBITDA: 6.0, avgPS: 2.2,
    avgROE: 15, avgDebtEquity: 1.8, avgGrossMargin: 42, avgNetMargin: 12,
    avgDividendYield: 6.5, avgRevenueGrowth: 11, count: 8,

    modelWeights: {
      dcf: 0.30,
      relative: 0.30,
      ddm: 0.15,
      asset: 0.25,
    },

    dcfParams: {
      baseGrowthRate: 0.09,
      terminalGrowthRate: 0.04,
      defaultFCFMargin: 0.15,
      capExRatio: 0.10,
      projectionYears: 6,
    },

    waccParams: {
      defaultBeta: 0.9,
      equityRiskPremium: 0.08,
      sizePremium: 0.03,
      defaultDebtRatio: 0.40,
      costOfDebt: 0.25,
      taxRate: 0.225,
    },

    relativeWeights: {
      pe: 0.25,
      pb: 0.15,
      evEbitda: 0.25,
      ps: 0.20,
      peg: 0.15,
    },

    thresholds: {
      undervaluedUpside: 15,
      overvaluedDownside: -15,
      highConfidenceQuality: 55,
    },

    notes: "Dominant telecom operators have near-monopoly characteristics. High CapEx requirements for network expansion. Moderate growth driven by data services and mobile penetration. DDM relevant for established operators with stable dividends.",
  },

  // ── UTILITIES (10 stocks) ──────────────────────────────────
  "Utilities": {
    sector: "Utilities",
    avgPE: 10.5, avgPB: 1.4, avgEV_EBITDA: 7.0, avgPS: 2.0,
    avgROE: 15, avgDebtEquity: 3.0, avgGrossMargin: 40, avgNetMargin: 15,
    avgDividendYield: 7.0, avgRevenueGrowth: 6, count: 10,

    modelWeights: {
      dcf: 0.25,
      relative: 0.25,
      ddm: 0.30,
      asset: 0.20,
    },

    dcfParams: {
      baseGrowthRate: 0.05,
      terminalGrowthRate: 0.035,
      defaultFCFMargin: 0.13,
      capExRatio: 0.07,
      projectionYears: 7,
    },

    waccParams: {
      defaultBeta: 0.7,
      equityRiskPremium: 0.07,
      sizePremium: 0.02,
      defaultDebtRatio: 0.50,
      costOfDebt: 0.25,
      taxRate: 0.225,
    },

    relativeWeights: {
      pe: 0.25,
      pb: 0.20,
      evEbitda: 0.20,
      ps: 0.15,
      peg: 0.20,
    },

    thresholds: {
      undervaluedUpside: 12,
      overvaluedDownside: -12,
      highConfidenceQuality: 55,
    },

    notes: "Regulated sector with stable cash flows. Government-regulated tariffs limit pricing power but provide revenue stability. High debt ratio typical for infrastructure. DDM relevant for regulated yield stocks.",
  },
};

// ── Default Profile (for unknown sectors) ──────────────────────

const DEFAULT_VALUATION_PROFILE: SectorValuationProfile = {
  sector: "Other",
  avgPE: EGYPT_MARKET_AVG.avgPE,
  avgPB: EGYPT_MARKET_AVG.avgPB,
  avgEV_EBITDA: EGYPT_MARKET_AVG.avgEV_EBITDA,
  avgPS: 1.5,
  avgROE: EGYPT_MARKET_AVG.avgROE,
  avgDebtEquity: EGYPT_MARKET_AVG.avgDebtEquity,
  avgGrossMargin: 30,
  avgNetMargin: 10,
  avgDividendYield: EGYPT_MARKET_AVG.avgDividendYield,
  avgRevenueGrowth: 10,
  count: 0,

  modelWeights: { dcf: 0.35, relative: 0.30, ddm: 0.15, asset: 0.20 },
  dcfParams: {
    baseGrowthRate: 0.08,
    terminalGrowthRate: 0.04,
    defaultFCFMargin: 0.10,
    capExRatio: 0.05,
    projectionYears: 5,
  },
  waccParams: {
    defaultBeta: 1.0,
    equityRiskPremium: 0.08,
    sizePremium: 0.03,
    defaultDebtRatio: 0.30,
    costOfDebt: 0.25,
    taxRate: 0.225,
  },
  relativeWeights: { pe: 0.30, pb: 0.25, evEbitda: 0.25, ps: 0.10, peg: 0.10 },
  thresholds: {
    undervaluedUpside: 15,
    overvaluedDownside: -15,
    highConfidenceQuality: 60,
  },
  notes: "Default profile for unclassified sectors. Uses balanced model weights with moderate growth and market-average multiples.",
};

// ── Helper Functions ────────────────────────────────────────────

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
    avgNetMargin: 10,
    avgDividendYield: EGYPT_MARKET_AVG.avgDividendYield,
    avgRevenueGrowth: 10,
    count: 0,
  };
}

/**
 * Get full sector valuation profile including CFA-standard parameters.
 * Falls back to the DEFAULT_VALUATION_PROFILE for unknown sectors.
 */
export function getSectorValuationProfile(
  sector: string,
  dynamicSectors?: Record<string, SectorBenchmark>
): SectorValuationProfile {
  // First check if we have a static profile
  const staticProfile = SECTOR_VALUATION_PROFILES[sector];
  if (staticProfile) {
    // If dynamic benchmarks are available, overlay the computed averages
    // while keeping the sector-specific structural parameters
    if (dynamicSectors && dynamicSectors[sector]) {
      const dynamic = dynamicSectors[sector];
      return {
        ...staticProfile,
        avgPE: dynamic.avgPE,
        avgPB: dynamic.avgPB,
        avgEV_EBITDA: dynamic.avgEV_EBITDA,
        avgPS: dynamic.avgPS,
        avgROE: dynamic.avgROE,
        avgDebtEquity: dynamic.avgDebtEquity,
        avgGrossMargin: dynamic.avgGrossMargin,
        avgNetMargin: dynamic.avgNetMargin,
        avgDividendYield: dynamic.avgDividendYield,
        avgRevenueGrowth: dynamic.avgRevenueGrowth,
        count: dynamic.count,
      };
    }
    return staticProfile;
  }

  // For unknown sectors, build a profile from defaults + any dynamic data
  const bench = getSectorBenchmark(sector, dynamicSectors);
  return {
    ...DEFAULT_VALUATION_PROFILE,
    sector,
    avgPE: bench.avgPE,
    avgPB: bench.avgPB,
    avgEV_EBITDA: bench.avgEV_EBITDA,
    avgPS: bench.avgPS,
    avgROE: bench.avgROE,
    avgDebtEquity: bench.avgDebtEquity,
    avgGrossMargin: bench.avgGrossMargin,
    avgNetMargin: bench.avgNetMargin,
    avgDividendYield: bench.avgDividendYield,
    avgRevenueGrowth: bench.avgRevenueGrowth,
    count: bench.count,
  };
}
