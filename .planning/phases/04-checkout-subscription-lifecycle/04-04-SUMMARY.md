---
phase: 04-checkout-subscription-lifecycle
plan: 04
subsystem: dashboard
tags: [dashboard, members, cancellation, past-due, stripe, server-actions]
requires: [04-01, 04-02, 04-03]
provides:
  - /dashboard/members page with filter + cancel
  - listMembers + cancelMember server actions
  - cancelSubscriptionAtPeriodEnd helper
affects:
  - src/app/(dashboard)/dashboard/members/page.tsx
  - src/app/(dashboard)/dashboard/members/members-table.tsx
  - src/app/actions/members.ts
  - src/lib/stripe/cancel-subscription.ts
  - src/components/dashboard/sidebar.tsx
tech-stack:
  added: []
  patterns:
    - Stable idempotency key on Stripe cancel (no time bucket — repeat cancel = no-op)
    - Optimistic canceledAt write UX (webhook confirms status flip at period end)
    - PII-minimizing output shape (MemberRow never exposes stripeCustomerId/SubId)
    - Past-due-first sort with nulls-last on paymentFailedAt (DASH-03 surfaces flagged members)
key-files:
  created:
    - src/app/(dashboard)/dashboard/members/page.tsx
    - src/app/(dashboard)/dashboard/members/members-table.tsx
    - src/app/actions/members.ts
    - src/app/actions/members.test.ts
    - src/lib/stripe/cancel-subscription.ts
    - src/lib/stripe/cancel-subscription.test.ts
  modified:
    - src/components/dashboard/sidebar.tsx
decisions:
  - Inline confirm-then-cancel (no modal) — lighter-weight, matches desktop-operator workflow
  - Filter UI = pill buttons (no URL query state in v1) — per-session, fine for typical use
  - Status badge color family picked from existing PawPlan palette (sage/clay/terracotta-adjacent)
  - cancelMember is transactional: Stripe call first, THEN Member.canceledAt write
  - Stable idempotency key `cancel:{sub}:v1` means repeat cancel = Stripe no-op, never double-writes
metrics:
  duration: ~8m
  completed: 2026-04-23
---

# Phase 4 Plan 04: Dashboard Members + Cancellation Summary

Closes the Phase 4 loop — past_due flags set by webhook handlers (04-03) are now visible + filterable, and owners can cancel memberships with a confirm-then-commit UX.

## Page: `/dashboard/members`

- Server component (`page.tsx`) calls `listMembers()` (RSC).
- Client component (`members-table.tsx`) renders filter pills, table, inline confirm dialog.
- Empty-state copy invites sharing the enrollment link.
- Sidebar link (Users icon) added and active-prefix logic disambiguated between Plans / Members / Profile.

## Server actions

### `listMembers(): Promise<MemberRow[]>`
- Auth-gated via local `requireClinic()` (mirrors plans.ts pattern).
- RLS-wrapped in `withClinic(clinicId)`.
- Sorts `paymentFailedAt DESC NULLS LAST, enrolledAt DESC`.
- Output shape: `MemberRow` (id, petName, species, ownerEmail, tierName, status, enrolledAt, currentPeriodEnd, paymentFailedAt, canceledAt). NOTE: `stripeCustomerId` + `stripeSubscriptionId` are deliberately OMITTED to minimize PII surface on the client bundle (T-04-04-02).

### `cancelMember(memberId): Promise<CancelMemberResult>`
Result union:
```ts
{ ok: true; canceledAt: Date }
| { ok: false; code: 'not_found' | 'already_canceled' | 'stripe_error'; error: string }
```
Flow:
1. `requireClinic()` resolves session → clinicId.
2. `withClinic(clinicId, tx => tx.member.findUnique({ id }))` — RLS rejects cross-tenant memberIds → `not_found`.
3. Short-circuit `already_canceled` if `canceledAt` is set.
4. `cancelSubscriptionAtPeriodEnd(subId)` — Stripe call. On throw → `stripe_error`, canceledAt NOT written.
5. On success: write `canceledAt = new Date()` inside a second `withClinic` tx.
6. `revalidatePath('/dashboard/members')`.

### `cancelSubscriptionAtPeriodEnd(subId)`
- `stripe.subscriptions.update(id, { cancel_at_period_end: true }, { idempotencyKey: 'cancel:{id}:v1' })`.
- NO `stripeAccount` header (platform-scoped, destination-charge pattern).
- Stable idempotency key — double-click = Stripe-side no-op.

## Optimistic cancellation UX

- Owner clicks Cancel → inline "Confirm cancel / Nevermind" buttons appear.
- On Confirm: `useTransition` → server action → toast + local `setMembers` to reflect canceledAt.
- Row shows `Cancels {currentPeriodEnd}` sub-label while `canceledAt != null && status != 'canceled'`.
- Status flips to `canceled` only when `customer.subscription.deleted` webhook arrives (plan 04-03 handler preserves earlier owner-click timestamp).

## Verification

- `pnpm exec vitest run src/lib/stripe/cancel-subscription.test.ts src/app/actions/members.test.ts` → 10/10
- Full suite: 141/141
- `pnpm exec tsc --noEmit` → clean
- `pnpm build` → succeeds with `/dashboard/members` listed

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Route-group path mismatch**
- **Found during:** Task 2 scaffolding
- **Issue:** Plan specified `src/app/(dashboard)/members/page.tsx` but the `(dashboard)` route-group segment is invisible to URLs. Putting the file there would produce a `/members` URL, not `/dashboard/members`. Existing `/dashboard` sub-pages live under `src/app/(dashboard)/dashboard/*`.
- **Fix:** Created files under `src/app/(dashboard)/dashboard/members/`. Functional path is `/dashboard/members` as intended.
- **Files affected:** `page.tsx`, `members-table.tsx`

**2. [Rule 3 - Blocking] Stale typed-routes cache**
- **Found during:** tsc check after sidebar edit
- **Issue:** Added `<Link href="/dashboard/members">` but `.next/types/routes.d.ts` was last built before the route existed, so `typedRoutes` rejected the string.
- **Fix:** Cast `href: '/dashboard/members' as Route`. `pnpm build` regenerates the route set and the cast becomes belt-and-braces (still passes). Comment explains the rationale.
- **Files modified:** `src/components/dashboard/sidebar.tsx`

## Phase 5 Follow-ups

- **NOTIF-01..04** (subscription-canceling email, owner new-enrollment email, welcome packet PDF) are Phase 5 scope. Dashboard v1 confirms cancel via toast + UI state only; email delivery comes next.
- **Pagination** on the members list (> 500 members) — Phase 6 (T-04-04-04 accepted for v1).
- **Audit log** of cancellation clicks — Phase 6 (T-04-04-06 accepted for v1; Stripe's own event log provides the partial paper trail).

## Commits

- `4e8f7a0` test(phase-04): plan 04 task 1 RED - cancel-subscription + members server actions
- `9ea2b3c` feat(phase-04): plan 04 task 1 GREEN - cancel-subscription + members server actions
- `b4c23df` feat(phase-04): plan 04 task 2 - /dashboard/members page + members-table + sidebar entry

## Self-Check: PASSED

All files exist, all tests pass, tsc clean, build succeeds, route registered in typed-routes.
