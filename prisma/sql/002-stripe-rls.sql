-- Phase 2 RLS — Stripe Connect event idempotency store.
-- Two-mode policy identical to Clinic (see 001-rls-policies.sql):
--   (a) GUC unset  → permissive (webhook ingest before clinic resolution)
--   (b) GUC set    → strict (dashboard + background jobs reading own events)
-- Scoping is by connectedAccountId → Clinic.stripeAccountId at query time.

ALTER TABLE "StripeEvent" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "StripeEvent" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "StripeEvent";
CREATE POLICY tenant_isolation ON "StripeEvent"
  USING (
    NULLIF(current_setting('app.current_clinic_id', true), '') IS NULL
    OR "connectedAccountId" IN (
      SELECT "stripeAccountId" FROM "Clinic"
      WHERE id = NULLIF(current_setting('app.current_clinic_id', true), '')::uuid
    )
  )
  WITH CHECK (
    NULLIF(current_setting('app.current_clinic_id', true), '') IS NULL
    OR "connectedAccountId" IN (
      SELECT "stripeAccountId" FROM "Clinic"
      WHERE id = NULLIF(current_setting('app.current_clinic_id', true), '')::uuid
    )
  );
