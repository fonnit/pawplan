'use server';

import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { withClinic } from '@/lib/tenant';
import { PlanBuilderInputsSchema } from '@/lib/pricing/schema';
import type { PlanBuilderInputs } from '@/lib/pricing/types';
import { headers } from 'next/headers';
import { Prisma } from '@prisma/client';

/**
 * Plan persistence server actions (BLDR-03 / BLDR-05).
 *
 * All writes are wrapped in `withClinic(clinic.id, tx)` — the Plan RLS policy
 * is strict-mode and will reject any write whose clinicId doesn't match the
 * transaction-local GUC (T-01-05-02 / T-01-05-04). Reads use withClinic too
 * so RLS hides rows from other tenants even if a caller passes a foreign
 * planId.
 *
 * safeParse runs server-side on every save so a tampered client payload
 * (e.g. DOM-edited discount=99) is rejected before reaching Postgres
 * (T-01-05-01).
 */

async function requireClinic() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) throw new Error('UNAUTHENTICATED');
  const clinic = await prisma.clinic.findUnique({
    where: { ownerUserId: session.user.id },
  });
  if (!clinic) throw new Error('NO_CLINIC');
  return clinic;
}

export async function getActiveDraft(): Promise<
  | {
      planId: string;
      builderInputs: PlanBuilderInputs;
      monthlyProgramOverheadUsd: number;
      tierCount: 2 | 3;
      updatedAt: Date;
    }
  | null
> {
  const clinic = await requireClinic();
  const draft = await withClinic(clinic.id, (tx) =>
    tx.plan.findFirst({
      where: { clinicId: clinic.id, status: 'draft' },
      orderBy: { updatedAt: 'desc' },
    }),
  );
  if (!draft) return null;

  // `builderInputs` is stored as Json — re-validate on the way out as a
  // safety net against schema drift (older rows from earlier plan shapes).
  const parsed = PlanBuilderInputsSchema.safeParse(draft.builderInputs);
  if (!parsed.success) return null;

  return {
    planId: draft.id,
    builderInputs: parsed.data,
    monthlyProgramOverheadUsd: Number(draft.monthlyProgramOverheadUsd),
    tierCount: draft.tierCount as 2 | 3,
    updatedAt: draft.updatedAt,
  };
}

export async function saveDraftPlan(input: {
  planId?: string;
  builderInputs: unknown;
}): Promise<
  | { ok: true; planId: string; updatedAt: Date }
  | { ok: false; error: string }
> {
  const parsed = PlanBuilderInputsSchema.safeParse(input.builderInputs);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid inputs' };
  }
  const data = parsed.data;
  const clinic = await requireClinic();

  const result = await withClinic(clinic.id, async (tx) => {
    if (input.planId) {
      return tx.plan.update({
        where: { id: input.planId },
        data: {
          builderInputs: data as Prisma.InputJsonValue,
          monthlyProgramOverheadUsd: data.monthlyProgramOverheadUsd ?? 500,
          tierCount: data.tierCount,
        },
      });
    }
    return tx.plan.create({
      data: {
        clinicId: clinic.id,
        status: 'draft',
        builderInputs: data as Prisma.InputJsonValue,
        monthlyProgramOverheadUsd: data.monthlyProgramOverheadUsd ?? 500,
        tierCount: data.tierCount,
      },
    });
  });

  return { ok: true, planId: result.id, updatedAt: result.updatedAt };
}

export async function deleteDraftPlan(
  planId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const clinic = await requireClinic();
  try {
    await withClinic(clinic.id, (tx) => tx.plan.delete({ where: { id: planId } }));
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}
