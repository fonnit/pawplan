# PawPlan — Brand Intent

## Voice

**Adjectives:** Grounded. Confident. Precise.
**Anti-adjectives:** Chirpy. Slick. Corporate-cute.

PawPlan speaks like a vet owner who has run the math. Copy earns trust through specificity — "break-even at 47 members" lands where "grow your revenue" does not. The product is declarative, never promotional. The owner is treated as a professional; the pet owner, as a neighbor.

## Signature moment — the enrollment page leads with the clinic, not PawPlan

When a pet owner lands on `pawplan.app/{clinic-slug}/enroll`, the first word they read is the **clinic's own name**, set in amber Instrument Serif at the top of the left column. PawPlan does not appear in the hero. It appears only in the footer, small.

This is the one unmistakable visual element. Every other enrollment SaaS leads with the product. PawPlan leads with whose practice it is — the direct answer to the emotional brief: *"feel like a modern practice, not an independent shop losing on infrastructure."*

### Composition

- **Left 45%:** typographic spine on warm cream (`--paper`). Clinic name in amber at 18px → headline in Instrument Serif Medium at 52px, two lines, ink-toned → 16px Inter sub-head in muted neutral → teal CTA button, left-column width. Below, small 12px Inter caption with price in Berkeley Mono.
- **Right 55%:** the `enrollment-hero` raster, right-edge bleed, no rounded corners, no drop shadow. The photograph sits inside the layout like a print object on a page.
- **Watermark:** the `pattern-grid-dot` SVG sits behind the lower-left quadrant of the left column at 15% opacity in a neutral-3 stop. Discovered, not announced.

### Hero copy

- Clinic name (amber Instrument Serif, 18px, tracked): `{Clinic Name}`
- Headline (ink Instrument Serif Medium, 52px, 1.1 line-height, two lines): `Wellness care,` / `one flat monthly fee.`
- Sub-head (neutral-4 Inter Regular, 16px, 1.6, max 420px): `Preventive visits, vaccines, and annual labs — covered. Enroll in under two minutes.`
- CTA (teal `#2F7F7F` fill, paper label Inter Medium 15px, 48px tall, left-column width): `Enroll your pet`
- Caption (neutral-4 Inter Regular 12px, price in Berkeley Mono): `Monthly plans from $XX/mo · Cancel anytime.`

## Do

- Lead every surface with the fact. Numbers first, prose second.
- Hold a two-temperature palette: teal for the operational spine, amber for warm moments.
- Set financial figures in Berkeley Mono. MRR, ARR, break-even, Stripe amounts — every number reads as a measured figure.
- Keep asymmetric compositions. Left-anchor headlines. Let negative space do structural work.
- Use Instrument Serif above 32px; everything smaller uses Inter.
- Put the clinic's identity ahead of PawPlan's on the enrollment page. Always.

## Don't

- Don't centre hero copy, don't stack three feature cards below it, don't frame with a footer CTA strip.
- Don't use gradient washes over the raster. The photograph is not a background fill.
- Don't use paw-print motifs beyond the logo mark. Empty states, loaders, and dividers use geometry, not clipart.
- Don't ship pure white surfaces. Paper is warm (`--paper`); ink is warm (`--ink`).
- Don't import Tailwind defaults for teal or neutral ramps. Tokens are locked in `tokens.json`.
- Don't use friction-erasure adjectives — "seamless," "effortless," "magic" — in body copy.
- Don't stage social proof that isn't real. PawPlan is early; the math is the proof.
