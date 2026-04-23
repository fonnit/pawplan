-- Phase 3 Plan 01: re-assert RLS FORCE on Plan + PlanTier after new columns land.
-- Policies from 001-rls-policies.sql remain active (they are row-level, not
-- column-level), but re-running FORCE is cheap insurance after any schema change.
--
-- This file is idempotent — safe to re-apply.

ALTER TABLE "Plan" FORCE ROW LEVEL SECURITY;
ALTER TABLE "PlanTier" FORCE ROW LEVEL SECURITY;

-- Grants to the app role remain as set in 000-roles.sql — no change needed.
