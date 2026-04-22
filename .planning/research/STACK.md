# Stack Research

**Domain:** Multi-tenant SaaS web app — Stripe Connect Express recurring billing, branded public enrollment pages, authenticated owner dashboard, transactional email with PDF attachments
**Researched:** 2026-04-23
**Confidence:** HIGH (all versions verified via `npm view` on 2026-04-23; architecture patterns verified via official Next.js / Prisma / Stripe / Neon / Vercel docs)

---

## TL;DR — The Pick

**Next.js 16.2 (App Router) + React 19.2 + TypeScript 6 + Tailwind v4 + shadcn/ui, deployed on Vercel, backed by Neon Postgres accessed through Prisma 7.8, authenticated with Better Auth 1.6, billing via `stripe@22` (Connect Express + Subscriptions + Checkout + webhooks), transactional email via Resend 6 + React Email, PDF welcome packet via `@react-pdf/renderer@4`, validation via Zod 4, E2E via Playwright, CI via GitHub Actions.**

This is the path of least resistance for a FonnIT-built MVP that must ship fast, run cheap, persist data across sessions, and survive real Stripe webhooks on `pawplan.demos.fonnit.com`. No deviations from the default constraint are required.

---

## Recommended Stack

### Core Technologies

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| **Next.js** | `16.2.4` | Full-stack React framework (App Router, Server Actions, Route Handlers) | The current stable release. App Router is the default. Server Actions cover form posts, Route Handlers cover Stripe webhooks. Single deployment target on Vercel → one command to ship. **HIGH confidence.** |
| **React** | `19.2.5` | UI library | Pinned by Next 16. Server Components + `useFormStatus` / `useActionState` remove a lot of boilerplate on the builder wizard. **HIGH confidence.** |
| **TypeScript** | `6.0.3` | Type safety | Strict mode mandatory. Stripe types + Prisma-generated types catch most billing bugs at compile time. **HIGH confidence.** |
| **Node.js runtime** | `22 LTS` (Vercel default) | Server runtime | Node 22 is Vercel's default Node runtime in 2026. Required by `stripe@22` (ES6 class constructor, no callbacks). **HIGH confidence.** |
| **pnpm** | `10.33.1` | Package manager | Faster installs, strict hoisting catches phantom-dependency bugs, first-class on Vercel. **HIGH confidence.** |
| **Tailwind CSS** | `4.2.4` | Styling | v4 ships a Rust-based Oxide engine, zero-config via `@import "tailwindcss"`, works with Next 16. **HIGH confidence.** |
| **shadcn/ui** | latest (copy-in, not versioned) | UI components | Unstyled Radix primitives + Tailwind classes, pasted into the repo — no runtime dep. Ships with Next 16 / React 19 / Tailwind v4 templates. Best option for the owner dashboard + enrollment page without hand-rolling every component. **HIGH confidence.** |
| **Neon Postgres** | Serverless Postgres (Marketplace) | Primary DB (persistent — never ephemeral) | Vercel Postgres was retired Dec 2024; Neon is now the default via Vercel Marketplace. Branching per PR, scale-to-zero, free tier = 0.5 GB + 190 compute hours/mo (sufficient for MVP). `DATABASE_URL` injected automatically. **HIGH confidence.** |
| **Prisma ORM** | `7.8.0` (prisma + @prisma/client) | Type-safe DB access + migrations | Industry-standard TS ORM. v7 ships a faster compiler and better serverless support. Migrations via `prisma migrate deploy` in CI. Generated types flow into Server Actions for end-to-end safety. **HIGH confidence.** |
| **@neondatabase/serverless** | `1.1.0` | HTTP/WebSocket Postgres driver for serverless | Paired with Prisma's Neon adapter: eliminates the cold-start TCP handshake on Vercel Functions. Required for acceptable p95 latency on the dashboard + webhooks. **HIGH confidence.** |
| **Better Auth** | `1.6.7` | Email/password auth for clinic owners | Auth.js v5 is still in beta and Auth.js has merged into Better Auth. Better Auth 1.6 ships stable email/password, Prisma adapter, session management, and has a cleaner Next 16 App Router integration than NextAuth. Single auth dependency — no OAuth providers needed for MVP. **HIGH confidence.** |
| **Stripe Node SDK** | `stripe@22.0.2` | Connect Express + Subscriptions + Checkout + webhooks | Pinned to Stripe API version `2026-03-25.dahlia`. v22 requires `new Stripe(...)` (ES6 class) and async/await — no callbacks. The only supported Node SDK generation. **HIGH confidence.** |
| **Stripe webhook signature verification** | via `stripe.webhooks.constructEvent` | Validate Checkout + Subscription + Connect events | Mandatory for `checkout.session.completed`, `invoice.payment_succeeded`, `invoice.payment_failed`, `account.updated`, `customer.subscription.deleted`. Route Handler with `runtime = 'nodejs'` + raw body. **HIGH confidence.** |
| **Resend** | `resend@6.0.3` | Transactional email (welcome packet + failed-charge + owner notification) | Sends from verified domain, accepts PDF as base64 `content` field or remote `path`, 40 MB cap per email — far more than a welcome PDF needs. Free tier = 3 000 emails/mo + 100/day (ample for MVP). **HIGH confidence.** |
| **React Email** | `@react-email/components@0.4.x` (peer of resend) | Author emails as React components | Renders to HTML string → handed to Resend. Same JSX mental model as the rest of the app. **HIGH confidence.** |
| **@react-pdf/renderer** | `4.5.1` | PDF welcome packet | Pure JS, renders PDFs to a Buffer server-side (`renderToBuffer`) — works on Vercel's Node runtime. No headless Chrome, no `puppeteer-core`, no 250 MB bundle. **HIGH confidence.** |
| **Zod** | `4.3.6` | Runtime validation | Validates the 8-question plan builder inputs, webhook payloads, and Server Action inputs. Zod 4 adds `.brand()` and much better TS 6 inference. **HIGH confidence.** |
| **Vercel** | (platform) | Hosting target for `pawplan.demos.fonnit.com` | Native Next.js host, preview deploys per PR, env var management, automatic HTTPS, Neon Marketplace integration. Hobby tier sufficient for demo traffic. **HIGH confidence.** |
| **GitHub Actions** | (CI) | Typecheck + lint + test + prisma migrate validate on PR | Vercel handles build/deploy; GitHub Actions gates correctness before Vercel ships. No extra infra. **HIGH confidence.** |

### Supporting Libraries

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `react-hook-form` | `7.73.1` | Form state for the 8-question plan builder + enrollment form | Any form with >3 fields. Pairs with `@hookform/resolvers` + Zod for unified validation. |
| `@hookform/resolvers` | `5.2.2` | Bridge RHF ↔ Zod schemas | Always, when using RHF + Zod. |
| `lucide-react` | `1.8.0` | Icon set | Default icon lib for shadcn/ui. |
| `clsx` | `2.1.1` + `tailwind-merge@3.5.0` | `cn()` helper for conditional classes | Installed automatically by shadcn init. |
| `date-fns` | `4.1.0` | Date math for next-billing-date + 30-day renewal forecast | Everywhere a date is computed or formatted. Tree-shakes better than Moment/Day.js. |
| `@tanstack/react-query` | `5.99.2` | Client-side data fetching + cache for dashboard | Only on the owner dashboard (live MRR, member list). Server Components cover the rest — do not install until a dashboard needs polling. |
| `slugify` (or manual) | n/a | Generate `{clinic-slug}` from practice name | Used once during Publish. Manual regex is fine; no need for a dep. |

### Development Tools

| Tool | Purpose | Notes |
|------|---------|-------|
| **ESLint** `10.2.1` + `eslint-config-next` | Lint | Next ships its own flat-config preset; use it as-is. |
| **Prettier** `3.8.3` | Format | With `prettier-plugin-tailwindcss` for class sorting. |
| **Vitest** `4.1.5` | Unit tests | Break-even math must be unit-tested — this is the riskiest-assumption logic. |
| **Playwright** `1.59.1` (`@playwright/test`) | E2E | One smoke test for the full critical path: onboard → build → publish → enroll (Stripe test card) → dashboard row. Required by `/browse-qa`. |
| **Prisma Studio** | `prisma studio` | Local DB inspection during dev. |
| **Stripe CLI** | `stripe listen --forward-to localhost:3000/api/webhooks/stripe` | Mandatory during webhook development. No way to ship Stripe Connect without it. |
| **Vercel CLI** | `vercel`, `vercel env pull` | Sync env vars locally. |

---

## Installation

```bash
# Scaffold
pnpm create next-app@16.2.4 pawplan --typescript --tailwind --app --eslint --src-dir --import-alias "@/*"
cd pawplan

# shadcn/ui
pnpm dlx shadcn@latest init
pnpm dlx shadcn@latest add button card input label form table dialog toast badge

# Core
pnpm add \
  prisma@7.8.0 @prisma/client@7.8.0 @neondatabase/serverless@1.1.0 \
  better-auth@1.6.7 \
  stripe@22.0.2 \
  resend@6.0.3 @react-email/components \
  @react-pdf/renderer@4.5.1 \
  zod@4.3.6 \
  react-hook-form@7.73.1 @hookform/resolvers@5.2.2 \
  date-fns@4.1.0 \
  lucide-react@1.8.0

# Dev
pnpm add -D \
  @playwright/test@1.59.1 \
  vitest@4.1.5 \
  prettier@3.8.3 prettier-plugin-tailwindcss \
  @types/node

# Initialize Prisma
pnpm prisma init --datasource-provider postgresql
```

---

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| **Next.js** | Remix / React Router v7, SvelteKit, Nuxt | If the team had strong non-React bias. FonnIT ships Next by default — no reason to deviate. |
| **Neon** | Supabase, Vercel Postgres (retired), self-hosted Postgres on Fly/Railway | Supabase if we wanted bundled auth + storage + Realtime. We don't — Better Auth + Resend cover it with less lock-in. |
| **Prisma** | Drizzle ORM (`0.45.2`), Kysely, raw SQL | Drizzle is lighter and closer to SQL, but Prisma's generated types, migration story, and Next.js integration are more productive for an MVP. Revisit if cold-start latency becomes a real pain. |
| **Better Auth** | Auth.js v5 (next-auth `5.0.0-beta.x`), Clerk, WorkOS | Clerk if we wanted hosted UI + social login out of the box — overkill for a single-persona MVP. Auth.js v5 is still beta. |
| **Resend** | Postmark, SendGrid, AWS SES | SES if sending >100 k/mo and price matters. Postmark if deliverability on transactional is the #1 concern. Resend wins on DX + React Email native support. |
| **@react-pdf/renderer** | `pdf-lib`, `pdfkit`, `puppeteer-core` + `@sparticuz/chromium` | `pdf-lib` if editing existing PDFs. Puppeteer if we needed pixel-perfect HTML→PDF — but its 50 MB+ bundle is a pain on Vercel. React-PDF is the right call for a template-driven welcome packet. |
| **Vercel** | Railway, Fly.io, Cloudflare Pages + Workers | Railway if we outgrew Vercel's function limits. Not an MVP concern. |
| **Stripe Checkout** | Stripe Elements (embedded) | Elements if we needed custom card UX on the enrollment page. Checkout is hosted, PCI-SAQ-A, and ships in an hour. |

---

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| **Next.js Pages Router** | Deprecated for new projects; Server Actions + async Server Components only exist in App Router. | App Router (default in `create-next-app@16`). |
| **Next.js <15** | No React 19 support; Server Actions APIs changed substantially. | `next@16.2.4`. |
| **`stripe@<22`** | v22 is an ES6-class breaking change (`new Stripe()`) and removes callback patterns. Mixing v21 docs with v22 SDK is a common silent bug. | `stripe@22.0.2`. |
| **Vercel Postgres** (legacy) | Discontinued Dec 2024 — existing DBs migrated to Neon automatically. | Neon (via Vercel Marketplace). |
| **SQLite / file-based storage / in-memory Maps** | MVP-SPEC mandates persistence across sessions. Ephemeral filesystems on Vercel Functions drop data on every cold start. | Neon Postgres via Prisma. |
| **Prisma Data Proxy / Accelerate** (for this use case) | Adds a paid hop and latency. Neon's serverless driver + Prisma adapter solve the connection-pool problem for free. | `@neondatabase/serverless` + `@prisma/adapter-neon`. |
| **NextAuth v4** | Feature-frozen; doesn't integrate cleanly with App Router Server Components. | Better Auth 1.6. |
| **Puppeteer / Playwright for PDF generation** | 50–250 MB bundle, blows past Vercel Function size limits, slow cold starts. | `@react-pdf/renderer` (pure JS, Buffer output). |
| **Nodemailer + SMTP** | You will spend a day on DKIM/SPF before the first email sends. | Resend (domain verification in the dashboard, done in 10 min). |
| **`useEffect` for data loading in the App Router** | Ignores Server Components, doubles network round-trips, breaks SEO on enrollment page. | `async` Server Components + Server Actions; React Query only where live polling is genuinely needed. |
| **Raw Stripe webhook handlers without signature verification** | Trivially spoofable; refunds/frauds ride in. | `stripe.webhooks.constructEvent(rawBody, sig, STRIPE_WEBHOOK_SECRET)` — always. |
| **CSS-in-JS runtimes (styled-components, emotion)** | RSC compatibility is poor; hydration penalties. | Tailwind v4 + shadcn/ui. |

---

## Stack Patterns by Variant

**If the owner dashboard MRR number ever needs to be truly real-time (sub-second):**
- Add `@tanstack/react-query` with a 10 s refetch interval on the members table.
- Do NOT reach for WebSockets or Server-Sent Events yet — Stripe webhook → Postgres write → client poll is simpler and good enough at MVP scale.

**If the clinic uploads a logo over ~500 KB:**
- Use Vercel Blob (or UploadThing) for storage.
- Do NOT base64 the logo into the DB — it will bloat `Clinic` rows and kill dashboard query performance.

**If welcome-packet PDFs ever need clinic-specific branding fonts:**
- Bundle the font with `@react-pdf/renderer`'s `Font.register()`.
- Do NOT switch to Puppeteer for this — the Vercel Function size cost is not worth it.

**If we exceed Resend's 3 000 email/mo free tier:**
- Upgrade to Resend Pro ($20/mo, 50 000 emails).
- Do NOT migrate to SES unless we cross ~100 k/mo — the DKIM/bounce/complaint ops overhead is real.

**If we ever need to support a second clinic on a custom domain:**
- Explicitly Out of Scope per MVP-SPEC (§8). Defer.

---

## Version Compatibility

| Package A | Compatible With | Notes |
|-----------|-----------------|-------|
| `next@16.2.4` | `react@19.2.5`, `react-dom@19.2.5` | React 19 is required; pinned by Next 16. |
| `next@16.2.4` | `typescript@>=5.4`, `typescript@6.0.3` | TS 6 works; use `moduleResolution: "bundler"`. |
| `prisma@7.8.0` | `@prisma/client@7.8.0` | Versions must match exactly. |
| `prisma@7.8.0` | `@neondatabase/serverless@1.1.0` | Via `@prisma/adapter-neon`. Required for Vercel serverless. |
| `stripe@22.0.2` | `node>=18`, `node@22` recommended | ES6 class constructor — `new Stripe(key, { apiVersion: '2026-03-25.dahlia' })`. |
| `tailwindcss@4.2.4` | `next@16`, `postcss@8.x` | Uses `@tailwindcss/postcss` plugin; no `tailwind.config.ts` required. |
| `better-auth@1.6.7` | `next@16`, `@prisma/client@7.8.0` | Use the official Prisma adapter; session table needs a migration. |
| `@react-pdf/renderer@4.5.1` | `node>=18`, `react@19` | Server-side only — do not import into Client Components. |
| `resend@6.0.3` | `node>=18` | Attachments accept `Buffer.toString('base64')` via `content` field. |

---

## Stripe Connect Express — Non-Negotiables

These are the concrete integration points the roadmap must include. All verified via Stripe docs (HIGH confidence):

1. **Onboarding:** `stripe.accounts.create({ type: 'express', country: 'US', capabilities: { card_payments, transfers } })` → `stripe.accountLinks.create({ type: 'account_onboarding' })` → redirect clinic owner.
2. **Readiness gate:** Listen for `account.updated` webhook; flip `Clinic.stripeOnboarded = true` when `charges_enabled && payouts_enabled`. Do NOT let a clinic Publish before this flag is true.
3. **Checkout for enrollment:** `stripe.checkout.sessions.create({ mode: 'subscription', line_items: [{ price: <tier-price-id>, quantity: 1 }], ... }, { stripeAccount: clinic.stripeAccountId })` — **must use the connected-account header**, not the platform account.
4. **Platform fee:** `subscription_data: { application_fee_percent: <n> }` — decide the number in the roadmap; this is a business call, not a stack call.
5. **Webhooks (all Route Handlers with `runtime = 'nodejs'` + raw body):**
   - `checkout.session.completed` → create `Member`, send welcome PDF, notify owner.
   - `invoice.payment_succeeded` → update `Member.lastChargeAt`, increment MRR.
   - `invoice.payment_failed` → flip `Member.failedCharge = true`, email pet owner.
   - `customer.subscription.deleted` → flip `Member.status = 'canceled'`.
   - `account.updated` → update `Clinic.stripeOnboarded`.
6. **Webhook secret:** Set `STRIPE_WEBHOOK_SECRET` in Vercel env; verify **every** inbound webhook with `stripe.webhooks.constructEvent`.

---

## Persistent Storage — Non-Negotiable

**Neon Postgres via Prisma. Nothing else.** No SQLite file, no JSON-on-disk, no in-memory Maps, no Vercel KV as the primary store. The MVP-SPEC success criterion ("one real pet owner enrolled, charged, reflected in dashboard") cannot be met on ephemeral storage.

Tables the schema must include (exact shape is the roadmap's job — listed here so STACK choices line up):
- `User` (clinic owner — Better Auth)
- `Session` (Better Auth)
- `Clinic` (practice info, `stripeAccountId`, `stripeOnboarded`, `slug`, `accentColor`, `logoUrl`)
- `Plan` (clinic plan tiers, `name`, `monthlyCents`, `includedServices JSON`, `stripePriceId`, `status`)
- `Member` (pet owner enrollment, `petName`, `species`, `ownerEmail`, `planId`, `stripeSubscriptionId`, `status`, `failedCharge`, `enrolledAt`, `nextBillingAt`)
- `ServiceRedemption` (manual checkboxes — `memberId`, `service`, `billingPeriodStart`, `redeemedAt`)

---

## Sources

- `npm view <pkg> version` on 2026-04-23 — all version numbers in this document **HIGH confidence**.
- [Next.js 16 docs](https://nextjs.org/docs) — App Router default, React 19 pinning. **HIGH confidence.**
- [Prisma blog](https://www.prisma.io/blog) — Prisma 7 released, v7.4 (Feb 2026) ships query caching. **HIGH confidence.**
- [Stripe stripe-node releases](https://github.com/stripe/stripe-node/releases) — v22.0.2 pins API `2026-03-25.dahlia`; ES6 class breaking change confirmed. **HIGH confidence.**
- [Stripe Connect Express docs](https://docs.stripe.com/connect/express-accounts) — Account onboarding + `accountLink` flow. **HIGH confidence.**
- [Vercel Postgres docs](https://vercel.com/docs/storage/vercel-postgres) — "Vercel Postgres is no longer available… automatically moved to Neon in December 2024." **HIGH confidence.**
- [Neon + Vercel integration](https://neon.com/docs/guides/vercel) — Marketplace integration injects `DATABASE_URL`. **HIGH confidence.**
- [Better Auth docs](https://www.better-auth.com/docs) — v1.6 stable, framework-agnostic, email/password built-in, Auth.js project merged into Better Auth. **HIGH confidence.**
- [Resend pricing](https://resend.com/pricing) — Free = 3 000/mo, 100/day; Pro = $20/mo, 50 000. **HIGH confidence.**
- [Resend attachments](https://resend.com/docs/dashboard/emails/attachments) — 40 MB email cap, `content` field accepts base64. **HIGH confidence.**
- [React-PDF docs](https://react-pdf.org/) — v4 ships `renderToBuffer` for Node — runs on Vercel serverless. **HIGH confidence.**
- [shadcn/ui docs](https://ui.shadcn.com/docs) — Copy-in component library; not an npm dep. **HIGH confidence.**

---
*Stack research for: multi-tenant vet-clinic SaaS with Stripe Connect Express + recurring billing*
*Researched: 2026-04-23*
