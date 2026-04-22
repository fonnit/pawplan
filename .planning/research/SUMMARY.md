# Project Research Summary

**Project:** PawPlan — self-serve wellness-plan builder for independent vet clinics
**Domain:** Multi-tenant B2B/B2B2C SaaS — Stripe Connect Express marketplace + recurring subscriptions + branded public enrollment pages
**Researched:** 2026-04-23
**Confidence:** HIGH

## Executive Summary

PawPlan is a textbook Stripe Connect Express marketplace wrapped around a vet-specific pricing wizard. The stack is uncontroversial and well-trodden — **Next.js 16 App Router + React 19 + Prisma 7 + Neon Postgres + Better Auth 1.6 + `stripe@22` + Resend 6 + `@react-pdf/renderer` 4, deployed on Vercel**. Every version was verified via `npm view` on the research date; no bleeding-edge dependencies are required. The four heavy integrations (Connect Express onboarding, hosted Checkout in subscription mode, webhook-driven subscription lifecycle, Resend-attached PDF welcome packet) all have first-party documentation, and the vet-wellness competitive landscape (Kleer, Membersy, Shepherd, Nest, Baxtr, Covetrus) tells a consistent story about what's table-stakes vs. differentiating.

The product's riskiest assumption sits **above** the stack and **inside** one pure function. The MVP-SPEC names owner trust in the break-even math as the single point of failure: if the owner doesn't click Publish, every downstream capability is moot. Architecture research isolates this to a zero-dependency `lib/pricing/breakEven.ts` pure function that runs identically client-side (instant recompute as sliders move) and server-side (canonical at Publish). Features research goes further and demands three items the spec lists as "Should" be **promoted to Must**: (1) break-even math visible live during the builder (not only at review), (2) post-publish pricing edits that don't break existing subscriptions, (3) owner-initiated cancellation with proration — plus failed-payment email to the pet owner. These are non-negotiable for a credible v1.

The biggest execution risks are well-understood Stripe Connect anti-patterns. Pitfalls research flags ten, of which six are critical and phase-bound: incomplete Connect accounts reaching Publish (gate on `charges_enabled && payouts_enabled && !requirements.disabled_reason`), webhook double-processing (idempotency store keyed on `event.id` PK), break-even math subtly wrong (fees hidden, redemption-rate assumptions undocumented, unit confusion), tenancy bleed (Postgres RLS with `SET LOCAL app.current_clinic_id` from migration #1, never "we'll be careful"), slug collision/squatting/reserved-word clash, and PCI scope creep if anyone reaches for Stripe Elements instead of hosted Checkout. Three product decisions should be nailed down before the first executable phase: **application-fee percent** (architecture uses `PLATFORM_FEE_PCT` as a placeholder), **failed-charge policy** (Smart Retries on/off and for how long), and **accent-color UX** (picker vs. preset palette). The rest is execution, and the 8-phase architecture build order maps cleanly onto the 5-phase pitfall prevention model — they agree more than they disagree.

## Key Findings

### Recommended Stack

The stack is the FonnIT default plus the Stripe/Connect-specific pieces, all on pinned versions. Neon Postgres via Prisma's Neon adapter solves the serverless cold-start connection-pool problem for free; Vercel Postgres is retired (auto-migrated to Neon Dec 2024). Better Auth 1.6 replaces NextAuth/Auth.js beta for cleaner Server Components integration. `@react-pdf/renderer` avoids the 50–250 MB Puppeteer bundle — the welcome packet is template-driven, not pixel-perfect HTML conversion. See `STACK.md` for the full table with rationale.

**Core technologies:**
- **Next.js 16.2.4 + React 19.2.5 + TypeScript 6** — App Router Server Actions cover the builder; Route Handlers cover Stripe webhooks; single deploy target on Vercel.
- **Prisma 7.8 + Neon Postgres + `@neondatabase/serverless` 1.1** — type-safe DB, migrations via `prisma migrate deploy`, cold-start-safe on Vercel Functions.
- **Better Auth 1.6.7** — email/password, session cookie, Prisma adapter. One auth dep, no OAuth for MVP.
- **`stripe@22.0.2`** — pins API `2026-03-25.dahlia`; required for Connect Express + Subscriptions + Checkout + webhook verification.
- **Resend 6 + `@react-email/components` + `@react-pdf/renderer` 4.5** — domain-verified sender + React templates + server-side PDF `renderToBuffer`, base64-attached.
- **Tailwind v4 + shadcn/ui + Zod 4 + react-hook-form 7.73** — zero-runtime styling, validation shared client/server.
- **Playwright + Vitest** — one E2E smoke test for the full critical path; exhaustive unit tests on `lib/pricing/breakEven.ts`.

### Expected Features

The MVP-SPEC's "Won't" list correctly rejects PIMS integration, multi-tenant, client portal, non-Stripe processors, pause/switch flows, custom domains, native apps, and species variants — every excluded feature is a competitor's v2, not v1. The "Must" list is tight and correct. Three items need promotion from Should to Must (see Reality-Check in FEATURES.md). See `FEATURES.md` for full competitive matrix.

**Must have (table stakes, matches spec):**
- Stripe Connect Express onboarding — every competitor does this.
- 2–3 tier plan generation, mobile-responsive enrollment page, hosted Stripe Checkout, monthly recurring billing.
- Failed-charge flag + PDF welcome packet + owner notification email.
- Owner dashboard: MRR, plan-tier breakdown, 30-day forecast, per-member rows.
- Manual service-redemption checkbox per service per billing period.
- Clinic profile (name required, logo + accent color optional).

**Must have (promoted from Should — feature research):**
- **Break-even math visible live during builder** — this IS the RAT; hiding until review = the exact calculator-not-sales-tool failure mode.
- **Post-publish pricing edits** — Stripe new-Price-on-same-Product pattern; table stakes the moment a clinic fixes a typo.
- **Owner-initiated cancellation (prorated to period end)** — every owner tests cancel before going live.
- **Failed-payment email to pet owner** — without this, owners chase cards manually, which is the exact pain the product promises to eliminate.

**Differentiators (PawPlan's wedge):**
- **8-question plan builder → tiers in <10 min** vs Nest's 4 weeks, Covetrus's consultant call.
- **Line-by-line break-even with "members to break even" count** — no competitor ships this.
- **Same-session publish → shareable URL** — corporate-chain enrollment URL equivalence with zero consultant hand-off.
- **Zero PIMS lock-in** — serves the 60%+ of US independents not on a cloud PIMS.
- **Self-serve signup, no setup fee, no demo required** — GTM differentiator against every Kleer-shape competitor.

**Defer (v2+):**
- Client self-service portal, plan pause/tier-switch, multi-location, PIMS integration, custom domain/CNAME, species-specific variants, QuickBooks/accounting integration, SMS notifications, annual billing, promo/referral codes, staff sub-accounts with RBAC. Each has an explicit trigger documented in FEATURES.md.

### Architecture Approach

Multi-tenant SaaS with three stacked isolation mechanisms: **route groups** (`(marketing)` / `(auth)` / `(dashboard)` / `[clinicSlug]`), **tenant-aware DB wrapper** (`withClinic(id, fn)` sets `SET LOCAL app.current_clinic_id` per transaction), and **Postgres RLS policies** on every tenant-scoped table (enforced from migration #1, not retrofitted). Stripe Connect uses the **destination-charges pattern, not direct charges** — Customer/Subscription/Invoice live on the platform account with `transfer_data.destination = clinic.stripe_account_id` and `application_fee_percent`. This keeps cross-clinic analytics (dashboard MRR) a single API namespace rather than N calls. See `ARCHITECTURE.md` for component diagrams and data flows.

**Major components:**
1. **Plan Builder Service + Break-Even Calculator** — Server actions mutate `plans` / `plan_tiers`; `lib/pricing/breakEven.ts` is a **pure function** with zero dependencies, identical client/server code path, exhaustively unit-tested. This module is the most valuable test suite in the project.
2. **Tenant Context (`lib/tenant/context.ts`)** — Resolves `clinic_id` from session (dashboard) or URL slug (enrollment), sets Postgres GUC for RLS. Only entrypoint to tenant-scoped data.
3. **Stripe Integration Layer** — Single Connect webhook endpoint (`/api/stripe/webhook`) with `stripe.webhooks.constructEvent` signature verification, `event.id` PK idempotency store, and dispatch table that fans out to one-file-per-event handlers under `lib/stripe/webhook-handlers/`.
4. **Background Job Queue (pg-boss)** — Postgres-backed, no extra infra. Webhooks ACK in <200ms by enqueuing heavy work (PDF render, Resend email). Stripe retries never re-trigger duplicate side effects.
5. **Public Enrollment Page (`[clinicSlug]/enroll/page.tsx`)** — SSR from a read-only view exposing only published plan + branding (never member data). ISR with `revalidateTag('clinic:{slug}')` on publish/edit; Checkout session created on button click, not page load.
6. **Owner Dashboard + Redemption Service** — Metrics, members table, redemption upsert keyed by `(member_id, service_key, billing_period_start)` so counters reset implicitly each billing period with no cron.

### Critical Pitfalls

All ten pitfalls in `PITFALLS.md` have phase assignments. The six critical ones:

1. **Incomplete Connect Express account reaches Publish** — Gate on `charges_enabled && payouts_enabled && !requirements.disabled_reason`, subscribe to `account.updated`, persist capability state on the clinic row. Never trust the onboarding return URL as "done."
2. **Webhook double-processing → duplicate member / email / MRR** — Persist `stripe_events(event_id PK)` with `INSERT ... ON CONFLICT DO NOTHING`; respond 200 in <200ms; enqueue heavy work with the event.id as job idempotency key.
3. **Break-even math subtly wrong** — Stripe fees + PawPlan platform fee must be explicit line items in the display. Redemption-rate assumption (VetSuccess ~70%) must be visible and toggleable. 15-scenario hand-verified unit test file is the acceptance gate for Phase 2.
4. **Tenancy bleed (cross-tenant data exposure)** — Postgres RLS with `FORCE ROW LEVEL SECURITY` on every tenant table from migration #1. App connects as non-owner, non-superuser role. `SET LOCAL` inside transactions only (not `SET` — breaks under PgBouncer). Automated cross-tenant test suite in CI.
5. **Slug collision / squatting / reserved-word clash** — Hard-coded reserved list (`admin`, `api`, `login`, `enroll`, `dashboard`, ...). ASCII-only `[a-z0-9-]+`. Unique index on `LOWER(slug)`. Slug locked at clinic creation; support-only change.
6. **PCI scope creep** — Stripe Checkout (hosted or embedded iframe) exclusively. Codebase grep for `CardElement|PaymentElement` must return 0. Never log raw webhook bodies. SECURITY.md documents SAQ-A posture.

The remaining four (redemption race, enrollment page meltdown under newsletter blast, silent failed-charge accumulation, time-zone/billing-date edges) are addressed in the dashboard/lifecycle phases with specific tests.

## Implications for Roadmap

Architecture research proposes 8 phases; pitfalls research proposes 5. **They agree more than they disagree** — the pitfalls model collapses the architecture's Phases 2/3 and 4/5 to reflect which phases share a single risk surface. The recommended roadmap uses a **6-phase structure** that follows architecture's dependency graph while honoring the pitfalls model's insistence that RLS, slug safety, and break-even unit tests land in Phase 1 before any Stripe call exists.

### Phase 1: Foundations — Auth, Tenancy, Schema, Break-Even Engine
**Rationale:** Nothing downstream works without tenant isolation enforced at the DB layer and a unit-tested break-even engine. Both are cheap on day 1 and expensive to retrofit. No Stripe code in this phase — the break-even + builder UX can be proven end-to-end before any payment plumbing exists.
**Delivers:** Next.js scaffold with route groups; Prisma schema (`User`, `Session`, `Clinic`, `Plan`, `PlanTier`, `Member`, `ServiceRedemption`, `StripeEvent`); Postgres RLS on every tenant table; Better Auth email/password; `withClinic()` connection wrapper; slug generator with reserved-word list; `lib/pricing/breakEven.ts` pure function with 15-scenario unit test file; 8-question builder UI with live client-side recompute; draft plan persistence (no publish yet).
**Addresses features:** account creation, clinic profile, 8-question builder, break-even math visible live, 2–3 tier generation.
**Avoids pitfalls:** #3 (break-even math errors), #4 (tenancy bleed), #5 (slug collision/squatting).

### Phase 2: Stripe Connect Onboarding
**Rationale:** Publishing requires a destination account with verified capabilities. No point building Publish/Checkout before onboarding is demonstrably correct and resumable.
**Delivers:** `POST /api/stripe/connect/onboard` creates Express account + single-use `AccountLink`; refresh route regenerates expired links; webhook endpoint scaffold with signature verification + `stripe_events` idempotency store; `account.updated` handler flips `stripeOnboarded` only when `charges_enabled && payouts_enabled && !requirements.disabled_reason`; dashboard banner renders when `requirements.currently_due.length > 0`.
**Uses stack:** `stripe@22` SDK, single Connect webhook endpoint pattern.
**Implements architecture:** Stripe Integration Layer (onboarding slice), Webhook Event Log.
**Avoids pitfalls:** #1 (incomplete Connect accounts reaching Publish), #2 (webhook idempotency foundation), #7 (PCI posture documented before any card UI).

### Phase 3: Publish + Public Enrollment Page
**Rationale:** Once a clinic can be verified, Publish + shareable URL is the next product-visible milestone. Still no charges — but the enrollment page exists and the owner can share it.
**Delivers:** Publish server action (re-runs `computeTiers` canonically server-side, creates Stripe Products + Prices on the platform account, persists `stripePriceId`, sets `publishedAt`); `[clinicSlug]/enroll/page.tsx` SSR with ISR + `revalidateTag('clinic:{slug}')`; read-only `v_public_clinic_plans` view exposing only published plan + branding; empty-state UI directing owner to share the URL; post-publish pricing edit flow (new Stripe Price on same Product; legacy subscribers retained).
**Implements architecture:** Publish flow, public enrollment routing, static plan display with ISR.
**Avoids pitfalls:** #5 (slug exposure via public enum), #8 (enrollment page meltdown — set cache headers and defer Checkout creation to Phase 4).

### Phase 4: Checkout + Subscription Lifecycle
**Rationale:** This phase closes the MVP loop — a pet owner can enroll and be charged. Demo-ship gate becomes achievable.
**Delivers:** Create Checkout session on button click (not page load) with `mode: 'subscription'`, `transfer_data.destination`, `application_fee_percent`, and idempotency key; `checkout.session.completed` handler creates `Member` row; `invoice.paid` handler flips status to active and caches `currentPeriodStart/End`; `invoice.payment_failed` handler sets `failedCharge` flag + failed-charge count; `customer.subscription.deleted` handler sets status to lapsed/canceled; member state enum (`active | at_risk | canceled | pending_first_payment`), not a boolean; time-zone-correct `next_charge_date` display sourced from Stripe's `current_period_end`.
**Uses stack:** `stripe@22` Checkout + Subscriptions; webhook handlers under `lib/stripe/webhook-handlers/`.
**Avoids pitfalls:** #2 (idempotency on every handler), #8 (lazy Checkout session creation), #9 (explicit failed-charge policy decision — Smart Retries yes/no), #10 (time-zone-correct display).

### Phase 5: Notifications + Welcome Packet
**Rationale:** The loop already works after Phase 4; this is experience polish. Ordering after the lifecycle keeps the critical path short.
**Delivers:** pg-boss queue setup in app Postgres (`pgboss` schema); `@react-pdf/renderer` welcome-packet template with clinic logo + accent color; React Email templates for welcome, owner-new-enrollment, and payment-failed; Resend integration with base64-attached PDFs; jobs `send-welcome-packet`, `notify-owner-new-enrollment`, `send-payment-failed`; webhook handlers enqueue by `event.id`; nightly reconciliation job (list Stripe subs, diff against `Member`, backfill).
**Uses stack:** Resend 6, `@react-email/components`, `@react-pdf/renderer` 4.5, pg-boss.
**Avoids pitfalls:** #2 (async fan-out keeps webhook handler fast), #9 (pet-owner failed-payment email), PCI scope (PDF contains only plan data, never card details).

### Phase 6: Dashboard Metrics + Redemption + Cancellation
**Rationale:** Daily-use features for the owner. Non-blocking for the first enrollment demo but essential for real operational use. Bundles all remaining lifecycle polish.
**Delivers:** MRR / ARR / member-count / 30-day-forecast queries sourced from Stripe `current_period_end` not `+30 days`; per-member row with redemption toggles (upsert keyed by `(member_id, service_key, billing_period_start)` + `version` column for optimistic locking); red flag on members with `failedCharge`; owner-initiated cancellation (Stripe `subscription.update({ cancel_at_period_end: true })`) with confirmation email; dashboard empty-state UI showing shareable URL + copy-link + QR code; MRR breakdown display (gross / − Stripe fees / − platform fee / = net to clinic).
**Uses stack:** shadcn/ui Table, date-fns for renewal forecast math, Playwright E2E for the full critical path.
**Avoids pitfalls:** #6 (redemption race — optimistic locking), #9 (visible clinic-facing failed-charge state machine), #10 (forecast query uses Stripe's `current_period_end`, not client-side date math).

### Phase Ordering Rationale

- **RLS + break-even unit tests in Phase 1, before any Stripe code.** Both are cheap on day 1, expensive to retrofit. RLS prevents the highest-severity bug class (tenancy bleed); break-even tests prevent the RAT failure mode.
- **Connect onboarding before Publish.** A clinic can't Publish until its destination account is verified — there's no useful intermediate state.
- **Publish + public page before Checkout.** The enrollment page is independently demoable (owner shares URL internally) and lets us load-test the public surface before adding Stripe session creation.
- **Lifecycle webhooks before notifications.** Async fan-out via pg-boss is strictly easier to add to a working synchronous loop than to orchestrate alongside the first Stripe integration.
- **Dashboard metrics + redemption last.** Owner daily-use features, not demo-ship blockers. Bundling them keeps earlier phases focused on the critical path.

### Research Flags

Phases likely needing deeper research during planning:

- **Phase 2 (Stripe Connect onboarding):** `/gsd-research-phase` recommended. Connect Express capability gating + AccountLink resumability + `account.updated` event semantics are the single most common integration footgun in this domain (Pitfall #1). Worth a focused dive on the exact state machine and error-recovery UX.
- **Phase 4 (Checkout + subscription lifecycle):** `/gsd-research-phase` recommended. Destination charges vs. direct charges, `application_fee_percent` vs. platform-side fee ledger, Smart Retries on/off decision, and time-zone + end-of-month billing-anchor edge cases (Pitfall #10) deserve a careful read of current Stripe docs before coding. The three product decisions (fee percent, retry policy, cancel-vs-past-due display) should be locked in this research pass.
- **Phase 5 (PDF + email pipeline):** Light research flag. `@react-pdf/renderer` + Resend + pg-boss are well-documented individually but the composition (base64 attachment, worker dedup via `event.id`, warm-domain requirement) has enough moving parts to warrant a short integration-pattern read.

Phases with standard patterns (skip research-phase):

- **Phase 1 (foundations):** Stack choices are fully documented in STACK.md; Postgres RLS pattern is well-understood; break-even math is domain logic, not framework research. Proceed directly.
- **Phase 3 (publish + public page):** Next.js ISR + route groups + `revalidateTag` are first-party Next.js patterns with good docs. Proceed directly.
- **Phase 6 (dashboard + redemption):** Optimistic locking, shadcn/ui tables, and cancellation via `cancel_at_period_end` are standard. Proceed directly.

### Product Decisions to Lock Before Execution

Three product decisions are architecture-affecting and should be made before Phase 2 work begins:

1. **Platform application-fee percent** — Architecture uses `PLATFORM_FEE_PCT` as a placeholder. The break-even math display explicitly subtracts this as a line item; the owner's "clinic gross" number depends on it. Needs a number before Phase 1's unit tests are written.
2. **Failed-charge policy** — Stripe Smart Retries on or off? If on, the 4-attempt / ~21-day default schedule must be documented in the dashboard UI. If off, PawPlan owns every retry decision. Affects Phase 4 webhook handler design and Phase 6 member state enum.
3. **Accent color UX** — Preset palette (5–6 choices) vs full color picker. Preset is simpler and keeps enrollment pages on-brand-looking even for less-design-savvy owners; picker is more flexible. Affects Phase 1 clinic profile schema and Phase 5 PDF template rendering.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | All versions verified via `npm view` on research date; all major libraries cross-referenced against official docs; no bleeding-edge deps. |
| Features | HIGH | Competitor feature sets well-documented (Kleer, Membersy, Shepherd, Nest, Baxtr, Covetrus); vet-domain failure modes sourced from dvm360 and Rethink Veterinary case studies. Slight reduction on exact 2026 roadmaps for Shepherd/Snout — doesn't affect v1 decisions. |
| Architecture | HIGH | Stripe Connect destination-charges pattern + Postgres RLS + async webhook fan-out are industry-standard patterns with first-party documentation (Stripe, AWS, Next.js, Crunchy Data). No unusual decisions. |
| Pitfalls | HIGH | Stripe/RLS/Next.js pitfalls sourced from official docs; vet-domain pitfalls from dvm360 + VetSuccess secondary references (MEDIUM on domain-specific items, HIGH on the technical ten). |

**Overall confidence:** HIGH

### Gaps to Address

- **Application-fee percent is unknown.** MVP-SPEC calls for a platform fee but doesn't set it. Architecture and break-even math both depend on this number. **Handling:** lock before Phase 1 unit-test authoring; add to `.env` as `PLATFORM_FEE_PCT`.
- **Failed-charge policy (Smart Retries on/off) is unspecified.** MVP-SPEC's "no dunning" + "failed-payment email" combination is ambiguous with Stripe defaults. **Handling:** product decision during Phase 4 research; document explicitly in both dashboard UI and SECURITY.md.
- **Accent-color input UX (picker vs preset) is unspecified.** **Handling:** default to 6-preset palette to reduce decision fatigue; revisit if 3+ clinics request full picker.
- **Redemption-rate assumption for break-even display.** VetSuccess reports ~70% redemption on bundled services. Needs to be a visible, toggleable assumption, not hidden. **Handling:** Phase 1 break-even UI surfaces this with a slider defaulting to 70%.
- **Slug ownership disputes.** Pitfall research flags squatting risk (ex-staff registering clinic name first). **Handling:** Phase 2 Connect onboarding cross-checks legal name vs. registered clinic; support-action override for disputes documented in `docs/SUPPORT.md`.

## Sources

### Primary (HIGH confidence)

- `npm view <pkg> version` on 2026-04-23 — all stack version numbers.
- [Next.js 16 docs](https://nextjs.org/docs) — App Router, Server Actions, Route Handlers, ISR.
- [Stripe Connect Express](https://docs.stripe.com/connect/express-accounts) — onboarding flow, AccountLink semantics, capability gating.
- [Stripe destination charges](https://docs.stripe.com/connect/destination-charges) — `transfer_data.destination`, `application_fee_percent`.
- [Stripe Connect webhooks](https://docs.stripe.com/connect/webhooks) — single endpoint for platform + connected events; `event.account` field.
- [Stripe webhooks — idempotency + signature verification](https://docs.stripe.com/webhooks) — `stripe.webhooks.constructEvent`, at-least-once delivery, `event.id` as idempotency key.
- [Stripe subscription billing cycle](https://docs.stripe.com/billing/subscriptions/billing-cycle) — end-of-month anchor semantics (Jan 31 → Feb 28).
- [Stripe Smart Retries](https://docs.stripe.com/billing/revenue-recovery/smart-retries) — default 4-attempt / ~21-day schedule.
- [Prisma docs](https://www.prisma.io/docs) + [Neon + Vercel integration](https://neon.com/docs/guides/vercel) — Neon serverless adapter, Vercel Marketplace DB injection.
- [Better Auth docs](https://www.better-auth.com/docs) — v1.6 stable, Prisma adapter.
- [Resend](https://resend.com/docs) + [React Email](https://react.email/docs) — transactional email + React templates + PDF attachments.
- [@react-pdf/renderer docs](https://react-pdf.org/) — server-side `renderToBuffer`, no headless Chrome.
- [Multi-tenant RLS on Postgres — AWS](https://aws.amazon.com/blogs/database/multi-tenant-data-isolation-with-postgresql-row-level-security/) + [Crunchy Data](https://www.crunchydata.com/blog/row-level-security-for-tenants-in-postgres) + [Nile](https://www.thenile.dev/blog/multi-tenant-rls) — `FORCE ROW LEVEL SECURITY`, `SET LOCAL`, non-owner role pattern.
- [Next.js multi-tenant guide](https://nextjs.org/docs/app/guides/multi-tenant) — route groups + middleware auth.

### Secondary (MEDIUM confidence)

- [Kleer](https://www.kleer.com/dentists), [Membersy](https://membersy.com/dental-professionals/membersy-connect/), [Shepherd Veterinary](https://www.shepherd.vet/blog/pet-insurance-wellness-plans-built-into-your-practice-software/), [Nest Veterinary](https://www.nestveterinary.com/solutions/care-plans), [Baxtr](https://www.getbaxtr.com/pet-wellness-plans), [Covetrus CarePlans](https://covetrus.com/covetrus-platform/client-engagement-tools/covetrus-careplans/) — competitor feature sets and pricing/onboarding models.
- [Rethink Veterinary Solutions — Why Wellness Plans Fail](https://rethinkveterinarysolutions.com/discounts-vs-rewards-the-math-doesnt-lie/why-wellness-plans-have-failed-for-many-independently-owned-veterinary-practices-case-studies-and-insights) — source of the RAT failure mode in MVP-SPEC §4.
- [8 Mistakes to Avoid in Veterinary Wellness Plans (dvm360)](https://www.dvm360.com/view/8-mistakes-avoid-your-veterinary-wellness-plans) — domain-specific pitfalls.
- [Stripe webhook best practices — Stigg](https://www.stigg.io/blog-posts/best-practices-i-wish-we-knew-when-integrating-stripe-webhooks), [Hookdeck](https://hookdeck.com/webhooks/platforms/guide-to-stripe-webhooks-features-and-best-practices) — community patterns on idempotency + async fan-out.
- [Stripe default retries aren't enough — Rebounce](https://www.rebounce.dev/blog/stripe-default-retries), [Churnkey on Smart Retries](https://churnkey.co/blog/stripe-smart-retries/) — failed-charge policy framing.

### Tertiary (LOW confidence)

- VetSuccess "~70% bundled-service redemption" figure — cited secondhand; should be validated with direct VetSuccess data before the break-even UI ships with 70% as a default.
- 2026 competitor roadmaps (Shepherd/Snout/Clerri) — inferred from press releases and blog posts; exact feature-release timing not load-bearing for v1.

---
*Research completed: 2026-04-23*
*Ready for roadmap: yes*
