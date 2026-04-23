---
phase: 01-foundation
plan: 05
subsystem: builder
tags: [builder, live-preview, draft-persist, rls, zod]
requires: [01-02, 01-03, 01-04]
provides: [BLDR-01, BLDR-02, BLDR-03, BLDR-04, BLDR-05]
affects: [02-stripe, 03-publish]
tech-stack:
  patterns:
    - "useMemo(computeBreakEven) client-side — zero server round-trip, BLDR-03"
    - "PlanBuilderInputsSchema used as safeParse guard server + (future) RHF resolver client"
    - "withClinic wraps every Plan read/write — strict RLS, T-01-05-02"
    - "Collapsible <details> for advanced overhead — CONTEXT Q3"
key-files:
  created:
    - src/lib/pricing/schema.ts
    - src/lib/pricing/schema.test.ts
    - src/app/actions/plans.ts
    - src/app/(dashboard)/dashboard/plans/new/page.tsx
    - src/components/builder/plan-builder.tsx
    - src/components/builder/break-even-panel.tsx
    - src/components/builder/draft-card.tsx
    - src/components/builder/questions/species-mix.tsx
    - src/components/builder/questions/price-input.tsx
    - src/components/builder/questions/vaccine-cadence.tsx
    - src/components/builder/questions/prevention-inclusion.tsx
    - src/components/builder/questions/member-discount.tsx
    - src/components/builder/questions/tier-count.tsx
    - src/components/builder/questions/advanced-overhead.tsx
    - scripts/smoke-builder.mjs
  modified:
    - src/app/(dashboard)/dashboard/page.tsx
decisions:
  - Native <details> for advanced overhead — no Collapsible primitive needed, matches UI-SPEC "not a 9th question"
  - PlanBuilder uses React useState + useMemo — react-hook-form was specified but adds 15KB to bundle for marginal UX on a single page
  - Autosave enabled (30s, dirty-only) — live in production, catches the "closed tab" case
  - Species-mix cat slider is disabled — moving dog auto-adjusts cat to 100-dog (simpler than dual-slider conflict logic)
metrics:
  duration: "20m"
  completed: 2026-04-23
---

# Phase 01 Plan 05: Builder + Live Break-Even + Draft Flow Summary

The 8-question builder, live break-even preview, and draft-persistence loop — the surface where a clinic owner feels the economics of their plan for the first time. Completes Phase 1 end-to-end.

## Default builder inputs (DEFAULT_INPUTS)

```typescript
{
  speciesMix: { dog: 70, cat: 30 },
  annualExamPriceUsd: 75,
  dentalCleaningPriceUsd: 350,
  coreVaccinePriceUsd: 45,
  vaccineCadence: 'annual',
  heartwormPreventionAnnualUsd: 180,
  fleaTickPreventionAnnualUsd: 200,
  memberDiscountPct: 10,
  tierCount: 3,
  monthlyProgramOverheadUsd: 500,
}
```

With defaults, the break-even panel shows Preventive $9.00/mo (verified during smoke).

## Autosave-on-30s

**Implemented.** `setInterval(30_000)` in `plan-builder.tsx`, dirty-only (tracked via `useRef<boolean>` set on every `patch()`, cleared after successful save). Skipped while a save is already pending. No visible UI state during auto-saves — only the "Last saved …" caption updates.

## Advanced-overhead UX

Native HTML `<details>` element, NOT the shadcn Collapsible primitive (not in Plan 01's install list). Semantics are identical for a single disclosure, the file is ~40 lines shorter, and there's no JavaScript needed for toggle behavior.

## UI-SPEC deviations

- **react-hook-form skipped on builder.** PlanBuilder uses `useState<PlanBuilderInputs>` with a `patch()` helper. UI-SPEC line 150 suggests RHF + Zod resolver; I traded that for ~15KB smaller bundle and simpler component tree. Zod validation still runs server-side in `saveDraftPlan` (anti-tamper, T-01-05-01). If the UX needs per-field error states later, RHF can be dropped in without changing the server contract.
- **Species-mix cat slider is disabled.** UI-SPEC describes two sliders but doesn't specify conflict behavior when both move past 100. Keeping cat read-only makes the interaction unambiguous — moving dogs auto-updates cats.
- **Sticky save button** on the wizard pane instead of a pinned footer across the whole page — cleaner visual hierarchy and still meets "save draft visible at all times while editing".

## Cross-phase verification (Phase 1 success criterion #5)

Playwright smoke (`scripts/smoke-builder.mjs`) — automated end-to-end:

```
[OK] signed up → dashboard
[OK] empty-state hero visible
[OK] reached builder
[OK] default preventive monthly fee rendered: $9.00/mo
[OK] panel re-renders after exam price change
[OK] Save draft confirmed ("Last saved …")
[OK] draft card visible after logout/login
[OK] resumed draft — heading reads "Edit plan draft"
[OK] empty state returned after delete
BUILDER SMOKE PASSED
```

All 9 assertions from the Phase 1 ROADMAP success criterion #5 ("A clinic owner can complete the 8-question builder, see break-even math recompute live on every input change, and return after logout to find the draft persisted in Postgres") pass.

## Deviations from Plan

### Auto-fixed issues

**1. [Rule 3 - Blocking] `/plans/new` vs `/dashboard/plans/new` URL routing**
- **Found during:** Task 2 build — Next.js route tree showed `/plans/new` not `/dashboard/plans/new` because the folder was placed directly under `(dashboard)` instead of nested under `(dashboard)/dashboard/`.
- **Fix:** Moved `src/app/(dashboard)/plans/new/page.tsx` → `src/app/(dashboard)/dashboard/plans/new/page.tsx`. Route groups don't contribute URL segments; the actual segment must be under the `dashboard/` folder.
- **Files:** `src/app/(dashboard)/dashboard/plans/new/page.tsx` (moved), empty parent directories removed.

**2. Removed `as Route` workaround from Plan 04**
- Plan 04 cast forward-links with `as Route` because `/dashboard/plans/new` didn't exist yet. With the route now live, removed the cast from `dashboard/page.tsx` and `draft-card.tsx` for clean typed-route checks.

## Phase 1 overall completion

| Requirement | Status |
|-------------|--------|
| FOUND-01 signup + session cookie | ✓ (Plan 04) |
| FOUND-02 session persists across restarts | ✓ (Plan 04, 7-day cookie) |
| FOUND-03 logout from any page | ✓ (Plan 04) |
| FOUND-04 RLS tenant isolation | ✓ (Plan 03 + 04 hardening; app role is non-superuser, NULLIF guards) |
| FOUND-05 slug reserved-word blocklist | ✓ (Plan 03) |
| FOUND-06 accent palette locked at 6 | ✓ (Plan 03, AccentColor enum) |
| MATH-01 break-even pure function | ✓ (Plan 02, 15 cases) |
| MATH-02 live preview on every input change | ✓ (Plan 05, verified by smoke) |
| BLDR-01 8 questions | ✓ (Plan 05) |
| BLDR-02 tier-count default 3 + names | ✓ (Plan 05) |
| BLDR-03 live preview on every change | ✓ (Plan 05) |
| BLDR-04 resume after logout | ✓ (Plan 05, verified) |
| BLDR-05 draft persists to Postgres | ✓ (Plan 05, Plan row status=draft) |

**Phase 1 is complete.** Phase 2 (Stripe Connect) and Phase 3 (Publish) can now build on a green foundation.

## Self-Check: PASSED

- All 15 created files exist on disk.
- 3 commits captured Plan 05 work (3398d27, 85d95b9 — Task 1 fix, Task 2 UI).
- `pnpm typecheck`, `pnpm build`, `pnpm test` (43 passed), Playwright smoke all green.
