import { NextResponse } from "next/server";
import { getMarketStatus } from "@/utils/market-status";

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

// ── Gold EGP change is now computed from gold USD change + USD/EGP change ──
// Formula: EGP_price ≈ USD_price × USD/EGP_rate
// So: EGP_change% = (1 + goldUSD_change%) × (1 + usdEgp_change%) - 1
// This is reliable across serverless cold starts unlike in-memory tracking.

function toNum(v: number | string | null | undefined): number {
  if (v == null) return 0;
  const x = typeof v === "string" ? parseFloat(v.replace(/,/g, "")) : v;
  return isFinite(x) ? x : 0;
}

function getTodayStr(): string {
  return new Date(new Date().toLocaleString('en-US', { timeZone: 'Africa/Cairo' })).toISOString().split("T")[0];
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
 * SOURCE 3 (Fallback): Multiple sources for USD/EGP change data
 * Tries: 1) Direct Google Finance fetch, 2) page_reader fallback, 3) yfinance-style API
 */
async function fetchUsdEgpFromGoogleFinance(): Promise<{
  rate: number;
  changePercent: number;
  changeAbs: number;
}> {
  const empty = { rate: 0, changePercent: 0, changeAbs: 0 };

  // Strategy 1: Direct fetch from Google Finance (fastest)
  try {
    const res = await fetch("https://www.google.com/finance/quote/USD-EGP", {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept-Language": "en-US,en;q=0.9",
      },
      signal: AbortSignal.timeout(10000),
    });
    if (res.ok) {
      const html = await res.text();
      const parsed = parseGoogleFinanceHTML(html);
      if (parsed.rate > 0) return parsed;
    }
  } catch (err) {
    console.warn("[Google Finance] Direct fetch failed:", err);
  }

  // Strategy 2: page_reader fallback (headless browser)
  try {
    const zai = await getZai();
    const result = await zai.functions.invoke("page_reader", {
      url: "https://www.google.com/finance/quote/USD-EGP",
    });
    const html: string = result?.data?.html || "";
    if (html.length > 1000) {
      const parsed = parseGoogleFinanceHTML(html);
      if (parsed.rate > 0) return parsed;
    }
  } catch (err) {
    console.warn("[Google Finance] page_reader failed:", err);
  }

  // Strategy 3: Yahoo Finance API (no auth required for basic quotes)
  try {
    const res = await fetch(
      "https://query1.finance.yahoo.com/v8/finance/chart/EGP=X?range=1d&interval=1d",
      {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        },
        signal: AbortSignal.timeout(10000),
      }
    );
    if (res.ok) {
      const json = await res.json();
      const meta = json?.chart?.result?.[0]?.meta;
      if (meta) {
        const rate = toNum(meta.regularMarketPrice);
        const prevClose = toNum(meta.chartPreviousClose) || toNum(meta.previousClose);
        if (rate >= 30 && rate <= 80 && prevClose > 0) {
          const changeAbs = Math.round((rate - prevClose) * 10000) / 10000;
          const changePercent = Math.round((changeAbs / prevClose) * 10000) / 100;
          return { rate, changePercent, changeAbs };
        }
      }
    }
  } catch (err) {
    console.warn("[Yahoo Finance] USD/EGP error:", err);
  }

  return empty;
}

/** Parse Google Finance HTML for USD/EGP rate and change */
function parseGoogleFinanceHTML(html: string): {
  rate: number;
  changePercent: number;
  changeAbs: number;
} {
  // Pattern 1: Structured data — "data-last-price" attribute
  const lastPriceMatch = html.match(/data-last-price="(\d+[\.\d]+)"/);
  // Pattern 2: Change percentage in data attribute
  const changePctMatch = html.match(/data-percent-change="([+-]?[\d.]+)"/);
  // Pattern 3: Price in text near "United States Dollar"
  const textMatch = html.match(
    /United States Dollar[^]*?(\d{2}\.\d{4,})/
  );
  // Pattern 4: Change percentage text like "+0.05%" or "-0.12%"
  const changeTextMatch = html.match(/([+-][\d.]+%)/);

  // Pattern 5: Previous close data attribute
  const prevCloseMatch = html.match(/data-previous-close="(\d+[\.\d]+)"/);

  const rate = toNum(lastPriceMatch?.[1]) || toNum(textMatch?.[1]) || 0;
  let changePercent = toNum(changePctMatch?.[1]);
  const prevClose = toNum(prevCloseMatch?.[1]);

  // Fallback: compute change from rate vs previous close
  if (rate > 0 && prevClose > 0 && changePercent === 0) {
    const changeAbs = Math.round((rate - prevClose) * 10000) / 10000;
    changePercent = Math.round((changeAbs / prevClose) * 10000) / 100;
    if (rate >= 30 && rate <= 80) {
      return { rate, changePercent, changeAbs };
    }
  }

  // Pattern 6: Regex from structured content
  const match = html.match(
    /United States Dollar\s*\/\s*Egyptian Pound\s+(\d+[\.\d]+).*?([+-][\d.]+)%/
  );
  if (match) {
    const parsedRate = toNum(match[1]);
    const parsedChangePct = toNum(match[2]);
    if (parsedRate >= 30 && parsedRate <= 80) {
      const parsedChangeAbs = Math.round(parsedRate * parsedChangePct / 100 * 10000) / 10000;
      return { rate: parsedRate, changePercent: parsedChangePct, changeAbs: parsedChangeAbs };
    }
  }

  if (rate >= 30 && rate <= 80 && changePercent !== 0) {
    const changeAbs = Math.round(rate * changePercent / 100 * 10000) / 10000;
    return { rate, changePercent, changeAbs };
  }

  return { rate: 0, changePercent: 0, changeAbs: 0 };
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
    // Always try Google Finance when TradingView has no change data (common for FX_IDC:USDEGP)
    if (tv.usdEgp === 0 || (tv.usdEgpChangePercent === 0 && tv.usdEgpChangeAbs === 0)) {
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

      // TradingView USDEGP often returns 0 for change — use Google Finance as fallback
      if (usdEgpChangePercent === 0 && usdEgpChangeAbs === 0 && googleFinance && googleFinance.changePercent !== 0) {
        usdEgpChangePercent = googleFinance.changePercent;
        usdEgpChangeAbs = googleFinance.changeAbs;
        usdEgpSource = "TradingView + Google Finance";
      }
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

    // ── Gold EGP change: computed CLIENT-SIDE from Egyptian prices only ──
    // The server returns raw prices from gold-price-live.com.
    // The client (browser) tracks the first price of each day in localStorage
    // and computes the daily change — 100% based on Egyptian gold market prices.
    // This avoids mixing international gold change with USD/EGP change,
    // and works reliably across serverless cold starts.

    const goldKarats: Record<string, {
      price: number;
      high: number;
      low: number;
      change: number;
      changePercent: number;
    }> = {};

    // Raw prices — change is computed client-side from localStorage
    if (gold24kEgp > 0) goldKarats["24"] = { price: gold24kEgp, high: gold24kHigh, low: gold24kLow, change: 0, changePercent: 0 };
    if (gold21kEgp > 0) goldKarats["21"] = { price: gold21kEgp, high: gold21kHigh, low: gold21kLow, change: 0, changePercent: 0 };
    if (gold22kEgp > 0) goldKarats["22"] = { price: gold22kEgp, high: 0, low: 0, change: 0, changePercent: 0 };
    if (gold18kEgp > 0) goldKarats["18"] = { price: gold18kEgp, high: 0, low: 0, change: 0, changePercent: 0 };

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
        // Gold EGP change is computed CLIENT-SIDE from Egyptian prices
        changePercent: 0,
        changeAbs: 0,
        egpSource: scraped.source || "",
        karats: goldKarats,
        ounceEgp: ounceEgp || Math.round(goldUsdPerOz * usdEgpRate),
        goldPoundEgp: goldPoundEgp || Math.round(gold21kEgp * 8),
        // Gold pound EGP change is computed CLIENT-SIDE
        poundChangePercent: 0,
        poundChangeAbs: 0,
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
