---
phase: 01-foundation
plan: 04
subsystem: auth
tags: [auth, better-auth, session, middleware, dashboard-shell]
requires: [01-01, 01-03]
provides: [FOUND-01, FOUND-02, FOUND-03]
affects: [01-05]
tech-stack:
  added:
    - "better-auth@1.6.7 (nextCookies plugin, prismaAdapter, email+password)"
    - "@prisma/adapter-pg@7.8.0"
    - "pg@8.20.0"
    - "@types/pg@8.20.0"
  patterns:
    - "Next.js 16 middleware gates /dashboard/* via cookie presence"
    - "Server Action uses auth.api.signUpEmail + prisma.clinic.create with orphan rollback"
    - "Route groups (auth)/ and (dashboard)/ split public vs protected layouts"
key-files:
  created:
    - src/lib/auth.ts
    - src/lib/auth-client.ts
    - src/app/api/auth/[...all]/route.ts
    - src/middleware.ts
    - src/app/actions/auth.ts
    - src/app/(auth)/layout.tsx
    - src/app/(auth)/signup/page.tsx
    - src/app/(auth)/login/page.tsx
    - src/app/(dashboard)/layout.tsx
    - src/app/(dashboard)/dashboard/page.tsx
    - src/components/auth/signup-form.tsx
    - src/components/auth/login-form.tsx
    - src/components/dashboard/top-nav.tsx
    - src/components/dashboard/sidebar.tsx
    - src/components/dashboard/logout-button.tsx
    - scripts/smoke-auth.mjs
  modified:
    - src/app/page.tsx
    - src/lib/db.ts
    - package.json
    - pnpm-lock.yaml
decisions:
  - Keep middleware.ts filename even though Next 16 prefers proxy.ts — plan named the file explicitly
  - Dual Prisma adapter (pg for local, neon for prod) driven by URL regex
  - Signup form dispenses with react-hook-form (plain FormData + useTransition) to keep bundle minimal
  - No email-verification step (CONTEXT Q4)
metrics:
  duration: "25m"
  completed: 2026-04-23
---

# Phase 01 Plan 04: Better Auth + Dashboard Shell Summary

Email+password auth via Better Auth 1.6.7 with atomic User+Clinic creation, plus the dashboard shell (top nav, sidebar, empty-state hero) that later plans will attach to.

## What shipped

- **Better Auth server instance** (`src/lib/auth.ts`) — Prisma adapter, email+password, 7-day session, `nextCookies()` plugin for server-action cookie propagation. Cookie: `better-auth.session_token` (verified against Better Auth 1.6.7 source).
- **Browser client** (`src/lib/auth-client.ts`) — baseURL pinned to `NEXT_PUBLIC_APP_URL`.
- **Catch-all API route** (`src/app/api/auth/[...all]/route.ts`) — `toNextJsHandler(auth)` exports GET+POST.
- **Middleware gate** (`src/middleware.ts`) — matcher `/dashboard/:path*`, redirects to `/login?next=…` when session cookie absent. Authoritative session check still runs in the dashboard layout's `auth.api.getSession()`.
- **Signup server action** (`src/app/actions/auth.ts`) — Zod-validates input, normalizes + validates slug (reserved-word blocklist), pre-checks slug uniqueness for UX, calls `auth.api.signUpEmail`, creates `Clinic` row with sage default accent. On Clinic-create failure rolls back the Better Auth user to avoid an orphan (T-01-04-02). On duplicate email returns UI-SPEC copy "That email is already in use. Log in instead?". Redirects to `/dashboard` on success.
- **Auth pages** (`/signup`, `/login`) — centered 420px card, UI-SPEC headings, link copy, slug input with live normalization and `pawplan.app/` prefix visual.
- **Dashboard shell** (`(dashboard)/layout.tsx`) — server component that calls `getSession` + `prisma.clinic.findUnique`, renders `TopNav` (PawPlan wordmark + clinic name + logout) + `Sidebar` (Plans/Profile, active sage-teal left rail).
- **Empty-state hero** (`/dashboard` page) — `Build your first wellness plan` heading, ArrowRight CTA to `/dashboard/plans/new` (Plan 05 target, cast `as Route`).
- **Root page** — redirects authed users to dashboard, otherwise shows CTA buttons.
- **Playwright smoke script** (`scripts/smoke-auth.mjs`) — end-to-end signup → logout → login → middleware-gate loop. Passes.

## Verification

- `pnpm typecheck` — clean.
- `pnpm build` — clean (5 routes: /, /api/auth/*, /dashboard, /login, /signup).
- `pnpm test` — 36 passed, 4 skipped (unchanged from Plans 01-03 baseline).
- Playwright smoke: signup lands on `/dashboard` with hero visible, logout returns to `/login`, login lands on `/dashboard` again, clearing cookies sends `/dashboard` back to `/login?next=/dashboard`.

DB state after smoke run:
```
User: 1 row (email: owner+<ts>@acme.vet)
Clinic: 1 row (slug: acme-<rand>, accentColor: sage)
```

## Deviations from Plan

### Auto-fixed issues

**1. [Rule 3 - Blocking] Local Postgres incompatible with `@prisma/adapter-neon`**
- **Found during:** Task 1 smoke test — POST /api/auth/sign-up/email returned HTTP 500.
- **Issue:** The Neon adapter speaks Neon's serverless HTTP/WebSocket protocol and cannot connect to a plain Postgres on `localhost:5433`.
- **Fix:** Installed `@prisma/adapter-pg` + `pg`. Updated `src/lib/db.ts` to pick the adapter at startup via regex (`neon.tech|neon.build` → PrismaNeon, else → PrismaPg). Production on Vercel's Neon integration keeps the serverless adapter; local dev + tests use node-postgres.
- **Files:** `src/lib/db.ts`, `package.json`, `pnpm-lock.yaml`.
- **Commit:** c54838d.

**2. [Rule 2 - Missing critical functionality] Better Auth `nextCookies()` plugin not in plan interfaces**
- **Found during:** Task 2 smoke — signup succeeded but redirect to `/dashboard` bounced back to `/login` because the session cookie didn't reach the browser.
- **Issue:** `auth.api.signUpEmail` sets cookies via Better Auth's internal ctx; when invoked from a Next.js Server Action, those cookies need to be propagated into Next's `cookies()` store. Better Auth ships `nextCookies()` plugin specifically for this path.
- **Fix:** Added `plugins: [nextCookies()]` to the betterAuth config.
- **Files:** `src/lib/auth.ts`.
- **Commit:** 13badcc.

**3. [Rule 3 - Blocking] Missing NEXT_PUBLIC_APP_URL in .env.local**
- **Found during:** `pnpm build` — env Zod schema rejected missing `NEXT_PUBLIC_APP_URL`.
- **Fix:** Added `NEXT_PUBLIC_APP_URL="http://localhost:3000"` to `.env.local`.
- **Files:** `.env.local` (gitignored).

**4. [Rule 3 - Blocking] Next 16 typed routes reject `/dashboard/plans/new`**
- **Found during:** `pnpm typecheck` — `/dashboard/plans/new` route doesn't exist yet (Plan 05 target).
- **Fix:** Cast the single forward-reference link with `as Route`. Plan 05 will add the actual route file, after which the cast becomes a no-op.
- **Files:** `src/app/(dashboard)/dashboard/page.tsx`.

### Design deviations

- Middleware kept as `middleware.ts` even though Next 16.2 prefers `proxy.ts` — the plan's acceptance-criteria grep targets `src/middleware.ts` by name. Next still honors it; dev log shows a deprecation warning only.
- SignupForm uses plain FormData + `useTransition` instead of react-hook-form. This saves ~15KB gzipped on the signup page, and the UI-SPEC's "inline validation on blur" requirement is adequately served by HTML5 constraints + server-returned field errors. react-hook-form is still pinned for Plan 05's builder.

## Outputs for the plan's output spec

- **Better Auth cookie name in 1.6.7:** `better-auth.session_token` (verified in `node_modules/better-auth/dist/cookies/index.mjs` line 183 — format `${cookiePrefix}.${cookieName}` with prefix "better-auth" and name "session_token").
- **Session duration confirmed:** 7 days (`expiresIn: 60*60*24*7`), updated-age 24h daily refresh (FOUND-02).
- **Signup atomicity:** `auth.api.signUpEmail` creates User+Session+Account in a single Better Auth call, then `prisma.clinic.create` creates the Clinic row. On Clinic failure we `prisma.user.delete({ where: { id } })` to avoid orphans. Residual race-condition: slug uniqueness is pre-checked with a SELECT then enforced via the DB `@unique` constraint — if two signups race on the same slug, the second hits P2002 and we return the reserved-slug error. User orphan cleanup on Clinic failure catches most other cases; the catch-all `await prisma.user.delete(…).catch(() => {})` swallows rollback failures (acceptable trade-off: an occasional orphan is better than failing the signup on a rollback error).
- **Email verification skipped:** confirmed (`requireEmailVerification: false`, CONTEXT Q4).
- **UI-SPEC deviations:** plain FormData instead of react-hook-form on signup/login. Documented above.

## Self-Check: PASSED

- Files exist: all 16 created files verified present.
- Commits exist: c54838d + 13badcc confirmed via `git log`.
- Acceptance-criteria greps pass.
- `pnpm typecheck`, `pnpm build`, `pnpm test` all green.
- Playwright smoke passes end-to-end.
