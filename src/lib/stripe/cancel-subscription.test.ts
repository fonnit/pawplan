import { describe, it, expect, vi, beforeEach } from 'vitest';

const { update } = vi.hoisted(() => ({ update: vi.fn() }));

vi.mock('./client', () => ({
  stripe: { subscriptions: { update } },
}));

import { cancelSubscriptionAtPeriodEnd } from './cancel-subscription';

beforeEach(() => {
  update.mockReset();
  update.mockResolvedValue({ id: 'sub_X', cancel_at_period_end: true });
});

describe('cancelSubscriptionAtPeriodEnd', () => {
  it('calls stripe.subscriptions.update with cancel_at_period_end: true and stable idempotency key', async () => {
    await cancelSubscriptionAtPeriodEnd('sub_X');
    expect(update).toHaveBeenCalledWith(
      'sub_X',
      { cancel_at_period_end: true },
      { idempotencyKey: 'cancel:sub_X:v1' },
    );
  });

  it('uses a stable (non-time-bucketed) idempotency key so repeat clicks are safe', async () => {
    await cancelSubscriptionAtPeriodEnd('sub_Y');
    await cancelSubscriptionAtPeriodEnd('sub_Y');
    const keys = update.mock.calls.map((c) => (c[2] as { idempotencyKey: string }).idempotencyKey);
    expect(keys[0]).toBe(keys[1]);
  });

  it('does not pass stripeAccount (platform-scoped call)', async () => {
    await cancelSubscriptionAtPeriodEnd('sub_Z');
    const [, , opts] = update.mock.calls[0]!;
    expect((opts as { stripeAccount?: string }).stripeAccount).toBeUndefined();
  });
});
