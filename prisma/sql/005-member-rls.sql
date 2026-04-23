-- Phase 4 RLS — Member table.
-- Strict mode: every read/write MUST be inside withClinic(). Unset GUC → zero rows.
-- Why strict (not two-mode): Members are never read during a webhook ingest
-- with no clinic context — the webhook dispatcher (plan 04-03) resolves
-- Clinic.id from event.account (= Stripe connected-account id) BEFORE writing
-- the Member row, so withClinic() always wraps the INSERT. Strict is the
-- safer default; relax only with explicit justification (Clinic's two-mode
-- is justified by bootstrap signup; StripeEvent's is justified by pre-context
-- webhook ingest).

ALTER TABLE "Member" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Member" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "Member";
CREATE POLICY tenant_isolation ON "Member"
  USING (
    "clinicId" = NULLIF(current_setting('app.current_clinic_id', true), '')::uuid
  )
  WITH CHECK (
    "clinicId" = NULLIF(current_setting('app.current_clinic_id', true), '')::uuid
  );
