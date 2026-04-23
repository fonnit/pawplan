import { describe, it, expect } from 'vitest';
import {
  computeMrr,
  computeProjectedArrCents,
  breakdownByTier,
  computeRenewalForecast,
  formatUsdFromCents,
  type MemberForMetrics,
} from './metrics';

// Shared fixture: two tiers with realistic cents values.
// tier-a: $40/mo → Stripe fee 2.9%*4000 + 30 = 146c ; platform 10% = 400c
// tier-b: $60/mo → Stripe fee 2.9%*6000 + 30 = 204c ; platform 10% = 600c
const tierA = {
  id: 'tier-a',
  tierName: 'Preventive',
  monthlyFeeCents: 4000,
  stripeFeePerChargeCents: 146,
  platformFeePerChargeCents: 400,
};
const tierB = {
  id: 'tier-b',
  tierName: 'Complete',
  monthlyFeeCents: 6000,
  stripeFeePerChargeCents: 204,
  platformFeePerChargeCents: 600,
};

function makeMember(
  id: string,
  status: 'active' | 'past_due' | 'canceled',
  tier: typeof tierA,
  currentPeriodEnd: Date | null = null,
  canceledAt: Date | null = null,
): MemberForMetrics & { canceledAt: Date | null } {
  return { id, status, currentPeriodEnd, canceledAt, planTier: tier };
}

describe('computeMrr', () => {
  it('returns zeroes for empty input', () => {
    expect(computeMrr([])).toEqual({
      grossCents: 0,
      stripeFeesCents: 0,
      platformFeeCents: 0,
      netCents: 0,
      activeMemberCount: 0,
    });
  });

  it('sums cents across active members on a single tier', () => {
    const r = computeMrr([
      makeMember('1', 'active', tierA),
      makeMember('2', 'active', tierA),
      makeMember('3', 'active', tierA),
    ]);
    expect(r.grossCents).toBe(12_000);
    expect(r.stripeFeesCents).toBe(438);
    expect(r.platformFeeCents).toBe(1_200);
    expect(r.netCents).toBe(12_000 - 438 - 1_200);
    expect(r.activeMemberCount).toBe(3);
  });

  it('mixes tiers correctly', () => {
    const r = computeMrr([
      makeMember('1', 'active', tierA),
      makeMember('2', 'active', tierB),
    ]);
    expect(r.grossCents).toBe(10_000);
    expect(r.stripeFeesCents).toBe(350);
    expect(r.platformFeeCents).toBe(1_000);
    expect(r.netCents).toBe(8_650);
    expect(r.activeMemberCount).toBe(2);
  });

  it('excludes past_due and canceled members', () => {
    const r = computeMrr([
      makeMember('1', 'active', tierA),
      makeMember('2', 'past_due', tierA),
      makeMember('3', 'canceled', tierA),
    ]);
    expect(r.activeMemberCount).toBe(1);
    expect(r.grossCents).toBe(4_000);
  });

  it('net = gross − stripe − platform exactly (no rounding drift)', () => {
    const r = computeMrr([
      makeMember('1', 'active', tierA),
      makeMember('2', 'active', tierB),
    ]);
    expect(r.grossCents - r.stripeFeesCents - r.platformFeeCents).toBe(r.netCents);
  });
});

describe('computeProjectedArrCents', () => {
  it('multiplies gross MRR by 12', () => {
    expect(computeProjectedArrCents(10_000)).toBe(120_000);
    expect(computeProjectedArrCents(0)).toBe(0);
  });
});

describe('breakdownByTier', () => {
  it('returns empty when no active members', () => {
    expect(breakdownByTier([])).toEqual([]);
  });

  it('groups by tier and sorts by MRR desc', () => {
    const rows = breakdownByTier([
      makeMember('1', 'active', tierA),
      makeMember('2', 'active', tierB),
      makeMember('3', 'active', tierB),
    ]);
    expect(rows).toHaveLength(2);
    expect(rows[0]!.tierId).toBe('tier-b'); // bigger MRR first
    expect(rows[0]!.memberCount).toBe(2);
    expect(rows[0]!.mrrCents).toBe(12_000);
    expect(rows[1]!.tierId).toBe('tier-a');
    expect(rows[1]!.memberCount).toBe(1);
    expect(rows[1]!.mrrCents).toBe(4_000);
  });

  it('ignores non-active members in grouping', () => {
    const rows = breakdownByTier([
      makeMember('1', 'active', tierA),
      makeMember('2', 'past_due', tierB),
      makeMember('3', 'canceled', tierB),
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.tierId).toBe('tier-a');
  });
});

describe('computeRenewalForecast', () => {
  const now = new Date('2026-04-23T12:00:00Z');

  it('returns zeroes when no members have a period end', () => {
    const r = computeRenewalForecast(
      [makeMember('1', 'active', tierA)],
      now,
    );
    expect(r.count).toBe(0);
    expect(r.grossCents).toBe(0);
  });

  it('counts members renewing in the 30-day window', () => {
    const r = computeRenewalForecast(
      [
        makeMember('1', 'active', tierA, new Date('2026-05-01T12:00:00Z')), // in window
        makeMember('2', 'active', tierB, new Date('2026-05-22T12:00:00Z')), // in window
        makeMember('3', 'active', tierA, new Date('2026-06-30T12:00:00Z')), // out of window
      ],
      now,
    );
    expect(r.count).toBe(2);
    expect(r.grossCents).toBe(10_000);
  });

  it('excludes past_due and canceled members from the forecast', () => {
    const r = computeRenewalForecast(
      [
        makeMember('1', 'past_due', tierA, new Date('2026-05-01T12:00:00Z')),
        makeMember('2', 'canceled', tierB, new Date('2026-05-05T12:00:00Z')),
        makeMember(
          '3',
          'active',
          tierA,
          new Date('2026-05-10T12:00:00Z'),
          new Date('2026-04-22T12:00:00Z'), // pending cancel at period end
        ),
      ],
      now,
    );
    expect(r.count).toBe(0);
    expect(r.grossCents).toBe(0);
  });
});

describe('formatUsdFromCents', () => {
  it('renders positive cents as USD', () => {
    expect(formatUsdFromCents(12_345)).toBe('$123.45');
  });
  it('renders zero cents', () => {
    expect(formatUsdFromCents(0)).toBe('$0.00');
  });
  it('renders negative cents', () => {
    expect(formatUsdFromCents(-50)).toBe('-$0.50');
  });
});
