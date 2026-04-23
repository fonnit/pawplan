-- Phase 6 RLS — ServiceRedemption table (DASH-04).
-- Strict mode: every read/write MUST be inside withClinic(). Unset GUC → zero rows.
--
-- ServiceRedemption has no clinicId column — clinic scope is derived by
-- joining to Member.clinicId. An EXISTS subquery in the USING/WITH CHECK
-- keeps the schema normalized and prevents drift (a Member can't be moved
-- between clinics, so there is no risk of a redemption pointing at a
-- Member in another clinic).
--
-- Performance note: the Member.id index on the primary key covers the
-- inner lookup; Postgres pushes the EXISTS into a semi-join that costs
-- ~one index probe per row returned.

ALTER TABLE "ServiceRedemption" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ServiceRedemption" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "ServiceRedemption";
CREATE POLICY tenant_isolation ON "ServiceRedemption"
  USING (
    EXISTS (
      SELECT 1
      FROM "Member" m
      WHERE m.id = "ServiceRedemption"."memberId"
        AND m."clinicId" = NULLIF(current_setting('app.current_clinic_id', true), '')::uuid
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM "Member" m
      WHERE m.id = "ServiceRedemption"."memberId"
        AND m."clinicId" = NULLIF(current_setting('app.current_clinic_id', true), '')::uuid
    )
  );
