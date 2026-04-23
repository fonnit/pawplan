import type Stripe from 'stripe';
import { handleCheckoutSessionCompleted } from './checkout-completed';
import { handleInvoicePaid } from './invoice-paid';
import { handleInvoicePaymentFailed } from './invoice-payment-failed';
import { handleSubscriptionDeleted } from './customer-subscription-deleted';

/**
 * Dispatch table for Phase 4 subscription-lifecycle webhook events.
 *
 * Adding a new event type = one line here + a new handler file + tests.
 * The route (src/app/api/stripe/webhook/route.ts) looks up the handler
 * by `event.type` and invokes it inside the existing idempotency guard.
 */
export const WEBHOOK_HANDLERS: Record<
  string,
  (event: Stripe.Event) => Promise<void>
> = {
  'checkout.session.completed': handleCheckoutSessionCompleted,
  'invoice.paid': handleInvoicePaid,
  'invoice.payment_failed': handleInvoicePaymentFailed,
  'customer.subscription.deleted': handleSubscriptionDeleted,
};
