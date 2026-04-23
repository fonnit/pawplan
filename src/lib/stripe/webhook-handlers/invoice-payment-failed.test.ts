import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import type Stripe from 'stripe';

const mockFindUnique = vi.fn();
const mockUpdate = vi.fn();

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

import { handleInvoicePaymentFailed } from './invoice-payment-failed';

const CLINIC_ID = '11111111-1111-1111-1111-111111111111';
const SUB_ID = 'sub_failed';
const EVENT_CREATED_SEC = 1_700_000_000;

function makeEvent(subId: string | null = SUB_ID): Stripe.Event {
  return {
    id: 'evt_failed_1',
    type: 'invoice.payment_failed',
    created: EVENT_CREATED_SEC,
    data: {
      object: {
        id: 'in_failed',
        status: 'open',
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
      } as unknown as Stripe.Invoice,
    },
  } as unknown as Stripe.Event;
}

describe('handleInvoicePaymentFailed', () => {
  beforeEach(() => {
    mockFindUnique.mockReset();
    mockUpdate.mockReset();
  });

  it('flips member to past_due + stamps paymentFailedAt from event.created', async () => {
    mockFindUnique.mockResolvedValueOnce({
      id: 'mem_1',
      clinicId: CLINIC_ID,
      paymentFailedAt: null,
    });
    await handleInvoicePaymentFailed(makeEvent());
    expect(mockUpdate).toHaveBeenCalledTimes(1);
    const data = mockUpdate.mock.calls[0]![0].data;
    expect(data.status).toBe('past_due');
    expect(data.paymentFailedAt).toEqual(new Date(EVENT_CREATED_SEC * 1000));
  });

  it('preserves earlier paymentFailedAt if already set', async () => {
    const earlier = new Date(EVENT_CREATED_SEC * 1000 - 86_400_000);
    mockFindUnique.mockResolvedValueOnce({
      id: 'mem_1',
      clinicId: CLINIC_ID,
      paymentFailedAt: earlier,
    });
    await handleInvoicePaymentFailed(makeEvent());
    expect(mockUpdate.mock.calls[0]![0].data.paymentFailedAt).toEqual(earlier);
  });

  it('no-ops when member not found (race with checkout.session.completed)', async () => {
    mockFindUnique.mockResolvedValueOnce(null);
    await handleInvoicePaymentFailed(makeEvent());
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('no-ops on one-off invoices (no subscription)', async () => {
    await handleInvoicePaymentFailed(makeEvent(null));
    expect(mockFindUnique).not.toHaveBeenCalled();
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('PAY-05 defense: handler source contains zero email/notification imports', () => {
    const source = readFileSync(
      resolve(__dirname, 'invoice-payment-failed.ts'),
      'utf8',
    );
    // No email providers, no queue, no template rendering.
    expect(source).not.toMatch(/resend/i);
    expect(source).not.toMatch(/@react-email/i);
    expect(source).not.toMatch(/sendEmail|send_email|sendMail/);
    expect(source).not.toMatch(/\bqueue\b|pg-boss/i);
  });
});
