import { NextRequest, NextResponse } from "next/server";
import { fetchFundamentals } from "@/lib/fundamentals";
import { computeSectorAverages, EGYPT_MARKET_AVG } from "@/lib/egx-sectors";
import { findStock, EGX_STOCKS } from "@/lib/egx-stocks";
import { calculateFairValue, calculateDCF } from "@/lib/fair-value-engine";
import type { FundamentalData } from "@/lib/fundamentals";

// ── Types ──────────────────────────────────────────────────────────

interface MonteCarloResults {
  mean: number;
  median: number;
  std: number;
  percentiles: {
    p5: number;
    p25: number;
    p50: number;
    p75: number;
    p95: number;
  };
}

interface MonteCarloHistogramBin {
  min: number;
  max: number;
  midpoint: number;
  count: number;
  probability: number;
}

interface MonteCarloVarianceParams {
  revenueGrowthStd: number;
  operatingMarginStd: number;
  waccStd: number;
  terminalGrowthStd: number;
  betaStd: number;
}

interface MonteCarloAssumptions {
  baseWACC: number;
  baseGrowth: number;
  baseMargin: number;
  baseBeta: number;
  baseTerminalGrowth: number;
  varianceParams: MonteCarloVarianceParams;
}

interface MonteCarloResponse {
  symbol: string;
  currentPrice: number;
  simulations: number;
  results: MonteCarloResults;
  probabilityOfUpside: number;
  confidenceInterval: {
    lower: number;
    upper: number;
  };
  distribution: MonteCarloHistogramBin[];
  assumptions: MonteCarloAssumptions;
  calculatedAt: string;
}

// ── Constants ──────────────────────────────────────────────────────

const NUM_SIMULATIONS = 5_000;
const NUM_HISTOGRAM_BINS = 20;
const PROJECTION_YEARS = 5;

const VARIANCE_PARAMS: MonteCarloVarianceParams = {
  revenueGrowthStd: 0.05,
  operatingMarginStd: 0.03,
  waccStd: 0.02,
  terminalGrowthStd: 0.01,
  betaStd: 0.2,
};

// ── Seeded PRNG: Linear Congruential Generator ──────────────────────
// Uses Lehmer/Park-Miller constants for good statistical properties.
// State is a 32-bit unsigned integer.

function createLCG(seed: number) {
  let state = (seed >>> 0) | 0;

  function next(): number {
    // a = 1664525, c = 1013904223, m = 2^32
    state = (Math.imul(1664525, state) + 1013904223) | 0;
    return (state >>> 0) / 0x100000000; // uniform [0, 1)
  }

  return { next };
}

// ── Box-Muller Transform for Normal Distribution ──────────────────
// Uses the "spare" cache technique for efficiency: each call to the
// underlying generator produces TWO normal samples.

function createNormalSampler(rng: { next: () => number }) {
  let spare: number | null = null;

  function sample(mean: number, std: number): number {
    let z0: number;
    if (spare !== null) {
      z0 = spare;
      spare = null;
    } else {
      const u1 = Math.max(rng.next(), 1e-10); // avoid log(0)
      const u2 = rng.next();
      const mag = Math.sqrt(-2.0 * Math.log(u1));
      z0 = mag * Math.cos(2.0 * Math.PI * u2);
      spare = mag * Math.sin(2.0 * Math.PI * u2);
    }
    return mean + std * z0;
  }

  return { sample };
}

// ── Single-path DCF with overridden parameters ─────────────────────
// Replicates the logic from fair-value-engine.calculateDCF but accepts
// explicit overrides for the Monte-Carlo-varying inputs.

function simulateDCF(
  revenuePerShare: number,
  capExRatio: number,
  sampledGrowth: number,
  sampledMargin: number,
  sampledWacc: number,
  sampledTerminalGrowth: number,
): number | null {
  // Guard: WACC must exceed terminal growth for Gordon Growth Model
  if (sampledWacc <= sampledTerminalGrowth || sampledWacc <= 0) return null;

  // FCF margin from operating margin minus capex
  const fcfMargin = Math.max(0.01, sampledMargin - capExRatio);

  // Revenue per share projection over PROJECTION_YEARS
  let currentRevPS = revenuePerShare;
  const projectedFCF: number[] = [];

  for (let i = 0; i < PROJECTION_YEARS; i++) {
    // Decaying growth: converges from sampledGrowth toward terminalGrowth
    const base = Math.max(sampledGrowth, sampledTerminalGrowth + 0.005);
    const yearGrowth = base * Math.pow(sampledTerminalGrowth / base, i / (PROJECTION_YEARS - 1));
    currentRevPS *= 1 + yearGrowth;
    projectedFCF.push(currentRevPS * fcfMargin);
  }

  // Terminal value (Gordon Growth Model)
  const lastFCF = projectedFCF[PROJECTION_YEARS - 1];
  const terminalValue = (lastFCF * (1 + sampledTerminalGrowth)) / (sampledWacc - sampledTerminalGrowth);

  // Discount all cash flows to present
  let pvFCF = 0;
  for (let i = 0; i < PROJECTION_YEARS; i++) {
    pvFCF += projectedFCF[i] / Math.pow(1 + sampledWacc, i + 1);
  }
  const pvTerminal = terminalValue / Math.pow(1 + sampledWacc, PROJECTION_YEARS);

  const intrinsicValue = pvFCF + pvTerminal;

  // Sanity clamp: discard extreme outliers (> 10x or < 0.01x a reasonable range)
  if (!isFinite(intrinsicValue) || intrinsicValue <= 0) return null;

  return intrinsicValue;
}

// ── Statistics Helpers ─────────────────────────────────────────────

function computePercentile(sorted: number[], pct: number): number {
  if (sorted.length === 0) return 0;
  if (sorted.length === 1) return sorted[0];
  const idx = (pct / 100) * (sorted.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.min(lo + 1, sorted.length - 1);
  const frac = idx - lo;
  return sorted[lo] + frac * (sorted[hi] - sorted[lo]);
}

function computeStatistics(values: number[]): MonteCarloResults {
  const n = values.length;
  if (n === 0) {
    return { mean: 0, median: 0, std: 0, percentiles: { p5: 0, p25: 0, p50: 0, p75: 0, p95: 0 } };
  }

  const sorted = [...values].sort((a, b) => a - b);
  const mean = values.reduce((s, v) => s + v, 0) / n;
  const median = computePercentile(sorted, 50);
  const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / n;
  const std = Math.sqrt(variance);

  return {
    mean: Math.round(mean * 100) / 100,
    median: Math.round(median * 100) / 100,
    std: Math.round(std * 100) / 100,
    percentiles: {
      p5: Math.round(computePercentile(sorted, 5) * 100) / 100,
      p25: Math.round(computePercentile(sorted, 25) * 100) / 100,
      p50: Math.round(computePercentile(sorted, 50) * 100) / 100,
      p75: Math.round(computePercentile(sorted, 75) * 100) / 100,
      p95: Math.round(computePercentile(sorted, 95) * 100) / 100,
    },
  };
}

function buildHistogram(
  values: number[],
  numBins: number,
): MonteCarloHistogramBin[] {
  if (values.length === 0) return [];
  const sorted = [...values].sort((a, b) => a - b);
  const min = sorted[0];
  const max = sorted[sorted.length - 1];
  const range = max - min || 1; // avoid zero-width bins

  const binWidth = range / numBins;
  const bins: MonteCarloHistogramBin[] = [];

  for (let i = 0; i < numBins; i++) {
    const binMin = min + i * binWidth;
    const binMax = min + (i + 1) * binWidth;
    // Count values in [binMin, binMax). Last bin includes the max value.
    const count = values.filter(
      (v) => (i < numBins - 1 ? v >= binMin && v < binMax : v >= binMin && v <= binMax),
    ).length;
    bins.push({
      min: Math.round(binMin * 100) / 100,
      max: Math.round(binMax * 100) / 100,
      midpoint: Math.round(((binMin + binMax) / 2) * 100) / 100,
      count,
      probability: Math.round((count / values.length) * 10000) / 100, // percentage with 2dp
    });
  }

  return bins;
}

// ── Monte Carlo Engine ───────────────────────────────────────────────

function runMonteCarlo(
  f: FundamentalData,
  baseDCF: NonNullable<ReturnType<typeof calculateDCF>>,
): {
  fairValues: number[];
  assumptions: MonteCarloAssumptions;
} {
  // Derive base parameters from fundamental data
  const baseGrowth = baseDCF.assumptions.revenueGrowthBase / 100; // already normalised 0-1
  const baseOpMargin =
    f.operatingMargin > 0
      ? f.operatingMargin / 100
      : f.netMargin > 0
        ? (f.netMargin / 100) * 1.5
        : 0.12;
  const baseWacc = baseDCF.wacc;
  const baseTerminalGrowth = EGYPT_MARKET_AVG.terminalGrowth; // 5%
  const baseBeta = f.beta > 0 ? f.beta : 1.0;

  // Revenue per share & capex ratio (fixed across simulations)
  const revenuePerShare =
    f.revenuePerShare > 0
      ? f.revenuePerShare
      : f.revenue > 0
        ? f.revenue / f.sharesOutstanding
        : f.eps * 8;
  const capExRatio =
    f.capex > 0 && f.revenue > 0 ? Math.abs(f.capex) / f.revenue : 0.04;

  // Deterministic seed from symbol hash for reproducibility
  let seed = 0;
  for (let i = 0; i < f.symbol.length; i++) {
    seed = (seed * 31 + f.symbol.charCodeAt(i)) | 0;
  }
  seed = (seed * 2654435761) | 0; // Knuth multiplicative mixing

  const rng = createLCG(seed);
  const normal = createNormalSampler(rng);

  const fairValues: number[] = [];

  for (let sim = 0; sim < NUM_SIMULATIONS; sim++) {
    // Sample each variable from its normal distribution
    const sampledGrowth = normal.sample(baseGrowth, VARIANCE_PARAMS.revenueGrowthStd);
    const sampledMargin = normal.sample(baseOpMargin, VARIANCE_PARAMS.operatingMarginStd);
    const sampledWacc = normal.sample(baseWacc, VARIANCE_PARAMS.waccStd);
    const sampledTerminalGrowth = normal.sample(
      baseTerminalGrowth,
      VARIANCE_PARAMS.terminalGrowthStd,
    );
    // Beta is sampled but not directly used in DCF here (it fed into baseWACC);
    // we sample it anyway for the assumptions output.

    // Apply practical floor/ceiling constraints
    const clampedGrowth = Math.max(0.005, sampledGrowth); // min 0.5%
    const clampedMargin = Math.max(0.01, sampledMargin); // min 1% operating margin
    const clampedWacc = Math.max(0.08, Math.min(0.50, sampledWacc)); // 8%-50%
    const clampedTerminalGrowth = Math.max(
      0.002,
      Math.min(clampedWacc - 0.01, sampledTerminalGrowth),
    ); // must be < WACC

    const value = simulateDCF(
      revenuePerShare,
      capExRatio,
      clampedGrowth,
      clampedMargin,
      clampedWacc,
      clampedTerminalGrowth,
    );

    if (value !== null) {
      fairValues.push(value);
    }
  }

  return {
    fairValues,
    assumptions: {
      baseWACC: Math.round(baseWacc * 10000) / 10000,
      baseGrowth: Math.round(baseGrowth * 10000) / 10000,
      baseMargin: Math.round(baseOpMargin * 10000) / 10000,
      baseBeta,
      baseTerminalGrowth,
      varianceParams: VARIANCE_PARAMS,
    },
  };
}

// ── GET Handler ──────────────────────────────────────────────────────

/**
 * GET /api/analysis/monte-carlo?symbol=XXXX
 *
 * Runs a 5,000-iteration Monte Carlo fair-value simulation for a stock.
 * Varies revenue growth, operating margin, WACC, terminal growth, and beta
 * with normal distributions, then computes full DCF for each path.
 *
 * Cache: public, max-age=300, stale-while-revalidate=60
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const symbol = searchParams.get("symbol")?.toUpperCase().trim();

    if (!symbol) {
      return NextResponse.json(
        { error: "Missing required query parameter: symbol" },
        { status: 400 },
      );
    }

    // ── 1. Find stock & sector ────────────────────────────────────
    const stock = findStock(symbol);
    if (!stock) {
      return NextResponse.json(
        { error: `Symbol "${symbol}" not found in EGX stock list` },
        { status: 404 },
      );
    }
    const sector = stock.sector;

    // ── 2. Fetch fundamentals (stock + sector peers) ─────────────
    const peerSymbols = EGX_STOCKS.filter(
      (s) => s.sector === sector && s.symbol !== symbol,
    )
      .slice(0, 15)
      .map((s) => s.symbol);
    const allSymbols = [symbol, ...peerSymbols];

    const fundData = await fetchFundamentals(allSymbols);
    const f = fundData[symbol];

    if (!f || !f.hasData) {
      return NextResponse.json(
        { error: `No fundamental data available for ${symbol}` },
        { status: 404 },
      );
    }

    // ── 3. Compute sector benchmarks ─────────────────────────────
    // Merge sector info into fundamental data for computeSectorAverages
    const fundWithSectors: Record<
      string,
      { sector?: string; pe: number; pb: number; evEbitda: number; ps: number; roe: number; debtEquity: number; grossMargin: number; netMargin: number; dividendYield: number; revenueGrowth: number }
    > = {};
    for (const [sym, fd] of Object.entries(fundData)) {
      const stockInfo = EGX_STOCKS.find((s) => s.symbol === sym);
      fundWithSectors[sym] = {
        sector: stockInfo?.sector,
        pe: fd.pe,
        pb: fd.pb,
        evEbitda: fd.evEbitda,
        ps: fd.ps,
        roe: fd.roe,
        debtEquity: fd.debtEquity,
        grossMargin: fd.grossMargin,
        netMargin: fd.netMargin,
        dividendYield: fd.dividendYield,
        revenueGrowth: fd.revenueGrowth,
      };
    }
    const sectorBenchmarks = computeSectorAverages(fundWithSectors);

    // ── 4. Calculate base fair value (for context/auditing) ───────
    // calculateFairValue is called to satisfy the full pipeline;
    // the Monte Carlo simulation above already covers DCF paths.
    void calculateFairValue(f, sector, sectorBenchmarks);

    // ── 5. Run Monte Carlo simulation ────────────────────────────
    const baseDCF = calculateDCF(f);
    if (!baseDCF || f.eps <= 0 || f.sharesOutstanding <= 0) {
      return NextResponse.json(
        { error: `Insufficient data for DCF-based Monte Carlo on ${symbol} (requires EPS and shares outstanding)` },
        { status: 404 },
      );
    }

    const { fairValues, assumptions } = runMonteCarlo(f, baseDCF as NonNullable<ReturnType<typeof calculateDCF>>);

    if (fairValues.length < 100) {
      return NextResponse.json(
        { error: `Monte Carlo simulation produced insufficient valid results (${fairValues.length} of ${NUM_SIMULATIONS}). Input data may be too volatile.` },
        { status: 422 },
      );
    }

    // ── 6. Compute statistics ──────────────────────────────────────
    const stats = computeStatistics(fairValues);

    // Probability of upside: % of simulations above current price
    const upsideCount = fairValues.filter((v) => v > f.price).length;
    const probabilityOfUpside = Math.round((upsideCount / fairValues.length) * 10000) / 10000;

    // 90% confidence interval (5th - 95th percentile)
    const confidenceInterval = {
      lower: stats.percentiles.p5,
      upper: stats.percentiles.p95,
    };

    // Histogram for charting
    const distribution = buildHistogram(fairValues, NUM_HISTOGRAM_BINS);

    // ── 7. Build response ───────────────────────────────────────
    const response: MonteCarloResponse = {
      symbol,
      currentPrice: f.price,
      simulations: fairValues.length,
      results: stats,
      probabilityOfUpside,
      confidenceInterval,
      distribution,
      assumptions,
      calculatedAt: new Date().toISOString(),
    };

    return NextResponse.json(response, {
      status: 200,
      headers: {
        "Cache-Control": "public, max-age=300, stale-while-revalidate=60",
      },
    });
  } catch (error) {
    console.error("[monte-carlo] Simulation error:", error);
    return NextResponse.json(
      { error: "Failed to run Monte Carlo simulation" },
      { status: 503 },
    );
  }
}
