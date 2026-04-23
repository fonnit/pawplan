---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
status: phase-4-complete
stopped_at: Completed 04-04-PLAN.md — Phase 4 (Checkout + subscription lifecycle) done
last_updated: "2026-04-23T13:22:00.000Z"
last_activity: 2026-04-23
progress:
  total_phases: 6
  completed_phases: 4
  total_plans: 16
  completed_plans: 16
  percent: 100
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-04-23)

**Core value:** A clinic owner publishes pricing and lands their first paying member in the same session.
**Current focus:** Phase 4 — Checkout + Subscription Lifecycle (COMPLETE) → Phase 5 (Notifications + Welcome Packet)

## Current Position

Phase: 4 of 6 (Checkout + Subscription Lifecycle) — COMPLETE
Plan: 4 of 4 in current phase
Status: Phase 4 shipped — real pet-owner Checkout clears end-to-end. Ready for Phase 5 (Resend emails + React-PDF welcome packet + pg-boss queue).
Last activity: 2026-04-23

Progress: [████████░░] Phase 4 of 6

## Performance Metrics

**Velocity:**

- Total plans completed: 16 (Phase 1: 5, Phase 2: 3, Phase 3: 4, Phase 4: 4)
- Average duration: ~10m / plan (Phase 4 wave: ~8m avg)
- Total execution time: ~2.8 hours (across four phases)

**By Phase:**

| Phase | Plans | Total   | Avg/Plan |
|-------|-------|---------|----------|
| 01    | 5     | ~80m    | 16m      |
| 02    | 3     | ~33m    | 11m      |
| 03    | 4     | ~37m    | 9m       |
| 04    | 4     | ~31m    | 8m       |

**Recent Trend:**

- Last 5 plans: 03-04, 04-01, 04-02, 04-03, 04-04.
- Trend: ongoing acceleration — Phase 4 avg (~8m) is ~11% faster than Phase 3; handler + server-action patterns now mechanical. Handler test boilerplate (vi.hoisted + withClinic pass-through mock) is boilerplate-ready for Phase 5.

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
| Phase 04 P01 | 5m  | 3 tasks | 3 files  |
| Phase 04 P02 | 6m  | 3 tasks | 5 files  |
| Phase 04 P03 | 12m | 2 tasks | 12 files |
| Phase 04 P04 | 8m  | 2 tasks | 7 files  |

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table and REQUIREMENTS.md Locked Product Decisions.
Recent decisions affecting current work:

- **PAY-07 enforced at every layer:** MemberStatus is a Postgres enum AND a TS string union (active | past_due | canceled), never a boolean (Phase 4, 2026-04-23)
- **Webhook replay safety:** Member has `@@unique([clinicId, stripeSubscriptionId])` composite index + handlers keyed on composite-where in upsert — 5× event.id replay produces exactly one Member row (Phase 4, 2026-04-23)
- **Stripe API 2026-03-25.dahlia shape deviations absorbed:** `current_period_end` reads from `subscription.items.data[0].current_period_end`; invoice→subscription reads from `invoice.parent.subscription_details.subscription` (Phase 4, 2026-04-23)
- **PAY-05 guarded in source:** `invoice-payment-failed.ts` contains zero email/queue/notification imports — grep-asserted by test (Phase 4, 2026-04-23)
- **Optimistic cancellation UX:** owner click writes `Member.canceledAt = now()`; status flip to `canceled` awaits `customer.subscription.deleted` webhook; webhook preserves earlier owner-click timestamp (Phase 4, 2026-04-23)
- **cancelSubscriptionAtPeriodEnd idempotency key:** stable `cancel:{subId}:v1` (no time bucket) — repeat clicks = Stripe no-op (Phase 4, 2026-04-23)
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

**Phase 5 (Notifications + Welcome Packet) kickoff pre-reqs:**
- NOTIF-01..04 — pg-boss job queue + Resend emails: owner new-enrollment notification, pet-owner welcome email with React-PDF packet attached, past-due notification to owner (NOT pet-owner per PAY-05). Queue consumer should be a separate long-running process, not the Next.js server.
- Welcome packet PDF — `@react-pdf/renderer` to produce per-member PDF (tier services, start date, renewal date). Store in object storage or inline-attach.
- **Operator:** run `.planning/phases/04-checkout-subscription-lifecycle/manual-smoke.md` 8-step CLI walkthrough before Phase 5 kickoff to confirm Phase 4 end-to-end.
- Production (Neon) deploy needs a non-owner app role equivalent to `pawplan_app` so RLS FORCE is honestly enforced under a non-BYPASSRLS connection (carry-over from Phase 2).
- Operator-run PUB-06 load test (`k6 run tests/load/enroll-page.k6.js`) against a staged published clinic before demo — script committed, not executed in CI.
- Phase 3 carry-over: `src/lib/tenant.test.ts` + `src/app/actions/publish.test.ts` use the superuser pool for fixtures because strict RLS blocks pawplan_app INSERTs into Plan/PlanTier. Consider a `withSuperuser()` helper or a dedicated fixture seeder to DRY this up.
- Phase 4 carry-over: Member list has no pagination — acceptable up to ~500 rows/clinic (T-04-04-04 accept). Revisit in Phase 6 when redemption UI may force denser scans.
- Phase 4 carry-over: no audit log of cancellation clicks (T-04-04-06 accept). Stripe's event log is the only paper trail for v1.

### Blockers/Concerns

- **Resolved in Phase 1:** non-superuser app role (`pawplan_app`) provisioned locally with NOBYPASSRLS; RLS now honestly enforced for Plan + PlanTier.
- **Carried from Phase 1 → still Phase 3 follow-up:** the cross-tenant Vitest suite (`src/lib/tenant.test.ts`) uses raw INSERTs for fixture setup that are blocked by strict RLS on Plan. Needs a small refactor: either drop privilege temporarily via a separate superuser connection for fixtures, or rewrite the fixtures to go through withClinic.
- **Phase 2 new:** StripeEvent RLS is two-mode (permissive when GUC unset). The permissive mode is necessary because webhooks arrive before clinic context is resolved. Not a regression from Phase 1 policy; same Clinic pattern. Review when Phase 5 adds pg-boss background jobs that may read StripeEvent without a session.

## Session Continuity

Last session: 2026-04-23T13:22:00.000Z
Stopped at: Completed 04-04-PLAN.md — Phase 4 (Checkout + subscription lifecycle) done, ready for Phase 5 (notifications + welcome packet)
Resume file: None
