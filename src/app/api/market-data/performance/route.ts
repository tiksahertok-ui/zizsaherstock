import { NextRequest, NextResponse } from "next/server";
import { fetchPerformance } from "@/lib/market-data";

// GET /api/market-data/performance?symbols=COMI,TMGH,EGX30,EGX70_EWI,EGX100_EWI
// Returns real period performance data for the given symbols
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const symbolsParam = searchParams.get("symbols");

    if (!symbolsParam) {
      return NextResponse.json(
        { error: "symbols query parameter is required" },
        { status: 400 }
      );
    }

    const symbols = symbolsParam
      .split(",")
      .map((s) => s.trim().toUpperCase())
      .filter(Boolean);

    if (symbols.length === 0) {
      return NextResponse.json(
        { error: "at least one symbol is required" },
        { status: 400 }
      );
    }

    const perfData = await fetchPerformance(symbols);

    return NextResponse.json(perfData);
  } catch (error) {
    console.error("Error fetching performance:", error);
    return NextResponse.json(
      { error: "Failed to fetch performance data" },
      { status: 503 }
    );
  }
}
