---
phase: 02-stripe-connect-onboarding
plan: 02
subsystem: stripe-client
tags: [stripe, webhook, signature, idempotency, zod-env]
requires: [02-01]
provides: [PUB-02-verify]
affects: [02-03]
tech-stack:
  added:
    - "stripe@22.0.2 (already in package.json from scaffolding — verified exact pin)"
  patterns:
    - "Singleton Stripe client module pinned to apiVersion 2026-03-25.dahlia — every server-side Stripe call imports from @/lib/stripe/client."
    - "Webhook signature verified BEFORE any DB work; missing-header check short-circuits so Stripe is never called with junk input."
    - "Idempotency by PK-collision: recordEvent() does a direct INSERT and catches Prisma P2002 as the duplicate signal — no pre-read, no race."
    - "Prisma error detection by string code match (`err.code === 'P2002'`) avoids importing PrismaClientKnownRequestError to keep the module edge-compatible."
key-files:
  created:
    - src/lib/stripe/client.ts
    - src/lib/stripe/webhook.ts
    - src/lib/stripe/webhook.test.ts
  modified:
    - src/lib/env.ts
    - .env.example
decisions:
  - "STRIPE_API_VERSION = '2026-03-25.dahlia' lives in client.ts as a const — bump-together contract with package.json's stripe pin."
  - "WebhookVerificationError exports `code = 'invalid_signature'` + `cause` so the route handler can serialise a consistent 400 response without leaking SDK internals."
  - "recordEvent stores the FULL event as JSON payload (forensic replay). RLS prevents cross-tenant reads; no console.log of payload bodies per PITFALLS #7."
  - "TDD applied: RED commit with 5 failing tests → GREEN commit with implementation that passes all 5. No REFACTOR commit needed."
metrics:
  duration: ~10m
  completed: 2026-04-23
---

# Phase 02 Plan 02: Stripe client + webhook verification Summary

Pinned Stripe SDK singleton, webhook signature verification helper that rejects all four failure modes (missing header, wrong secret, tampered body, stale timestamp), idempotency store helper keyed by Stripe event.id, and a 5-test Vitest suite proving the signature behaviour against Stripe's real signing algorithm.

## Tests added (all pass)

`src/lib/stripe/webhook.test.ts` — 5 cases:

1. `accepts a correctly-signed payload and returns the parsed event` — baseline happy path, uses `Stripe.webhooks.generateTestHeaderString` to craft a real signature.
2. `throws WebhookVerificationError on wrong secret` — proves Stripe's signature rejects mismatched secrets.
3. `throws WebhookVerificationError when body was tampered with` — proves byte-level integrity (signature was for a different body).
4. `throws before calling Stripe when signature header is missing` — asserts the guard-clause short-circuit (3 sub-assertions: null, empty string, undefined).
5. `throws WebhookVerificationError on stale timestamp (replay attack)` — proves Stripe's default 5-minute tolerance rejects old signatures.

Test suite uses dynamic `await import('./webhook')` inside each `it()` so the RED commit didn't throw at test-file module load.

## Typecheck + build

- `pnpm typecheck` → exit 0.
- `pnpm test src/lib/stripe/webhook.test.ts` → 5/5 pass, ~244ms.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] TypeScript strict field-accessor syntax on WebhookVerificationError.cause**
- **Found during:** Task 2 initial typecheck
- **Issue:** Plan template declared `public cause?: unknown` in the class constructor parameter list. With TS 6 + `useDefineForClassFields: true` (inherited from the project's `extends`), the `public` modifier + optional cause didn't type-check cleanly next to the narrowed `Error.cause` built-in on lib.es2022.error.d.ts.
- **Fix:** Moved `cause?: unknown` to an explicit field declaration + assigned in the constructor body. Semantically identical; passes type-check.
- **Files modified:** `src/lib/stripe/webhook.ts`
- **Commit:** part of GREEN commit.

### Auth Gates

**STRIPE_WEBHOOK_SECRET is a placeholder in .env.local** — prefix is `whsec_LOCAL_PLACEHOLDER_…`, which satisfies the Zod regex `/^whsec_/` so env validation passes. Signature verification in live webhook testing WILL fail against Stripe until Daniel runs `stripe listen --forward-to localhost:3000/api/stripe/webhook` and copies the real `whsec_…` into `.env.local`. That's documented as expected behaviour for Phase 2 per the execution context — unit tests use a dedicated `TEST_SECRET` override so they never touch the live secret.

## Commits

- `feat(phase-02): 02-02 - pinned Stripe client + env schema extension`
- `test(phase-02): 02-02 - RED: webhook signature verification test suite`
- `feat(phase-02): 02-02 - GREEN: webhook signature verification + idempotency helpers`

## Self-Check: PASSED

- `src/lib/stripe/client.ts` — FOUND (exports stripe, STRIPE_API_VERSION)
- `src/lib/stripe/webhook.ts` — FOUND (exports verifyWebhookSignature, recordEvent, markEventProcessed, markEventFailed, WebhookVerificationError)
- `src/lib/stripe/webhook.test.ts` — FOUND, 5/5 passing
- `src/lib/env.ts` — FOUND (STRIPE_SECRET_KEY + STRIPE_WEBHOOK_SECRET in Zod schema)
- stripe@22.0.2 exact pin — FOUND in package.json
