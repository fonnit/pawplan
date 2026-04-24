# PawPlan — Asset Manifest

Scope-pass manifest, locked. One entry per heading. Software-engineer drops each file at the `target_path` listed. SVG entries are hand-authored; raster entries are generated via `fal-ai/flux-2/flash/edit` anchored by `_style-plate.png`.

---

## logo-mark

- **format:** svg
- **size:** 512x512 (viewBox; SVG scales)
- **target_path:** `apps/pawplan/design/assets/logo-mark.svg`
- **purpose:** Favicon, app icon, social avatar, and all small-spot brand placements across dashboard and enrollment page.
- **brief:** An abstract paw-adjacent form reduced to geometry — not a literal paw print. A quadrant-offset circle with one smaller satellite circle, suggesting both a paw pad and a recurring billing cycle. Primary teal `#2F7F7F`. Deliberate stroke weight, not system-default. Reads clearly at 16px and holds presence at 512px.

## logo-wordmark

- **format:** svg
- **size:** 960x240 (viewBox)
- **target_path:** `apps/pawplan/design/assets/logo-wordmark.svg`
- **purpose:** Primary header identity on dashboard, enrollment page header, and email templates.
- **brief:** `PawPlan` set in a geometric sans at Medium or SemiBold weight — not Bold. Letter-spacing tightened 5–8% below browser default. `Paw` in primary teal; `Plan` in ink tone `#3D3A37`. No decorative flourishes — the mark does the identity work.

## logo-lockup

- **format:** svg
- **size:** 960x320 (viewBox)
- **target_path:** `apps/pawplan/design/assets/logo-lockup.svg`
- **purpose:** Deck covers, invoice footers, email headers, and any context where mark + wordmark travel together as a single unit.
- **brief:** Mark left-aligned, wordmark to the right, optically vertically centered to the mark's midpoint. Breathing room between mark and wordmark is 1.5× the mark's width at smallest intended use. Background-agnostic — must hold on paper `#FAF8F5`, teal `#2F7F7F`, and deep ink `#252220` surfaces.

## icon-plan-tier

- **format:** svg
- **size:** 24x24
- **target_path:** `apps/pawplan/design/assets/icons/icon-plan-tier.svg`
- **purpose:** Plan builder, tier comparison table, dashboard tier-breakdown row labels.
- **brief:** Three horizontal bars of ascending height, left-aligned, suggesting a tier ladder. Not a bar chart — bars are thick, rounded, and slightly uneven in width. Primary teal stroke, 1.5px weight, no fill. Reads as "levels," not "stats."

## icon-billing

- **format:** svg
- **size:** 24x24
- **target_path:** `apps/pawplan/design/assets/icons/icon-billing.svg`
- **purpose:** Recurring billing section headers, Stripe Connect status indicator, MRR/ARR dashboard labels.
- **brief:** A circle with a clockwise-pointing arrow completing its arc — recurrence signal. Gap at the 11 o'clock position; slightly heavier arrowhead. No dollar sign inside; context provides meaning. Stroke-only, 1.5px, teal.

## icon-member-count

- **format:** svg
- **size:** 24x24
- **target_path:** `apps/pawplan/design/assets/icons/icon-member-count.svg`
- **purpose:** Active members stat card on the owner dashboard.
- **brief:** Two overlapping circle-head silhouettes — pet and owner — offset so neither fully occludes the other. Geometric, not humanoid. Front circle slightly larger, full teal; back circle teal at 40% opacity. Stroke-only heads, no body implied.

## icon-service-check

- **format:** svg
- **size:** 24x24
- **target_path:** `apps/pawplan/design/assets/icons/icon-service-check.svg`
- **purpose:** Manual service redemption toggle in staff-facing dashboard rows.
- **brief:** Square with 4px rounded corners containing a checkmark that doesn't touch the edges — stamp or seal, not generic checkbox. Checkmark stroke 2px; box stroke 1.5px. This SVG is the unchecked state (teal stroke, paper fill); runtime fills with teal when checked.

## icon-enrollment

- **format:** svg
- **size:** 24x24
- **target_path:** `apps/pawplan/design/assets/icons/icon-enrollment.svg`
- **purpose:** Enrollment page CTA area and the `new member` action in the dashboard.
- **brief:** Forward-pointing chevron nested inside a thin circle — entry-door geometry suggesting "join." Chevron is 60% of the circle's inner diameter. Stroke-only, 1.5px, teal. The circle frame distinguishes this from a generic next-button glyph.

## icon-mrr

- **format:** svg
- **size:** 24x24
- **target_path:** `apps/pawplan/design/assets/icons/icon-mrr.svg`
- **purpose:** MRR and ARR stat cards on the owner dashboard.
- **brief:** Ascending step-line (two steps, not a smooth curve) — monthly compounding without chart decoration. Steps stroked at 2px; bounding frame omitted so steps float. Teal, stroke-only.

## pattern-grid-dot

- **format:** svg
- **size:** 400x400 (tile)
- **target_path:** `apps/pawplan/design/assets/patterns/pattern-grid-dot.svg`
- **purpose:** Signature background texture — the app's one unmistakable visual element — tiled behind the enrollment hero left column and the dashboard stat row.
- **brief:** A 20×20 grid of 2px circles on transparent ground, spaced 20px apart. Dot opacity is aperiodic: every dot carries base 8% teal, but every 7th dot (prime-skip, not regular column) sits at 20% — producing a subtle shimmer when tiled. The non-uniform rhythm is the signature: reads as texture from distance, as system from close. Tileable. No border, no frame.

## enrollment-hero

- **format:** raster
- **size:** 1600x900
- **aspect:** landscape_16_9
- **target_path:** `apps/pawplan/design/assets/illustrations/enrollment-hero.png`
- **purpose:** Hero visual on the pet-owner enrollment page. The primary emotional moment before the owner signs up.
- **brief:** A vet clinic front desk at golden hour. Warm light through a window. A calm mid-sized dog of indeterminate breed sitting on a clean counter surface. A partial human hand (no face visible) resting beside it on paperwork. Quiet competence, not corporate cheerfulness. Warm amber light over a teal-cooled background — the brand's temperature story visible in the image itself. Editorial photographic realism rendered as an illustration, NOT cartoon, NOT stock photography. Asymmetric composition: dog occupies left 40%, right third reserved for type overlay. No signage, no in-frame text, no paw-print motifs.

## empty-state-members

- **format:** raster
- **size:** 480x320
- **aspect:** landscape_4_3
- **target_path:** `apps/pawplan/design/assets/illustrations/empty-state-members.png`
- **purpose:** Empty state in the owner dashboard members table before the first enrollment arrives.
- **brief:** A minimal scene. One open folder on a clean desk surface, a single paw-print shape resting inside — potential, not absence. Teal and warm off-white palette only. Flat rendering with a very subtle shadow. Not cartoon, not photographic. Expectant mood, centered composition with generous empty space around the folder.

## og-image

- **format:** raster
- **size:** 1200x630
- **aspect:** landscape_16_9
- **target_path:** `apps/pawplan/design/assets/og-image.png`
- **purpose:** Open Graph share card when a clinic's enrollment URL is pasted into iMessage, Slack, LinkedIn, or Twitter.
- **brief:** Deep teal `#2F7F7F` ground. Logo lockup positioned upper-left, occupying 40% of width. Lower portion: a single line of editorial copy in Instrument Serif — `Your practice. Your plan.` — in warm paper `#FAF8F5`, roughly 72px equivalent. Bottom-right corner: the dot-grid pattern at 12% opacity. No photography, no illustration. Must read in a 280x150 thumbnail. One amber accent — a single dot in the pattern, or the period after `Plan` — as the single pop of contrast.
