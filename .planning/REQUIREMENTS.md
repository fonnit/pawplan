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
- [ ] **FOUND-04**: Schema enforces per-clinic row-level isolation (RLS on every tenant-owned table)
- [ ] **FOUND-05**: Clinic slug is unique, lowercase-ASCII, reserved-word-filtered, locked at creation
- [ ] **FOUND-06**: Single clinic profile (practice name required, logo optional, accent color from 6-preset palette)

### Break-Even Engine (`MATH`)

- [ ] **MATH-01**: Pure function computes per-tier break-even math given 8 builder inputs + 10% platform fee
- [ ] **MATH-02**: Math runs client-side for live recompute during builder edits
- [ ] **MATH-03**: Math runs server-side at Publish for canonical pricing (same file as MATH-02)
- [ ] **MATH-04**: Line-by-line display: retail value bundled, monthly fee, clinic gross per enrolled pet per year, break-even member count
- [ ] **MATH-05**: Line items include all fees (Stripe processing estimate + 10% platform fee) so the number is unsurprising

### Plan Builder (`BLDR`)

- [ ] **BLDR-01**: 8-question builder captures species mix, annual exam price, dental price, core vaccine cadence + per-vaccine price, heartworm/flea-tick inclusion, member discount (0–20%), plan tier count (2 or 3)
- [ ] **BLDR-02**: Owner can choose 2 or 3 tiers; default names Preventive / Preventive Plus / Complete
- [ ] **BLDR-03**: Live break-even preview updates on every input change (MATH-02)
- [ ] **BLDR-04**: Owner can return to the builder post-publish to edit prices (BLDR-08) without losing member data
- [ ] **BLDR-05**: Draft plans persist to Postgres — never ephemeral
- [ ] **BLDR-06**: Owner edits tier names post-draft before publishing
- [ ] **BLDR-07**: Basic member record fields captured at enrollment: pet name, species, owner email, plan start date
- [ ] **BLDR-08**: Post-publish pricing edits use Stripe's new-Price-on-existing-Product pattern — existing subscriptions unaffected

### Stripe Connect + Publish (`PUB`)

- [ ] **PUB-01**: Clinic owner completes Stripe Connect Express onboarding during setup
- [ ] **PUB-02**: Publish is gated on `charges_enabled && payouts_enabled && !requirements.disabled_reason` from Stripe `account.updated` webhook
- [ ] **PUB-03**: Publish action creates Stripe Product + Price per tier on the platform account
- [ ] **PUB-04**: Publish generates unique public enrollment URL `pawplan.app/{clinic-slug}/enroll`
- [ ] **PUB-05**: Public enrollment page renders server-side, mobile-responsive, shows tiers side-by-side with clinic name, logo, accent color
- [ ] **PUB-06**: Public page survives high-traffic newsletter-blast spikes (ISR or equivalent caching)

### Checkout + Billing (`PAY`)

- [ ] **PAY-01**: Stripe Checkout (hosted page, subscription mode) collects pet name + species + owner email + card
- [ ] **PAY-02**: Destination charges pattern: `transfer_data.destination = clinic.stripe_account_id`, `application_fee_percent = 10`
- [ ] **PAY-03**: Monthly recurring billing via Stripe Subscriptions
- [ ] **PAY-04**: Connect webhook handler is idempotent (stripe_events PK on event.id; returns 200 <200ms; fans out heavy work to a queue)
- [ ] **PAY-05**: `invoice.payment_failed` webhook flags the member record with status `past_due`; **no auto-email to pet owner in v1**
- [ ] **PAY-06**: `invoice.paid`, `customer.subscription.created`, `customer.subscription.deleted` update member state atomically
- [ ] **PAY-07**: Member status is an enum — `active`, `past_due`, `canceled` — never a boolean

### Notifications + Welcome Packet (`NOTIF`)

- [ ] **NOTIF-01**: On successful first charge, system generates a PDF welcome packet (plan name, included services, first billing date, clinic contact)
- [ ] **NOTIF-02**: PDF is emailed to the pet owner via Resend as an attachment
- [ ] **NOTIF-03**: Owner receives an email notification of the new enrollment
- [ ] **NOTIF-04**: Email delivery runs asynchronously (pg-boss or equivalent) — webhook handler never blocks on Resend

### Dashboard + Redemption (`DASH`)

- [ ] **DASH-01**: Active member count, plan-tier breakdown, MRR (gross — fees — net), 30-day renewal forecast, projected ARR
- [ ] **DASH-02**: Per-member row: pet name, species, plan, enrollment date, next billing date, status badge, services remaining this cycle
- [ ] **DASH-03**: Failed-charge flag on the member record is visible and filterable
- [ ] **DASH-04**: Staff can toggle a checkbox per included service per billing period per member; idempotent on `(member_id, service_key, billing_period_start)`
- [ ] **DASH-05**: Owner can cancel a member subscription; prorates to end of billing period; confirmation email to pet owner
- [ ] **DASH-06**: Dashboard renders in clinic's time zone for display; all storage in UTC; `current_period_end` from Stripe is the truth

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
| FOUND-04 | Phase 1 | Pending |
| FOUND-05 | Phase 1 | Pending |
| FOUND-06 | Phase 1 | Pending |
| MATH-01 | Phase 1 | Pending |
| MATH-02 | Phase 3 | Pending |
| MATH-03 | Phase 3 | Pending |
| MATH-04 | Phase 3 | Pending |
| MATH-05 | Phase 3 | Pending |
| BLDR-01 | Phase 1 | Pending |
| BLDR-02 | Phase 1 | Pending |
| BLDR-03 | Phase 1 | Pending |
| BLDR-04 | Phase 1 | Pending |
| BLDR-05 | Phase 1 | Pending |
| BLDR-06 | Phase 3 | Pending |
| BLDR-07 | Phase 3 | Pending |
| BLDR-08 | Phase 3 | Pending |
| PUB-01 | Phase 2 | Pending |
| PUB-02 | Phase 2 | Pending |
| PUB-03 | Phase 3 | Pending |
| PUB-04 | Phase 3 | Pending |
| PUB-05 | Phase 3 | Pending |
| PUB-06 | Phase 3 | Pending |
| PAY-01 | Phase 4 | Pending |
| PAY-02 | Phase 4 | Pending |
| PAY-03 | Phase 4 | Pending |
| PAY-04 | Phase 4 | Pending |
| PAY-05 | Phase 4 | Pending |
| PAY-06 | Phase 4 | Pending |
| PAY-07 | Phase 4 | Pending |
| NOTIF-01 | Phase 5 | Pending |
| NOTIF-02 | Phase 5 | Pending |
| NOTIF-03 | Phase 5 | Pending |
| NOTIF-04 | Phase 5 | Pending |
| DASH-01 | Phase 6 | Pending |
| DASH-02 | Phase 6 | Pending |
| DASH-03 | Phase 4 | Pending |
| DASH-04 | Phase 6 | Pending |
| DASH-05 | Phase 4 | Pending |
| DASH-06 | Phase 6 | Pending |

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
