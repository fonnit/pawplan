# Phase 1: Foundation — Research

**Researched:** 2026-04-23
**Domain:** Multi-tenant Next.js 16 SaaS — auth, Postgres RLS, slug safety, break-even pure-function engine, draft-persisted plan builder
**Confidence:** HIGH

---

## Summary

Phase 1 locks in the foundations the rest of PawPlan depends on: Better Auth 1.6 email/password on Next.js 16 App Router (with the `nextCookies` plugin and a `proxy.ts` session gate), Prisma 7.8 talking to Neon via the `@prisma/adapter-neon` driver, Postgres RLS with `FORCE ROW LEVEL SECURITY` on every tenant-scoped table, a tenant-context Prisma Client extension that runs `SELECT set_config('app.current_clinic_id', $1, TRUE)` inside every query's transaction, a hard-coded reserved-slug list with ASCII-lowercase normalization, a **pure** `computeTiers` function in `lib/pricing/breakEven.ts` with a 15-scenario Vitest suite, and a draft-persisting 8-question builder that recomputes break-even on every keystroke by importing the same pure function client-side.

Three details materially shape the plan: (1) on Neon the app must use **`SET LOCAL` inside a transaction** — session-level `SET` is wiped when PgBouncer transaction-mode returns the connection to the pool, which is exactly what the Prisma extension pattern does; (2) Next.js 16 renames `middleware.ts` to `proxy.ts` and exports a `proxy` function — Better Auth's docs already reflect this; (3) `driverAdapters` is stable in Prisma 7 (no `previewFeatures` flag needed). None of this contradicts STACK.md or ARCHITECTURE.md — they all align.

**Primary recommendation:** Scaffold in this order — Prisma schema + RLS migration + `withClinic` extension (so every later query is tenant-safe by default) → Better Auth wiring (so sessions exist to resolve `clinic_id` from) → slug generation + clinic onboarding → `computeTiers` pure function + Vitest suite (the riskiest logic, verified in isolation) → 8-question builder UI that imports `computeTiers` directly and writes `PlanDraft` rows on every debounced change.

---

<user_constraints>
## User Constraints (from CONTEXT.md)

No CONTEXT.md exists for Phase 1 (no `/gsd-discuss-phase` run). The following constraints are **locked decisions** inherited from `.planning/REQUIREMENTS.md` and must be honored by the planner as if they came from CONTEXT.md:

### Locked Decisions (from REQUIREMENTS.md Locked Product Decisions)
- **Platform application-fee percent: 10%** of every clinic subscription (Daniel, 2026-04-23). Must appear as an explicit line item in break-even output.
- **Failed-charge policy: Smart Retries OFF.** Not relevant to Phase 1, but noted for the member-status enum shape.
- **Accent color UX: 6-color preset palette.** No free color picker — `accentColor` field is an enum, not a string.

### Locked Stack (from STACK.md — HIGH-confidence, verified 2026-04-23)
- Next.js 16.2.4, React 19.2.5, TypeScript 6.0.3, pnpm 10.33.1
- Tailwind 4.2.4 + shadcn/ui
- Neon Postgres via Vercel Marketplace
- Prisma 7.8.0 + `@prisma/client@7.8.0` + `@prisma/adapter-neon@7.8.0`
- Better Auth 1.6.7 (**not** Auth.js v5 — it's in beta and merged into Better Auth)
- Zod 4.3.6, react-hook-form 7.73.1 + `@hookform/resolvers@5.2.2`
- Vitest 4.1.5 for unit tests

### Claude's Discretion
- Exact shape of `PlanInputs` and `TierQuote` types (within the contract defined below in §Break-Even Pure Function Shape).
- Folder boundaries inside `lib/` and `components/` (ARCHITECTURE.md gives a recommended layout; minor deviations are fine if justified).
- Which 6 accent colors ship in the palette — propose a set, Daniel confirms at plan-check.
- Exact wording of the reserved-slug error UI.

### Deferred Ideas (OUT OF SCOPE for Phase 1)
- Stripe Connect onboarding → Phase 2.
- Stripe Product/Price creation, Publish action, public enrollment page → Phase 3.
- Checkout, webhooks, member records, subscription lifecycle → Phase 4.
- Welcome PDFs, Resend, pg-boss → Phase 5.
- MRR/ARR dashboard, redemption toggles → Phase 6.
- Post-publish price edits (BLDR-08), tier rename post-draft (BLDR-06), member record enrollment fields (BLDR-07), server-side canonical break-even at publish (MATH-02/03/04/05) → Phase 3.
- OAuth providers, magic links, 2FA, password reset — v1 is email+password only.
- Logo upload storage (Vercel Blob / S3) — the Clinic row stores an optional `logoUrl` nullable string; the upload flow itself ships later (Phase 3, when the public enrollment page actually renders it). Phase 1 accepts any URL string in the `logoUrl` field (validated as URL by Zod).

### Project Constraints (from CLAUDE.md at repo root)
- The repo-root `CLAUDE.md` is the FonnIT internal-ops repo — **not** the PawPlan app repo. PawPlan lives in `apps/pawplan/` and ships to its own GitHub repo `fonnit/pawplan`. All Phase 1 code goes under `apps/pawplan/` **or** in a fresh `pawplan/` checkout — the planner should confirm which during plan-check.
- GSD workflow enforcement applies: use GSD commands, not direct edits.
- `/build-app-gsd` pattern dictates per-phase atomic commits and public GitHub push. Phase 1 completion = one squash commit minimum, pushed.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| FOUND-01 | Clinic owner can create account with email+password | §Better Auth Setup — `emailAndPassword: { enabled: true }` + `signUpEmail` server action |
| FOUND-02 | Stays logged in across browser sessions | §Better Auth Setup — default session `expiresIn: 60*60*24*7` (7d) + `updateAge: 60*60*24` rolling refresh; HttpOnly+Secure+SameSite=Lax cookie |
| FOUND-03 | Logs out from any page | §Better Auth Setup — `authClient.signOut()` wired to a shared `<LogoutButton>` in the dashboard layout |
| FOUND-04 | Per-clinic row-level isolation | §Postgres RLS + Prisma Extension — `ENABLE RLS` + `FORCE RLS` on every tenant-scoped table, `tenant_isolation` policy, `withClinic` extension wraps every query in a transaction that runs `set_config('app.current_clinic_id', …, TRUE)` |
| FOUND-05 | Slug is unique, lowercase-ASCII, reserved-word-filtered, locked at creation | §Slug Generation — regex `^[a-z0-9](-?[a-z0-9])+$`, 3-40 chars, reserved-word list, DB unique index on `LOWER(slug)`, field becomes immutable after insert |
| FOUND-06 | Single clinic profile (name required, logo optional, accent color from 6-preset) | §Prisma Schema — `Clinic.practiceName String`, `logoUrl String?`, `accentColor AccentColor` enum |
| MATH-01 | Pure function computes per-tier break-even math given 8 builder inputs + 10% platform fee | §Break-Even Pure Function Shape — `computeTiers(inputs: PlanInputs, opts: { platformFeePct: 10 }): TierQuote[]` in `lib/pricing/breakEven.ts`, zero deps, zero I/O |
| BLDR-01 | 8-question builder captures species mix, annual exam price, dental price, core vaccine cadence + per-vaccine price, heartworm/flea-tick inclusion, member discount (0–20%), plan tier count (2 or 3) | §8-Question Builder UX — wizard `components/builder/BuilderForm.tsx` with react-hook-form + Zod schema from `lib/validation/builderSchema.ts` |
| BLDR-02 | Owner can choose 2 or 3 tiers; default names Preventive / Preventive Plus / Complete | §Tier Shape Defaults — `DEFAULT_TIER_NAMES` constant + helpers `buildTierShapes(count: 2 \| 3)` in `lib/pricing/tiers.ts` |
| BLDR-03 | Live break-even preview updates on every input change | §8-Question Builder UX — `useWatch()` from react-hook-form → `useMemo(() => computeTiers(values, { platformFeePct: 10 }), [values])` client-side; no network round-trip |
| BLDR-04 | Owner can return to the builder post-publish to edit prices without losing member data | Phase 1 scope is the draft-persistence substrate only (BLDR-05). Post-publish edit flow (BLDR-08) is Phase 3. The `PlanDraft` table + `upsertDraft()` server action land here. |
| BLDR-05 | Draft plans persist to Postgres — never ephemeral | §Draft Persistence — `PlanDraft` table keyed 1:1 on `clinicId`; debounced server action `upsertPlanDraft(answers)` writes on builder changes; dashboard load reads draft and rehydrates form |
</phase_requirements>

---

## Standard Stack

### Core (inherited from STACK.md — versions verified 2026-04-23 via `npm view`)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `next` | 16.2.4 | App Router, Server Actions, Route Handlers, `proxy.ts` [VERIFIED: npm view next] | Single deployment target; Server Actions replace all of Phase 1's mutation endpoints. |
| `react` | 19.2.5 | UI | Pinned by Next 16; `useActionState` + `useFormStatus` clean up the 8-question wizard. |
| `typescript` | 6.0.3 | Type safety | Strict mode. TS 6 inference on Zod 4 + Prisma 7 generated types. |
| `prisma` + `@prisma/client` | 7.8.0 | ORM + migrations [VERIFIED: npm view prisma / @prisma/client] | Generated types flow into Server Actions; `prisma migrate deploy` in CI. |
| `@prisma/adapter-neon` | 7.8.0 | Neon driver bridge [VERIFIED: npm view @prisma/adapter-neon] | Bundles the Neon serverless driver; **do not** install `@neondatabase/serverless` or `ws` separately — it's included. [CITED: neon.com/docs/guides/prisma] |
| `better-auth` | 1.6.7 | Email/password auth [VERIFIED: npm view better-auth] | Prisma adapter built-in; Next 16 integration docs-supported; `nextCookies()` plugin solves Server Action cookie propagation. |
| `zod` | 4.3.6 | Runtime validation | Shared schemas between client form (RHF resolver) and Server Action input. |
| `react-hook-form` | 7.73.1 | Builder form state | `useWatch` drives live break-even recompute. |
| `@hookform/resolvers` | 5.2.2 | RHF ↔ Zod bridge | — |
| `vitest` | 4.1.5 | Unit tests | Framework for the 15-scenario break-even test file. |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `tailwindcss` | 4.2.4 | Styling | All UI. |
| `shadcn/ui` | copy-in | Form, Button, Card, Input, Label, RadioGroup, Slider, Toast | Run `pnpm dlx shadcn@latest add form button card input label radio-group slider toast badge` once. |
| `lucide-react` | 1.8.0 | Icons | shadcn peer. |
| `clsx` + `tailwind-merge` | 2.1.1 / 3.5.0 | `cn()` helper | shadcn peer. |
| **(no slug lib)** | — | Slug generation | A 20-line pure function beats any dep. See §Slug Generation. |
| **(no uuid lib)** | — | IDs | Prisma's `@default(cuid())` or Postgres `gen_random_uuid()`. |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Better Auth | Auth.js v5, Clerk | Auth.js v5 is beta [CITED: blog.logrocket.com/best-auth-library-nextjs-2026]; Clerk is hosted-UI + $25/mo starts adding up at scale. Better Auth is the STACK.md pick. |
| Prisma extension for RLS | `$queryRaw` with explicit `withClinic` helper everywhere | The extension pattern is enforced at the client construction site, not at the call site — no developer can forget. [CITED: github.com/prisma/prisma-client-extensions/row-level-security] |
| `SET LOCAL app.current_clinic_id` | `SET` (session) | Neon's pooler (PgBouncer transaction mode) wipes session state when the conn returns to the pool. [CITED: neon.com/docs/connect/connection-pooling] `SET LOCAL` inside a transaction is the only correct option. |
| `@react-email` components for the auth emails | Plain-text emails | Out of scope for Phase 1 — email verification is deferred (not in FOUND requirements). |

**Installation:**

```bash
# Scaffold (from a fresh pawplan/ directory or apps/pawplan/ subdir — confirm location at plan-check)
pnpm create next-app@16.2.4 pawplan --typescript --tailwind --app --eslint --src-dir --import-alias "@/*"
cd pawplan

# shadcn init + components needed for Phase 1
pnpm dlx shadcn@latest init
pnpm dlx shadcn@latest add button card input label form radio-group slider switch toast badge

# Core Phase-1 runtime deps
pnpm add \
  prisma@7.8.0 @prisma/client@7.8.0 @prisma/adapter-neon@7.8.0 \
  better-auth@1.6.7 \
  zod@4.3.6 \
  react-hook-form@7.73.1 @hookform/resolvers@5.2.2

# Dev deps
pnpm add -D vitest@4.1.5 @types/node

# Initialize Prisma (choose Postgres)
pnpm prisma init --datasource-provider postgresql
```

**Version verification (2026-04-23):** `npm view` confirmed all four critical packages: `better-auth@1.6.7`, `prisma@7.8.0`, `@prisma/client@7.8.0`, `@prisma/adapter-neon@7.8.0`, `@neondatabase/serverless@1.1.0` (transitive). [VERIFIED: npm registry, 2026-04-23]

---

## Architecture Patterns

### Recommended Project Structure (Phase-1 slice only — see ARCHITECTURE.md §Recommended Project Structure for the full picture)

```
pawplan/
├── prisma/
│   ├── schema.prisma
│   └── migrations/
│       ├── 0001_init/                  # clinics + Better Auth tables
│       ├── 0002_enable_rls/            # RLS policies + FORCE RLS
│       └── 0003_plan_draft/            # PlanDraft table
├── src/
│   ├── app/
│   │   ├── (marketing)/page.tsx        # stub landing
│   │   ├── (auth)/
│   │   │   ├── signup/page.tsx
│   │   │   ├── login/page.tsx
│   │   │   └── layout.tsx              # unauth-only shell
│   │   ├── (dashboard)/
│   │   │   ├── layout.tsx              # auth + clinic resolution, renders <LogoutButton>
│   │   │   ├── dashboard/page.tsx      # empty-state: "Start your plan" CTA
│   │   │   ├── builder/page.tsx        # 8-question wizard
│   │   │   └── settings/page.tsx       # practice name / logoUrl / accent color
│   │   ├── api/auth/[...all]/route.ts  # Better Auth handler
│   │   └── layout.tsx
│   ├── lib/
│   │   ├── auth.ts                     # Better Auth instance
│   │   ├── auth-client.ts              # createAuthClient for React
│   │   ├── db/
│   │   │   ├── prisma.ts               # PrismaClient + Neon adapter (base, no tenant)
│   │   │   └── withClinic.ts           # RLS extension factory
│   │   ├── tenant/
│   │   │   └── resolveClinic.ts        # session → clinicId (memoized per request via React.cache)
│   │   ├── pricing/
│   │   │   ├── breakEven.ts            # PURE FN
│   │   │   ├── breakEven.test.ts       # 15 scenarios
│   │   │   └── tiers.ts                # tier-shape helpers
│   │   ├── slug/
│   │   │   ├── generate.ts             # normalize + collision retry
│   │   │   ├── reserved.ts             # blocklist
│   │   │   └── generate.test.ts
│   │   └── validation/
│   │       ├── builderSchema.ts        # Zod for 8 questions
│   │       └── clinicSchema.ts         # Zod for practice-profile form
│   ├── components/
│   │   ├── ui/                         # shadcn primitives
│   │   ├── auth/
│   │   │   ├── SignupForm.tsx
│   │   │   ├── LoginForm.tsx
│   │   │   └── LogoutButton.tsx
│   │   ├── builder/
│   │   │   ├── BuilderForm.tsx
│   │   │   ├── TierPreview.tsx         # renders computeTiers(values) live
│   │   │   └── questions/              # one component per question
│   │   └── settings/
│   │       └── ClinicProfileForm.tsx
│   └── proxy.ts                        # Next 16 — session-cookie gate
├── vitest.config.ts
└── package.json
```

**Structure rationale:**
- `lib/db/withClinic.ts` is the **only** way to get a tenant-scoped Prisma client — the base client in `lib/db/prisma.ts` is never imported from route handlers directly, only from the `withClinic` factory itself. This makes RLS-bypass a code-review-visible event (an import of `prisma.ts` outside `withClinic.ts` or migrations).
- `lib/pricing/breakEven.ts` has **zero imports** other than maybe a rounding util. ESLint rule `no-restricted-imports` can enforce this.
- `src/proxy.ts` (Next 16 rename of `middleware.ts`) does one thing: check session cookie via `getSessionCookie()` and redirect unauthed traffic to `/login`. No DB, no Prisma — keeps the edge-proxy fast. [CITED: better-auth.com/docs/integrations/next]

### Pattern 1: Prisma Client Extension for Postgres RLS

**What:** Every authenticated request calls `withClinic(clinicId)` to get a Prisma client. That client's `$extends` intercepts **every** model operation, wraps it in a transaction, and calls `SELECT set_config('app.current_clinic_id', $1, TRUE)` before the real query runs. The third `TRUE` argument = `is_local`, so the setting dies at transaction commit — safe for Neon's PgBouncer pool. [CITED: github.com/prisma/prisma-client-extensions/row-level-security]

**When to use:** Every tenant-scoped query. The base `prisma` from `lib/db/prisma.ts` is only used for (a) Better Auth's adapter (user / session / account / verification — cross-tenant by nature), and (b) platform-level ops during migrations.

**Example:**

```typescript
// src/lib/db/prisma.ts
import { PrismaClient } from '@prisma/client';
import { PrismaNeon } from '@prisma/adapter-neon';

const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL! });

// Source: neon.com/docs/guides/prisma (2026-04-23)
export const prisma = new PrismaClient({ adapter });
```

```typescript
// src/lib/db/withClinic.ts
import { Prisma } from '@prisma/client';
import { prisma } from './prisma';

// Source (pattern): github.com/prisma/prisma-client-extensions/row-level-security
export function withClinic(clinicId: string) {
  return prisma.$extends({
    name: 'tenant-isolation',
    query: {
      $allModels: {
        async $allOperations({ args, query }) {
          const [, result] = await prisma.$transaction([
            prisma.$executeRaw`SELECT set_config('app.current_clinic_id', ${clinicId}, TRUE)`,
            query(args),
          ]);
          return result;
        },
      },
    },
  });
}

export type TenantPrisma = ReturnType<typeof withClinic>;
```

**SQL migration (RLS enablement):**

```sql
-- prisma/migrations/0002_enable_rls/migration.sql

-- 1. The app role must NOT be superuser and must NOT have BYPASSRLS.
--    In Neon, create a separate role for app queries — do not use the DB owner.
--    (Neon docs: run this via the Neon SQL editor or a privileged direct connection.)
-- CREATE ROLE pawplan_app LOGIN PASSWORD '...';
-- GRANT USAGE ON SCHEMA public TO pawplan_app;
-- GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO pawplan_app;

-- 2. Enable + FORCE RLS on every tenant-scoped table.
ALTER TABLE "Clinic"   ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Clinic"   FORCE  ROW LEVEL SECURITY;
ALTER TABLE "PlanDraft" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PlanDraft" FORCE  ROW LEVEL SECURITY;

-- 3. Policies: read/write rows only where clinic_id matches the GUC.
CREATE POLICY tenant_isolation ON "Clinic"
  USING ("id" = current_setting('app.current_clinic_id', true)::uuid)
  WITH CHECK ("id" = current_setting('app.current_clinic_id', true)::uuid);

CREATE POLICY tenant_isolation ON "PlanDraft"
  USING ("clinicId" = current_setting('app.current_clinic_id', true)::uuid)
  WITH CHECK ("clinicId" = current_setting('app.current_clinic_id', true)::uuid);

-- 4. Composite indexes: clinic_id as leading column for RLS-friendly planning.
CREATE INDEX IF NOT EXISTS idx_plan_draft_clinic ON "PlanDraft" ("clinicId");
```

**Pitfall (HIGH): Prisma's `$transaction([...])` array form is interactive-aware.** The set_config + query pair must run on the **same** connection. The array-form transaction guarantees that. Do **not** convert this to the callback form `$transaction(async (tx) => ...)` without re-reading the extension — it works but the `set_config` must use `tx.$executeRaw`, not `prisma.$executeRaw`. [CITED: prisma.io docs]

**Pitfall (HIGH): RLS and Better Auth tables.** Do **not** put RLS on `User` / `Session` / `Account` / `Verification`. Better Auth queries those through its own adapter, from the base `prisma` client, and has no concept of `clinic_id`. These tables are cross-tenant by design — the `User` → `Clinic` membership is a separate FK on `Clinic.ownerUserId`.

### Pattern 2: Better Auth 1.6 + Next.js 16 Proxy + Server Actions

**What:** Better Auth owns the auth tables, cookie issuance, and session verification. The Next 16 `proxy.ts` reads the session cookie (edge-safe, no DB hit) and redirects unauthed traffic. The dashboard layout does a real `auth.api.getSession()` (DB-hit) and resolves the user's clinic_id. [CITED: better-auth.com/docs/integrations/next]

**File-by-file:**

```typescript
// src/lib/auth.ts
import { betterAuth } from 'better-auth';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import { nextCookies } from 'better-auth/next-js';
import { prisma } from '@/lib/db/prisma';

// Source: better-auth.com/docs/installation + /docs/integrations/next
export const auth = betterAuth({
  database: prismaAdapter(prisma, { provider: 'postgresql' }),
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
    maxPasswordLength: 128,
    // email verification is deferred — v1 FOUND requirements don't mandate it
  },
  session: {
    expiresIn: 60 * 60 * 24 * 7,   // 7 days — FOUND-02: stays logged in
    updateAge: 60 * 60 * 24,        // refresh token daily
    cookieCache: { enabled: true, maxAge: 5 * 60 }, // 5-min hot cache
  },
  trustedOrigins: [process.env.BETTER_AUTH_URL!],
  plugins: [nextCookies()], // MUST be last — enables Server Action cookie propagation
});
```

```typescript
// src/lib/auth-client.ts
'use client';
import { createAuthClient } from 'better-auth/react';

export const authClient = createAuthClient({
  baseURL: process.env.NEXT_PUBLIC_APP_URL,
});
```

```typescript
// src/app/api/auth/[...all]/route.ts
import { auth } from '@/lib/auth';
import { toNextJsHandler } from 'better-auth/next-js';

// Source: better-auth.com/docs/installation
export const { POST, GET } = toNextJsHandler(auth);
```

```typescript
// src/proxy.ts  (Next 16 rename of middleware.ts)
import { NextRequest, NextResponse } from 'next/server';
import { getSessionCookie } from 'better-auth/cookies';

// Source: github.com/Achour/nextjs-better-auth/blob/main/proxy.ts
export async function proxy(request: NextRequest) {
  const sessionCookie = getSessionCookie(request);
  const { pathname } = request.nextUrl;

  if (sessionCookie && (pathname === '/login' || pathname === '/signup')) {
    return NextResponse.redirect(new URL('/dashboard', request.url));
  }
  if (!sessionCookie && pathname.startsWith('/dashboard')) {
    return NextResponse.redirect(new URL('/login', request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/dashboard/:path*', '/login', '/signup'],
};
```

```typescript
// src/lib/tenant/resolveClinic.ts
import { cache } from 'react';
import { headers } from 'next/headers';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db/prisma';

// React.cache dedupes per request so layout + child pages share one session fetch.
export const resolveClinic = cache(async () => {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return null;
  const clinic = await prisma.clinic.findFirst({
    where: { ownerUserId: session.user.id },
    select: { id: true, slug: true, practiceName: true, logoUrl: true, accentColor: true },
  });
  return clinic ? { session, clinic } : null;
});
```

```typescript
// src/app/(dashboard)/layout.tsx  (Server Component)
import { redirect } from 'next/navigation';
import { resolveClinic } from '@/lib/tenant/resolveClinic';
import { LogoutButton } from '@/components/auth/LogoutButton';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const ctx = await resolveClinic();
  if (!ctx) redirect('/login');
  // If user has no clinic yet → ship them to onboarding
  if (!ctx.clinic) redirect('/settings?first-run=1');

  return (
    <div>
      <header>
        <span>{ctx.clinic.practiceName}</span>
        <LogoutButton />
      </header>
      <main>{children}</main>
    </div>
  );
}
```

**Pitfall (HIGH):** Better Auth's `nextCookies()` plugin must be the **last** plugin in the array, or Server Actions silently fail to set the session cookie. [CITED: better-auth.com/docs/integrations/next]

**Pitfall (MEDIUM):** Do NOT call `auth.api.getSession()` from `proxy.ts` — proxy runs on the edge and a DB round-trip per request kills latency. Use `getSessionCookie(request)` for cheap existence-check; do the real validation in the dashboard layout. [CITED: better-auth.com/docs/integrations/next]

### Pattern 3: Pure-Function Break-Even Engine (MATH-01)

**What:** `lib/pricing/breakEven.ts` exports `computeTiers(inputs, opts): TierQuote[]`. Zero deps, zero I/O, deterministic. Imported directly into `BuilderForm` client component for live recomputation AND eventually called from a Server Action at Publish (Phase 3). The Phase-1 deliverable is the function + 15-scenario test, used client-side only for now.

See §Break-Even Pure Function Shape below for the full contract.

**When to use:** Always — this is the contract. Phase 3 will re-import the same file server-side; the property that must hold is that `computeTiers(A) === computeTiers(A)` in both environments.

**Example:** See §Break-Even Pure Function Shape.

### Pattern 4: Draft Persistence via 1:1 Upsert (BLDR-05)

**What:** One `PlanDraft` row per clinic. The builder form debounces (≈400ms) on every field change and fires a `upsertPlanDraft(answers)` Server Action that writes the full answer blob into a JSON column. On builder page load, the draft (if any) seeds `defaultValues` on `react-hook-form`.

**Schema:**

```prisma
model PlanDraft {
  id        String   @id @default(cuid())
  clinicId  String   @unique            // 1:1 with Clinic
  clinic    Clinic   @relation(fields: [clinicId], references: [id], onDelete: Cascade)
  answers   Json                        // PlanInputs shape — validated server-side with Zod
  updatedAt DateTime @updatedAt
  createdAt DateTime @default(now())

  @@index([clinicId])
}
```

**Server action:**

```typescript
// src/app/(dashboard)/builder/actions.ts
'use server';
import { resolveClinic } from '@/lib/tenant/resolveClinic';
import { withClinic } from '@/lib/db/withClinic';
import { builderSchema } from '@/lib/validation/builderSchema';
import { revalidatePath } from 'next/cache';

export async function upsertPlanDraft(rawAnswers: unknown) {
  const ctx = await resolveClinic();
  if (!ctx) throw new Error('Unauthorized');

  // Zod validates same schema the client form uses
  const answers = builderSchema.parse(rawAnswers);

  const db = withClinic(ctx.clinic.id);
  await db.planDraft.upsert({
    where: { clinicId: ctx.clinic.id },
    create: { clinicId: ctx.clinic.id, answers },
    update: { answers },
  });
  revalidatePath('/builder');
}
```

**Pitfall (MEDIUM):** Do NOT write on every keystroke — debounce 400ms on the client side (a `useEffect` + `setTimeout` or `useDebouncedCallback`). Otherwise a user typing a 3-digit price fires 3 Server Actions × N questions. The break-even *preview* recomputes instantly (pure function); the *persistence* lags.

### Pattern 5: Slug Generation with Reserved-Word Block + Collision Retry (FOUND-05)

**What:** On clinic creation, turn practice name → ASCII slug, reject reserved words, check uniqueness, append `-2`/`-3`/... on collision up to 5 attempts, then fail. Slug is written once and **never updated** — the DB has no `UPDATE clinic SET slug` code path.

**Source:** Pattern assembled from PITFALLS.md §Pitfall 5 and standard web-slug practice. [ASSUMED for exact regex shape; PawPlan-specific.]

**Example:**

```typescript
// src/lib/slug/reserved.ts
// Keep in sync with src/app/ top-level route segments + common web reservations.
export const RESERVED_SLUGS = new Set([
  'admin', 'api', 'app', 'auth', 'dashboard', 'enroll', 'login', 'signup',
  'settings', 'stripe', 'webhooks', 'webhook', 'about', 'pricing', 'terms',
  'privacy', 'support', 'help', 'docs', 'blog', 'status',
  '_next', 'static', 'public', 'assets',
  // HTTP verbs — belt-and-braces
  'get', 'post', 'put', 'patch', 'delete', 'head', 'options',
  // PawPlan operational
  'platform', 'demo', 'test', 'staging',
]);
```

```typescript
// src/lib/slug/generate.ts
import { RESERVED_SLUGS } from './reserved';

const SLUG_RE = /^[a-z0-9](?:-?[a-z0-9])+$/;

export function normalizeSlug(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFKD')               // decompose accents → base + combining mark
    .replace(/[̀-ͯ]/g, '') // strip combining marks (é → e)
    .replace(/[^a-z0-9]+/g, '-')     // non-ASCII-alnum → hyphen
    .replace(/^-+|-+$/g, '')         // trim leading/trailing hyphens
    .replace(/-{2,}/g, '-')          // collapse consecutive hyphens
    .slice(0, 40);
}

export type SlugError =
  | { code: 'too_short' }
  | { code: 'too_long' }
  | { code: 'reserved' }
  | { code: 'invalid_chars' };

export function validateSlug(slug: string): SlugError | null {
  if (slug.length < 3) return { code: 'too_short' };
  if (slug.length > 40) return { code: 'too_long' };
  if (!SLUG_RE.test(slug)) return { code: 'invalid_chars' };
  if (RESERVED_SLUGS.has(slug)) return { code: 'reserved' };
  return null;
}

// Used by the clinic-creation Server Action; takes a unique-checker.
export async function resolveUniqueSlug(
  desired: string,
  isTaken: (s: string) => Promise<boolean>,
): Promise<string> {
  const base = normalizeSlug(desired);
  const err = validateSlug(base);
  if (err) throw new Error(`Invalid slug: ${err.code}`);

  for (let i = 0; i < 5; i++) {
    const candidate = i === 0 ? base : `${base}-${i + 1}`;
    if (!(await isTaken(candidate))) return candidate;
  }
  throw new Error('Slug collision — please try a different practice name');
}
```

**DB-level safety:**

```prisma
model Clinic {
  id             String      @id @default(cuid())
  ownerUserId    String      @unique            // FOUND: one user → one clinic in v1
  slug           String      @unique            // case-sensitive unique
  practiceName   String
  logoUrl        String?
  accentColor    AccentColor @default(SAGE)
  createdAt      DateTime    @default(now())
  planDraft      PlanDraft?
  // Field is set once at insertion; the upsert/update code paths never touch `slug`.
  // Convention enforced at code-review; no DB-level immutability (Postgres has no
  // straightforward column-immutability primitive short of a trigger).
}

enum AccentColor {
  SAGE
  CORAL
  INDIGO
  AMBER
  TEAL
  ROSE
}
```

**Pitfall (HIGH):** The `RESERVED_SLUGS` list MUST be cross-checked against `src/app/` top-level route segments at build time. Recommend a Vitest test that reads the directory and asserts every top-level dir name is in `RESERVED_SLUGS`. [ASSUMED: exact set of route segments; confirm at plan-check.]

### Pattern 6: Tier-Shape Builder (BLDR-02)

**What:** `buildTierShapes(count: 2 | 3)` returns the default tier scaffolding used by `computeTiers`. Named constants so `Preventive / Preventive Plus / Complete` are centralized.

```typescript
// src/lib/pricing/tiers.ts

export const DEFAULT_TIER_NAMES = {
  2: ['Preventive', 'Complete'] as const,
  3: ['Preventive', 'Preventive Plus', 'Complete'] as const,
} satisfies Record<2 | 3, readonly string[]>;

// Which services each tier includes — by convention, not user-editable in v1.
export const DEFAULT_TIER_SERVICES = {
  2: [
    { annualExam: true, coreVaccines: true, heartworm: false, fleaTick: false, dental: false },
    { annualExam: true, coreVaccines: true, heartworm: true,  fleaTick: true,  dental: true  },
  ],
  3: [
    { annualExam: true, coreVaccines: true, heartworm: false, fleaTick: false, dental: false },
    { annualExam: true, coreVaccines: true, heartworm: true,  fleaTick: false, dental: false },
    { annualExam: true, coreVaccines: true, heartworm: true,  fleaTick: true,  dental: true  },
  ],
} as const;

export type TierShape = {
  name: string;
  services: typeof DEFAULT_TIER_SERVICES[2 | 3][number];
};

export function buildTierShapes(count: 2 | 3, overrideNames?: string[]): TierShape[] {
  const names = overrideNames ?? DEFAULT_TIER_NAMES[count];
  return DEFAULT_TIER_SERVICES[count].map((services, i) => ({
    name: names[i] ?? `Tier ${i + 1}`,
    services,
  }));
}
```

[ASSUMED: the exact service-inclusion matrix for each tier. This is a product decision — the "2-tier" case especially is judgement-call: is dental in the Premium-only tier, or always in the top tier? Plan-check should surface this to Daniel.]

### Anti-Patterns to Avoid

- **Computing break-even via a Server Action on every input change.** Kills the "feel." [CITED: PITFALLS.md Pitfall #3]
- **Using `WHERE clinicId = $1` instead of RLS.** One forgotten filter = leak. [CITED: PITFALLS.md Pitfall #4]
- **Using the Postgres DB owner role for app queries.** RLS is bypassed silently. Use a non-owner role with `BYPASSRLS = false`.
- **`SET` (not `SET LOCAL`) for the tenant GUC.** Contaminates pooled connections on Neon. [CITED: neon.com/docs/connect/connection-pooling]
- **Calling `auth.api.getSession()` from `proxy.ts`.** Edge DB round-trip per request. [CITED: better-auth.com/docs/integrations/next]
- **Letting the slug be editable.** Newsletter URLs break silently. Slug is write-once by convention; no update code path.
- **Adding OAuth providers "just in case."** Scope creep; v1 is email+password only per FOUND-01.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Password hashing | bcrypt/argon2 wrappers, rolled session tokens | **Better Auth** | Session rotation, cookie flags, CSRF, timing-safe compare, account lockout — all in the box. |
| Postgres connection pooling | Custom `pg` pool setup | **`@prisma/adapter-neon`** bundled serverless driver | Hand-tuning pool size on Vercel Functions is a known rabbit hole. |
| Tenant context propagation across Prisma calls | `AsyncLocalStorage` + manual `WHERE` appending | **Prisma `$extends` pattern** [CITED: github.com/prisma/prisma-client-extensions/row-level-security] | The extension runs for every model op automatically — the developer can't forget. |
| Zod-backed form schemas | Custom validation error mapping | **`@hookform/resolvers/zod`** | Handles nested errors, field-level messages, strips extra keys. |
| Slug transliteration for non-ASCII input | Custom Unicode handling | **`String.prototype.normalize('NFKD')` + regex strip** | Standard-library-only; all ECMA engines. |
| Accent-color picker | Custom palette UI | **Plain radio-group of 6 `<Label><Input type="radio">` pairs** | 6 colors, no complexity — shadcn's `RadioGroup` covers it in 30 lines. |
| Break-even math library | Decimal.js, math.js | **Plain JS `number` + a `round2` helper** | Floating-point is fine at the cent level for MVP; decimals cost bundle size for no product win. Document the rounding convention (HALF_UP? HALF_EVEN?) in the test file. |

**Key insight:** Phase 1 has one custom domain artifact worth writing carefully (the break-even pure function) and a handful of infrastructure bolts that are already solved problems. Every hour spent on auth/pooling/validation is an hour not spent on break-even math — which is the real risk.

---

## Runtime State Inventory

Phase 1 is **greenfield** — no pre-existing PawPlan system exists to migrate. This section is omitted.

*Verified by: `ls /Users/dfonnegrag/Projects/pawplan/apps/` and `.planning/STATE.md` shows "Plans completed: 0".*

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js 22 LTS | Next.js 16, Prisma 7 runtime | Check at plan-check | — | — |
| pnpm 10.33.1 | Package management | Check at plan-check | — | npm/yarn (discouraged — STACK.md mandates pnpm) |
| Neon Postgres database | Prisma + RLS | Needs provisioning | — | Local Docker Postgres for dev only; Neon for prod |
| Git + GitHub CLI | Per-phase commits per `/build-app-gsd` | Available (repo is cloned) | — | — |
| `DATABASE_URL` env var | Prisma | Provisioned at Neon setup | — | — |
| `BETTER_AUTH_SECRET` env var | Session JWT signing | Generate: `openssl rand -base64 32` | — | — |
| `BETTER_AUTH_URL` / `NEXT_PUBLIC_APP_URL` | Better Auth trusted origin | `http://localhost:3000` (dev) | — | — |

**Missing dependencies with no fallback:**
- Neon Postgres project. Planner must include a Wave-0 task: "Provision Neon project via Vercel Marketplace, capture `DATABASE_URL` + `DIRECT_URL`, add to Vercel env and `.env.local`."

**Missing dependencies with fallback:**
- None blocking.

---

## Break-Even Pure Function Shape (MATH-01, BLDR-03)

This is the Phase-1 deliverable that most needs a nailed-down contract before the planner touches it. Below is the proposed input/output shape — copy into `lib/pricing/breakEven.ts` and `lib/validation/builderSchema.ts`.

### `PlanInputs` — the 8 builder answers

```typescript
// src/lib/pricing/breakEven.ts

export type Species = 'DOG' | 'CAT';

export type SpeciesMix = {
  dog: number;   // 0–100, integer percent
  cat: number;   // 0–100, integer percent; dog + cat must === 100
};

export type VaccineCadence = 'ANNUAL' | 'TRIENNIAL'; // core vaccines per dog/cat protocol

export type PlanInputs = {
  // Q1: species mix (for blended pricing if we ever split species pricing — v1 uses a single price)
  speciesMix: SpeciesMix;
  // Q2: annual exam retail price in cents, USD
  annualExamCents: number;
  // Q3: dental (annual) retail in cents; 0 if excluded from any tier
  dentalCents: number;
  // Q4: core vaccine price per vaccine, cents
  vaccineCents: number;
  // Q5: core vaccine cadence
  vaccineCadence: VaccineCadence;
  // Q6: include heartworm prevention (monthly retail) in cents; 0 if omitted from all tiers
  heartwormMonthlyCents: number;
  // Q7: include flea/tick prevention (monthly retail) in cents; 0 if omitted from all tiers
  fleaTickMonthlyCents: number;
  // Q8: member discount 0–20% applied to total retail before per-month amortization
  memberDiscountPct: number;
  // Tier count: 2 or 3
  tierCount: 2 | 3;
};

export type ComputeOptions = {
  platformFeePct: number;  // 10 for v1 — passed explicitly so tests can vary it
  stripeFlatCents?: number; // default 30 cents per successful charge
  stripePercent?: number;   // default 0.029 (2.9%)
};

export type LineItem = {
  label: string;             // e.g. "Annual exam (bundled 1× / year)"
  retailCents: number;       // 0 if this tier excludes the service
  monthlyAmortizedCents: number; // retailCents / 12, rounded
};

export type TierQuote = {
  name: string;                       // "Preventive" / "Preventive Plus" / "Complete"
  monthlyFeeCents: number;            // member pays this / month
  retailBundledCents: number;         // pre-discount annual retail of all included services
  discountCents: number;              // memberDiscountPct applied to retail
  clinicGrossPerPetPerYearCents: number; // after Stripe + platform fee
  breakEvenMemberCount: number;       // ceil(fixedMonthlyOverhead / monthlyContribution)
  lineItems: LineItem[];              // per-service breakdown, including fees
};
```

### `computeTiers` signature and skeleton

```typescript
export function computeTiers(inputs: PlanInputs, opts: ComputeOptions): TierQuote[] {
  const {
    platformFeePct,
    stripeFlatCents = 30,
    stripePercent = 0.029,
  } = opts;

  const shapes = buildTierShapes(inputs.tierCount);  // from ./tiers.ts

  return shapes.map((shape) => {
    // 1) Build the per-tier line items from retail prices + service inclusion
    const lineItems: LineItem[] = buildLineItems(shape, inputs);

    // 2) Sum retail value (annualized)
    const retailBundled = lineItems.reduce((s, li) => s + li.retailCents, 0);

    // 3) Apply member discount
    const discount = Math.round(retailBundled * (inputs.memberDiscountPct / 100));
    const netAnnual = retailBundled - discount;

    // 4) Amortize to monthly fee (what the member pays per month)
    const monthlyFee = Math.round(netAnnual / 12);

    // 5) Per-charge Stripe fee: 2.9% + $0.30 per monthly charge
    const stripeFeePerMonth = Math.round(monthlyFee * stripePercent) + stripeFlatCents;

    // 6) Platform fee: 10% of monthlyFee (destination charges / application_fee_percent)
    const platformFeePerMonth = Math.round(monthlyFee * (platformFeePct / 100));

    // 7) Clinic gross per pet per year
    const clinicGrossPerPetPerYear =
      (monthlyFee - stripeFeePerMonth - platformFeePerMonth) * 12;

    // 8) Break-even: uses ESTIMATED fixed monthly overhead per clinic — see §Open Questions
    // For v1, we can OMIT fixed overhead input and instead show break-even as:
    //   "Members needed for this plan to cover its own Stripe + platform fees"
    // which is trivially 1 if monthlyFee > fees — and that framing is misleading.
    // Recommendation: PROMPT the owner for a "monthly clinic overhead target" input
    // OR defer the break-even-count display to Phase 3 and show only per-pet gross in Phase 1.
    // Decision needed — see Open Questions Q3.
    const breakEvenMemberCount = 0; // placeholder — see Open Questions

    // 9) Append Stripe + platform fee as EXPLICIT line items (MATH-05 mandate)
    lineItems.push({
      label: `Stripe processing (est. 2.9% + $0.30 / month)`,
      retailCents: 0,
      monthlyAmortizedCents: -stripeFeePerMonth, // negative = deduction
    });
    lineItems.push({
      label: `PawPlan platform fee (${platformFeePct}%)`,
      retailCents: 0,
      monthlyAmortizedCents: -platformFeePerMonth,
    });

    return {
      name: shape.name,
      monthlyFeeCents: monthlyFee,
      retailBundledCents: retailBundled,
      discountCents: discount,
      clinicGrossPerPetPerYearCents: clinicGrossPerPetPerYear,
      breakEvenMemberCount,
      lineItems,
    };
  });
}
```

**NOTE** — This function must be exported AND its whole transitive module graph must stay dep-free. Add this ESLint rule or equivalent:

```jsonc
// .eslintrc for lib/pricing/breakEven.ts
"no-restricted-imports": ["error", { "patterns": ["*"] }] // zero imports allowed
```

…or just keep it a single-file module with only a relative import of `tiers.ts`.

### Zod schema (shared by client form + server action)

```typescript
// src/lib/validation/builderSchema.ts
import { z } from 'zod';

export const builderSchema = z.object({
  speciesMix: z.object({
    dog: z.number().int().min(0).max(100),
    cat: z.number().int().min(0).max(100),
  }).refine(m => m.dog + m.cat === 100, 'Species mix must sum to 100%'),
  annualExamCents:       z.number().int().min(0).max(100_000),   // up to $1,000
  dentalCents:           z.number().int().min(0).max(500_000),   // up to $5,000
  vaccineCents:          z.number().int().min(0).max(30_000),    // up to $300 per vaccine
  vaccineCadence:        z.enum(['ANNUAL', 'TRIENNIAL']),
  heartwormMonthlyCents: z.number().int().min(0).max(20_000),    // up to $200/mo
  fleaTickMonthlyCents:  z.number().int().min(0).max(20_000),
  memberDiscountPct:     z.number().min(0).max(20),
  tierCount:             z.union([z.literal(2), z.literal(3)]),
});

export type BuilderAnswers = z.infer<typeof builderSchema>;
```

---

## 15-Scenario Test Plan (MATH-01 acceptance)

File: `src/lib/pricing/breakEven.test.ts`. Each scenario is a hand-verified case with an expected output comment. Framework: Vitest 4.1.5.

**Scenarios** (12 baseline + 3 edge):

| # | Description | Coverage |
|---|-------------|----------|
| 1 | 2-tier, 0% discount, 100% dog, ANNUAL vaccines, typical pricing ($75 exam, $35 vaccine, $250 dental) | Baseline 2-tier |
| 2 | 2-tier, 20% discount (max), same prices | Discount upper edge |
| 3 | 3-tier, 0% discount, 50/50 dog/cat mix | Baseline 3-tier, species mix |
| 4 | 3-tier, 20% discount, TRIENNIAL vaccines | Discount max + cadence variant |
| 5 | 3-tier, 10% discount, 100% cat, heartworm excluded | Species + excluded service |
| 6 | 2-tier, 5% discount, dental excluded from both tiers | Dental=0 case |
| 7 | 3-tier, 15% discount, vaccine retail $0 (included with exam) | Zero-value line item |
| 8 | 3-tier, 0% discount, maxed-out retail ($1000 exam, $5000 dental) | Upper-bound pricing |
| 9 | 2-tier, 20% discount, tiny retail ($10 exam only) | Lower-bound pricing |
| 10 | 3-tier, 10% discount, explicit Stripe fee validation | Verify Stripe line item sign + math |
| 11 | 3-tier, 10% discount, explicit platform fee validation | Verify 10% platform fee appears as negative line item |
| 12 | 2-tier, 0% discount, clinicGrossPerPetPerYear matches `monthlyFee × 12 × (1 − 0.10 − 0.029) − flat_fees × 12` | End-to-end margin math |
| 13 | Dog=100, Cat=0 — ensure speciesMix doesn't accidentally weight pricing in v1 | Species-mix UI-only (not price-affecting in v1) |
| 14 | `memberDiscountPct = 0` vs `= 0.0000001` produce identical integer-cent output | Rounding determinism |
| 15 | Same `PlanInputs` called twice returns deep-equal `TierQuote[]` | Determinism / purity |

Every scenario starts with a comment block:

```typescript
// Scenario 4: 3-tier, 20% discount, TRIENNIAL vaccines
// Inputs: exam=$75, dental=$250, vaccine=$45 @ triennial (=$15/yr amortized), heartworm=$20/mo, fleaTick=$18/mo
// Expected Tier 0 (Preventive):
//   retail = 75 + 15 = $90/yr = 9000¢
//   discount = 20% of 9000 = 1800¢
//   net = 7200¢ → monthlyFee = ceil(7200/12) = 600¢ ($6)
//   Stripe fee = 0.029*600 + 30 = 47¢
//   Platform fee = 0.10*600 = 60¢
//   clinicGross / pet / yr = (600 - 47 - 60) * 12 = 493 * 12 = 5916¢ ($59.16)
// ...
```

**Pitfall warning for tests:** Rounding. Every `Math.round` in the function must be replayed identically in the test comments — use the same `round` helper if one exists, and document HALF_UP vs HALF_EVEN. JavaScript's `Math.round` is HALF_UP for positive numbers, HALF_EVEN for banker-style... actually no — `Math.round` in JS is "round half away from zero" (== HALF_UP for positives). Document this choice inline.

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.5 + `@vitejs/plugin-react` for future React Testing Library tests |
| Config file | `vitest.config.ts` — to be created in Wave 0 |
| Quick run command | `pnpm vitest run src/lib/pricing/breakEven.test.ts` (< 5s) |
| Full suite command | `pnpm vitest run` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| FOUND-01 | Can create account | integration | `pnpm vitest run src/lib/auth/signup.test.ts` | ❌ Wave 0 |
| FOUND-02 | Session persists across browser sessions | e2e (Playwright) | `pnpm playwright test auth-session.spec.ts` | ❌ deferred to /browse-qa |
| FOUND-03 | Logs out from any page | e2e (Playwright) | `pnpm playwright test auth-session.spec.ts` | ❌ deferred to /browse-qa |
| FOUND-04 | RLS blocks cross-tenant reads | integration | `pnpm vitest run src/lib/db/withClinic.test.ts` | ❌ Wave 0 |
| FOUND-05 | Slug validation + reserved-word rejection | unit | `pnpm vitest run src/lib/slug/generate.test.ts` | ❌ Wave 0 |
| FOUND-06 | Clinic profile upsert with accent color enum | integration | `pnpm vitest run src/app/\\(dashboard\\)/settings/actions.test.ts` | ❌ Wave 0 |
| MATH-01 | `computeTiers` produces correct per-tier output | unit | `pnpm vitest run src/lib/pricing/breakEven.test.ts` | ❌ Wave 0 |
| BLDR-01 | Builder captures 8 questions with Zod validation | unit | `pnpm vitest run src/lib/validation/builderSchema.test.ts` | ❌ Wave 0 |
| BLDR-02 | 2-tier and 3-tier shapes have correct default names | unit | `pnpm vitest run src/lib/pricing/tiers.test.ts` | ❌ Wave 0 |
| BLDR-03 | Live recompute — pure-function property verified | unit | subset of `breakEven.test.ts` (determinism scenarios 14, 15) | ❌ Wave 0 |
| BLDR-04 | Draft-persistence substrate exists | integration | `pnpm vitest run src/app/\\(dashboard\\)/builder/actions.test.ts` | ❌ Wave 0 |
| BLDR-05 | `PlanDraft` upsert writes to DB and survives logout | integration | same as BLDR-04 | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `pnpm vitest run src/lib/pricing/breakEven.test.ts src/lib/slug/generate.test.ts` (~3s, covers the most-changing logic)
- **Per wave merge:** `pnpm vitest run` (full suite)
- **Phase gate:** `pnpm vitest run && pnpm playwright test` before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `vitest.config.ts` — project root, configure test env = `node` for pricing tests and `jsdom` for component tests
- [ ] `src/lib/pricing/breakEven.test.ts` — 15-scenario suite (MATH-01)
- [ ] `src/lib/pricing/tiers.test.ts` — default-name assertions (BLDR-02)
- [ ] `src/lib/slug/generate.test.ts` — reserved-word, normalization, collision-retry (FOUND-05)
- [ ] `src/lib/validation/builderSchema.test.ts` — Zod boundary conditions (BLDR-01)
- [ ] `src/lib/db/withClinic.test.ts` — RLS cross-tenant test: insert two clinics with one row each, call `withClinic(A)`, assert `findMany()` returns only A's rows and 0 of B's (FOUND-04)
- [ ] `src/app/(dashboard)/settings/actions.test.ts` — integration test via a test Postgres container or Neon branch (FOUND-06)
- [ ] `src/app/(dashboard)/builder/actions.test.ts` — draft upsert integration (BLDR-04, BLDR-05)
- [ ] A Playwright smoke test covering signup → login → logout → re-login persistence — can land at end of Phase 1 via `/browse-qa`

---

## Common Pitfalls (Phase-1 specific — filtered from PITFALLS.md §Pitfalls #3, #4, #5)

### Pitfall 1: Tenancy bleed because the base Prisma client leaked into a route

**What goes wrong:** A developer imports `@/lib/db/prisma` directly in a route handler or Server Action (instead of going through `withClinic`). Queries run without RLS context. The policy's `current_setting('app.current_clinic_id', true)` returns NULL → policy evaluates to NULL → row is filtered out... **except** for FORCE RLS, without FORCE RLS the table OWNER bypasses the policy entirely.

**Why it happens:** `lib/db/prisma.ts` has a named export `prisma` that autocompletes naturally — easy to mis-import.

**How to avoid:**
- `FORCE ROW LEVEL SECURITY` on every tenant table — makes owner bypass impossible.
- App connects as a non-owner role (`pawplan_app`, not the DB-provisioning role).
- ESLint `no-restricted-imports` rule on `@/lib/db/prisma` — only allowed in `@/lib/db/withClinic.ts`, `@/lib/auth.ts`, and migration files.
- Automated integration test (FOUND-04 above): create clinic A + clinic B each with 1 PlanDraft row, call `withClinic(A).planDraft.findMany()`, assert length === 1 and no B rows.

**Warning signs:** Any query that doesn't go through `withClinic()`, any `prisma.` autocomplete outside the three allowed files.

**Phase to address:** Phase 1 (this one). Explicitly listed in ROADMAP.md §Phase 1 success criterion #3.

### Pitfall 2: Better Auth `nextCookies` plugin not last in array → Server Action login silently fails

**What goes wrong:** User submits login form in a Server Action; `auth.api.signInEmail()` returns a user object, but no cookie is set because `nextCookies` wasn't last. Session is silently absent on the next request; user is bounced back to `/login`.

**Why it happens:** Plugin ordering matters — `nextCookies` wraps the response to forward Set-Cookie through Next's cookie API. Any later plugin may discard that wrap. [CITED: better-auth.com/docs/integrations/next]

**How to avoid:** Single line in `lib/auth.ts`: `plugins: [ ...otherPlugins, nextCookies() ]` — `nextCookies()` LAST. Add a comment in the file to preserve ordering across future edits.

**Warning signs:** Signup/login appears to succeed (no error) but user is not authenticated on next page. Session cookie absent in devtools.

### Pitfall 3: `SET` instead of `SET LOCAL` contaminates the pool

**What goes wrong:** Developer debugging in SQL console runs `SET app.current_clinic_id = 'abc'`. Next query on that pooled connection (from a DIFFERENT request) inherits clinic A's context and returns A's rows for user B.

**Why it happens:** `SET` is session-scoped; Neon's PgBouncer transaction-mode pool returns the connection to the pool after each transaction, but `SET` without `LOCAL` persists on the session until explicitly reset.

**How to avoid:**
- Use `SELECT set_config('app.current_clinic_id', $1, TRUE)` (the `TRUE` = is_local) — wipes at transaction end. [CITED: Prisma RLS extension repo]
- The Prisma extension wraps in `$transaction([])` — the set_config + query are atomic.
- Integration test: open two concurrent `withClinic()` calls on overlapping connections — they must not see each other's rows.

**Warning signs:** Intermittent cross-tenant leaks. Hard to reproduce. A test run that passes with one connection fails with pool size > 1.

### Pitfall 4: Slug reserved list drifts from actual route segments

**What goes wrong:** Team adds `app/(dashboard)/reports/page.tsx`. Someone registers a clinic with slug `reports`. Their enrollment URL is `/reports/enroll` — Next router tries to resolve `/reports/enroll` against the dashboard's `/reports/` route first and 404s / shows the wrong page depending on grouping.

**Why it happens:** `RESERVED_SLUGS` is hand-maintained; additions to `src/app/` aren't automatically mirrored.

**How to avoid:**
- Vitest test `src/lib/slug/reserved.test.ts`:
  ```typescript
  import { readdirSync } from 'node:fs';
  import { RESERVED_SLUGS } from './reserved';
  it('covers every top-level route segment', () => {
    const appDirs = readdirSync('src/app', { withFileTypes: true })
      .filter(d => d.isDirectory() && !d.name.startsWith('(') && !d.name.startsWith('_'))
      .map(d => d.name);
    for (const dir of appDirs) {
      expect(RESERVED_SLUGS.has(dir)).toBe(true);
    }
  });
  ```
- Code-review checklist line: "Did you add a top-level app route? Update `RESERVED_SLUGS`."

### Pitfall 5: Draft not rehydrating after logout

**What goes wrong:** User logs out mid-builder. Logs back in. `/builder` page loads empty — they lost their 7 questions of work.

**Why it happens:** Builder page reads from client state only, not from the `PlanDraft` row.

**How to avoid:**
- `/builder/page.tsx` is a **Server Component** that reads the `PlanDraft` row via `withClinic(clinicId).planDraft.findUnique({ where: { clinicId } })` and passes `answers` as `defaultValues` to the client `BuilderForm`.
- Integration test BLDR-05: create a draft, simulate a fresh session, hit `/builder`, assert the form is pre-populated.

### Pitfall 6: Break-even math rounding inconsistency → server-computed canonical diverges from client-previewed

**What goes wrong:** Phase 3 Publish re-runs `computeTiers` server-side. Server's `Math.round(7200 / 12) = 600` but client's earlier preview showed `601` because of an intermediate rounding step. Stripe Price created is $6.00 but the owner saw $6.01 in the preview → immediate trust loss.

**Why it happens:** Rounding at intermediate steps produces different results than rounding only at the end. Discipline: round at the SAME POINTS in client and server — because it's literally the same function, that's free.

**How to avoid:** The pure-function contract guarantees this. The ONLY way to break it is to have conditional code inside `computeTiers` (`if (typeof window !== 'undefined')`). Lint for that.

---

## Code Examples (verified patterns)

### Prisma schema (Phase 1 tables)

```prisma
// prisma/schema.prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

// ---------- Better Auth (migrations generated by `npx @better-auth/cli generate`) ----------
// Source: prisma.io/docs/guides/authentication/better-auth/nextjs (2026-04-23)

model User {
  id            String    @id
  name          String
  email         String    @unique
  emailVerified Boolean
  image         String?
  createdAt     DateTime
  updatedAt     DateTime

  sessions  Session[]
  accounts  Account[]
  clinic    Clinic?   // 1:1 — a user owns one clinic (v1)

  @@map("user")
}

model Session {
  id        String   @id
  expiresAt DateTime
  token     String   @unique
  createdAt DateTime
  updatedAt DateTime
  ipAddress String?
  userAgent String?
  userId    String
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@map("session")
}

model Account {
  id                    String    @id
  accountId             String
  providerId            String
  userId                String
  user                  User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  password              String?   // hashed by Better Auth
  accessToken           String?
  refreshToken          String?
  idToken               String?
  accessTokenExpiresAt  DateTime?
  refreshTokenExpiresAt DateTime?
  scope                 String?
  createdAt             DateTime
  updatedAt             DateTime

  @@map("account")
}

model Verification {
  id         String    @id
  identifier String
  value      String
  expiresAt  DateTime
  createdAt  DateTime?
  updatedAt  DateTime?

  @@map("verification")
}

// ---------- PawPlan tenant tables ----------

enum AccentColor {
  SAGE
  CORAL
  INDIGO
  AMBER
  TEAL
  ROSE
}

model Clinic {
  id           String      @id @default(cuid())
  ownerUserId  String      @unique
  owner        User        @relation(fields: [ownerUserId], references: [id], onDelete: Cascade)
  slug         String      @unique
  practiceName String
  logoUrl      String?
  accentColor  AccentColor @default(SAGE)
  createdAt    DateTime    @default(now())
  updatedAt    DateTime    @updatedAt

  planDraft    PlanDraft?

  @@index([slug])
}

model PlanDraft {
  id        String   @id @default(cuid())
  clinicId  String   @unique
  clinic    Clinic   @relation(fields: [clinicId], references: [id], onDelete: Cascade)
  answers   Json
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([clinicId])
}
```

### Signup Server Action (FOUND-01)

```typescript
// src/app/(auth)/signup/actions.ts
'use server';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/db/prisma';
import { resolveUniqueSlug } from '@/lib/slug/generate';

const signupSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(128),
  practiceName: z.string().min(2).max(80),
  desiredSlug: z.string().min(3).max(40),
});

export async function signupAction(formData: FormData) {
  const parsed = signupSchema.parse(Object.fromEntries(formData));

  // 1) Reserve the slug first — fail fast if reserved or colliding
  const slug = await resolveUniqueSlug(
    parsed.desiredSlug,
    async (s) => !!(await prisma.clinic.findUnique({ where: { slug: s } })),
  );

  // 2) Better Auth creates the user + hashed password + session cookie (via nextCookies plugin)
  const result = await auth.api.signUpEmail({
    body: {
      email: parsed.email,
      password: parsed.password,
      name: parsed.practiceName, // stored on User.name
    },
  });

  // 3) Create the clinic row, linked 1:1 to the new user
  await prisma.clinic.create({
    data: {
      ownerUserId: result.user.id,
      slug,
      practiceName: parsed.practiceName,
      // accentColor defaults to SAGE; user edits in settings
    },
  });

  redirect('/dashboard');
}
```

### Builder page (Server Component seeds client form with draft)

```typescript
// src/app/(dashboard)/builder/page.tsx
import { resolveClinic } from '@/lib/tenant/resolveClinic';
import { withClinic } from '@/lib/db/withClinic';
import { BuilderForm } from '@/components/builder/BuilderForm';
import { redirect } from 'next/navigation';

export default async function BuilderPage() {
  const ctx = await resolveClinic();
  if (!ctx) redirect('/login');

  const db = withClinic(ctx.clinic.id);
  const draft = await db.planDraft.findUnique({ where: { clinicId: ctx.clinic.id } });

  return <BuilderForm defaultValues={draft?.answers ?? undefined} clinicId={ctx.clinic.id} />;
}
```

```typescript
// src/components/builder/BuilderForm.tsx
'use client';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMemo, useEffect } from 'react';
import { builderSchema, BuilderAnswers } from '@/lib/validation/builderSchema';
import { computeTiers } from '@/lib/pricing/breakEven';
import { upsertPlanDraft } from '@/app/(dashboard)/builder/actions';
import { TierPreview } from './TierPreview';
// debounce — 20 lines you can inline, or use lodash-debounce / use-debounce

export function BuilderForm({ defaultValues }: { defaultValues?: Partial<BuilderAnswers>; clinicId: string }) {
  const form = useForm<BuilderAnswers>({
    resolver: zodResolver(builderSchema),
    defaultValues: { ...DEFAULT_ANSWERS, ...defaultValues },
  });
  const values = useWatch({ control: form.control });

  // 1) Live recompute (pure function, sub-ms)
  const tiers = useMemo(
    () => (builderSchema.safeParse(values).success ? computeTiers(values as BuilderAnswers, { platformFeePct: 10 }) : null),
    [values],
  );

  // 2) Debounced persistence (400ms)
  useEffect(() => {
    const id = setTimeout(() => {
      if (builderSchema.safeParse(values).success) void upsertPlanDraft(values);
    }, 400);
    return () => clearTimeout(id);
  }, [values]);

  return (
    <div className="grid grid-cols-[1fr_400px] gap-8">
      <form className="space-y-6">{/* 8 question components */}</form>
      <aside>{tiers && <TierPreview tiers={tiers} />}</aside>
    </div>
  );
}
```

---

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | **yes** | Better Auth 1.6 — password hashing, session rotation, timing-safe compares built-in |
| V3 Session Management | **yes** | Better Auth cookies: HttpOnly + Secure + SameSite=Lax; 7d expiry with 24h rolling refresh |
| V4 Access Control | **yes** | Postgres RLS (FORCE) + Prisma `withClinic` extension + route-group auth gate in `proxy.ts` |
| V5 Input Validation | **yes** | Zod 4 schemas on every Server Action and form; slug regex + reserved-list |
| V6 Cryptography | **yes (delegated)** | Never hand-roll — Better Auth for passwords; `gen_random_uuid()` / `cuid()` for IDs |
| V7 Error Handling | yes | Server Actions never leak raw errors to the client; use Zod flattened errors |
| V8 Data Protection | yes | Session cookies only; no PII in logs; `practiceName` + `email` are the only PII in Phase 1 |
| V13 API & Web Service | partial | Only `/api/auth/[...all]` is exposed; signature verification lives in Phase 4 webhooks |
| V14 Configuration | yes | Secrets via env vars only; `.env.local` gitignored; production secrets in Vercel env |

### Known Threat Patterns for Phase 1

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Cross-tenant read via missing `WHERE clinic_id` | Information Disclosure | FORCE RLS + Prisma extension + non-owner DB role |
| Slug squatting of route-reserved name | Spoofing | `RESERVED_SLUGS` blocklist + build-time drift test |
| Homoglyph slug (Cyrillic `і` vs Latin `i`) | Spoofing | ASCII-only regex after NFKD normalize |
| Session fixation | Spoofing | Better Auth rotates session on login (default) |
| Session hijack via XSS | Session hijack | HttpOnly cookie (Better Auth default) + CSP on all pages (v1 can start permissive, lock down in Phase 3 for enrollment page) |
| Password spraying / brute force | Spoofing | Better Auth rate limiting built-in; add `rateLimit: { enabled: true }` to auth config |
| Enumeration via signup error | Information Disclosure | Return generic "email or password invalid" (Better Auth default) |
| Server Action CSRF | Tampering | Next.js Server Actions include origin/same-site checks by default in 15+ |
| SQL injection | Tampering | Prisma parameterized queries; `$executeRaw` only used with template-literal bindings |

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `middleware.ts` in Next.js | `proxy.ts` (Next 16) | Next 16 GA (late 2025) | Rename required; function named `proxy` [CITED: nextjs.org Next 16 release notes] |
| NextAuth v4 / Auth.js v5-beta | Better Auth 1.6 stable | 2025-2026 — Auth.js merged into Better Auth [CITED: better-auth.com/docs] | Phase 1 uses Better Auth 1.6.7 |
| `driverAdapters` as Prisma preview feature | Stable in Prisma 7 | Prisma 7.0 GA | No `previewFeatures = ["driverAdapters"]` needed in generator block [ASSUMED: Prisma 7 docs; planner should confirm at plan-check by reading current Prisma 7 schema docs] |
| `@neondatabase/serverless` + `ws` installed separately | Bundled in `@prisma/adapter-neon` | Prisma 7 + adapter-neon releases | Do not install separately [CITED: neon.com/docs/guides/prisma] |
| Manual `WHERE clinicId =` filtering | Postgres RLS + Prisma `$extends` pattern | RLS has been stable in Postgres 9.5+; Prisma extensions stable since 4.16 | Enforced at client construction, can't forget |
| `SET tenant_id` (session-scoped) | `SET LOCAL` via `set_config(..., TRUE)` | PgBouncer transaction-mode pooling | Neon uses PgBouncer transaction mode by default [CITED: neon.com/docs/connect/connection-pooling] |

**Deprecated / outdated:**
- Pages Router → App Router only.
- `useEffect` for data loading → Server Components + Server Actions.
- NextAuth v4 → feature-frozen.

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Prisma 7 has `driverAdapters` as stable (not preview) | State of the Art, Pattern 1 | If still preview, add `previewFeatures = ["driverAdapters"]` to generator block. Low risk — one line. |
| A2 | The 6-color accent palette is SAGE / CORAL / INDIGO / AMBER / TEAL / ROSE | Prisma Schema | Daniel picks the actual colors; enum values are easy to change pre-migration. |
| A3 | The default service-inclusion matrix (`DEFAULT_TIER_SERVICES`) is correct for v1 product intent | Pattern 6 | **Needs Daniel's confirmation.** Wrong defaults → break-even numbers feel wrong → RAT failure. |
| A4 | Break-even = "members needed to cover clinic overhead" requires a **9th input** (fixed monthly overhead) that's NOT in BLDR-01's listed 8 inputs | Break-Even Pure Function Shape | **Needs product decision.** See Open Questions Q3. |
| A5 | Rounding convention is JavaScript's default `Math.round` (half away from zero for positives) | Break-Even test scenarios | Low risk if documented; breaks if Phase 3 canonical computation uses a different rounding. |
| A6 | Reserved-slug list covers all planned top-level routes for Phases 1–6 | Slug Generation | Build-time drift test catches additions; list is easy to extend. |
| A7 | Phase 1 ships within the `pawplan/` Next.js app repo (either `apps/pawplan/` in fonnit monorepo or separate `fonnit/pawplan` repo per `/build-app-gsd`) | Project Structure | Which location is a planner decision — confirm at plan-check. |
| A8 | FOUND-02 "stays logged in across browser sessions" means 7-day session expiry with 24h rolling refresh is acceptable | Better Auth config | Reasonable default; Daniel can tune later. |
| A9 | The 10% platform fee lives in `ComputeOptions.platformFeePct` (passed explicitly) NOT as a constant in `breakEven.ts` | Break-Even Pure Function Shape | Lets Phase 3 server-side canonical pass the same 10% without hardcoding; also makes tests vary the value. |
| A10 | Email verification is NOT required in Phase 1 (FOUND-01 says "email + password" — no mention of verification) | Better Auth config | Confirm at plan-check; adding verification is a single `emailVerification: { sendOnSignUp: true, ... }` config change plus a Resend dep (which is already in STACK.md for Phase 5). |

**Assumptions marked A3 and A4 are product-design calls — the planner should route them to `/gsd-discuss-phase` or flag for Daniel before Wave 1 execution.**

---

## Open Questions

1. **Q1: Where does PawPlan live on disk?** Two candidates:
   - `apps/pawplan/` inside this `fonnit` monorepo (implied by CLAUDE.md: "apps live in their own folder and repo `fonnit/{app-name}`, not here"), OR
   - Fresh clone of `fonnit/pawplan` as a sibling to the fonnit repo.
   - What we know: `/Users/dfonnegrag/Projects/fonnit/apps/pawplan/` already exists (per git status `?? apps/pawplan/`). Planning artifacts live in `/Users/dfonnegrag/Projects/pawplan/.planning/` (sibling).
   - Recommendation: The app code ships to `fonnit/pawplan` (separate public repo per `/build-app-gsd`). Confirm at plan-check.

2. **Q2: What are the 6 accent-palette colors?**
   - What we know: Locked as "6-color preset palette" — 6 specific colors not named.
   - What's unclear: Which 6. Phase 1 only needs the enum labels; actual hex values can wait for the CSS layer (Phase 3 enrollment page).
   - Recommendation: Propose `SAGE / CORAL / INDIGO / AMBER / TEAL / ROSE` (warm/cool balance, vet-friendly tones). Daniel picks before the first migration commits.

3. **Q3 (MOST IMPORTANT): "Break-even member count" needs an input that isn't in BLDR-01's 8 questions.**
   - What we know: MATH-01 says "break-even member count" is an output; BLDR-01 lists 8 inputs (species mix, exam price, dental price, vaccine cadence + price, heartworm, flea/tick, discount, tier count). There's no **fixed monthly overhead** input.
   - What's unclear: Break-even requires dividing overhead by per-member monthly contribution. Without overhead, "break-even member count" is undefined.
   - Options:
     - (a) Add a 9th question: "How much does your clinic need to earn from plans each month to make this worthwhile? (fixed monthly overhead target)". Changes BLDR-01.
     - (b) Redefine "break-even" as "per-pet-per-year clinic gross" only — remove `breakEvenMemberCount` from `TierQuote` for Phase 1; leave it for Phase 3 post-publish analytics against real enrollments.
     - (c) Use a hardcoded assumption (e.g. $3,000/mo clinic overhead) and flag it as editable in Phase 6's dashboard.
   - Recommendation: **Option (a)** — add the 9th input. The word "break-even" is a specific accounting concept and faking it dilutes the RAT ("break-even trust"). Route to `/gsd-discuss-phase` before planning.

4. **Q4: Does FOUND-01 require email verification?**
   - What we know: "Create an account with email + password." No mention of verification.
   - Recommendation: **No** for v1 — reduces friction on first-use demo flow. Can enable in Phase 5 when Resend is already wired.

5. **Q5: Is `ownerUserId` 1:1 with `Clinic` in v1, or do we allow a user to own multiple clinics?**
   - What we know: MVP-SPEC says "one clinic = one account = one Stripe Connect Express account. Two locations = two accounts."
   - Recommendation: **1:1 enforced at schema level** — `Clinic.ownerUserId String @unique`. A second clinic = a second user account. Written into the schema above.

---

## Sources

### Primary (HIGH confidence)
- `npm view better-auth version` → `1.6.7` (2026-04-23) [VERIFIED]
- `npm view prisma version` → `7.8.0` (2026-04-23) [VERIFIED]
- `npm view @prisma/adapter-neon version` → `7.8.0` (2026-04-23) [VERIFIED]
- [Better Auth — Installation](https://better-auth.com/docs/installation) — Prisma adapter pattern, toNextJsHandler
- [Better Auth — Next.js integration](https://better-auth.com/docs/integrations/next) — nextCookies plugin, proxy.ts example, Server Action cookie handling
- [Prisma — Better Auth + Next.js guide](https://www.prisma.io/docs/guides/authentication/better-auth/nextjs) — full Prisma schema for Better Auth
- [Prisma RLS extension](https://github.com/prisma/prisma-client-extensions/tree/main/row-level-security) — official `$extends` pattern with `set_config(..., TRUE)`
- [Neon — Connect from Prisma](https://neon.com/docs/guides/prisma) — `PrismaNeon` adapter setup; adapter bundles `@neondatabase/serverless` + `ws`
- [Neon — Connection pooling](https://neon.com/docs/connect/connection-pooling) — PgBouncer transaction mode; `SET LOCAL` is required

### Secondary (MEDIUM confidence)
- [Achour/nextjs-better-auth proxy.ts](https://github.com/Achour/nextjs-better-auth/blob/main/proxy.ts) — reference implementation of the session-cookie gate
- [Franco Labuschagne — Securing Multi-Tenant Apps with RLS and Prisma](https://medium.com/@francolabuschagne90/securing-multi-tenant-applications-using-row-level-security-in-postgresql-with-prisma-orm-4237f4d4bd35) — FORCE ROW LEVEL SECURITY pattern; non-owner-role requirement
- [LogRocket — Next.js Auth Library Comparison 2026](https://blog.logrocket.com/best-auth-library-nextjs-2026/) — confirms Auth.js v5 still beta, Better Auth is the 2026 default

### Inherited (from prior research — HIGH confidence)
- `.planning/research/STACK.md` (2026-04-23) — full stack inventory, versions, alternatives
- `.planning/research/ARCHITECTURE.md` (2026-04-23) — component layout, RLS pattern, pure-function math pattern
- `.planning/research/PITFALLS.md` (2026-04-23) — pitfalls #3 (break-even math), #4 (tenancy bleed), #5 (slug collisions)
- `.planning/REQUIREMENTS.md` (2026-04-23) — 12 Phase-1 requirements + locked product decisions
- `.planning/ROADMAP.md` (2026-04-23) — Phase-1 goal and success criteria

---

## Metadata

**Confidence breakdown:**
- Standard stack: **HIGH** — versions verified via `npm view` today; all libraries covered by STACK.md
- Architecture (RLS + Prisma extension + Better Auth): **HIGH** — official patterns, cross-verified
- Break-even pure-function shape: **MEDIUM** — pattern is HIGH; the exact `breakEvenMemberCount` definition requires Daniel's Q3 decision
- Slug generation: **HIGH** — pattern is well-established; list contents are **MEDIUM** (easy to extend)
- Pitfalls: **HIGH** — all carried forward from PITFALLS.md + verified against official Neon / Better Auth / Prisma docs
- Assumptions A3, A4: **LOW until product confirmation** — they're the two items that, if wrong, cost the most rework

**Research date:** 2026-04-23
**Valid until:** 2026-05-23 (30 days — stable stack; re-check `npm view better-auth` monthly if delaying implementation)
