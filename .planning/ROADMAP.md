# Roadmap: PawPlan

## Overview

PawPlan is a multi-tenant SaaS that lets an independent vet clinic owner publish a branded wellness-plan enrollment page and charge their first recurring member in the same session. The journey to the demo-ship gate — live clinic, published URL, real enrollment, first charge cleared — is sequenced across six phases that follow the natural dependency graph: tenant-isolated foundation with a unit-tested break-even engine first, then Stripe Connect onboarding, then publish + a public enrollment page, then Checkout + the subscription lifecycle, then notifications, and finally the owner dashboard with redemption and cancellation. RLS, slug safety, and the break-even math pure function land in Phase 1 before any Stripe code exists, because they are cheap on day 1 and expensive to retrofit.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [ ] **Phase 1: Foundation** — Auth, tenancy with Postgres RLS, clinic profile, slug safety, break-even pure function with unit tests, and the 8-question builder with live client-side preview and draft persistence.
- [ ] **Phase 2: Stripe Connect Onboarding** — Create Express accounts, verify capability gating via `account.updated`, and surface onboarding status in the dashboard.
- [ ] **Phase 3: Publish + Public Enrollment Page** — Server-side canonical break-even, Stripe Product/Price creation, unique `pawplan.app/{slug}/enroll` URL with ISR, and post-publish pricing edits that preserve existing subscriptions.
- [ ] **Phase 4: Checkout + Subscription Lifecycle** — Stripe Checkout with destination charges, idempotent webhook handlers, member state machine (`active | past_due | canceled`), failed-charge flagging, and owner-initiated cancellation.
- [ ] **Phase 5: Notifications + Welcome Packet** — Async pg-boss queue, React-PDF welcome packet, Resend email delivery for pet-owner welcome and owner new-enrollment notifications.
- [ ] **Phase 6: Dashboard Metrics + Redemption** — MRR/ARR/forecast queries sourced from Stripe, per-member rows, manual service-redemption toggles idempotent on the current billing period, and time-zone-correct display.

## Phase Details

### Phase 1: Foundation
**Goal**: A clinic owner can create an account, land in a tenant-isolated dashboard, configure the clinic profile, run the 8-question builder with a live break-even preview, and save a draft plan — with RLS and a unit-tested break-even pure function in place from the first migration.
**Depends on**: Nothing (first phase)
**Requirements**: FOUND-01, FOUND-02, FOUND-03, FOUND-04, FOUND-05, FOUND-06, MATH-01, BLDR-01, BLDR-02, BLDR-03, BLDR-04, BLDR-05
**Success Criteria** (what must be TRUE):
  1. A clinic owner can create an account with email + password, log in, stay logged in across browser sessions, and log out from any page.
  2. A clinic owner can set practice name, optional logo, and choose an accent color from the 6-preset palette; the clinic slug is unique, lowercase-ASCII, reserved-word-filtered, and locked at creation.
  3. An automated cross-tenant test suite confirms that RLS policies block reads of another clinic's rows even when the application layer omits a `WHERE clinic_id` filter.
  4. A 15-scenario unit test file for `lib/pricing/breakEven.ts` passes, covering discount edges (0%, 20%), tier counts (2, 3), species mixes, Stripe fees, and the 10% platform fee as explicit line items.
  5. A clinic owner can complete the 8-question builder, see break-even math recompute live on every input change, and return after logout to find the draft persisted in Postgres.
**Plans**: 5 plans

Plans:
- [x] 01-01-PLAN.md — Next.js 16 + Tailwind v4 + shadcn/ui scaffold with Prisma Neon adapter + Vitest
- [x] 01-02-PLAN.md — Break-even pure function `computeBreakEven` + 15-scenario Vitest suite (MATH-01, TDD)
- [x] 01-03-PLAN.md — Prisma schema + Postgres RLS policies + `withClinic` helper + slug safety (FOUND-04, FOUND-05, FOUND-06)
- [ ] 01-04-PLAN.md — Better Auth email/password + signup/login/logout UI + dashboard shell (FOUND-01, FOUND-02, FOUND-03)
- [ ] 01-05-PLAN.md — 8-question plan builder with live break-even preview + draft persist + resume (BLDR-01..05)
**UI hint**: yes

### Phase 2: Stripe Connect Onboarding
**Goal**: A clinic owner can connect a Stripe Connect Express account and see onboarding status reflected in the dashboard, with the Publish button correctly gated on full Stripe capability verification driven by `account.updated` webhooks.
**Depends on**: Phase 1
**Requirements**: PUB-01, PUB-02
**Success Criteria** (what must be TRUE):
  1. A clinic owner can click "Connect Stripe" and be redirected to a freshly generated, single-use `AccountLink` for Stripe-hosted Express onboarding, with a refresh route regenerating expired links.
  2. The webhook endpoint verifies Stripe signatures, dedupes by `event.id` via a `stripe_events` idempotency store, and persists Connect capability state on every `account.updated` event.
  3. The Publish button is disabled with a specific actionable reason ("Your Stripe account needs bank info") until `charges_enabled && payouts_enabled && !requirements.disabled_reason` is true.
  4. A clinic owner who abandons onboarding mid-flow sees a dashboard banner listing `requirements.currently_due` with a one-click link to resume.
**Plans**: TBD
**UI hint**: yes

### Phase 3: Publish + Public Enrollment Page
**Goal**: A clinic owner can click Publish to generate a unique public URL that renders a branded, mobile-responsive tier comparison page served via ISR, with the break-even math re-run canonically server-side and post-publish price edits that do not break existing subscriptions.
**Depends on**: Phase 2
**Requirements**: PUB-03, PUB-04, PUB-05, PUB-06, BLDR-06, BLDR-07, BLDR-08, MATH-02, MATH-03, MATH-04, MATH-05
**Success Criteria** (what must be TRUE):
  1. A clinic owner can edit tier names post-draft and click Publish; the server re-runs `computeTiers` canonically, creates one Stripe Product + Price per tier on the platform account, and records `stripePriceId` + `publishedAt`.
  2. A pet owner visiting `pawplan.app/{clinic-slug}/enroll` sees a server-rendered, mobile-responsive tier comparison with the clinic's name, logo, and accent color, served via ISR with `revalidateTag('clinic:{slug}')` on publish/edit.
  3. The public page exposes only the published plan + branding (never draft plans or member data), reading from a dedicated `v_public_clinic_plans` view, and a k6 load test of 500 req/s for 60s holds p95 latency under 500ms.
  4. A clinic owner can edit plan prices after publish; a new Stripe Price is created on the same Product, existing subscriptions stay on the legacy Price, and the edit UI states explicitly that the new price applies to new enrollments only.
  5. The builder display shows retail value, monthly fee, clinic gross per enrolled pet per year, break-even member count, Stripe processing estimate, and the 10% platform fee as explicit line items — with the same pure function running client-side (preview) and server-side (canonical).
**Plans**: TBD
**UI hint**: yes

### Phase 4: Checkout + Subscription Lifecycle
**Goal**: A pet owner can complete Stripe Checkout and be charged their first monthly payment, with the member record flowing through an `active | past_due | canceled` state machine driven by idempotent webhook handlers, and the clinic owner can cancel a member subscription prorated to the end of the billing period.
**Depends on**: Phase 3
**Requirements**: PAY-01, PAY-02, PAY-03, PAY-04, PAY-05, PAY-06, PAY-07, DASH-03, DASH-05
**Success Criteria** (what must be TRUE):
  1. A pet owner can click Enroll, complete Stripe Checkout in subscription mode (collecting pet name, species, owner email, card), and land on the success page with a Member row created and status set to `active` after `invoice.paid` fires.
  2. Every Checkout uses destination charges with `transfer_data.destination = clinic.stripe_account_id` and `application_fee_percent = 10`; funds flow to the clinic and the 10% platform fee is retained by PawPlan.
  3. Replaying the same webhook `event.id` five times via Stripe CLI produces exactly one Member row, exactly one status change per transition, and exactly one downstream side-effect enqueue (verified by the idempotency store).
  4. On `invoice.payment_failed`, the Member is flagged `past_due` and visible + filterable in the dashboard; no auto-email is sent to the pet owner (Smart Retries OFF per locked product decision).
  5. A clinic owner can click Cancel on a member row; Stripe `subscription.update({ cancel_at_period_end: true })` runs; the member continues to have access through `current_period_end` and then transitions to `canceled` via webhook.
**Plans**: TBD
**UI hint**: yes

### Phase 5: Notifications + Welcome Packet
**Goal**: On successful first charge, the pet owner receives a branded PDF welcome packet via email and the clinic owner receives a new-enrollment notification, with all email work dispatched asynchronously via pg-boss so webhook handlers respond in under 200ms.
**Depends on**: Phase 4
**Requirements**: NOTIF-01, NOTIF-02, NOTIF-03, NOTIF-04
**Success Criteria** (what must be TRUE):
  1. On the first successful `invoice.paid` for a new member, the webhook handler enqueues `send-welcome-packet` and `notify-owner-new-enrollment` jobs keyed by `event.id` and returns 200 in under 200ms.
  2. The pet owner receives an email from the clinic's verified Resend sender with a PDF attachment that shows plan name, included services, first billing date, clinic contact, and the clinic's logo + accent color on the header.
  3. The clinic owner receives an email notification naming the pet, species, plan tier, and enrollment date within 60 seconds of the first charge clearing.
  4. Simulating a 20-second Resend outage during a webhook burst does not cause duplicate emails or webhook retries — the queue dedupes by `event.id`, and workers retry independently.
**Plans**: TBD
**UI hint**: yes

### Phase 6: Dashboard Metrics + Redemption
**Goal**: A clinic owner can open the dashboard and see active members, plan-tier breakdown, MRR (gross / − Stripe fees / − platform fee / = net), 30-day renewal forecast sourced from Stripe's `current_period_end`, projected ARR, per-member rows with services-remaining counters, and manual service-redemption toggles that reset implicitly each billing period.
**Depends on**: Phase 5
**Requirements**: DASH-01, DASH-02, DASH-04, DASH-06
**Success Criteria** (what must be TRUE):
  1. A clinic owner sees active member count, plan-tier breakdown, MRR with gross / Stripe fees / platform fee / net shown as separate lines, 30-day renewal forecast, and projected ARR on the dashboard home.
  2. Each member row displays pet name, species, plan, enrollment date, next billing date in the clinic's time zone, status badge (`active | past_due | canceled`), and services remaining this cycle.
  3. Staff can toggle a checkbox per included service per billing period per member; the upsert is idempotent on `(member_id, service_key, billing_period_start)` with optimistic locking, so two simultaneous toggles result in exactly one state change and one visible conflict.
  4. The 30-day renewal forecast query reads `current_period_end` directly from Stripe (not `enrollment_date + 30 days`), and Jan 31 / Feb 28 / DST edge cases display correct renewal dates without any "April 31"-style invalid dates.
**Plans**: TBD
**UI hint**: yes

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4 → 5 → 6

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Foundation | 0/5 | Not started | - |
| 2. Stripe Connect Onboarding | 0/TBD | Not started | - |
| 3. Publish + Public Enrollment Page | 0/TBD | Not started | - |
| 4. Checkout + Subscription Lifecycle | 0/TBD | Not started | - |
| 5. Notifications + Welcome Packet | 0/TBD | Not started | - |
| 6. Dashboard Metrics + Redemption | 0/TBD | Not started | - |
