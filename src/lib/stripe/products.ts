import type Stripe from 'stripe';
import { stripe } from './client';

/**
 * Stripe Products + Prices helpers (Phase 3 PUB-03 / BLDR-08).
 *
 * Per ARCHITECTURE.md "Publish Flow": Products + Prices live on the PLATFORM
 * account (no `stripeAccount` header). Destination charges later put
 * `transfer_data.destination` on the subscription, which is owned by the
 * connected account — but the Product + Price catalog stays on the platform.
 *
 * Every call takes an explicit `idempotencyKey` so a retried publishPlan /
 * updatePlanPrices returns the same Stripe object and never litters the
 * dashboard with duplicates (PITFALLS #2).
 */

/**
 * Create a Stripe Product on the platform account.
 *
 * `name` is shown on the Stripe dashboard; keep it human-readable (we use
 * `${practiceName} — ${tierName}`). `metadata` cross-references the PawPlan
 * PlanTier row so Stripe support can trace an object back to our DB.
 */
export async function createPlatformProduct(args: {
  name: string;
  description: string;
  metadata: { clinicId: string; planId: string; tierId: string; tierKey: string };
  idempotencyKey: string;
}): Promise<Stripe.Product> {
  return stripe.products.create(
    {
      name: args.name,
      description: args.description,
      metadata: args.metadata,
      // Tax handling is Stripe Tax's job (Phase 6+); we don't flag the Product.
    },
    { idempotencyKey: args.idempotencyKey },
  );
}

/**
 * Create a recurring monthly Price attached to a Product on the platform
 * account. `unit_amount` is cents, USD (v1 US-only per REQUIREMENTS.md).
 *
 * `metadata.version` is coerced to string because Stripe metadata values must
 * be strings; the caller passes a number for type safety on our side.
 */
export async function createPlatformPrice(args: {
  productId: string;
  unitAmountCents: number;
  metadata: { clinicId: string; planId: string; tierId: string; version: number };
  idempotencyKey: string;
}): Promise<Stripe.Price> {
  return stripe.prices.create(
    {
      product: args.productId,
      unit_amount: args.unitAmountCents,
      currency: 'usd',
      recurring: { interval: 'month' },
      metadata: {
        clinicId: args.metadata.clinicId,
        planId: args.metadata.planId,
        tierId: args.metadata.tierId,
        version: String(args.metadata.version),
      },
    },
    { idempotencyKey: args.idempotencyKey },
  );
}
