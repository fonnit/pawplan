---
phase: 04-checkout-subscription-lifecycle
plan: 01
subsystem: persistence
tags: [prisma, rls, types, member-lifecycle]
requires: [phase-03-complete]
provides: [Member model, MemberStatus enum, RLS strict-mode on Member, TS type contracts]
affects: [prisma/schema.prisma, prisma/sql/005-member-rls.sql, src/lib/stripe/types.ts]
tech-stack:
  added: []
  patterns:
    - Strict-mode RLS with NULLIF GUC coercion (mirrors Plan/PlanTier)
    - Composite @@unique([clinicId, stripeSubscriptionId]) for webhook replay safety
    - TS union enum mirroring Prisma enum as single source of truth
key-files:
  created:
    - prisma/sql/005-member-rls.sql
  modified:
    - prisma/schema.prisma
    - src/lib/stripe/types.ts
    - src/lib/stripe/types.test.ts
decisions:
  - MemberStatus is an enum at BOTH the Postgres and TS levels (PAY-07 defense at every layer)
  - Strict RLS (not two-mode like Clinic) — webhook dispatcher resolves clinicId BEFORE any Member write
  - deriveMemberStatusFromSubscription maps unknown/future Stripe statuses to past_due (fail-safe flag)
  - currentPeriodEnd mirrored on Member so dashboard renders cancellation countdown without Stripe round-trip
  - planTierId FK uses onDelete: Restrict (prevents deleting a tier with active members)
metrics:
  duration: ~5m
  completed: 2026-04-23
---

# Phase 4 Plan 01: Member schema + RLS + types Summary

Member persistence foundation for Phase 4 — three files that every downstream plan (04-02 Checkout, 04-03 webhooks, 04-04 dashboard) imports.

## Deliverables

1. **`prisma/schema.prisma`** — new `Member` model + `MemberStatus` enum:
   - UUID PK, `clinicId` FK (cascade), `planTierId` FK (restrict)
   - Stripe linkage: `stripeCustomerId`, `stripeSubscriptionId @unique`
   - Custom fields from Stripe Checkout: `petName`, `species`, `ownerEmail`
   - Lifecycle: `status` (enum), `currentPeriodEnd`, `enrolledAt`, `paymentFailedAt`, `canceledAt`
   - Indexes: `@@unique([clinicId, stripeSubscriptionId])`, `@@index([clinicId, status])`, `@@index([clinicId, paymentFailedAt])`, `@@index([planTierId])`
   - Back-relations added to `Clinic.members` and `PlanTier.members`

2. **`prisma/sql/005-member-rls.sql`** — strict-mode RLS policy:
   - `FORCE ROW LEVEL SECURITY` with NULLIF GUC coercion
   - WITH CHECK clause rejects cross-tenant INSERTs (T-04-01-04)
   - Verified: `pawplan_app` with unset GUC returns 0 rows (T-04-01-01)

3. **`src/lib/stripe/types.ts`** — TS type contract:
   - `MemberStatus` union: `'active' | 'past_due' | 'canceled'`
   - `CHECKOUT_CUSTOM_FIELD_KEYS = { petName: 'pet_name', species: 'species' }`
   - `SPECIES_OPTIONS = [{ value: 'dog', label: 'Dog' }, { value: 'cat', label: 'Cat' }]`
   - `CheckoutSubscriptionMetadata { clinicId, planId, planTierId }`
   - `deriveMemberStatusFromSubscription(status: string): MemberStatus`

## Contract for Plans 04-02, 04-03, 04-04

- **04-02 Checkout** imports `CHECKOUT_CUSTOM_FIELD_KEYS`, `SPECIES_OPTIONS`, `CheckoutSubscriptionMetadata` to build `Stripe.Checkout.SessionCreateParams.custom_fields` + `subscription_data.metadata`.
- **04-03 Webhook handlers** import `MemberStatus`, `CHECKOUT_CUSTOM_FIELD_KEYS` (to read back custom_fields), `CheckoutSubscriptionMetadata` (to parse subscription.metadata), and write to the `Member` model via `withClinic()`.
- **04-04 Dashboard** reads `Member` via `listMembers` server action (wrapped in `withClinic`) and exports a `MemberRow` shape that deliberately OMITS `stripeCustomerId` / `stripeSubscriptionId` (T-04-04-02 mitigation).

## Verification

- `pnpm exec prisma validate` → clean
- `pnpm exec prisma db push` → Member table + MemberStatus enum applied, no drift
- `psql -c '\d "Member"'` confirms status column type is `MemberStatus` enum
- `psql` as `pawplan_app` with unset GUC returns 0 rows (RLS fail-closed)
- `pnpm exec vitest run src/lib/stripe/types.test.ts` → 21/21 passing
- `grep -rE "is_active|isActive|memberActive" src/lib src/app` → 0 matches (PAY-07 defense)

## Deviations from Plan

None — plan executed exactly as written.

## Commits

- `56a5694` feat(phase-04): plan 01 task 1 - Member model + MemberStatus enum
- `4f79df4` feat(phase-04): plan 01 task 2 - Member RLS strict-mode policy
- `a90b214` test(phase-04): plan 01 task 3 RED - MemberStatus + checkout custom-field contract tests
- `6c87fe2` feat(phase-04): plan 01 task 3 GREEN - MemberStatus + Checkout custom-field types

(Exact short-hashes captured after final metadata commit; see git log.)

## Self-Check: PASSED

All files exist, all tests pass, all migrations applied, all RLS policies active.
