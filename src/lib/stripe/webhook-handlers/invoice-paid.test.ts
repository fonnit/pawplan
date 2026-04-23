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

import { handleInvoicePaid } from './invoice-paid';

const CLINIC_ID = '11111111-1111-1111-1111-111111111111';
const SUB_ID = 'sub_invp';

function makeEvent(
  subId: string | null = SUB_ID,
  periodEnd: number | null = 1_700_500_000,
): Stripe.Event {
  return {
    id: 'evt_invp_1',
    type: 'invoice.paid',
    created: 1_700_000_000,
    data: {
      object: {
        id: 'in_1',
        status: 'paid',
        billing_reason: 'subscription_cycle',
        parent:
          subId == null
            ? null
            : {
                type: 'subscription_details',
                subscription_details: {
                  subscription: subId,
                  metadata: null,
                },
                quote_details: null,
              },
        lines: {
          data:
            periodEnd == null
              ? [{}]
              : [{ period: { end: periodEnd, start: 0 } }],
        },
      } as unknown as Stripe.Invoice,
    },
  } as unknown as Stripe.Event;
}

describe('handleInvoicePaid', () => {
  beforeEach(() => {
    mockFindUnique.mockReset();
    mockUpdate.mockReset();
  });

  it('flips past_due → active and clears paymentFailedAt when member exists', async () => {
    mockFindUnique.mockResolvedValueOnce({ id: 'mem_1', clinicId: CLINIC_ID });
    await handleInvoicePaid(makeEvent());
    expect(mockUpdate).toHaveBeenCalledTimes(1);
    expect(mockUpdate.mock.calls[0]![0]).toMatchObject({
      where: { id: 'mem_1' },
      data: expect.objectContaining({
        status: 'active',
        paymentFailedAt: null,
      }),
    });
    expect(mockUpdate.mock.calls[0]![0].data.currentPeriodEnd).toBeInstanceOf(Date);
  });

  it('no-ops when member not found (race with checkout.session.completed)', async () => {
    mockFindUnique.mockResolvedValueOnce(null);
    await handleInvoicePaid(makeEvent());
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('no-ops on one-off invoices (no subscription)', async () => {
    await handleInvoicePaid(makeEvent(null));
    expect(mockFindUnique).not.toHaveBeenCalled();
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('is idempotent across 5× replay', async () => {
    mockFindUnique.mockResolvedValue({ id: 'mem_1', clinicId: CLINIC_ID });
    const evt = makeEvent();
    for (let i = 0; i < 5; i++) await handleInvoicePaid(evt);
    expect(mockUpdate).toHaveBeenCalledTimes(5);
    const allEndStates = mockUpdate.mock.calls.map((c) => c[0].data.status);
    expect(new Set(allEndStates)).toEqual(new Set(['active']));
  });

  it('still updates status/paymentFailedAt when period.end is unavailable', async () => {
    mockFindUnique.mockResolvedValueOnce({ id: 'mem_1', clinicId: CLINIC_ID });
    await handleInvoicePaid(makeEvent(SUB_ID, null));
    const data = mockUpdate.mock.calls[0]![0].data;
    expect(data).toMatchObject({ status: 'active', paymentFailedAt: null });
    expect(data.currentPeriodEnd).toBeUndefined();
  });
});
