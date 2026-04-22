# Architecture Research

**Domain:** Multi-tenant SaaS with Stripe Connect Express marketplace (vet clinic wellness-plan builder)
**Researched:** 2026-04-23
**Confidence:** HIGH

## Standard Architecture

### System Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                         PUBLIC SURFACES                              │
│                                                                      │
│  ┌─────────────────────────┐   ┌──────────────────────────────┐    │
│  │  Marketing              │   │  Enrollment Page             │    │
│  │  pawplan.app/           │   │  pawplan.app/{slug}/enroll   │    │
│  │  (Static, no auth)      │   │  (Unauthed, SSR by slug)     │    │
│  └─────────────────────────┘   └──────────────┬───────────────┘    │
│                                                │                     │
├────────────────────────────────────────────────┼─────────────────────┤
│                      AUTHENTICATED SURFACES    │                     │
│                                                │                     │
│  ┌─────────────────────────┐   ┌──────────────┴───────────────┐    │
│  │  Owner Auth             │   │  Owner Dashboard             │    │
│  │  /signup, /login        │   │  /dashboard, /builder,       │    │
│  │  (email/password)       │   │  /members, /plan             │    │
│  └─────────────────────────┘   └──────────────────────────────┘    │
│                                                                      │
├──────────────────────────────────────────────────────────────────────┤
│                         APPLICATION LAYER                            │
│                                                                      │
│  ┌────────────┐  ┌────────────┐  ┌────────────┐  ┌────────────┐    │
│  │ Plan       │  │ Break-Even │  │ Enrollment │  │ Redemption │    │
│  │ Builder    │  │ Calculator │  │ Service    │  │ Service    │    │
│  │ Service    │  │ (pure fn)  │  │            │  │            │    │
│  └──────┬─────┘  └──────┬─────┘  └──────┬─────┘  └──────┬─────┘    │
│         │               │                │                │          │
│  ┌──────┴───────────────┴────────────────┴────────────────┴──────┐  │
│  │                     Tenant Context                             │  │
│  │         (clinic_id resolver, RLS session setter)              │  │
│  └────────────────────────────────────────────────────────────────┘  │
│                                                                      │
├──────────────────────────────────────────────────────────────────────┤
│                         INTEGRATION LAYER                            │
│                                                                      │
│  ┌────────────────────┐  ┌────────────────────┐  ┌───────────────┐  │
│  │ Stripe Webhook     │  │ Stripe API         │  │ Email + PDF   │  │
│  │ Handler            │  │ Client (platform & │  │ Worker        │  │
│  │ (/api/stripe/      │  │  Stripe-Account    │  │ (Resend +     │  │
│  │  webhook)          │  │  header)           │  │  @react-pdf)  │  │
│  └──────────┬─────────┘  └──────────┬─────────┘  └───────┬───────┘  │
│             │                        │                     │         │
├─────────────┼────────────────────────┼─────────────────────┼─────────┤
│             ▼                        ▼                     ▼         │
│                        PERSISTENCE LAYER                             │
│                                                                      │
│  ┌────────────────┐  ┌────────────────┐  ┌────────────────┐         │
│  │ Postgres       │  │ Webhook Event  │  │ Background Job │         │
│  │ (RLS by        │  │ Log            │  │ Queue          │         │
│  │  clinic_id)    │  │ (idempotency   │  │ (e.g. pg-boss  │         │
│  │                │  │  dedupe)       │  │  or Inngest)   │         │
│  └────────────────┘  └────────────────┘  └────────────────┘         │
│                                                                      │
├──────────────────────────────────────────────────────────────────────┤
│                         EXTERNAL SERVICES                            │
│                                                                      │
│  ┌────────────┐  ┌────────────┐  ┌────────────┐  ┌────────────┐    │
│  │ Stripe     │  │ Stripe     │  │ Resend     │  │ Object     │    │
│  │ Connect    │  │ Checkout   │  │ (email)    │  │ Storage    │    │
│  │ (platform) │  │ (hosted)   │  │            │  │ (logos)    │    │
│  └────────────┘  └────────────┘  └────────────┘  └────────────┘    │
└──────────────────────────────────────────────────────────────────────┘
```

### Component Responsibilities

| Component | Responsibility | Typical Implementation |
|-----------|----------------|------------------------|
| **Marketing pages** | Static explainer, sign-up CTA | Next.js App Router static route group `(marketing)/` |
| **Enrollment page** | Public tier-picker + Checkout launcher for one clinic | Next.js dynamic route `/[clinicSlug]/enroll/page.tsx`, SSR with `cache('force-cache')` + `revalidateTag(slug)` on publish |
| **Owner Auth** | Email/password login, session cookie | Better Auth or Lucia with Postgres adapter; session stores `clinic_id` |
| **Owner Dashboard** | Metrics, members, redemption toggles, plan editor | Next.js route group `(dashboard)/` behind middleware auth check |
| **Plan Builder Service** | Persist draft answers, generate tier structures, mutate plan | Server actions + Zod validation; writes to `plans` / `plan_tiers` tables |
| **Break-Even Calculator** | Pure deterministic math (retail value, monthly fee, gross/pet/yr, break-even member count) | `lib/pricing/breakEven.ts` — pure TS module; runs both client (instant recalc) and server (canonical at Publish) |
| **Enrollment Service** | Create Stripe Checkout session in subscription mode, write `member` record on webhook confirmation | Server action + webhook handler pair; uses `transfer_data.destination` and `application_fee_percent` |
| **Redemption Service** | Idempotent toggle of service redemptions per member per billing period | Unique constraint `(member_id, service_key, billing_period_start)`; upsert pattern |
| **Tenant Context** | Resolve `clinic_id` from session (dashboard) or slug (enrollment); set Postgres session GUC for RLS | Middleware + DB connection wrapper: `SET LOCAL app.current_clinic_id = $1` per request |
| **Stripe Webhook Handler** | Verify signatures, dedupe by event.id, dispatch to handlers, return 200 fast | Single `/api/stripe/webhook` route; persists event first, queues async work |
| **Stripe API Client** | Typed wrapper around `stripe` SDK; always sets `Stripe-Account` header when acting on connected account | `lib/stripe/client.ts` — factory returns platform client or per-clinic client |
| **Email + PDF Worker** | Render welcome packet PDF, send via Resend with attachment | Triggered from webhook → queue; uses `@react-pdf/renderer` + `react-email` + `resend` |
| **Webhook Event Log** | Idempotency store; `id` = Stripe event.id as PK | Drizzle table with primary key on Stripe event ID |
| **Background Job Queue** | Decouples webhook ACK from heavy work (PDF, email, CRM hooks) | pg-boss (Postgres-backed) for MVP; no separate Redis |

## Recommended Project Structure

```
pawplan/
├── app/
│   ├── (marketing)/                  # Public unauthed pages
│   │   ├── page.tsx                  # Landing
│   │   ├── pricing/page.tsx
│   │   └── layout.tsx
│   ├── (auth)/                       # Auth flows
│   │   ├── signup/page.tsx
│   │   ├── login/page.tsx
│   │   └── layout.tsx
│   ├── (dashboard)/                  # Owner-authenticated surface
│   │   ├── layout.tsx                # Enforces auth + loads clinic context
│   │   ├── dashboard/page.tsx        # Metrics
│   │   ├── builder/page.tsx          # 8-question plan builder
│   │   ├── plan/page.tsx             # Post-publish plan editor
│   │   ├── members/
│   │   │   ├── page.tsx              # Members table
│   │   │   └── [memberId]/page.tsx   # Redemption toggles, cancel
│   │   └── settings/page.tsx         # Clinic profile, Connect status
│   ├── [clinicSlug]/                 # PUBLIC per-clinic surface
│   │   └── enroll/
│   │       ├── page.tsx              # SSR tier picker (no auth)
│   │       ├── success/page.tsx      # Post-Checkout landing
│   │       └── opengraph-image.tsx   # Branded social preview
│   └── api/
│       ├── stripe/
│       │   ├── webhook/route.ts      # Single Connect+platform endpoint
│       │   ├── connect/
│       │   │   ├── onboard/route.ts  # Create account + account link
│       │   │   └── refresh/route.ts  # Re-issue onboarding link
│       │   └── checkout/
│       │       └── route.ts          # Create Checkout session
│       └── health/route.ts
├── lib/
│   ├── db/
│   │   ├── schema.ts                 # Drizzle schema
│   │   ├── client.ts                 # Tenant-aware connection wrapper
│   │   └── migrations/
│   ├── auth/
│   │   ├── session.ts                # Session get/set
│   │   └── middleware.ts
│   ├── stripe/
│   │   ├── client.ts                 # SDK factory (platform vs connected)
│   │   ├── webhook-handlers/         # One file per event type
│   │   │   ├── account-updated.ts
│   │   │   ├── checkout-completed.ts
│   │   │   ├── invoice-paid.ts
│   │   │   ├── invoice-payment-failed.ts
│   │   │   └── customer-subscription-deleted.ts
│   │   └── checkout.ts               # Create session helper
│   ├── pricing/
│   │   ├── breakEven.ts              # PURE FN — deterministic math
│   │   ├── tiers.ts                  # Tier generation from 8-Q answers
│   │   └── breakEven.test.ts         # Exhaustive unit tests
│   ├── tenant/
│   │   └── context.ts                # Resolve & set clinic_id for RLS
│   ├── email/
│   │   ├── templates/                # react-email components
│   │   │   ├── welcome-packet.tsx
│   │   │   ├── enrollment-owner.tsx
│   │   │   └── payment-failed.tsx
│   │   └── send.ts                   # Resend wrapper
│   ├── pdf/
│   │   └── welcome-packet.tsx        # @react-pdf/renderer doc
│   ├── queue/
│   │   ├── index.ts                  # pg-boss client
│   │   └── jobs/                     # One file per job type
│   │       ├── send-welcome-packet.ts
│   │       └── notify-owner.ts
│   └── validation/
│       └── schemas.ts                # Zod schemas (shared client/server)
├── components/
│   ├── ui/                           # shadcn primitives
│   ├── builder/                      # Plan builder step components
│   ├── dashboard/
│   └── enrollment/
├── middleware.ts                     # Auth gate for /(dashboard)
└── drizzle.config.ts
```

### Structure Rationale

- **Route groups `(marketing)` / `(auth)` / `(dashboard)` / `[clinicSlug]`:** Physical separation of the four distinct audiences. Enrollment pages under `[clinicSlug]` are at the root — no `/tenants/{slug}` prefix — because the brief is explicit: `pawplan.app/{clinic-slug}/enroll`.
- **`lib/stripe/webhook-handlers/`:** One handler per event type keeps the router thin and makes each handler independently testable. Mirrors the event-dispatch pattern recommended by Stripe's 2026 guides.
- **`lib/pricing/breakEven.ts` as a pure function:** The riskiest assumption is owner trust in the math. Isolating it as a zero-dependency pure function lets it run client-side for instant preview and server-side as canonical truth at Publish, with the same code path. Unit-test coverage on this file is the single most valuable test suite in the project.
- **`lib/tenant/context.ts` separate from auth:** Tenant resolution happens in two distinct paths (session-derived for dashboard, slug-derived for enrollment). Keeping it separate lets both paths converge on the same RLS session-setter.
- **`lib/queue/`:** Separating webhook receipt from heavy work (PDF render + email send) is mandatory. Stripe requires webhook ACK within seconds; PDF generation alone can blow that budget.

## Architectural Patterns

### Pattern 1: Single Connect Webhook Endpoint with Event Dispatch

**What:** One route `/api/stripe/webhook` receives every event from both the platform account and every connected clinic account. Stripe tags connected-account events with a top-level `account` field; platform events omit it.

**When to use:** Always, for a Connect platform. Stripe's own docs require configuring the endpoint with `connect: true` to receive connected-account events.

**Trade-offs:**
- Pro: Single signature verification path, single idempotency store, single deploy target.
- Con: One handler fans out to N event types — must be kept disciplined with a dispatch table, not a mega-switch.

**Example:**
```typescript
// app/api/stripe/webhook/route.ts
import { headers } from 'next/headers';
import { stripe } from '@/lib/stripe/client';
import { logEvent, alreadyProcessed } from '@/lib/stripe/events';
import { queue } from '@/lib/queue';

const HANDLERS = {
  'account.updated': 'handle-account-updated',
  'checkout.session.completed': 'handle-checkout-completed',
  'invoice.paid': 'handle-invoice-paid',
  'invoice.payment_failed': 'handle-invoice-failed',
  'customer.subscription.deleted': 'handle-subscription-deleted',
} as const;

export async function POST(req: Request) {
  const sig = (await headers()).get('stripe-signature')!;
  const body = await req.text();

  let event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET!);
  } catch {
    return new Response('bad signature', { status: 400 });
  }

  // Idempotency: event.id is PK; duplicate = no-op
  if (await alreadyProcessed(event.id)) return new Response('ok', { status: 200 });
  await logEvent(event); // persist first

  const job = HANDLERS[event.type as keyof typeof HANDLERS];
  if (job) {
    // event.account is set for Connect events, undefined for platform events
    await queue.send(job, { eventId: event.id, connectedAccountId: event.account });
  }

  return new Response('ok', { status: 200 }); // < 1s
}
```

### Pattern 2: Destination Charges — Platform Owns the Customer

**What:** Subscriptions use `transfer_data.destination = clinic.stripe_account_id` with `application_fee_percent`. The Customer, Subscription, and Invoice all live on the PLATFORM account. Funds flow to the clinic on each successful charge; PawPlan keeps the platform fee.

**When to use:** When the platform must see subscription data across all clinics (for the owner dashboard MRR/ARR/member-count queries). Direct charges would fragment data across N Stripe accounts and require one API call per clinic per query.

**Trade-offs:**
- Pro: Single Stripe API namespace for queries (`stripe.subscriptions.list()` returns all clinics' subs); platform is merchant of record; simpler reporting.
- Con: Platform bears more compliance surface (dispute handling, 1099-K in US); clinic does not see raw Stripe Dashboard data for its own subs.

**Example:**
```typescript
// lib/stripe/checkout.ts
export async function createEnrollmentCheckout(clinic: Clinic, tier: PlanTier, customerEmail: string) {
  return stripe.checkout.sessions.create({
    mode: 'subscription',
    customer_email: customerEmail,
    line_items: [{ price: tier.stripe_price_id, quantity: 1 }],
    subscription_data: {
      application_fee_percent: PLATFORM_FEE_PCT, // e.g. 10
      transfer_data: { destination: clinic.stripe_account_id },
      metadata: { clinic_id: clinic.id, tier_id: tier.id },
    },
    success_url: `https://pawplan.app/${clinic.slug}/enroll/success?cs={CHECKOUT_SESSION_ID}`,
    cancel_url: `https://pawplan.app/${clinic.slug}/enroll`,
  });
  // Note: NO Stripe-Account header — the call is against the platform account.
}
```

### Pattern 3: Tenant Context via Postgres RLS + Session GUC

**What:** Every authenticated request resolves `clinic_id` (from session cookie for dashboard; from URL slug for enrollment), then opens a transaction that runs `SET LOCAL app.current_clinic_id = $1`. RLS policies on every tenant-scoped table enforce `clinic_id = current_setting('app.current_clinic_id')::uuid`.

**When to use:** From day one. Retrofitting RLS onto a schema with leaky `WHERE clinic_id = ?` filters is painful; adding it upfront costs one migration.

**Trade-offs:**
- Pro: Defense in depth — even a forgotten `WHERE` clause cannot cross tenants. Satisfies auditors. Cheap at small scale.
- Con: Requires composite indexes with `clinic_id` as leading column (without them, RLS is orders of magnitude slower). Must be careful with connection poolers — use `SET LOCAL` inside a transaction, never `SET`.

**Example:**
```sql
-- migration
ALTER TABLE members ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON members
  USING (clinic_id = current_setting('app.current_clinic_id')::uuid);
CREATE INDEX idx_members_clinic_id ON members (clinic_id, created_at DESC);
```
```typescript
// lib/db/client.ts
export async function withClinic<T>(clinicId: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`SET LOCAL app.current_clinic_id = ${clinicId}`);
    return fn(tx);
  });
}
```

### Pattern 4: Pure-Function Break-Even Engine

**What:** `lib/pricing/breakEven.ts` exports `computeTiers(inputs: PlanInputs): TierQuote[]` — zero dependencies, zero I/O. Called identically in the browser (for instant recalculation as the owner drags sliders) and on the server (at Publish, to persist canonical prices).

**When to use:** Any time the same computation must run in both environments AND correctness is load-bearing. Owner trust in the math is the riskiest assumption in the entire product — the single source of truth must be literal (one file, tested to exhaustion).

**Trade-offs:**
- Pro: Identical client/server output; trivial to unit test; easy to change formulas without hunting through components.
- Con: Requires discipline — any future feature that wants to pull in a database, date library, or async call inside this module breaks the property. Enforce with a lint rule.

**Example:**
```typescript
// lib/pricing/breakEven.ts
export function computeTiers(i: PlanInputs): TierQuote[] {
  return i.tierShapes.map((shape) => {
    const retailValue = shape.services.reduce((s, svc) => s + i.prices[svc], 0);
    const monthlyFee = round2((retailValue * (1 - i.memberDiscountPct / 100)) / 12);
    const clinicGrossPerPetPerYear = monthlyFee * 12 * (1 - PLATFORM_FEE_PCT / 100);
    const breakEvenMembers = Math.ceil(i.fixedMonthlyOverhead / clinicGrossPerPetPerYear * 12);
    return { name: shape.name, retailValue, monthlyFee, clinicGrossPerPetPerYear, breakEvenMembers };
  });
}
```

### Pattern 5: Idempotent Redemption Toggle Keyed by Billing Period

**What:** Redemption rows use unique constraint `(member_id, service_key, billing_period_start)`. "Reset at each billing cycle" is not a DELETE or reset job — it's implicit: the next billing period has a different `billing_period_start`, so new rows are written without colliding with old ones.

**When to use:** Whenever a counter resets on a recurring schedule AND you need historical audit. Avoids the footgun of a cron job that resets counters the moment its time source drifts.

**Trade-offs:**
- Pro: Completely deterministic; no reset job to fail; full historical redemption log falls out for free.
- Con: The `billing_period_start` value must be populated from the CURRENT subscription period when the toggle fires — cache it on the member row, updated by `invoice.paid` webhook.

**Example:**
```sql
CREATE TABLE redemptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES clinics(id),
  member_id uuid NOT NULL REFERENCES members(id),
  service_key text NOT NULL,
  billing_period_start timestamptz NOT NULL,
  redeemed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (member_id, service_key, billing_period_start)
);
```
```typescript
// Toggle is an UPSERT; double-clicks collapse; races resolve at the unique index.
await db.insert(redemptions).values({ memberId, serviceKey, billingPeriodStart: member.currentPeriodStart, clinicId })
  .onConflictDoNothing();
```

### Pattern 6: Async Fan-Out (Webhook → Queue → PDF + Email)

**What:** The `invoice.paid` handler for a first-period enrollment does three things: (1) mark member active, (2) enqueue `send-welcome-packet`, (3) enqueue `notify-owner-new-enrollment`. It returns 200 in well under a second. The queue workers render the PDF (expensive), attach it to the Resend email, and send.

**When to use:** Always for webhook-triggered side effects that exceed ~500ms. Stripe retries on non-2xx, and blocking on PDF generation inside the handler means a cold Lambda can time out and double-bill.

**Trade-offs:**
- Pro: Webhook stays fast; slow work is retryable independently; email failures don't re-trigger Stripe retries.
- Con: Needs a queue (pg-boss is fine for MVP — Postgres-backed, no extra infra).

## Data Flow

### Enrollment Flow (the happy path)

```
Pet owner opens pawplan.app/{slug}/enroll (SSR, no auth)
    ↓
Picks tier, clicks "Start Membership"
    ↓
Server action → Stripe Checkout session
  (mode: subscription, transfer_data.destination, application_fee_percent)
    ↓
Stripe-hosted Checkout page collects card
    ↓
On success → redirect to /{slug}/enroll/success
    ↓
(async) Stripe fires checkout.session.completed → webhook
    ↓
Webhook writes member row (status: pending_first_payment)
    ↓
(async) Stripe fires invoice.paid → webhook
    ↓
Handler: member.status = active, cache current_period_start/end on member row
    ↓
Enqueue: send-welcome-packet (PDF + email to pet owner)
Enqueue: notify-owner-new-enrollment (email to clinic)
    ↓
Workers render + send
    ↓
Webhook returns 200 within ~100ms (long before workers finish)
```

### Connect Onboarding Flow

```
Owner signs up → creates clinic row (stripe_account_id = null, published = false)
    ↓
Clicks "Connect payouts" → POST /api/stripe/connect/onboard
    ↓
Server: stripe.accounts.create({ type: 'express', ... }) → account.id saved to clinic
Server: stripe.accountLinks.create({ account, type: 'account_onboarding', ... }) → url
    ↓
Redirect owner to Stripe-hosted onboarding
    ↓
Owner completes (may bounce back and forth multiple times — account links are one-shot)
    ↓
Stripe fires account.updated repeatedly as requirements are met
    ↓
Webhook: if charges_enabled && payouts_enabled && details_submitted:
         → clinic.onboarding_complete = true
         → unlock Publish button in dashboard
```

### Publish Flow

```
Owner in builder → completes 8 questions → sees tier preview (client-side computeTiers)
    ↓
Clicks Publish
    ↓
Server action:
  1. Re-run computeTiers SERVER-SIDE (canonical) — reject if client sent tampered values
  2. For each tier, create Stripe Product + Price on PLATFORM account
     (not on connected account — destination charges require prices on platform)
  3. Persist tier rows with stripe_price_id
  4. Set clinic.published_at = now()
  5. revalidateTag(`clinic:${slug}`) so the enrollment page refreshes
    ↓
Owner sees public URL, copies, shares
```

### Failed Payment Flow

```
Stripe retries card → fails → fires invoice.payment_failed
    ↓
Webhook: member.payment_failed_flag = true, last_failure_at = now
    ↓
Enqueue: send-payment-failed-email (to pet owner, with update-payment-method URL)
    ↓
Dashboard renders red badge on member row
    ↓
Either: client updates card → Stripe retries succeed → invoice.paid clears flag
Or:     retries exhausted → customer.subscription.deleted → member.status = lapsed
```

### State Management (client-side)

```
Builder form state (local React state / useReducer)
    ↓ (on every input change)
computeTiers() — pure, synchronous, sub-millisecond
    ↓
Tier preview re-renders instantly (the "feel" that earns trust)
    ↓ (on Publish)
Server action → server re-computes → persists → returns canonical tiers
    ↓
Client replaces local state with server result (single source of truth post-publish)
```

## Scaling Considerations

| Scale | Architecture Adjustments |
|-------|--------------------------|
| **0-50 clinics** | Monolith on Vercel/Fly; single Postgres (Neon/Supabase); pg-boss in same DB. No changes needed. |
| **50-500 clinics** | Add read replica for dashboard queries; move pg-boss workers to dedicated container; introduce webhook event buffering if Stripe traffic spikes during billing peaks. |
| **500-5000 clinics** | Split webhook handler to its own deploy (isolate from dashboard latency); partition `redemptions` and `invoices` tables by `clinic_id` hash or by month; move queue to a dedicated Redis/Inngest setup. |
| **5000+ clinics** | Regional Postgres sharding by clinic geography; pre-compute dashboard metrics into materialized views refreshed by webhook triggers. |

### Scaling Priorities

1. **First bottleneck: webhook handler latency during billing-cycle peaks.** All clinics tend to have members who enrolled on similar calendar days (month-start is a hot zone). Fix: never do synchronous work in the handler — queue everything.
2. **Second bottleneck: dashboard aggregation queries (MRR, ARR, 30-day forecast).** These scan the members table per clinic. Fix: composite index on `(clinic_id, status, next_billing_date)` and eventually materialized views refreshed on `invoice.paid`.
3. **Third bottleneck: Stripe API rate limits on bulk ops.** If the product ever adds backfill/migration flows, use Stripe's bulk APIs and respect 100 req/s default limit.

## Anti-Patterns

### Anti-Pattern 1: Computing break-even math server-only (loses "instant" feel)

**What people do:** Debounce sliders and fire a server action on every builder input, waiting 200-500ms round-trip to show updated break-even numbers.
**Why it's wrong:** The riskiest assumption is owner trust in the math. A laggy calculator feels like a consultant's spreadsheet, not a confidence tool. Owners pause, doubt, abandon.
**Do this instead:** Pure function that runs in the browser for preview. Server re-runs the same pure function at Publish for canonical persistence. Identical code path; zero divergence risk.

### Anti-Pattern 2: Storing Stripe objects on the connected account (direct charges)

**What people do:** Use direct charges with `Stripe-Account` header everywhere — customers, subscriptions, invoices all live on the clinic's account.
**Why it's wrong:** The owner dashboard needs to show MRR across all of a clinic's members. That's one API call. Across ALL clinics for platform analytics, that's N calls. More importantly, cross-clinic queries (e.g., "show me churn trends across all clinics this month") are impossible without pulling every account separately.
**Do this instead:** Destination charges. Customer/Subscription/Invoice live on the platform account with `transfer_data.destination = clinic.stripe_account_id`. Platform is merchant of record; funds flow to the clinic automatically; queries stay local.

### Anti-Pattern 3: Filtering by clinic_id in WHERE clauses only

**What people do:** Every query reads `WHERE clinic_id = ?` — no RLS. "We'll be careful."
**Why it's wrong:** One forgotten filter in one admin screen = cross-tenant data leak. In a vet-clinic product, that is a material breach of trust and potentially a HIPAA-adjacent state law issue.
**Do this instead:** Enable RLS on every tenant-scoped table from migration #1. Set `app.current_clinic_id` as a session GUC at the start of every transaction. Composite indexes with `clinic_id` as leading column.

### Anti-Pattern 4: Doing PDF generation inside the webhook handler

**What people do:** `invoice.paid` handler renders the welcome packet, attaches it, calls Resend, returns.
**Why it's wrong:** PDF rendering with `@react-pdf/renderer` can easily take 500ms-2s. Resend can be slow during outages. Stripe times out webhooks at 10s for hosted deliveries; serverless cold starts eat into that budget. A single slow send causes retries, duplicate emails, and 30x billing storms.
**Do this instead:** Webhook logs the event, enqueues jobs, returns 200 in <200ms. Workers do PDF + email asynchronously with their own retry policy.

### Anti-Pattern 5: Resetting redemption counters on a cron

**What people do:** Nightly job scans members, checks if billing period rolled over, zeroes redemption counters.
**Why it's wrong:** Cron drift, timezone mistakes, DST transitions, rerun-on-failure, or a pet owner whose billing period ends at 02:17 AM — all lead to counters reset at the wrong moment. Worst case: staff toggles a service, cron zeroes it 30 seconds later, clinic gives the service away twice.
**Do this instead:** Include `billing_period_start` in the redemption row's unique key. A new period = new rows; old rows are historical. No reset job exists.

### Anti-Pattern 6: Trusting the Stripe onboarding-return URL as "done"

**What people do:** Redirect after Stripe onboarding → mark clinic as `payouts_ready = true`.
**Why it's wrong:** Stripe docs are explicit: the return URL means the user EXITED the flow, not that all requirements are satisfied. Owner may have clicked back or skipped a required field.
**Do this instead:** Only flip the "can publish" flag in the `account.updated` webhook when `charges_enabled && payouts_enabled && details_submitted`. The return URL just takes the owner back to the dashboard; the dashboard shows "verifying..." until the webhook arrives.

## Integration Points

### External Services

| Service | Integration Pattern | Notes |
|---------|---------------------|-------|
| **Stripe Connect** | REST via `stripe` SDK; Express account per clinic; single Connect webhook endpoint | Always set `expand: ['latest_invoice.payment_intent']` when creating subs if you need to react inline |
| **Stripe Checkout** | Hosted redirect with `mode: subscription`; `transfer_data.destination` for Connect | Store `metadata.clinic_id` and `metadata.tier_id` — these are the join keys in the webhook handler |
| **Resend** | REST via `resend` SDK; `react` prop accepts JSX directly; `attachments: [{ filename, content }]` with base64 content for the PDF | Keep sending domain warm (send a low-volume heartbeat if weeks go by without emails) |
| **@react-pdf/renderer** | Server-side render to Buffer, base64-encode for Resend attachment | Cold-start cost is real — run in a dedicated worker, not inline |
| **Postgres (Neon/Supabase)** | Drizzle ORM; every request wrapped in `withClinic(id, fn)` for RLS session setter | Connection pooler must be PgBouncer in transaction mode — session mode breaks `SET LOCAL` |
| **Object Storage (logos)** | Direct browser upload via signed URL; store `logo_url` on clinic row | Small files — S3/R2/Supabase Storage all equivalent |
| **pg-boss (queue)** | Postgres-backed; share the app DB for MVP; separate schema `pgboss` | Graduates to Inngest/SQS only when workers outgrow the DB |

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| **Dashboard → Plan Builder Service** | Server actions | Re-uses same validation schema (Zod) as client form; rejects tampered values |
| **Builder client ↔ Break-Even Calculator** | Direct function import | Must remain pure; no async; no I/O |
| **Webhook Handler → Workers** | pg-boss `send` + `work` | Job payload contains `eventId`; workers load full event from DB to avoid stale data |
| **Worker → Stripe API** | `stripe` SDK with `Stripe-Account` header for connected-account ops | Use idempotency keys for all mutating calls |
| **Tenant Context → DB** | `SET LOCAL app.current_clinic_id` per transaction | Enforced at the connection-factory level so developers cannot forget |
| **Auth Middleware → Dashboard pages** | Cookie session → loaded into request context | Dashboard layout reads session, calls `withClinic(session.clinicId, ...)` |
| **Public enrollment page → Tenant Context** | URL slug → `clinics WHERE slug = ?` → clinic_id | Only clinics with `published_at IS NOT NULL` are resolvable publicly |

## Suggested Build Order

Dependencies flow top-to-bottom. Each phase's DoD is the demo-ship gate ("one real clinic, one real member, one cleared charge") getting incrementally closer.

### Phase 1 — Foundations (no Stripe yet)
1. Next.js App Router scaffold with route groups
2. Drizzle schema: `clinics`, `users`, `plans`, `plan_tiers`, `members`, `redemptions`, `stripe_events` (idempotency), `subscription_mirror`
3. RLS policies on every tenant-scoped table; `withClinic()` connection wrapper
4. Auth (email/password, session cookie)
5. Owner dashboard shell with middleware-enforced auth
6. Marketing page stub

**Why first:** Nothing downstream works without tenant isolation enforced at the DB layer. Adding RLS later is expensive; adding it now is one migration.

### Phase 2 — Builder + Break-Even (the trust engine)
1. `lib/pricing/breakEven.ts` pure function with exhaustive unit tests
2. 8-question builder UI with per-input live recomputation
3. Draft persistence (plans / plan_tiers rows with `published_at IS NULL`)
4. No Stripe calls yet — this phase can ship end-to-end before any payment integration

**Why second:** This is the riskiest assumption. Build it, internal-test the feel, iterate on the math display, and THEN invest in payment plumbing once trust is proven.

### Phase 3 — Stripe Connect Onboarding
1. Create Express account + account link on "Connect payouts" click
2. Single Connect webhook endpoint with signature verify + idempotency store
3. `account.updated` handler: flip `onboarding_complete` when fully verified
4. Dashboard surfaces onboarding state ("verifying..." vs "ready to publish")

**Why third:** Publishing requires a destination account. No point building Publish before this works.

### Phase 4 — Publish + Public Enrollment
1. Publish server action: creates Stripe Products + Prices on platform account, persists `stripe_price_id`, sets `published_at`
2. Public enrollment page at `/{slug}/enroll` (SSR, no auth)
3. `revalidateTag` on publish/edit so page stays fresh

**Why fourth:** Owner can now get a URL. Still no charges — but the enrollment page is visible and shareable.

### Phase 5 — Checkout + Subscription Webhooks
1. Create Checkout session with `mode: subscription`, `transfer_data.destination`, `application_fee_percent`
2. `checkout.session.completed` handler → member row (status: pending_first_payment)
3. `invoice.paid` handler → member.status = active, cache current_period_start/end
4. `invoice.payment_failed` handler → flag member
5. `customer.subscription.deleted` handler → member.status = lapsed

**Why fifth:** Now the MVP loop closes end-to-end. Demo-ship gate is achievable after this phase.

### Phase 6 — Welcome Packet + Notifications
1. pg-boss queue setup
2. `@react-pdf/renderer` welcome packet template
3. `react-email` + Resend templates (welcome, owner-notification, payment-failed)
4. Jobs: `send-welcome-packet`, `notify-owner-new-enrollment`, `send-payment-failed`
5. Wire webhook handlers to enqueue

**Why sixth:** Loop already works from Phase 5; this improves the experience. Ordering this AFTER checkout keeps the critical path short.

### Phase 7 — Dashboard Metrics + Redemption
1. MRR / ARR / member-count / 30-day-forecast queries
2. Per-member row with redemption toggles
3. Redemption upsert keyed by `(member_id, service_key, billing_period_start)`
4. Owner-initiated cancellation (Stripe `subscription.update({ cancel_at_period_end: true })`)

**Why last:** These are daily-use features but none are blocking for demo-ship. Staff-facing polish after the primary loop is proven.

### Phase 8 — Post-Publish Edits + Failed-Payment UX
1. Edit plan pricing without breaking existing subs (new Stripe Prices; existing subs remain on old price unless the owner explicitly migrates)
2. Failed-payment email content + update-payment-method link
3. Owner dashboard badge for members in failed state

**Why very last:** These are refinements on top of a working system. They matter in production but not for the first live-clinic demo.

## Multi-Tenancy Isolation Summary

Three independent mechanisms stack for defense in depth:

1. **Routing isolation:** Distinct route groups — `(dashboard)` is middleware-gated; `[clinicSlug]` serves only `published_at IS NOT NULL` clinics and never reads the session.
2. **Application isolation:** `withClinic(id, fn)` wrapper is the only way to open a tenant-scoped DB transaction. It resolves the clinic_id from session (dashboard) or slug (enrollment), and sets the session GUC.
3. **Database isolation:** RLS policies on every tenant table enforce `clinic_id = current_setting('app.current_clinic_id')::uuid`. Even a raw query with no WHERE clause returns only the current clinic's rows.

Cross-clinic queries (platform analytics) run as a privileged service role with `BYPASSRLS` — explicitly opted in, never the default.

## Sources

- [Stripe Connect webhooks — Stripe Documentation](https://docs.stripe.com/connect/webhooks)
- [Using Connect with Express connected accounts — Stripe Documentation](https://docs.stripe.com/connect/express-accounts)
- [Create destination charges — Stripe Documentation](https://docs.stripe.com/connect/destination-charges)
- [Create subscriptions with Stripe Billing on Connect — Stripe Documentation](https://docs.stripe.com/connect/subscriptions)
- [Collect application fees — Stripe Documentation](https://docs.stripe.com/connect/marketplace/tasks/app-fees)
- [Using webhooks with subscriptions — Stripe Documentation](https://docs.stripe.com/billing/subscriptions/webhooks)
- [Build a marketplace (end-to-end) — Stripe Documentation](https://docs.stripe.com/connect/end-to-end-marketplace)
- [Next.js Multi-tenant Guide — Next.js Documentation](https://nextjs.org/docs/app/guides/multi-tenant)
- [Multi-tenant data isolation with PostgreSQL Row Level Security — AWS Database Blog](https://aws.amazon.com/blogs/database/multi-tenant-data-isolation-with-postgresql-row-level-security/)
- [Row Level Security for Tenants in Postgres — Crunchy Data](https://www.crunchydata.com/blog/row-level-security-for-tenants-in-postgres)
- [How I Handle Stripe Webhooks in Production — DEV Community](https://dev.to/whoffagents/how-i-handle-stripe-webhooks-in-production-the-right-way-32jd)
- [Stripe Subscription Lifecycle in Next.js (2026) — DEV Community](https://dev.to/thekarlesi/stripe-subscription-lifecycle-in-nextjs-the-complete-developer-guide-2026-4l9d)
- [Send email using Resend — React Email Documentation](https://react.email/docs/integrations/resend)
- [Stripe Checkout Session API — Application Fee Percent](https://docs.stripe.com/api/checkout/sessions/create)

---
*Architecture research for: Multi-tenant SaaS with Stripe Connect Express marketplace*
*Researched: 2026-04-23*
