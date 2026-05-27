import { NextRequest, NextResponse } from "next/server";
import { fetchQuotesLive } from "@/lib/market-data";

/**
 * /api/market-data/live — Unified real-time endpoint (1s shared cache)
 *
 * Accepts: ?symbols=COMI,HDBK,EGX30,EGX70_EWI,EGX100_EWI
 * Always includes: Gold (XAUUSD) + USD/EGP
 *
 * Client polls this every 1 second for ALL live price updates.
 * The underlying shared cache ensures TradingView is only hit once per cycle.
 *
 * Response:
 * {
 *   stocks: { COMI: { price, changePercent, changeAbs, volume }, ... },
 *   gold: { usdPrice, changePercent, changeAbs },
 *   usdEgp: { rate, changePercent, changeAbs },
 *   marketStatus: { egx, gold, globalGold, forex },
 *   timestamp: "..."
 * }
 */

// ── Market Status Helpers (holiday-aware, synced with extras route) ──

function getEgyptTime(): Date {
  return new Date(new Date().toLocaleString('en-US', { timeZone: 'Africa/Cairo' }));
}

/** Official Egyptian holidays 2025-2026 (dates when EGX/banks are closed) */
const EGYPTIAN_HOLIDAYS: Record<string, boolean> = {
  // ── 2025 ──
  "2025-01-01": true, // New Year's Day (banks)
  "2025-01-07": true, // Coptic Christmas
  "2025-01-25": true, // Jan 25 Revolution / Police Day
  "2025-03-31": true, // Eid Al-Fitr (est.)
  "2025-04-01": true, // Eid Al-Fitr Day 2
  "2025-04-02": true, // Eid Al-Fitr Day 3
  "2025-04-03": true, // Sham El-Nessim
  "2025-04-25": true, // Sinai Liberation Day
  "2025-05-01": true, // Labor Day
  "2025-06-06": true, // Eid Al-Adha (Arafat Day est.)
  "2025-06-07": true, // Eid Al-Adha Day 1
  "2025-06-08": true, // Eid Al-Adha Day 2
  "2025-06-09": true, // Eid Al-Adha Day 3
  "2025-06-27": true, // Islamic New Year (est.)
  "2025-06-30": true, // June 30 Revolution
  "2025-07-01": true, // Bank Holiday (banks only)
  "2025-07-23": true, // July 23 Revolution
  "2025-09-05": true, // Prophet's Birthday (est.)
  // ── 2026 ──
  "2026-01-01": true, // New Year's Day (banks)
  "2026-01-07": true, // Coptic Christmas
  "2026-01-29": true, // Jan 25 Revolution (observed Thu)
  "2026-03-19": true, // Eid Al-Fitr Day 1
  "2026-03-20": true, // Eid Al-Fitr Day 2
  "2026-03-21": true, // Eid Al-Fitr Day 3
  "2026-03-22": true, // Eid Al-Fitr Day 4
  "2026-03-23": true, // Eid Al-Fitr Day 5
  "2026-04-13": true, // Sham El-Nessim
  "2026-04-25": true, // Sinai Liberation Day (Sat)
  "2026-05-01": true, // Labor Day (Fri)
  "2026-05-07": true, // Labor Day Holiday
  "2026-05-26": true, // Arafat Day
  "2026-05-27": true, // Eid Al-Adha Day 1
  "2026-05-28": true, // Eid Al-Adha Day 2
  "2026-05-29": true, // Eid Al-Adha Day 3 (Fri)
  "2026-05-30": true, // Eid Al-Adha Day 4 (Sat)
  "2026-05-31": true, // Eid Al-Adha Day 5 (Sun)
  "2026-06-16": true, // Islamic New Year
  "2026-06-30": true, // June 30 Revolution
  "2026-07-01": true, // Bank Holiday (banks only)
  "2026-07-23": true, // July 23 Revolution
  "2026-08-26": true, // Prophet's Birthday (est.)
};

function isEgyptianHoliday(): boolean {
  const now = getEgyptTime();
  const dateStr = now.toISOString().split("T")[0];
  return !!EGYPTIAN_HOLIDAYS[dateStr];
}

function getMarketStatus(): {
  egx: 'live' | 'closed';
  gold: 'live' | 'closed';
  globalGold: 'live' | 'closed';
  forex: 'live' | 'closed';
} {
  const now = getEgyptTime();
  const day = now.getDay(); // 0=Sun, 1=Mon, ..., 5=Fri, 6=Sat
  const hours = now.getHours();
  const minutes = now.getMinutes();
  const t = hours * 60 + minutes; // minutes since midnight

  const holiday = isEgyptianHoliday();

  // ── EGX: Sunday–Thursday, 10:00–14:45 Egypt time ──
  // Closed: Fri, Sat, and official Egyptian holidays
  const egxLive = !holiday && day !== 5 && day !== 6 && t >= 600 && t <= 885;

  // ── Egyptian Gold Retail Market ──
  // Gold shops operate daily (traditional souks) or Sat-Thu (malls).
  // → Mark "closed" only on official Egyptian holidays.
  const goldLive = !holiday;

  // ── Global Gold / TradingView (XAUUSD) ──
  // COMEX/global forex gold: ~24h Sun 10:00 PM – Fri 10:00 PM Cairo time
  // Effectively closed on Saturday, and briefly late Friday night.
  // TradingView shows real-time during all active sessions.
  const globalGoldLive = day !== 6;

  // ── Forex / Banks: Sunday–Thursday ──
  // Closed: Fri, Sat, official holidays, and July 1 (bank holiday)
  const forexLive = !holiday && day !== 5 && day !== 6;

  return {
    egx: egxLive ? 'live' : 'closed',
    gold: goldLive ? 'live' : 'closed',
    globalGold: globalGoldLive ? 'live' : 'closed',
    forex: forexLive ? 'live' : 'closed',
  };
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const symbolsParam = searchParams.get("symbols") || "";

    // Parse requested symbols
    const requestedSymbols = symbolsParam
      .split(",")
      .map((s) => s.trim().toUpperCase())
      .filter(Boolean);

    // Always include gold + USD/EGP
    const allSymbols = [...new Set([...requestedSymbols, "XAUUSD", "USDEGP"])];

    // Fetch all symbols using shared 1s live cache
    const quotes = await fetchQuotesLive(allSymbols);

    // Build response
    const stocks: Record<string, {
      price: number;
      changePercent: number;
      changeAbs: number;
      volume: number;
    }> = {};

    let goldUsdPrice = 0;
    let goldChangePercent = 0;
    let goldChangeAbs = 0;
    let usdEgpRate = 0;
    let usdEgpChangePercent = 0;
    let usdEgpChangeAbs = 0;

    for (const [sym, q] of Object.entries(quotes)) {
      if (sym === "XAUUSD") {
        goldUsdPrice = q.close;
        goldChangePercent = q.changePercent;
        goldChangeAbs = q.changeAbs;
      } else if (sym === "USDEGP") {
        usdEgpRate = q.close;
        usdEgpChangePercent = q.changePercent;
        usdEgpChangeAbs = q.changeAbs;
      } else {
        // Regular stock/index
        stocks[sym] = {
          price: q.close,
          changePercent: q.changePercent,
          changeAbs: q.changeAbs,
          volume: q.volume,
        };
      }
    }

    return NextResponse.json({
      stocks,
      gold: {
        usdPrice: goldUsdPrice,
        changePercent: goldChangePercent,
        changeAbs: goldChangeAbs,
      },
      usdEgp: {
        rate: usdEgpRate,
        changePercent: usdEgpChangePercent,
        changeAbs: usdEgpChangeAbs,
      },
      marketStatus: getMarketStatus(),
      timestamp: new Date().toISOString(),
    }, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    console.error("Live endpoint error:", error);
    return NextResponse.json({ error: "Failed" }, { status: 503 });
  }
}
