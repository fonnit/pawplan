import type Stripe from 'stripe';
import { stripe } from '@/lib/stripe/client';
import { withClinic } from '@/lib/tenant';
import {
  CHECKOUT_CUSTOM_FIELD_KEYS,
  type CheckoutSubscriptionMetadata,
} from '@/lib/stripe/types';

export class CheckoutMetadataError extends Error {
  readonly code = 'checkout_metadata_missing';
  constructor(message: string) {
    super(message);
    this.name = 'CheckoutMetadataError';
  }
}

type CheckoutCustomField = NonNullable<Stripe.Checkout.Session['custom_fields']>[number];

function readCustomField(
  fields: CheckoutCustomField[] | null | undefined,
  key: string,
): string | null {
  const entry = fields?.find((f) => f.key === key);
  if (!entry) return null;
  if (entry.type === 'text') return entry.text?.value ?? null;
  if (entry.type === 'dropdown') return entry.dropdown?.value ?? null;
  return null;
}

/**
 * `checkout.session.completed` handler.
 *
 * Creates (or idempotently refreshes) a Member row. Keyed on
 * (clinicId, stripeSubscriptionId) — the composite unique index on
 * Member prevents duplicate rows even if the route-level replay guard
 * is bypassed.
 *
 * Stripe API 2026-03-25.dahlia note: `current_period_end` moved from the
 * Subscription object down to each SubscriptionItem. We read it from
 * `subscription.items.data[0].current_period_end`.
 */
export async function handleCheckoutSessionCompleted(
  event: Stripe.Event,
): Promise<void> {
  const session = event.data.object as Stripe.Checkout.Session;

  if (session.mode !== 'subscription') {
    console.info(
      '[webhook] skip non-subscription checkout.session.completed',
      session.id,
    );
    return;
  }
  if (!session.subscription) {
    throw new CheckoutMetadataError(`session ${session.id} has no subscription`);
  }

  // Our Checkout code sets metadata on subscription_data, so it lives on the
  // subscription (not on the session). Retrieve the sub to read it back.
  const subscriptionId =
    typeof session.subscription === 'string'
      ? session.subscription
      : session.subscription.id;
  const subscription = (await stripe.subscriptions.retrieve(
    subscriptionId,
  )) as Stripe.Subscription;

  const meta = subscription.metadata as Partial<CheckoutSubscriptionMetadata>;
  if (!meta.clinicId || !meta.planId || !meta.planTierId) {
    throw new CheckoutMetadataError(
      `subscription ${subscriptionId} missing required metadata { clinicId, planId, planTierId }`,
    );
  }

  const petName = readCustomField(
    session.custom_fields,
    CHECKOUT_CUSTOM_FIELD_KEYS.petName,
  );
  const species = readCustomField(
    session.custom_fields,
    CHECKOUT_CUSTOM_FIELD_KEYS.species,
  );
  if (!petName || !species) {
    throw new CheckoutMetadataError(
      `session ${session.id} missing required custom_fields (pet_name, species)`,
    );
  }

  const ownerEmail =
    session.customer_details?.email ?? session.customer_email ?? null;
  if (!ownerEmail) {
    throw new CheckoutMetadataError(`session ${session.id} has no owner email`);
  }

  const stripeCustomerId =
    typeof session.customer === 'string'
      ? session.customer
      : (session.customer?.id ?? null);
  if (!stripeCustomerId) {
    throw new CheckoutMetadataError(
      `session ${session.id} has no stripe customer id`,
    );
  }

  // Stripe API 2026-03-25: current_period_end is on SubscriptionItem, not Subscription.
  const periodEndSec =
    (subscription.items as { data: Array<{ current_period_end?: number }> } | undefined)
      ?.data[0]?.current_period_end ?? null;
  const currentPeriodEnd = periodEndSec ? new Date(periodEndSec * 1000) : null;

  await withClinic(meta.clinicId, async (tx) => {
    await tx.member.upsert({
      where: {
        clinicId_stripeSubscriptionId: {
          clinicId: meta.clinicId!,
          stripeSubscriptionId: subscriptionId,
        },
      },
      create: {
        clinicId: meta.clinicId!,
        planTierId: meta.planTierId!,
        stripeCustomerId,
        stripeSubscriptionId: subscriptionId,
        petName,
        species,
        ownerEmail,
        status: 'active',
        currentPeriodEnd,
        paymentFailedAt: null,
      },
      update: {
        // Idempotent on replay: refresh period + clear failure flag; keep
        // petName / species / ownerEmail as first-seen.
        currentPeriodEnd,
        status: 'active',
        paymentFailedAt: null,
      },
    });
  });
}
