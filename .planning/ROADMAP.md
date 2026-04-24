# PawPlan — Roadmap

**Milestone:** v2.0 Visual Identity Redesign
**Scope:** Apply the `design/` package across every user-facing surface. Zero functional changes.
**Numbering:** Continues from v1.0. Phase 7 is the first phase of v2.0. Legacy `01–06` directories under `.planning/phases/` are preserved for history.
**Single source of truth:** `design/INTENT.md`, `design/tokens.json`, `design/theme.css`, `design/anti-patterns.md`, `design/assets-manifest.md`, `design/assets/`.

## Hard constraint (enforced every phase)

Every phase below carries a **Halt if** clause. If landing the phase requires touching business logic — schema, routes, server actions, webhook handlers, queue handlers, Stripe integration, email trigger sites, feature flags, or new API surface — the phase halts and the operator reshapes scope. The redesign is a **visual-layer-only** milestone.

## Phases

- [ ] **Phase 7: Tokens + Theme Foundation** — Wire `design/theme.css` + `design/tokens.json` as the single source of design tokens; configure self-hosted fonts; establish the type system utilities (`.type-display`, `.type-figure`); purge Tailwind-default color classes.
- [ ] **Phase 8: Shared Components + Dashboard Shell** — Rebuild `Button`, `Card`, `Input`, `Dialog`, `Table`, empty-state, and loading primitives against the token system; render the dashboard nav + page-header shell in the v2 language.
- [ ] **Phase 9: Dashboard Surfaces** — Restyle dashboard home metrics, members list, plan builder, and publish flow using the shared primitives from Phase 8.
- [ ] **Phase 10: Public Enrollment Page + Success** — Ship the signature enrollment hero, tier comparison, and success page exactly per `design/INTENT.md` §Signature moment.
- [ ] **Phase 11: Auth + Email + PDF + Meta** — Restyle signup/login/logout, welcome-packet React-PDF, owner + pet-owner email templates, favicon, OG image, and page titles.
- [ ] **Phase 12: Visual QA + Deploy** — Anti-pattern grep audit, Berkeley Mono figure audit, `/browser-qa` against v1 critical flows, mobile QA, Lighthouse, deploy to `pawplan.demos.fonnit.com`.

## Phase Details

### Phase 7: Tokens + Theme Foundation
**Goal:** Every downstream phase can reach for a single design token instead of a Tailwind default. The token pipe is wired and the type system utilities exist.
**Depends on:** Nothing (first phase of v2.0).
**Requirements:** TOK-01, TOK-02, TOK-03, TOK-04, TOK-05, TYPO-01, TYPO-02, TYPO-03, TYPO-04, TYPO-05
**Eliminates these anti-patterns:** Tailwind `teal-500` + default neutral ramp, pure white surfaces, sans typeface for financial figures, Google Fonts CDN loads.
**Design references:** `design/tokens.json` (authoritative color/spacing/radii/shadow values), `design/theme.css` (CSS variable declarations), `design/INTENT.md` §Voice + §Signature moment (type rules).
**Success criteria** (what must be TRUE):
  1. Running `grep -rE "teal-500|gray-(50|100|200|300|400|500|600|700|800|900)|slate-|bg-white|#[fF]{3,6}" src/` returns zero hits in component JSX.
  2. A `<Figure>{amount}</Figure>` component (or `.type-figure` utility) renders any financial figure in Berkeley Mono with `font-feature-settings: "tnum", "zero"` set — verified by DOM inspection on `/dashboard`.
  3. Instrument Serif, Inter, and Berkeley Mono are served from the app's own origin (no third-party font CDN in Network tab) at every font weight used by the design.
  4. `document.body` computed `background-color` equals the `--paper` token value (`#FAF8F5`) on every page, not `#FFFFFF`.
  5. Any element with display typography > 32px resolves to Instrument Serif Medium with 1.1 line-height; ≤ 32px resolves to Inter at 1.6 line-height at 16px.
**Plans:** TBD
**UI hint:** yes
**Halt if:** landing requires adding a server action, schema field, new route, or modifying a webhook/queue handler.

### Phase 8: Shared Components + Dashboard Shell
**Goal:** The primitive library and app shell speak the v2 design language. Every other dashboard screen in Phase 9 can be re-skinned by swapping to these primitives.
**Depends on:** Phase 7 (tokens + type utilities must exist).
**Requirements:** COMP-01, COMP-02, COMP-03, COMP-04, COMP-05, COMP-06, COMP-07, SHELL-01, SHELL-02, SHELL-03, SHELL-04
**Eliminates these anti-patterns:** rounded drop-shadowed cards, paw-print clipart in empty states / loaders / dividers, teal pill nav backgrounds, white modal scrims, zebra-striped tables.
**Design references:** `design/INTENT.md` §Do/§Don't, `design/anti-patterns.md` (rounded-shadow cards, paw motifs, white surfaces), `design/assets/logo-lockup.svg`, `design/assets/illustrations/empty-state-members.png`.
**Success criteria** (what must be TRUE):
  1. `<Button variant="solid">` renders 48px tall with Inter 15px medium label, teal solid fill from `--accent-teal`, token-driven focus ring — visible on `/dashboard` and login page.
  2. `<Card>` / surface primitive renders paper background with a 1px rule border, max 4px radius, no `box-shadow`; `variant="lifted"` is removed from the codebase (grep returns zero hits).
  3. Any `<Dialog>` or `<Sheet>` opens with paper backdrop (not white scrim), ink body text, Instrument Serif > 32px header — verified by opening the members-list cancel dialog.
  4. Dashboard nav renders `logo-lockup.svg` at 24px height left-aligned with the clinic name in Inter; active nav item uses ink color (no teal pill background); page headers on `/dashboard/*` render Instrument Serif 40px left-anchored.
  5. Loading indicator and empty-state primitives use geometric motifs — no paw-print clipart appears outside `logo-mark.svg` anywhere in the rendered app.
**Plans:** TBD
**UI hint:** yes
**Halt if:** landing requires changing props the underlying primitives expose to their callers in a way that breaks existing call sites' behavior, adding new route handlers, or modifying any server action.

### Phase 9: Dashboard Surfaces
**Goal:** Every owner-facing dashboard surface — home metrics, members list, plan builder, publish flow — renders in the v2 visual language without changing a single query, server action, or business rule.
**Depends on:** Phase 8 (shared primitives + shell).
**Requirements:** DASH-01, DASH-02, DASH-03, DASH-04, DASH-05, DASH-06, MEMBERS-01, MEMBERS-02, MEMBERS-03, MEMBERS-04, MEMBERS-05, BUILDER-01, BUILDER-02, BUILDER-03, BUILDER-04, BUILDER-05, PUBFLOW-01, PUBFLOW-02, PUBFLOW-03, PUBFLOW-04, PUBFLOW-05
**Eliminates these anti-patterns:** rounded shadowed stat cards, zebra tables, red warning tone on past-due (amber is warm correction tone), teal pill filter chips, modal-style builder with top progress bar, bar/pie charts in tier breakdown.
**Design references:** `design/INTENT.md` §Do (numbers first, Berkeley Mono figures, rules + type weight), `design/anti-patterns.md` (rounded shadow cards, three-card grid), `design/assets/illustrations/empty-state-members.png`, `design/assets/patterns/pattern-grid-dot.svg` (dashboard stat row watermark).
**Success criteria** (what must be TRUE):
  1. `/dashboard` home renders MRR (gross/Stripe/platform/net stacked rows), ARR, 30-day renewal forecast, and tier breakdown on paper background — zero `bg-white` and zero `shadow-md`/`shadow-lg` classes remain in any dashboard component.
  2. Every financial figure on the dashboard (MRR totals, ARR, renewal amounts, tier prices, tier MRR share, past-due counts) renders in Berkeley Mono with tabular-nums — verified by DOM attribute scan.
  3. `/dashboard/members` renders rule-separated rows (no zebra), status dates + amounts in Berkeley Mono, past-due filter as ink underline on active (no teal pill), services-remaining counter as `N/M` with an amber dot when ≤1 remaining.
  4. The plan builder renders as a two-column layout (questions left, live break-even preview right), tier cards show tier name in Instrument Serif 28px and price in Berkeley Mono 40px, radio/checkbox groups use ink-underline text selects (no filled circles, no teal fills).
  5. `PublishedPlanPanel`, `EditTierPricesDialog`, `BreakEvenLineItems`, Connect onboarding banner, and the Publish button all render in v2 primitives — paper surface, rule borders, amber (not red) warning states, teal solid CTA per COMP-01.
**Plans:** TBD
**UI hint:** yes
**Halt if:** restyling forces a change to `publishPlan`, `editTierPrices`, `cancelSubscriptionAtPeriodEnd`, `toggleRedemption`, any server action signature, Prisma schema, `v_public_clinic_plans` view, or Connect onboarding server logic.

### Phase 10: Public Enrollment Page + Success — signature surface
**Goal:** When a pet owner lands on `/{clinic-slug}/enroll`, the first word they read is the clinic's own name — and the composition, asset handling, and watermark match `design/INTENT.md` §Signature moment exactly.
**Depends on:** Phase 7 (tokens), Phase 8 (primitives).
**Requirements:** ENROLL-01, ENROLL-02, ENROLL-03, ENROLL-04, ENROLL-05, ENROLL-06, ENROLL-07, ENROLL-08, ENROLL-09, ENROLL-10, ENROLL-11, SUCCESS-01, SUCCESS-02, SUCCESS-03
**Eliminates these anti-patterns:** gradient hero overlays, rounded corners/drop shadow on the hero raster, centered-hero + three-card grid + footer CTA shape, PawPlan leading the page, three-card tier grid, success-page confetti/celebratory emoji, "join thousands" social proof.
**Design references:** `design/INTENT.md` §Signature moment (authoritative composition spec), `design/assets-manifest.md` (enrollment-hero 1600×900, pattern-grid-dot 400×400 tile, logo-wordmark for footer), `design/assets/illustrations/enrollment-hero.png`, `design/assets/patterns/pattern-grid-dot.svg`.
**Success criteria** (what must be TRUE):
  1. On `/{clinic-slug}/enroll` at ≥ 1024px viewport, the clinic name appears FIRST in amber Instrument Serif 18px tracked at the top of the left column; PawPlan appears only in the footer as "Powered by PawPlan" in Inter 11px neutral-4.
  2. The hero lays out exactly as a left 45% typographic spine on paper + right 55% raster with right-edge bleed — the hero image has no `border-radius`, no `box-shadow`, no gradient overlay (verified by computed styles).
  3. `pattern-grid-dot.svg` sits behind the lower-left quadrant of the left column at 15% opacity in neutral-3, not announced, not framed.
  4. Tier comparison below the hero renders as rule-separated rows (tier name Instrument Serif 28px, price Berkeley Mono 40px, features Inter) — no three-card grid exists in the DOM.
  5. At 320px width the layout stacks (left column above full-width hero image with right-bleed preserved) with no horizontal scroll; `/enroll/success` renders a single-column paper layout with Instrument Serif 52px headline, Berkeley Mono dates/prices, one ghost CTA, no animation/confetti/emoji.
**Plans:** TBD
**UI hint:** yes
**Halt if:** landing requires changing the `v_public_clinic_plans` view, the enrollment route's server action, Stripe Checkout integration, or any of the Prisma reads backing the public page.

### Phase 11: Auth + Email + PDF + Meta
**Goal:** Every non-dashboard, non-enrollment surface — auth pages, transactional emails, the React-PDF welcome packet, OG image, favicon, page titles — renders in the v2 language. PawPlan stops leading clinic-owned titles.
**Depends on:** Phase 7 (tokens + fonts), Phase 8 (primitives), Phase 10 (confirms PawPlan-footer-only pattern).
**Requirements:** AUTH-01, AUTH-02, AUTH-03, AUTH-04, EMAIL-01, EMAIL-02, EMAIL-03, EMAIL-04, META-01, META-02, META-03, META-04, META-05
**Eliminates these anti-patterns:** teal gradient auth backgrounds, celebratory logout copy, three-card grid in owner notification email, social icons + aggregate badges in email footer, PawPlan-leading page titles on clinic-owned pages, default browser favicon.
**Design references:** `design/INTENT.md` §Voice (grounded, confident, precise — no friction-erasure adjectives), `design/assets-manifest.md` (logo-mark 512 for favicon, logo-lockup for email headers, og-image 1200×630), `design/assets/logo-mark.svg`, `design/assets/og-image.png`.
**Success criteria** (what must be TRUE):
  1. `/signup` and `/login` render centered single-column paper layouts with Instrument Serif 52px headline, Inter form labels, and a teal solid CTA; logout confirmation appears inline in the nav dropdown (no modal, no "See you soon!" copy).
  2. The React-PDF welcome packet embeds Instrument Serif (title), Inter (body), and Berkeley Mono (prices/dates) as actual font resources — opening the rendered PDF in a viewer shows the three faces, not system fallbacks.
  3. Owner new-enrollment email and pet-owner welcome email render paper-tone background with ink text, teal CTA, single-column layout, and a small PawPlan wordmark + "Powered by PawPlan" caption in the footer — no social icons, no aggregate badges, no three-card grid. Subject lines are clinic-first.
  4. Favicon + apple-touch-icon are served from `logo-mark.svg` / 180px PNG; the OG image for an enrollment URL pasted in iMessage shows `design/assets/og-image.png` with the clinic name overlay (or the static image if server-side overlay infeasible).
  5. `<title>` on `/{slug}/enroll` reads `{Clinic Name} — Wellness membership`; `<title>` on dashboard pages reads `PawPlan — {page}`; the `theme-color` meta tag equals the `--paper` token value on every rendered page.
**Plans:** TBD
**UI hint:** yes
**Halt if:** landing requires touching SendGrid send sites (`src/lib/email/sendgrid.ts` call sites), queue handlers, welcome-packet enqueue trigger in `checkout.session.completed`, any webhook payload shape, or the `generateMetadata` signature in ways that change what data the route fetches.

### Phase 12: Visual QA + Deploy
**Goal:** The v2 redesign is provably complete — anti-pattern audits pass, every figure is Berkeley Mono, mobile QA is green, and the build ships at `pawplan.demos.fonnit.com`.
**Depends on:** Phases 7–11 (everything visual must be done).
**Requirements:** QA-01, QA-02, QA-03, QA-04, QA-05, QA-06
**Eliminates these anti-patterns:** any residual `teal-500` / `gray-900` / `bg-white` / `shadow-md` / `shadow-lg` / `rounded-xl` stat card / paw-print asset outside `logo-mark.svg` / gradient overlay / friction-erasure adjective hit that survived Phases 7–11.
**Design references:** `design/anti-patterns.md` (full dead list drives QA-01 grep), `design/INTENT.md` (voice + signature moment drive QA-03 visual review), `design/tokens.json` (QA-02 font-family assertion).
**Success criteria** (what must be TRUE):
  1. `grep -rE "teal-500|gray-900|bg-white|shadow-(md|lg)|rounded-xl" src/` + an asset scan for paw-print shapes outside `logo-mark.svg` + a grep for "seamless"/"effortless"/"magic" in user-facing copy returns zero hits.
  2. A DOM-scan script (Puppeteer/Playwright) confirms every element matching a financial-figure selector (`.type-figure`, `<Figure>`, known MRR/ARR/price selectors) has `font-family: "Berkeley Mono"` resolved — run against `/dashboard`, `/dashboard/members`, `/dashboard/builder`, `/{slug}/enroll`, `/enroll/success`.
  3. `/browser-qa` executes the v1 critical-flow suite (signup → Connect onboarding → plan builder → publish → public enrollment → Stripe checkout → dashboard metrics → members list → cancel) against the redesigned app with zero functional regressions.
  4. Mobile QA passes at 320px, 375px, and 768px for the enrollment hero, dashboard, members list, and plan builder — no horizontal scroll, no broken stacking, right-edge bleed preserved on the hero raster.
  5. Lighthouse Accessibility ≥ 90 on `/{slug}/enroll` against the deployed build at `pawplan.demos.fonnit.com`.
**Plans:** TBD
**UI hint:** yes
**Halt if:** any regression surfaced by QA requires a schema/route/server-action/webhook/queue change to fix. File the regression, reshape scope, do not land a logic change under the QA banner.

## Progress

| Phase | Plans Complete | Status      | Completed |
|-------|----------------|-------------|-----------|
| 7. Tokens + Theme Foundation        | 0/TBD | Not started | - |
| 8. Shared Components + Dashboard Shell | 0/TBD | Not started | - |
| 9. Dashboard Surfaces               | 0/TBD | Not started | - |
| 10. Public Enrollment + Success     | 0/TBD | Not started | - |
| 11. Auth + Email + PDF + Meta       | 0/TBD | Not started | - |
| 12. Visual QA + Deploy              | 0/TBD | Not started | - |

## Coverage

75 / 75 v2.0 requirements mapped. No orphans. No duplicates.

| Category   | Count | Phase |
|------------|-------|-------|
| TOK-*      | 5     | 7     |
| TYPO-*     | 5     | 7     |
| COMP-*     | 7     | 8     |
| SHELL-*    | 4     | 8     |
| DASH-*     | 6     | 9     |
| MEMBERS-*  | 5     | 9     |
| BUILDER-*  | 5     | 9     |
| PUBFLOW-*  | 5     | 9     |
| ENROLL-*   | 11    | 10    |
| SUCCESS-*  | 3     | 10    |
| AUTH-*     | 4     | 11    |
| EMAIL-*    | 4     | 11    |
| META-*     | 5     | 11    |
| QA-*       | 6     | 12    |
| **Total**  | **75**|       |
