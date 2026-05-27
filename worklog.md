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
