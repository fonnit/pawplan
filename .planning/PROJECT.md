# PawPlan

## What This Is

A self-serve wellness-plan builder for independently owned vet clinics. The owner answers 8 questions, PawPlan generates tiered membership plans with line-by-line break-even math, and publishes a branded enrollment page. Pet owners sign up via Stripe Checkout; recurring billing runs automatically.

## Core Value

**A clinic owner publishes pricing and lands their first paying member in the same session.** Confidence in the break-even math is the single point of failure — if the owner won't click Publish, every downstream capability (Stripe charging, enrollment, billing) is moot.

## Current Milestone: v2.0 Visual Identity Redesign

**Goal:** Ship the v2 design system across every user-facing surface without touching business logic, schema, routes, or server actions.

**Target surfaces:**
- Public enrollment page `/{clinic-slug}/enroll` — **signature moment**: clinic-first hero, left 45% typographic spine on warm paper, right 55% raster with right-edge bleed, pattern-grid-dot watermark at 15% opacity, no gradient wash, no rounded corners on raster
- Dashboard home + metrics (MRR/ARR/renewal forecast/tier breakdown) — paper surface separated by rules + type weight, no drop-shadowed stat cards
- Plan builder + publish flow (8-question flow, PublishedPlanPanel, EditTierPricesDialog, BreakEvenLineItems, Connect onboarding)
- Members list (past_due filter, cancel action, services-remaining counter)
- Auth: signup / login / logout
- Email templates + React-PDF welcome packet
- Empty states, error states, OG image, favicon, app icon

**Source of truth:** `design/INTENT.md`, `design/tokens.json`, `design/theme.css`, `design/anti-patterns.md`, `design/assets-manifest.md`, `design/references.md`, `design/assets/` (7 SVG + 4 raster).

**Brand rules (enforced everywhere):**
- Instrument Serif > 32px, Inter < 32px, Berkeley Mono for every financial figure
- Two-temperature palette: teal operational spine + amber warm moments; tokens locked in `design/tokens.json`
- Warm paper (`--paper #FAF8F5`), warm ink; zero pure white surfaces
- Asymmetric compositions, left-anchored, negative space as structure
- No Tailwind teal-500, no default Tailwind neutral ramp, no paw-print clipart beyond logo-mark, no gradient hero overlays, no rounded shadowed stat cards, no centered hero + 3 cards + footer CTA, no friction-erasure adjectives (seamless, effortless, magic)

**Hard constraint:** Zero functional changes. No schema, no new routes, no new server actions, no new features. Any phase requiring logic changes to land the redesign halts and surfaces.

**Phase numbering:** continues from 7 (v1 phase directories remain at `01–06` for history).

## Requirements

### Validated

(None yet — ship to validate)

### Active

- [ ] Clinic onboarding: email/password account, practice name, optional logo, Stripe Connect Express
- [ ] 8-question plan builder (species mix, exam price, dental price, vaccine cadence + price, prevention inclusion, member discount, plan tier count)
- [ ] Tiered plan generation (2–3 tiers) with line-by-line break-even math (retail value, monthly fee, clinic gross per enrolled pet per year, break-even member count)
- [ ] Publish action generates unique public enrollment URL `pawplan.app/{clinic-slug}/enroll`
- [ ] Mobile-responsive enrollment page with tier comparison + Stripe Checkout embed
- [ ] Monthly recurring billing via Stripe Subscriptions
- [ ] Failed-charge flag on the member record
- [ ] PDF welcome packet emailed to client on enrollment
- [ ] Owner email notification on new enrollment
- [ ] Owner dashboard: active members, plan-tier breakdown, MRR, 30-day renewal forecast, projected ARR, per-member record
- [ ] Manual service-redemption toggle per included service per billing period
- [ ] Single clinic profile (practice name required, logo + accent color optional)
- [ ] Owner-initiated cancellation (prorates to end of billing period, confirmation email)
- [ ] Failed-payment email to pet owner (Stripe webhook triggered)
- [ ] Post-publish plan pricing edits that don't break existing subscriptions

### Out of Scope

- PIMS integration (Shepherd, Cornerstone, AVImark, EzyVet, etc.) — clinic-specific APIs double build time; unrelated to the riskiest assumption (publish trust)
- Multi-location / multi-tenant — one clinic = one account = one Stripe Connect Express account
- Client-facing portal or pet-owner login — email (welcome packet + Stripe receipts) is the only client channel
- Non-Stripe processors (Square, Heartland, WorldPay) — Stripe Connect is the rail Kleer/Membersy proved
- Automated service-redemption tracking — no PIMS = no automation; manual checkboxes are the v1 answer
- Plan pause, freeze, tier-switch — cancel + re-enroll is the v1 flow
- Automated client communication beyond welcome packet and failed-charge email (no dunning, no renewal reminders)
- Custom domain / CNAME for enrollment page — all clinics share `pawplan.app/{slug}/enroll`
- Native iOS / Android apps — web only, mobile-responsive
- Financial reporting beyond dashboard (no QuickBooks, tax, payout reconciliation, CLV)
- Compliance/regulatory tooling (VCPR docs, state disclosure templates) — clinic owns compliance
- Species-specific plan templates — dogs + cats only; exotics/equine/livestock out
- Appointment booking / scheduling

## Context

- **Competitive trigger:** Banfield, VCA and other corporate chains lure price-sensitive wellness clients with recurring-plan infrastructure independents can't match. Kleer proved the model in dental; Shepherd's March 2026 vet wellness-plan launch validates vet demand.
- **Rails:** Stripe Connect Express is the only supported payment rail in v1. Clinics onboard directly; PawPlan takes a platform fee; clinic receives payouts to its own bank.
- **No PIMS by design.** Service redemption is staff-toggled checkboxes in the dashboard. A manual checkbox is a workflow upgrade over the spreadsheet it replaces.
- **Riskiest assumption:** Owner trusts break-even math enough to click Publish same-session. Failure mode = high builder completion, near-zero publish clicks. Success = break-even clarity + fast publish path.

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Stripe Connect Express only | Proven by Kleer/Membersy; eliminates PCI + processor negotiation | — Pending |
| No PIMS integration in v1 | Unrelated to publish-trust risk; doubles build time | — Pending |
| Manual service-redemption checkboxes | Upgrade over spreadsheet; sufficient without PIMS | — Pending |
| Dogs + cats only | Species-specific variants = scope creep | — Pending |
| Single clinic = single account | Multi-tenant = auth complexity off-critical-path | — Pending |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-04-24 — v2.0 Visual Identity Redesign milestone started*
