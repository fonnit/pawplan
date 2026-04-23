import { describe, it, expect, beforeAll } from 'vitest';
import Stripe from 'stripe';

const TEST_SECRET = 'whsec_test_' + 'a'.repeat(32);

// Make sure env.ts doesn't blow up when webhook.ts imports it at module load.
// vitest loads env from `.env.local` via vitest.config.ts; the Stripe
// placeholder secrets in the repo's .env.local satisfy the Zod regex already.
// We overwrite here to guarantee the TEST_SECRET matches whatever the
// verification function reads for its default param.
beforeAll(() => {
  process.env['STRIPE_SECRET_KEY'] = 'sk_test_' + 'b'.repeat(32);
  process.env['STRIPE_WEBHOOK_SECRET'] = TEST_SECRET;
});

// Build a realistic event payload. Exact shape doesn't matter for signature
// verification — the algorithm hashes whatever bytes we hand it.
const samplePayload = {
  id: 'evt_test_1',
  object: 'event',
  type: 'account.updated',
  created: Math.floor(Date.now() / 1000),
  data: { object: { id: 'acct_test', object: 'account' } },
  livemode: false,
  pending_webhooks: 1,
  request: { id: null, idempotency_key: null },
};
const rawBody = JSON.stringify(samplePayload);

/**
 * Create a valid Stripe-Signature header for the given body + secret.
 * This is what Stripe itself would send — we use the SDK helper so the
 * signature format matches byte-for-byte.
 */
function signHeader(body: string, secret: string, timestamp?: number) {
  return Stripe.webhooks.generateTestHeaderString({
    payload: body,
    secret,
    timestamp: timestamp ?? Math.floor(Date.now() / 1000),
  });
}

describe('verifyWebhookSignature', () => {
  it('accepts a correctly-signed payload and returns the parsed event', async () => {
    const { verifyWebhookSignature } = await import('./webhook');
    const sig = signHeader(rawBody, TEST_SECRET);
    const event = verifyWebhookSignature(rawBody, sig, TEST_SECRET);
    expect(event.id).toBe('evt_test_1');
    expect(event.type).toBe('account.updated');
  });

  it('throws WebhookVerificationError on wrong secret', async () => {
    const { verifyWebhookSignature, WebhookVerificationError } = await import('./webhook');
    const sig = signHeader(rawBody, TEST_SECRET);
    expect(() =>
      verifyWebhookSignature(rawBody, sig, 'whsec_wrong_' + 'c'.repeat(32)),
    ).toThrow(WebhookVerificationError);
  });

  it('throws WebhookVerificationError when body was tampered with', async () => {
    const { verifyWebhookSignature, WebhookVerificationError } = await import('./webhook');
    const sig = signHeader(rawBody, TEST_SECRET);
    const tamperedBody = rawBody.replace('account.updated', 'account.deleted');
    expect(() => verifyWebhookSignature(tamperedBody, sig, TEST_SECRET)).toThrow(
      WebhookVerificationError,
    );
  });

  it('throws before calling Stripe when signature header is missing', async () => {
    const { verifyWebhookSignature } = await import('./webhook');
    expect(() => verifyWebhookSignature(rawBody, null, TEST_SECRET)).toThrow(
      /missing stripe-signature/i,
    );
    expect(() => verifyWebhookSignature(rawBody, '', TEST_SECRET)).toThrow(
      /missing stripe-signature/i,
    );
    expect(() => verifyWebhookSignature(rawBody, undefined, TEST_SECRET)).toThrow(
      /missing stripe-signature/i,
    );
  });

  it('throws WebhookVerificationError on stale timestamp (replay attack)', async () => {
    const { verifyWebhookSignature, WebhookVerificationError } = await import('./webhook');
    // Stripe rejects signatures older than 5 minutes by default.
    const staleTs = Math.floor(Date.now() / 1000) - 60 * 10;
    const sig = signHeader(rawBody, TEST_SECRET, staleTs);
    expect(() => verifyWebhookSignature(rawBody, sig, TEST_SECRET)).toThrow(
      WebhookVerificationError,
    );
  });
});
