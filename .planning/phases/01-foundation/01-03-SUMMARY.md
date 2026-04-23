---
phase: 01-foundation
plan: 03
subsystem: data-model
tags: [schema, rls, tenancy, slug, prisma]
requires: [01-01]
provides: [FOUND-04, FOUND-05, FOUND-06]
affects: [01-04-auth, 01-05-builder, phase-3-publish]
tech-stack:
  added: []
key-files:
  created:
    - prisma/sql/001-rls-policies.sql
    - src/lib/slug.ts
    - src/lib/slug.test.ts
    - src/lib/tenant.ts
    - src/lib/tenant.test.ts
  modified:
    - prisma/schema.prisma
decisions:
  - "Every tenant-scoped query must flow through withClinic(clinicId, fn). RLS blocks cross-tenant reads even if a WHERE clause is forgotten."
  - "current_setting('app.current_clinic_id', true) uses the `missing-ok` variant so unprivileged queries fail-closed (return zero rows) instead of raising."
  - "SET LOCAL inside $transaction scopes the GUC to the transaction — safe across the serverless pool checkout."
  - "RESERVED_SLUGS covers 40+ names: app routes, brand, and obvious marketing pages."
  - "Accent color enum ships exactly 6 presets per CONTEXT Q2: sage/terracotta/midnight/wine/forest/clay."
metrics:
  duration: ~15m
  completed: 2026-04-23
---

# Phase 01 Plan 03: Schema + RLS + Slug Summary

Defines the Phase 1 Prisma data model (Better Auth + tenant Clinic/Plan/PlanTier), layers Postgres RLS on every tenant-scoped table to satisfy FOUND-04, and ships slug safety with reserved-word rejection (FOUND-05) plus the 6-preset accent palette (FOUND-06).

## Confirmed tables after `db push` — **PENDING**

`prisma db push` could not run during executor session because `DATABASE_URL` is not yet provisioned — see `TODO-DB-PUSH.md` at repo root. When Daniel provides a Neon URL, the orchestrator will run the three pending commands (generate → push → apply RLS SQL → re-run tenant.test.ts).

Expected tables after push: `Account`, `Clinic`, `Plan`, `PlanTier`, `Session`, `User`, `Verification`.

## Neon role / BYPASSRLS — **PENDING**

To be captured after `db push` runs. The SQL uses `FORCE ROW LEVEL SECURITY` so RLS applies even when the connection user is the table owner (Neon's default `neondb_owner` role is the table owner). If the role has `rolbypassrls = true`, the FORCE clause is the guard that keeps cross-tenant isolation working — to be verified in Phase 2 as a follow-up (separate restricted app role).

## Output of the RLS SQL execution — **PENDING**

See `TODO-DB-PUSH.md`. Expected: three `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` + three `ALTER TABLE ... FORCE ROW LEVEL SECURITY` + three `CREATE POLICY tenant_isolation` statements executed with no errors.

## Cross-tenant isolation test results — **PENDING**

Test file `src/lib/tenant.test.ts` authored with 4 cases:

1. `clinic A cannot see clinic B plans even with no WHERE filter`
2. `clinic B cannot see clinic A plans`
3. `raw SELECT inside withClinic() respects RLS (no clinicId filter)`
4. `rejects non-UUID clinicId`

Current status: **4 skipped** (stub DATABASE_URL). Will flip to pass once a live Neon URL populates `.env.local` and the orchestrator re-runs the suite.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] DATABASE_URL not yet provisioned**
- **Found during:** Task 1 step 5 (prisma db push is [BLOCKING])
- **Issue:** Plan 01-03 Task 1 mandates `pnpm prisma db push --skip-generate` with acceptance criterion `exit 0`. The orchestrator instructions override this: "if DATABASE_URL unset, do not fail; record the pending command in TODO-DB-PUSH.md and continue."
- **Fix:** Wrote `TODO-DB-PUSH.md` at repo root listing the four pending commands (generate → push → apply RLS SQL → run tenant.test.ts) with expected output for each. `prisma generate` still ran successfully (it doesn't need a live DB) so downstream Plans 04 and 05 can use the generated types.
- **Files modified:** `TODO-DB-PUSH.md` (new)
- **Commit:** `95929f8`

**2. [Rule 1 - Bug] tenant.test.ts beforeAll/afterAll runs despite describe.skip**
- **Found during:** Task 2 (running `pnpm test`)
- **Issue:** Vitest 4 executes `beforeAll`/`afterAll` hooks for a skipped describe block, causing `process.env['DATABASE_URL']=stub` to blow up the Zod parser in `src/lib/env.ts` (imported transitively via `./db`).
- **Fix:** Lazy-import `./db` + `./tenant` inside `beforeAll` and early-return when `IS_STUB`. Skip the Zod parse by never evaluating `src/lib/env.ts` in the stub case.
- **Files modified:** `src/lib/tenant.test.ts`
- **Commit:** `4386e34`

### Auth Gates

None.

## Follow-ups for Phase 2

- **Separate restricted app role.** Neon's default `neondb_owner` is the table owner and likely has `BYPASSRLS` implicitly via ownership; `FORCE ROW LEVEL SECURITY` is what keeps us safe. Phase 2 should provision a non-owner app role with `GRANT SELECT,INSERT,UPDATE,DELETE` on the tenant tables (no DDL) so RLS also applies transitively via role, not just via FORCE. Add to `.planning/STATE.md` Blockers/Concerns.
- **Slug-change UX.** Currently `slug` is `@unique` in schema but FOUND-05 marks slug-change as a support-action; no DB-level lock. Low-risk for v1 (accept T-01-03-06) but Phase 3 should add a Prisma trigger or application guard before shipping public enrollment URLs.

## Known Stubs

- **tenant.test.ts skipped** — will flip to pass when live DB connection available. Not a product-surface stub, so no impact on user-facing goals.

## Self-Check: PASSED

- `prisma/schema.prisma` contains model Clinic / Plan / PlanTier / User / Session / Account / Verification + enums AccentColor / PlanStatus — FOUND (9 matches)
- `prisma/schema.prisma` has `slug String @unique` — FOUND
- `src/lib/slug.ts` exports `normalizeSlug`, `validateSlug`, `RESERVED_SLUGS`, `ACCENT_COLORS` — FOUND (≥4)
- `src/lib/slug.test.ts` has 18 `it(` blocks — FOUND (≥10)
- `pnpm test src/lib/slug.test.ts` — PASS (18 tests)
- `prisma/sql/001-rls-policies.sql` has `ENABLE ROW LEVEL SECURITY` x3, `CREATE POLICY tenant_isolation` x3, `current_setting('app.current_clinic_id', true)` x3 — VERIFIED
- `src/lib/tenant.ts` exports `withClinic` and uses `SET LOCAL app.current_clinic_id` — FOUND
- `pnpm test` overall: 36 passed, 4 skipped — PASS
- `pnpm typecheck` — PASS
- Commits `95929f8` and `4386e34` — present in `git log`
