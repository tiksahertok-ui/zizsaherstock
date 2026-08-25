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
