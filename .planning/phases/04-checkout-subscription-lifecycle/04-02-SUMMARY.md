---
phase: 04-checkout-subscription-lifecycle
plan: 02
subsystem: checkout
tags: [stripe, checkout, destination-charges, enrollment-api]
requires: [04-01]
provides: [createEnrollmentCheckoutSession, POST /api/enroll/[slug]/[tierId], /[slug]/enroll/success]
affects:
  - src/lib/stripe/checkout.ts
  - src/lib/stripe/checkout.test.ts
  - src/app/api/enroll/[slug]/[tierId]/route.ts
  - src/components/enrollment/tier-comparison.tsx
  - src/app/[slug]/enroll/success/page.tsx
tech-stack:
  added: []
  patterns:
    - Destination charges on PLATFORM-scoped Stripe call (no stripeAccount header)
    - Per-minute idempotency bucket on Checkout session create (rage-click dedupe)
    - subscription_data.metadata as the DB-join contract for the webhook handler
    - Tight nested Prisma select for public route (no RLS; tight WHERE + select)
key-files:
  created:
    - src/lib/stripe/checkout.ts
    - src/lib/stripe/checkout.test.ts
    - src/app/api/enroll/[slug]/[tierId]/route.ts
    - src/app/[slug]/enroll/success/page.tsx
  modified:
    - src/components/enrollment/tier-comparison.tsx
decisions:
  - PLATFORM_FEE_PERCENT = 10 as the single source of truth (no env override)
  - Minute-bucketed idempotency key collapses rage-clicks; 61s retry still works
  - Custom fields collected inside Stripe Checkout (BLDR-07) — SAQ-A posture preserved
  - success page does NOT verify cs session (webhook is source of truth for 'active')
  - Route returns 404 on unknown slug to avoid slug enumeration leak (PITFALLS #5)
metrics:
  duration: ~6m
  completed: 2026-04-23
---

# Phase 4 Plan 02: Checkout Session wiring Summary

Turns the Phase 3 `toast.info` stub into a real Stripe-hosted Checkout with destination charges, 10% application fee, and pet-owner custom fields.

## Deliverables

1. **`src/lib/stripe/checkout.ts`** — `createEnrollmentCheckoutSession({ clinic, tier, ownerEmailHint, origin })`:
   - `mode: 'subscription'`, `line_items: [{ price: tier.stripePriceId, quantity: 1 }]`
   - `subscription_data.transfer_data.destination = clinic.stripeAccountId`
   - `subscription_data.application_fee_percent = PLATFORM_FEE_PERCENT` (10)
   - `subscription_data.metadata = { clinicId, planId, planTierId }` (CheckoutSubscriptionMetadata)
   - `custom_fields`: `pet_name` (text, 1–60 chars) + `species` (dropdown dog/cat)
   - `success_url = ${origin}/${slug}/enroll/success?cs={CHECKOUT_SESSION_ID}`
   - `cancel_url = ${origin}/${slug}/enroll`
   - Idempotency key: `enroll:${clinicId}:${tierId}:${minuteBucket}`
   - Throws `EnrollmentNotReadyError` if `stripeAccountId` or `stripePriceId` missing
   - NO `stripeAccount` header — destination charges are PLATFORM calls

2. **`src/app/api/enroll/[slug]/[tierId]/route.ts`** — POST route:
   - Resolves `origin` from `x-forwarded-proto` + `host` headers
   - Single Prisma `findFirst` joining PlanTier → Plan → Clinic with tight `select`
   - Returns 404 on unknown slug / draft plan (PITFALLS #5)
   - Returns 409 on `!isPublishReady()` (capabilities revoked since publish)
   - Returns 409 on `EnrollmentNotReadyError`
   - Returns 200 `{ url }` on success

3. **`src/components/enrollment/tier-comparison.tsx`** — real redirect:
   - Replaces `toast.info` stub with `fetch → window.location.assign(url)`
   - `pendingTierId` local state disables the button during fetch
   - Friendly error mapping for `clinic_not_accepting_enrollments`

4. **`src/app/[slug]/enroll/success/page.tsx`** — post-Checkout landing:
   - Renders ClinicHeader + confirmation copy
   - `generateMetadata` pulls clinic name for document title
   - Deliberately does NOT verify `cs` session — webhook is the source of truth

## Interface contract for Plan 04-03

The webhook handler reads these keys verbatim from `subscription.metadata`:
```ts
interface CheckoutSubscriptionMetadata {
  clinicId: string;
  planId: string;
  planTierId: string;
}
```
And these custom_fields keys from the Checkout session:
```ts
CHECKOUT_CUSTOM_FIELD_KEYS = { petName: 'pet_name', species: 'species' }
```

## Verification

- `pnpm exec vitest run src/lib/stripe/checkout.test.ts` → 10/10
- Full suite: 109/109 (no regressions)
- `pnpm exec tsc --noEmit -p .` → clean
- `grep -rE "CardElement|PaymentElement|card\[number" src/` → 0 matches (SAQ-A posture)
- `grep -r "application_fee_percent" src/lib/stripe/` (excluding tests) → exactly 1 line (single source of truth)

## Deviations from Plan

- **[Rule 1 - Bug]** The plan's example Prisma select had `clinic: { ... }` at the top level of `planTier.findFirst({ select })`, but Prisma 7 only exposes a `plan` relation on `PlanTier` (not a direct `clinic` relation — even though `clinicId` is stored). Fixed inline by nesting: `plan: { select: { clinic: { select: {...} } } }`. Functionally identical, and comments document the "why". No architectural impact.

## Commits

- `1dd1fa3` test(phase-04): plan 02 task 1 RED - createEnrollmentCheckoutSession contract
- `b09c6cb` feat(phase-04): plan 02 task 1 GREEN - createEnrollmentCheckoutSession helper
- `2a3fa41` feat(phase-04): plan 02 task 2 - POST /api/enroll/[slug]/[tierId] route
- `d1b4ec8` feat(phase-04): plan 02 task 3 - real Checkout redirect + success page

## Self-Check: PASSED

All files exist, all tests pass, tsc clean, grep defenses clean.
