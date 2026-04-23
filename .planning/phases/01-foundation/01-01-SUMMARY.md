---
phase: 01-foundation
plan: 01
subsystem: scaffold
tags: [scaffold, next16, tailwind4, prisma7, shadcn, vitest]
requires: []
provides: [FOUND-01-scaffold]
affects: [all-phase-01-plans]
tech-stack:
  added:
    - next@16.2.4
    - react@19.2.5
    - react-dom@19.2.5
    - typescript@6.0.3
    - tailwindcss@4.2.4
    - prisma@7.8.0
    - "@prisma/client@7.8.0"
    - "@prisma/adapter-neon@7.8.0"
    - "@neondatabase/serverless@1.1.0"
    - better-auth@1.6.7
    - stripe@22.0.2
    - resend@6.0.3
    - "@react-pdf/renderer@4.5.1"
    - zod@4.3.6
    - react-hook-form@7.73.1
    - "@hookform/resolvers@5.2.2"
    - date-fns@4.1.0
    - lucide-react@1.8.0
    - sonner@2.0.7
    - clsx@2.1.1
    - tailwind-merge@3.5.0
    - vitest@4.1.5
    - "@playwright/test@1.59.1"
    - prettier@3.8.3
    - eslint@10.2.1
    - eslint-config-next@16.2.4
    - dotenv@17.4.2
key-files:
  created:
    - package.json
    - pnpm-lock.yaml
    - tsconfig.json
    - next.config.ts
    - postcss.config.mjs
    - eslint.config.mjs
    - .prettierrc.json
    - .env.example
    - .gitignore
    - prisma/schema.prisma
    - prisma.config.ts
    - src/app/layout.tsx
    - src/app/page.tsx
    - src/app/globals.css
    - src/lib/env.ts
    - src/lib/db.ts
    - src/lib/utils.ts
    - src/lib/smoke.test.ts
    - components.json
    - vitest.config.ts
    - "src/components/ui/*.tsx (16 primitives)"
  modified: []
decisions:
  - "Prisma 7 moves datasource URLs from schema.prisma to prisma.config.ts — kept driverAdapters preview-feature literal in schema for Plan-03 grep"
  - "PawPlan warm palette (HSL) restored to globals.css after shadcn init clobbered it with oklch defaults"
  - "Turbopack workspace root pinned in next.config.ts to suppress multi-lockfile warning"
metrics:
  duration: ~10m
  completed: 2026-04-23
---

# Phase 01 Plan 01: Scaffold Summary

Next.js 16.2.4 + React 19.2 + TypeScript 6 + Tailwind v4 + Prisma 7.8 (Neon adapter) + shadcn/ui (New York + slate + CSS vars) + Vitest 4, all pinned per STACK.md, with the PawPlan warm off-white + sage-teal palette wired as HSL CSS variables for shadcn primitives to consume.

## Scope

- Full project scaffold with pinned deps (not `latest`) — every version in STACK.md honored.
- TypeScript strict + `noUncheckedIndexedAccess` + `typedRoutes`.
- Prisma Client + Neon serverless adapter wired in `src/lib/db.ts`.
- 16 shadcn/ui primitives under `src/components/ui/` (the 14 required by UI-SPEC plus `card` and `label` which `shadcn init` added by default).
- `src/lib/env.ts` validates DATABASE_URL, BETTER_AUTH_SECRET, NEXT_PUBLIC_APP_URL, BETTER_AUTH_URL via Zod at module load.
- Vitest config + smoke test; `pnpm test` passes with exit 0.
- `pnpm build` passes with a stub `.env.local` — ready for Wave 2 plans to layer on.

## Shadcn init choices

| Option | Value |
|---|---|
| Style | new-york |
| Base color | slate |
| CSS variables | yes |
| RSC | yes |
| TSX | yes |
| Icon library | lucide-react |

`components.json` hand-corrected after init: the tool defaulted to `style: "base-nova"` + `baseColor: "neutral"` despite the `--defaults` flag; overridden back to `new-york` / `slate` per UI-SPEC line 30 before any primitives were installed, then primitives were added with `--overwrite` so all 14 ship in the correct style.

## Env vars declared in `.env.example`

```
DATABASE_URL=
DATABASE_URL_UNPOOLED=
NEXT_PUBLIC_APP_URL=http://localhost:3000
BETTER_AUTH_SECRET=
BETTER_AUTH_URL=http://localhost:3000
```

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Prisma 7 moved datasource URLs to prisma.config.ts**
- **Found during:** Task 2 (`prisma generate`)
- **Issue:** Prisma 7.8 errored with `The datasource property 'url' is no longer supported in schema files` and `The datasource property 'directUrl' is no longer supported in schema files`. Plan 01-01 Task 2 step 1 instructs to put `url = env("DATABASE_URL")` + `directUrl = env("DATABASE_URL_UNPOOLED")` in `schema.prisma` — that shape is Prisma 6 and earlier.
- **Fix:** Moved `url` and the unpooled fallback into `prisma.config.ts` (`datasource.url`). Installed `dotenv` as dev-dep so the config can load `.env.local`. `prisma/schema.prisma` keeps the `generator client` block with `previewFeatures = ["driverAdapters"]` (kept literally so Plan 01-03's grep still matches, even though the feature is GA in Prisma 7 and emits a deprecation warning).
- **Files modified:** `prisma.config.ts`, `prisma/schema.prisma`
- **Commit:** `a18ef9d`

**2. [Rule 1 - Bug] Shadcn init overwrote globals.css with oklch defaults**
- **Found during:** Task 2 (`shadcn init`)
- **Issue:** Shadcn 3.x init clobbered the PawPlan HSL palette (sage-teal primary `168 45% 34%`) with its own oklch neutral defaults. It also injected `@import "tw-animate-css"` and `@import "shadcn/tailwind.css"` lines which aren't installed packages and would break the Tailwind v4 build.
- **Fix:** Rewrote `src/app/globals.css` with the PawPlan palette from UI-SPEC lines 102-128, kept Tailwind v4 `@custom-variant dark` and `@theme inline` blocks, added a `.dark` palette, and dropped the bogus imports.
- **Files modified:** `src/app/globals.css`
- **Commit:** `a18ef9d`

**3. [Rule 3 - Blocking] Shadcn init defaulted to style base-nova / baseColor neutral**
- **Found during:** Task 2 (`shadcn init`)
- **Issue:** Despite `--defaults --force`, the CLI wrote `style: "base-nova"` + `baseColor: "neutral"` to `components.json`. Plan 01-01 acceptance criteria greps for `"style": "new-york"`.
- **Fix:** Patched `components.json` to `style: "new-york"` + `baseColor: "slate"` before running the primitive-add step, so every primitive lands in the correct style.
- **Files modified:** `components.json`
- **Commit:** `a18ef9d`

### Auth Gates

None.

## Issues encountered with `create-next-app` on non-empty directory

`create-next-app@16` was **not used** because the directory already contained `MVP-SPEC.md` + `.planning/`. Instead, package.json, tsconfig.json, next.config.ts, postcss.config.mjs, eslint.config.mjs, globals.css, layout.tsx, and page.tsx were hand-authored to match the shape `create-next-app --typescript --tailwind --app --eslint --src-dir --import-alias "@/*"` produces. `pnpm build` confirms the scaffold compiles cleanly.

`tsconfig.json` was auto-rewritten by `next build` on first run — it expanded `"include"` to add `.next/dev/types/**/*.ts` and set `jsx: "react-jsx"` (the mandatory automatic-runtime value). Accepted as-is.

## Known Stubs

None — scaffold plan, no app logic yet.

## Self-Check: PASSED

- `package.json` exists — FOUND
- `pnpm-lock.yaml` exists — FOUND
- `tsconfig.json` with `"strict": true` — FOUND
- `src/lib/env.ts` with Zod validation — FOUND
- `src/lib/db.ts` with `PrismaNeon` — FOUND
- `src/app/globals.css` with `--primary: 168 45% 34%` — FOUND
- `components.json` with `"style": "new-york"` — FOUND
- 16 shadcn primitives under `src/components/ui/*.tsx` — FOUND
- `prisma/schema.prisma` with `driverAdapters` preview feature — FOUND
- `vitest.config.ts` — FOUND
- `src/lib/smoke.test.ts` passes — FOUND (pnpm test exit 0)
- `pnpm typecheck` — PASS
- `pnpm build` — PASS
- Commits `7d45679` and `a18ef9d` — FOUND in git log
