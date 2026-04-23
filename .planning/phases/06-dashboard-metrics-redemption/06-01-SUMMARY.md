---
phase: 06
plan: 01
subsystem: dashboard-metrics-redemption
tags: [mrr, arr, renewal-forecast, redemption, idempotency, optimistic-lock, timezone, rls]
requires:
  - Phase 4 Member schema (status, currentPeriodEnd, planTier.monthlyFeeCents + fee breakdowns)
  - Phase 3 PlanTier.includedServices (drives service-toggle checkboxes)
provides:
  - Dashboard business metrics (active members, MRR gross/fees/platform/net, projected ARR, 30-day renewal forecast, tier breakdown)
  - ServiceRedemption table + toggleRedemption library with DB-unique idempotency
  - formatInClinicTz render helper (Intl.DateTimeFormat + IANA zones)
  - Members-page expand-row with per-service redemption checkboxes
affects:
  - prisma/schema.prisma (new ServiceRedemption model; new Clinic.timezone column)
  - prisma/sql/006-redemption-rls.sql (Member-join RLS policy)
  - src/app/actions/members.ts (extended listMembers shape)
  - src/app/(dashboard)/dashboard/page.tsx (metrics cards)
  - src/app/(dashboard)/dashboard/members/members-table.tsx (clinic-tz dates + expand + RedemptionPanel)
tech-stack:
  added:
    - "(no new packages — leveraged existing Node 22 ICU + Prisma 7)"
  patterns:
    - Existence-as-state redemption (row present ≡ redeemed)
    - DB unique index (memberId, serviceKey, billingPeriodStart) as idempotency anchor, not app-layer guard
    - P2002-aware retry translates unique-violation race into {status: already_redeemed}
    - billingPeriodStart derived from Stripe's currentPeriodEnd minus 1 month (never wall clock)
    - Optimistic version column reserved for mutable-attribute v2 flows
    - Intl.DateTimeFormat with clinic.timezone — storage stays UTC, render shifts
key-files:
  created:
    - src/lib/metrics.ts
    - src/lib/metrics.test.ts
    - src/lib/redemption.ts
    - src/lib/redemption.test.ts
    - src/lib/time.ts
    - src/lib/time.test.ts
    - src/app/actions/metrics.ts
    - src/app/actions/redemption.ts
    - src/components/dashboard/metrics-cards.tsx
    - src/components/dashboard/redemption-panel.tsx
    - prisma/sql/006-redemption-rls.sql
    - .planning/phases/06-dashboard-metrics-redemption/deferred-items.md
  modified:
    - prisma/schema.prisma
    - src/app/actions/members.ts
    - src/app/actions/members.test.ts
    - src/app/(dashboard)/dashboard/page.tsx
    - src/app/(dashboard)/dashboard/members/page.tsx
    - src/app/(dashboard)/dashboard/members/members-table.tsx
decisions:
  - "Service redemption state is presence-of-row (existence-as-state), not a boolean column. Toggle-on = INSERT; toggle-off = DELETE. DB unique index is the idempotency anchor — not app-layer findUnique+create. Two simultaneous toggle-ons → Prisma P2002 on the loser, which we catch and re-fetch, returning status=already_redeemed."
  - "billingPeriodStart computed from Member.currentPeriodEnd - 1 calendar month, NEVER from wall clock. Stripe is the source of truth for period boundaries. When currentPeriodEnd is still null (new member in the gap between checkout.session.completed and first invoice.paid), the toggle is rejected with status=no_billing_period instead of writing against a null anchor."
  - "version column on ServiceRedemption is forward-compat plumbing for v2 mutable attributes (notes, photo, vet sig). Today version stays 0 and is only consulted if the caller supplies expectedVersion on a toggle-off — the test matrix exercises the conflict path so the scaffolding stays live."
  - "MRR excludes past_due + canceled. Past-due members are not paying this month (Smart Retries OFF); canceled members are gone. Past-due count surfaces separately as an attention-grab in the Active Members card."
  - "Projected ARR = gross × 12. SaaS-standard top-line (pre-fee). Net MRR is also shown, so there's no ambiguity — the breakdown card makes every deduction explicit."
  - "30-day renewal forecast excludes cancel-at-period-end members. An active member with a non-null canceledAt will flip to canceled at period end, not renew — so counting them would overstate forecasted revenue."
  - "Dashboard metrics load only when stripeOnboardingState==='complete'. Before onboarding completes, the Connect Stripe card + onboarding banner carry the page; zeroed metrics would be noise."
  - "Clinic.timezone defaults to America/New_York (locked). No settings-page UI yet — deferred (see deferred-items.md). formatInClinicTz falls back to UTC on invalid zones so a bad value never renders as em-dash."
metrics:
  duration: 14m
  tasks: 3 waves
  files_created: 12
  files_modified: 5
  completed: 2026-04-23T17:00:00Z
---

# Phase 6 Plan 01: Dashboard Metrics + Redemption Summary

## One-liner

Dashboard now surfaces MRR breakdown, projected ARR, 30-day renewal forecast, and tier composition; per-member rows expand to show staff-toggleable service redemption checkboxes whose idempotency is enforced by a DB unique index and whose billing period is anchored to Stripe's `current_period_end` (never wall clock). All dates render in the clinic's IANA time zone while storage stays UTC.

## What shipped

### Wave 1 — Schema (commit `71c74b9`)

- `ServiceRedemption` model: `memberId`, `serviceKey`, `billingPeriodStart`, `redeemedAt`, `redeemedByUserId`, `version`. Unique index on `(memberId, serviceKey, billingPeriodStart)` is the idempotency anchor.
- `Clinic.timezone` column (default `"America/New_York"`).
- `prisma/sql/006-redemption-rls.sql`: strict RLS with EXISTS(Member) clinic-id derivation — no denormalized `clinicId` column needed.
- `prisma db push` + RLS apply verified against local Postgres.

### Wave 2 — Libraries (commit `a8bfa9a`)

- **`src/lib/metrics.ts`** — `computeMrr`, `computeProjectedArrCents`, `breakdownByTier`, `computeRenewalForecast`, `formatUsdFromCents`. 15 unit tests.
- **`src/lib/redemption.ts`** — `toggleRedemption` (wraps DB-unique-constraint race, P2002 translation, optimistic-lock hook), `listRedemptionsForMember`. 6 integration tests against local Postgres including a 5-way concurrent insert that proves exactly-one-row-lands.
- **`src/lib/time.ts`** — `formatInClinicTz` (Intl.DateTimeFormat with IANA zone + UTC fallback), `billingPeriodStartFrom` (`currentPeriodEnd − 1 month`). 8 unit tests including NY vs LA cross-render and invalid-zone fallback.

### Wave 3 — Wiring (commit `bc802d1`)

- **`src/app/actions/metrics.ts`** — `loadDashboardMetrics` pulls every Member for the clinic (status-agnostic so past-due count is one query) and runs them through the pure metric fns.
- **`src/app/actions/redemption.ts`** — `toggleMemberService` wraps `toggleRedemption` with session gate, clinic resolve, Stripe-anchored `billingPeriodStart`, and `revalidatePath('/dashboard/members')` on success.
- **`src/app/actions/members.ts`** — `listMembers` extended to include `includedServices`, `redeemedServiceKeys`, and `billingPeriodStart` per member (one batched `serviceRedemption.findMany` across all members' periods).
- **`src/components/dashboard/metrics-cards.tsx`** — 4-card panel (Active members w/ past-due callout, MRR with gross/Stripe/platform breakdown, Projected ARR, 30-day Renewals w/ clinic-tz window-end) + tier breakdown list.
- **`src/components/dashboard/redemption-panel.tsx`** — optimistic-UI checkboxes per included service; rolls back on `not_found` | `no_billing_period` | `version_conflict`.
- **`src/app/(dashboard)/dashboard/page.tsx`** — metrics render gated on `stripeOnboardingState === 'complete'`.
- **`src/app/(dashboard)/dashboard/members/members-table.tsx`** — expandable rows, new Services column (`remaining/total`), all dates through `formatInClinicTz`.

## Requirements closed

| Req | Description | Verification |
|-----|-------------|--------------|
| DASH-01 | Active count + tier breakdown + MRR (gross/fees/platform/net) + 30-day forecast + ARR on dashboard home | `DashboardMetricsCards` + `loadDashboardMetrics`; 15 pure-fn tests in `metrics.test.ts` |
| DASH-02 | Per-member row: pet, species, plan, enrollment date, next billing, status badge, services remaining | MembersTable extended; `includedServices` + `redeemedServiceKeys` piped through `listMembers` |
| DASH-04 | Staff toggle per included service per billing period — idempotent on `(memberId, serviceKey, billingPeriodStart)` with optimistic locking | Prisma unique index + `toggleRedemption` + 6 integration tests (5-way race proves exactly-one lands) |
| DASH-06 | Dashboard renders in clinic's IANA time zone; storage stays UTC; `current_period_end` from Stripe is the anchor | `formatInClinicTz` + `billingPeriodStartFrom` + 8 unit tests including cross-zone render |

## Success criteria (from ROADMAP.md §6)

1. **MRR (gross / Stripe fees / platform fee / net), 30-day renewal forecast from `currentPeriodEnd`, projected ARR.** Shipped — see `metrics-cards.tsx` + `computeMrr` + `computeRenewalForecast`.
2. **Per-member row: pet, species, plan, enrollment, next billing, status badge, services remaining.** Shipped in `members-table.tsx`; services-remaining = `tier.includedServices.length − redeemedServiceKeys.length`.
3. **Redemption toggles idempotent on `(member_id, service_key, billing_period_start)` with optimistic locking.** Proven at the DB layer (unique index) and tested with a 5-way concurrent insert that produces exactly one row.
4. **Display in clinic's time zone; storage in UTC.** Every date in the metrics cards + members table uses `formatInClinicTz(date, clinic.timezone)`. Invalid zone falls back to UTC (tested).

## Deliverables check

- ✅ `prisma db push` succeeds (local Postgres 5433).
- ✅ `pnpm typecheck` clean.
- ✅ `pnpm build` green (all routes compile, no static-export regressions).
- ✅ `pnpm test` — **209 tests across 28 files pass** (29 new tests in this phase).
- ✅ Unit tests: MRR (5), renewal forecast (3), tier breakdown (3), USD fmt (3), ARR (2), time render (8), billingPeriodStart (3), redemption idempotent (6 integration).
- ✅ Dashboard home renders MRR / ARR / Forecast cards (gated on onboarding complete).
- ✅ Members page per-row redemption toggles functional (expand → checkboxes).
- 🟡 Clinic settings / timezone UI — **deferred** (documented in `deferred-items.md`). Schema + default in place; owner cannot change via UI yet.
- ✅ All commits on `main`: `71c74b9`, `a8bfa9a`, `bc802d1`.

## Deviations from Plan

**None of the Rule 1–3 kind.** Plan executed as written:

1. Wave 1 schema + RLS — added Clinic.timezone with locked default `America/New_York` exactly as the brief specified. ServiceRedemption shape + unique key matches the plan letter-for-letter.
2. Wave 2 libraries — metrics.ts exports match the plan (computeMrr / computeRenewalForecast / computeProjectedArr / breakdownByTier + Stripe-fee 2.9%+$0.30 estimate). redemption.ts adds the `already_redeemed` / `version_conflict` / `not_found` / `no_billing_period` return variants the brief implied.
3. Wave 3 wiring — dashboard page renders MRR / ARR / forecast cards; members page expandable rows with redemption toggles; `formatInClinicTz` used wherever a date renders.

**Test-fixture update (not a behavior deviation):** existing `members.test.ts` mock needed `serviceRedemption.findMany` wired through and `planTier.includedServices` added to fixture rows because `listMembers` return shape grew. Updated in the same Wave 3 commit; all 7 members tests still pass.

**Documented deferrals (tracked in `deferred-items.md`):**

- Clinic settings UI for editing timezone (schema + default in place; no form yet).
- Pre-existing `pnpm lint` breakage inside `@eslint/eslintrc` (circular JSON) — reproduces on `main` before Phase 6; `typecheck` + `build` + `test` all green, so not a regression. Belongs in an eslint-config upgrade PR.

## Pitfall guardrails (from execution context)

- ✅ Redemption uniqueness enforced by DB, not app. `redemption.test.ts` spawns 5 concurrent inserts; exactly one row lands, others come back `already_redeemed`.
- ✅ Optimistic locking rejects stale versions (`version_conflict` branch tested).
- ✅ `billingPeriodStart` always derived from `currentPeriodEnd − 1 month`; the server action short-circuits with `no_billing_period` if Stripe hasn't populated `currentPeriodEnd` yet.
- ✅ All metric + redemption queries go through `withClinic()`; cross-tenant test proves RLS blocks Clinic A from toggling Clinic B's member (returns `not_found`, zero rows written).
- ✅ Node 22 full ICU verified — `formatInClinicTz` renders IANA zones correctly, fallback path tested for bogus zone ids.

## Demo-ship follow-ups (carry-over into demo cut)

1. **Operator-run end-to-end sandbox smoke** (from Phase 5 carry-over): fire a real Stripe test Checkout → confirm SendGrid sandbox event → confirm worker drains → confirm the new member appears on the members page with dates in clinic-tz.
2. **Clinic timezone UI** (deferred): add a simple `<select>` on the still-unbuilt settings page so the demo clinic can switch between `America/New_York` and `UTC` to prove the DASH-06 story visually.
3. **Vercel Cron wiring** (Phase 5 carry-over): commit `vercel.json` with `/api/jobs/worker` every 60s when Phase 6 deploy lands.
4. **Pagination for members table** (Phase 4 carry-over): fine up to ~500 rows; revisit if demo data grows.
5. **Resend dep removal** (Phase 5 carry-over): `resend@6.0.3` still in package.json, unused. Sweep in next dep refresh.

## Known Stubs

None. All UI is wired to live server data (no placeholder arrays). The only "empty" state that can render is a legitimately empty clinic: zero members → zeroed cards + the existing "share your enrollment link" copy. Past-due callout appears only when `pastDueCount > 0`; tier breakdown renders only when `tierBreakdown.length > 0`.

## Self-Check: PASSED

- `src/lib/metrics.ts` — FOUND
- `src/lib/metrics.test.ts` — FOUND
- `src/lib/redemption.ts` — FOUND
- `src/lib/redemption.test.ts` — FOUND
- `src/lib/time.ts` — FOUND
- `src/lib/time.test.ts` — FOUND
- `src/app/actions/metrics.ts` — FOUND
- `src/app/actions/redemption.ts` — FOUND
- `src/components/dashboard/metrics-cards.tsx` — FOUND
- `src/components/dashboard/redemption-panel.tsx` — FOUND
- `prisma/sql/006-redemption-rls.sql` — FOUND
- Commit `71c74b9` — FOUND
- Commit `a8bfa9a` — FOUND
- Commit `bc802d1` — FOUND
