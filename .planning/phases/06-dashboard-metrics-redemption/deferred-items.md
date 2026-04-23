# Deferred items — Phase 6

## Pre-existing (not introduced by Phase 6)

- **ESLint config circular-structure error.** `pnpm lint` fails with `TypeError: Converting circular structure to JSON` inside `@eslint/eslintrc` because of how `eslint-config-next` re-exports the react plugin. Reproduces on `main` before Phase 6 commits. No source code impact — `pnpm typecheck` + `pnpm build` + `pnpm test` are all green. Fix belongs in a stack-upgrade PR (likely eslint 10 → eslint 9 downgrade or a fresh flat-config migration), not this phase.

## Phase-6 out-of-scope (tracked for later)

- **Clinic timezone UI setting.** Schema + default applied (`Clinic.timezone = 'America/New_York'`). No settings page yet — owner cannot change it from the dashboard. Flagged in plan breakdown as optional; defer to a Phase 6.1 or Phase 7 polish pass.
- **Optimistic locking on redemption notes/attrs.** The `version` column is seeded and tested for the UPDATE path, but no current write mutates the row after creation (existence-is-state). Plumbing stands ready for when v2 adds mutable attributes (notes, photo, vet signature).
