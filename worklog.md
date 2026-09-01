# Analysis Section TypeScript Fixes — Worklog

## Session 2: PriceTargetsBar Redesign + Target Calculation Bug Fixes

### Backend Fixes (`src/lib/technical-screener.ts`)

#### Bug 1 (Critical) — `calcStopLoss` for Buy signals (line ~581)
**Problem**: For Buy signals, `nearestSupport` was computed as `Math.max(Math.min(s20, s50, bbSl), atrSL)`. This picked the **lowest** support level (furthest from price) instead of the **nearest** (highest below entry). Result: stop-losses were placed too far from entry, inflating risk.
**Fix**: Changed to filter supports below price, then pick the highest:
```typescript
const supportsBelow = [s20, s50, bbSl].filter(s => s < close);
const nearestSupport = supportsBelow.length > 0
  ? Math.max(Math.max(...supportsBelow), atrSL)
  : atrSL;
```

#### Bug 2 (Critical) — `calcStopLoss` for Sell signals (line ~596)
**Problem**: For Sell signals, `nearestResistance` was computed as `Math.min(Math.max(s20, s50, bbSl), atrSL)`. This picked the **highest** resistance (furthest from price) instead of the **nearest** (lowest above entry). Same symptom: SL too far, inflated risk.
**Fix**: Filter resistances above price, then pick the lowest:
```typescript
const resistancesAbove = [s20, s50, bbSl].filter(s => s > close);
const nearestResistance = resistancesAbove.length > 0
  ? Math.min(Math.min(...resistancesAbove), atrSL)
  : atrSL;
```

#### Bug 3 (Minor) — Floating-point comparison in `calcTakeProfits`
**Problem**: `tp2 === tp2bb` and `tp3 === tp3w52` used strict equality on floats, causing basis label to incorrectly show "× ATR" instead of "BB Upper Band" or "52-Week High" due to floating point precision.
**Fix**: Replaced with epsilon comparison `Math.abs(tp2 - tp2bb) < 0.01` for all 4 basis label checks (Buy TP2/TP3, Sell TP2/TP3).

### Frontend Redesign (`src/app/analysis/page.tsx`)

#### PriceTargetsBar Component — Complete Redesign
**Compact mode** (cards/daily picks):
- Taller track (h-2) with colored gradient zones (red risk / green reward)
- 8% padding so markers don't sit on edges
- Tooltip on hover showing label + price for each marker (SL, Entry, TP1/2/3)
- Entry marker larger (w-3 h-3) with blue shadow, SL and TPs proportionally smaller
- Color-coded TP markers: emerald (High), amber (Medium), slate (Low)

**Full mode** (expanded row):
- Taller visual scale (h-10 rounded-xl) with gradient risk/reward zones
- Floating price labels above/below track (alternating top/bottom for TPs to avoid overlap)
- Each label has colored pill: red for SL, blue ring for Entry, probability-themed for TPs
- Connecting pixel lines from labels to track
- Quarter grid lines for reference

**Level Cards Grid** (5 columns):
- Each card has a colored top accent bar (gradient)
- Icon in a colored square: Shield (SL), Target (Entry), Crosshair (TP)
- Probability badge for each TP (مرتفع/متوسط/منخفض)
- Larger text (text-sm) for prices, clearer hierarchy
- Basis reference shown subtly below each TP

**R:R Summary Row**:
- Fixed Hold signal display bug (was showing negative TP1 for bullish Holds)
- Now uses natural sign from `(tp.price - entry) / entry * 100`
- Added position size to the summary
- R:R badge has border + Gauge icon

**Cleanup**:
- Removed duplicate text-based price list below the bar (was redundant)
- Removed unused `safeDiv` local function

### Verification
- `npx next build` passes with zero errors
- All routes compile cleanly
---
Task ID: 1
Agent: main
Task: Daily Picks Flagship Feature Rebuild (Implementation Brief A.1-A.6, B.1-B.7)

Work Log:
- Updated Prisma schema with: marketContextJson, outcome tracking fields (nextDayOpen/Close, realizedReturn, stopHit, tp1Hit), fundamental gate fields, nextInLine flag, pipeline metrics (fundamentalPass, technicalPass), paramsSnapshotJson, pickCountNote
- Created daily-picks-v2.ts: two-stage pipeline (fundamental gate → technical scoring), 7 explicit fundamental checks (profitability, solvency, cash flow, revenue, relative valuation, data quality, EGP currency), multicollinearity cap on MA signals, EGX price limit bounding, sector concentration guard (B.2), flexible count with explanatory note (B.1), next-in-line transparency (B.4), versioned parameters (B.7)
- Rebuilt daily-picks API route: fetches fundamentals for gate, fetches EGX30 for market context (B.5), persists full pipeline metrics, supports v1 shadow mode (?method=v1) and A/B ranking (?ranking=confidence), backward compatible with v1 engine
- Created compute endpoint (POST /compute): for external cron scheduling, idempotent (skips if batch exists), secret-based auth
- Created history endpoint (GET /history): date range browsing, single date lookup, next-in-line inclusion, outcome data
- Created outcomes endpoint (POST /outcomes): evaluates past picks against realized prices, updates SL/TP hit status, computes hit rate and avg return
- Updated monitor endpoint: pipeline funnel metrics (fundamentalPass, technicalPass), outcome tracking KPIs, data completeness split (tech vs fund)
- Rebuilt UI: flagship presentation with fundamental gate indicator (green/red checkmark with tooltip), market context chip (EGX30 change + regime), pipeline funnel counts, next-in-line expandable section (B.4), methodology accordion (A.6), honest disclaimer (B.6), B.1 flexible count note

Stage Summary:
- Version bump: v1.0.0 → v2.0.0
- 6 new/modified files in the daily-picks system
- Schema: 2 new fields on DailyPickBatch, 7 new fields on DailyPickRecord
- All 48 v1 unit tests still pass
- Build successful
- All A.x and B.x requirements implemented except: walk-forward statistical validation (needs historical price data store), multi-channel delivery (email/push), personalization UI toggle
---
Task ID: 2
Agent: main
Task: Wire EGX liquidity filter + fix TS errors across Daily Picks pipeline

Work Log:
- Added passesLiquidityFilter() to daily-picks-v2.ts: uses avgVolume30d × close as daily turnover proxy, calibrated to EGX 25th percentile (100K EGP), conservative pass when volume data unavailable
- Integrated liquidity filter into pipeline between fundamental gate (Stage 1) and technical filters (Stage 2)
- Fixed QuoteData interface mismatch: .price → .close in outcomes route (3 locations) and compute route (2 locations)
- Fixed EGX30 ticker lookup: added 'EGX30' fallback when 'CASE:EGX30' key not found in quotes map
- Fixed null safety in analysis page: dailyPicksMeta?.fundamentalPass, dailyPicksMeta?.technicalPass, (avgReturn ?? 0) comparisons
- Fixed TypeScript 'never[]' inference: explicitly typed outcomes results array
- Fixed Prisma relation access: added `include: { picks: true }` to compute route's idempotency check
- Fixed Object.values unknown[] cast: added `as Record<string, number>` for persisted sector distribution

Stage Summary:
- Zero new TypeScript errors introduced (verified with tsc --noEmit)
- Next.js build passes cleanly
- All changes pushed to GitHub (commit 0f53851)
