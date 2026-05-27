# Worklog

## 2025-01-XX — Ticker Bar Cleanup, Gold Fallback Source, Market Closed State

### Change 1: Removed "Gold Oz (EGP)" card from ticker bar
**File:** `src/app/page.tsx`
- Removed the entire Gold Ounce (EGP) card block from the Market Ticker Bar Row 2.
- Row 2 now shows: USD/EGP, Gold 24K (EGP/g), Gold 21K (EGP/g), Gold (USD/oz), Gold Pound (جنيه الذهب).
- The `ounceEgp` field in the extras data remains on the backend for potential future use, but is no longer displayed.

### Change 2: Added dbmena.com as fallback gold price source
**File:** `src/app/api/market-data/extras/route.ts`
- Added a new `scrapeDbmena()` function that scrapes `https://www.dbmena.com/ar/gold-prices-today-in-egypt/` for Egyptian gold EGP prices.
- Uses `zai.functions.invoke("page_reader", ...)` to fetch the Arabic HTML page.
- Parses patterns like `عيار 24`, `24 قيراط`, `عيار24`, etc. followed by EGP prices.
- Also attempts to extract gold pound (جنيه الذهب) prices.
- In the GET handler, if `scrapeGoldPriceLive()` returns empty karats data, it falls back to `scrapeDbmena()`.
- The `egpSource` field in the response correctly shows "dbmena.com" when data comes from there.

### Change 3: Market closed behavior
**Files:** `src/app/page.tsx`

#### 3a. Added `isMarketClosed` state and market status checking
- Added `const [isMarketClosed, setIsMarketClosed] = useState(false);` state.
- Added `checkAllMarketsClosed()` helper that checks if ALL markets (egx, gold, forex) are closed.
- In `fetchLiveData`: checks `data.marketStatus` from the live endpoint. If all markets are closed, sets `isMarketClosed = true` and returns early (no price updates).
- In `fetchComprehensive`: checks `extrasData.marketStatus` and updates `isMarketClosed`.

#### 3b. Updated ticker bar UI for closed state
- Added a prominent banner above the ticker bar showing "السوق مغلق — Market Closed" with an AlertCircle icon, styled with red accent colors that work in both light and dark mode.
- Both Row 1 (indices) and Row 2 (USD/EGP + Gold) get `opacity-60` when market is closed.
- Each ticker card gets a semi-transparent "Closed" overlay with `backdrop-blur` when the market is closed.

#### 3c. Stopped live polling when market is closed
- Modified the polling `useEffect` to conditionally set up the 1-second `setInterval(fetchLiveData)` only when `isMarketClosed` is false.
- The 60-second comprehensive interval continues running regardless (to detect when markets reopen).
- Added `isMarketClosed` to the dependency array of the polling useEffect so it re-runs when the state changes.

### Change 4: Live API market status (verified)
**File:** `src/app/api/market-data/live/route.ts`
- Verified that the live endpoint already returns `marketStatus` in its response. No changes needed.
- The `getMarketStatus()` function correctly uses Cairo/Egypt timezone and handles EGX hours (Sun-Thu 10:00-14:45) and Gold/Forex hours.

---

## 2025-05-28 — Support & Resistance (Pivot Points) Feature

### Change 5: Technical Analysis API Route
**File:** `src/app/api/market-data/technical-analysis/route.ts` (NEW)
- Created new API endpoint `/api/market-data/technical-analysis`
- Calculates 3 types of pivot points from TradingView OHLC data:
  - **Classic**: PP, S1-S3, R1-R3
  - **Fibonacci**: PP, S1-S3, R1-R3 (0.382/0.618/1.000 ratios)
  - **Camarilla**: S1-S4, R1-R4 (1.1 multiplier)
- Also includes 52-week high/low from TradingView
- Finds nearest support (highest level below price) and nearest resistance (lowest level above price) across all calculation methods
- Accepts `?symbols=COMI,HDBK` or `?all=true` for all 220 EGX stocks
- Uses 60s server-side cache (same as `fetchQuotesFull`)
- Uses existing `fetchQuotesFull()` which provides OHLC + 52w data

### Change 6: S&R Tab in Charts Section
**File:** `src/app/page.tsx`
- Added new "S&R" tab to the Charts section (now 5 tabs: Performance, Allocation, P&L, Benchmark, S&R)
- Shows scrollable table of all EGX stocks with:
  - Stock symbol + sector
  - Current price
  - Nearest support (green, with % distance below price)
  - Nearest resistance (red, with % distance above price)
  - Classic pivot point (PP)
  - Classic S1, S2 support levels
  - Classic R1, R2 resistance levels
  - 52-week low and high
- Sorted by current price (highest first)
- Responsive: hides columns on smaller screens (md/lg/xl breakpoints)
- Sticky table header for scroll

### Change 7: Nearest S&R in Holdings Table
**File:** `src/app/page.tsx`
- Added two new columns to the Holdings table (visible on lg+ screens):
  - **Support** (green, down arrow): Shows nearest support level with % distance below current price
  - **Resistance** (red, up arrow): Shows nearest resistance level with % distance above current price
- Data sourced from `taData` state, populated by the technical-analysis API

### Change 8: Data Fetching Integration
**File:** `src/app/page.tsx`
- Added `taData` and `taLoading` state
- Integrated technical analysis fetch into `fetchComprehensive()` (runs every 60s)
- Fetches all stocks via `?all=true` parameter
- New imports: `Shield`, `ArrowDown`, `ArrowUp` icons from lucide-react

### Commit: f342e2b
Pushed to: `https://github.com/tiksahertok-ui/zizsaherstock.git` (main)

---

## 2025-05-28 — Review Gold Prices & Market Status

### Task: Review all gold prices and market status logic

**Reviewed:**
1. **Gold USD (XAUUSD)**: TradingView real-time via `fetchQuotesLive` — working correctly
2. **Gold EGP (24K, 21K)**: Scraped from gold-price-live.com via `scrapeGoldPriceLive()` — buy price used as main price
3. **USD/EGP**: TradingView primary, Google Finance fallback — working correctly
4. **Gold Pound**: Scraped from gold-price-live.com — working correctly
5. **Market Status**: Checked holiday list, day-of-week logic, and time windows

### Critical Bug Found & Fixed: Holiday-Aware Market Status in Live Route

**File:** `src/app/api/market-data/live/route.ts`

**Problem:** The `/api/market-data/live` endpoint (polled every 1 second) had a simplified `getMarketStatus()` that did NOT check Egyptian holidays. Since `fetchLiveData()` in page.tsx overwrites `extrasData.marketStatus` every second (line 542), it was overriding the correct holiday-aware status from the extras API.

**Impact:** Today is May 28, 2026 (Eid Al-Adha Day 2). Without this fix:
- EGX would incorrectly show as "live" during holidays
- Gold retail (Egyptian market) would show "live" during holidays
- Forex/banks would show "live" during holidays

**Fix:** Added the full `EGYPTIAN_HOLIDAYS` list (2025-2026) and `isEgyptianHoliday()` function to the live route, matching the extras route's logic exactly. Now both routes return consistent, holiday-aware market status:
- `egx`: Closed on Fri, Sat, holidays, outside 10:00-14:45
- `gold`: Closed only on holidays
- `globalGold`: Closed only on Saturday
- `forex`: Closed on Fri, Sat, holidays

**Verified correct market status for today (Thu May 28, 2026 - Eid Al-Adha Day 2):**
- EGX: **CLOSED** (holiday) ✓
- Gold retail: **CLOSED** (holiday) ✓
- Global Gold (TradingView): **LIVE** (Thursday, not Saturday) ✓
- Forex/Banks: **CLOSED** (holiday) ✓

### Commit: 8d4b54d
Pushed to: `https://github.com/tiksahertok-ui/zizsaherstock.git` (main)
