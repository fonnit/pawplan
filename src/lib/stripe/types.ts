import type { Prisma } from '@prisma/client';

/**
 * Subset of Stripe's Account.requirements we care about.
 * See https://docs.stripe.com/api/accounts/object#account_object-requirements
 *
 * NOT an exhaustive mapping — just the fields PUB-02 gates on and the
 * dashboard banner displays.
 */
export interface StripeConnectRequirements {
  currently_due: string[];
  eventually_due: string[];
  past_due: string[];
  pending_verification: string[];
  disabled_reason: string | null;
}

/**
 * Mirror of the Prisma OnboardingState enum as a TS string union.
 * Kept in lockstep with prisma/schema.prisma → enum OnboardingState.
 */
export type OnboardingState =
  | 'not_started'
  | 'in_progress'
  | 'action_required'
  | 'complete'
  | 'restricted';

/**
 * Snapshot of Connect capability state as persisted on Clinic.
 * Built from stripe.accounts.retrieve() OR account.updated event.
 */
export interface ConnectSnapshot {
  stripeAccountId: string;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  detailsSubmitted: boolean;
  disabledReason: string | null;
  requirements: StripeConnectRequirements;
}

/**
 * PUB-02 gate: publish is allowed IFF all three conditions hold.
 * This is the canonical predicate — used in publish server action
 * AND dashboard UI to keep the Publish button state consistent.
 */
export function isPublishReady(snapshot: {
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  disabledReason: string | null;
}): boolean {
  return (
    snapshot.chargesEnabled === true &&
    snapshot.payoutsEnabled === true &&
    snapshot.disabledReason === null
  );
}

/**
 * Derive OnboardingState from a snapshot — single source of truth used by
 * the webhook handler when persisting + the UI when rendering status.
 */
export function deriveOnboardingState(args: {
  stripeAccountId: string | null;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  detailsSubmitted: boolean;
  disabledReason: string | null;
  requirementsCurrentlyDue: string[];
}): OnboardingState {
  if (!args.stripeAccountId) return 'not_started';
  if (args.disabledReason) return 'restricted';
  if (isPublishReady(args)) return 'complete';
  if (args.requirementsCurrentlyDue.length > 0) return 'action_required';
  return 'in_progress';
}

/**
 * Prisma-side type helper: the JSON shape stored in Clinic.stripeRequirements.
 * Use `as Prisma.InputJsonValue` when writing, cast via this type when reading.
 */
export type StripeRequirementsJson = StripeConnectRequirements & Prisma.JsonObject;

// ─── Phase 3 — Publish types (PUB-03, PUB-04, PUB-05, BLDR-08) ──────────────
//
// These types are the canonical shape shared by:
//   - `publishPlan` server action (plan 03-02)
//   - `updatePlanPrices` server action (plan 03-04)
//   - public enrollment page data loader (plan 03-03)
//
// Money is in cents (integer). Never Decimal, never float, never USD string.

export interface PublishedPriceHistoryEntry {
  /** Stripe price ID — `price_…`. */
  priceId: string;
  /** Amount in cents (USD). */
  unitAmountCents: number;
  /** ISO 8601 string; when this price was created on Stripe. */
  createdAt: string;
  /** ISO 8601 string or null; when this price was superseded by a new one. Null = current active price. */
  replacedAt: string | null;
}

export interface PublishedPlanTierSnapshot {
  tierId: string;
  tierKey: 'preventive' | 'preventive-plus' | 'complete';
  tierName: string;
  includedServices: string[];
  retailValueBundledCents: number;
  monthlyFeeCents: number;
  stripeFeePerChargeCents: number;
  platformFeePerChargeCents: number;
  clinicGrossPerPetPerYearCents: number;
  breakEvenMembers: number;
  stripeProductId: string;
  stripePriceId: string;
  ordering: number;
}

export interface PublishedPlanSnapshot {
  clinicSlug: string;
  clinicPracticeName: string;
  clinicLogoUrl: string | null;
  clinicAccentColor: 'sage' | 'terracotta' | 'midnight' | 'wine' | 'forest' | 'clay';
  planId: string;
  planPublishedAt: Date;
  tierCount: 2 | 3;
  tiers: PublishedPlanTierSnapshot[];
}

/**
 * Error codes emitted by publishPlan / updatePlanPrices / renameTiers.
 * Union-of-ok/err keeps UI discrimination simple at the call site.
 */
export type PublishErrorCode =
  | 'NOT_PUBLISH_READY' // isPublishReady(connectSnapshot) === false
  | 'NO_DRAFT_PLAN'
  | 'STRIPE_PRODUCT_CREATE_FAILED'
  | 'STRIPE_PRICE_CREATE_FAILED'
  | 'VALIDATION_FAILED' // server-side re-run of computeBreakEven disagreed with client snapshot
  | 'ALREADY_PUBLISHED'
  | 'UNAUTHENTICATED'
  | 'NO_CLINIC';

export type PublishPlanResult =
  | { ok: true; snapshot: PublishedPlanSnapshot }
  | { ok: false; error: string; code: PublishErrorCode };
