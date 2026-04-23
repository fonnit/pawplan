import type Stripe from 'stripe';
import { stripe } from './client';
import { prisma } from '@/lib/db';
import { env } from '@/lib/env';

/**
 * Thrown when a webhook payload fails signature verification.
 * Wraps Stripe's internal error so callers don't need to import
 * Stripe.errors.StripeSignatureVerificationError directly.
 */
export class WebhookVerificationError extends Error {
  readonly code = 'invalid_signature';
  cause?: unknown;
  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = 'WebhookVerificationError';
    this.cause = cause;
  }
}

/**
 * Verify a webhook payload with Stripe's canonical algorithm.
 *
 * IMPORTANT: rawBody MUST be the exact text of the request body —
 * never JSON.parse + JSON.stringify, never trimmed, never decoded.
 * In a Next.js 16 Route Handler, call `await req.text()` and pass
 * the result through unchanged.
 *
 * PITFALL reference: PITFALLS.md #2 — unsigned payloads are trivially
 * spoofable and can mint fake members at scale.
 */
export function verifyWebhookSignature(
  rawBody: string,
  signature: string | null | undefined,
  secret: string = env.STRIPE_WEBHOOK_SECRET,
): Stripe.Event {
  if (!signature || signature.length === 0) {
    throw new WebhookVerificationError('missing stripe-signature header');
  }
  try {
    return stripe.webhooks.constructEvent(rawBody, signature, secret);
  } catch (err) {
    throw new WebhookVerificationError(
      err instanceof Error ? err.message : 'signature verification failed',
      err,
    );
  }
}

/**
 * Record a verified Stripe event in the idempotency store.
 *
 * First delivery:  INSERT succeeds → returns { duplicate: false }
 * Retry delivery:  PK collision on event.id → returns { duplicate: true }
 *
 * Callers pattern:
 *   const { duplicate } = await recordEvent(event);
 *   if (duplicate) return new Response('ok', { status: 200 });
 *   // …process event…
 *   await markEventProcessed(event.id);
 *
 * PITFALL reference: PITFALLS.md #2 — Stripe guarantees at-least-once
 * delivery. Handlers MUST be idempotent on event.id.
 */
export async function recordEvent(event: Stripe.Event): Promise<{ duplicate: boolean }> {
  try {
    await prisma.stripeEvent.create({
      data: {
        id: event.id,
        type: event.type,
        connectedAccountId: event.account ?? null,
        apiVersion: event.api_version ?? null,
        payload: event as unknown as object, // Stripe.Event is a plain object, Prisma JSON accepts it
        receivedAt: new Date(event.created * 1000),
      },
    });
    return { duplicate: false };
  } catch (err) {
    // Prisma error P2002 = unique-constraint violation on PK (event.id).
    // Detect via error code without importing Prisma's Runtime error classes
    // (those force a CJS boundary that breaks Next 16 Edge serialization).
    if (
      err &&
      typeof err === 'object' &&
      'code' in err &&
      (err as { code?: string }).code === 'P2002'
    ) {
      return { duplicate: true };
    }
    throw err;
  }
}

/**
 * Mark an event as processed. Called AFTER the handler's work completes
 * so a failed processing leaves `processedAt=null` for a background sweep.
 */
export async function markEventProcessed(eventId: string): Promise<void> {
  await prisma.stripeEvent.update({
    where: { id: eventId },
    data: { processedAt: new Date(), processingError: null },
  });
}

/**
 * Mark an event as failed with the error message. Allows retry via
 * manual operator action or a future reconciliation job.
 */
export async function markEventFailed(eventId: string, error: unknown): Promise<void> {
  const message = error instanceof Error ? error.message : String(error);
  await prisma.stripeEvent.update({
    where: { id: eventId },
    data: { processingError: message.slice(0, 2000) },
  });
}
