-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "AccentColor" AS ENUM ('sage', 'terracotta', 'midnight', 'wine', 'forest', 'clay');

-- CreateEnum
CREATE TYPE "PlanStatus" AS ENUM ('draft', 'published', 'archived');

-- CreateEnum
CREATE TYPE "OnboardingState" AS ENUM ('not_started', 'in_progress', 'action_required', 'complete', 'restricted');

-- CreateEnum
CREATE TYPE "MemberStatus" AS ENUM ('active', 'past_due', 'canceled');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "name" TEXT,
    "image" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "password" TEXT,
    "accessToken" TEXT,
    "refreshToken" TEXT,
    "accessTokenExpiresAt" TIMESTAMP(3),
    "refreshTokenExpiresAt" TIMESTAMP(3),
    "scope" TEXT,
    "idToken" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Verification" (
    "id" TEXT NOT NULL,
    "identifier" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Verification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Clinic" (
    "id" UUID NOT NULL,
    "ownerUserId" TEXT NOT NULL,
    "practiceName" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "logoUrl" TEXT,
    "accentColor" "AccentColor" NOT NULL DEFAULT 'sage',
    "timezone" TEXT NOT NULL DEFAULT 'America/New_York',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "stripeAccountId" TEXT,
    "stripeChargesEnabled" BOOLEAN NOT NULL DEFAULT false,
    "stripePayoutsEnabled" BOOLEAN NOT NULL DEFAULT false,
    "stripeDetailsSubmitted" BOOLEAN NOT NULL DEFAULT false,
    "stripeDisabledReason" TEXT,
    "stripeRequirements" JSONB,
    "stripeOnboardingState" "OnboardingState" NOT NULL DEFAULT 'not_started',
    "stripeCapabilitiesAt" TIMESTAMP(3),

    CONSTRAINT "Clinic_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Plan" (
    "id" UUID NOT NULL,
    "clinicId" UUID NOT NULL,
    "status" "PlanStatus" NOT NULL DEFAULT 'draft',
    "builderInputs" JSONB NOT NULL,
    "monthlyProgramOverheadUsd" DECIMAL(10,2) NOT NULL DEFAULT 500,
    "tierCount" INTEGER NOT NULL,
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Plan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlanTier" (
    "id" UUID NOT NULL,
    "planId" UUID NOT NULL,
    "clinicId" UUID NOT NULL,
    "tierKey" TEXT NOT NULL,
    "tierName" TEXT NOT NULL,
    "includedServices" JSONB NOT NULL,
    "retailValueBundledCents" INTEGER NOT NULL,
    "monthlyFeeCents" INTEGER NOT NULL,
    "stripeFeePerChargeCents" INTEGER NOT NULL,
    "platformFeePerChargeCents" INTEGER NOT NULL,
    "clinicGrossPerPetPerYearCents" INTEGER NOT NULL,
    "breakEvenMembers" INTEGER NOT NULL,
    "ordering" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "stripeProductId" TEXT,
    "stripePriceId" TEXT,
    "stripePriceHistory" JSONB,
    "publishedAt" TIMESTAMP(3),

    CONSTRAINT "PlanTier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StripeEvent" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "connectedAccountId" TEXT,
    "apiVersion" TEXT,
    "payload" JSONB NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),
    "processingError" TEXT,

    CONSTRAINT "StripeEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Member" (
    "id" UUID NOT NULL,
    "clinicId" UUID NOT NULL,
    "planTierId" UUID NOT NULL,
    "stripeCustomerId" TEXT NOT NULL,
    "stripeSubscriptionId" TEXT NOT NULL,
    "petName" TEXT NOT NULL,
    "species" TEXT NOT NULL,
    "ownerEmail" TEXT NOT NULL,
    "status" "MemberStatus" NOT NULL DEFAULT 'active',
    "currentPeriodEnd" TIMESTAMP(3),
    "enrolledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "paymentFailedAt" TIMESTAMP(3),
    "canceledAt" TIMESTAMP(3),
    "welcomePacketSentAt" TIMESTAMP(3),
    "ownerNotifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Member_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceRedemption" (
    "id" UUID NOT NULL,
    "memberId" UUID NOT NULL,
    "serviceKey" TEXT NOT NULL,
    "billingPeriodStart" TIMESTAMPTZ(3) NOT NULL,
    "redeemedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "redeemedByUserId" TEXT,
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ServiceRedemption_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Session_token_key" ON "Session"("token");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE INDEX "Account_userId_idx" ON "Account"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Account_providerId_accountId_key" ON "Account"("providerId", "accountId");

-- CreateIndex
CREATE INDEX "Verification_identifier_idx" ON "Verification"("identifier");

-- CreateIndex
CREATE UNIQUE INDEX "Clinic_ownerUserId_key" ON "Clinic"("ownerUserId");

-- CreateIndex
CREATE UNIQUE INDEX "Clinic_slug_key" ON "Clinic"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Clinic_stripeAccountId_key" ON "Clinic"("stripeAccountId");

-- CreateIndex
CREATE INDEX "Clinic_slug_idx" ON "Clinic"("slug");

-- CreateIndex
CREATE INDEX "Plan_clinicId_status_idx" ON "Plan"("clinicId", "status");

-- CreateIndex
CREATE INDEX "Plan_clinicId_status_publishedAt_idx" ON "Plan"("clinicId", "status", "publishedAt");

-- CreateIndex
CREATE INDEX "PlanTier_planId_ordering_idx" ON "PlanTier"("planId", "ordering");

-- CreateIndex
CREATE INDEX "PlanTier_clinicId_idx" ON "PlanTier"("clinicId");

-- CreateIndex
CREATE INDEX "PlanTier_stripePriceId_idx" ON "PlanTier"("stripePriceId");

-- CreateIndex
CREATE INDEX "PlanTier_planId_publishedAt_idx" ON "PlanTier"("planId", "publishedAt");

-- CreateIndex
CREATE INDEX "StripeEvent_connectedAccountId_idx" ON "StripeEvent"("connectedAccountId");

-- CreateIndex
CREATE INDEX "StripeEvent_type_receivedAt_idx" ON "StripeEvent"("type", "receivedAt");

-- CreateIndex
CREATE INDEX "StripeEvent_processedAt_idx" ON "StripeEvent"("processedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Member_stripeSubscriptionId_key" ON "Member"("stripeSubscriptionId");

-- CreateIndex
CREATE INDEX "Member_clinicId_status_idx" ON "Member"("clinicId", "status");

-- CreateIndex
CREATE INDEX "Member_clinicId_paymentFailedAt_idx" ON "Member"("clinicId", "paymentFailedAt");

-- CreateIndex
CREATE INDEX "Member_planTierId_idx" ON "Member"("planTierId");

-- CreateIndex
CREATE UNIQUE INDEX "Member_clinicId_stripeSubscriptionId_key" ON "Member"("clinicId", "stripeSubscriptionId");

-- CreateIndex
CREATE INDEX "ServiceRedemption_memberId_idx" ON "ServiceRedemption"("memberId");

-- CreateIndex
CREATE UNIQUE INDEX "ServiceRedemption_memberId_serviceKey_billingPeriodStart_key" ON "ServiceRedemption"("memberId", "serviceKey", "billingPeriodStart");

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Clinic" ADD CONSTRAINT "Clinic_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Plan" ADD CONSTRAINT "Plan_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlanTier" ADD CONSTRAINT "PlanTier_planId_fkey" FOREIGN KEY ("planId") REFERENCES "Plan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Member" ADD CONSTRAINT "Member_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Member" ADD CONSTRAINT "Member_planTierId_fkey" FOREIGN KEY ("planTierId") REFERENCES "PlanTier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceRedemption" ADD CONSTRAINT "ServiceRedemption_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- ========== RLS policies (merged from prisma/sql/*.sql) ==========

-- ----- prisma/sql/001-rls-policies.sql -----
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

-- ----- prisma/sql/002-stripe-rls.sql -----
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

-- ----- prisma/sql/003-plan-publish-rls.sql -----
-- Phase 3 Plan 01: re-assert RLS FORCE on Plan + PlanTier after new columns land.
-- Policies from 001-rls-policies.sql remain active (they are row-level, not
-- column-level), but re-running FORCE is cheap insurance after any schema change.
--
-- This file is idempotent — safe to re-apply.

ALTER TABLE "Plan" FORCE ROW LEVEL SECURITY;
ALTER TABLE "PlanTier" FORCE ROW LEVEL SECURITY;

-- Grants to the app role remain as set in 000-roles.sql — no change needed.

-- ----- prisma/sql/004-public-clinic-view.sql -----
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
GRANT SELECT ON v_public_clinic_plans TO PUBLIC;

COMMENT ON VIEW v_public_clinic_plans IS
  'Phase 3 PUB-05 / PITFALLS #4. Only surface the unauthed enrollment page reads. '
  'SECURITY DEFINER: bypasses RLS because the caller has no clinic GUC. '
  'Column list is explicit — new PlanTier fields do not auto-propagate here.';

-- ----- prisma/sql/005-member-rls.sql -----
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

-- ----- prisma/sql/006-redemption-rls.sql -----
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
