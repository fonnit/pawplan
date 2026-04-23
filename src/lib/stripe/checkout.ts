import type Stripe from 'stripe';
import { stripe } from './client';
import {
  CHECKOUT_CUSTOM_FIELD_KEYS,
  SPECIES_OPTIONS,
  type CheckoutSubscriptionMetadata,
} from './types';

/**
 * Platform application-fee percent — LOCKED at 10% per 2026-04-23 decision
 * (REQUIREMENTS.md §Locked Product Decisions). This constant is the ONLY
 * place the fee number appears in application code; future per-clinic fee
 * experiments must read from a config row, not edit this literal.
 *
 * Pairs with ARCHITECTURE.md Technical-Debt table row "Platform fee hardcoded":
 * acceptable for v1 provided the fee is also recorded in a platform_fees
 * ledger at webhook processing time (plan 04-03 scope).
 */
export const PLATFORM_FEE_PERCENT = 10 as const;

export class EnrollmentNotReadyError extends Error {
  readonly code = 'enrollment_not_ready';
  constructor(reason: string) {
    super(reason);
    this.name = 'EnrollmentNotReadyError';
  }
}

interface CreateCheckoutArgs {
  clinic: {
    id: string;
    slug: string;
    stripeAccountId: string | null;
  };
  tier: {
    id: string;
    planId: string;
    stripePriceId: string | null;
    tierName: string;
  };
  /** Optional owner-email prefill — Stripe Checkout will still show the field editable. */
  ownerEmailHint?: string;
  /** Origin of the outgoing request, e.g. "https://pawplan.app". No trailing slash. */
  origin: string;
}

/**
 * Create a subscription-mode Checkout Session with destination-charge
 * parameters (10% platform fee + `transfer_data.destination` = clinic's
 * connected account). Stripe collects pet name + species via custom_fields
 * (BLDR-07), pre-fills owner email via customer_email, and redirects to
 * `${origin}/${slug}/enroll/success?cs={CHECKOUT_SESSION_ID}` on completion.
 *
 * The Member row is NOT created here — that's the webhook handler's job
 * (plan 04-03 handleCheckoutSessionCompleted).
 */
export async function createEnrollmentCheckoutSession(
  args: CreateCheckoutArgs,
): Promise<{ sessionId: string; url: string }> {
  const { clinic, tier, ownerEmailHint, origin } = args;

  if (!clinic.stripeAccountId) {
    throw new EnrollmentNotReadyError(
      `clinic ${clinic.id} has no stripeAccountId — Connect onboarding incomplete`,
    );
  }
  if (!tier.stripePriceId) {
    throw new EnrollmentNotReadyError(
      `tier ${tier.id} has no stripePriceId — plan not published`,
    );
  }

  const metadata: CheckoutSubscriptionMetadata = {
    clinicId: clinic.id,
    planId: tier.planId,
    planTierId: tier.id,
  };

  // PITFALLS #8: 1-minute bucket on the idempotency key so a rage-click
  // within 60s collapses to a single session, but a deliberate retry 61s
  // later succeeds. Fine-grained buckets (per-second) would defeat dedupe.
  const minuteBucket = Math.floor(Date.now() / 60_000);
  const idempotencyKey = `enroll:${clinic.id}:${tier.id}:${minuteBucket}`;

  const params: Stripe.Checkout.SessionCreateParams = {
    mode: 'subscription',
    line_items: [{ price: tier.stripePriceId, quantity: 1 }],
    ...(ownerEmailHint ? { customer_email: ownerEmailHint } : {}),
    custom_fields: [
      {
        key: CHECKOUT_CUSTOM_FIELD_KEYS.petName,
        label: { type: 'custom', custom: "Pet's name" },
        type: 'text',
        text: { minimum_length: 1, maximum_length: 60 },
      },
      {
        key: CHECKOUT_CUSTOM_FIELD_KEYS.species,
        label: { type: 'custom', custom: 'Species' },
        type: 'dropdown',
        dropdown: {
          options: SPECIES_OPTIONS.map((o) => ({
            value: o.value,
            label: o.label,
          })),
        },
      },
    ],
    subscription_data: {
      transfer_data: { destination: clinic.stripeAccountId },
      application_fee_percent: PLATFORM_FEE_PERCENT,
      metadata: metadata as unknown as Record<string, string>,
    },
    success_url: `${origin}/${clinic.slug}/enroll/success?cs={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}/${clinic.slug}/enroll`,
  };

  // NOTE: no `Stripe-Account` header — destination charges are PLATFORM
  // calls (ARCHITECTURE Pattern 2). Passing stripeAccount here would
  // switch to direct charges, breaking the whole model.
  const session = await stripe.checkout.sessions.create(params, {
    idempotencyKey,
  });

  if (!session.url) {
    throw new Error(`Stripe returned a session with no url: ${session.id}`);
  }

  return { sessionId: session.id, url: session.url };
}
