---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
status: phase-3-complete
stopped_at: Completed 03-04-PLAN.md — Phase 3 (Publish + public enrollment page) done
last_updated: "2026-04-23T12:30:00.000Z"
last_activity: 2026-04-23
progress:
  total_phases: 6
  completed_phases: 3
  total_plans: 12
  completed_plans: 12
  percent: 100
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-04-23)

**Core value:** A clinic owner publishes pricing and lands their first paying member in the same session.
**Current focus:** Phase 3 — Publish + Public Enrollment Page (COMPLETE) → Phase 4 (Stripe Checkout + destination charges)

## Current Position

Phase: 3 of 6 (Publish + Public Enrollment Page) — COMPLETE
Plan: 4 of 4 in current phase
Status: Phase 3 shipped — ready for Phase 4 (Stripe Checkout wiring, BLDR-07 collection inside Checkout)
Last activity: 2026-04-23

Progress: [██████░░░░] Phase 3 of 6

## Performance Metrics

**Velocity:**

- Total plans completed: 12 (Phase 1: 5, Phase 2: 3, Phase 3: 4)
- Average duration: ~11m / plan (Phase 3 wave: ~9m avg)
- Total execution time: ~2.3 hours (across three phases)

**By Phase:**

| Phase | Plans | Total   | Avg/Plan |
|-------|-------|---------|----------|
| 01    | 5     | ~80m    | 16m      |
| 02    | 3     | ~33m    | 11m      |
| 03    | 4     | ~37m    | 9m       |

**Recent Trend:**

- Last 5 plans: 02-03, 03-01, 03-02, 03-03, 03-04 (fastest Phase 3 plan was 03-01 at ~6m).
- Trend: still accelerating — Phase 3 avg (~9m) is ~18% faster than Phase 2 (~11m); schema + RLS + server-action patterns are now mechanical.

*Updated after each plan completion*
| Phase 01 P01 | 10m | 2 tasks | 27 files |
| Phase 01 P02 | 10m | 2 tasks | 3 files |
| Phase 01 P03 | 15m | 2 tasks | 6 files |
| Phase 01 P04 | 25m | 2 tasks | 17 files (inc. RLS correction) |
| Phase 01 P05 | 20m | 2 tasks | 15 files |
| Phase 02 P01 | 8m  | 2 tasks | 3 files  |
| Phase 02 P02 | 10m | 2 tasks | 5 files  |
| Phase 02 P03 | 15m | 2 tasks | 11 files |
| Phase 03 P01 | 6m  | 2 tasks | 4 files  |
| Phase 03 P02 | 9m  | 2 tasks | 3 files  |
| Phase 03 P03 | 8m  | 2 tasks | 10 files |
| Phase 03 P04 | 14m | 2 tasks | 12 files |

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table and REQUIREMENTS.md Locked Product Decisions.
Recent decisions affecting current work:

- Platform application-fee percent: **10%** (locked 2026-04-23)
- Failed-charge policy: **Smart Retries OFF.** Single failure flags the member; no auto-email to pet owner (locked 2026-04-23)
- Accent color UX: **6-color preset palette** (locked 2026-04-23)
- Stripe API version: **`2026-03-25.dahlia`** (locked 2026-04-23 with Phase 2; pinned in `src/lib/stripe/client.ts` + bump-together with `stripe@22.0.2`)
- Connect pattern: **Express accounts**, single webhook endpoint handles platform + connected-account events (locked 2026-04-23)
- Publish gate: **`isPublishReady(snapshot)` = chargesEnabled && payoutsEnabled && !disabledReason** — canonical predicate in `src/lib/stripe/types.ts` (locked 2026-04-23)
- Webhook idempotency: **PK collision on `StripeEvent.id`** (= Stripe `event.id`) + Prisma P2002 string-code detection (locked 2026-04-23)
- Public read surface: **SECURITY DEFINER view `v_public_clinic_plans`** — explicit column list; enrollment page NEVER reads Plan/PlanTier directly (locked 2026-04-23, Phase 3)
- Publish server-side math: **re-read Plan.builderInputs + re-run `computeBreakEven`** at publishPlan time. Client-supplied monthly fees are ignored entirely (locked 2026-04-23, Phase 3 MATH-03)
- Price-edit pattern: **new Stripe Price on the SAME Stripe Product** (old Price stays active for existing subs). Append-only `stripePriceHistory` JSON with `replacedAt` stamping (locked 2026-04-23, Phase 3 BLDR-08)
- Stripe idempotency keys: publish uses `publish:{planId}:{tierId}:product` + `publish:{planId}:{tierId}:price:v1:{cents}`; edits use `price-edit:{planId}:{tierId}:v{N}:{cents}` — disjoint namespaces (locked 2026-04-23, Phase 3)
- revalidateTag signature: Next.js 16 requires `revalidateTag(tag, profile)`; PawPlan passes `'default'` as the profile (locked 2026-04-23, Phase 3)
- BLDR-07 (pet / owner collection): **deferred to Phase 4** — collected inside Stripe Checkout's hosted form, not on /[slug]/enroll (locked 2026-04-23, Phase 3)

### Pending Todos

**Phase 4 (Stripe Checkout) kickoff pre-reqs:**
- BLDR-07 (pet name / species / owner email collection) — wire Stripe Checkout's `customer_creation` + `custom_fields` on a Checkout Session created by the `/[slug]/enroll` CTA (currently a `toast.info` stub). Redirect URL should be `/checkout?session_id=…` then fall through to Stripe's hosted form.
- Stripe Checkout subscription mode with `transfer_data.destination = clinic.stripeAccountId` + `application_fee_percent = 10` so destination charges + 10% platform fee fire on every invoice (closes MATH-03 end-to-end).
- Daniel to run `stripe listen --forward-to localhost:3000/api/stripe/webhook` before Phase 4 manual verification (carry-over from Phase 2).
- Production (Neon) deploy needs a non-owner app role equivalent to `pawplan_app` so RLS FORCE is honestly enforced under a non-BYPASSRLS connection (carry-over from Phase 2).
- Operator-run PUB-06 load test (`k6 run tests/load/enroll-page.k6.js`) against a staged published clinic before demo — script committed, not executed in CI.
- Phase 3 carry-over: `src/lib/tenant.test.ts` + `src/app/actions/publish.test.ts` use the superuser pool for fixtures because strict RLS blocks pawplan_app INSERTs into Plan/PlanTier. Consider a `withSuperuser()` helper or a dedicated fixture seeder to DRY this up in Phase 4+.

### Blockers/Concerns

- **Resolved in Phase 1:** non-superuser app role (`pawplan_app`) provisioned locally with NOBYPASSRLS; RLS now honestly enforced for Plan + PlanTier.
- **Carried from Phase 1 → still Phase 3 follow-up:** the cross-tenant Vitest suite (`src/lib/tenant.test.ts`) uses raw INSERTs for fixture setup that are blocked by strict RLS on Plan. Needs a small refactor: either drop privilege temporarily via a separate superuser connection for fixtures, or rewrite the fixtures to go through withClinic.
- **Phase 2 new:** StripeEvent RLS is two-mode (permissive when GUC unset). The permissive mode is necessary because webhooks arrive before clinic context is resolved. Not a regression from Phase 1 policy; same Clinic pattern. Review when Phase 5 adds pg-boss background jobs that may read StripeEvent without a session.

## Session Continuity

Last session: 2026-04-23T12:30:00.000Z
Stopped at: Completed 03-04-PLAN.md — Phase 3 (Publish + public enrollment page) done, ready for Phase 4 Checkout wiring
Resume file: None
