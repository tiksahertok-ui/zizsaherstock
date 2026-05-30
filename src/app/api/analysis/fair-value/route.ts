import { NextRequest, NextResponse } from "next/server";
import { fetchFundamentals } from "@/lib/fundamentals";
import { calculateFairValue } from "@/lib/fair-value-engine";
import { EGX_STOCKS } from "@/lib/egx-stocks";

/**
 * GET /api/analysis/fair-value?symbol=COMI
 * Calculates fair value using 5 models for a single stock.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const symbol = searchParams.get("symbol")?.toUpperCase().trim();

    if (!symbol) {
      return NextResponse.json({ error: "symbol parameter required" }, { status: 400 });
    }

    // Fetch fundamentals for this stock + sector peers
    const sector = EGX_STOCKS.find(s => s.symbol === symbol)?.sector || 'Other';
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

    const result = calculateFairValue(f, sector);

    return NextResponse.json(result, {
      headers: { "Cache-Control": "public, max-age=300, stale-while-revalidate=60" },
    });
  } catch (error) {
    console.error("Fair value error:", error);
    return NextResponse.json({ error: "Failed to calculate fair value" }, { status: 503 });
  }
}
