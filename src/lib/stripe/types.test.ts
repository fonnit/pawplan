import { describe, it, expect } from 'vitest';
import { isPublishReady, deriveOnboardingState } from './types';

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
