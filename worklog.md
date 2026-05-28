---
Task ID: 1
Agent: Main Agent
Task: Review and fix gold EGP and USD/EGP price change percentages and market status

Work Log:
- Analyzed all market data files: page.tsx, market-data.ts, live/route.ts, extras/route.ts
- Identified root cause: Gold EGP change used `trackGoldEgpChange()` with in-memory state that resets on every Vercel serverless cold start, causing 0% change always
- Identified USD/EGP issue: TradingView's FX_IDC:USDEGP returns 0 for change/change_abs; Google Finance fallback only triggered when rate was 0 (not when change was 0)
- Fixed gold EGP change: Replaced in-memory tracking with multiplicative formula: `EGP_change% = (1 + goldUSD_change%) × (1 + usdEgp_change%) - 1`
- Fixed USD/EGP change: Now always tries Google Finance when TradingView returns 0 change; added Yahoo Finance as 3rd fallback source
- Rewrote `fetchUsdEgpFromGoogleFinance()` with 3 strategies: direct Google Finance fetch, page_reader fallback, Yahoo Finance API
- Added `parseGoogleFinanceHTML()` with 6 pattern matching strategies for robust HTML parsing
- Fixed `getTodayStr()` to use Egypt timezone (Africa/Cairo) instead of UTC
- Verified market status logic: EGX=closed, gold=closed, globalGold=live, forex=closed (correct for Eid Al-Adha Day 3)
- Tested API endpoint: Gold EGP change now shows -1.6% (computed from gold USD), all karats/pound change working

Stage Summary:
- Key fix: Gold EGP change percentage now works reliably on Vercel (no more in-memory tracking)
- Key fix: USD/EGP change has 3 fallback sources (TradingView → Google Finance → Yahoo Finance)
- Market status verified correct for Egyptian holidays and weekends
- Commit: b9f11ca pushed to main
