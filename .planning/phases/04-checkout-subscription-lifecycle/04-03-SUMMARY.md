---
phase: 04-checkout-subscription-lifecycle
plan: 03
subsystem: webhook-dispatch
tags: [stripe, webhooks, idempotency, subscription-lifecycle]
requires: [04-01]
provides:
  - checkout.session.completed handler (creates Member)
  - invoice.paid handler (refreshes currentPeriodEnd, clears past_due)
  - invoice.payment_failed handler (flags past_due, ZERO email/queue imports — PAY-05)
  - customer.subscription.deleted handler (sets canceled + preserves owner-click canceledAt)
  - WEBHOOK_HANDLERS dispatch table
affects:
  - src/lib/stripe/webhook-handlers/*.ts (7 new files)
  - src/app/api/stripe/webhook/route.ts (dispatch extended)
  - src/app/api/stripe/webhook/route.replay.test.ts (new 5x replay test)
  - .planning/phases/04-checkout-subscription-lifecycle/manual-smoke.md (new operator doc)
tech-stack:
  added: []
  patterns:
    - Dispatch table pattern (WEBHOOK_HANDLERS map) — one-line addition for new events
    - StripeEvent idempotency guard at route level + composite unique index at DB level
    - vi.hoisted() for module-level mocks that vi.mock factory needs to see
    - Optimistic-click-preserving merge for canceledAt (webhook never overwrites earlier timestamp)
key-files:
  created:
    - src/lib/stripe/webhook-handlers/checkout-completed.ts
    - src/lib/stripe/webhook-handlers/checkout-completed.test.ts
    - src/lib/stripe/webhook-handlers/invoice-paid.ts
    - src/lib/stripe/webhook-handlers/invoice-paid.test.ts
    - src/lib/stripe/webhook-handlers/invoice-payment-failed.ts
    - src/lib/stripe/webhook-handlers/invoice-payment-failed.test.ts
    - src/lib/stripe/webhook-handlers/customer-subscription-deleted.ts
    - src/lib/stripe/webhook-handlers/customer-subscription-deleted.test.ts
    - src/lib/stripe/webhook-handlers/index.ts
    - src/app/api/stripe/webhook/route.replay.test.ts
    - .planning/phases/04-checkout-subscription-lifecycle/manual-smoke.md
  modified:
    - src/app/api/stripe/webhook/route.ts
decisions:
  - checkout.session.completed is the sole Member-creation event (NOT customer.subscription.created)
  - 2026-03-25.dahlia API: current_period_end moved to subscription.items.data[0] — handlers read from nested path
  - 2026-03-25.dahlia API: invoice.subscription moved to invoice.parent.subscription_details.subscription — shared helper extracts
  - invoice-payment-failed has ZERO email/queue imports (PAY-05 defense enforced by in-source grep test)
  - Earliest-canceledAt wins on subscription.deleted (preserves owner's click timestamp over billing-period-end)
  - Missing member on invoice events = race, NOT error (log info, return 200)
metrics:
  duration: ~12m
  completed: 2026-04-23
---

# Phase 4 Plan 03: Webhook Dispatcher Summary

Four handlers + dispatch table that implement the complete Member state machine. Every transition is idempotent on `event.id` (route level) and on `(clinicId, stripeSubscriptionId)` (DB level).

## State Machine

| Stripe Event                      | Member Transition                                          |
|-----------------------------------|------------------------------------------------------------|
| `checkout.session.completed`      | (none) → `active` (upsert; refreshes on replay)            |
| `invoice.paid`                    | `past_due` → `active`, clear `paymentFailedAt`, refresh    |
| `invoice.payment_failed`          | `active` → `past_due`, set `paymentFailedAt`               |
| `customer.subscription.deleted`   | any → `canceled`, set `canceledAt` (preserving earliest)   |

## Handler Contract

Each handler:
- Takes a `Stripe.Event`.
- Reads from `event.data.object` (typed via `as Stripe.X`).
- Performs any required BYPASSRLS lookup (to resolve Clinic id from subscription id).
- Wraps the write in `withClinic(clinicId, tx)`.
- Is idempotent — replay is safe (composite unique + route-level dedup via StripeEvent).
- Returns `void` on success; throws on truly broken payloads (route catches → `markEventFailed` → 500 so Stripe retries).

## Dispatch

`src/lib/stripe/webhook-handlers/index.ts` exports `WEBHOOK_HANDLERS: Record<string, (evt) => Promise<void>>`.

`src/app/api/stripe/webhook/route.ts` dispatches:
- `account.updated` → inline (publish-gate critical path)
- Other → `WEBHOOK_HANDLERS[event.type] ?? no-op`

Future phases extend by adding `{ 'event.type': handleFoo }` in `index.ts`.

## Verification

- `pnpm exec vitest run src/lib/stripe/webhook-handlers` → 21/21
- `pnpm exec vitest run src/app/api/stripe/webhook/route.replay.test.ts` → 1/1
- Full suite: 131/131 (no regressions)
- `pnpm exec tsc --noEmit` → clean
- `grep -iE "resend|@react-email|sendEmail|pg-boss|\bqueue\b" src/lib/stripe/webhook-handlers/invoice-payment-failed.ts` → 0 matches
- Manual smoke (deferred to operator): `.planning/phases/04-checkout-subscription-lifecycle/manual-smoke.md`

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Stripe 2026-03-25 API relocates subscription-end fields**
- **Found during:** Task 1 GREEN implementation
- **Issue:** Plan's example code referenced `subscription.current_period_end` and `invoice.subscription`, but the pinned API version `2026-03-25.dahlia` moved these:
  - `current_period_end` is now on `subscription.items.data[i].current_period_end` (per-item)
  - `invoice.subscription` is now on `invoice.parent.subscription_details.subscription`
- **Fix:** Read current_period_end from `subscription.items.data[0].current_period_end` in `checkout-completed.ts`. Extract invoice→subscription via a shared local `extractSubscriptionId(invoice)` helper that walks `invoice.parent.subscription_details.subscription` in `invoice-paid.ts` and `invoice-payment-failed.ts`.
- **Files modified:** `checkout-completed.ts`, `invoice-paid.ts`, `invoice-payment-failed.ts`
- **Commit:** `0dbb01e`

**2. [Rule 1 - Bug] vi.mock factory can't reference non-hoisted variables**
- **Found during:** First test run after handlers landed
- **Issue:** `vi.mock('@/lib/db', () => ({ prisma: { member: { findUnique: mockFindUnique } } }))` threw `ReferenceError: Cannot access 'mockFindUnique' before initialization` — vitest hoists `vi.mock` above all top-level declarations.
- **Fix:** Wrap mock fns in `vi.hoisted(() => ({ mockFindUnique: vi.fn(), ... }))` for all four test files.
- **Files modified:** four `*.test.ts` files under `src/lib/stripe/webhook-handlers/`
- **Commit:** `0dbb01e`

**3. [Rule 1 - Bug] Stripe namespace not a TS namespace for Session.CustomField**
- **Found during:** Task 1 tsc check
- **Issue:** `Stripe.Checkout.Session.CustomField` and `Stripe.Checkout.Session.CustomerDetails` throw `TS2713` because `Stripe.Checkout.Session` is a type, not a namespace, in v22.0.2.
- **Fix:** Use `Stripe.Checkout.Session['custom_fields']` and `Stripe.Checkout.Session['customer_details']` indexed-access. Defined a local `type CheckoutCustomField = NonNullable<Stripe.Checkout.Session['custom_fields']>[number]` in `checkout-completed.ts`.
- **Files modified:** `checkout-completed.ts`, `checkout-completed.test.ts`
- **Commit:** `0dbb01e`

**4. [Rule 1 - Bug] PAY-05 grep-guard regex also matched inline comment**
- **Found during:** First GREEN test run
- **Issue:** Comment said "NO queue enqueue", which matches `/\bqueue\b/i` in the in-source grep guard.
- **Fix:** Reworded comment to "ZERO background-job enqueue" while still communicating the invariant. Grep now clean.
- **Files modified:** `invoice-payment-failed.ts`
- **Commit:** `0dbb01e`

## Commits

- `be3b9d1` test(phase-04): plan 03 task 1 RED - four webhook handler contracts
- `0dbb01e` feat(phase-04): plan 03 task 1 GREEN - 4 webhook handlers + dispatch table
- `b18cd47` feat(phase-04): plan 03 task 2 - wire WEBHOOK_HANDLERS + 5x replay test + manual smoke doc

## Self-Check: PASSED

All files exist, all tests pass, tsc clean, PAY-05 grep clean, replay test asserts exactly-once dispatch.
