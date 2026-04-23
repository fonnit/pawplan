/**
 * Phase 6 (DASH-01) — dashboard metric calculations.
 *
 * Pure functions only. No DB, no Stripe, no React. Consumed by the dashboard
 * home page server component which loads members + plan tiers via
 * `withClinic()` and passes them in.
 *
 * Money convention: every cent value is an integer. We never round money in
 * intermediate steps — the Stripe fee estimate is a fixed-point calc done
 * once per member, summed as-is. Display rounding happens at the render
 * layer via `formatUsdFromCents()`.
 *
 * Platform fee source of truth: `platformFeePerChargeCents` on PlanTier,
 * computed at publish time via the break-even pure function so it's exactly
 * what Stripe will retain on every destination charge. Do NOT hardcode 10%
 * here — the percentage is locked in product but the cents-per-tier number
 * is what actually clears.
 *
 * Stripe fee estimate: 2.9% + $0.30 per successful charge. Matches
 * `computeStripeFee()` in src/lib/pricing/breakEven.ts (grep keeps them
 * aligned). This is an ESTIMATE — real Stripe statements will vary by
 * region/card network. The dashboard labels it "est. fees."
 */

import type { MemberStatus } from '@/lib/stripe/types';

// ─── Types ────────────────────────────────────────────────────────────────

export interface MemberForMetrics {
  id: string;
  status: MemberStatus;
  currentPeriodEnd: Date | null;
  planTier: {
    id: string;
    tierName: string;
    monthlyFeeCents: number;
    stripeFeePerChargeCents: number;
    platformFeePerChargeCents: number;
  };
}

export interface MrrBreakdown {
  grossCents: number;
  stripeFeesCents: number;
  platformFeeCents: number;
  netCents: number;
  activeMemberCount: number;
}

export interface TierBreakdownRow {
  tierId: string;
  tierName: string;
  memberCount: number;
  mrrCents: number;
}

export interface RenewalForecast {
  count: number;
  grossCents: number;
  windowStart: Date;
  windowEnd: Date;
}

// ─── MRR ──────────────────────────────────────────────────────────────────

/**
 * Compute MRR from the set of currently-active members.
 *
 * `past_due` and `canceled` are excluded — a past-due member is not paying
 * this month by definition (Smart Retries OFF), and a canceled member is
 * either already gone or within the current period and already counted
 * once. The dashboard header separately shows the past-due count for
 * attention; it's not part of MRR.
 *
 * `net = gross − stripeFees − platformFee`. Platform fee is FonnIT's cut,
 * so "net" here is what lands in the clinic's Stripe balance.
 */
export function computeMrr(members: MemberForMetrics[]): MrrBreakdown {
  let grossCents = 0;
  let stripeFeesCents = 0;
  let platformFeeCents = 0;
  let activeMemberCount = 0;

  for (const m of members) {
    if (m.status !== 'active') continue;
    activeMemberCount += 1;
    grossCents += m.planTier.monthlyFeeCents;
    stripeFeesCents += m.planTier.stripeFeePerChargeCents;
    platformFeeCents += m.planTier.platformFeePerChargeCents;
  }

  const netCents = grossCents - stripeFeesCents - platformFeeCents;
  return { grossCents, stripeFeesCents, platformFeeCents, netCents, activeMemberCount };
}

// ─── Projected ARR ────────────────────────────────────────────────────────

/** ARR = gross MRR × 12. We project ARR off gross (pre-fee) because that's
 *  the industry-standard SaaS top-line — the clinic's revenue before
 *  processing costs. The net is visible too; no ambiguity. */
export function computeProjectedArrCents(grossMrrCents: number): number {
  return grossMrrCents * 12;
}

// ─── Tier breakdown ───────────────────────────────────────────────────────

/** Per-tier active member count + MRR contribution. Sorted by MRR descending
 *  so the biggest tier sits at the top of the dashboard pie. */
export function breakdownByTier(members: MemberForMetrics[]): TierBreakdownRow[] {
  const map = new Map<string, TierBreakdownRow>();
  for (const m of members) {
    if (m.status !== 'active') continue;
    const existing = map.get(m.planTier.id);
    if (existing) {
      existing.memberCount += 1;
      existing.mrrCents += m.planTier.monthlyFeeCents;
    } else {
      map.set(m.planTier.id, {
        tierId: m.planTier.id,
        tierName: m.planTier.tierName,
        memberCount: 1,
        mrrCents: m.planTier.monthlyFeeCents,
      });
    }
  }
  return Array.from(map.values()).sort((a, b) => b.mrrCents - a.mrrCents);
}

// ─── 30-day renewal forecast ──────────────────────────────────────────────

/**
 * Count + gross-cents of renewals in the next 30 days.
 *
 * Reads `currentPeriodEnd` directly — the value is already mirrored from
 * Stripe by the invoice.paid webhook, so no Stripe round-trip. `past_due`
 * and `canceled` members are excluded: past-due won't auto-retry (Smart
 * Retries OFF), canceled won't renew. `active` with a `canceledAt`
 * timestamp (cancel-at-period-end pending) is excluded because they won't
 * actually renew either — they'll flip to canceled at period end.
 *
 * @param now  inject current time for deterministic tests (defaults to
 *             new Date() at call-site)
 */
export function computeRenewalForecast(
  members: (MemberForMetrics & { canceledAt: Date | null })[],
  now: Date = new Date(),
): RenewalForecast {
  const windowStart = now;
  const windowEnd = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

  let count = 0;
  let grossCents = 0;
  for (const m of members) {
    if (m.status !== 'active') continue;
    if (m.canceledAt) continue; // won't actually renew
    if (!m.currentPeriodEnd) continue;
    const end = m.currentPeriodEnd;
    if (end >= windowStart && end <= windowEnd) {
      count += 1;
      grossCents += m.planTier.monthlyFeeCents;
    }
  }

  return { count, grossCents, windowStart, windowEnd };
}

// ─── Display helper ───────────────────────────────────────────────────────

/** Cents → "$1,234.56". Used by the dashboard cards + table. Pure for test. */
export function formatUsdFromCents(cents: number): string {
  const dollars = cents / 100;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(dollars);
}
