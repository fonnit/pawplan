import { describe, it, expect, vi, beforeEach } from 'vitest';
import type Stripe from 'stripe';

const { mockUpsert, mockUpdate, mockRetrieve, mockEnqueue } = vi.hoisted(() => ({
  mockUpsert: vi.fn(),
  mockUpdate: vi.fn(),
  mockRetrieve: vi.fn(),
  mockEnqueue: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  prisma: {
    member: {
      upsert: mockUpsert,
      update: mockUpdate,
    },
  },
}));

vi.mock('@/lib/tenant', () => ({
  withClinic: async (_id: string, fn: (tx: unknown) => Promise<unknown>) =>
    fn({ member: { upsert: mockUpsert, update: mockUpdate } }),
}));

vi.mock('@/lib/stripe/client', () => ({
  stripe: {
    subscriptions: {
      retrieve: (...args: unknown[]) => mockRetrieve(...args),
    },
  },
}));

vi.mock('@/lib/queue', () => ({
  enqueueNewEnrollmentJobs: (...args: unknown[]) => mockEnqueue(...args),
}));

import { handleCheckoutSessionCompleted } from './checkout-completed';

const CLINIC_ID = '11111111-1111-1111-1111-111111111111';
const PLAN_ID = '22222222-2222-2222-2222-222222222222';
const TIER_ID = '33333333-3333-3333-3333-333333333333';
const PERIOD_END_SEC = 1_700_000_000;

function makeSubscriptionRetrieveResult(
  overrides: Partial<Record<string, unknown>> = {},
): unknown {
  return {
    id: 'sub_test',
    status: 'active',
    metadata: {
      clinicId: CLINIC_ID,
      planId: PLAN_ID,
      planTierId: TIER_ID,
    },
    items: {
      data: [{ current_period_end: PERIOD_END_SEC }],
    },
    ...overrides,
  };
}

function makeEvent(overrides: Partial<Stripe.Checkout.Session> = {}): Stripe.Event {
  return {
    id: 'evt_test_1',
    type: 'checkout.session.completed',
    created: PERIOD_END_SEC,
    data: {
      object: {
        id: 'cs_test',
        mode: 'subscription',
        subscription: 'sub_test',
        customer: 'cus_test',
        customer_details: {
          email: 'owner@example.com',
        } as Stripe.Checkout.Session['customer_details'],
        customer_email: null,
        custom_fields: [
          { key: 'pet_name', type: 'text', text: { value: 'Rex' } },
          { key: 'species', type: 'dropdown', dropdown: { value: 'dog' } },
        ] as NonNullable<Stripe.Checkout.Session['custom_fields']>,
        ...overrides,
      } as Stripe.Checkout.Session,
    },
  } as unknown as Stripe.Event;
}

describe('handleCheckoutSessionCompleted', () => {
  beforeEach(() => {
    mockUpsert.mockReset();
    mockUpdate.mockReset();
    mockRetrieve.mockReset();
    mockEnqueue.mockReset();
    mockUpsert.mockResolvedValue({
      id: 'mem_1',
      welcomePacketSentAt: null,
      ownerNotifiedAt: null,
    });
    mockRetrieve.mockResolvedValue(makeSubscriptionRetrieveResult());
    mockEnqueue.mockResolvedValue({
      welcomePacketJobId: 'job_wp',
      ownerEnrollmentJobId: 'job_oe',
    });
  });

  it('creates a Member with status=active on first delivery', async () => {
    await handleCheckoutSessionCompleted(makeEvent());
    expect(mockUpsert).toHaveBeenCalledTimes(1);
    const args = mockUpsert.mock.calls[0]![0];
    expect(args.create).toMatchObject({
      petName: 'Rex',
      species: 'dog',
      ownerEmail: 'owner@example.com',
      stripeCustomerId: 'cus_test',
      stripeSubscriptionId: 'sub_test',
      status: 'active',
    });
    expect(args.where.clinicId_stripeSubscriptionId).toEqual({
      clinicId: CLINIC_ID,
      stripeSubscriptionId: 'sub_test',
    });
    expect(args.create.currentPeriodEnd).toBeInstanceOf(Date);
  });

  it('falls back to session.customer_email when customer_details.email missing', async () => {
    const evt = makeEvent({
      customer_details: { email: null } as Stripe.Checkout.Session['customer_details'],
      customer_email: 'fallback@example.com',
    });
    await handleCheckoutSessionCompleted(evt);
    expect(mockUpsert.mock.calls[0]![0].create.ownerEmail).toBe('fallback@example.com');
  });

  it('is idempotent: 5× replay yields 5 upsert calls with identical composite-key where clause', async () => {
    const evt = makeEvent();
    for (let i = 0; i < 5; i++) await handleCheckoutSessionCompleted(evt);
    expect(mockUpsert).toHaveBeenCalledTimes(5);
    for (const call of mockUpsert.mock.calls) {
      expect(call[0].where.clinicId_stripeSubscriptionId).toEqual({
        clinicId: CLINIC_ID,
        stripeSubscriptionId: 'sub_test',
      });
    }
  });

  it('throws when subscription metadata is missing clinicId', async () => {
    mockRetrieve.mockResolvedValueOnce(
      makeSubscriptionRetrieveResult({
        metadata: { planId: PLAN_ID, planTierId: TIER_ID },
      }),
    );
    await expect(handleCheckoutSessionCompleted(makeEvent())).rejects.toThrow(/metadata/);
    expect(mockUpsert).not.toHaveBeenCalled();
  });

  it('throws when custom_fields.pet_name is missing', async () => {
    const bad = makeEvent({
      custom_fields: [
        { key: 'species', type: 'dropdown', dropdown: { value: 'dog' } },
      ] as NonNullable<Stripe.Checkout.Session['custom_fields']>,
    });
    await expect(handleCheckoutSessionCompleted(bad)).rejects.toThrow(/custom_fields/);
    expect(mockUpsert).not.toHaveBeenCalled();
  });

  it('skips (no-op) non-subscription sessions', async () => {
    const evt = makeEvent({
      mode: 'payment' as Stripe.Checkout.Session['mode'],
      subscription: null,
    });
    await handleCheckoutSessionCompleted(evt);
    expect(mockUpsert).not.toHaveBeenCalled();
    expect(mockRetrieve).not.toHaveBeenCalled();
    expect(mockEnqueue).not.toHaveBeenCalled();
  });

  it('enqueues new-enrollment jobs on first delivery with event.id for dedupe', async () => {
    await handleCheckoutSessionCompleted(makeEvent());
    expect(mockEnqueue).toHaveBeenCalledTimes(1);
    expect(mockEnqueue).toHaveBeenCalledWith({
      memberId: 'mem_1',
      eventId: 'evt_test_1',
    });
  });

  it('skips enqueue when both timestamps already stamped (replay after both sends)', async () => {
    mockUpsert.mockResolvedValueOnce({
      id: 'mem_1',
      welcomePacketSentAt: new Date(),
      ownerNotifiedAt: new Date(),
    });
    await handleCheckoutSessionCompleted(makeEvent());
    expect(mockEnqueue).not.toHaveBeenCalled();
  });

  it('still enqueues when only one of the two timestamps is set (partial send replay)', async () => {
    mockUpsert.mockResolvedValueOnce({
      id: 'mem_1',
      welcomePacketSentAt: new Date(),
      ownerNotifiedAt: null,
    });
    await handleCheckoutSessionCompleted(makeEvent());
    expect(mockEnqueue).toHaveBeenCalledTimes(1);
  });
});
