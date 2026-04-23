---
phase: 02-stripe-connect-onboarding
plan: 01
subsystem: data-model
tags: [schema, rls, stripe, connect, idempotency]
requires: []
provides: [PUB-01-schema, PUB-02-gate]
affects: [02-02, 02-03, phase-3-publish]
tech-stack:
  added: []
  patterns:
    - "Idempotency PK: StripeEvent.id = Stripe event.id (globally unique) — no clinic FK; webhook handler ingests before clinic resolution."
    - "Two-mode RLS policy for StripeEvent: permissive when GUC unset (ingest path), strict when set (dashboard reads). Mirrors Clinic pattern from Phase 1."
    - "Canonical publish predicate `isPublishReady()` centralised in src/lib/stripe/types.ts — imported by UI + server actions + webhook derivation helper."
key-files:
  created:
    - prisma/sql/002-stripe-rls.sql
    - src/lib/stripe/types.ts
  modified:
    - prisma/schema.prisma
decisions:
  - "OnboardingState enum is 5 states (not_started / in_progress / action_required / complete / restricted) and derived centrally via deriveOnboardingState() — never hand-rolled at call sites."
  - "StripeEvent is NOT tenant-scoped via a clinicId FK. Stripe events arrive with only `event.account` (the connected acct_…). We resolve the clinic at read time by joining on Clinic.stripeAccountId."
  - "prisma db push flagged data-loss because of the new stripeAccountId @unique constraint. Applied with --accept-data-loss against local DB (no existing rows). Noted as deviation — tracked for prod migration."
metrics:
  duration: ~8m
  completed: 2026-04-23
---

# Phase 02 Plan 01: Prisma schema + Connect types + RLS Summary

Schema extension for Stripe Connect onboarding lifecycle: 7 new fields on Clinic + OnboardingState enum + StripeEvent idempotency table, plus the canonical TS types module `src/lib/stripe/types.ts` that Plans 02-02 and 02-03 import. RLS applied to StripeEvent using the same two-mode pattern proven in Phase 1 for Clinic.

## What shipped

- `prisma/schema.prisma` — added `OnboardingState` enum (5 variants), extended `Clinic` with 7 Stripe Connect fields (`stripeAccountId @unique`, charges/payouts/details booleans, disabledReason, requirements JSON, onboardingState enum, capabilitiesAt timestamp), added `StripeEvent` model keyed by Stripe's `event.id` with 3 supporting indexes (connectedAccountId, type+receivedAt, processedAt).
- `prisma/sql/002-stripe-rls.sql` — enables + forces RLS on StripeEvent, installs `tenant_isolation` policy with the two-mode USING/WITH CHECK identical to Clinic.
- `src/lib/stripe/types.ts` — exports `StripeConnectRequirements`, `OnboardingState`, `ConnectSnapshot`, `isPublishReady()`, `deriveOnboardingState()`, `StripeRequirementsJson`.

## DB state after push

- Local Docker Postgres on `localhost:5433` (pawplan db, pawplan owner role).
- `prisma db push --accept-data-loss` succeeded. Data-loss warning was cosmetic: the new `@unique` on `stripeAccountId` would fail on duplicates, but the column didn't exist yet so there were no rows to be affected.
- `pg_policies` shows `tenant_isolation` active on `StripeEvent`; `pg_tables.rowsecurity = true` on StripeEvent row.
- No RLS change on Clinic — the new fields inherit the existing Clinic policy unchanged.

## Typecheck

`pnpm typecheck` → exit 0. Zero TS errors after regenerating Prisma client.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `prisma db push --skip-generate` flag unsupported**
- **Found during:** Task 2 step 2
- **Issue:** The plan script called `pnpm prisma db push --skip-generate`; Prisma 7.8.0 treats `--skip-generate` as invalid here (documented flag only in migrate contexts). The CLI printed usage and exited non-zero.
- **Fix:** Ran `pnpm prisma db push --accept-data-loss` instead. `--accept-data-loss` was required because adding `@unique stripeAccountId` is flagged as a potentially-destructive DDL change even on an empty column. Client generation already happened in Task 1 via `prisma generate` so re-generation is redundant, not skipped.
- **Files modified:** none (command-level adjustment only)
- **Commit:** part of RLS commit.

### Auth Gates

None.

## Commits

- `feat(phase-02): 02-01 - extend Clinic schema with Connect fields + StripeEvent idempotency table` (Task 1)
- `feat(phase-02): 02-01 - StripeEvent RLS policy + shared Connect types module` (Task 2)

## Self-Check: PASSED

- `prisma/schema.prisma` — FOUND (grep confirms stripeAccountId, StripeEvent, OnboardingState)
- `prisma/sql/002-stripe-rls.sql` — FOUND (grep confirms ENABLE ROW LEVEL SECURITY)
- `src/lib/stripe/types.ts` — FOUND (exports isPublishReady, deriveOnboardingState)
- StripeEvent table + tenant_isolation policy present in local DB
- `pnpm typecheck` exits 0
