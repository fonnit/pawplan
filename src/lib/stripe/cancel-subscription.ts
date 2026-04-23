import type Stripe from 'stripe';
import { stripe } from './client';

/**
 * Owner-initiated cancellation. DASH-05.
 *
 * `cancel_at_period_end = true` means Stripe keeps the subscription AS IS
 * through `current_period_end`, then does NOT renew. The member retains
 * access until the period closes. When Stripe emits
 * `customer.subscription.deleted` at period end, our webhook handler
 * (plan 04-03 handleSubscriptionDeleted) flips `Member.status` to canceled.
 *
 * The UI writes `Member.canceledAt` optimistically on click (plan 04-04
 * cancelMember). Status stays whatever it was (active or past_due) until
 * the webhook arrives.
 *
 * No `stripeAccount` header — destination-charge subscriptions live on the
 * PLATFORM account (ARCHITECTURE.md Pattern 2). Passing a connected-account
 * id would route the cancel to the wrong subscription space.
 *
 * Idempotency key is STABLE (no time bucket) — calling cancel twice in a
 * row is a no-op on Stripe's side, not a duplicate "cancel request." If
 * the owner wants to un-cancel, that's a separate action out of scope v1.
 */
export async function cancelSubscriptionAtPeriodEnd(
  subscriptionId: string,
): Promise<Stripe.Subscription> {
  return stripe.subscriptions.update(
    subscriptionId,
    { cancel_at_period_end: true },
    { idempotencyKey: `cancel:${subscriptionId}:v1` },
  );
}
