import { describe, it, expect, vi, beforeEach } from 'vitest';
import type Stripe from 'stripe';

const { mockFindUnique, mockUpdate } = vi.hoisted(() => ({
  mockFindUnique: vi.fn(),
  mockUpdate: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  prisma: {
    member: {
      findUnique: mockFindUnique,
    },
  },
}));

vi.mock('@/lib/tenant', () => ({
  withClinic: async (_id: string, fn: (tx: unknown) => Promise<unknown>) =>
    fn({ member: { update: mockUpdate } }),
}));

import { handleSubscriptionDeleted } from './customer-subscription-deleted';

const CLINIC_ID = '11111111-1111-1111-1111-111111111111';
const SUB_ID = 'sub_deleted';

function makeEvent(
  canceledAt: number | null = 1_700_100_000,
  subId: string = SUB_ID,
): Stripe.Event {
  return {
    id: 'evt_del_1',
    type: 'customer.subscription.deleted',
    created: 1_700_200_000,
    data: {
      object: {
        id: subId,
        status: 'canceled',
        canceled_at: canceledAt,
      } as unknown as Stripe.Subscription,
    },
  } as unknown as Stripe.Event;
}

describe('handleSubscriptionDeleted', () => {
  beforeEach(() => {
    mockFindUnique.mockReset();
    mockUpdate.mockReset();
  });

  it('sets status=canceled + canceledAt from subscription.canceled_at', async () => {
    mockFindUnique.mockResolvedValueOnce({
      id: 'mem_1',
      clinicId: CLINIC_ID,
      canceledAt: null,
    });
    await handleSubscriptionDeleted(makeEvent(1_700_100_000));
    expect(mockUpdate).toHaveBeenCalledTimes(1);
    const data = mockUpdate.mock.calls[0]![0].data;
    expect(data.status).toBe('canceled');
    expect(data.canceledAt).toEqual(new Date(1_700_100_000 * 1000));
  });

  it('falls back to event.created when subscription.canceled_at is null', async () => {
    mockFindUnique.mockResolvedValueOnce({
      id: 'mem_1',
      clinicId: CLINIC_ID,
      canceledAt: null,
    });
    await handleSubscriptionDeleted(makeEvent(null));
    const data = mockUpdate.mock.calls[0]![0].data;
    expect(data.canceledAt).toEqual(new Date(1_700_200_000 * 1000));
  });

  it('preserves earlier optimistic canceledAt (DASH-05 owner-click timestamp)', async () => {
    const earlier = new Date(1_700_050_000 * 1000);
    mockFindUnique.mockResolvedValueOnce({
      id: 'mem_1',
      clinicId: CLINIC_ID,
      canceledAt: earlier,
    });
    await handleSubscriptionDeleted(makeEvent(1_700_100_000));
    expect(mockUpdate.mock.calls[0]![0].data.canceledAt).toEqual(earlier);
  });

  it('no-ops when member not found', async () => {
    mockFindUnique.mockResolvedValueOnce(null);
    await handleSubscriptionDeleted(makeEvent());
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('is idempotent across 5× replay — status stays canceled, earliest canceledAt retained', async () => {
    const earlier = new Date(1_700_050_000 * 1000);
    mockFindUnique.mockResolvedValue({
      id: 'mem_1',
      clinicId: CLINIC_ID,
      canceledAt: earlier,
    });
    const evt = makeEvent(1_700_100_000);
    for (let i = 0; i < 5; i++) await handleSubscriptionDeleted(evt);
    expect(mockUpdate).toHaveBeenCalledTimes(5);
    for (const call of mockUpdate.mock.calls) {
      expect(call[0].data.status).toBe('canceled');
      expect(call[0].data.canceledAt).toEqual(earlier);
    }
  });
});
