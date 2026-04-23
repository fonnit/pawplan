---
phase: 03-publish-public-enrollment-page
plan: 03
subsystem: public enrollment page
tags: [ssr, isr, cache, public, stripe-stub]
requires: [03-01, 03-02]
provides:
  - /[slug]/enroll route (ISR, mobile-responsive, branded)
  - ClinicHeader + TierComparison components
  - getPublishedPlan data loader (tagged cache)
  - k6 load test for PUB-06
affects: [Phase 4 Checkout wiring]
tech-stack:
  added: []
  patterns: [ISR-dynamic-params, unstable_cache-tagged-revalidation, security-definer-view-consumer]
key-files:
  created:
    - src/app/[slug]/layout.tsx
    - src/app/[slug]/enroll/page.tsx
    - src/app/[slug]/enroll/not-found.tsx
    - src/app/[slug]/enroll/loading.tsx
    - src/components/enrollment/clinic-header.tsx
    - src/components/enrollment/tier-comparison.tsx
    - src/lib/enrollment/getPublishedPlan.ts
    - src/lib/enrollment/getPublishedPlan.test.ts
    - tests/load/enroll-page.k6.js
  modified:
    - next.config.ts
decisions:
  - "BLDR-07 (pet/owner/species collection) deferred to Phase 4 — collected inside Stripe Checkout, not on the enrollment page."
  - "Middle card ('Most popular') uses index === 1 for both 2-tier and 3-tier layouts."
  - "Image host allowlist is https/** with `unoptimized` on <Image>. Per-host allowlisting isn't viable for a SaaS where owner uploads arbitrary URLs."
  - "Stub CTA uses toast.info rather than a redirect — no /checkout route exists yet; Phase 4 will hook it up."
metrics:
  duration: ~8m
  completed: 2026-04-23
requirements: [PUB-05, PUB-06]
---

# Phase 3 Plan 03: Public Enrollment Page Summary

**One-liner:** `/[slug]/enroll` is a server-rendered, ISR-cached, mobile-responsive branded tier-comparison page that reads exclusively from `v_public_clinic_plans` — no `Plan` / `PlanTier` access, no auth, no leakage of draft data.

## Route tree

```
src/app/[slug]/
├── layout.tsx            — public chrome; mounts <Toaster />
└── enroll/
    ├── page.tsx          — server component, ISR revalidate=300, dynamicParams=true
    ├── not-found.tsx     — 404 for unknown / draft-only slugs
    └── loading.tsx       — skeleton during first ISR regen
```

## Cache semantics

- Route: `export const revalidate = 300` (5-minute ISR safety net).
- Data loader: `unstable_cache(..., { tags: ['clinic:{slug}'], revalidate: 300 })`.
- **Invalidation:** `publishPlan` (plan 03-02) and `updatePlanPrices` (plan 03-04) both call `revalidateTag(`clinic:${slug}`, 'default')` — the tag format matches this loader's `tags[0]` exactly.
- React `cache()` wrap on the loader dedupes the `page.tsx` + `generateMetadata()` double-call within one request.

## BLDR-07 note (deferred to Phase 4)

Per plan 03-03 threat model and REQUIREMENTS.md, pet name / species / owner email are collected INSIDE Stripe Checkout (PII stays on Stripe's form), not on this enrollment page. The CTA button in Phase 3 fires `toast.info('Checkout lands in Phase 4…')` + `console.info` with the selected tier + priceId. Phase 4 will replace the handler with a `fetch('/api/stripe/checkout', …)` that creates a Checkout session and redirects.

## k6 smoke run

```
k6 run --duration 5s --vus 10 tests/load/enroll-page.k6.js
```

Smoke run parses and executes (returns 404 against a non-existent slug, which is acceptable for the smoke). Full 500-req/s × 60-s run is gated on (a) operator seeding a published test clinic, (b) building + starting the app in production mode. Runbook header in the file covers the steps.

## next/image caveat

Clinic logos are user-supplied HTTPS URLs. `next.config.ts` now carries `images.remotePatterns: [{ protocol: 'https', hostname: '**' }]`. Individual image tags use `unoptimized` so Next doesn't try to proxy them through its image optimizer (avoids per-host cache thrash for a SaaS where the host list grows with clinics). A malicious owner attacking their own public page is not a v1 threat.

## Deviations from Plan

None — plan executed exactly as written. (Plan 03-02's Next-16-revalidateTag fix is already applied; no additional deviations in this plan.)

## Self-Check: PASSED

- `src/app/[slug]/layout.tsx` — FOUND
- `src/app/[slug]/enroll/page.tsx` — FOUND
- `src/app/[slug]/enroll/not-found.tsx` — FOUND
- `src/app/[slug]/enroll/loading.tsx` — FOUND
- `src/components/enrollment/clinic-header.tsx` — FOUND
- `src/components/enrollment/tier-comparison.tsx` — FOUND
- `src/lib/enrollment/getPublishedPlan.ts` — FOUND
- `src/lib/enrollment/getPublishedPlan.test.ts` — FOUND
- `tests/load/enroll-page.k6.js` — FOUND
- `next.config.ts` — MODIFIED (remotePatterns present)
- Commit `751415c` — FOUND (loader + tests)
- Commit `37a766c` — FOUND (route + components + k6)
- `pnpm build` — PASS (enrollment route listed in route tree as dynamic ƒ)
- `pnpm test --run` — 82/82 pass
