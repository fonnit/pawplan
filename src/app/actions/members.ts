'use server';

import { headers } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { withClinic } from '@/lib/tenant';
import { cancelSubscriptionAtPeriodEnd } from '@/lib/stripe/cancel-subscription';
import type { MemberStatus } from '@/lib/stripe/types';
import { billingPeriodStartFrom } from '@/lib/time';

/**
 * Members dashboard server actions (DASH-03, DASH-05).
 *
 * All reads + writes go through `withClinic()` so RLS enforces tenant
 * isolation at the DB layer. The response shape deliberately OMITS
 * `stripeCustomerId` and `stripeSubscriptionId` so the dashboard client
 * bundle never ships those — minimizes PII surface (T-04-04-02).
 */

// Local helper mirroring the pattern in src/app/actions/plans.ts.
async function requireClinic(): Promise<{ clinicId: string; userId: string }> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) throw new Error('UNAUTHENTICATED');
  const clinic = await prisma.clinic.findUnique({
    where: { ownerUserId: session.user.id },
  });
  if (!clinic) throw new Error('NO_CLINIC');
  return { clinicId: clinic.id, userId: session.user.id };
}

export interface MemberRow {
  id: string;
  petName: string;
  species: string;
  ownerEmail: string;
  tierName: string;
  status: MemberStatus;
  enrolledAt: Date;
  currentPeriodEnd: Date | null;
  paymentFailedAt: Date | null;
  canceledAt: Date | null;
  /** Phase 6 DASH-02 — services included in the member's tier (service keys). */
  includedServices: string[];
  /** Phase 6 DASH-02 — services already redeemed in the current billing period. */
  redeemedServiceKeys: string[];
  /** Phase 6 DASH-06 — current billing-period anchor in UTC (or null if none). */
  billingPeriodStart: Date | null;
}

export async function listMembers(): Promise<MemberRow[]> {
  const { clinicId } = await requireClinic();

  return withClinic(clinicId, async (tx) => {
    const rows = await tx.member.findMany({
      select: {
        id: true,
        petName: true,
        species: true,
        ownerEmail: true,
        status: true,
        enrolledAt: true,
        currentPeriodEnd: true,
        paymentFailedAt: true,
        canceledAt: true,
        planTier: { select: { tierName: true, includedServices: true } },
      },
      orderBy: [
        { paymentFailedAt: { sort: 'desc', nulls: 'last' } },
        { enrolledAt: 'desc' },
      ],
    });

    // Load redemptions for ALL members in one query, scoped to each member's
    // current billing period. The fan-out is per-member because each has its
    // own period anchor. Small N (single-page member list) so we OR the
    // (memberId, billingPeriodStart) tuples in a single findMany.
    const memberPeriods = rows
      .map((r) => ({
        memberId: r.id,
        periodStart: billingPeriodStartFrom(r.currentPeriodEnd),
      }))
      .filter((p): p is { memberId: string; periodStart: Date } => p.periodStart !== null);

    const redemptions = memberPeriods.length
      ? await tx.serviceRedemption.findMany({
          where: {
            OR: memberPeriods.map((p) => ({
              memberId: p.memberId,
              billingPeriodStart: p.periodStart,
            })),
          },
          select: { memberId: true, serviceKey: true },
        })
      : [];

    const byMember = new Map<string, string[]>();
    for (const r of redemptions) {
      const arr = byMember.get(r.memberId) ?? [];
      arr.push(r.serviceKey);
      byMember.set(r.memberId, arr);
    }

    return rows.map((r) => {
      const services = Array.isArray(r.planTier.includedServices)
        ? (r.planTier.includedServices as unknown[]).map(String)
        : [];
      return {
        id: r.id,
        petName: r.petName,
        species: r.species,
        ownerEmail: r.ownerEmail,
        tierName: r.planTier.tierName,
        status: r.status as MemberStatus,
        enrolledAt: r.enrolledAt,
        currentPeriodEnd: r.currentPeriodEnd,
        paymentFailedAt: r.paymentFailedAt,
        canceledAt: r.canceledAt,
        includedServices: services,
        redeemedServiceKeys: byMember.get(r.id) ?? [],
        billingPeriodStart: billingPeriodStartFrom(r.currentPeriodEnd),
      };
    });
  });
}

export type CancelMemberResult =
  | { ok: true; canceledAt: Date }
  | {
      ok: false;
      code: 'not_found' | 'already_canceled' | 'stripe_error';
      error: string;
    };

export async function cancelMember(memberId: string): Promise<CancelMemberResult> {
  const { clinicId } = await requireClinic();

  // Pre-flight outside the Stripe call. Cross-tenant memberIds return null
  // because the RLS-scoped tx cannot see them (T-04-04-01).
  const member = await withClinic(clinicId, async (tx) =>
    tx.member.findUnique({
      where: { id: memberId },
      select: {
        id: true,
        stripeSubscriptionId: true,
        canceledAt: true,
        status: true,
      },
    }),
  );

  if (!member) return { ok: false, code: 'not_found', error: 'Member not found' };
  if (member.canceledAt) {
    return {
      ok: false,
      code: 'already_canceled',
      error: 'This member is already scheduled for cancellation.',
    };
  }

  try {
    await cancelSubscriptionAtPeriodEnd(member.stripeSubscriptionId);
  } catch (err) {
    console.error('[cancelMember] stripe failed', err);
    return {
      ok: false,
      code: 'stripe_error',
      error:
        'We could not cancel this subscription with Stripe. Please try again.',
    };
  }

  const canceledAt = new Date();
  await withClinic(clinicId, async (tx) => {
    await tx.member.update({
      where: { id: memberId },
      data: { canceledAt },
    });
  });

  revalidatePath('/dashboard/members');
  return { ok: true, canceledAt };
}
