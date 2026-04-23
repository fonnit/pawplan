-- RLS Policies for Phase 1 tenant-scoped tables.
-- Tables Clinic, Plan, PlanTier are tenant-scoped via clinic_id.
-- User, Session, Account, Verification are auth-global and NOT RLS-enabled.
-- Reads the clinic_id from the transaction-local GUC: app.current_clinic_id.
--
-- Note on current_setting(..., true): the second argument `true` means
-- "missing setting returns NULL instead of erroring." If withClinic() wasn't
-- used, queries return zero rows (fail-closed) rather than leaking data.

-- ─── Clinic: special case — RLS checks the id column, not clinic_id ────────
ALTER TABLE "Clinic" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Clinic" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "Clinic";
CREATE POLICY tenant_isolation ON "Clinic"
  USING (id = current_setting('app.current_clinic_id', true)::uuid);

-- ─── Plan ──────────────────────────────────────────────────────────────────
ALTER TABLE "Plan" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Plan" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "Plan";
CREATE POLICY tenant_isolation ON "Plan"
  USING ("clinicId" = current_setting('app.current_clinic_id', true)::uuid);

-- ─── PlanTier ──────────────────────────────────────────────────────────────
ALTER TABLE "PlanTier" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PlanTier" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "PlanTier";
CREATE POLICY tenant_isolation ON "PlanTier"
  USING ("clinicId" = current_setting('app.current_clinic_id', true)::uuid);
