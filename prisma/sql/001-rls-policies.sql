-- RLS Policies for Phase 1 tenant-scoped tables.
-- Tables Clinic, Plan, PlanTier are tenant-scoped via clinic_id.
-- User, Session, Account, Verification are auth-global and NOT RLS-enabled.
-- Reads the clinic_id from the transaction-local GUC: app.current_clinic_id.
--
-- Note on current_setting(..., true): the second argument `true` means
-- "missing setting returns NULL instead of erroring." If withClinic() wasn't
-- used, queries return zero rows (fail-closed) rather than leaking data.

-- ─── Clinic ────────────────────────────────────────────────────────────────
-- Two-mode policy:
--   (a) Bootstrap/owner-lookup mode: GUC unset — permissive, so signup can
--       INSERT and dashboard layout can find the owner's clinic by
--       ownerUserId (which is already UNIQUE + session-bound, so app-layer
--       scope is sufficient).
--   (b) Scoped mode: GUC set — strict, only the matching clinic row is visible.
-- NULLIF collapses the legacy empty-string GUC default into NULL so the cast
-- on an unset setting doesn't throw "invalid input syntax for uuid".
ALTER TABLE "Clinic" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Clinic" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "Clinic";
CREATE POLICY tenant_isolation ON "Clinic"
  USING (
    NULLIF(current_setting('app.current_clinic_id', true), '') IS NULL
    OR id = NULLIF(current_setting('app.current_clinic_id', true), '')::uuid
  )
  WITH CHECK (
    NULLIF(current_setting('app.current_clinic_id', true), '') IS NULL
    OR id = NULLIF(current_setting('app.current_clinic_id', true), '')::uuid
  );

-- ─── Plan ──────────────────────────────────────────────────────────────────
-- Strict: every read/write MUST be inside withClinic. Unset GUC → zero rows.
ALTER TABLE "Plan" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Plan" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "Plan";
CREATE POLICY tenant_isolation ON "Plan"
  USING (
    "clinicId" = NULLIF(current_setting('app.current_clinic_id', true), '')::uuid
  )
  WITH CHECK (
    "clinicId" = NULLIF(current_setting('app.current_clinic_id', true), '')::uuid
  );

-- ─── PlanTier ──────────────────────────────────────────────────────────────
ALTER TABLE "PlanTier" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PlanTier" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "PlanTier";
CREATE POLICY tenant_isolation ON "PlanTier"
  USING (
    "clinicId" = NULLIF(current_setting('app.current_clinic_id', true), '')::uuid
  )
  WITH CHECK (
    "clinicId" = NULLIF(current_setting('app.current_clinic_id', true), '')::uuid
  );
