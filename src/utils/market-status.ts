// ── Shared Market Status Utility ───────────────────────────────
// Used by both /api/market-data/live and /api/market-data/extras routes.
// Eliminates duplicated Egyptian holidays list and getMarketStatus() logic.

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

/** Get current time in Egypt timezone (Africa/Cairo) */
export function getEgyptTime(): Date {
  return new Date(new Date().toLocaleString('en-US', { timeZone: 'Africa/Cairo' }));
}

/** Official Egyptian holidays 2025-2026 (dates when EGX/banks are closed) */
export const EGYPTIAN_HOLIDAYS: Record<string, boolean> = {
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

/** Check if today is an Egyptian holiday */
export function isEgyptianHoliday(): boolean {
  const now = getEgyptTime();
  const dateStr = now.toISOString().split('T')[0];
  return !!EGYPTIAN_HOLIDAYS[dateStr];
}

/** Determine live/closed status for all Egyptian markets */
export function getMarketStatus(): {
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
  const egxLive = !holiday && day !== 5 && day !== 6 && t >= 600 && t <= 885;

  // ── Egyptian Gold Retail Market ──
  const goldLive = !holiday;

  // ── Global Gold / TradingView (XAUUSD) ──
  const globalGoldLive = day !== 6;

  // ── Forex / Banks: Sunday–Thursday ──
  const forexLive = !holiday && day !== 5 && day !== 6;

  return {
    egx: egxLive ? 'live' : 'closed',
    gold: goldLive ? 'live' : 'closed',
    globalGold: globalGoldLive ? 'live' : 'closed',
    forex: forexLive ? 'live' : 'closed',
  };
}
