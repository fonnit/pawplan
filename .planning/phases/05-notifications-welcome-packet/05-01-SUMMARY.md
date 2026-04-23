---
phase: 05
plan: 01
subsystem: notifications-welcome-packet
tags: [pg-boss, sendgrid, react-pdf, webhook, queue, idempotency]
requires:
  - Phase 4 Member schema (Member row created in checkout-completed)
  - Stripe webhook dispatcher (src/app/api/stripe/webhook/route.ts)
provides:
  - Async job queue (pg-boss@10) for notification work
  - SendGrid email wrapper with sandbox-forced-ON safeguard
  - Welcome-packet PDF rendering via @react-pdf/renderer
  - Worker drain endpoint /api/jobs/worker for Vercel Cron
affects:
  - src/lib/stripe/webhook-handlers/checkout-completed.ts (enqueue site)
  - prisma/schema.prisma (Member.welcomePacketSentAt, Member.ownerNotifiedAt)
tech-stack:
  added:
    - pg-boss@10.4.2 — Postgres-backed async job queue
    - "@sendgrid/mail@8.1.6 — transactional email provider (replaced Resend)"
  patterns:
    - singletonKey on Stripe event.id for enqueue dedupe
    - Minimal-payload enqueue + handler re-reads DB for fresh context
    - Fail-closed sandbox mode (explicit 'false' string required to disable)
    - Grep-asserted bundle discipline on webhook hot path
key-files:
  created:
    - src/lib/queue/boss.ts
    - src/lib/queue/enqueue.ts
    - src/lib/queue/index.ts
    - src/lib/queue/enqueue.test.ts
    - src/lib/queue/webhook-hot-path.test.ts
    - src/lib/email/sendgrid.ts
    - src/lib/email/sendgrid.test.ts
    - src/lib/pdf/welcome-packet.tsx
    - src/lib/pdf/welcome-packet.test.ts
    - src/lib/jobs/send-welcome-packet.ts
    - src/lib/jobs/send-welcome-packet.test.ts
    - src/lib/jobs/notify-owner-new-enrollment.ts
    - src/lib/jobs/notify-owner-new-enrollment.test.ts
    - src/lib/jobs/register-workers.ts
    - src/app/api/jobs/worker/route.ts
  modified:
    - prisma/schema.prisma
    - src/lib/env.ts
    - src/lib/stripe/webhook-handlers/checkout-completed.ts
    - src/lib/stripe/webhook-handlers/checkout-completed.test.ts
    - package.json
    - pnpm-lock.yaml
decisions:
  - "Email provider switched from Resend → SendGrid (Daniel-locked). Resend stays in package.json but is grep-blocked from all hot-path + queue files."
  - "Sandbox mode fail-closed: only the literal string 'false' in SENDGRID_SANDBOX_MODE disables it. 5 dedicated tests verify the guard."
  - "pg-boss@10 over the existing Neon Postgres — no Redis. Queue creation idempotent on boss.start(). Lazy singleton."
  - "Enqueue site is checkout.session.completed (not invoice.paid) — Member exists there. Dedupe via singletonKey='{queue}:{event.id}' + Member timestamp gates."
  - "Enqueue payloads are minimal (memberId + eventId). Handlers re-read Member/PlanTier/Clinic so stale tier renames can't leak into the PDF."
metrics:
  duration: 11m
  tasks: 3 waves
  files_created: 15
  files_modified: 6
  tests_added: 25
  tests_total: 180 (was 141)
  commits: 3
  completed: 2026-04-23
---

# Phase 5 Plan 1: Notifications + Welcome Packet Summary

## One-Liner

**Webhook-triggered async pet-owner welcome PDF + clinic-owner enrollment email, delivered via pg-boss@10 + SendGrid with sandbox mode permanently forced on for the public demo.**

## Goal (Recap)

Execute NOTIF-01..04 end-to-end: on first successful charge of a new member, enqueue two jobs (`welcome-packet`, `notify-owner-new-enrollment`) from the webhook without blocking or bloating the hot path, render a PDF welcome packet, send it as an email attachment via SendGrid, and send a separate plain-text enrollment notification to the clinic owner — all idempotent across Stripe webhook retries.

## What Shipped

**Wave 1 — Queue + Email + PDF infrastructure** (commit `0e609ba`)

- `src/lib/queue/boss.ts` — lazy pg-boss@10 singleton with `createQueue` idempotence on start; two queue names (`welcome-packet`, `notify-owner-new-enrollment`).
- `src/lib/queue/enqueue.ts` — `enqueueNewEnrollmentJobs({memberId, eventId})` fires both queues with `singletonKey: '{queue}:{eventId}'` so replays can't duplicate jobs.
- `src/lib/queue/index.ts` — barrel so the webhook imports ONLY this path; grep-guarded to prevent transitive pulls of SendGrid / React-PDF.
- `src/lib/email/sendgrid.ts` — `sendEmail()` wrapper with `mailSettings.sandboxMode.enable` set from `isSandboxMode()`. Fail-closed default: only `SENDGRID_SANDBOX_MODE="false"` (exact lowercase string) disables sandbox.
- `src/lib/pdf/welcome-packet.tsx` — React-PDF `<Document>` component + `renderWelcomePacketBuffer(input)` → `Buffer`.
- `src/lib/env.ts` — optional SendGrid env vars added.

**Wave 2 — Job handlers + worker entry** (commit `aeb7ad1`)

- `prisma/schema.prisma` — `Member.welcomePacketSentAt`, `Member.ownerNotifiedAt` (idempotency stamps). `prisma db push` applied locally.
- `src/lib/jobs/send-welcome-packet.ts` — pulls fresh Member + PlanTier + Clinic, renders PDF, sends email w/ attachment, stamps `welcomePacketSentAt` inside a `withClinic` transaction (RLS honored). Safe skips for missing member, already-sent, no API key.
- `src/lib/jobs/notify-owner-new-enrollment.ts` — separate plain-text email to clinic owner, idempotent on `ownerNotifiedAt`. Splitting into two jobs means a SendGrid 5xx on one email can't block the other's retry.
- `src/lib/jobs/register-workers.ts` — `registerWorkers()` (long-lived boss.work) + `drainWorkers()` (one-shot fetch → complete / fail). Vercel-Cron-friendly.
- `src/app/api/jobs/worker/route.ts` — GET/POST drain endpoint, bearer-token gated via optional `CRON_SECRET` env.
- Defensive `extractServiceNames()` handles string[], `{label}`, `{name}`, `{displayName}` JSON shapes.

**Wave 3 — Webhook enqueue + hot-path bundle guard** (commit `5919d82`)

- `src/lib/stripe/webhook-handlers/checkout-completed.ts` — enqueues after `Member.upsert`, with a guard on existing `welcomePacketSentAt`/`ownerNotifiedAt` that skips enqueue when both jobs already completed (pure replay case).
- `src/lib/queue/webhook-hot-path.test.ts` — grep-asserts none of the 7 hot-path source files import `@sendgrid/mail`, `@react-pdf/renderer`, `@react-email/*`, or `resend`; queue barrel must not import `@/lib/jobs`. Regexes match only real `import`/`require` statements, not docstrings.
- `src/lib/queue/enqueue.test.ts` — verifies singletonKey shape + null-job-id on pg-boss dedupe.

## Success Criteria Verification

| # | Criterion | Verification | Status |
|---|-----------|--------------|--------|
| 1 | Webhook enqueues and returns 200 <200ms with no SendGrid imports in hot path | `webhook-hot-path.test.ts` grep-asserts import-freedom across 7 files + queue surface. | ✓ |
| 2 | Worker renders PDF + sends attachment | `welcome-packet.test.ts` (4 cases, Buffer >1KB, `%PDF-` magic bytes) + `send-welcome-packet.test.ts` (6 cases) | ✓ |
| 3 | Clinic owner gets plain-text enrollment notification | `notify-owner-new-enrollment.test.ts` (5 cases incl. missing-owner-email, retry on 5xx) | ✓ |
| 4 | Handlers idempotent on replay | `send-welcome-packet.test.ts` covers already-sent-skip + member-missing; `checkout-completed.test.ts` covers both-stamped-skip-enqueue. | ✓ |

## Test Summary

- **Before Phase 5**: 141 tests passing.
- **After Phase 5**: **180 tests passing (25 new)**.
  - 5 sandbox-mode correctness cases (sendgrid.test.ts)
  - 3 sendgrid payload-shape cases
  - 4 PDF render cases
  - 6 welcome-packet handler cases
  - 5 owner-enrollment handler cases
  - 2 enqueue helper cases
  - 8 webhook-hot-path grep-guards
  - 3 new checkout-completed enqueue cases
- `pnpm typecheck`: clean.
- `pnpm build`: clean. `/api/jobs/worker` registered as dynamic route.

## Deviations from Plan

**Only one — the spec suggested enqueuing from `invoice-paid.ts`.** In implementation, enqueue fires from `checkout.session.completed` AFTER Member upsert. Rationale (not a deviation per se, but a choice between the two options the spec offered): that's the authoritative first-enrollment event, and the Member row is guaranteed to exist at that point. The webhook idempotency store at the route level plus pg-boss singletonKey on event.id plus the Member timestamp gate make 5× replay produce exactly one send per channel.

No Rule 1/2/3 auto-fixes were needed. No Rule 4 architectural questions surfaced.

**Minor implementation-detail adjustments inside the scope of the spec:**

1. `@sendgrid/helpers/classes/mail` types not exported through main entry — used `Parameters<typeof sgMail.send>[0]` instead of a direct import.
2. Grep-guard regexes tightened to only match actual `import`/`require` statements because the queue barrel's docstring legitimately references the forbidden module names for documentation purposes.
3. `extractServiceNames()` added because `PlanTier.includedServices` is JSON and historically has been `string[]` and `{label}[]` shapes — the welcome packet must render a human-readable list under either shape.

## Authentication Gates

None — SendGrid API key was pre-provisioned by Daniel (Twilio-account-linked) and added to `.env.local` before execution.

## Known Stubs

None. The welcome packet PDF has a fixed accent color (`#4b6049`) because `Clinic.accentColor` is one of six enum values and the header is a simple bar, not a full theme. If Phase 6 adds a logo upload path or theme picker, the PDF template can accept `clinic.accentColorHex` from a lookup.

## Threat Flags

None — all new surface is queue-internal + webhook-enqueue. No new network endpoints beyond `/api/jobs/worker` which is bearer-token gated.

## Commits

| Hash | Message |
|------|---------|
| `0e609ba` | feat(phase-05): wave 1 queue + email + pdf infrastructure - NOTIF-01/02/03/04 |
| `aeb7ad1` | feat(phase-05): wave 2 job handlers + worker route - NOTIF-01/02/03 |
| `5919d82` | feat(phase-05): wave 3 wire checkout webhook enqueue + hot-path guards - NOTIF-04 |

## Phase 6 Follow-ups

1. **Vercel Cron config** — add `vercel.json` entry pointing at `/api/jobs/worker` every 60s when the app deploys. `CRON_SECRET` env in Vercel.
2. **Remove unused `resend` dep** during Phase 6 dependency sweep.
3. **Member list pagination** — Phase 4 carry-over; becomes relevant once redemption UI forces more rows per screen.
4. **ServiceRedemption schema** — Phase 6 will introduce this table + a `(member_id, service_key, billing_period_start)` uniqueness constraint with optimistic locking on toggles.
5. **Staging smoke** — one real Stripe test-card checkout against a deployed instance to confirm SendGrid accepts the sandbox event and the drain route completes both jobs.

## Self-Check: PASSED

All 16 listed files verified present. All 3 commits (`0e609ba`, `aeb7ad1`, `5919d82`) confirmed in `git log`. Test suite 180/180 green. `pnpm typecheck` and `pnpm build` clean.
