import { NextRequest, NextResponse } from "next/server";
import { fetchFundamentals } from "@/lib/fundamentals";

/**
 * GET /api/analysis/fundamentals?symbols=COMI,TMGH,EMFD
 * Returns fundamental data for requested EGX stocks.
 * 5-minute server cache.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const symbolsParam = searchParams.get("symbols");

    if (!symbolsParam) {
      return NextResponse.json({ error: "symbols parameter required" }, { status: 400 });
    }

    const symbols = symbolsParam.split(",").map((s) => s.trim().toUpperCase()).filter(Boolean);
    if (symbols.length === 0) {
      return NextResponse.json({ error: "at least 1 symbol required" }, { status: 400 });
    }

    if (symbols.length > 50) {
      return NextResponse.json({ error: "max 50 symbols per request" }, { status: 400 });
    }

    const data = await fetchFundamentals(symbols);

    return NextResponse.json(data, {
      headers: { "Cache-Control": "public, max-age=300, stale-while-revalidate=60" },
    });
  } catch (error) {
    console.error("Fundamentals error:", error);
    return NextResponse.json({ error: "Failed to fetch fundamentals" }, { status: 503 });
  }
}
