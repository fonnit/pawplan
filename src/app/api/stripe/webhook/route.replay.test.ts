import { describe, it, expect, vi, beforeEach } from 'vitest';
import type Stripe from 'stripe';

const {
  mockRecord,
  mockMarkProcessed,
  mockMarkFailed,
  mockVerify,
  mockHandler,
  counter,
} = vi.hoisted(() => {
  const counter = { n: 0 };
  return {
    counter,
    mockRecord: vi.fn(async () => {
      counter.n++;
      if (counter.n === 1) return { duplicate: false, alreadyProcessed: false };
      return { duplicate: true, alreadyProcessed: true };
    }),
    mockMarkProcessed: vi.fn(async () => {}),
    mockMarkFailed: vi.fn(async () => {}),
    mockVerify: vi.fn((_body: string, _sig: string) => ({
      id: 'evt_replay_1',
      type: 'checkout.session.completed',
      created: 1_700_000_000,
      data: { object: {} },
    })),
    mockHandler: vi.fn(async () => {}),
  };
});

vi.mock('@/lib/stripe/webhook', () => ({
  verifyWebhookSignature: (body: string, sig: string | null) =>
    mockVerify(body, sig ?? ''),
  recordEvent: mockRecord,
  markEventProcessed: mockMarkProcessed,
  markEventFailed: mockMarkFailed,
  WebhookVerificationError: class extends Error {},
}));

vi.mock('@/lib/stripe/webhook-handlers', () => ({
  WEBHOOK_HANDLERS: { 'checkout.session.completed': mockHandler },
}));

vi.mock('@/lib/stripe/connect', () => ({
  persistAccountSnapshot: vi.fn(),
  accountToSnapshot: vi.fn(),
}));

import { POST } from './route';

function req(body: string = '{}'): Request {
  return new Request('http://localhost/api/stripe/webhook', {
    method: 'POST',
    headers: { 'stripe-signature': 't=1,v1=sig' },
    body,
  });
}

describe('webhook route — 5× replay idempotency', () => {
  beforeEach(() => {
    counter.n = 0;
    mockHandler.mockReset();
    mockMarkProcessed.mockReset();
    mockMarkFailed.mockReset();
  });

  it('dispatches handler exactly once across 5 identical deliveries', async () => {
    for (let i = 0; i < 5; i++) {
      const res = await POST(req());
      expect(res.status).toBe(200);
    }
    expect(mockHandler).toHaveBeenCalledTimes(1);
    expect(mockMarkProcessed).toHaveBeenCalledTimes(1);
    expect(mockMarkFailed).not.toHaveBeenCalled();
  });
});
