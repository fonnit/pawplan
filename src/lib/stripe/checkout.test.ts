import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createEnrollmentCheckoutSession,
  EnrollmentNotReadyError,
  PLATFORM_FEE_PERCENT,
} from './checkout';
import { stripe } from './client';

vi.mock('./client', () => ({
  stripe: {
    checkout: {
      sessions: {
        create: vi.fn(),
      },
    },
  },
}));

const createMock = stripe.checkout.sessions.create as unknown as ReturnType<typeof vi.fn>;

const clinic = {
  id: '11111111-1111-1111-1111-111111111111',
  slug: 'hillside',
  stripeAccountId: 'acct_TEST123',
};
const tier = {
  id: '22222222-2222-2222-2222-222222222222',
  planId: '33333333-3333-3333-3333-333333333333',
  stripePriceId: 'price_TEST456',
  tierName: 'Preventive Plus',
};

beforeEach(() => {
  createMock.mockReset();
  createMock.mockResolvedValue({
    id: 'cs_test',
    url: 'https://checkout.stripe.com/c/pay/cs_test',
  });
});

describe('createEnrollmentCheckoutSession', () => {
  it('creates a subscription-mode session with the right line item', async () => {
    await createEnrollmentCheckoutSession({ clinic, tier, origin: 'https://pawplan.app' });
    const [params] = createMock.mock.calls[0]!;
    expect(params.mode).toBe('subscription');
    expect(params.line_items).toEqual([{ price: 'price_TEST456', quantity: 1 }]);
  });

  it('enables destination charges with the 10% platform fee', async () => {
    await createEnrollmentCheckoutSession({ clinic, tier, origin: 'https://pawplan.app' });
    const [params] = createMock.mock.calls[0]!;
    expect(params.subscription_data).toMatchObject({
      transfer_data: { destination: 'acct_TEST123' },
      application_fee_percent: 10,
    });
    expect(PLATFORM_FEE_PERCENT).toBe(10);
  });

  it('passes clinicId/planId/planTierId in subscription metadata so the webhook can identify the Member', async () => {
    await createEnrollmentCheckoutSession({ clinic, tier, origin: 'https://pawplan.app' });
    const [params] = createMock.mock.calls[0]!;
    expect(params.subscription_data.metadata).toEqual({
      clinicId: clinic.id,
      planId: tier.planId,
      planTierId: tier.id,
    });
  });

  it('includes pet_name + species custom fields with dog/cat dropdown', async () => {
    await createEnrollmentCheckoutSession({ clinic, tier, origin: 'https://pawplan.app' });
    const [params] = createMock.mock.calls[0]!;
    expect(params.custom_fields).toHaveLength(2);
    const [petName, species] = params.custom_fields!;
    expect(petName.key).toBe('pet_name');
    expect(petName.type).toBe('text');
    expect(species.key).toBe('species');
    expect(species.type).toBe('dropdown');
    expect(species.dropdown!.options.map((o: { value: string }) => o.value)).toEqual([
      'dog',
      'cat',
    ]);
  });

  it('uses success_url + cancel_url anchored to the clinic slug', async () => {
    await createEnrollmentCheckoutSession({ clinic, tier, origin: 'https://pawplan.app' });
    const [params] = createMock.mock.calls[0]!;
    expect(params.success_url).toBe(
      'https://pawplan.app/hillside/enroll/success?cs={CHECKOUT_SESSION_ID}',
    );
    expect(params.cancel_url).toBe('https://pawplan.app/hillside/enroll');
  });

  it('passes a per-minute-bucketed idempotency key as 2nd-arg options', async () => {
    await createEnrollmentCheckoutSession({ clinic, tier, origin: 'https://pawplan.app' });
    const [, opts] = createMock.mock.calls[0]!;
    expect(opts.idempotencyKey).toMatch(
      new RegExp(`^enroll:${clinic.id}:${tier.id}:\\d+$`),
    );
  });

  it('does NOT pass stripeAccount — destination charges are platform-level', async () => {
    await createEnrollmentCheckoutSession({ clinic, tier, origin: 'https://pawplan.app' });
    const [, opts] = createMock.mock.calls[0]!;
    expect(opts.stripeAccount).toBeUndefined();
  });

  it('pre-fills customer_email when ownerEmailHint provided', async () => {
    await createEnrollmentCheckoutSession({
      clinic,
      tier,
      origin: 'https://pawplan.app',
      ownerEmailHint: 'owner@example.com',
    });
    const [params] = createMock.mock.calls[0]!;
    expect(params.customer_email).toBe('owner@example.com');
  });

  it('throws EnrollmentNotReadyError if clinic has no stripeAccountId', async () => {
    await expect(
      createEnrollmentCheckoutSession({
        clinic: { ...clinic, stripeAccountId: null },
        tier,
        origin: 'https://pawplan.app',
      }),
    ).rejects.toBeInstanceOf(EnrollmentNotReadyError);
    expect(createMock).not.toHaveBeenCalled();
  });

  it('throws EnrollmentNotReadyError if tier has no stripePriceId', async () => {
    await expect(
      createEnrollmentCheckoutSession({
        clinic,
        tier: { ...tier, stripePriceId: null },
        origin: 'https://pawplan.app',
      }),
    ).rejects.toBeInstanceOf(EnrollmentNotReadyError);
  });
});
