import { NextResponse } from "next/server";

// ── Singleton z-ai-web-dev-sdk instance (prevents memory leaks) ──
let zaiInstance: any = null;
async function getZai() {
  if (!zaiInstance) {
    const ZAI = await import("z-ai-web-dev-sdk").then((m) => m.default || m);
    zaiInstance = await ZAI.create();
  }
  return zaiInstance;
}

// ── In-memory rate history for USD/EGP change tracking ──
const rateHistory: Map<string, number> = new Map();

// ── In-memory EGP gold price history (per karat + ounce + pound) ──
// Stores the FIRST price seen each day as the "open" reference.
// Map key: "DATE:k24" -> 7714, "DATE:k21" -> 6750, etc.
const goldEgpHistory: Map<string, number> = new Map();
let goldEgpHistoryDate = ""; // Track which date is stored, reset on new day

/**
 * Track EGP gold price — stores the first price of the day as reference.
 * Returns { changeAbs, changePercent } compared to today's open price,
 * or yesterday's closing price if we have it.
 */
function trackGoldEgpChange(
  key: string,
  currentPrice: number
): { changeAbs: number; changePercent: number } {
  const today = getTodayStr();
  const fullKey = `${today}:${key}`;

  // Reset history on new day
  if (goldEgpHistoryDate !== today) {
    if (goldEgpHistoryDate) {
      // New day started — clear old data
      goldEgpHistory.clear();
    }
    goldEgpHistoryDate = today;
  }

  const prevPrice = goldEgpHistory.get(fullKey);

  // Store first price of the day as reference
  if (!prevPrice && currentPrice > 0) {
    goldEgpHistory.set(fullKey, currentPrice);
    return { changeAbs: 0, changePercent: 0 };
  }

  if (prevPrice > 0 && currentPrice > 0) {
    const changeAbs = Math.round((currentPrice - prevPrice) * 100) / 100;
    const changePercent = Math.round((changeAbs / prevPrice) * 10000) / 100;
    return { changeAbs, changePercent };
  }

  return { changeAbs: 0, changePercent: 0 };
}

function toNum(v: number | string | null | undefined): number {
  if (v == null) return 0;
  const x = typeof v === "string" ? parseFloat(v.replace(/,/g, "")) : v;
  return isFinite(x) ? x : 0;
}

function getTodayStr(): string {
  return new Date().toISOString().split("T")[0];
}

/**
 * SOURCE 1 (Primary): TradingView — fast, real-time
 * Uses the shared 5s live cache from market-data.ts
 */
async function fetchFromTradingView(): Promise<{
  goldUsdPerOz: number;
  goldOpenUsdPerOz: number;
  goldChangePercent: number;
  goldChangeAbs: number;
  usdEgp: number;
  usdEgpOpen: number;
  usdEgpChangePercent: number;
  usdEgpChangeAbs: number;
}> {
  try {
    const { fetchQuotesLive } = await import("@/lib/market-data");
    const quotes = await fetchQuotesLive(["XAUUSD", "USDEGP"]);

    const gold = quotes["XAUUSD"];
    const usdEgp = quotes["USDEGP"];

    // For USD/EGP: TradingView often returns 0 for change/change_abs.
    // Calculate from close - open as fallback.
    const usdEgpClose = usdEgp?.close || 0;
    const usdEgpOpen = usdEgp?.open || usdEgpClose;
    let usdEgpChangePercent = usdEgp?.changePercent || 0;
    let usdEgpChangeAbs = usdEgp?.changeAbs || 0;

    // If TradingView didn't provide change data, calculate from open
    if (usdEgpClose > 0 && usdEgpOpen > 0 && usdEgpChangeAbs === 0 && usdEgpClose !== usdEgpOpen) {
      usdEgpChangeAbs = Math.round((usdEgpClose - usdEgpOpen) * 100) / 100;
      usdEgpChangePercent = Math.round((usdEgpChangeAbs / usdEgpOpen) * 10000) / 100;
    }

    // For Gold: TradingView provides good change data, but also compute from open as backup
    const goldClose = gold?.close || 0;
    const goldOpen = gold?.open || goldClose;
    let goldChangePercent = gold?.changePercent || 0;
    let goldChangeAbs = gold?.changeAbs || 0;

    if (goldClose > 0 && goldOpen > 0 && goldChangeAbs === 0 && goldClose !== goldOpen) {
      goldChangeAbs = Math.round((goldClose - goldOpen) * 100) / 100;
      goldChangePercent = Math.round((goldChangeAbs / goldOpen) * 10000) / 100;
    }

    return {
      goldUsdPerOz: goldClose,
      goldOpenUsdPerOz: goldOpen,
      goldChangePercent,
      goldChangeAbs,
      usdEgp: usdEgpClose,
      usdEgpOpen,
      usdEgpChangePercent,
      usdEgpChangeAbs,
    };
  } catch (err) {
    console.error("TradingView fetch error:", err);
  }

  return {
    goldUsdPerOz: 0,
    goldOpenUsdPerOz: 0,
    goldChangePercent: 0,
    goldChangeAbs: 0,
    usdEgp: 0,
    usdEgpOpen: 0,
    usdEgpChangePercent: 0,
    usdEgpChangeAbs: 0,
  };
}

/**
 * SOURCE 2: gold-price-live.com — Real-time Egyptian gold prices in EGP per gram
 * URL: https://gold-price-live.com/?days=1
 *
 * The site uses Laravel Livewire (SSR) — initial HTML contains price data.
 * We use fetch() directly for speed, with page_reader as fallback.
 *
 * Verified HTML structure (from headless browser analysis):
 *
 * TABLE 1 (buy/sell):
 *   <td> ذهب عيار 24</td>
 *   <td style="font-weight:bold">7714 <span class="d-none d-lg-inline-block">جنيه مصري</span></td>
 *   <td style="font-weight:bold">7680 <span class="d-none d-lg-inline-block">جنيه مصري</span></td>
 *
 * TABLE 2 (detailed EGP+USD):
 *   <td>سعر الذهب عيار 24 قيراط (للجرام)</td>
 *   <td class="font-weight-bold" style="color:#189357;">7,714 جنيه مصري</td>
 *   <td class="font-weight-bold" style="color:#189357;">142.62 $</td>
 *
 * Ounce:   <td>سعر أونصة الذهب عيار 24 قيراط</td> ... <td ...>239,932 جنيه مصري</td>
 * Pound:   <td>سعر الجنيه الذهب (8 جرام عيار 21)</td> ... <td ...>54,000 جنيه مصري</td>
 */

async function fetchGoldPriceLiveHTML(): Promise<string> {
  // Strategy 1: Direct fetch (fast, works with Laravel Livewire SSR)
  try {
    const res = await fetch("https://gold-price-live.com/?days=1", {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "ar-EG,ar;q=0.9,en-US;q=0.8,en;q=0.7",
      },
      signal: AbortSignal.timeout(15000),
    });
    if (res.ok) {
      const html = await res.text();
      // Verify the response contains actual gold price data
      if (html.includes("عيار") && html.length > 5000) return html;
    }
  } catch (err) {
    console.warn("[gold-price-live] Direct fetch failed:", err);
  }

  // Strategy 2: page_reader fallback (headless browser)
  try {
    const zai = await getZai();
    const result = await zai.functions.invoke("page_reader", {
      url: "https://gold-price-live.com/?days=1",
    });
    const html: string = result?.data?.html || "";
    if (html.includes("عيار") && html.length > 5000) return html;
  } catch (err) {
    console.warn("[gold-price-live] page_reader failed:", err);
  }

  return "";
}

function parseGoldPriceLiveHTML(html: string): {
  karats: Record<string, { price: number; high: number; low: number; change: number }>;
  ounceEgp: number;
  goldPoundEgp: number;
} {
  const karats: Record<string, { price: number; high: number; low: number; change: number }> = {};
  let ounceEgp = 0;
  let goldPoundEgp = 0;

  // ── Step 1: Extract from Buy/Sell Table (most reliable, HTML-tag-aware) ──
  // Match: <td> ذهب عيار 24</td><td ...>7714 <span ...>جنيه مصري</span></td><td ...>7680 ...</td>
  const buySellPattern =
    /<td>\s*ذهب\s*عيار\s*(\d+)\s*<\/td>\s*<td[^>]*>\s*([\d,]+)\s*(?:<span[^>]*>[^<]*<\/span>)?\s*<\/td>\s*<td[^>]*>\s*([\d,]+)\s*(?:<span[^>]*>[^<]*<\/span>)?\s*<\/td>/g;
  let m: RegExpExecArray | null;
  while ((m = buySellPattern.exec(html)) !== null) {
    const karat = m[1];
    const buy = toNum(m[2]);
    const sell = toNum(m[3]);
    if (buy >= 100 && buy <= 200000 && sell >= 100 && sell <= 200000) {
      // Use buy price as the main displayed price
      karats[karat] = { price: buy, high: buy, low: sell, change: 0 };
    }
  }

  // ── Step 2: Extract ounce from buy/sell table ──
  const ounceBuySell =
    /<td>\s*أونصة الذهب\s*<\/td>\s*<td[^>]*>\s*([\d,]+)\s*(?:<span[^>]*>[^<]*<\/span>)?\s*<\/td>\s*<td[^>]*>\s*([\d,]+)\s*(?:<span[^>]*>[^<]*<\/span>)?\s*<\/td>/;
  const ozMatch = ounceBuySell.exec(html);
  if (ozMatch) {
    const buy = toNum(ozMatch[1]);
    if (buy >= 100000) ounceEgp = buy; // Use buy price (market standard)
  }

  // ── Step 3: Extract gold pound from buy/sell table ──
  // Use BUY price as the reference (matches Egyptian market standard)
  const poundBuySell =
    /<td>\s*جنيه الذهب\s*<\/td>\s*<td[^>]*>\s*([\d,]+)\s*(?:<span[^>]*>[^<]*<\/span>)?\s*<\/td>\s*<td[^>]*>\s*([\d,]+)\s*(?:<span[^>]*>[^<]*<\/span>)?\s*<\/td>/;
  const poundMatch = poundBuySell.exec(html);
  if (poundMatch) {
    const buy = toNum(poundMatch[1]);
    const sell = toNum(poundMatch[2]);
    if (buy >= 10000) goldPoundEgp = buy; // Use buy price (market standard)
  }

  // ── Step 4: Fallback — detailed table (if buy/sell didn't match) ──
  if (Object.keys(karats).length < 3) {
    for (const karat of ["24", "22", "21", "18", "12"]) {
      if (karats[karat]) continue;
      const regex = new RegExp(
        `سعر الذهب عيار ${karat} قيراط \\(للجرام\\)\\s*</td>\\s*<td[^>]*>\\s*([\\d,]+)\\s*جنيه`,
        "s"
      );
      const match = regex.exec(html);
      if (match) {
        const price = toNum(match[1]);
        if (price >= 100 && price <= 100000) {
          karats[karat] = { price, high: 0, low: 0, change: 0 };
        }
      }
    }
  }

  // ── Step 5: Text-based fallback (in case HTML tags differ) ──
  if (Object.keys(karats).length < 3) {
    for (const karat of ["24", "22", "21", "18"]) {
      if (karats[karat]) continue;
      const textRegex = new RegExp(
        `عيار\\s*${karat}\\s*قيراط[^\\d]*?([\\d,]+)\\s*جنيه`,
        "si"
      );
      const match = textRegex.exec(html);
      if (match) {
        const price = toNum(match[1]);
        if (price >= 100 && price <= 100000) {
          karats[karat] = { price, high: 0, low: 0, change: 0 };
        }
      }
    }
  }

  // ── Step 6: Ounce fallback from detailed table ──
  if (!ounceEgp) {
    const ozDetail =
      /سعر أونصة الذهب[^<]*<\/td>\s*<td[^>]*>\s*([\d,]+)\s*جنيه/;
    const ozD = ozDetail.exec(html);
    if (ozD) ounceEgp = toNum(ozD[1]);
  }
  if (!ounceEgp) {
    const ozText = /أوقية[^\d]*?([\d,]+)\s*جنيه/;
    const ozT = ozText.exec(html);
    if (ozT) ounceEgp = toNum(ozT[1]);
  }

  // ── Step 7: Gold pound fallback ──
  if (!goldPoundEgp) {
    const gpDetail =
      /سعر الجنيه الذهب[^<]*<\/td>\s*<td[^>]*>\s*([\d,]+)\s*جنيه/;
    const gpD = gpDetail.exec(html);
    if (gpD) goldPoundEgp = toNum(gpD[1]);
  }

  // ── Step 7b: Gold pound calculation fallback (8 grams × 21K price) ──
  if (!goldPoundEgp && karats["21"]?.price > 0) {
    goldPoundEgp = karats["21"].price * 8;
  }

  return { karats, ounceEgp, goldPoundEgp };
}

async function scrapeGoldPriceLive(): Promise<{
  karats: Record<string, { price: number; high: number; low: number; change: number }>;
  source: string;
  ounceEgp: number;
  goldPoundEgp: number;
}> {
  const empty = { karats: {}, source: "", ounceEgp: 0, goldPoundEgp: 0 };
  try {
    const html = await fetchGoldPriceLiveHTML();
    if (!html) return empty;

    const parsed = parseGoldPriceLiveHTML(html);
    if (Object.keys(parsed.karats).length > 0) {
      return { ...parsed, source: "gold-price-live.com" };
    }
  } catch (err) {
    console.error("gold-price-live.com scrape error:", err);
  }

  return empty;
}

/**
 * SOURCE 3 (Fallback): Google Finance — for USD/EGP
 */
async function fetchUsdEgpFromGoogleFinance(): Promise<{
  rate: number;
  changePercent: number;
  changeAbs: number;
}> {
  try {
    const zai = await getZai();

    const result = await zai.functions.invoke("page_reader", {
      url: "https://www.google.com/finance/quote/USD-EGP",
    });

    const html: string = result?.data?.html || "";

    const match = html.match(
      /United States Dollar\s*\/\s*Egyptian Pound\s+(\d+[\.\d]+).*?([+-][\d.]+)%.*?\(\s*([+-][\d.]+)\s*\)/s
    );

    if (match) {
      const rate = toNum(match[1]);
      if (rate >= 30 && rate <= 80) {
        return {
          rate,
          changePercent: toNum(match[2]),
          changeAbs: toNum(match[3]),
        };
      }
    }
  } catch (err) {
    console.error("Google Finance USD/EGP error:", err);
  }

  return { rate: 0, changePercent: 0, changeAbs: 0 };
}

// ── Market Status Helpers ──

function getEgyptTime(): Date {
  return new Date(new Date().toLocaleString("en-US", { timeZone: "Africa/Cairo" }));
}

/**
 * Egyptian Market Hours (Africa/Cairo timezone — EET/EEST)
 *
 * EGX (Egyptian Stock Exchange):
 *   Days: Sunday – Thursday
 *   Hours: 10:00 AM – 2:45 PM (discovery 9:30, close auction 2:15-2:25)
 *   Extended hours (new 2026): 9:30 AM – 3:00 PM (phase-in progress)
 *   Closed: Friday, Saturday, and all official Egyptian holidays
 *
 * Gold Retail Market (محلات الصاغة):
 *   Traditional souks: Daily, ~1:00 PM – 10:00 PM
 *   Modern malls: Sat–Thu 10:00 AM – 10:00 PM, Fri 2:00 PM – 10:00 PM
 *   Gold prices follow global XAUUSD (~24h Sun midnight – Fri midnight Cairo)
 *   + syndicate daily pricing around 10:00 AM
 *   → Mark "closed" only on official Egyptian holidays
 *
 * Forex / Banks:
 *   Days: Sunday – Thursday
 *   Hours: 8:30 AM – 2:00 PM (some branches to 5:00 PM)
 *   Closed: Friday, Saturday, and all official Egyptian holidays + July 1 (bank holiday)
 */

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
  egx: "live" | "closed";
  gold: "live" | "closed";
  globalGold: "live" | "closed";
  forex: "live" | "closed";
} {
  const now = getEgyptTime();
  const day = now.getDay(); // 0=Sun, 1=Mon, ..., 5=Fri, 6=Sat
  const hours = now.getHours();
  const minutes = now.getMinutes();
  const t = hours * 60 + minutes; // minutes since midnight

  const holiday = isEgyptianHoliday();

  // ── EGX: Sunday–Thursday, 10:00–14:45 Egypt time ──
  // Closed: Fri, Sat, and official holidays
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
    egx: egxLive ? "live" : "closed",
    gold: goldLive ? "live" : "closed",
    globalGold: globalGoldLive ? "live" : "closed",
    forex: forexLive ? "live" : "closed",
  };
}

// 60-second server cache for scraped gold data
let cached: { data: any; ts: number } | null = null;
const CACHE_TTL = 60 * 1000;

// GET /api/market-data/extras — Gold EGP gram prices + USD/EGP
export async function GET() {
  // Return cached if fresh (scraping is slow, cache longer)
  if (cached && Date.now() - cached.ts < CACHE_TTL) {
    return NextResponse.json(cached.data, {
      headers: { "Cache-Control": "no-store, no-cache, must-revalidate" },
    });
  }

  try {
    // ── 1. TradingView (primary — fast, real-time for USD gold + USD/EGP) ──
    const tv = await fetchFromTradingView();

    // ── 2. gold-price-live.com (primary for EGP gold gram prices — all karats) ──
    const scraped = await scrapeGoldPriceLive();

    // ── 3. Google Finance (fallback for USD/EGP only) ──
    let googleFinance: { rate: number; changePercent: number; changeAbs: number } | null = null;
    if (tv.usdEgp === 0) {
      googleFinance = await fetchUsdEgpFromGoogleFinance();
    }

    // ── Determine final USD/EGP ──
    let usdEgpRate = 0;
    let usdEgpSource = "";
    let usdEgpChangePercent = 0;
    let usdEgpChangeAbs = 0;
    let hasChangeData = false;

    if (tv.usdEgp > 0) {
      usdEgpRate = tv.usdEgp;
      usdEgpChangePercent = tv.usdEgpChangePercent;
      usdEgpChangeAbs = tv.usdEgpChangeAbs;
      usdEgpSource = "TradingView";
      hasChangeData = true;
    } else if (googleFinance && googleFinance.rate > 0) {
      usdEgpRate = googleFinance.rate;
      usdEgpChangePercent = googleFinance.changePercent;
      usdEgpChangeAbs = googleFinance.changeAbs;
      usdEgpSource = "Google Finance";
      hasChangeData = true;
    }

    // Fallback: track rate changes internally
    if (!hasChangeData && usdEgpRate > 0) {
      rateHistory.set(getTodayStr(), usdEgpRate);

      let yesterdayRate = 0;
      for (let i = 1; i <= 7; i++) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        if (d.getDay() === 5 || d.getDay() === 6) continue;
        const dateStr = d.toISOString().split("T")[0];
        const stored = rateHistory.get(dateStr);
        if (stored && stored > 0) {
          yesterdayRate = stored;
          break;
        }
      }

      if (yesterdayRate > 0) {
        usdEgpChangeAbs = Math.round((usdEgpRate - yesterdayRate) * 100) / 100;
        usdEgpChangePercent = Math.round((usdEgpChangeAbs / yesterdayRate) * 10000) / 100;
        hasChangeData = true;
      }
    }

    // ── Gold USD (TradingView — independent source) ──
    const TROY_OZ_TO_GRAM = 31.1035;
    const goldUsdPerOz = tv.goldUsdPerOz;
    const goldUsdChangePercent = tv.goldChangePercent; // TradingView gold change
    const goldUsdChangeAbs = tv.goldChangeAbs;         // TradingView gold absolute change
    const goldUsdPerGram = goldUsdPerOz / TROY_OZ_TO_GRAM;

    // ── Gold EGP (gold-price-live.com — independent source) ──
    // Each EGP gold item tracks its OWN change from its own source.
    // No mixing with USD gold change or USD/EGP change.
    const k24 = scraped.karats["24"];
    const k21 = scraped.karats["21"];
    const k22 = scraped.karats["22"];
    const k18 = scraped.karats["18"];

    let gold24kEgp = k24?.price || 0;
    let gold24kHigh = k24?.high || 0;
    let gold24kLow = k24?.low || 0;

    let gold21kEgp = k21?.price || 0;
    let gold21kHigh = k21?.high || 0;
    let gold21kLow = k21?.low || 0;

    let gold22kEgp = k22?.price || 0;
    let gold18kEgp = k18?.price || 0;
    let goldPoundEgp = scraped.goldPoundEgp || 0;
    let ounceEgp = scraped.ounceEgp || 0;

    // Track each EGP gold item's change independently from its source
    const k24Change = trackGoldEgpChange("k24", gold24kEgp);
    const k21Change = trackGoldEgpChange("k21", gold21kEgp);
    const k22Change = trackGoldEgpChange("k22", gold22kEgp);
    const k18Change = trackGoldEgpChange("k18", gold18kEgp);
    const poundChange = trackGoldEgpChange("pound", goldPoundEgp);
    const ounceChange = trackGoldEgpChange("ounce", ounceEgp);

    const goldKarats: Record<string, {
      price: number;
      high: number;
      low: number;
      change: number;
      changePercent: number;
    }> = {};

    if (gold24kEgp > 0) goldKarats["24"] = { price: gold24kEgp, high: gold24kHigh, low: gold24kLow, change: k24Change.changeAbs, changePercent: k24Change.changePercent };
    if (gold21kEgp > 0) goldKarats["21"] = { price: gold21kEgp, high: gold21kHigh, low: gold21kLow, change: k21Change.changeAbs, changePercent: k21Change.changePercent };
    if (gold22kEgp > 0) goldKarats["22"] = { price: gold22kEgp, high: 0, low: 0, change: k22Change.changeAbs, changePercent: k22Change.changePercent };
    if (gold18kEgp > 0) goldKarats["18"] = { price: gold18kEgp, high: 0, low: 0, change: k18Change.changeAbs, changePercent: k18Change.changePercent };

    // Use 24K change as the primary EGP gold change indicator
    const goldEgpChangePercent = k24Change.changePercent;
    const goldEgpChangeAbs = k24Change.changeAbs;

    // ── Market Status ──
    const marketStatus = getMarketStatus();

    const result = {
      usdEgp: {
        rate: usdEgpRate,
        changePercent: Math.round(usdEgpChangePercent * 100) / 100,
        changeAbs: Math.round(usdEgpChangeAbs * 100) / 100,
        source: usdEgpSource,
        hasChangeData,
      },
      gold: {
        // ── Gold USD (TradingView) ──
        usdPrice: goldUsdPerOz,
        usdChangePercent: Math.round(goldUsdChangePercent * 100) / 100,
        usdChangeAbs: Math.round(goldUsdChangeAbs * 100) / 100,
        // ── Gold EGP (gold-price-live.com) ──
        perGram24kEgp: gold24kEgp,
        perGram21kEgp: gold21kEgp,
        perGram24kHigh: gold24kHigh,
        perGram24kLow: gold24kLow,
        perGram21kHigh: gold21kHigh,
        perGram21kLow: gold21kLow,
        perGram24kUsd: Math.round(goldUsdPerGram * 100) / 100,
        perGram21kUsd: Math.round((goldUsdPerGram * (21 / 24)) * 100) / 100,
        changePercent: goldEgpChangePercent,
        changeAbs: goldEgpChangeAbs,
        egpSource: scraped.source || "",
        karats: goldKarats,
        ounceEgp: ounceEgp || Math.round(goldUsdPerOz * usdEgpRate),
        goldPoundEgp: goldPoundEgp || Math.round(gold21kEgp * 8),
        poundChangePercent: poundChange.changePercent,
        poundChangeAbs: poundChange.changeAbs,
      },
      dataFreshness: {
        tradingView: tv.usdEgp > 0,
        googleFinance: googleFinance ? googleFinance.rate > 0 : false,
        scraped: Object.keys(scraped.karats).length > 0,
        goldEgpSource: scraped.source,
        usdEgpLive: usdEgpRate > 0,
        timestamp: new Date().toISOString(),
      },
      marketStatus,
    };

    cached = { data: result, ts: Date.now() };
    return NextResponse.json(result, {
      headers: { "Cache-Control": "no-store, no-cache, must-revalidate" },
    });
  } catch (error) {
    console.error("Error fetching extras:", error);
    return NextResponse.json(
      { error: "Failed to fetch market extras" },
      { status: 503 }
    );
  }
}
