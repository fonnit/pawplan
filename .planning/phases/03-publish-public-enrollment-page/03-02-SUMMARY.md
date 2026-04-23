---
phase: 03-publish-public-enrollment-page
plan: 02
subsystem: publish server action
tags: [server-action, stripe, idempotency, rls, math-canonical]
requires: [03-01]
provides:
  - publishPlan({ planId }): PublishPlanResult
  - createPlatformProduct / createPlatformPrice helpers
affects: [03-03, 03-04, Phase 4 Checkout]
tech-stack:
  added: []
  patterns: [stripe-idempotency-keys, withClinic-atomic-transaction, server-canonical-math]
key-files:
  created:
    - src/lib/stripe/products.ts
    - src/app/actions/publish.ts
    - src/app/actions/publish.test.ts
  modified: []
decisions:
  - "Products + Prices live on the PLATFORM account (no Stripe-Account header). Destination charges happen later via subscription.transfer_data in Phase 4."
  - "Idempotency key format: publish:{planId}:{tierId}:product and publish:{planId}:{tierId}:price:v1:{cents}."
  - "Client-supplied tier amounts are ignored — publishPlan re-reads Plan.builderInputs and re-runs computeBreakEven."
  - "On Stripe success + DB failure: log orphaned products/prices (no rollback) because a retry reuses the same idempotency keys."
metrics:
  duration: ~9m
  completed: 2026-04-23
requirements: [PUB-03, PUB-04, MATH-03]
---

# Phase 3 Plan 02: publishPlan Server Action Summary

**One-liner:** `publishPlan({ planId })` creates one Stripe Product + one Stripe Price per tier (platform account, idempotent) and flips Plan.status to published in a single atomic withClinic transaction.

## Public API

```typescript
export async function publishPlan(input: { planId: string }): Promise<PublishPlanResult>;
```

Error codes: `UNAUTHENTICATED | NO_CLINIC | NOT_PUBLISH_READY | NO_DRAFT_PLAN | ALREADY_PUBLISHED | VALIDATION_FAILED | STRIPE_PRODUCT_CREATE_FAILED | STRIPE_PRICE_CREATE_FAILED`.

## Idempotency key format

- **Product:** `publish:{planId}:{tierId}:product` (one per tier, written once at first publish and never rotated — BLDR-08).
- **Price v1:** `publish:{planId}:{tierId}:price:v1:{unitAmountCents}` (version 1; plan 03-04 introduces `price-edit:{planId}:{tierId}:v{N}:{cents}` for subsequent edits).

A retry of `publishPlan` after a network hiccup replays the same keys → Stripe returns the same Product and Price IDs → no duplicates.

## Atomicity guarantee

The DB update runs inside one `withClinic(clinic.id, tx)` transaction that:
1. Updates all `PlanTier` rows with `stripeProductId`, `stripePriceId`, `stripePriceHistory = [{ replacedAt: null, … }]`, `publishedAt = now()`.
2. Updates `Plan.status = 'published'`, `Plan.publishedAt = now()`.

If the transaction fails after Stripe objects were created (network blip, connection pool exhaustion), the Plan stays `draft`, the Stripe objects are orphaned but harmless, and a retry uses the same idempotency keys. Test case 5 (`STRIPE_PRODUCT_CREATE_FAILED`) covers the pre-Stripe failure path; a DB-failure-after-Stripe case is not currently tested but documented as an accepted risk.

## Test fixture pattern

Same as `src/lib/tenant.test.ts`: a `pg.Pool` on `DATABASE_URL_UNPOOLED` (superuser `pawplan`) seeds Clinic + User + Plan + PlanTier rows because strict-mode RLS on `Plan`/`PlanTier` blocks direct INSERTs from the app role. Assertions run through the normal Prisma client (app role `pawplan_app`, `NOBYPASSRLS`) so RLS is verified honestly.

Hoisted mocks for: `@/lib/stripe/client` (stripe singleton), `@/lib/auth` (getSession), `next/headers`, `next/cache`. Vitest's `vi.hoisted()` is required because `publish.ts` captures `stripe` at module load.

## Stripe SDK 22.0.2 surprises

None — `stripe.products.create()` and `stripe.prices.create()` signatures match SDK types. The second arg is `Stripe.RequestOptions` where `idempotencyKey` sits.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Next.js 16 revalidateTag requires `profile` second arg**
- **Found during:** Task 1 typecheck
- **Issue:** `revalidateTag(tag)` now signature is `revalidateTag(tag, profile: string | CacheLifeConfig)` in Next 16. Called with one arg → TS2554.
- **Fix:** Pass `'default'` as the second argument. That corresponds to the default cache-life profile (approx 5-min stale-while-revalidate in Next 16's new cacheLife semantics).
- **Files modified:** `src/app/actions/publish.ts`
- **Commit:** `b477d19`

## Self-Check: PASSED

- `src/lib/stripe/products.ts` — FOUND (exports createPlatformProduct + createPlatformPrice)
- `src/app/actions/publish.ts` — FOUND (exports publishPlan)
- `src/app/actions/publish.test.ts` — FOUND (5 test cases, all green)
- Commit `b477d19` — FOUND
- `pnpm test --run` — 79/79 tests pass
