# Pitfalls Research

**Domain:** Multi-tenant SaaS — Stripe Connect Express platform with recurring subscriptions and public enrollment pages (vet wellness plans)
**Researched:** 2026-04-23
**Confidence:** HIGH (Stripe/RLS/Next.js sourced from official docs; vet-domain pitfalls sourced from dvm360 + VetSuccess data)

> For PawPlan, the riskiest assumption is **break-even trust**. But the pitfalls below are the ones that turn a published page into a silent failure after publish. A calculator that nobody trusts is one failure mode; a published plan that double-bills, under-bills, or leaks a competitor's member list is a worse one.

---

## Critical Pitfalls

### Pitfall 1: "Published" clinic has incomplete Stripe Connect Express account

**What goes wrong:**
Clinic clicks "Connect Stripe" during onboarding, gets redirected to Stripe-hosted onboarding, abandons at the bank-account or SSN-verification step, returns to PawPlan, and the app treats the account as "connected" because an `acct_…` ID was created. The owner publishes, a pet owner enrolls, Stripe Checkout either fails outright (no destination) or accepts the charge but funds are trapped in a pending state because `payouts_enabled=false` or `charges_enabled=false`. Clinic discovers the problem weeks later when no payout arrives.

**Why it happens:**
Developers assume "account created" = "account usable." Stripe Connect Express has three orthogonal capability flags — `details_submitted`, `charges_enabled`, `payouts_enabled` — plus a `requirements` object (`currently_due`, `eventually_due`, `past_due`, `disabled_reason`). Many integrations only check `details_submitted`, which flips to `true` before KYC completes.

**How to avoid:**
- Before allowing publish, gate on **all three**: `charges_enabled === true` AND `payouts_enabled === true` AND `requirements.disabled_reason === null`.
- Subscribe to the `account.updated` webhook and persist the capability state on the clinic row every time it changes.
- On every dashboard load, render a banner when `requirements.currently_due.length > 0` with a one-click link back to `AccountLink` to resume onboarding (fresh `AccountLink` per click — they're single-use and expire in 5 min).
- Treat the Connect onboarding as **resumable**: store a `stripe_onboarding_state` enum (`not_started | in_progress | action_required | complete | restricted`) and render the publish button disabled with the reason when not `complete`.

**Warning signs:**
- Clinics with `details_submitted=true` but `charges_enabled=false` sitting for >24h.
- `account.updated` events with non-empty `requirements.past_due`.
- Stripe Dashboard shows "Restricted" on a clinic that appears "connected" in PawPlan.
- First enrollment fails with `account_invalid` or `insufficient_capabilities_for_transfer`.

**Phase to address:** Phase 2 (Stripe Connect onboarding + gating). Verification test: create a test Connect account, abandon at bank-account step, confirm publish is blocked with a clear CTA.

---

### Pitfall 2: Webhook processed twice → duplicate member, duplicate welcome email, duplicate MRR

**What goes wrong:**
Stripe delivers `checkout.session.completed` or `invoice.paid`, PawPlan processes it, but the 200 response is slow (or times out) so Stripe retries. The second delivery creates a second member record, sends a second welcome packet PDF, inflates MRR in the dashboard, and the clinic owner emails support. Or worse: the member is created the first time but the clinic's "new enrollment" email fires twice, and they think they got two new members.

**Why it happens:**
Stripe guarantees **at-least-once** delivery, not exactly-once. Every webhook handler must be idempotent. The canonical mistake is to let `POST /webhook` do work inline (PDF generation, email, DB writes) without first checking whether `event.id` has already been processed.

**How to avoid:**
- Persist `stripe_events(event_id TEXT PRIMARY KEY, type, received_at, processed_at)`. On every webhook, `INSERT ... ON CONFLICT (event_id) DO NOTHING RETURNING *`. If no row returned, it's a duplicate — respond 200 and stop.
- Use `upsert` semantics for entity creation: member keyed by `(clinic_id, stripe_subscription_id)` with a unique constraint; the second delivery updates a timestamp instead of inserting.
- Respond 200 fast (< 1s). Enqueue heavy work (PDF, email) to a background job keyed by `event.id` — the queue itself must dedupe.
- Verify signature with `stripe.webhooks.constructEvent` on every request before any processing. Do not trust the payload without signature verification.
- Plan for the reverse case too: webhook never arrives. Run a nightly reconciliation job that lists Stripe subscriptions for each connected account and compares to the local member table. Missing members? Backfill.

**Warning signs:**
- Two welcome emails with identical timestamps (to the minute) for one enrollment.
- `stripe_events.processed_at` null on rows older than 5 minutes (failed processing).
- MRR in dashboard > sum of Stripe-reported subscription totals.
- Duplicate row constraint violations in production logs.

**Phase to address:** Phase 3 (Stripe webhook handlers + subscriptions). Verification test: use Stripe CLI to replay the same `checkout.session.completed` event 5 times; assert exactly one member row and exactly one welcome email.

---

### Pitfall 3: Break-even math is subtly wrong — and owner catches it after publishing

**What goes wrong:**
The 8-question builder produces numbers that look right but fail in one of these ways:
1. **Unit confusion:** "Monthly fee × 12 = annual value" ignores that the member's annual exam is bundled once, not monthly. Retail value is annual; monthly fee is monthly; the owner sees "break-even at 4 members" when real break-even is 48.
2. **Discount applied wrong:** Member discount (0–20%) is applied to total retail value before break-even calc, or after — the same 15% discount produces different "clinic gross per enrolled pet per year" depending on which side it lands on.
3. **Stripe fees ignored:** The spec doesn't say where Stripe's 2.9% + 30¢ per charge lives. If "clinic gross" doesn't subtract it, the break-even is over-optimistic by ~3%. Over 12 monthly charges that's ~5% of revenue.
4. **Platform fee ignored:** PawPlan takes a platform fee (per spec). Is it in "clinic gross" or out? If the math shows "clinic gross" pre-platform-fee, the owner's real margin is lower than displayed.
5. **Per-pet vs per-member:** The spec says "clinic gross per enrolled pet per year." A household with two dogs = two enrollments. If the dashboard MRR or break-even elsewhere treats the household as one unit, numbers diverge.
6. **Tax:** Some states tax pet wellness plans as services; PawPlan doesn't handle tax in v1. If break-even shows pre-tax revenue and the clinic is remitting tax, real gross is lower.
7. **Breakage assumption:** Industry data (VetSuccess) says ~70% of bundled services are actually redeemed. If break-even assumes 100% redemption, margin is overstated; if it assumes 70% but doesn't disclose the assumption, owner feels misled when they do the math on paper.

**Why it happens:**
Math is easy to write and hard to verify. Every input (annual exam price, vaccine cadence, discount percent) has an implicit unit; the formula silently assumes a convention. Without a test suite that runs end-to-end scenarios with known-correct answers, nobody catches unit drift.

**How to avoid:**
- Write a pure `calculateBreakEven()` function with **zero** side effects and a **test file** containing at least 15 hand-verified scenarios (small clinic, large clinic, 0% discount, 20% discount, single species, multi-tier, etc.). Every scenario documents its expected output in a comment above the input.
- Display every line item with its unit explicitly: "Annual exam: $75 (billed once per year, included in plan)" not just "$75".
- Make Stripe fees **and** PawPlan platform fee explicit line items in the break-even display, not hidden. The owner must see "Stripe fee: −$0.90 per monthly charge" and "PawPlan fee: −$X per charge" as separate lines.
- Show the **breakage assumption** on screen: "Calculated assuming 70% service redemption (industry average). Toggle to 100% for worst case." This turns a hidden assumption into a visible, defensible one.
- Include a "print summary" button that produces a one-page PDF the owner can hand to their accountant. This is a direct counter to the "paused for three weeks" RAT failure mode.
- Add a dashboard reconciliation view after first enrollment: "Projected monthly: $X. Actual Stripe deposits this month: $Y." A gap > 5% triggers a flag.

**Warning signs:**
- Owner asks support "why is my deposit lower than the dashboard MRR?"
- Break-even numbers that look too good (e.g., "break-even at 3 members" for a plan with $400 of retail value at $49/mo).
- Clinics publishing with 0% discount (owner didn't trust the number enough to offer any discount).
- Gap between "Projected ARR" and "Stripe lifetime deposit total" diverges by >10% after 60 days.

**Phase to address:** Phase 1 (plan builder + break-even engine). Verification test: 15-scenario unit test file, must pass. Add one E2E test where the calculated break-even for a known input is checked against a hand-computed number.

---

### Pitfall 4: Tenancy bleed — Clinic A's dashboard shows Clinic B's members

**What goes wrong:**
Every multi-tenant SaaS risk: a missing `WHERE clinic_id = $1` filter on one query, a cached dashboard fragment rendered with the wrong clinic ID, a signed URL that accidentally exposes another clinic's member export, or — most commonly — an admin/support path that bypasses tenant scoping "just for this debug query" and ships to production. One leak is enough to kill B2B trust permanently.

**Why it happens:**
- Tenant filtering is enforced at the application layer by convention (`db.members.findMany({ where: { clinicId } })`), and one forgotten filter in a rarely-used query slips through code review.
- Connection pooling + per-request `SET app.current_tenant_id` contaminates across requests if `DISCARD ALL` isn't run on checkout.
- Table owner role runs migrations AND app queries — Postgres RLS is bypassed by the owner unless `FORCE ROW LEVEL SECURITY` is set.
- Stripe Checkout success URLs contain `session_id` and land on a PawPlan page that fetches "the current enrollment" — if the session isn't bound to a clinic in the URL path, wrong-clinic attribution is possible.

**How to avoid:**
- **Defense in depth.** Application-layer filter + Postgres RLS + a deny-by-default connection pooling config.
- Every tenant-scoped table has `clinic_id UUID NOT NULL REFERENCES clinics(id)` and a Postgres RLS policy: `USING (clinic_id = current_setting('app.current_clinic_id')::uuid)`.
- `ALTER TABLE members FORCE ROW LEVEL SECURITY;` on every tenant table.
- App connects as a role that is **not** the table owner and does **not** have `BYPASSRLS` or `SUPERUSER`.
- Middleware runs `SET LOCAL app.current_clinic_id = '…'` at the start of every authenticated request inside a transaction. `LOCAL` scopes to the transaction, eliminating pool contamination.
- Write an automated test: create two clinics with one member each; log in as clinic A; attempt to fetch `members?clinic_id=<B's id>` via every API route; assert 404 or empty result on every one.
- Never use the Postgres superuser or table owner for app queries, even in dev.
- Public enrollment pages (`/{slug}/enroll`) read from a dedicated read-only view that only exposes the clinic's published plan and branding — never the member list.

**Warning signs:**
- A query in the codebase on a tenant-scoped table without a `clinic_id` filter.
- Support ticket: "I see a pet named Rex and I don't have a client named Rex."
- Admin/debug endpoints that accept a `clinic_id` query param.
- `BYPASSRLS` shows up in `\du` output.

**Phase to address:** Phase 1 (auth + tenancy foundation) — **before** any clinic-scoped data model. Verification test: automated cross-tenant access test suite in CI; RLS smoke test in migration CI; explicit security review at the end of Phase 1.

---

### Pitfall 5: Enrollment URL slug collision, squatting, or reserved-word clash

**What goes wrong:**
Clinic "Hillside Animal Hospital" picks slug `hillside`. Second clinic with the same name signs up, is told "slug taken," gets a confusing `hillside-2` fallback, shares the link in a newsletter, but clients typed `hillside` and land on a different clinic's page. Or worse: a competitor registers a look-alike slug (`hi1lside`, `hiIlside`) and intercepts enrollments. Or a clinic picks `admin`, `api`, `login`, `enroll`, `dashboard` and shadows a real app route.

**Why it happens:**
Slug generation is a five-line function until it isn't. Real dangers:
- No reserved-word list → clinic's slug overrides an app route (`/admin`, `/api`, `/_next`).
- Case sensitivity → `/hillside/enroll` and `/Hillside/enroll` resolve to different pages or the same page ambiguously.
- Unicode homoglyphs (`/hillside` vs `/hіllside` with Cyrillic `і`) → trivial phishing.
- No anti-squatting → an ex-staff member registers the clinic's name before the clinic does.
- No profanity filter → clinic with an unfortunate acronym gets an auto-generated slug that is a slur.
- No collision-retry budget → two clinics racing on the same slug produce a database-constraint-violation 500.

**How to avoid:**
- Reserve a hard-coded list: `admin api app auth dashboard enroll login signup settings stripe webhooks _next static public about pricing terms privacy support help docs blog` and every HTTP verb. Reject registration against this list with a clear error.
- Lowercase-only slugs. Normalize on write: `slug.toLowerCase().trim()`. Unique index on `LOWER(slug)` in Postgres.
- ASCII-only (`[a-z0-9-]+`) to eliminate homoglyph attacks. If a clinic's name is non-ASCII, slugify with a transliteration library and let them edit.
- Min length 3, max 40. No consecutive hyphens. No leading/trailing hyphens.
- Slug is locked at clinic creation; changing it requires support action (preserves old URL as a 301 redirect). Prevents a clinic from swapping slugs out from under a newsletter they already sent.
- Run a basic profanity filter (e.g., `bad-words` or equivalent) on submitted slugs and auto-generated fallbacks.
- Ownership claim: during Stripe Connect onboarding, the clinic's legal name must match the slug's registered clinic on first publish. Prevents squatting-then-claiming.
- 404 (not 500) on unknown slugs. Cached 404 at the CDN.

**Warning signs:**
- Next.js routing error because a slug shadows a route.
- Clinic owner reports "I typed the URL and got someone else's plan."
- Support ticket: "Someone took our name."
- Multiple `-2`, `-3` slug suffixes in production.

**Phase to address:** Phase 1 (slug generation + routing) alongside tenancy. Verification test: reserved-word list tested against actual app routes; unit test for slug normalization; E2E test that publishing with a reserved slug fails.

---

### Pitfall 6: Service-redemption race — two staff toggle the same checkbox simultaneously

**What goes wrong:**
Front desk marks "dental cleaning redeemed" on a member at 10:14:32. Same moment, the tech in back also opens the member record and toggles the same checkbox (maybe because the front-desk click didn't refresh their tab). Last-write-wins means one of the toggles silently overwrites the other. Result: either a redemption the client actually used gets un-marked (and may be used again free), or a redemption that didn't happen gets double-marked. At scale (10+ members per day redeeming), this is a few clinical-workflow trust hits per week.

**Why it happens:**
A checkbox toggle looks like a trivial `UPDATE services_redeemed SET state = $1 WHERE id = $2`. Without versioning, concurrent writes clobber each other. Standard Postgres `READ COMMITTED` isolation doesn't prevent lost updates on this pattern — both transactions see the same "before" state and both write.

**How to avoid:**
- Add `version INTEGER NOT NULL DEFAULT 0` on `member_service_redemptions`. UPDATE becomes `UPDATE … SET state = $1, version = version + 1 WHERE id = $2 AND version = $3`. Zero rows updated → conflict → reload + retry or show the user a "this was just updated" banner.
- Or use an append-only log: `redemption_events(id, member_id, service_id, cycle_id, toggled_by, toggled_at, to_state)`. Current state = latest event. Multi-staff toggles become an ordered history (even better for audit — "who marked this redeemed?").
- Realtime or poll-based refresh of the member row every 30s in the dashboard so two staff don't stare at stale views.
- Scope uniqueness: one redemption row per `(member_id, service_id, billing_cycle_id)`. Unique constraint prevents duplicate inserts if the UI ever calls "create" instead of "toggle."

**Warning signs:**
- Client reports "I was charged for a second exam and I already had one this cycle."
- Audit complaint "who marked this redeemed?" with no answer.
- Two staff see the same member row with different redemption states at the same time.

**Phase to address:** Phase 4 (dashboard + service redemption). Verification test: hit the toggle endpoint with 2 concurrent requests for the same (member, service, cycle); exactly one wins with state changed, the other returns a 409 Conflict.

---

### Pitfall 7: PCI scope creep — card data touches PawPlan servers

**What goes wrong:**
Stripe Checkout (redirect or hosted, not custom) keeps the merchant at SAQ-A: lowest PCI compliance burden. The trap: a developer adds a "collect card here and save for later" flow using Stripe Elements inside PawPlan's page, or logs the Checkout webhook payload (which contains a last-four but could be expanded), or iframes the wrong Stripe component, or proxies the Checkout response through PawPlan's server in a way that routes card-bearing traffic through the app. Any of these bumps PawPlan to SAQ-A-EP or higher, triggers mandatory quarterly ASV scans, and expands the attack surface.

**Why it happens:**
"Let's just collect the card on our page for a better UX" sounds reasonable. Stripe's own docs offer both paths (Checkout and Elements). Elements is not wrong — but it puts the merchant in a higher PCI bucket. For a v1 where PCI burden minimization is a stated goal, only Stripe-hosted or fully embedded (iframe) Checkout keeps SAQ-A.

**How to avoid:**
- **Use Stripe Checkout (hosted or embedded iframe) exclusively.** No Stripe Elements, no custom card collection, no Payment Element in the v1.
- Confirm the enrollment page loads Checkout via `redirectToCheckout` or the embedded Checkout iframe — not via a form that POSTs card data to PawPlan's server.
- Never log Stripe webhook raw bodies in production. Structured-log only the event type, `event.id`, and a hash — never the `payment_method` object.
- Document the PCI posture in `SECURITY.md`: "PawPlan uses Stripe Checkout exclusively. Cardholder data never touches PawPlan servers. SAQ-A applies."
- ASV scanning: per PCI DSS v4 (2024-onward), even SAQ-A merchants need quarterly external ASV scans. Schedule this as an ops task at v1 launch.
- Content Security Policy headers on the enrollment page: restrict to Stripe domains (`*.stripe.com`, `*.stripe.network`) plus PawPlan origin. Prevents script-injection attacks from broadening scope.

**Warning signs:**
- Any `card[number]` or `cvc` or `pan` string showing up in PawPlan's codebase, logs, or Sentry breadcrumbs.
- A pull request adding `@stripe/react-stripe-js` with `PaymentElement` or `CardElement` imports.
- Webhook logs containing full `object` payloads instead of filtered fields.
- An enrollment page POST that includes payment data going to a PawPlan route.

**Phase to address:** Phase 2 (Stripe integration) — set the rails early. Verification test: a codebase grep for `CardElement|PaymentElement|card[number|cvc` must return zero matches; SECURITY.md must state SAQ-A posture.

---

### Pitfall 8: Public enrollment page melts under a newsletter blast

**What goes wrong:**
Clinic sends a newsletter to 8,000 clients on a Tuesday at 10am. 500 people open it in the first 10 minutes, hit `pawplan.app/hillside/enroll`. If every request SSRs the page (database fetch for plan + branding + Stripe Checkout session creation), the origin melts: Postgres connection pool saturated, Stripe API rate-limited, Checkout session creation fails intermittently, and the clinic watches real-time enrollment conversion crater. Clinic owner blames PawPlan on a Facebook group — the exact audience you're trying to reach.

**Why it happens:**
Defaulting to SSR-per-request for public pages. Each enrollment page render = 1 DB round-trip for plan + 1 for branding + 1 Stripe API call for Checkout session. Even at 50ms each, a 5-second p99 in a burst is plausible.

**How to avoid:**
- **Static plan display.** The tier comparison view reads published plan data via Next.js ISR or on-demand revalidation. `revalidate: 300` + on-demand invalidation via `revalidateTag('clinic:{slug}')` when owner edits. Render from cache on the CDN; zero origin hits for the plan view.
- **Lazy Checkout session creation.** Don't create the Stripe Checkout session on page load. Create it on button click ("Enroll in this tier") via a server action. This pushes the Stripe API call from 500 per burst to ~50 (only actual click-through).
- Cache-Control headers for the public page: `public, max-age=60, s-maxage=300, stale-while-revalidate=600`. CDN absorbs the load.
- Move Checkout session creation to an idempotency-keyed endpoint with `idempotency_key = <slug>:<tier>:<email>:<timestamp-bucket>` so a double-click doesn't create two sessions.
- Database connection pool sized with a safety factor. On Vercel/serverless, use a pooler (PgBouncer/Supavisor) in transaction mode — serverless functions without a pooler will exhaust Postgres connections at 100 QPS.
- Rate-limit Checkout session creation per IP (simple token bucket, Redis or Upstash).
- Client-side: skeleton UI during session creation so the user doesn't rage-click.

**Warning signs:**
- Origin p95 latency > 1s on the enrollment page.
- Postgres "remaining connection slots are reserved" errors.
- Stripe 429 responses in logs.
- Conversion rate from page-view to Checkout drops during high-traffic windows.

**Phase to address:** Phase 2 or Phase 3 (enrollment page + Stripe Checkout). Load test with k6 or Artillery before demo-ship: 500 req/s for 60s against `/<slug>/enroll`, p95 < 500ms.

---

### Pitfall 9: Failed charge silently accumulates — owner has no idea until revenue gaps show

**What goes wrong:**
Stripe's **default** behavior on a failed subscription charge is to run Smart Retries (up to 4 attempts over ~21 days) and then either cancel or mark the subscription `unpaid` — **and send no email to the customer unless you explicitly enable customer emails in Stripe Dashboard settings**. With the spec's "dunning disabled in v1" decision, the default flow produces: pet owner's card fails → 4 silent retries → subscription cancels after 21-30 days → no email to anyone unless PawPlan wires it → clinic sees one new "cancelled" flag in the dashboard and doesn't know why → thinks the client left voluntarily.

**Why it happens:**
"Dunning disabled" is interpreted by developers as "do nothing on failed payment," but Stripe's default *still does something* (retries then cancels). And the spec does call for a "failed-payment email to pet owner (Stripe webhook triggered)" — so one email is in scope. The pitfall is the mismatch: default Stripe behavior produces partial automation, the spec layers one custom email on top, and without clear orchestration the net behavior is inconsistent.

**How to avoid:**
- **Decide explicitly.** In Phase 3 planning, write down: "On charge failure, Stripe Smart Retries attempts N times over D days with schedule S; PawPlan sends a custom email to the pet owner on the first `invoice.payment_failed` event and on the final `customer.subscription.updated` to `past_due` or `unpaid`; clinic owner sees a `failed_charge_at` timestamp and a `failed_charge_count` on the member row; after X days in `past_due`, the member gets a visible red flag in the dashboard." No hand-waving.
- Listen to `invoice.payment_failed`, `customer.subscription.updated` (watch for `status: past_due | unpaid | canceled`), and `invoice.payment_action_required`.
- On member record display `Active | At risk (1 failed charge) | At risk (3 failed charges) | Cancelled (unpaid)` — not a single boolean flag.
- Dashboard widget: "N members with failed charges this week" above the fold so the owner notices.
- Don't rely on Stripe's customer-email toggle alone — it's off by default per account, and clinics won't know to enable it on their Connect dashboard. Own the email from PawPlan.
- Disable Stripe Smart Retries OR accept the 4-attempt schedule and document it — don't leave it ambiguous.

**Warning signs:**
- A member row with no "failed charge" flag but a canceled Stripe subscription.
- Revenue dip in dashboard MRR but clinic doesn't notice because no alert.
- Stripe Dashboard shows "unpaid" subscriptions that don't appear as "at risk" in PawPlan.
- Clinic asks "why did Mrs. Smith leave?" — and Mrs. Smith's card just expired.

**Phase to address:** Phase 3 (subscription webhooks + failed charge handling). Verification test: simulate a failed charge via Stripe test clock; assert email sent to pet owner, flag set on member, dashboard count increments.

---

### Pitfall 10: Time-zone + billing-date edge cases produce wrong-day charges

**What goes wrong:**
Clinic in Pacific time signs up a member on March 31 at 10pm PT. Stripe creates the subscription with `billing_cycle_anchor = 2026-04-01 05:00 UTC`. PawPlan's dashboard computes "next charge date" in the server's UTC and displays "April 1" — but the clinic owner reading at 9am PT is looking at a local calendar and the charge already ran at 10pm PT March 31. For a member enrolled on January 31, Stripe renews on the *closest available last day* of each month — February 28 (or 29 leap), March 31, April 30, May 31 — so the "renewal date" visible in the dashboard shifts between 28 and 31 across months, and the clinic's MRR forecast must account for this. Members enrolled on the 29th, 30th, 31st all telescope to month-end; members enrolled on the 28th don't. Miscounted "renewals this month" in the 30-day forecast is a direct trust hit on a dashboard where break-even math already lives under scrutiny.

**Why it happens:**
- Timezone: displaying UTC timestamps to a user in a different local TZ without conversion.
- End-of-month: Stripe's documented behavior for anchor dates on Jan 31 is to bill the "last day of the month closest to the anchor" in shorter months — so February bills Feb 28, not March 3. Forecasts that add 30 days mechanically will be wrong.
- Trial or backdate: if PawPlan ever offers a trial or backdates a subscription, `billing_cycle_anchor` can produce a prorated invoice that the dashboard MRR calculation doesn't know about.
- Daylight-saving: US DST shifts on March 8 and November 1 (2026) — a subscription created right before DST can shift display-time by an hour.

**How to avoid:**
- Store all timestamps as UTC in Postgres (`timestamptz`). Display them in the clinic's timezone, configured on the clinic profile (default: browser-detected TZ at signup, confirmed by owner).
- Use Stripe's reported `current_period_end` from the subscription object as the source of truth for "next charge date" — don't compute "+30 days" client-side.
- For the 30-day renewal forecast: query Stripe subscriptions with `current_period_end` in the next 30 days. Don't simulate.
- Display renewal dates as "Next charge: April 30 (subscription anchors to end of month for members who enrolled on the 31st)" — explain the month-end anchoring rule in a tooltip the first time a member's renewal date shifts.
- Test the calendar edge cases: sub created Jan 31, assert Feb 28 renewal; sub created Feb 28 (non-leap), assert Mar 28 renewal (not Mar 31 — this is a common misconception); sub created on DST transition day.
- Monthly reconciliation: compare "renewals this month (actual Stripe charges)" vs "renewals forecasted last month" — gap should be near zero.

**Warning signs:**
- Dashboard shows "next charge: April 31" (a date that doesn't exist).
- Clinic owner: "You said I'd have 12 renewals this month, I only had 10."
- Renewal-forecast number that doesn't match `subscriptions.list({ current_period_end[lte]: now+30d })`.
- Any code doing `new Date(date.getTime() + 30*24*60*60*1000)` for a next-charge estimate.

**Phase to address:** Phase 3 (subscriptions + dashboard forecasting). Verification test: unit test the forecast calculation against a fixture of subscriptions with edge-case anchors (Jan 31, Feb 28, Feb 29, Mar 30); integration test against Stripe test clocks.

---

## Technical Debt Patterns

Shortcuts that seem reasonable but create long-term problems. For a v1 demo-ship, some are acceptable. Knowing which is which prevents the first production mistake from becoming the permanent architecture.

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Skip Postgres RLS, rely only on app-layer `WHERE clinic_id = $1` | Ship tenancy in a day | One forgotten filter = cross-tenant leak; every future query needs manual audit; RLS is painful to retrofit after the data model settles | Never — RLS is cheap on day 1, expensive on day 90 |
| Process Stripe webhooks synchronously inline (no queue) | Simpler code, no background worker | Slow handlers trigger retries → duplicates; heavy work (PDF, email) blocks 200 response; hot outage if webhook traffic spikes | Acceptable for v1 ship IF idempotency keys are enforced AND work completes in <2s |
| Compute break-even math client-side (JS in the browser only) | Faster iteration, no API round-trip | Owner can edit DOM to fake favorable numbers; no server-side log of what numbers produced a publish; can't replay the calc for support | Never — compute server-side, display client-side |
| Single "is_active" boolean on member instead of enum status | One fewer migration | Can't distinguish active / past_due / unpaid / canceled / pending_onboarding; every business question needs Stripe API roundtrip | Never for billing state — enums now, always |
| Slug is editable from the dashboard | Feels flexible | Old URL 404s silently, newsletters broken, squatting window opens | Never editable by owner in v1 — support-action only |
| Log full Stripe webhook payloads to help debugging | Easier incident triage | PCI scope expands if `payment_method` objects appear; PII leakage; log pipeline becomes a sensitive-data system | Only log `event.id`, `type`, and extracted safe fields — never raw payloads |
| Platform fee hardcoded in application code | Quick to ship | Changing fee requires redeploy; no per-clinic pricing experiments; auditing "what did we charge this clinic in July?" is impossible | Acceptable for v1 IF the fee is also written to a `platform_fees` ledger table on every charge event |
| Don't handle the `account.updated` webhook (only poll at publish) | One fewer handler | Clinics whose Stripe status changes after publish (restriction, verification hold) have stale dashboard state; owner thinks they're fine, charges silently fail | Never — `account.updated` is essential |

---

## Integration Gotchas

Common mistakes when connecting to external services.

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| Stripe Connect Express | Assuming `account.id` returned from Create Account means "ready to charge" | Gate publish on `charges_enabled && payouts_enabled && !requirements.disabled_reason`; subscribe to `account.updated` |
| Stripe Connect AccountLink | Reusing a single `AccountLink` URL across multiple UI renders | `AccountLink` is single-use, expires in 5 minutes; generate fresh on every click |
| Stripe Checkout session creation | Creating the session on page load instead of click | Create on "Enroll" click; scale falls off 10× under a newsletter blast |
| Stripe Webhooks | Processing without signature verification | Call `stripe.webhooks.constructEvent` before any DB write, always |
| Stripe Webhooks | Assuming exactly-once delivery | Persist `event.id`; `INSERT ... ON CONFLICT DO NOTHING`; idempotent handlers |
| Stripe Webhooks | Only listening to `checkout.session.completed` for "new subscription" | Also listen to `customer.subscription.created` + `invoice.paid` (first invoice confirms the money moved, not just the session) |
| Stripe Subscriptions | Computing next charge date as "start + 30 days" | Use `current_period_end` from the subscription object; handle month-end anchor edge cases |
| Stripe Subscriptions (Connect) | Calling Stripe API without the `Stripe-Account` header when acting on behalf of a connected account | Every Stripe API call for a clinic's subscription must include `Stripe-Account: acct_...` OR use `on_behalf_of` + `transfer_data[destination]` per the platform model |
| Stripe Connect fees | Setting `application_fee_percent` AND a custom fee in application code | Pick one source of truth; reconcile against `application_fees` webhooks |
| Postgres RLS | App connecting as table owner | App role is non-owner, non-superuser, `BYPASSRLS = false`; tables have `FORCE ROW LEVEL SECURITY` |
| Postgres pooling | Using `SET` (session) instead of `SET LOCAL` (transaction) for tenant context | `SET LOCAL` inside a transaction block; verify `server_reset_query = DISCARD ALL` on the pooler |
| Next.js ISR | `revalidate: 60` without on-demand invalidation | Use `revalidateTag('clinic:{slug}')` when plan edits; safety-net `revalidate: 300` |
| Email (transactional) | Sending welcome PDF inline in the webhook handler | Enqueue to a background worker with idempotency key = `event.id`; never block the 200 response |
| PDF generation | Running a headless browser on every welcome email | Use a PDF library (e.g., `pdf-lib`, `react-pdf`) or a stateless service; browser-based PDF doesn't scale per serverless invocation |

---

## Performance Traps

Patterns that work at small scale but fail as usage grows. Scale targets are realistic for a v1 demo: one clinic published, newsletter blast to a few hundred, eventual growth to tens of clinics.

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| SSR per request on the public enrollment page | p95 latency spike during a newsletter blast; CDN cache-miss rate > 30% | Static generation with ISR + on-demand revalidation; CDN cache headers; defer Stripe session creation to button click | ~200 concurrent page views |
| Creating Stripe Checkout session on page load | 429 rate limits from Stripe; broken Checkout redirects for the last users in a burst | Create session on "Enroll" click only; idempotency-keyed endpoint | ~50 page loads/min from one clinic's traffic |
| Dashboard fetches all members then filters in-app | Dashboard slow for clinics with >200 members; SQL time dominates | Indexes on `clinic_id`, `clinic_id + status`, `clinic_id + next_billing_at`; paginate the member table | ~500 members per clinic |
| Break-even computed by re-running full pricing calc on every keystroke | Laggy builder UI; browser thread blocked | Debounce input (200ms); pure function + memoization | ~10 rapid input changes |
| Webhook handler does inline PDF + email + DB writes | Stripe retries because handler > 5s; duplicate processing cascades | Enqueue work to background; return 200 in <200ms | ~20 webhooks/min during a burst |
| No indexes on `(clinic_id, stripe_subscription_id)` | Lookup during webhook processing slows; P99 webhook time creeps up | Composite index on `(clinic_id, stripe_subscription_id)` + `stripe_subscription_id` unique | Month 2, after a few hundred members |
| Render MRR dashboard with `SUM(monthly_price)` over all member rows on every load | Dashboard slow; repeats work | Materialized view or cached aggregate with 5-min TTL; refresh on webhook | ~1000 members total |

---

## Security Mistakes

Domain-specific security issues beyond general web security.

| Mistake | Risk | Prevention |
|---------|------|------------|
| Public enrollment page exposes any clinic-scoped data beyond the published plan | Member list or pricing-draft leak; competitor can scrape all clinic members via iterating slugs | Enrollment page reads from a dedicated `v_public_clinic_plans` view that exposes only: clinic name, logo, accent color, published plan tiers, published prices. No member data, no draft plans. |
| Stripe webhook endpoint without signature verification | Attacker forges a `checkout.session.completed` event; creates fake members; triggers unlimited welcome emails | `stripe.webhooks.constructEvent(body, sig, secret)` on every request; reject before any DB read |
| Welcome PDF contains member's full card last-4 | PII exposure via email attachment sitting in inbox indefinitely | Include only plan name, included services, first billing date, clinic contact. No payment details. |
| Clinic owner's "export members CSV" endpoint lacks tenant check | Authenticated clinic A can request clinic B's CSV via parameter tampering | All exports go through tenant-scoped repository; RLS enforced at DB; test cross-tenant explicitly in CI |
| Slug enumeration used to discover clinics + their enrollment pages | Competitor scrapes `/hillside/enroll`, `/midtown/enroll`, etc. to map the customer base | Rate-limit anonymous GETs per IP; 404 (not 403) for non-existent slugs so existence isn't confirmable; optional: require a non-guessable suffix for enrollment pages in later versions |
| Stripe API keys checked into repo or logged | Full access to connected accounts, charges, customer data | Secrets in env vars only; `.gitleaks` or `gitleaks-action` in CI; restrict Stripe key to specific capabilities via restricted keys where possible |
| Stripe Connect `account.created` webhook not verified against the onboarding flow | Attacker creates a Connect account under PawPlan's platform and associates it with a clinic they don't own | Flow state: PawPlan creates the `AccountLink` with a `state` nonce bound to the clinic_id; validate on return; never accept arbitrary `acct_…` IDs from the client |
| Welcome PDF or enrollment page renders user-controlled clinic name/bio without sanitization | Stored XSS in a clinic name field renders on every public enrollment page visit | Sanitize all user-entered content on read; set strict CSP on public pages; no HTML input — markdown-at-most for any "about" fields |
| Session cookies not `HttpOnly` + `Secure` + `SameSite=Lax` | Session hijack via XSS | Set all three flags; enforce HTTPS everywhere |
| `next/image` loader fetches clinic logos from arbitrary user-supplied URLs | SSRF (server fetches internal metadata endpoints); bandwidth abuse | Store uploaded logos on a CDN with server-side validation (MIME + size limit); never server-fetch from user URLs |

---

## UX Pitfalls

Common user experience mistakes in this domain.

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| Break-even math shown only at the end of the 8-question builder | Owner completes 8 questions, sees one number, doesn't trust it, bails | Show break-even inline after each relevant input; "as you raise exam price, break-even drops to 12 members" — explicit causality builds trust |
| Publish button grayed out with no reason | Owner doesn't know why they can't publish (Stripe incomplete? Missing fields?) | Specific reason + one-click remediation ("Your Stripe account needs bank info. Continue onboarding →") |
| Stripe Connect onboarding opens in same tab; return loses PawPlan state | Owner loses place; restarts builder from scratch | Open Stripe in new tab OR persist builder state server-side so return is a no-op |
| Enrollment page shows three tiers without a "most popular" cue | Analysis paralysis; no default choice; conversion drops | Highlight middle tier; pre-select it; add social proof if available ("Most clinics choose Preventive Plus") |
| Failed-charge flag on member record is a red dot with no action | Clinic sees it, doesn't know what to do | One-click "retry charge now" (calls Stripe) + "email client about card" (uses a template) |
| Service-redemption checkbox with no confirmation | Mis-click marks redeemed; staff doesn't notice | Undo toast ("Marked dental cleaning redeemed. Undo") with 10-second window |
| Dashboard MRR display that doesn't explain the number | Owner sees "MRR: $2,450" — is that gross, net of Stripe fees, net of platform fee? | Display three lines: Gross MRR / − Stripe fees / − PawPlan fee / = Net to clinic |
| Plan pricing edits silently apply to new subscriptions only | Owner edits price; existing members still pay old price; owner expected one or the other, isn't sure which | On save, explicit dialog: "New price applies to new enrollments only. Existing 14 members continue at their current price. Change existing? (separate flow)" |
| Empty state on dashboard shows a zero and no next step | Owner publishes, nobody enrolls yet, sees "0 members" and bounces | Empty state = "Your enrollment page is live at pawplan.app/hillside/enroll. Share it via: [Copy link] [Email template] [QR for lobby]" |
| Welcome packet PDF looks generic / not co-branded | Client doesn't feel like they joined this clinic's plan; erodes differentiation vs Banfield | Clinic logo + accent color on PDF header; clinic name + contact in footer; included services list |

---

## "Looks Done But Isn't" Checklist

Things that appear complete but are missing critical pieces. Use during QA before demo-ship.

- [ ] **Stripe Connect onboarding:** Often missing `charges_enabled + payouts_enabled` gate on publish — verify publish is blocked when an account is created but KYC incomplete
- [ ] **Webhook handling:** Often missing idempotency guard — verify replaying the same webhook ID 5× produces exactly one member, one email, one PDF
- [ ] **Tenancy:** Often missing Postgres RLS (only app-layer filter) — verify with a direct-DB cross-tenant query that RLS blocks the read
- [ ] **Break-even math:** Often missing Stripe fee + platform fee in the displayed breakdown — verify the per-member "clinic gross" matches actual Stripe payout after fees
- [ ] **Enrollment page:** Often missing caching (SSR per request) — verify CDN cache headers + load test at 500 req/s
- [ ] **Slug generation:** Often missing reserved-word list — verify registering `admin`, `api`, `login`, `enroll` is rejected
- [ ] **Service redemption:** Often missing concurrent-toggle protection — verify two simultaneous toggles against the same row produces exactly one state change
- [ ] **Failed charge:** Often missing visible clinic alert — verify the dashboard shows a red flag within 60s of a test-clock `invoice.payment_failed` event
- [ ] **Failed charge:** Often missing pet-owner email — verify email is sent on first failure and again on subscription cancellation from unpaid state
- [ ] **Renewal forecast:** Often missing end-of-month edge case — verify a member enrolled Jan 31 shows correct Feb 28 renewal date
- [ ] **Timezone:** Often missing clinic-local display — verify a Pacific-time clinic sees "next charge: April 30" not "April 30 05:00 UTC"
- [ ] **Welcome PDF:** Often missing clinic branding — verify logo + accent color + clinic contact are on the generated PDF
- [ ] **Owner dashboard:** Often missing empty state guidance — verify a fresh-published clinic with 0 members sees "share your link" UI, not just "0"
- [ ] **PCI:** Often missing documentation of SAQ-A posture — verify SECURITY.md states Checkout-only approach and codebase grep for `CardElement|PaymentElement` returns 0
- [ ] **Plan edits post-publish:** Often missing clarity on who's affected — verify the edit UI explicitly states "applies to new enrollments only"
- [ ] **Cancellation:** Often missing prorated end-of-period behavior — verify cancelling on day 10 of a 30-day cycle still bills normally and stops at period end, not immediately

---

## Recovery Strategies

When pitfalls occur despite prevention, how to recover.

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Stripe Connect incomplete, member already charged | LOW | Funds sit in platform balance; create a manual transfer once `payouts_enabled = true`; email clinic + client with explanation |
| Duplicate members from webhook replay | LOW | Dedupe query on `(clinic_id, stripe_subscription_id)` keeps the earliest row; cancel + refund the extra Stripe subscription; soft-delete the duplicate member |
| Break-even math wrong in production for published clinics | MEDIUM | Deploy corrected calculation; notify affected clinics with a before/after breakdown; do not silently change their displayed break-even without notice |
| Tenancy bleed (cross-tenant data exposure) | HIGH | Immediate incident response: lock affected accounts; audit access logs; notify affected clinics per GDPR/state breach law; legal counsel; root-cause analysis published |
| Enrollment URL squatting | MEDIUM | Support-action slug change; 301 redirect from old slug; notify the squatter's account; potentially freeze the squatter's account pending verification |
| Enrollment page 500s during newsletter blast | MEDIUM | Roll out CDN cache headers + static generation; post-incident, contact affected clinic with a 30-day fee waiver; document as a postmortem |
| PCI scope accidentally widened | HIGH | Immediately remove card-collecting code; audit logs for card data exposure; re-attest SAQ-A; potentially notify QSA if one is engaged |
| Silent failed charges accumulate | MEDIUM | Reconciliation script: list all `past_due` + `unpaid` subscriptions from Stripe, cross-ref against PawPlan member flags, backfill missing flags; send a one-time catch-up email to affected clinics summarizing at-risk members |
| Wrong-day billing-date display | LOW | Fix the display logic; push a dashboard notice "We corrected renewal date display"; no money moves wrong — Stripe handled the actual charge correctly |
| Service-redemption double-toggle | LOW | Add versioning or event-log backfill; write a script to dedupe historical redemption events; communicate fix to affected clinics |

---

## Pitfall-to-Phase Mapping

How roadmap phases should address these pitfalls. A roadmap that doesn't explicitly address Pitfalls 1–6 in its first two phases is high-risk.

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| #1 Stripe Connect incomplete accounts | Phase 2 (Stripe Connect integration) | E2E test: abandon onboarding mid-flow, assert publish blocked with actionable CTA |
| #2 Webhook double-processing | Phase 3 (subscription webhooks) | Replay test: same `event.id` ×5 → 1 member, 1 email, 1 PDF |
| #3 Break-even math errors | Phase 1 (plan builder) | 15-scenario unit test file with hand-verified outputs; E2E match against Stripe deposit |
| #4 Tenancy bleed | Phase 1 (auth + data model) — **foundational, must be first** | Cross-tenant automated test suite in CI; RLS smoke test; security review gate |
| #5 Slug collision / squatting / reserved words | Phase 1 (routing + slug generation) | Reserved-word list tested against real routes; unit test on normalization; E2E reject |
| #6 Service-redemption race | Phase 4 (dashboard + redemption) | Concurrent-toggle test: 2 simultaneous requests → 1 wins, 1 conflicts |
| #7 PCI scope creep | Phase 2 (Stripe Checkout integration) | Codebase grep for `CardElement|PaymentElement` returns 0; SECURITY.md states SAQ-A |
| #8 Public page performance | Phase 2 or 3 (enrollment page) | k6 load test: 500 req/s for 60s, p95 < 500ms |
| #9 Silent failed charges | Phase 3 (subscription lifecycle) | Test-clock simulation: failed charge → member flag within 60s + email sent |
| #10 Time-zone + billing-date edges | Phase 3 (subscription display + forecast) | Unit tests for Jan 31, Feb 28, Feb 29, DST transitions; integration against Stripe test clocks |

**Suggested phase ordering driven by these pitfalls:**

1. **Phase 1 — Foundation:** Auth, clinic + slug model, **Postgres RLS from day 1**, plan builder with break-even unit tests. (Addresses Pitfalls #3, #4, #5.)
2. **Phase 2 — Stripe rails:** Connect Express onboarding with capability gating, Checkout integration (hosted/iframe only), public enrollment page with ISR + caching. (Addresses Pitfalls #1, #7, #8.)
3. **Phase 3 — Lifecycle:** Webhooks with idempotency, subscription state machine, failed-charge handling, timezone-correct renewal forecast. (Addresses Pitfalls #2, #9, #10.)
4. **Phase 4 — Dashboard & redemption:** MRR/forecast displays, member table, service-redemption with optimistic locking. (Addresses Pitfall #6.)
5. **Phase 5 — Polish:** Welcome PDF branding, cancellation flow, post-publish plan edits, empty states.

---

## Sources

**Stripe documentation (HIGH confidence):**
- [Using Connect with Express connected accounts | Stripe Documentation](https://docs.stripe.com/connect/express-accounts)
- [Onboarding solutions for Custom accounts | Stripe Documentation](https://docs.stripe.com/connect/custom/onboarding)
- [Choose your onboarding configuration | Stripe Documentation](https://docs.stripe.com/connect/onboarding)
- [Receive Stripe events in your webhook endpoint | Stripe Documentation](https://docs.stripe.com/webhooks)
- [Idempotent requests | Stripe API Reference](https://docs.stripe.com/api/idempotent_requests)
- [Set the subscription billing renewal date | Stripe Documentation](https://docs.stripe.com/billing/subscriptions/billing-cycle)
- [Prorations | Stripe Documentation](https://docs.stripe.com/billing/subscriptions/prorations)
- [Automate payment retries (Smart Retries) | Stripe Documentation](https://docs.stripe.com/billing/revenue-recovery/smart-retries)
- [Revenue recovery | Stripe Documentation](https://docs.stripe.com/billing/revenue-recovery)
- [Integration security guide | Stripe Documentation](https://docs.stripe.com/security/guide)
- [What is PCI DSS compliance? | Stripe](https://stripe.com/guides/pci-compliance)

**Multi-tenant RLS (HIGH confidence, verified across multiple sources):**
- [Multi-Tenant Leakage: When "Row-Level Security" Fails in SaaS | Medium](https://medium.com/@instatunnel/multi-tenant-leakage-when-row-level-security-fails-in-saas-da25f40c788c)
- [Postgres RLS Implementation Guide - Best Practices, and Common Pitfalls | Permit.io](https://www.permit.io/blog/postgres-rls-implementation-guide)
- [Shipping multi-tenant SaaS using Postgres Row-Level Security | Nile](https://www.thenile.dev/blog/multi-tenant-rls)
- [Multi-tenant data isolation with PostgreSQL Row Level Security | AWS](https://aws.amazon.com/blogs/database/multi-tenant-data-isolation-with-postgresql-row-level-security/)

**Concurrency / locking (HIGH confidence, Postgres docs + secondary):**
- [How to Handle Race Conditions in PostgreSQL Functions | OneUptime](https://oneuptime.com/blog/post/2026-01-25-postgresql-race-conditions/view)
- [Implementing Optimistic Locking in PostgreSQL | Reintech](https://reintech.io/blog/implementing-optimistic-locking-postgresql)
- [PostgreSQL: Documentation: 18: Chapter 13. Concurrency Control](https://www.postgresql.org/docs/current/mvcc.html)

**Next.js performance (HIGH confidence):**
- [Guides: ISR | Next.js](https://nextjs.org/docs/app/guides/incremental-static-regeneration)
- [Deep Dive: Caching and Revalidating | vercel/next.js Discussion](https://github.com/vercel/next.js/discussions/54075)

**Vet wellness plan domain (MEDIUM confidence, dvm360 + VetSuccess cited secondhand):**
- [8 mistakes to avoid in your veterinary wellness plans | dvm360](https://www.dvm360.com/view/8-mistakes-avoid-your-veterinary-wellness-plans)
- [How Should Veterinary Practices Price Their Membership Models for Maximum Value? | Monetizely](https://www.getmonetizely.com/articles/how-should-veterinary-practices-price-their-membership-models-for-maximum-value)
- [Pricing strategy for veterinary practices | AVMA](https://www.avma.org/resources-tools/practice-management/pricing-strategy-veterinary-practices)

**Stripe webhook best practices (MEDIUM confidence, community patterns):**
- [Best practices I wish we knew when integrating Stripe webhooks | Stigg](https://www.stigg.io/blog-posts/best-practices-i-wish-we-knew-when-integrating-stripe-webhooks)
- [Guide to Stripe Webhooks: Features and Best Practices | Hookdeck](https://hookdeck.com/webhooks/platforms/guide-to-stripe-webhooks-features-and-best-practices)

**Failed-payment behavior (MEDIUM confidence, community articles on Stripe defaults):**
- [Why Stripe's Default Payment Retries Aren't Enough | Rebounce](https://www.rebounce.dev/blog/stripe-default-retries)
- [Stripe Smart Retries: FAQs and Best Practices | Churnkey](https://churnkey.co/blog/stripe-smart-retries/)

---
*Pitfalls research for: PawPlan (multi-tenant SaaS, Stripe Connect Express, public enrollment, vet wellness plans)*
*Researched: 2026-04-23*
