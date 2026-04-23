import type Stripe from 'stripe';
import {
  verifyWebhookSignature,
  recordEvent,
  markEventProcessed,
  markEventFailed,
  WebhookVerificationError,
} from '@/lib/stripe/webhook';
import { persistAccountSnapshot, accountToSnapshot } from '@/lib/stripe/connect';

/**
 * Stripe webhook endpoint — single route for BOTH platform events AND
 * connected-account events (per ARCHITECTURE.md Pattern 1). Stripe tags
 * connected-account events with a top-level `account` field; platform
 * events omit it.
 *
 * Must run on Node runtime (Edge cannot handle raw bodies for signature
 * verification reliably).
 *
 * Response contract: 200 within <200ms. Heavy work is NOT done here —
 * Phase 5 will fan out to pg-boss. For Phase 2, account.updated persist
 * is the only dispatch target and it's a single DB round-trip.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request): Promise<Response> {
  const rawBody = await req.text();
  const signature = req.headers.get('stripe-signature');

  let event: Stripe.Event;
  try {
    event = verifyWebhookSignature(rawBody, signature);
  } catch (err) {
    if (err instanceof WebhookVerificationError) {
      return new Response('invalid signature', { status: 400 });
    }
    throw err;
  }

  // Idempotency — PK collision on event.id = duplicate delivery.
  // PITFALLS #2: at-least-once delivery means replay is expected.
  //
  // "Already processed" (processedAt != null) short-circuits with 200.
  // "Seen but failed" (processedAt == null) falls through so Stripe's
  // retry actually gets re-dispatched — otherwise a transient DB hiccup
  // on first delivery leaves the clinic stuck forever because every
  // subsequent retry would also 200 out without running the handler.
  const { duplicate, alreadyProcessed } = await recordEvent(event);
  if (duplicate && alreadyProcessed) {
    return new Response('duplicate', { status: 200 });
  }

  try {
    await dispatch(event);
    await markEventProcessed(event.id);
  } catch (err) {
    // Mark the row failed for forensic history, then return 5xx so
    // Stripe's exponential-backoff retry (~3 days) re-delivers. The
    // replay will find processedAt=null and re-enter the dispatch path
    // above. This is the ONLY recovery mechanism for transient failures;
    // swallowing with 200 previously broke the retry contract entirely.
    await markEventFailed(event.id, err);
    return new Response('handler failed', { status: 500 });
  }

  return new Response('ok', { status: 200 });
}

/**
 * Dispatch table — Phase 2 only handles account.updated. Other event
 * types are logged in StripeEvent (for future phases) and acknowledged.
 */
async function dispatch(event: Stripe.Event): Promise<void> {
  switch (event.type) {
    case 'account.updated': {
      const account = event.data.object as Stripe.Account;
      await persistAccountSnapshot(accountToSnapshot(account), 'webhook');
      return;
    }
    // Phase 3 will add: checkout.session.completed, invoice.paid, etc.
    default:
      // No-op for unknown types in Phase 2. Event is still persisted to
      // StripeEvent so we have forensic history when handlers land.
      return;
  }
}
