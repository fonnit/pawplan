---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
status: phase-5-complete
stopped_at: Completed Phase 5 (Notifications + Welcome Packet) — pg-boss queue + SendGrid (sandbox) + React-PDF wired through checkout webhook
last_updated: "2026-04-23T14:36:00.000Z"
last_activity: 2026-04-23
progress:
  total_phases: 6
  completed_phases: 5
  total_plans: 17
  completed_plans: 17
  percent: 100
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-04-23)

**Core value:** A clinic owner publishes pricing and lands their first paying member in the same session.
**Current focus:** Phase 5 — Notifications + Welcome Packet (COMPLETE) → Phase 6 (Dashboard Metrics + Redemption)

## Current Position

Phase: 5 of 6 (Notifications + Welcome Packet) — COMPLETE
Plan: 1 of 1 in current phase (executed as a single inline plan — small phase)
Status: Phase 5 shipped — pg-boss queue + SendGrid sandbox-forced wrapper + React-PDF welcome packet. Webhook hot path is email-free (grep-guarded). Ready for Phase 6 (Dashboard Metrics + Redemption).
Last activity: 2026-04-23

Progress: [██████████] Phase 5 of 6

## Performance Metrics

**Velocity:**

- Total plans completed: 17 (Phase 1: 5, Phase 2: 3, Phase 3: 4, Phase 4: 4, Phase 5: 1)
- Average duration: ~10m / plan (Phase 5 single-plan: ~11m end-to-end across 3 waves)
- Total execution time: ~3.0 hours (across five phases)

**By Phase:**

| Phase | Plans | Total   | Avg/Plan |
|-------|-------|---------|----------|
| 01    | 5     | ~80m    | 16m      |
| 02    | 3     | ~33m    | 11m      |
| 03    | 4     | ~37m    | 9m       |
| 04    | 4     | ~31m    | 8m       |
| 05    | 1     | ~11m    | 11m (3 waves) |

**Recent Trend:**

- Last 5 plans: 04-01, 04-02, 04-03, 04-04, 05-01.
- Trend: Phase 5 folded into a single plan because of small scope (4 requirements, tight guardrails). 3-wave structure (infra → handlers → wiring) kept commits atomic and tests additive; zero deviations from the execution context brief.

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
| Phase 05 P01 | 11m | 3 waves | 17 files (3 commits) |

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table and REQUIREMENTS.md Locked Product Decisions.
Recent decisions affecting current work:

- **Email provider switched from Resend to SendGrid** (Phase 5, 2026-04-23) — Daniel provided SendGrid key via Twilio. `@sendgrid/mail@8` wrapper at `src/lib/email/sendgrid.ts`. `resend` package stays in `package.json` but is grep-blocked from all hot-path and queue files.
- **SendGrid sandbox mode forced ON for the public demo** (Phase 5, 2026-04-23) — `mailSettings.sandboxMode.enable` set on every send call. Any value other than the literal string `"false"` in `SENDGRID_SANDBOX_MODE` keeps sandbox ON. 5 dedicated tests in `src/lib/email/sendgrid.test.ts` verify fail-closed behavior.
- **Queue: pg-boss@10 over Neon Postgres** (Phase 5, 2026-04-23) — no Redis. `createQueue` on `boss.start()` is idempotent. Lazy singleton in `src/lib/queue/boss.ts`. Drain path `/api/jobs/worker` compatible with Vercel Cron.
- **Welcome-packet enqueue site is `checkout.session.completed`, not `invoice.paid`** (Phase 5, 2026-04-23) — that event is the first point at which Member exists. pg-boss `singletonKey: '{queue}:{event.id}'` + Member.welcomePacketSentAt / ownerNotifiedAt timestamps make 5× replay exactly-once.
- **Minimal enqueue payload (memberId + eventId only)** (Phase 5, 2026-04-23) — handlers re-read Member + PlanTier + Clinic from DB so a stale enqueued attribute cannot leak into the rendered PDF after a clinic edit.
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

**Phase 6 (Dashboard Metrics + Redemption) kickoff pre-reqs:**
- DASH-01, DASH-02, DASH-04, DASH-06 — MRR / ARR / 30-day renewal forecast on the dashboard, per-member rows with services-remaining counter, manual redemption checkboxes idempotent on `(member_id, service_key, billing_period_start)`, clinic time-zone display.
- New ServiceRedemption table + migration (one row per redemption toggle); optimistic-locking pattern for the toggle write.
- Subscription metrics should read from Stripe where possible (current_period_end, price.unit_amount) rather than duplicating into Postgres.

**Phase 5 carry-overs into Phase 6:**
- **End-to-end sandbox smoke:** in staging (or a throwaway Stripe test clinic), fire a real checkout, verify SendGrid dashboard shows the sandbox-accepted event and the pg-boss worker completes both jobs. Not automated — operator task before demo.
- **Vercel Cron wiring:** `/api/jobs/worker` exists as the drain endpoint. A `vercel.json` crons entry pointing at it every 60s is NOT yet committed (no deploy config present in repo). Add when Phase 6 deploy lands.
- **CRON_SECRET env:** set in Vercel project when deploying; locally optional.
- **pg-boss schema `pgboss`:** created automatically on first `boss.start()`. Operator should note this when running `prisma db pull` or inspecting migrations — it's outside Prisma's purview.
- **Alternative long-lived worker:** `src/lib/jobs/register-workers.ts` exports `registerWorkers()` for a tsx-run worker process. Not wired into `pnpm` scripts; add when self-hosted deploy becomes the canonical path.

**Cross-phase carry-overs:**
- Production (Neon) deploy needs a non-owner app role equivalent to `pawplan_app` so RLS FORCE is honestly enforced under a non-BYPASSRLS connection (carry-over from Phase 2).
- Operator-run PUB-06 load test (`k6 run tests/load/enroll-page.k6.js`) against a staged published clinic before demo — script committed, not executed in CI.
- Phase 3 carry-over: `src/lib/tenant.test.ts` + `src/app/actions/publish.test.ts` use the superuser pool for fixtures because strict RLS blocks pawplan_app INSERTs into Plan/PlanTier. Consider a `withSuperuser()` helper or a dedicated fixture seeder to DRY this up.
- Phase 4 carry-over: Member list has no pagination — acceptable up to ~500 rows/clinic (T-04-04-04 accept). Revisit in Phase 6 when redemption UI may force denser scans.
- Phase 4 carry-over: no audit log of cancellation clicks (T-04-04-06 accept). Stripe's event log is the only paper trail for v1.
- Phase 5 carry-over: `resend@6.0.3` still listed in package.json but unused. Remove during Phase 6 dependency sweep or next lockfile refresh.

### Blockers/Concerns

- **Resolved in Phase 1:** non-superuser app role (`pawplan_app`) provisioned locally with NOBYPASSRLS; RLS now honestly enforced for Plan + PlanTier.
- **Carried from Phase 1 → still Phase 3 follow-up:** the cross-tenant Vitest suite (`src/lib/tenant.test.ts`) uses raw INSERTs for fixture setup that are blocked by strict RLS on Plan. Needs a small refactor: either drop privilege temporarily via a separate superuser connection for fixtures, or rewrite the fixtures to go through withClinic.
- **Phase 2 new:** StripeEvent RLS is two-mode (permissive when GUC unset). The permissive mode is necessary because webhooks arrive before clinic context is resolved. Not a regression from Phase 1 policy; same Clinic pattern. Review when Phase 5 adds pg-boss background jobs that may read StripeEvent without a session.

## Session Continuity

Last session: 2026-04-23T14:36:00.000Z
Stopped at: Completed Phase 5 (Notifications + Welcome Packet) — pg-boss queue, SendGrid sandbox-forced wrapper, React-PDF welcome packet, webhook enqueue wired in `checkout.session.completed`. Ready for Phase 6 (Dashboard Metrics + Redemption).
Resume file: None
