---
phase: 01-foundation
plan: 02
subsystem: pricing
tags: [math, tdd, pure-function]
requires: [01-01]
provides: [MATH-01]
affects: [01-05-builder, phase-03-publish]
tech-stack:
  added: []
key-files:
  created:
    - src/lib/pricing/types.ts
    - src/lib/pricing/breakEven.ts
    - src/lib/pricing/breakEven.test.ts
  modified: []
decisions:
  - "round2 helper uses Math.round(n*100)/100 (round-half-away-from-zero per JS spec)"
  - "breakEvenMembers special-cases overhead=0 → 0, and gross<=0 → Infinity"
  - "Species mix is metadata-only in v1 — does not affect math (verified in scenarios 8 and 9)"
metrics:
  duration: ~10m
  completed: 2026-04-23
---

# Phase 01 Plan 02: Break-Even Math Summary

Pure `computeBreakEven(inputs)` function satisfying MATH-01 — the canonical break-even engine called identically by Plan 05's client-side builder preview and Phase 3's server-side Publish action. 15 hand-computed scenarios + determinism + locked-constants tests all pass.

## Final formulas (as implemented)

```
vaccineDoses(cadence) = annual:1 | every-2:0.5 | every-3:1/3
serviceAnnual         = sum of included services (core-vaccines scaled by doses)
retail                = round2(sum of servicesAnnual for tier's includedServices)
monthly               = round2(retail * (1 - discount/100) / 12)
stripePerCharge       = round2(monthly * 0.029 + 0.30)
platformPerCharge     = round2(monthly * 0.10)
clinicGrossPerYear    = round2((monthly - stripePerCharge - platformPerCharge) * 12)
breakEvenMembers      = overhead === 0          ? 0
                      : gross > 0               ? ceil(overhead * 12 / gross)
                                                : Infinity
```

Constants locked: `PLATFORM_FEE_PCT=10`, `STRIPE_FEE_PCT=2.9`, `STRIPE_FEE_FIXED_CENTS=30`, `DEFAULT_OVERHEAD_USD=500`.

Default tier service matrix per CONTEXT Q5:
- `preventive`: annual-exam + core-vaccines
- `preventive-plus`: + dental-cleaning
- `complete`: + heartworm-prevention + flea-tick-prevention

## Corrections to expected values

None. All 15 hand-computed scenarios passed on the first GREEN run. Key rounding cases verified:
- `Math.round(8.125 * 100) = 813` → monthly $8.13 in scenario 4 (every-2-years cadence)
- `45 * (1/3) = 15` exactly in scenario 5 (every-3-years cadence)
- `ceil(6000 / 100.92) = 60` (not 59) in scenario 1 baseline Preventive

## External dependencies

`src/lib/pricing/breakEven.ts` imports **only** from `./types`. No `@/lib/db`, no `fetch`, no `Date.now`, no `require`, no async. Purity verified by grep in the task's verify block.

## Consumer notes for Plan 05

```typescript
import { computeBreakEven } from '@/lib/pricing/breakEven';
import type { PlanBuilderInputs, BreakEvenResult } from '@/lib/pricing/types';

// Client-side (react-hook-form live preview):
const result = useMemo(() => computeBreakEven(formValues), [formValues]);

// Render result.tiers[i].lineItems.{retailValueBundledUsd,
// monthlyFeeUsd, stripeFeePerChargeUsd, platformFeePerChargeUsd,
// clinicGrossPerPetPerYearUsd, breakEvenMembers}
```

`breakEvenMembers` can be `Infinity` when gross ≤ 0 (e.g., stripe+platform exceeds monthly fee). Builder panel should render this as "—" or "∞" rather than a literal Infinity string.

## Deviations from Plan

**None.** RED → GREEN → REFACTOR executed exactly as written. No hand-computed test expectation needed correction.

## Auth Gates

None.

## Known Stubs

None.

## Self-Check: PASSED

- `src/lib/pricing/types.ts` exports 8+ types — FOUND
- `src/lib/pricing/breakEven.ts` exports `computeBreakEven` + 4 constants + `DEFAULT_TIER_SERVICES` — FOUND
- `src/lib/pricing/breakEven.test.ts` has 17 `it(` blocks (15 MATH-01 + determinism + locked-constants) — FOUND
- No imports from `@/lib/db` / `fetch` / `Date.now` / `require` — VERIFIED
- No `any` types in breakEven.ts — VERIFIED
- `pnpm test` passes 18 tests (17 break-even + 1 smoke) — PASS
- `pnpm typecheck` — PASS
- Commits `b96a7fc` (RED) and `979f66e` (GREEN) — present in `git log`
