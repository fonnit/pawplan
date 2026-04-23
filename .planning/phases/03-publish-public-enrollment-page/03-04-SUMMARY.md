---
phase: 03-publish-public-enrollment-page
plan: 04
subsystem: rename + price-edit + dashboard chrome
tags: [server-action, dashboard, stripe, math-ui, bldr-06, bldr-08]
requires: [03-01, 03-02]
provides:
  - renameTiers({ planId, renames })
  - updatePlanPrices({ planId, priceChanges })
  - deriveTierFromMonthlyFeeCents helper
  - /dashboard/plans page (draft + published branches)
  - BreakEvenLineItems, PublishedPlanPanel, EditTierPricesDialog, TierRenameRow, PublishPlanButton
affects: [Phase 4 Checkout (old Price stays active for legacy subs)]
tech-stack:
  added: [shadcn/ui dialog]
  patterns: [append-only-price-history, same-product-new-price, greppable-disclosure-copy]
key-files:
  created:
    - src/app/(dashboard)/dashboard/plans/page.tsx
    - src/app/(dashboard)/dashboard/plans/_components/break-even-line-items.tsx
    - src/app/(dashboard)/dashboard/plans/_components/published-plan-panel.tsx
    - src/app/(dashboard)/dashboard/plans/_components/edit-tier-prices-dialog.tsx
    - src/app/(dashboard)/dashboard/plans/_components/tier-rename-row.tsx
    - src/app/(dashboard)/dashboard/plans/_components/publish-plan-button.tsx
    - src/components/ui/dialog.tsx
  modified:
    - src/lib/pricing/breakEven.ts
    - src/app/actions/publish.ts
    - src/app/actions/publish.test.ts
    - src/components/builder/break-even-panel.tsx
    - src/app/(dashboard)/dashboard/page.tsx
decisions:
  - "Price-edit disclosure copy is LOCKED — 'Applies to new enrollments only. Existing members keep their current price.' Greppable in edit-tier-prices-dialog.tsx."
  - "Impossible break-even (monthly fee too low) stores 0 in DB, renders 'Monthly fee too low' in UI."
  - "Rename disabled on published plans — renameTiers returns ALREADY_PUBLISHED, UI branch hides the affordance."
  - "Builder live preview + published panel BOTH render BreakEvenLineItems — visual parity guaranteed by single source."
  - "Dashboard home Publish button now routes to /dashboard/plans (the real affordance); Phase 2 stub was no-op."
metrics:
  duration: ~14m
  completed: 2026-04-23
requirements: [BLDR-06, BLDR-08, MATH-02, MATH-04, MATH-05]
---

# Phase 3 Plan 04: Rename + Price Edit + Dashboard Chrome Summary

**One-liner:** Closes the Phase 3 owner-facing loop — owner can rename tiers on a draft, click Publish (replaces the Phase 2 stub), edit prices post-publish on the same Stripe Product (old Price stays active for legacy subs), and see line-by-line break-even math in both the builder preview and the published panel.

## Updated `publish.ts` public API

```typescript
export async function publishPlan(input: { planId }): Promise<PublishPlanResult>;
export async function renameTiers(input: {
  planId: string;
  renames: Array<{ tierId: string; tierName: string }>;
}): Promise<{ ok: true } | { ok: false; code: PublishErrorCode; error: string }>;
export async function updatePlanPrices(input: {
  planId: string;
  priceChanges: Array<{ tierId: string; newMonthlyFeeCents: number }>;
}): Promise<
  | { ok: true; updatedTiers: Array<{ tierId; newPriceId; newUnitAmountCents }> }
  | { ok: false; code: PublishErrorCode; error: string }
>;
```

Error codes (shared): `UNAUTHENTICATED | NO_CLINIC | NOT_PUBLISH_READY | NO_DRAFT_PLAN | ALREADY_PUBLISHED | VALIDATION_FAILED | STRIPE_PRODUCT_CREATE_FAILED | STRIPE_PRICE_CREATE_FAILED`.

## Price-edit idempotency key format

- **Rename (no Stripe call):** n/a.
- **Price edit:** `price-edit:{planId}:{tierId}:v{N}:{unitAmountCents}` where `N = stripePriceHistory.length + 1` at edit time. A retry replays the same key → Stripe returns the same `price_…` ID → no duplicate prices in the dashboard.

Initial publish key format (from plan 03-02): `publish:{planId}:{tierId}:price:v1:{cents}`. The two key namespaces are disjoint — `publish:` vs `price-edit:` — so a republish of a plan (accidental or otherwise) never collides with an edit.

## Published-plan panel

Renders:
1. **Header card** — "Published since {date}" + `/slug/enroll` code snippet + Copy link + Open buttons.
2. **Plan tiers card** — one block per tier with tier name + monthly fee (Geist Mono 20px tabular, right-aligned) + the 6-row `BreakEvenLineItems` breakdown.
3. **"Edit prices" button** — top-right of the tiers card, opens `EditTierPricesDialog`.

Accent color flows from the clinic's `AccentColor` enum → `ACCENT_HEX` map (sage/terracotta/midnight/wine/forest/clay) → painted into the break-even count emphasis row.

## "Monthly fee too low" degenerate case

When Stripe fee + 10% platform fee exceed the monthly fee, `clinicGrossPerPetPerYearCents` goes negative → `breakEvenMembers` in the pure math would be `Number.POSITIVE_INFINITY`. `deriveTierFromMonthlyFeeCents` returns `Infinity`; `updatePlanPrices` coerces to 0 before the DB write. `BreakEvenLineItems` maps 0 (or >99,999) to the literal string `"Monthly fee too low"` in the emphasis row.

Builder `BreakEvenPanel` likewise coerces `!Number.isFinite(breakEvenMembers) → 0` before handing to `BreakEvenLineItems` so the live preview and the published view render the same sentinel.

## Requirement coverage (plan frontmatter)

- **BLDR-06** ✓ — TierRenameRow + renameTiers; rejects renames on published plans.
- **BLDR-08** ✓ — updatePlanPrices creates a new Stripe Price on the same Product; old Price stays active so existing subscriptions keep their rate; UI disclosure "Applies to new enrollments only."
- **MATH-02** ✓ — Builder live preview now renders through BreakEvenLineItems, identical to the published view.
- **MATH-04** ✓ — Retail value / monthly fee / clinic gross / break-even count all rendered as explicit rows.
- **MATH-05** ✓ — Stripe fee + 10% platform fee rendered as negative line items.

**BLDR-07 remains deferred to Phase 4** — pet name / species / owner email are collected inside Stripe Checkout per architecture, not on the enrollment page.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Pool teardown collision across describe blocks**
- **Found during:** Task 1 test run
- **Issue:** Each describe had its own `afterAll(() => pool.end())`. Multiple describes in the same file sharing `superuserPool` → first describe's teardown closed the pool, later describes threw `Cannot use a pool after calling end on the pool`.
- **Fix:** Moved `beforeAll`/`afterAll` to file scope (outside all describes) so the pool opens once and closes once.
- **Files modified:** `src/app/actions/publish.test.ts`
- **Commit:** `dd349c7`

**2. [Rule 2 - Missing critical wiring] Dashboard home Publish button was a no-op**
- **Found during:** Task 2 integration check
- **Issue:** `src/app/(dashboard)/dashboard/page.tsx` rendered `<PublishButton canPublish … blockedReason … />` with no `onPublish` handler — clicking it did literally nothing. Phase 3's real publish flow lives on `/dashboard/plans`.
- **Fix:** When `canPublish` is true, dashboard home now shows a "Review & publish" link to `/dashboard/plans` where the real `PublishPlanButton` lives. When blocked, shows the same disabled-with-tooltip pattern inline (avoids duplicating the client component just for a disabled state).
- **Files modified:** `src/app/(dashboard)/dashboard/page.tsx`
- **Commit:** `71dac30`

**3. [Infra] Installed shadcn `dialog` primitive**
- **Found during:** Task 2 start (dialog.tsx absent)
- **Action:** `pnpm dlx shadcn@latest add dialog --yes` — pulled the component into `src/components/ui/dialog.tsx`. No dependency version changes; radix-ui was already a dep.
- **Files modified:** `src/components/ui/dialog.tsx` (new)
- **Commit:** `71dac30`

## Self-Check: PASSED

- `src/app/actions/publish.ts` — FOUND (exports publishPlan, renameTiers, updatePlanPrices)
- `src/lib/pricing/breakEven.ts` — MODIFIED (deriveTierFromMonthlyFeeCents exported)
- `src/app/(dashboard)/dashboard/plans/page.tsx` — FOUND
- `src/app/(dashboard)/dashboard/plans/_components/break-even-line-items.tsx` — FOUND
- `src/app/(dashboard)/dashboard/plans/_components/published-plan-panel.tsx` — FOUND
- `src/app/(dashboard)/dashboard/plans/_components/edit-tier-prices-dialog.tsx` — FOUND (disclosure copy present)
- `src/app/(dashboard)/dashboard/plans/_components/tier-rename-row.tsx` — FOUND
- `src/app/(dashboard)/dashboard/plans/_components/publish-plan-button.tsx` — FOUND
- `src/components/ui/dialog.tsx` — FOUND
- `grep -cF 'createPlatformProduct(' src/app/actions/publish.ts` — returns 1 (publishPlan only)
- `grep -cF 'createPlatformPrice(' src/app/actions/publish.ts` — returns 2 (publishPlan + updatePlanPrices)
- `pnpm test --run` — 88/88 pass
- `pnpm build` — PASS (route tree includes /dashboard/plans + /[slug]/enroll)
- Commits `dd349c7` + `71dac30` — FOUND
