import type Stripe from 'stripe';
import { stripe } from './client';
import { prisma } from '@/lib/db';
import { env } from '@/lib/env';
import {
  type ConnectSnapshot,
  type OnboardingState,
  deriveOnboardingState,
  isPublishReady,
} from './types';

/**
 * Create an Express Connect account for a clinic. Idempotent by the
 * presence of clinic.stripeAccountId — callers should check that first
 * and only invoke this when null.
 *
 * Metadata pins `clinic_id` on the Stripe side so the account can be
 * cross-referenced without a PawPlan DB lookup (useful for Stripe support).
 */
export async function createConnectAccount(args: {
  clinicId: string;
  ownerEmail: string;
  practiceName: string;
}): Promise<Stripe.Account> {
  return stripe.accounts.create({
    type: 'express',
    country: 'US',
    email: args.ownerEmail,
    business_profile: { name: args.practiceName, mcc: '0742' }, // 0742 = Veterinary services
    capabilities: {
      card_payments: { requested: true },
      transfers: { requested: true },
    },
    metadata: { clinic_id: args.clinicId },
  });
}

/**
 * Create a fresh AccountLink. AccountLinks are SINGLE USE and expire
 * in ~5 minutes (PITFALLS #1). Always generate a new one per click.
 */
export async function createAccountLink(stripeAccountId: string): Promise<Stripe.AccountLink> {
  return stripe.accountLinks.create({
    account: stripeAccountId,
    refresh_url: `${env.NEXT_PUBLIC_APP_URL}/dashboard?stripe=refresh`,
    return_url: `${env.NEXT_PUBLIC_APP_URL}/dashboard?stripe=return`,
    type: 'account_onboarding',
    collection_options: { fields: 'eventually_due' }, // collect upfront, not at payout time
  });
}

/**
 * Build a snapshot from a Stripe.Account — this is the canonical mapping
 * between Stripe's wire format and our Clinic row shape.
 */
export function accountToSnapshot(account: Stripe.Account): ConnectSnapshot {
  const req = (account.requirements ?? {}) as Partial<Stripe.Account.Requirements>;
  return {
    stripeAccountId: account.id,
    chargesEnabled: account.charges_enabled ?? false,
    payoutsEnabled: account.payouts_enabled ?? false,
    detailsSubmitted: account.details_submitted ?? false,
    disabledReason: req.disabled_reason ?? null,
    requirements: {
      currently_due: req.currently_due ?? [],
      eventually_due: req.eventually_due ?? [],
      past_due: req.past_due ?? [],
      pending_verification: req.pending_verification ?? [],
      disabled_reason: req.disabled_reason ?? null,
    },
  };
}

/**
 * Persist a snapshot to the Clinic row. Derives onboardingState consistently
 * via deriveOnboardingState() so the DB is always in one of the five enum
 * states — never a hand-computed half-state.
 *
 * NOTE: this runs outside withClinic() on purpose. The webhook handler has
 * no session-derived clinic context — it resolves the clinic by
 * stripeAccountId from the event. A direct prisma.clinic.update() is safe
 * here because Clinic's RLS policy is permissive when the GUC is unset
 * (two-mode pattern from Phase 1).
 */
export async function persistAccountSnapshot(
  snapshot: ConnectSnapshot,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _source: 'webhook' | 'direct' = 'webhook',
): Promise<{ updated: boolean; clinicId: string | null }> {
  const state: OnboardingState = deriveOnboardingState({
    stripeAccountId: snapshot.stripeAccountId,
    chargesEnabled: snapshot.chargesEnabled,
    payoutsEnabled: snapshot.payoutsEnabled,
    detailsSubmitted: snapshot.detailsSubmitted,
    disabledReason: snapshot.disabledReason,
    requirementsCurrentlyDue: snapshot.requirements.currently_due,
  });

  // Single round-trip via updateMany — we don't need the clinic.id back
  // (no caller reads it in Phase 2) and updateMany is a no-op rather than
  // a throw when no row matches, which is the right behavior for the
  // "event arrived before we linked the account" race.
  const result = await prisma.clinic.updateMany({
    where: { stripeAccountId: snapshot.stripeAccountId },
    data: {
      stripeChargesEnabled: snapshot.chargesEnabled,
      stripePayoutsEnabled: snapshot.payoutsEnabled,
      stripeDetailsSubmitted: snapshot.detailsSubmitted,
      stripeDisabledReason: snapshot.disabledReason,
      stripeRequirements: snapshot.requirements as unknown as object,
      stripeOnboardingState: state,
      stripeCapabilitiesAt: new Date(),
    },
  });

  // clinicId is no longer returned — Phase 2 has no caller that reads it.
  // If Phase 3 needs it we can add a follow-up findUnique; until then,
  // keeping the shape `{ updated, clinicId: null }` avoids surprising
  // any downstream wiring that destructures the field.
  return { updated: result.count > 0, clinicId: null };
}

/**
 * Build the user-facing reason string explaining why Publish is disabled.
 * Translates Stripe's internal requirement keys into owner-readable English.
 *
 * Used by both the publish button tooltip AND the banner body.
 */
export function getPublishBlockedReason(args: {
  onboardingState: OnboardingState;
  currentlyDue: string[];
  disabledReason: string | null;
}): string | null {
  // Publish is allowed only when state is 'complete' — derived centrally.
  if (
    args.onboardingState === 'complete' &&
    isPublishReady({
      chargesEnabled: true,
      payoutsEnabled: true,
      disabledReason: args.disabledReason,
    })
  ) {
    return null; // publish is allowed
  }
  if (args.onboardingState === 'not_started') {
    return 'Connect your Stripe account to publish.';
  }
  if (args.onboardingState === 'restricted' && args.disabledReason) {
    return `Stripe restricted your account: ${args.disabledReason.replace(/_/g, ' ')}. Resolve in Stripe to publish.`;
  }
  if (args.currentlyDue.includes('external_account')) {
    return 'Your Stripe account needs bank info.';
  }
  if (args.currentlyDue.some((k) => k.includes('verification'))) {
    return 'Stripe needs to verify your identity documents.';
  }
  if (args.currentlyDue.length > 0) {
    return `Stripe needs a few more details (${args.currentlyDue.length} item${args.currentlyDue.length === 1 ? '' : 's'}).`;
  }
  if (args.onboardingState === 'in_progress') {
    return 'Stripe is verifying your account. This usually takes a minute.';
  }
  return 'Complete Stripe onboarding to publish.';
}
