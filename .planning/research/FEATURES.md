# Feature Research

**Domain:** Wellness-membership builder for independent veterinary clinics (B2B SaaS + B2B2C enrollment)
**Researched:** 2026-04-23
**Confidence:** HIGH (competitor feature sets and independent-clinic failure modes are well-documented; confidence slightly reduced on exact 2026 roadmaps for Shepherd/Snout)

## Executive Summary

The vet wellness-plan market has two distinct software shapes, and PawPlan's MoSCoW list deliberately sits in a third, unoccupied position:

1. **Enterprise/consultant-led platforms** (Kleer-for-vet analogs: Nest Veterinary, Covetrus CarePlans, Membersy, Baxtr) — 4-week onboarding, setup consultation fees, deep PIMS integration, member self-service portal. Optimized for DSO/corporate rollouts. Wrong shape for a 2-doctor independent practice.
2. **PIMS-embedded modules** (Shepherd wellness module, ezyVet Wellness Module, Digitail, DaySmart Vet) — "free with your PIMS," but require the clinic to already run that PIMS. Wrong shape for the 80% of independents not on a cloud PIMS, or for clinics shopping independent of PIMS replacement.
3. **PawPlan's slot — same-session self-serve publish with break-even math as the hero.** No competitor in the research frame ships a <45-minute "publish pricing with confidence" flow. Nest advertises "4 weeks to launch." Covetrus advertises "dedicated expert." Baxtr advertises "Monthly Payment Guarantee" (a risk-transfer feature, not a pricing-confidence feature). PawPlan's MoSCoW list — short, Stripe-only, no PIMS, no portal — correctly reflects this positioning.

The spec's "Won't" list is tighter than most founders would draw it. That's the right call: every excluded feature (PIMS, multi-location, portal, non-Stripe, automated redemption, pause/switch, custom domain) is an item competitors added after proving the core. Shipping them in v1 would extend build time by 3–6x and dilute the publish-trust signal that is the riskiest assumption.

One reality-check against the MoSCoW: **"Should — Owner ability to edit plan pricing post-publish without breaking existing subscriptions"** is under-scoped in the spec. In Stripe Subscriptions, creating a new Price on an existing Product and leaving existing subscribers on the legacy Price is the accepted pattern — this is a table-stakes, non-optional feature the moment a clinic publishes a second version of a plan. Treating it as "Should" risks a day-2 embarrassment.

## Feature Landscape

### Table Stakes (Users Expect These)

Features the clinic owner and pet owner assume exist. Missing any of these = the product feels incomplete or unsafe to go live with.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Stripe Connect Express onboarding (clinic) | Every competitor uses managed-account rails; clinic owner expects "connect bank, get paid" UX | MEDIUM | Stripe hosted onboarding covers KYC/PCI. Spec correctly locks to this. |
| Tiered plan output with monthly fee, included services, retail value | Kleer, Membersy, Baxtr, Nest all present tiers side-by-side; single-tier offerings are not recognized as "a wellness plan" | LOW | Spec: 2–3 tiers, default names Preventive / Preventive Plus / Complete. Matches norm. |
| Mobile-responsive enrollment page on a public URL | Banfield/VCA public enrollment is the benchmark; front desk needs a link to text to clients | LOW | Spec: `pawplan.app/{slug}/enroll`. Matches norm. |
| Stripe Checkout embed for pet owner card capture | Any non-Stripe-hosted card form reads as sketchy to 2026 buyers; PCI anxiety | LOW | Spec correct. Do NOT build custom card forms. |
| Monthly recurring billing via Stripe Subscriptions | The entire product category's defining feature | LOW | Spec correct. Use `proration_behavior: none` on most ops. |
| Failed-charge flag on member record | Every competitor surfaces this; owner needs to know who's delinquent before the next visit | LOW | Spec correct. Listen to `invoice.payment_failed` webhook. |
| Owner email notification on new enrollment | Psychological reward loop on day one; also operational (staff needs to know before check-in) | LOW | Spec correct. |
| Welcome packet / enrollment confirmation to pet owner | Corporate chains set this expectation; silence after card charge = cancellation | LOW | Spec: PDF via email. Sufficient. |
| Owner dashboard with MRR, active member count, per-member rows | The "is this working?" view; owner opens this weekly minimum | MEDIUM | Spec correctly includes MRR, plan-tier breakdown, renewal forecast, per-member row. |
| Branded enrollment page (logo + accent color) | Independents are paying to look as polished as Banfield; unbranded page undermines the whole pitch | LOW | Spec has it as "optional" — correct, but the default must not look generic. |
| Owner-initiated cancellation flow | Table stakes for any subscription product; clinics will test cancel before going live | LOW | Spec: "Should," prorates to end of billing period. This is actually table stakes — promote to Must. |
| Post-publish plan pricing edits without breaking existing subscriptions | The moment a clinic raises prices or fixes a typo, this becomes critical; failure mode = "I can't edit my own prices" | MEDIUM | Spec: "Should." **Reality-check: this is table stakes.** Implementation = new Stripe Price object + legacy subscribers stay on old Price. See "Reality-check" section. |
| Failed-payment email to pet owner | Stripe webhook-triggered; every recurring-billing product does this; owner doesn't want to chase delinquent cards manually | LOW | Spec: "Should." Table stakes. |
| Break-even math visible during the builder (not just at the end) | The publish-trust risk demands math be visible continuously; hiding until "Review" stage amplifies the exact failure mode the RAT describes | MEDIUM | Spec: "Should." **Reality-check: this is the core of the differentiator — promote to Must.** |

### Differentiators (Competitive Advantage)

Where PawPlan can win against Kleer-for-vet analogs and PIMS modules. Each maps directly to Core Value: "publish pricing and land first paying member in the same session."

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| **8-question plan builder → tiers in under 10 minutes** | Nest: 4 weeks. Covetrus: consultant call. PawPlan: 8 questions, Enter. This is the product's entire reason to exist. | MEDIUM | Spec correctly frames this as the hero flow. |
| **Line-by-line break-even math with "members to break even" count** | Directly defeats the RAT: owner sees retail value, monthly fee, clinic gross per pet per year, break-even member count. No competitor surfaces break-even count as a first-class output. | MEDIUM | Must be numerically defensible and sourced in plain English ("15 dental cleanings at $X = $Y retail value"). |
| **Same-session publish → shareable URL** | Corporate-chain enrollment URL equivalence with zero consultant hand-off. Primary wedge. | LOW | Spec correct. `pawplan.app/{slug}/enroll`. |
| **Stripe Connect Express with platform fee model** | Clinic bank account receives payouts directly; clinic's money stays in clinic's control. Kleer/Membersy proved this pattern inspires trust. | MEDIUM | Standard Stripe pattern; complexity is in the Connect onboarding UX. |
| **Zero PIMS lock-in** | 60%+ of US independent clinics are not on a cloud PIMS. Shepherd/Digitail/ezyVet modules only serve their own installed base. PawPlan serves the unserved majority. | LOW | Deliberate simplification; becomes a marketable "no integration required" headline. |
| **No setup fee, no onboarding call** | Every major competitor (Nest, Covetrus, Kleer, Membersy) sells through a sales call. PawPlan's self-serve signup with credit card on file is a GTM differentiator, not just a product one. | LOW | Billing/GTM decision, but surfaces in the product as "no demo required" CTA. |
| **Dogs + cats only, no species variants** | Counter-intuitive differentiator: the 95% use case gets a simpler UI, no confusing "exotic" branches. | LOW | Spec correct. |

### Anti-Features (Deliberately NOT Building in v1)

Features that appear good, are requested by users, or exist in competitors — but building them in v1 would directly attack the publish-trust risk by adding scope and delaying validation. All match the spec's "Won't" list; complexity and alternative are called out for each.

| Feature | Why Requested | Why Problematic in v1 | Alternative (v1) |
|---------|---------------|----------------------|------------------|
| PIMS integration (Shepherd, Cornerstone, AVImark, EzyVet, ezyVet, ImproMed) | Staff don't want double-entry; "real" wellness products integrate | Each PIMS has a different API surface (or no API at all — AVImark is a desktop app with a proprietary DB). 2–3x build time. Zero impact on publish-trust RAT. | Manual service-redemption checkbox in dashboard. Workflow downgrade vs integrated, workflow **upgrade** vs the spreadsheet it replaces. |
| Multi-location / multi-tenant | Chains and 2-location practices will ask | Introduces auth complexity (org model, role-based access, per-location Stripe accounts). ICP is 1–3 doctor single-location; multi-location is a different ICP. | Two locations = two PawPlan accounts. Document explicitly in onboarding. |
| Client-facing pet-owner portal/login | "Clients want to see their plan status" (Membersy, Kleer, baxtr all ship this) | Auth for pet owners doubles the user model. Clients actually open Stripe receipts, not portals. No evidence from competitors that portal usage is high. | Email-only: welcome packet PDF + Stripe receipts. Add portal in v2 only if support volume demands it. |
| Non-Stripe processors (Square, Heartland, WorldPay, Clover) | Clinics already have a terminal processor and don't want to switch | Merchant-processor negotiation + per-processor tokenization + settlement reconciliation = months of work. Kleer/Membersy chose Stripe for the same reason. | Stripe Connect Express only. Position as "no processor required — we handle everything." |
| Automated service-redemption tracking | "I don't want to check boxes manually" | Without PIMS data you cannot automate redemption. Fake automation (e.g., auto-tick boxes on schedule) is worse than manual. | Manual staff checkbox per included service per billing period. Owner pattern-matches this to existing workflows. |
| Plan pause / freeze / tier-switch | "My client wants to pause for the summer" | Each flow has proration, re-enrollment, communication, and Stripe-side complexity. Failure modes surface during real usage, not during spec. | Cancel + re-enroll. Document in FAQ. Add after 10+ real clinic requests in production. |
| Automated renewal reminders / dunning retry / expiring-card notices | "I don't want to chase clients" | Stripe's Smart Retries + default expiring-card emails cover 80% of this for free. Custom dunning sequences are a full product. | Enable Stripe's built-in Smart Retries and expiring-card emails. Defer custom sequences. |
| Custom domain / CNAME for enrollment page | "We want the URL to say `myclinic.com/plans`" | DNS verification, SSL cert issuance, CDN routing per clinic. Security attack surface. Not differentiating at v1. | Share `pawplan.app/{slug}/enroll`. Clinic links from own site via a simple button. |
| Native iOS / Android app | "Our clients want an app" | App-store review cycles + push-notification infra + device-testing matrix. Clinic enrollment is a 2-minute web flow, not a daily-use app. | Mobile-responsive web page. Full stop. |
| Revenue reporting beyond MRR / ARR forecast (QuickBooks, tax, payout reconciliation, CLV) | Accountants will ask; owners anticipate at year-end | Accounting-grade reporting is a separate product category. Stripe's dashboard + 1099-K covers tax. | Stripe's own dashboard + PawPlan's MRR/ARR dashboard. CSV export of members in v1.x. |
| VCPR / state-disclosure / regulatory templates | "Can I get sued for this?" (legitimate concern) | PawPlan is not a law firm. Templates create legal liability with state-by-state variance (50 state practice acts). | Disclaimer: "Clinic owns compliance." Optional: link to AVMA wellness-plan resources. |
| Species-specific plan templates (exotics, equine, livestock) | "I also see rabbits/horses/cattle" | Exotic/equine cost structures are fundamentally different; pricing math can't reuse dog+cat assumptions. | Dogs + cats only in v1. Species-mix question informs copy, not plan variants. |
| Appointment booking / scheduling | "If we're already in the portal…" | Different product (AllyDVM, PetDesk, Vetstoria). Scope creep into PIMS territory. | Out. Clinic keeps its existing booking tool. |
| Annual billing option (only monthly) | Some owners prefer annual for cashflow predictability | Adds pricing-tier complexity to builder; annual up-front also shifts revenue-recognition. | Monthly-only. Add annual in v1.x if asked 3+ times. |
| SMS notifications to owner | "Email gets buried" | Adds Twilio dependency + opt-in compliance. | Email-only in v1. |
| Promo / referral codes | "We want to run a 1-month-free promo" | Stripe Coupons work but require UI for code management + redemption tracking. | Out of v1. Owner can manually comp via direct Stripe dashboard if needed. |

## Reality-Check Against Spec's MoSCoW

Three items in the spec's MoSCoW need re-classification based on competitor benchmarks and the publish-trust RAT:

### Promote to Must (currently "Should")

1. **"Line-by-line break-even math visible during the builder wizard (not only at the end)"** — This IS the RAT. Hiding math until review = the calculator-not-sales-tool failure mode described in §4 of the spec. Cannot be demoted.
2. **"Owner ability to edit plan pricing post-publish without breaking existing subscriptions"** — Table stakes for any recurring-billing product. Owners will discover their $3 pricing typo at 9pm day one. Implementation is non-trivial but not optional (see Dependencies).
3. **"Owner-initiated cancellation flow (prorates to end of billing period)"** — No owner goes live without knowing how to cancel. This will be tested before the first real enrollment.
4. **"Failed-payment email to pet owner (Stripe webhook-triggered)"** — Without this, owners chase cards manually, which is the operational pain the product promises to eliminate.

### Can remain "Should" or "Could"

- Plan-builder edit mode without losing member data — Should. Useful but not blocking.
- Clinic logo and accent color on enrollment page — Should. Spec already treats logo as optional; accent color is a 1-hour addition.
- Member CSV export, SMS to owner, welcome-packet custom note, annual billing, promo codes — all correctly placed as Could.

### Add to "Won't" (currently silent)

- **Member self-service portal login.** The spec's "No client-facing portal" covers this, but make explicit that the pet owner never receives a PawPlan login — just emails.
- **Staff user accounts under one clinic account.** Spec silent. v1 = one email/password per clinic. Front desk shares credentials (standard for small practices). Role-based access is a v2 feature.

## Feature Dependencies

```
[Stripe Connect Express onboarding]
    └──requires──> [Clinic account w/ email+password]
                       └──required-by──> [Plan publish]
                                            └──requires──> [8-question builder]
                                                               └──requires──> [Break-even math engine]
                                                                                  └──enhances──> [Publish-trust RAT]

[Enrollment page]
    └──requires──> [Published plan w/ Stripe Price IDs]
    └──requires──> [Stripe Checkout session creation]
                       └──requires──> [Connected account ID on Checkout]

[Monthly recurring billing]
    └──requires──> [Stripe Subscription created at enrollment]
                       └──requires──> [Stripe webhook endpoint for invoice events]
                                          └──required-by──> [Failed-charge flag]
                                          └──required-by──> [Failed-payment email]
                                          └──required-by──> [MRR dashboard (live)]

[Post-publish pricing edits]
    └──requires──> [New Stripe Price created on existing Product]
    └──requires──> [Legacy subscribers retained on old Price]
    └──requires──> [Enrollment page serves latest Price only]

[Owner dashboard]
    └──requires──> [Member records persisted (pet name, species, plan, dates)]
    └──requires──> [Stripe Subscription status sync via webhook]

[Manual service redemption]
    └──requires──> [Per-plan service list]
    └──requires──> [Per-member per-period redemption record]

[Welcome-packet PDF]
    └──requires──> [PDF generation (e.g. @react-pdf/renderer or Puppeteer)]
    └──requires──> [Transactional email provider (Resend / Postmark / SendGrid)]
                       └──required-by──> [Failed-payment email]
                                          └──required-by──> [Owner new-enrollment email]

[Branded enrollment page]
    └──requires──> [Logo upload + storage (S3 / R2 / Supabase Storage)]
    └──enhances──> [Publish-trust — owner more likely to go live if page looks like their brand]
```

### Key Dependency Notes

- **Stripe webhook endpoint is a keystone.** Four features depend on it (failed-charge flag, failed-payment email, MRR dashboard live sync, member status). Build the webhook handler early; mock it locally with Stripe CLI.
- **Post-publish pricing edits depend on Stripe's Price/Product model.** Never update a Price in place; always create a new Price on the same Product. Existing subscribers' `items[].price` must stay bound to the old Price ID.
- **Break-even math is load-bearing for the whole product.** If the math engine is wrong or slow, the RAT fails. Unit-test this module before the UI exists.
- **Stripe Connect Express onboarding is a blocking prerequisite for publish.** A clinic cannot publish a plan before KYC completes. Onboarding UI must allow saving a draft plan *before* Connect finishes, then unlock Publish on Connect completion.
- **Transactional email is a shared dependency** for welcome packet, owner new-enrollment, and failed-payment email. Pick the provider (Resend recommended: React Email integration, modern DX) once and reuse.

## MVP Definition

### Launch With (v1) — matches spec's Must + promoted Should items

- [ ] Clinic account creation (email + password) — gatekeeper
- [ ] Stripe Connect Express onboarding — payment rail
- [ ] 8-question plan builder — RAT hero flow
- [ ] **Break-even math visible during builder (not at end)** — promoted from Should; defeats RAT
- [ ] 2–3 tier plan generation with default names
- [ ] Publish action → unique `pawplan.app/{slug}/enroll` URL
- [ ] Mobile-responsive enrollment page with tier comparison
- [ ] Stripe Checkout embed
- [ ] Monthly recurring billing via Stripe Subscriptions
- [ ] Stripe webhook handler (invoice.paid, invoice.payment_failed, customer.subscription.*)
- [ ] Failed-charge flag on member record
- [ ] **Failed-payment email to pet owner** — promoted from Should; table stakes
- [ ] PDF welcome packet auto-emailed on enrollment
- [ ] Owner email notification on new enrollment
- [ ] Owner dashboard: active members, plan-tier breakdown, MRR, 30-day renewal forecast, projected ARR, per-member records
- [ ] Manual service-redemption checkbox per service per billing period
- [ ] Single clinic profile: practice name (required), logo + accent color (optional)
- [ ] **Owner-initiated cancellation flow (prorates to period end)** — promoted from Should; tested pre-launch
- [ ] **Post-publish plan pricing edits (new Price, legacy subscribers retained)** — promoted from Should; table stakes

### Add After Validation (v1.x) — matches spec's Could + one promotion

- [ ] Plan-builder edit mode without data loss — trigger: 3+ owners report losing progress
- [ ] Custom plan-tier names + descriptions — trigger: 50%+ publish with renamed tiers (implies default names are insufficient)
- [ ] Member CSV export — trigger: first accountant asks
- [ ] SMS owner notification on new enrollment — trigger: owner reports missing email notification
- [ ] Welcome-packet PDF customization (clinic note) — trigger: 3+ requests
- [ ] Annual billing option — trigger: 3+ clinic requests + demonstrable MRR impact
- [ ] Promo/referral code field — trigger: first seasonal-campaign request
- [ ] Enhanced dashboard (cohort retention, failed-payment trend) — trigger: clinics cross 50+ members

### Future Consideration (v2+) — explicit scope expansion triggers

- [ ] Member self-service portal — defer until failed-email support volume exceeds 1 hour/week/clinic
- [ ] Plan pause / tier-switch flows — defer until 10+ clinic requests with specific use cases
- [ ] Multi-location support — defer until first multi-location clinic signs contract with workaround; likely a separate tier
- [ ] PIMS integration (start with Shepherd since it's already API-friendly) — defer until product-market fit and 50+ paying clinics
- [ ] Custom domain / CNAME — defer until enterprise/multi-location tier
- [ ] Species-specific plans (exotics) — defer until dogs+cats demand is saturated
- [ ] QuickBooks integration — defer until explicit accountant pushback from 5+ clinics
- [ ] Staff user accounts with RBAC — defer until first clinic with 3+ staff requests

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Stripe Connect Express onboarding | HIGH | MEDIUM | P1 |
| 8-question plan builder | HIGH | MEDIUM | P1 |
| Break-even math (live during builder) | HIGH | MEDIUM | P1 |
| Tiered plan generation | HIGH | LOW | P1 |
| Publish → unique enrollment URL | HIGH | LOW | P1 |
| Mobile-responsive enrollment page + Stripe Checkout | HIGH | MEDIUM | P1 |
| Monthly recurring billing (Stripe Subscriptions) | HIGH | MEDIUM | P1 |
| Stripe webhook handler | HIGH | MEDIUM | P1 |
| Failed-charge flag on member record | HIGH | LOW | P1 |
| Failed-payment email to pet owner | HIGH | LOW | P1 |
| PDF welcome packet | MEDIUM | MEDIUM | P1 |
| Owner email on new enrollment | MEDIUM | LOW | P1 |
| Owner dashboard (MRR, members, tier breakdown, ARR) | HIGH | MEDIUM | P1 |
| Manual service-redemption checkbox | MEDIUM | LOW | P1 |
| Clinic profile (name, logo, accent color) | MEDIUM | LOW | P1 |
| Owner-initiated cancellation (prorated) | HIGH | LOW | P1 |
| Post-publish pricing edits (Stripe new-Price pattern) | HIGH | MEDIUM | P1 |
| Plan-builder edit mode (non-destructive) | MEDIUM | MEDIUM | P2 |
| Custom plan-tier names | MEDIUM | LOW | P2 |
| Member CSV export | LOW | LOW | P2 |
| SMS owner notification | LOW | MEDIUM | P2 |
| Welcome-packet customization | LOW | LOW | P2 |
| Annual billing | MEDIUM | MEDIUM | P2 |
| Promo/referral codes | LOW | MEDIUM | P2 |
| Member self-service portal | MEDIUM | HIGH | P3 |
| Plan pause/switch | MEDIUM | HIGH | P3 |
| Multi-location | HIGH (narrow segment) | HIGH | P3 |
| PIMS integration | HIGH (narrow segment) | HIGH | P3 |
| Custom domain / CNAME | LOW | MEDIUM | P3 |
| Species-specific plans | LOW | HIGH | P3 |
| QuickBooks / accounting export | LOW | MEDIUM | P3 |

**Priority key:**
- P1: Must have for launch — matches "Must" list + promoted "Should"
- P2: Should have, add when capacity allows — spec's "Could" list
- P3: Nice to have, explicit scope expansion triggers required

## Competitor Feature Analysis

| Feature | Kleer (dental ref) | Membersy (dental ref) | Shepherd Wellness | Nest Veterinary | Baxtr | Covetrus CarePlans | **PawPlan v1** |
|---------|-------------------|----------------------|-------------------|-----------------|-------|-------------------|----------------|
| Self-serve same-session publish | No — sales call | No — sales call | Bundled with PIMS | No — 4-week onboarding | Partial — no credit card to start | No — expert implementation | **Yes (wedge)** |
| Break-even math UI | No (ROI report post-launch 2026) | No (analytics post-fact) | No | No | No (ROI dashboard) | No | **Yes (hero)** |
| Tiered plan generator | Yes | Yes | Yes | Yes | Yes | Yes | Yes |
| Branded public enrollment URL | Yes | Yes | Yes (via PIMS portal) | Yes | Yes | Yes | Yes |
| Stripe Connect rails | Yes | Yes | Varies | Unknown | Yes | Varies | **Yes (explicit)** |
| PIMS integration | Yes (Dentrix) | Yes (multi) | Native (is a PIMS) | Yes | Partial | Yes | **No (explicit anti)** |
| Member self-service portal | Yes | Yes | Yes (Shepherd pet portal) | Yes | Yes | Yes | **No (anti)** |
| Multi-location | Yes (enterprise) | Yes (enterprise) | Yes | Yes | Yes | Yes | **No (anti)** |
| Automated redemption tracking | Yes (via PMS) | Yes (via PMS) | Yes (native) | Partial | Partial | Yes | **No — manual checkbox** |
| Plan pause / tier-switch | Yes | Yes | Yes | Yes | Yes | Yes | **No (anti)** |
| Failed-payment guarantee | No | No | No | No | **Yes (MPG)** | No | No (Stripe Smart Retries only) |
| Setup fee / onboarding fee | Yes | Yes | Included w/ PIMS | Yes | Unclear | Yes | **$0 (differentiator)** |
| Dedicated account manager | Yes | Yes | No | Yes | Partial | Yes | **No (differentiator)** |

**Reading the matrix:** PawPlan is the only offering in the comparison set that is (a) self-serve end-to-end, (b) break-even-math-first, and (c) explicitly unbundled from PIMS. Every "No" in the PawPlan column is a deliberate scope decision that keeps the product shippable by a solo builder in weeks, not months, and keeps the narrative consistent: "publish pricing with confidence, today."

## Sources

- [Kleer / Clerri — In-House Dental Membership Plan Software](https://www.kleer.com/dentists) — competitor feature set, 2026 analytics roadmap
- [Kleer Reviews 2026 (Capterra)](https://www.capterra.com/p/247850/Kleer/) — user-reported feature gaps and pricing
- [Clerri — PMS Integration and 2026 Analytics](https://decisionsindentistry.com/2025/10/clerri-paves-the-way-for-more-accessible-dental-care-with-ai-and-data-analytics/) — 2026 feature roadmap
- [Membersy Connect — Platform Features](https://membersy.com/dental-professionals/membersy-connect/) — member portal, PMS integration, analytics patterns
- [Kleer + Membersy Merger Announcement](https://technical.ly/software-development/dental-membership-software-providers-kleer-membersy/) — consolidation signal for the reference market
- [Shepherd Veterinary — Wellness Plans Integration](https://www.shepherd.vet/blog/pet-insurance-wellness-plans-built-into-your-practice-software/) — PIMS-bundled approach
- [Shepherd Wellness Category](https://www.shepherd.vet/category/wellness-plans/) — feature descriptions
- [Baxtr — Subscription Pet Care Software](https://www.getbaxtr.com/pet-wellness-plans) — direct competitor, Monthly Payment Guarantee
- [Baxtr Pricing](https://www.getbaxtr.com/pricing) — per-clinic + processing fees model
- [Nest Veterinary — Care Plans](https://www.nestveterinary.com/solutions/care-plans) — 4-week onboarding, consultant-led rollout
- [Covetrus CarePlans](https://covetrus.com/covetrus-platform/client-engagement-tools/covetrus-careplans/) — enterprise onboarding with dedicated experts
- [ezyVet Wellness Module blog](https://www.ezyvet.com/blog/wellness-plans) — PIMS-embedded wellness offering
- [Rethink Veterinary Solutions — Why Wellness Plans Fail](https://rethinkveterinarysolutions.com/discounts-vs-rewards-the-math-doesnt-lie/why-wellness-plans-have-failed-for-many-independently-owned-veterinary-practices-case-studies-and-insights) — independent-practice failure modes (cited in MVP-SPEC §4)
- [8 Mistakes to Avoid in Veterinary Wellness Plans (dvm360)](https://www.dvm360.com/view/8-mistakes-avoid-your-veterinary-wellness-plans) — domain pitfalls
- [Pros and Cons of Wellness Plans (Vet Radar)](https://www.vetradar.com/blog/pros-and-cons-of-wellness-plans) — adoption friction analysis
- [DaySmart Vet — Managing Wellness Plans](https://help.vettersoftware.com/en/articles/9301435-managing-wellness-plans) — PIMS-embedded expectations baseline
- [IDEXX — Veterinary Payment Trends 2026](https://software.idexx.com/resources/blog/veterinary-payment-trends-what-to-expect-in-2026) — 2026 independent-clinic payment expectations
- [Stripe Billing — Subscriptions & Connect pattern](https://docs.stripe.com/connect/subscriptions) — technical reference for payment-rail choices
- [Stripe — SaaS subscriptions](https://docs.stripe.com/get-started/use-cases/saas-subscriptions) — recurring-billing and post-publish Price patterns

---
*Feature research for: wellness-membership builder for independent veterinary clinics*
*Researched: 2026-04-23*
