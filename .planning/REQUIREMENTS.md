# PawPlan — v2.0 Requirements

**Milestone:** v2.0 Visual Identity Redesign
**Scope:** Apply the `design/` system across every user-facing surface. Zero functional changes.
**Out of scope:** Schema edits, new routes, new server actions, new features. If a phase needs logic changes to land the redesign, halt and surface.

Traceability from `design/INTENT.md`, `design/tokens.json`, `design/theme.css`, `design/anti-patterns.md`, `design/assets-manifest.md`.

## Locked Design Decisions

| Decision | Value | Source |
|----------|-------|--------|
| Type system | Instrument Serif > 32px, Inter < 32px, **Berkeley Mono for every financial figure** (MRR, ARR, break-even, Stripe amounts, percentages, member counts, tier prices) | `design/INTENT.md` |
| Palette | Teal (`oklch(0.52 0.13 196)` / `#2F7F7F`) operational spine + amber warm moments; tokens locked in `design/tokens.json`; no Tailwind teal-500 anywhere | `design/INTENT.md`, `design/anti-patterns.md` |
| Surface color | Warm paper (`--paper #FAF8F5`); warm ink; **zero pure white surfaces** | `design/INTENT.md` |
| Composition | Asymmetric, left-anchored headlines, negative space as structure | `design/INTENT.md` |
| Enrollment hero | Clinic name (not PawPlan) leads in amber Instrument Serif; left 45% typographic spine on paper; right 55% raster with right-edge bleed; `pattern-grid-dot.svg` watermark at 15% opacity; no gradient wash | `design/INTENT.md` §Signature moment |
| Dashboard stat cards | Rules + type weight separation on paper surface; **no rounded drop-shadowed cards** | `design/anti-patterns.md` |
| Paw motifs | Only inside `logo-mark.svg`; no paw-print clipart in empty states, loaders, dividers, bullet markers | `design/anti-patterns.md` |
| Social proof | None. No "Join thousands of clinics" row. The break-even math is the proof. | `design/anti-patterns.md` |
| Voice | Grounded, confident, precise. Numbers first, prose second. No friction-erasure adjectives (seamless, effortless, magic). | `design/INTENT.md` |

## v2.0 Requirements

### Design Tokens (`TOK`) — foundation layer

- [ ] **TOK-01**: `design/theme.css` wired into `src/app/globals.css` as the single source of design tokens (colors, spacing, radii, shadows, motion)
- [ ] **TOK-02**: Tailwind v4 theme overrides reference tokens from `design/tokens.json` — every color class maps to a design token, no hex literals in component JSX
- [ ] **TOK-03**: Font loading configured for Instrument Serif (variable, display axis), Inter (variable), and Berkeley Mono — all self-hosted via `next/font` or equivalent, no Google Fonts CDN in production
- [ ] **TOK-04**: Every hardcoded Tailwind color class (`teal-500`, `gray-*`, `slate-*`, `bg-white`, etc.) purged from `src/` — replaced with token-driven classes
- [ ] **TOK-05**: Base `body`/`html` surfaces render `--paper`, not browser-default white; `color-scheme: light` set explicitly; `prefers-color-scheme` honored with warm-dark fallback if dark mode exists

### Typography System (`TYPO`)

- [ ] **TYPO-01**: Every text element > 32px renders in Instrument Serif via a `.type-display` utility (or equivalent)
- [ ] **TYPO-02**: Every text element ≤ 32px renders in Inter
- [ ] **TYPO-03**: Every financial figure (MRR, ARR, gross/net/Stripe/platform fees, break-even member count, tier monthly price, Stripe amounts in tables, percentages on dashboard) renders in Berkeley Mono via a `<Figure>` component (or `.type-figure` utility) that tabular-nums and slashed-zero feature flags are set on
- [ ] **TYPO-04**: Display-size Instrument Serif uses medium weight (500) with 1.1 line-height by default
- [ ] **TYPO-05**: Inter body copy uses 1.6 line-height at 16px default

### Shared Components (`COMP`)

- [ ] **COMP-01**: `Button` component ships in three variants (solid-teal, ghost, destructive) with 48px default height, Inter 15px medium label, token-driven focus ring
- [ ] **COMP-02**: `Card` / surface primitive renders paper-tone background with a 1px rule border (no shadow, no rounded >4px) — `variant="lifted"` is removed
- [ ] **COMP-03**: `Input`, `Textarea`, `Select` ship with paper background, ink border on focus, no default Tailwind ring
- [ ] **COMP-04**: `Dialog` / `Sheet` primitives render against paper backdrop (no white scrim) with ink text, serif header > 32px
- [ ] **COMP-05**: `Table` / `DataTable` renders rules between rows, no alternating zebra, numeric columns right-aligned in Berkeley Mono
- [ ] **COMP-06**: Empty-state primitive uses geometric illustration (not paw-print clipart) — falls back to `design/assets/illustrations/empty-state-members.png` for the members list
- [ ] **COMP-07**: Loading indicator is a geometric motif (not paw prints) — token-driven motion timing

### Dashboard Shell + Nav (`SHELL`)

- [ ] **SHELL-01**: Dashboard nav renders the `logo-lockup.svg` at 24px height, left-aligned, with the clinic name in Inter beside it
- [ ] **SHELL-02**: Primary nav items render in Inter medium on paper, with ink active state (no teal pill backgrounds)
- [ ] **SHELL-03**: Page headers across `/dashboard/*` use Instrument Serif 40px left-anchored with negative space above the metrics
- [ ] **SHELL-04**: Logout / account menu renders as a serif menu item dropdown, no avatar circle, no teal accent

### Dashboard Home Metrics (`DASH`)

- [ ] **DASH-01**: MRR gross/Stripe-fees/platform-fee/net card renders as four stacked rows separated by rules, all figures in Berkeley Mono, no drop shadow
- [ ] **DASH-02**: Projected ARR card displays the single figure in Instrument Serif Medium 52px Berkeley Mono (display serif styled with monospace substitution for the figure itself) — caption in Inter 12px muted
- [ ] **DASH-03**: 30-day renewal forecast card lists upcoming renewals as rule-separated rows, dates in Inter, amounts in Berkeley Mono
- [ ] **DASH-04**: Tier breakdown card lists tier name + member count + MRR share; tier name Inter medium, count + share Berkeley Mono, no bars, no pie chart
- [ ] **DASH-05**: Past-due members banner uses amber warm tone (not red), left-anchored copy, CTA as ghost button
- [ ] **DASH-06**: All dashboard pages render on `--paper`, not white; zero `bg-white` classes remain

### Plan Builder (`BUILDER`)

- [ ] **BUILDER-01**: Builder shell is a two-column layout — questions left, live break-even preview right — no modal, no stepper progress bar on top
- [ ] **BUILDER-02**: Break-even preview figures (retail value, monthly fee, clinic gross, break-even member count) all render in Berkeley Mono
- [ ] **BUILDER-03**: Radio/checkbox groups render as text-style selects with ink underline on active (no filled circles, no teal fills)
- [ ] **BUILDER-04**: Plan tier cards in the builder render on paper with rule borders, tier name in Instrument Serif 28px, price in Berkeley Mono 40px
- [ ] **BUILDER-05**: Builder CTA ("Save draft", "Continue to publish") renders as teal solid-fill button per COMP-01

### Publish Flow (`PUBFLOW`)

- [ ] **PUBFLOW-01**: `PublishedPlanPanel` renders the published plan as a paper-tone surface with rule-separated tiers and Berkeley Mono prices; no card shadow
- [ ] **PUBFLOW-02**: `EditTierPricesDialog` renders against paper backdrop, fields in Berkeley Mono for prices, amber-tone "unsaved changes" indicator if present
- [ ] **PUBFLOW-03**: `BreakEvenLineItems` table uses COMP-05 style — rules, right-aligned Berkeley Mono, no zebra
- [ ] **PUBFLOW-04**: Connect Stripe card + onboarding banner render in the v2 visual language: paper surface, ink copy, teal CTA, amber warning state (not red)
- [ ] **PUBFLOW-05**: Gated Publish button renders per COMP-01 with disabled ghost state

### Public Enrollment Page (`ENROLL`) — **signature surface**

- [ ] **ENROLL-01**: `/{clinic-slug}/enroll` hero lays out exactly per `design/INTENT.md` §Signature moment — left 45% typographic spine on paper, right 55% raster with right-edge bleed
- [ ] **ENROLL-02**: Clinic name renders FIRST in the hero in amber Instrument Serif 18px tracked (not PawPlan — PawPlan appears only in footer)
- [ ] **ENROLL-03**: Headline renders in ink Instrument Serif Medium 52px with 1.1 line-height, two lines
- [ ] **ENROLL-04**: Sub-head renders in neutral-4 Inter Regular 16px with 1.6 line-height, max-width 420px
- [ ] **ENROLL-05**: Hero CTA renders as a teal (`#2F7F7F`) solid-fill button 48px tall, paper label Inter Medium 15px, width matches left column
- [ ] **ENROLL-06**: Price caption renders as Inter 12px neutral-4 with the monthly price figure itself in Berkeley Mono
- [ ] **ENROLL-07**: Right column renders `design/assets/illustrations/enrollment-hero.png` with right-edge bleed, **no rounded corners, no drop shadow, no gradient overlay**
- [ ] **ENROLL-08**: `design/assets/patterns/pattern-grid-dot.svg` sits behind the lower-left quadrant of the left column at 15% opacity
- [ ] **ENROLL-09**: Tier comparison section below the hero renders as rule-separated rows with tier name in Instrument Serif 28px, price in Berkeley Mono 40px, feature list in Inter — no three-card grid
- [ ] **ENROLL-10**: Footer renders "Powered by PawPlan" in Inter 11px neutral-4 — PawPlan's only appearance on the page
- [ ] **ENROLL-11**: Mobile layout stacks left column above a full-width hero image (right-bleed preserved), no layout break below 320px width

### Enrollment Success + Checkout-Return (`SUCCESS`)

- [ ] **SUCCESS-01**: `/enroll/success` renders a single-column paper layout with Instrument Serif 52px headline ("Your plan is active"), Inter sub-head, and a single ghost CTA for next steps
- [ ] **SUCCESS-02**: Dates + tier prices render in Berkeley Mono
- [ ] **SUCCESS-03**: No success animation, no confetti, no celebratory emoji

### Members List (`MEMBERS`)

- [ ] **MEMBERS-01**: `/dashboard/members` renders per COMP-05 — rule-separated rows, Berkeley Mono for status dates + amounts
- [ ] **MEMBERS-02**: Past-due filter chip renders as ink underline on active (no teal pill)
- [ ] **MEMBERS-03**: Services-remaining counter renders as `3/4` in Berkeley Mono with an amber dot when ≤1 remaining
- [ ] **MEMBERS-04**: Cancel member action surfaces in a Dialog per COMP-04 with amber warning tone (not red)
- [ ] **MEMBERS-05**: Empty state uses `design/assets/illustrations/empty-state-members.png` per COMP-06, with ink Instrument Serif copy

### Auth (`AUTH`)

- [ ] **AUTH-01**: Signup page renders as a centered single-column paper layout, Instrument Serif 52px headline, Inter form labels, teal CTA per COMP-01
- [ ] **AUTH-02**: Login page mirrors AUTH-01 with a secondary ghost link to signup
- [ ] **AUTH-03**: Logout confirmation renders inline in the nav dropdown (no modal), no celebratory language
- [ ] **AUTH-04**: Password-reset flow (if present) reuses AUTH-01 layout; no teal gradient backgrounds

### Email + PDF (`EMAIL`)

- [ ] **EMAIL-01**: Welcome-packet React-PDF template uses Instrument Serif for the title, Inter for body, Berkeley Mono for prices/dates — embed fonts in the PDF
- [ ] **EMAIL-02**: Owner new-enrollment email template (SendGrid) uses paper-tone background with ink text, teal CTA — single column, no three-card grid
- [ ] **EMAIL-03**: Pet-owner welcome email (SendGrid) matches EMAIL-02 layout with clinic-first subject line
- [ ] **EMAIL-04**: Email footer renders small PawPlan wordmark inline with "Powered by PawPlan" caption, no social icons, no aggregate badges

### Marketing Meta + Assets (`META`)

- [ ] **META-01**: Favicon wired from `design/assets/logo-mark.svg` — SVG + ICO fallback
- [ ] **META-02**: Apple touch icon wired from `logo-mark.svg` at 180px
- [ ] **META-03**: OG image wired from `design/assets/og-image.png` — one per route, clinic-variant generated server-side on the enrollment page (clinic name overlay per INTENT if feasible, else static)
- [ ] **META-04**: `<title>` format: `{Clinic Name} — Wellness membership` on enrollment pages; `PawPlan — {page}` in the dashboard. PawPlan does not lead the clinic-owned title.
- [ ] **META-05**: Theme color meta tag set to `--paper` token value

### Visual QA (`QA`)

- [ ] **QA-01**: Anti-pattern audit passes — grep-based sweep for `teal-500`, `gray-900`, `bg-white`, `shadow-md`, `shadow-lg`, `rounded-xl` on stat cards, paw-print assets beyond logo, gradient overlays on hero, friction-erasure adjectives returns zero hits in `src/`
- [ ] **QA-02**: Every financial figure in the rendered app uses Berkeley Mono (verified via DOM attribute scan or visual QA screenshot diff)
- [ ] **QA-03**: `/browser-qa` passes the v1 critical flows against the v2 redesigned app: signup → Connect onboarding → plan builder → publish → public enrollment → Stripe checkout → dashboard metrics → members list → cancel
- [ ] **QA-04**: Mobile QA passes across hero, dashboard, members list, builder at 320px/375px/768px
- [ ] **QA-05**: Lighthouse visual regression score ≥ 90 for Accessibility on the redesigned enrollment page
- [ ] **QA-06**: Deployed to `pawplan.demos.fonnit.com` with v2 live

## Future Requirements

- Dark-mode variant of the v2 system (warm-dark palette) — deferred; not in v2.0
- Locale-aware currency formatting for Berkeley Mono figures — deferred; US-only today
- Animated hero illustrations — deferred; print-object premise stays static

## Out of Scope

- Any functional change (schema, routes, server actions, webhook logic, email trigger sites, queue handlers, Stripe integration) — if touched to land the redesign, halt the phase and surface
- Net-new features — every capability in v1 is preserved as-is, only the visual layer changes
- A/B tests on visual variants — v2 ships as a single definitive look
- Tailwind-default color additions — only `design/tokens.json` colors, no `teal-500` escape hatch

## Traceability

_Filled by the roadmapper (Step 10) — maps each REQ-ID to its phase._
