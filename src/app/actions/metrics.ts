'use server';

/**
 * Phase 6 (DASH-01) — dashboard metrics server loader.
 *
 * Thin adapter: pulls the full active-member set for the clinic (filtered by
 * status, projected to the small fields computeMrr needs) and feeds it
 * through the pure functions in src/lib/metrics.ts. Returning computed
 * numbers, not the raw member rows, means the dashboard client bundle
 * never sees per-member PII from the metrics flow.
 *
 * We deliberately read ALL statuses (active + past_due + canceled) in a
 * single query so the page header can cite "N past due" without a second
 * round trip. Metric functions filter to active internally.
 */

import { headers } from 'next/headers';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { withClinic } from '@/lib/tenant';
import {
  computeMrr,
  computeProjectedArrCents,
  breakdownByTier,
  computeRenewalForecast,
  type MemberForMetrics,
  type MrrBreakdown,
  type TierBreakdownRow,
  type RenewalForecast,
} from '@/lib/metrics';
import type { MemberStatus } from '@/lib/stripe/types';

export interface DashboardMetrics {
  mrr: MrrBreakdown;
  projectedArrCents: number;
  tierBreakdown: TierBreakdownRow[];
  renewalForecast: RenewalForecast;
  pastDueCount: number;
  totalMemberCount: number;
  timezone: string;
}

export async function loadDashboardMetrics(): Promise<DashboardMetrics> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) throw new Error('UNAUTHENTICATED');
  const clinic = await prisma.clinic.findUnique({
    where: { ownerUserId: session.user.id },
    select: { id: true, timezone: true },
  });
  if (!clinic) throw new Error('NO_CLINIC');

  const members = await withClinic(clinic.id, async (tx) =>
    tx.member.findMany({
      select: {
        id: true,
        status: true,
        currentPeriodEnd: true,
        canceledAt: true,
        planTier: {
          select: {
            id: true,
            tierName: true,
            monthlyFeeCents: true,
            stripeFeePerChargeCents: true,
            platformFeePerChargeCents: true,
          },
        },
      },
    }),
  );

  const typed: (MemberForMetrics & { canceledAt: Date | null })[] = members.map((m) => ({
    id: m.id,
    status: m.status as MemberStatus,
    currentPeriodEnd: m.currentPeriodEnd,
    canceledAt: m.canceledAt,
    planTier: m.planTier,
  }));

  const mrr = computeMrr(typed);
  const projectedArrCents = computeProjectedArrCents(mrr.grossCents);
  const tierBreakdown = breakdownByTier(typed);
  const renewalForecast = computeRenewalForecast(typed);
  const pastDueCount = typed.filter((m) => m.status === 'past_due').length;

  return {
    mrr,
    projectedArrCents,
    tierBreakdown,
    renewalForecast,
    pastDueCount,
    totalMemberCount: typed.length,
    timezone: clinic.timezone,
  };
}
