---
phase: 03-publish-public-enrollment-page
plan: 01
subsystem: schema + public-read surface
tags: [schema, rls, view, stripe, types]
requires: [phase-01, phase-02]
provides:
  - PlanTier.stripeProductId / stripePriceId / stripePriceHistory / publishedAt
  - v_public_clinic_plans (SECURITY DEFINER view)
  - PublishedPlanSnapshot, PublishedPlanTierSnapshot, PublishedPriceHistoryEntry, PublishPlanResult, PublishErrorCode
affects: [03-02, 03-03, 03-04]
tech-stack:
  added: []
  patterns: [SECURITY-DEFINER-view, append-only-JSON-history, RLS-FORCE-reassertion]
key-files:
  created:
    - prisma/sql/003-plan-publish-rls.sql
    - prisma/sql/004-public-clinic-view.sql
  modified:
    - prisma/schema.prisma
    - src/lib/stripe/types.ts
decisions:
  - "SECURITY DEFINER view is the contract for public read (not raw Plan/PlanTier access)."
  - "stripePriceHistory stored as JSON array (append-only), not a junction table."
  - "Plan compound index (clinicId, status, publishedAt) for future published-plan queries."
metrics:
  duration: ~6m
  completed: 2026-04-23
requirements: [PUB-03, PUB-04, PUB-05, BLDR-08]
---

# Phase 3 Plan 01: Schema + Public Read Surface Summary

**One-liner:** New nullable publish fields on PlanTier + a SECURITY DEFINER view exposing only published plans, backed by canonical TS snapshot types shared across the four Phase 3 plans.

## Columns added to `PlanTier`

| Column             | Type        | Nullable | Purpose                                                         |
| ------------------ | ----------- | -------- | --------------------------------------------------------------- |
| stripeProductId    | text        | yes      | `prod_…` on the platform account; set once at first publish     |
| stripePriceId      | text        | yes      | `price_…`; rotates on price edit                                |
| stripePriceHistory | jsonb       | yes      | append-only `[{priceId, unitAmountCents, createdAt, replacedAt}]` |
| publishedAt        | timestamp   | yes      | per-tier first-publish stamp (null = still draft)               |

Indexes added:
- `PlanTier_stripePriceId_idx` — lookup by Stripe price id (webhook path, Phase 4+).
- `PlanTier_planId_publishedAt_idx` — most-recent-published-tier queries.
- `Plan_clinicId_status_publishedAt_idx` — dashboard + listing queries.

## View: `v_public_clinic_plans`

SECURITY DEFINER so the public enrollment page can SELECT without a clinic GUC (the app role is `NOBYPASSRLS`, so querying `Plan` or `PlanTier` directly from that context returns zero rows by RLS).

Column list (explicit — new PlanTier columns do NOT auto-propagate):

```
clinic_slug, clinic_practice_name, clinic_logo_url, clinic_accent_color,
plan_id, plan_published_at, plan_tier_count,
tier_id, tier_key, tier_name, tier_included_services,
tier_retail_value_bundled_cents, tier_monthly_fee_cents,
tier_stripe_fee_per_charge_cents, tier_platform_fee_per_charge_cents,
tier_clinic_gross_per_pet_per_year_cents, tier_break_even_members,
tier_stripe_price_id, tier_ordering
```

Filter: `WHERE p.status = 'published' AND p.publishedAt IS NOT NULL AND t.stripePriceId IS NOT NULL`.

Grants: `GRANT SELECT … TO pawplan_app`. `REVOKE ALL … FROM PUBLIC`. Owner: `pawplan` (superuser). No clinic PII beyond slug / practice name / logo / accent is exposed — `builderInputs`, `monthlyProgramOverheadUsd`, `Plan.id -> Clinic.id` mapping not joined out.

## New type exports (`src/lib/stripe/types.ts`)

- `PublishedPriceHistoryEntry`
- `PublishedPlanTierSnapshot`
- `PublishedPlanSnapshot`
- `PublishPlanResult` (discriminated union with `ok: true/false`)
- `PublishErrorCode` (string-union; mirrors `OnboardingState` pattern)

Existing exports (`isPublishReady`, `deriveOnboardingState`, `ConnectSnapshot`, `StripeConnectRequirements`, `OnboardingState`, `StripeRequirementsJson`) are unchanged.

## psql application notes

- Both .sql files applied cleanly via `psql "$DATABASE_URL_UNPOOLED"` as the `pawplan` superuser.
- Required removing the `?schema=public` query string from the Prisma connection URL before passing to `psql` (psql rejects unknown URI query parameters).
- Confirmed `pawplan_app` can `SELECT count(*) FROM v_public_clinic_plans` with no clinic GUC set (returned 0 rows, no permission error).
- Existing tenant RLS test suite (`src/lib/tenant.test.ts`) still green after schema change (23/23 tests pass).

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check: PASSED

- `prisma/schema.prisma` — FOUND (PlanTier has 4 new fields + 2 new indexes; Plan has compound index)
- `prisma/sql/003-plan-publish-rls.sql` — FOUND
- `prisma/sql/004-public-clinic-view.sql` — FOUND
- `src/lib/stripe/types.ts` — FOUND (new exports verified via grep)
- Commit `9942397` — FOUND (schema + RLS)
- Commit `3fd1a01` — FOUND (view + types)
