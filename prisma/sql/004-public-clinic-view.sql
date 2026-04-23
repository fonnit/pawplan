-- Phase 3 Plan 01: public, tenant-safe read surface for the enrollment page.
--
-- Why a dedicated view:
--   - The enrollment page (plan 03-03) runs WITHOUT a session and WITHOUT a
--     clinic GUC. Querying Plan/PlanTier directly under pawplan_app
--     (NOBYPASSRLS) would return zero rows.
--   - PITFALLS #4 mandates that a public surface never touch tenant tables
--     directly. A narrow, SECURITY DEFINER view is the documented pattern.
--   - The view's SELECT list is EXPLICIT — adding a new column to PlanTier
--     will not auto-leak it to the public.
--
-- Invariants enforced by WHERE clause:
--   - Only plans with status = 'published' AND publishedAt IS NOT NULL.
--   - Only tiers that successfully completed Stripe Price creation (defensive).
--
-- This file is idempotent via CREATE OR REPLACE.

CREATE OR REPLACE VIEW v_public_clinic_plans
WITH (security_invoker = false) AS   -- SECURITY DEFINER: runs as view owner
SELECT
  c.slug                                  AS clinic_slug,
  c."practiceName"                        AS clinic_practice_name,
  c."logoUrl"                             AS clinic_logo_url,
  c."accentColor"                         AS clinic_accent_color,
  p.id                                    AS plan_id,
  p."publishedAt"                         AS plan_published_at,
  p."tierCount"                           AS plan_tier_count,
  t.id                                    AS tier_id,
  t."tierKey"                             AS tier_key,
  t."tierName"                            AS tier_name,
  t."includedServices"                    AS tier_included_services,
  t."retailValueBundledCents"             AS tier_retail_value_bundled_cents,
  t."monthlyFeeCents"                     AS tier_monthly_fee_cents,
  t."stripeFeePerChargeCents"             AS tier_stripe_fee_per_charge_cents,
  t."platformFeePerChargeCents"           AS tier_platform_fee_per_charge_cents,
  t."clinicGrossPerPetPerYearCents"       AS tier_clinic_gross_per_pet_per_year_cents,
  t."breakEvenMembers"                    AS tier_break_even_members,
  t."stripePriceId"                       AS tier_stripe_price_id,
  t.ordering                              AS tier_ordering
FROM "Clinic" c
JOIN "Plan" p ON p."clinicId" = c.id
JOIN "PlanTier" t ON t."planId" = p.id
WHERE p.status = 'published'
  AND p."publishedAt" IS NOT NULL
  AND t."stripePriceId" IS NOT NULL;   -- defensive: skip tiers that failed Stripe creation

-- Ownership + grants: the view is owned by the current migration role (postgres
-- / pawplan superuser). Grant SELECT only to pawplan_app. Revoke from PUBLIC
-- so no unintended role can read the view.
REVOKE ALL ON v_public_clinic_plans FROM PUBLIC;
GRANT SELECT ON v_public_clinic_plans TO pawplan_app;

COMMENT ON VIEW v_public_clinic_plans IS
  'Phase 3 PUB-05 / PITFALLS #4. Only surface the unauthed enrollment page reads. '
  'SECURITY DEFINER: bypasses RLS because the caller has no clinic GUC. '
  'Column list is explicit — new PlanTier fields do not auto-propagate here.';
