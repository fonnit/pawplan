'use server';

/**
 * Phase 6 (DASH-04) — server action wrapping toggleRedemption.
 *
 * Session gate + clinic resolve happen here; the heavy lift lives in
 * src/lib/redemption.ts which is pure DB + idempotency logic. Keeping the
 * action thin makes the unit test in src/lib/redemption.test.ts the
 * authoritative proof — there's nothing here to test that the lib doesn't
 * already cover.
 */

import { headers } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { withClinic } from '@/lib/tenant';
import { toggleRedemption, type ToggleRedemptionResult } from '@/lib/redemption';
import { billingPeriodStartFrom } from '@/lib/time';

async function requireClinic(): Promise<{ clinicId: string; userId: string }> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) throw new Error('UNAUTHENTICATED');
  const clinic = await prisma.clinic.findUnique({
    where: { ownerUserId: session.user.id },
  });
  if (!clinic) throw new Error('NO_CLINIC');
  return { clinicId: clinic.id, userId: session.user.id };
}

export interface ToggleMemberServiceInput {
  memberId: string;
  serviceKey: string;
  desiredState: 'on' | 'off';
  expectedVersion?: number;
}

export type ToggleMemberServiceResult =
  | ToggleRedemptionResult
  | { status: 'no_billing_period'; message: string };

export async function toggleMemberService(
  input: ToggleMemberServiceInput,
): Promise<ToggleMemberServiceResult> {
  const { clinicId, userId } = await requireClinic();

  // Billing period is derived from the Member's current_period_end — the
  // single anchor (PITFALLS: never compute from wall clock). If Stripe
  // hasn't sent us a currentPeriodEnd yet (brand-new member in the gap
  // between checkout.session.completed and first invoice.paid), we reject
  // the toggle so the UI surfaces the correct "billing not yet confirmed"
  // message instead of creating a redemption against a null anchor.
  const member = await withClinic(clinicId, async (tx) =>
    tx.member.findUnique({
      where: { id: input.memberId },
      select: { id: true, currentPeriodEnd: true },
    }),
  );
  if (!member) return { status: 'not_found' };
  const billingPeriodStart = billingPeriodStartFrom(member.currentPeriodEnd);
  if (!billingPeriodStart) {
    return {
      status: 'no_billing_period',
      message: 'Waiting on Stripe to confirm the first billing period. Try again in a moment.',
    };
  }

  const result = await toggleRedemption({
    clinicId,
    memberId: input.memberId,
    serviceKey: input.serviceKey,
    billingPeriodStart,
    userId,
    desiredState: input.desiredState,
    expectedVersion: input.expectedVersion,
  });

  // Refresh the members page so the redemption panel repaints. No
  // revalidation on conflict/not_found since those don't change DB state.
  if (result.status === 'on' || result.status === 'off') {
    revalidatePath('/dashboard/members');
  }
  return result;
}
