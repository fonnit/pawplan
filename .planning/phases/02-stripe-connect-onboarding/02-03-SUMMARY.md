---
phase: 02-stripe-connect-onboarding
plan: 03
subsystem: stripe-routes-ui
tags: [stripe, connect, webhook, dashboard, routes, onboarding]
requires: [02-01, 02-02]
provides: [PUB-01, PUB-02]
affects: [phase-3-publish, phase-4-enrollment]
tech-stack:
  added: []
  patterns:
    - "Server action + JSON route parity: startConnectOnboarding (form action for SSR forms) and POST /api/stripe/connect/link (JSON response for client JS) share the same create-or-resume path; neither duplicates the other's logic — both call createConnectAccount + createAccountLink + persistAccountSnapshot."
    - "Dashboard onboarding surface is state-driven, not URL-driven. `?stripe=return|refresh` only triggers a belt-and-suspenders pull from Stripe; the rendered UI reads from clinic.stripeOnboardingState which is written authoritatively by the webhook."
    - "Single Connect webhook endpoint receives both platform and connected-account events. Stripe tags connected-account events with a top-level `account` field; platform events omit it. Dispatch is by event.type, scope is by event.account."
    - "Publish button gating uses shared isPublishReady — same predicate as Phase 3 server publish action will use, so UI enablement and server enforcement can't drift."
key-files:
  created:
    - src/lib/stripe/connect.ts
    - src/app/actions/stripe.ts
    - src/app/api/stripe/connect/link/route.ts
    - src/app/api/stripe/connect/refresh/route.ts
    - src/app/api/stripe/webhook/route.ts
    - src/components/dashboard/stripe-connect-card.tsx
    - src/components/dashboard/onboarding-banner.tsx
    - src/components/dashboard/publish-button.tsx
    - src/components/ui/tooltip.tsx
    - src/lib/stripe/types.test.ts
  modified:
    - src/app/(dashboard)/dashboard/page.tsx
decisions:
  - "Dashboard renders at most one Connect surface per state: connect card (not_started) OR banner (in_progress / action_required / restricted) OR nothing (complete). Publish button is always present so the owner sees the gate even in not_started."
  - "syncConnectStatus runs BEFORE reading the clinic row on the same request, so `?stripe=return` reflects authoritative Stripe state without a page refresh."
  - "getPublishBlockedReason pattern-matches requirement keys (`external_account`, `*verification*`) to produce owner-readable English. Generic fallback cites the count of items due."
  - "Publish button tooltip hangs on a span wrapper because native <button disabled> doesn't fire hover events on Safari — same pattern shadcn recommends."
metrics:
  duration: ~15m
  completed: 2026-04-23
---

# Phase 02 Plan 03: Connect routes + dashboard UI Summary

Wires Stripe Connect Express onboarding end-to-end: server routes to create accounts + AccountLinks, the webhook handler that persists `account.updated` events idempotently, and the dashboard UI that surfaces all five onboarding states and gates the Publish button with an actionable reason. Closes PUB-01 + PUB-02.

## What shipped

**Server:**
- `src/lib/stripe/connect.ts` — createConnectAccount, createAccountLink, accountToSnapshot, persistAccountSnapshot, getPublishBlockedReason
- `src/app/actions/stripe.ts` — startConnectOnboarding (server action), syncConnectStatus (defensive pull)
- `src/app/api/stripe/connect/link/route.ts` — POST → 200 { url } | 401 | 404
- `src/app/api/stripe/connect/refresh/route.ts` — POST → 200 { url } | 401 | 400
- `src/app/api/stripe/webhook/route.ts` — POST, Node runtime, force-dynamic. Verify → idempotent insert → dispatch on account.updated → 200.

**UI:**
- `src/components/dashboard/stripe-connect-card.tsx` — server component, `not_started` state.
- `src/components/dashboard/onboarding-banner.tsx` — client component, `in_progress` / `action_required` / `restricted` states. Lists currently_due, Resume button posts to /api/stripe/connect/refresh.
- `src/components/dashboard/publish-button.tsx` — tooltip on disabled wrapper. Consumes `canPublish` + `blockedReason`.
- `src/components/ui/tooltip.tsx` — shadcn-style wrapper around radix-ui Tooltip primitive (not previously installed).
- `src/app/(dashboard)/dashboard/page.tsx` — extends existing draft flow: Connect surface above, draft card / empty state below, PublishButton under the draft when present.

## Tests

- 5 new `isPublishReady` cases + 5 new `deriveOnboardingState` cases in `src/lib/stripe/types.test.ts` — covers all 5 enum states.
- Full suite: **71 tests passing**, 0 failing.
- `pnpm typecheck` → exit 0
- `pnpm build` → Compiled successfully; new routes visible in Route map (`/api/stripe/connect/link`, `/api/stripe/connect/refresh`, `/api/stripe/webhook`).

## Manual verification — NOT executed in-sandbox

The `STRIPE_WEBHOOK_SECRET` in `.env.local` is `whsec_LOCAL_PLACEHOLDER_...` (satisfies the Zod regex `/^whsec_/` so env validation passes; the env var itself isn't "broken") but does NOT match what Stripe will sign with. Live webhook verification will 400 until Daniel:

1. `stripe login` (test-mode).
2. `stripe listen --forward-to localhost:3000/api/stripe/webhook`
3. Copy the printed `whsec_…` secret into `.env.local` (replacing the placeholder).
4. Restart `pnpm dev`.

Then these two moments become observably true:

**Idempotency verification (plan §9):**
```
stripe trigger account.updated --override account:capabilities[card_payments]=active
# Note the event_id printed.
stripe events resend <event_id>  # run 5 times
```
Expect: exactly 1 `StripeEvent` row (PK collision on subsequent sends), Clinic.stripeCapabilitiesAt updated once.

**Abandoned-onboarding verification (plan §10):**
1. From dashboard at state=not_started, click "Connect Stripe".
2. On Stripe hosted onboarding, fill business info but NOT bank info; close tab.
3. Return to /dashboard — webhook fires account.updated with currently_due containing `external_account`.
4. Banner reads "Your Stripe account needs bank info." and lists `external account` as the only currently_due item. Publish button is disabled with the same reason as tooltip text.
5. Click "Resume onboarding" — routes back to a fresh AccountLink (old one would have expired after 5 min).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Next.js 16 typed-routes reject external URL in redirect()**
- **Found during:** Task 1 typecheck
- **Issue:** Plan code called `redirect(link.url)` where `link.url` is an external `https://connect.stripe.com/…` string. Next 16's typed-routes narrow `redirect()` to `RouteImpl<string>` which only accepts known internal paths. Compile error.
- **Fix:** Cast the Stripe URL to `never` on the redirect call — the URL is sourced directly from Stripe's API response (not user input), so there's no open-redirect risk. Documented in the call site comment.
- **Files modified:** `src/app/actions/stripe.ts`
- **Commit:** folded into Task 1 commit.

**2. [Rule 2 - Missing functionality] Tooltip shadcn component not pre-installed**
- **Found during:** Task 2 typecheck of publish-button.tsx
- **Issue:** Plan imported `@/components/ui/tooltip` (Tooltip/TooltipContent/TooltipTrigger/TooltipProvider), but the component wasn't in `src/components/ui/`. Plan suggested `pnpm dlx shadcn@latest add tooltip` as a fallback.
- **Fix:** Wrote `src/components/ui/tooltip.tsx` by hand using the project's established `radix-ui` meta-package import pattern (matching `dropdown-menu.tsx` style — `import { Tooltip as TooltipPrimitive } from 'radix-ui'`). Avoids network round-trip to shadcn's CLI and keeps the new component consistent with the rest of `src/components/ui`.
- **Files modified:** `src/components/ui/tooltip.tsx` (new)
- **Commit:** folded into Task 2 commit.

**3. [Rule 2 - Missing test coverage] `isPublishReady` + `deriveOnboardingState` weren't unit-tested**
- **Found during:** Final deliverable review (`deliverables` requires "isPublishReady at least 4 cases: all-caps set, missing bank, missing charges, restricted")
- **Issue:** Plan 02-01 and 02-02 shipped the helpers in types.ts but didn't author unit tests for them — signature verification was the explicit TDD target. Without tests, the publish predicate relies on downstream usage for correctness, which is too loose for a gate that controls monetization.
- **Fix:** Added `src/lib/stripe/types.test.ts` with 10 cases: 5 for isPublishReady (covering all-capabilities-set, missing payouts, missing charges, restricted, both-off) and 5 for deriveOnboardingState (one per enum variant).
- **Files modified:** `src/lib/stripe/types.test.ts` (new)
- **Commit:** folded into Task 2 commit.

### Auth Gates

**STRIPE_WEBHOOK_SECRET is a placeholder.** Unit tests pass because they use a local TEST_SECRET override. Live webhook reception needs `stripe listen` to mint a real `whsec_…` — documented above as expected behaviour for Phase 2 exit. The manual-verification steps are documented here in the SUMMARY and not re-run by the executor.

## Commits

- `feat(phase-02): 02-03 - Connect helper + link/refresh routes + onboarding server action`
- `feat(phase-02): 02-03 - webhook route + dashboard Connect UI with publish gating`

## Self-Check: PASSED

- `src/app/api/stripe/webhook/route.ts` — FOUND (verifyWebhookSignature, recordEvent, runtime='nodejs')
- `src/app/api/stripe/connect/link/route.ts` — FOUND
- `src/app/api/stripe/connect/refresh/route.ts` — FOUND
- `src/lib/stripe/connect.ts` — FOUND (createConnectAccount, createAccountLink, persistAccountSnapshot, getPublishBlockedReason)
- `src/components/dashboard/{stripe-connect-card,onboarding-banner,publish-button}.tsx` — FOUND
- `src/components/ui/tooltip.tsx` — FOUND
- dashboard/page.tsx grep-matches `isPublishReady`, `stripe=return`
- `pnpm typecheck` + `pnpm build` + `pnpm test` — all green (71/71)
