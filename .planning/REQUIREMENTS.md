# PawPlan — v1 Requirements

Traceability from MVP-SPEC.md §5 (Scope) and §6 (MoSCoW). Categories map to phases in ROADMAP.md.

## Locked Product Decisions

| Decision | Value | Source |
|----------|-------|--------|
| Platform application-fee percent | **10%** of every clinic subscription | Daniel, 2026-04-23 |
| Failed-charge policy | **Smart Retries OFF.** Single failure flags the member in the dashboard. Clinic contacts client manually. No auto-email to pet owner. | Daniel, 2026-04-23 |
| Accent color UX | **6-color preset palette.** No free color picker. | Daniel, 2026-04-23 |

## v1 Requirements

### Foundation (`FOUND`)

- [x] **FOUND-01**: Clinic owner can create an account with email + password
- [ ] **FOUND-02**: Clinic owner stays logged in across browser sessions
- [ ] **FOUND-03**: Clinic owner can log out from any page
- [x] **FOUND-04**: Schema enforces per-clinic row-level isolation (RLS on every tenant-owned table)
- [x] **FOUND-05**: Clinic slug is unique, lowercase-ASCII, reserved-word-filtered, locked at creation
- [x] **FOUND-06**: Single clinic profile (practice name required, logo optional, accent color from 6-preset palette)

### Break-Even Engine (`MATH`)

- [x] **MATH-01**: Pure function computes per-tier break-even math given 8 builder inputs + 10% platform fee
- [x] **MATH-02**: Math runs client-side for live recompute during builder edits
- [x] **MATH-03**: Math runs server-side at Publish for canonical pricing (same file as MATH-02)
- [x] **MATH-04**: Line-by-line display: retail value bundled, monthly fee, clinic gross per enrolled pet per year, break-even member count
- [x] **MATH-05**: Line items include all fees (Stripe processing estimate + 10% platform fee) so the number is unsurprising

### Plan Builder (`BLDR`)

- [ ] **BLDR-01**: 8-question builder captures species mix, annual exam price, dental price, core vaccine cadence + per-vaccine price, heartworm/flea-tick inclusion, member discount (0–20%), plan tier count (2 or 3)
- [ ] **BLDR-02**: Owner can choose 2 or 3 tiers; default names Preventive / Preventive Plus / Complete
- [ ] **BLDR-03**: Live break-even preview updates on every input change (MATH-02)
- [ ] **BLDR-04**: Owner can return to the builder post-publish to edit prices (BLDR-08) without losing member data
- [ ] **BLDR-05**: Draft plans persist to Postgres — never ephemeral
- [x] **BLDR-06**: Owner edits tier names post-draft before publishing
- [x] **BLDR-07**: Basic member record fields captured at enrollment: pet name, species, owner email, plan start date — collected inside Stripe Checkout `custom_fields` (pet_name text, species dropdown dog/cat)
- [x] **BLDR-08**: Post-publish pricing edits use Stripe's new-Price-on-existing-Product pattern — existing subscriptions unaffected

### Stripe Connect + Publish (`PUB`)

- [x] **PUB-01**: Clinic owner completes Stripe Connect Express onboarding during setup
- [x] **PUB-02**: Publish is gated on `charges_enabled && payouts_enabled && !requirements.disabled_reason` from Stripe `account.updated` webhook
- [x] **PUB-03**: Publish action creates Stripe Product + Price per tier on the platform account
- [x] **PUB-04**: Publish generates unique public enrollment URL `pawplan.app/{clinic-slug}/enroll`
- [x] **PUB-05**: Public enrollment page renders server-side, mobile-responsive, shows tiers side-by-side with clinic name, logo, accent color
- [x] **PUB-06**: Public page survives high-traffic newsletter-blast spikes (ISR or equivalent caching)

### Checkout + Billing (`PAY`)

- [x] **PAY-01**: Stripe Checkout (hosted page, subscription mode) collects pet name + species + owner email + card
- [x] **PAY-02**: Destination charges pattern: `transfer_data.destination = clinic.stripe_account_id`, `application_fee_percent = 10`
- [x] **PAY-03**: Monthly recurring billing via Stripe Subscriptions
- [x] **PAY-04**: Connect webhook handler is idempotent (stripe_events PK on event.id; returns 200 <200ms; fans out heavy work to a queue — queue deferred to Phase 5)
- [x] **PAY-05**: `invoice.payment_failed` webhook flags the member record with status `past_due`; **no auto-email to pet owner in v1** (grep-guarded in source)
- [x] **PAY-06**: `invoice.paid`, `customer.subscription.deleted` update member state atomically (customer.subscription.created deliberately NOT wired — Stripe emits it before checkout.session.completed and its payload lacks custom_fields; checkout.session.completed is the sole Member-creation event per 04-03)
- [x] **PAY-07**: Member status is an enum — `active`, `past_due`, `canceled` — never a boolean

### Notifications + Welcome Packet (`NOTIF`)

- [x] **NOTIF-01**: On successful first charge, system generates a PDF welcome packet (plan name, included services, first billing date, clinic contact) — `@react-pdf/renderer` component in `src/lib/pdf/welcome-packet.tsx`, rendered in the `send-welcome-packet` worker (Phase 5)
- [x] **NOTIF-02**: PDF is emailed to the pet owner as an attachment — delivered via **SendGrid** (not Resend; Daniel-locked switch) with sandbox mode FORCED ON for the public demo; `src/lib/jobs/send-welcome-packet.ts` (Phase 5)
- [x] **NOTIF-03**: Owner receives an email notification of the new enrollment — separate pg-boss job `notify-owner-new-enrollment`, plain-text body, idempotent on `Member.ownerNotifiedAt` (Phase 5)
- [x] **NOTIF-04**: Email delivery runs asynchronously via pg-boss@10 — webhook handler never imports SendGrid or react-pdf; grep-asserted in `src/lib/queue/webhook-hot-path.test.ts` across all 7 hot-path source files (Phase 5)

### Dashboard + Redemption (`DASH`)

- [x] **DASH-01**: Active member count, plan-tier breakdown, MRR (gross — fees — net), 30-day renewal forecast, projected ARR
- [x] **DASH-02**: Per-member row: pet name, species, plan, enrollment date, next billing date, status badge, services remaining this cycle
- [x] **DASH-03**: Failed-charge flag on the member record is visible and filterable (/dashboard/members past_due filter + past_due-first sort)
- [x] **DASH-04**: Staff can toggle a checkbox per included service per billing period per member; idempotent on `(member_id, service_key, billing_period_start)`
- [x] **DASH-05**: Owner can cancel a member subscription; prorates to end of billing period via `cancel_at_period_end: true`; status flip confirmed by webhook at period end. Confirmation-email to pet owner is Phase 5 NOTIF scope.
- [x] **DASH-06**: Dashboard renders in clinic's time zone for display; all storage in UTC; `current_period_end` from Stripe is the truth

## v2 (Deferred)

- Automated client communication beyond welcome packet (renewal reminders, expiring-card notices, dunning retry chains)
- Custom domain / CNAME for enrollment page
- Staff user accounts with RBAC
- Pet-owner login/portal
- Plan pause, freeze, tier-switch flows
- Smart Retries ON with PawPlan-authored failed-payment emails to clients
- CSV export of members
- SMS notifications
- Annual billing option
- Referral / promo-code field
- Species-specific plan templates (exotics, equine, livestock)

## Out of Scope

- **PIMS integration (read or write)** — Shepherd, Cornerstone, AVImark, EzyVet, ImproMed, etc. Clinic-specific APIs double build time and don't defeat the publish-trust RAT.
- **Multi-location / multi-tenant** — one clinic = one account = one Stripe Connect Express account. Two locations = two accounts.
- **Client-facing portal or pet-owner login** — email is the only client channel.
- **Non-Stripe merchant processors** — Square, Heartland, WorldPay. Stripe Connect Express is the proven rail.
- **Automated service-redemption tracking** — no PIMS = no automation. Manual checkboxes are the v1 answer.
- **Native iOS / Android app** — web only, mobile-responsive.
- **Financial reporting beyond dashboard** — no QuickBooks, tax, payout reconciliation, per-service revenue breakdown, CLV.
- **Compliance / regulatory tooling** — clinic owns VCPR docs and state disclosure.
- **Species-specific plan variants** — dogs + cats only in v1.
- **Appointment booking / scheduling.**

## Traceability

Every v1 requirement maps to exactly one phase in ROADMAP.md. Coverage: **42/42** ✓

| Requirement | Phase | Status |
|-------------|-------|--------|
| FOUND-01 | Phase 1 | Complete |
| FOUND-02 | Phase 1 | Pending |
| FOUND-03 | Phase 1 | Pending |
| FOUND-04 | Phase 1 | Complete |
| FOUND-05 | Phase 1 | Complete |
| FOUND-06 | Phase 1 | Complete |
| MATH-01 | Phase 1 | Complete |
| MATH-02 | Phase 3 | Complete |
| MATH-03 | Phase 3 | Complete |
| MATH-04 | Phase 3 | Complete |
| MATH-05 | Phase 3 | Complete |
| BLDR-01 | Phase 1 | Pending |
| BLDR-02 | Phase 1 | Pending |
| BLDR-03 | Phase 1 | Pending |
| BLDR-04 | Phase 1 | Pending |
| BLDR-05 | Phase 1 | Pending |
| BLDR-06 | Phase 3 | Complete |
| BLDR-07 | Phase 4 | Complete (collected inside Stripe Checkout custom_fields — pet_name + species dropdown) |
| BLDR-08 | Phase 3 | Complete |
| PUB-01 | Phase 2 | Complete |
| PUB-02 | Phase 2 | Complete |
| PUB-03 | Phase 3 | Complete |
| PUB-04 | Phase 3 | Complete |
| PUB-05 | Phase 3 | Complete |
| PUB-06 | Phase 3 | Complete (k6 script committed; full load-run operator-driven pre-demo) |
| PAY-01 | Phase 4 | Complete |
| PAY-02 | Phase 4 | Complete |
| PAY-03 | Phase 4 | Complete |
| PAY-04 | Phase 4 | Complete |
| PAY-05 | Phase 4 | Complete (grep-guarded in invoice-payment-failed.ts) |
| PAY-06 | Phase 4 | Complete |
| PAY-07 | Phase 4 | Complete (Postgres enum + TS union; zero boolean member flags) |
| NOTIF-01 | Phase 5 | Complete |
| NOTIF-02 | Phase 5 | Complete |
| NOTIF-03 | Phase 5 | Complete |
| NOTIF-04 | Phase 5 | Complete |
| DASH-01 | Phase 6 | Complete (MRR gross/fees/platform/net + ARR + 30d forecast + tier breakdown cards on /dashboard) |
| DASH-02 | Phase 6 | Complete (expandable members table with services-remaining X/Y + full date column set rendered via formatInClinicTz) |
| DASH-03 | Phase 4 | Complete (dashboard past_due filter + attention-red badge color family) |
| DASH-04 | Phase 6 | Complete (ServiceRedemption DB-unique index on (memberId, serviceKey, billingPeriodStart) + optimistic-lock scaffolding; 5-way concurrent insert test proves exactly-one-row) |
| DASH-05 | Phase 4 | Complete (cancelMember server action + cancelSubscriptionAtPeriodEnd helper; optimistic UX) |
| DASH-06 | Phase 6 | Complete (Intl.DateTimeFormat + IANA zones via Clinic.timezone; storage stays UTC; invalid-zone falls back to UTC) |

### Per-Phase Summary

| Phase | Requirements | Count |
|-------|--------------|-------|
| Phase 1: Foundation | FOUND-01, FOUND-02, FOUND-03, FOUND-04, FOUND-05, FOUND-06, MATH-01, BLDR-01, BLDR-02, BLDR-03, BLDR-04, BLDR-05 | 12 |
| Phase 2: Stripe Connect Onboarding | PUB-01, PUB-02 | 2 |
| Phase 3: Publish + Public Enrollment Page | MATH-02, MATH-03, MATH-04, MATH-05, BLDR-06, BLDR-07, BLDR-08, PUB-03, PUB-04, PUB-05, PUB-06 | 11 |
| Phase 4: Checkout + Subscription Lifecycle | PAY-01, PAY-02, PAY-03, PAY-04, PAY-05, PAY-06, PAY-07, DASH-03, DASH-05 | 9 |
| Phase 5: Notifications + Welcome Packet | NOTIF-01, NOTIF-02, NOTIF-03, NOTIF-04 | 4 |
| Phase 6: Dashboard Metrics + Redemption | DASH-01, DASH-02, DASH-04, DASH-06 | 4 |
| **Total** | | **42** |
