# PawPlan — MVP Spec

**Brief source:** `agents/market-researcher/briefs/2026-04-23-mvp-briefs.md` §4 "PawPlan — Build, price, and sell your own wellness membership. No Banfield required."

**One-line pitch:** Stop losing clients to Banfield's wellness plan contracts — build and sell your own monthly membership in an afternoon, collect recurring payments automatically, and keep every dollar inside your practice.

---

## 1. Problem framing
_Source: converged_

The owner of an independent vet clinic is trying to stop losing price-sensitive clients to corporate chains — primarily Banfield. The job is not "add a loyalty program." The job is to convert annual preventive-care clients into a recurring-revenue relationship that stays inside the practice, before the client walks across the parking lot to a Banfield inside the nearby PetSmart.

The blocking condition is operational, not clinical. The clinic owner already performs annual exams, dentals, and vaccine series — the value is already there. What is missing is the machinery to package that value, price it with confidence, collect monthly payments without staff overhead, and hand clients a frictionless sign-up experience that matches what corporate chains have built on purpose-built enrollment infrastructure.

Every in-house attempt — paper agreements, spreadsheet tracking, manual invoicing — has failed at the same three handoffs: the owner cannot quote a plan on the spot because the break-even math has never been run; the front desk cannot enroll a client in under three minutes because there is no public enrollment page; monthly billing requires staff action no one has time for. Meanwhile the front desk continues to field "do you have a wellness plan?" calls with "no" or a confusing discount-sheet explanation.

The progress the owner wants to make: stand up a branded, client-facing wellness membership — priced correctly, billed automatically — without hiring a consultant or onboarding a platform that requires six weeks of integration work. The functional job is "build, publish, enroll, bill." The emotional job is "feel like a modern practice, not an independent shop losing on infrastructure."

## 2. Target user
_Source: synthesized from A + B + C_

**Primary operator (who uses the product daily):** Practice owner-DVM or practice manager at a 1–3 doctor independently owned clinic. Likely 35–55. Handles billing setup, staff workflows, and client communications personally or with one front-desk person. Comfortable with web apps and online banking; not a systems integrator. Evaluates tools by whether staff can use them on day one. Time-scarce — any setup that takes more than one afternoon does not get finished.

**Primary buyer (who pays the SaaS fee):** Same person, or the business owner if the DVM is an associate. Pays out of practice operating budget. Decision horizon: one to four weeks from first contact. Unilateral decision — no IT department, no procurement cycle. Buying trigger: losing three or more price-sensitive clients in a quarter to a nearby Banfield/VCA, or a staff complaint about the "do you have a plan?" call frequency.

**Early-adopter profile (first clinic that says yes):** A two-doctor mixed-practice (dogs, cats, occasional exotics) in a suburban market within 5 miles of a PetSmart-anchored Banfield or a VCA. Has been in practice 5–15 years. Has lost a measurable number of wellness clients to corporate plans in the past 24 months and can name at least one client who left explicitly because of the wellness plan. Has attempted — or seriously considered and shelved — a spreadsheet-based wellness plan. Has heard of Kleer from a dentist friend or seen Shepherd's March 2026 wellness-plan launch and is looking for an equivalent for vet. Active in a vet-owner Facebook group, VHMA, or AVMA forum where software tools get discussed. Will beta-test in exchange for a discounted first quarter if the enrollment page goes live before summer vaccine season.

**ICP criteria:**
- Independent ownership (not PE-backed, DSO-affiliated, or corporate franchise)
- 1–3 locations, single tax entity
- Annual revenue $400K–$2M
- Currently performs annual wellness exams and dentals, charges à la carte
- No existing recurring billing product
- At least one corporate competitor within 5 miles
- Has a Stripe-compatible bank account or will open one
- Does not require PIMS write-back as a condition of purchase

## 3. Value hypothesis
_Source: converged_

We believe independent vet clinic owners will publish a PawPlan enrollment page and collect their first paying member within 48 hours of account creation, because PawPlan eliminates the three blockers that have killed every in-house wellness plan attempt: pricing uncertainty (break-even math shown line by line before publishing), enrollment friction (a branded public page the owner can share without IT help), and billing administration (automatic monthly charges with no manual follow-up required).

## 4. Riskiest assumption
_Source: synthesized from A + B + C_

The riskiest assumption is that a clinic owner will trust PawPlan's break-even math enough to publish pricing to real clients in their first session — without forwarding the draft to a bookkeeper, asking an accountant, or posting a screenshot in a Facebook group for second opinions.

The failure mode is distinct from "will they pay for the software." It is that the math may be correct but unfamiliar: the owner completes the 8-question plan builder, sees the tiered options with line-by-line break-even, and pauses. The draft sits unpublished for three weeks. Enrollment never starts. The product stalls at the finish line of the build step. Observable symptom: high plan-builder completion, near-zero publish clicks — a calculator, not a sales tool.

This is the exact failure mode the Rethink Veterinary Solutions analysis describes: administrative complexity produces low conversion rates even when the plan is technically available. If publish confidence is low, every downstream capability (Stripe charging, client enrollment, monthly billing) is moot because no real plan reaches a real client. Every other belief in the value hypothesis is downstream of the owner clicking publish.

## 5. Scope
_Source: converged_

The thinnest end-to-end path: one clinic, one published plan, one enrolled pet owner, one successful monthly charge.

1. **Clinic onboarding.** Owner creates an account (email + password), enters practice name, uploads a logo (optional), and completes Stripe Connect Express onboarding to connect a payout account.
2. **8-question plan builder.** Owner answers: species mix (dogs / cats / both), annual exam price, dental cleaning price, core vaccine cadence and per-vaccine price, heartworm/flea-tick prevention inclusion, desired member discount (0–20%), number of plan tiers (2 or 3).
3. **Tiered plan generation with break-even math.** PawPlan generates 2–3 named plan options (default names e.g., Preventive / Preventive Plus / Complete) with a line-by-line table showing: retail value bundled, monthly fee, clinic gross per enrolled pet per year, and break-even member count at current exam volume. Owner can adjust any input and recalculate.
4. **Publish.** Owner edits plan names and prices, then clicks Publish. PawPlan generates a unique public enrollment URL (`pawplan.app/{clinic-slug}/enroll`) and a mobile-responsive enrollment page showing tiers side-by-side with a Stripe Checkout embed.
5. **Pet owner enrollment.** Client opens the URL on any device, selects a plan tier, enters pet name and species + owner email, and enters card details via Stripe Checkout. On successful first charge, the client receives an auto-generated PDF welcome packet (plan name, included services, first billing date, clinic contact) via email. Owner receives an email notification.
6. **Recurring billing.** Stripe Subscriptions processes the monthly charge automatically. Failed charges trigger an email to the client and surface as a flag on the member record in the dashboard.
7. **Owner dashboard.** Active member count, plan-tier breakdown, MRR, next-30-day renewal forecast, projected ARR, and a per-member row (pet name, species, plan, enrollment date, next billing date, services remaining this cycle).
8. **Manual service redemption.** At check-in, staff open the member's row and toggle a checkbox per included service per billing period. No PIMS integration in v1.

**Payment rails call: Stripe Connect Express.** Clinic onboards via Stripe Connect Express during setup; PawPlan takes a platform fee; the clinic receives payouts directly to its own bank account. This eliminates merchant-processor negotiation, handles PCI compliance, and matches the rail Kleer and Membersy proved at scale for identical use cases. Non-Stripe processors (Square, Heartland, WorldPay) are not supported in v1.

**PIMS integration call: none in v1.** Service redemption is owner-entered checkboxes on the dashboard. PIMS APIs are clinic-specific, double build time, and the riskiest assumption (owner trust in pricing) has nothing to do with PIMS data. A manual checkbox is a workflow degradation from full integration but a workflow upgrade over the spreadsheet it actually replaces.

## 6. Feature prioritization (MoSCoW)
_Source: synthesized from A + B + C_

**Must — MVP fails without these:**
- 8-question plan builder with line-by-line break-even math output
- 2–3 tiered plan generation with default names, included services, monthly price
- Plan publish action generating a unique public enrollment URL
- Mobile-responsive enrollment page with tier comparison and Stripe Checkout embed
- Stripe Connect Express onboarding for the clinic
- Monthly recurring billing via Stripe Subscriptions
- Failed-charge flag on the member record
- PDF welcome packet auto-emailed to the client on enrollment
- Owner email notification on new enrollment
- Owner dashboard: active members, plan-tier breakdown, MRR, 30-day renewal forecast, projected ARR, per-member record
- Manual service-redemption toggle per included service per billing period
- Single clinic profile (practice name required, logo optional)

**Should — demo materially weaker without:**
- Line-by-line break-even math visible during the builder wizard (not only at the end)
- Owner ability to edit plan pricing post-publish without breaking existing subscriptions
- Owner-initiated cancellation flow (prorates to end of billing period; client receives confirmation email)
- Failed-payment email to the pet owner (Stripe webhook-triggered)
- Clinic logo and accent color on the enrollment page
- Plan-builder edit mode (return and revise without losing member data)
- Basic member record fields: pet name, species, owner email, plan start date

**Could — cuts first if schedule compresses:**
- Custom plan tier names and descriptions (defaults ship as Preventive / Preventive Plus / Complete)
- Member CSV export from dashboard
- SMS notification to owner on new enrollment
- Welcome packet PDF customization (clinic-added note)
- Annual billing option (monthly is sufficient for demo)
- Referral or promo-code field on enrollment page

**Won't — explicit v1 exclusions:**
- PIMS integration or write-back of any kind
- Multi-location or multi-tenant support (one clinic = one account)
- Native iOS or Android app (web only)
- Integration with non-Stripe merchant processors (Square, Heartland, WorldPay)
- Client-facing member portal or login (email-only communication)
- Automated service-redemption tracking
- Plan pause, freeze, or tier-switch flows
- Automated renewal reminder emails to pet owners (Stripe receipts are the only client communication beyond welcome packet)
- Custom domain or CNAME for the enrollment page
- Revenue reporting beyond projected ARR (no QuickBooks, no tax, no per-service breakdown)
- Species-specific plan variants (v1 supports dogs and cats; exotics, equine, livestock are out)
- Appointment booking or scheduling

## 7. Success metrics
_Source: synthesized from A + B + C_

**North Star Metric:** Number of clinics with at least one active enrolled pet owner paying a recurring monthly charge. The number stays at zero until the riskiest assumption is defeated — plan published, client enrolled, first charge cleared. A clinic with 50 draft plans and zero enrolled members is a failed deployment.

**HEART leading indicators:**
- **Happiness:** In-app 1-question survey after first enrollment — "How confident are you in your plan pricing?" Target: 70%+ rate 4 or 5 on a 5-point scale across the first 10 clinics. Direct proxy for "trusted the math enough to go live."
- **Engagement:** Percent of registered clinics that complete the plan builder and reach the Publish screen within the first session. Target: 70%+. Drop-off before Publish is the early warning on RAT failure.
- **Adoption:** Percent of signups that publish an enrollment URL within 7 days. Target: 60%+.
- **Retention:** Percent of enrolled pet owners still active at day 60 (i.e., second monthly charge clears without cancellation). Target: 85%+.
- **Task success:** Median time from account creation to published enrollment URL. Target: under 45 minutes.

**Demo-ship gate:** One live clinic has a published enrollment URL on a production environment; one real pet owner (not a test account) has enrolled and been charged a first monthly payment via Stripe; and the owner dashboard reflects the active member with correct plan tier and MRR contribution. All three conditions must be true simultaneously before the demo is called shipped.

## 8. Non-goals
_Source: converged_

- **No PIMS integration.** No read or write connection to Shepherd, Cornerstone, AVImark, Avimark, EzyVet, ImproMed, or any other practice management system. Service redemption is staff-toggled inside PawPlan only.
- **No multi-location or multi-tenant support.** One clinic account, one Stripe Connect Express account, one enrollment URL. A clinic with two locations creates two separate PawPlan accounts.
- **No client-facing portal or pet-owner login.** Clients receive a PDF welcome packet and Stripe receipts by email. They cannot log in to view plan status, remaining services, or billing history.
- **No non-Stripe payment processor integration.** Clinics using Square, Heartland, WorldPay, or other legacy terminal processors must onboard a Stripe Connect Express account to use v1. Integration with existing clinic merchant processors is not supported.
- **No automated service-redemption tracking.** Without PIMS integration, redemption cannot be automated. Manual checkboxes are the v1 answer.
- **No upgrade, downgrade, pause, or tier-switch flows for enrolled members.** A client stays on their plan until the owner cancels. Tier changes are not supported in v1.
- **No automated client communication beyond welcome packet and failed-charge email.** No renewal reminders, no expiring-card notices, no re-engagement sequences, no dunning retry chains.
- **No custom domain or CNAME for the enrollment page.** All enrollment URLs live under `pawplan.app/{clinic-slug}/enroll`.
- **No native iOS or Android app.** Web only (mobile-responsive).
- **No financial reporting beyond the dashboard.** No QuickBooks or accounting integration, no tax reporting, no payout reconciliation, no per-service revenue breakdown, no client lifetime value analysis.
- **No regulatory or compliance tooling.** PawPlan does not provide VCPR documentation, state-specific wellness-plan disclosure language, or legal contract templates. The clinic is responsible for compliance with its state veterinary practice act. PawPlan shows break-even math; it is not a licensed financial advisor.
- **No species-specific plan templates.** V1 supports dogs and cats. Exotics, equine, and livestock are out. The species-mix question informs pricing context but does not generate species-specific variants.
- **No appointment booking, scheduling, or pet-owner-initiated workflows beyond initial enrollment.**
