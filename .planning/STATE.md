---
gsd_state_version: 1.0
milestone: v2.0
milestone_name: visual-identity-redesign
status: roadmap-defined
stopped_at: Roadmap for v2.0 Visual Identity Redesign written. 6 phases (7-12), 75 requirements mapped. Ready to plan Phase 7 (Tokens + Theme Foundation).
last_updated: "2026-04-24T00:00:00.000Z"
last_activity: 2026-04-24
progress:
  total_phases: 6
  completed_phases: 0
  total_plans: 0
  completed_plans: 0
  percent: 0
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-04-24)

**Core value:** A clinic owner publishes pricing and lands their first paying member in the same session.
**Current focus:** v2.0 Visual Identity Redesign — apply the design system at `design/` across every user-facing surface. Zero functional changes. Phase numbering continues from 7.

## Current Position

Phase: 7 (Tokens + Theme Foundation) — not started
Plan: —
Status: Roadmap defined. 6 phases (7-12) cover 75 requirements at 100%. Ready to plan Phase 7.
Last activity: 2026-04-24 — ROADMAP.md written for v2.0

Progress: [          ] 0 of 6 phases (0%)

### v2.0 Phase Map

| # | Phase | REQ-IDs | Status |
|---|-------|---------|--------|
| 7  | Tokens + Theme Foundation        | TOK-*, TYPO-*                           | Not started |
| 8  | Shared Components + Dashboard Shell | COMP-*, SHELL-*                      | Not started |
| 9  | Dashboard Surfaces               | DASH-*, MEMBERS-*, BUILDER-*, PUBFLOW-* | Not started |
| 10 | Public Enrollment + Success      | ENROLL-*, SUCCESS-*                     | Not started |
| 11 | Auth + Email + PDF + Meta        | AUTH-*, EMAIL-*, META-*                 | Not started |
| 12 | Visual QA + Deploy               | QA-*                                    | Not started |

## Performance Metrics

**Velocity (v1.0 baseline, carried forward):**

- Total plans completed: 18 (Phase 1: 5, Phase 2: 3, Phase 3: 4, Phase 4: 4, Phase 5: 1, Phase 6: 1)
- Average duration: ~10m / plan (Phase 6: ~14m end-to-end across 3 commit waves)
- Total execution time: ~3.25 hours (across six phases)

**By Phase (v1.0):**

| Phase | Plans | Total   | Avg/Plan |
|-------|-------|---------|----------|
| 01    | 5     | ~80m    | 16m      |
| 02    | 3     | ~33m    | 11m      |
| 03    | 4     | ~37m    | 9m       |
| 04    | 4     | ~31m    | 8m       |
| 05    | 1     | ~11m    | 11m (3 waves) |
| 06    | 1     | ~14m    | 14m (3 waves) |

**Recent Trend (v1.0 close-out):**

- Last 5 plans: 04-03, 04-04, 05-01, 06-01.
- Trend: Phases 5 and 6 both folded into single plans because scope was bounded (4 requirements each). 3-wave pattern (schema → libraries → wiring) stays the stable template for small phases. Zero deviations across the last two phases; test coverage additive (Phase 6 added 29 new tests, 209 total across 28 files).

**v2.0 expectation:** visual-only milestone — plans likely split differently from v1. Phase 9 is the largest (21 REQ-IDs across 4 surfaces); candidates for sub-plans per surface.

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
| Phase 06 P01 | 14m | 3 waves | 17 files (3 commits) |

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table and REQUIREMENTS.md Locked Product Decisions.

**v2.0 locked design decisions (source: `design/INTENT.md`, `design/tokens.json`, `design/anti-patterns.md`):**

- **Type system is load-bearing:** Instrument Serif > 32px, Inter < 32px, Berkeley Mono for every financial figure. `<Figure>` component (or `.type-figure` utility) carries tabular-nums + slashed-zero feature flags.
- **Two-temperature palette:** teal `#2F7F7F` operational spine + amber warm moments. Zero Tailwind `teal-500`. Zero pure white surfaces — `--paper #FAF8F5` everywhere.
- **Enrollment page is signature surface:** clinic name leads in amber Instrument Serif, PawPlan is footer-only; left 45% typographic spine on paper, right 55% raster with right-edge bleed, `pattern-grid-dot.svg` watermark at 15% opacity behind lower-left quadrant.
- **Dashboard cards eliminate the shadowed-rounded pattern:** rules + type weight separation on paper. No `rounded-xl` + `shadow-md`/`shadow-lg` stat cards anywhere.
- **Paw motifs live only inside `logo-mark.svg`.** Empty states, loaders, dividers, bullet markers use geometry.
- **Hard constraint enforced per phase:** every ROADMAP phase carries a "Halt if" clause — touching schema, routes, server actions, webhook handlers, queue handlers, Stripe integration, or email trigger sites to land the redesign halts the phase.

**Recent v1.0 decisions (still binding — do not violate when restyling):**

- **Redemption idempotency lives in the DB, not the app** (Phase 6, 2026-04-23) — `ServiceRedemption` has a unique index on `(memberId, serviceKey, billingPeriodStart)`. Two simultaneous toggle-on requests → Prisma P2002 on the loser, which `toggleRedemption` catches and re-fetches, returning `status=already_redeemed`. Integration test spawns 5 concurrent inserts and proves exactly one row lands.
- **Existence-as-state redemption model** (Phase 6, 2026-04-23) — row present ≡ redeemed; toggle-off DELETEs. No boolean column. Keeps the data shape minimal and the uniqueness constraint unambiguous.
- **billingPeriodStart is derived from Stripe's currentPeriodEnd − 1 calendar month, NEVER from wall clock** (Phase 6, 2026-04-23) — if `Member.currentPeriodEnd` is still null (new member in the gap between `checkout.session.completed` and first `invoice.paid`), the server action short-circuits with `status=no_billing_period` instead of writing against a null anchor.
- **`ServiceRedemption.version` column reserved for v2 mutable attributes** (Phase 6, 2026-04-23) — today version stays 0 and only matters for toggle-off calls that pass `expectedVersion`. The scaffolding is tested so future mutable-attribute flows (notes, photo, vet sig) can start using it without another migration.
- **Storage in UTC, render in clinic.timezone** (Phase 6, 2026-04-23) — `Clinic.timezone` defaults to `America/New_York`. `src/lib/time.ts` `formatInClinicTz` is the only sanctioned render path; it falls back to UTC on invalid zone ids so a bad value never renders as em-dash. No settings-page UI for the owner to change it yet (deferred; see Phase 6 `deferred-items.md`).
- **MRR excludes past_due + canceled** (Phase 6, 2026-04-23) — past-due members aren't paying this month (Smart Retries OFF) and canceled members are gone. Past-due count surfaces separately as an attention-grab in the Active Members card. 30-day renewal forecast additionally excludes active members with non-null `canceledAt` (they'll flip to canceled at period end, not renew).
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

**v2.0 redesign — not started. See ROADMAP.md for phase 7-12 sequencing.**

**v1.0 demo-ship operator tasks (still open — not blocked by v2.0):**
- **End-to-end sandbox smoke** (Phase 5 carry-over): in staging, fire a real Stripe test Checkout → verify SendGrid dashboard shows the sandbox-accepted event → verify pg-boss worker completes both jobs → confirm the new member appears on /dashboard/members with dates in clinic-tz and a full services-remaining X/Y count. Operator task before demo.
- **Operator-run PUB-06 load test** (Phase 3 carry-over): `k6 run tests/load/enroll-page.k6.js` against a staged published clinic — script committed, not executed in CI.
- **Vercel Cron wiring**: commit `vercel.json` with `/api/jobs/worker` every 60s. `CRON_SECRET` env set in Vercel project.
- **pg-boss schema `pgboss`**: created automatically on first `boss.start()`. Operator should note this when running `prisma db pull`.

**v1.0 known polish (deferred — safe to cut the v1 demo without):**
- **Clinic timezone UI** (Phase 6 deferred): schema + default `America/New_York` in place; add a settings-page `<select>` so owner can switch between `America/New_York` and `UTC` for the demo. See `.planning/phases/06-dashboard-metrics-redemption/deferred-items.md`.
- **Pre-existing `pnpm lint` circular-JSON error** (Phase 6 noted, not introduced): reproduces on pre-Phase-6 `main`. `typecheck` + `build` + `test` all green. Fix belongs in an eslint-config upgrade PR.
- **`resend@6.0.3` still in package.json** (Phase 5 carry-over) — unused after SendGrid switch. Remove during next dep sweep.
- **Member list pagination** (Phase 4 carry-over) — fine up to ~500 rows; revisit if demo data grows.
- **No audit log of cancellation clicks** (Phase 4 carry-over) — Stripe's event log is the v1 paper trail.
- **Fixture-seed refactor** (Phase 3 carry-over): consider a `withSuperuser()` helper for `tenant.test.ts` + `publish.test.ts` (and now `redemption.test.ts`) to DRY the RLS-bypass fixture pattern.
- **Non-owner app role in Neon prod** (Phase 2 carry-over): Neon deploy needs a `pawplan_app`-equivalent with NOBYPASSRLS so FORCE RLS is honestly enforced.

### Blockers/Concerns

- **Resolved in Phase 1:** non-superuser app role (`pawplan_app`) provisioned locally with NOBYPASSRLS; RLS now honestly enforced for Plan + PlanTier.
- **Carried from Phase 1 → still Phase 3 follow-up:** the cross-tenant Vitest suite (`src/lib/tenant.test.ts`) uses raw INSERTs for fixture setup that are blocked by strict RLS on Plan. Needs a small refactor: either drop privilege temporarily via a separate superuser connection for fixtures, or rewrite the fixtures to go through withClinic.
- **Phase 2 carried:** StripeEvent RLS is two-mode (permissive when GUC unset). The permissive mode is necessary because webhooks arrive before clinic context is resolved. Not a regression from Phase 1 policy; same Clinic pattern.
- **v2.0 watchpoint:** Phase 9 is the largest (21 REQ-IDs, four surfaces). If the first plan-phase pass produces > 4 plans, reshape by splitting dashboard-home / members / builder / publish-flow into sub-plans rather than running one megaplan.

## Session Continuity

Last session: 2026-04-24T00:00:00.000Z
Stopped at: Roadmap for v2.0 Visual Identity Redesign written. 6 phases (7-12) cover 75 REQ-IDs at 100%. Ready to plan Phase 7 (Tokens + Theme Foundation).
Resume file: .planning/ROADMAP.md
