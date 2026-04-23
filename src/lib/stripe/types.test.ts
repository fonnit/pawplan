import { describe, it, expect } from 'vitest';
import {
  isPublishReady,
  deriveOnboardingState,
  deriveMemberStatusFromSubscription,
  CHECKOUT_CUSTOM_FIELD_KEYS,
  SPECIES_OPTIONS,
  type MemberStatus,
} from './types';

describe('isPublishReady', () => {
  it('returns true when charges + payouts enabled and no disabled reason', () => {
    expect(
      isPublishReady({
        chargesEnabled: true,
        payoutsEnabled: true,
        disabledReason: null,
      }),
    ).toBe(true);
  });

  it('returns false when payouts are disabled (missing bank info case)', () => {
    expect(
      isPublishReady({
        chargesEnabled: true,
        payoutsEnabled: false,
        disabledReason: null,
      }),
    ).toBe(false);
  });

  it('returns false when charges are disabled', () => {
    expect(
      isPublishReady({
        chargesEnabled: false,
        payoutsEnabled: true,
        disabledReason: null,
      }),
    ).toBe(false);
  });

  it('returns false when account is restricted (disabled reason present)', () => {
    expect(
      isPublishReady({
        chargesEnabled: true,
        payoutsEnabled: true,
        disabledReason: 'requirements.past_due',
      }),
    ).toBe(false);
  });

  it('returns false when both capabilities disabled (fresh account)', () => {
    expect(
      isPublishReady({
        chargesEnabled: false,
        payoutsEnabled: false,
        disabledReason: null,
      }),
    ).toBe(false);
  });
});

describe('deriveOnboardingState', () => {
  const base = {
    chargesEnabled: false,
    payoutsEnabled: false,
    detailsSubmitted: false,
    disabledReason: null,
    requirementsCurrentlyDue: [] as string[],
  };

  it('returns not_started when no stripeAccountId', () => {
    expect(
      deriveOnboardingState({ ...base, stripeAccountId: null }),
    ).toBe('not_started');
  });

  it('returns restricted when disabledReason set (even if otherwise complete)', () => {
    expect(
      deriveOnboardingState({
        ...base,
        stripeAccountId: 'acct_1',
        chargesEnabled: true,
        payoutsEnabled: true,
        disabledReason: 'rejected.fraud',
      }),
    ).toBe('restricted');
  });

  it('returns complete when charges + payouts enabled and no disabled reason', () => {
    expect(
      deriveOnboardingState({
        ...base,
        stripeAccountId: 'acct_1',
        chargesEnabled: true,
        payoutsEnabled: true,
      }),
    ).toBe('complete');
  });

  it('returns action_required when currently_due is non-empty', () => {
    expect(
      deriveOnboardingState({
        ...base,
        stripeAccountId: 'acct_1',
        requirementsCurrentlyDue: ['external_account'],
      }),
    ).toBe('action_required');
  });

  it('returns in_progress when account exists but no capabilities + no requirements due', () => {
    expect(
      deriveOnboardingState({
        ...base,
        stripeAccountId: 'acct_1',
      }),
    ).toBe('in_progress');
  });
});

// ─── Phase 4 — Member lifecycle type contracts (PAY-07, BLDR-07) ────────────

describe('deriveMemberStatusFromSubscription', () => {
  // Stripe Subscription.Status enum values per @types/stripe v22.0.2.
  // `paused` was added by Stripe in 2024; the unknown-status default flags it.
  const cases: Record<string, MemberStatus> = {
    active: 'active',
    trialing: 'active',
    past_due: 'past_due',
    unpaid: 'past_due',
    incomplete: 'past_due',
    incomplete_expired: 'past_due',
    canceled: 'canceled',
    paused: 'past_due',
    anything_else: 'past_due',
  };

  it.each(Object.entries(cases))('maps %s → %s', (stripeStatus, expected) => {
    expect(deriveMemberStatusFromSubscription(stripeStatus)).toBe(expected);
  });
});

describe('CHECKOUT_CUSTOM_FIELD_KEYS', () => {
  it('uses snake_case keys Stripe accepts (max 25 chars, [a-z0-9_])', () => {
    for (const key of Object.values(CHECKOUT_CUSTOM_FIELD_KEYS)) {
      expect(key).toMatch(/^[a-z0-9_]{1,25}$/);
    }
  });
});

describe('SPECIES_OPTIONS', () => {
  it('only includes dog + cat (v1 out-of-scope for exotics)', () => {
    expect(SPECIES_OPTIONS.map((o) => o.value)).toEqual(['dog', 'cat']);
  });
});
