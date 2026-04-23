'use server';

import { revalidateTag } from 'next/cache';
import { headers } from 'next/headers';
import { z } from 'zod';
import { Prisma } from '@prisma/client';

import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { withClinic } from '@/lib/tenant';
import { PlanBuilderInputsSchema } from '@/lib/pricing/schema';
import { computeBreakEven, deriveTierFromMonthlyFeeCents } from '@/lib/pricing/breakEven';
import {
  isPublishReady,
  type PublishErrorCode,
  type PublishPlanResult,
  type PublishedPlanSnapshot,
  type PublishedPlanTierSnapshot,
  type PublishedPriceHistoryEntry,
} from '@/lib/stripe/types';
import { createPlatformProduct, createPlatformPrice } from '@/lib/stripe/products';

/**
 * Phase 3 publish entry points.
 *
 * publishPlan (PUB-03 + MATH-03):
 *   - Gate on auth + clinic + Connect readiness.
 *   - Re-load Plan.builderInputs from DB (under RLS), re-run computeBreakEven
 *     server-side — client-supplied numbers are ignored entirely (anti-tamper).
 *   - Create one Stripe Product + one Stripe Price per tier on the PLATFORM
 *     account, each with an idempotency key so retries don't duplicate.
 *   - Commit all tier + Plan writes in ONE withClinic transaction.
 *   - revalidateTag(`clinic:${slug}`) so the enrollment page cache flips.
 */

const PlanIdSchema = z.string().uuid();

async function requireClinic() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) throw new Error('UNAUTHENTICATED');
  const clinic = await prisma.clinic.findUnique({
    where: { ownerUserId: session.user.id },
  });
  if (!clinic) throw new Error('NO_CLINIC');
  return clinic;
}

const usdToCents = (usd: number) => Math.round(usd * 100);

export async function publishPlan(input: { planId: string }): Promise<PublishPlanResult> {
  // 1. Auth + validate input shape.
  let clinic: Awaited<ReturnType<typeof requireClinic>>;
  try {
    clinic = await requireClinic();
  } catch (e) {
    const msg = (e as Error).message;
    if (msg === 'UNAUTHENTICATED')
      return { ok: false, code: 'UNAUTHENTICATED', error: 'Please log in.' };
    if (msg === 'NO_CLINIC')
      return { ok: false, code: 'NO_CLINIC', error: 'No clinic found.' };
    throw e;
  }
  if (!PlanIdSchema.safeParse(input.planId).success) {
    return { ok: false, code: 'NO_DRAFT_PLAN', error: 'Invalid plan id.' };
  }

  // 2. Publish-ready gate — do NOT touch Stripe or DB if clinic isn't ready.
  if (
    !isPublishReady({
      chargesEnabled: clinic.stripeChargesEnabled,
      payoutsEnabled: clinic.stripePayoutsEnabled,
      disabledReason: clinic.stripeDisabledReason,
    })
  ) {
    return {
      ok: false,
      code: 'NOT_PUBLISH_READY',
      error: "Your Stripe account isn't ready to accept payments yet.",
    };
  }

  // 3. Load draft under RLS.
  const draft = await withClinic(clinic.id, (tx) =>
    tx.plan.findFirst({
      where: { id: input.planId, clinicId: clinic.id },
      include: { tiers: { orderBy: { ordering: 'asc' } } },
    }),
  );
  if (!draft) return { ok: false, code: 'NO_DRAFT_PLAN', error: 'Draft not found.' };
  if (draft.status === 'published')
    return { ok: false, code: 'ALREADY_PUBLISHED', error: 'Plan already published.' };

  // 4. Re-validate stored builderInputs shape — defensive against schema drift.
  const parsed = PlanBuilderInputsSchema.safeParse(draft.builderInputs);
  if (!parsed.success) {
    return {
      ok: false,
      code: 'VALIDATION_FAILED',
      error: 'Draft inputs are invalid. Edit and try again.',
    };
  }

  // 5. Re-run break-even math SERVER-SIDE (canonical — MATH-03).
  const canonical = computeBreakEven(parsed.data);

  if (canonical.tiers.length !== draft.tiers.length) {
    return {
      ok: false,
      code: 'VALIDATION_FAILED',
      error: 'Tier count mismatch. Re-save the draft.',
    };
  }

  type DbTier = (typeof draft.tiers)[number];
  const pairs: Array<{
    dbTier: DbTier;
    canonicalMonthlyCents: number;
    canonicalTier: (typeof canonical.tiers)[number];
  }> = [];
  for (let i = 0; i < canonical.tiers.length; i++) {
    const canonicalTier = canonical.tiers[i]!;
    const dbTier = draft.tiers.find((t) => t.tierKey === canonicalTier.tierKey);
    if (!dbTier) {
      return {
        ok: false,
        code: 'VALIDATION_FAILED',
        error: 'Tier out of sync. Re-save the draft.',
      };
    }
    pairs.push({
      dbTier,
      canonicalMonthlyCents: usdToCents(canonicalTier.lineItems.monthlyFeeUsd),
      canonicalTier,
    });
  }

  // 6. Create Stripe Product + Price per tier (platform account, idempotent).
  const stripeResults: Array<{
    tierId: string;
    productId: string;
    priceId: string;
    unitAmountCents: number;
    createdAt: string;
  }> = [];

  for (const { dbTier, canonicalMonthlyCents, canonicalTier } of pairs) {
    let product;
    try {
      product = await createPlatformProduct({
        name: `${clinic.practiceName} — ${dbTier.tierName}`,
        description: `${dbTier.tierName} wellness plan. Includes: ${canonicalTier.includedServices.join(', ')}.`,
        metadata: {
          clinicId: clinic.id,
          planId: draft.id,
          tierId: dbTier.id,
          tierKey: dbTier.tierKey,
        },
        idempotencyKey: `publish:${draft.id}:${dbTier.id}:product`,
      });
    } catch (e) {
      console.error('[publishPlan] products.create failed', {
        clinicId: clinic.id,
        tierId: dbTier.id,
        err: e,
      });
      return {
        ok: false,
        code: 'STRIPE_PRODUCT_CREATE_FAILED',
        error: 'Publish failed. Please try again.',
      };
    }

    let price;
    try {
      price = await createPlatformPrice({
        productId: product.id,
        unitAmountCents: canonicalMonthlyCents,
        metadata: {
          clinicId: clinic.id,
          planId: draft.id,
          tierId: dbTier.id,
          version: 1,
        },
        idempotencyKey: `publish:${draft.id}:${dbTier.id}:price:v1:${canonicalMonthlyCents}`,
      });
    } catch (e) {
      console.error('[publishPlan] prices.create failed', {
        clinicId: clinic.id,
        tierId: dbTier.id,
        err: e,
      });
      return {
        ok: false,
        code: 'STRIPE_PRICE_CREATE_FAILED',
        error: 'Publish failed. Please try again.',
      };
    }

    stripeResults.push({
      tierId: dbTier.id,
      productId: product.id,
      priceId: price.id,
      unitAmountCents: canonicalMonthlyCents,
      createdAt: new Date(price.created * 1000).toISOString(),
    });
  }

  // 7. Atomic DB update: all PlanTier rows + Plan.status in one withClinic txn.
  try {
    await withClinic(clinic.id, async (tx) => {
      for (const r of stripeResults) {
        const historyEntry: PublishedPriceHistoryEntry = {
          priceId: r.priceId,
          unitAmountCents: r.unitAmountCents,
          createdAt: r.createdAt,
          replacedAt: null,
        };
        await tx.planTier.update({
          where: { id: r.tierId },
          data: {
            stripeProductId: r.productId,
            stripePriceId: r.priceId,
            stripePriceHistory: [historyEntry] as unknown as Prisma.InputJsonValue,
            publishedAt: new Date(),
          },
        });
      }
      await tx.plan.update({
        where: { id: draft.id },
        data: { status: 'published', publishedAt: new Date() },
      });
    });
  } catch (e) {
    // Stripe Products/Prices are now orphaned — they will not cause double-charges
    // (they aren't attached to any subscription yet) and the idempotency keys
    // mean a retry reuses them. Log for ops visibility.
    console.error('[publishPlan] DB commit failed AFTER Stripe create', {
      clinicId: clinic.id,
      planId: draft.id,
      orphaned: stripeResults.map((r) => ({ productId: r.productId, priceId: r.priceId })),
      err: e,
    });
    return {
      ok: false,
      code: 'VALIDATION_FAILED',
      error: 'Publish failed. Please try again.',
    };
  }

  // 8. Invalidate the public enrollment page cache.
  // Next.js 16 requires a second `profile` arg on revalidateTag — pass 'default'
  // which matches the default cache-life profile (5-min stale-while-revalidate).
  revalidateTag(`clinic:${clinic.slug}`, 'default');

  // 9. Return the snapshot.
  const snapshot: PublishedPlanSnapshot = {
    clinicSlug: clinic.slug,
    clinicPracticeName: clinic.practiceName,
    clinicLogoUrl: clinic.logoUrl,
    clinicAccentColor: clinic.accentColor,
    planId: draft.id,
    planPublishedAt: new Date(),
    tierCount: draft.tierCount as 2 | 3,
    tiers: pairs.map(({ dbTier }, i): PublishedPlanTierSnapshot => {
      const r = stripeResults[i]!;
      return {
        tierId: dbTier.id,
        tierKey: dbTier.tierKey as PublishedPlanTierSnapshot['tierKey'],
        tierName: dbTier.tierName,
        includedServices: dbTier.includedServices as string[],
        retailValueBundledCents: dbTier.retailValueBundledCents,
        monthlyFeeCents: dbTier.monthlyFeeCents,
        stripeFeePerChargeCents: dbTier.stripeFeePerChargeCents,
        platformFeePerChargeCents: dbTier.platformFeePerChargeCents,
        clinicGrossPerPetPerYearCents: dbTier.clinicGrossPerPetPerYearCents,
        breakEvenMembers: dbTier.breakEvenMembers,
        stripeProductId: r.productId,
        stripePriceId: r.priceId,
        ordering: dbTier.ordering,
      };
    }),
  };

  return { ok: true, snapshot };
}

// ─── Phase 3 Plan 04: renameTiers + updatePlanPrices ────────────────────────
//
// renameTiers (BLDR-06):
//   - Draft-only; published plans refuse renames (Stripe Product name drift
//     otherwise corrupts the dashboard + receipts).
//   - Client submits { tierId, tierName } per tier; server validates trim +
//     length + no-HTML (`<` / `>` rejected).
//
// updatePlanPrices (BLDR-08):
//   - Published-only; creates a NEW Stripe Price on the SAME Stripe Product.
//   - Old Price stays active for existing subscriptions (Stripe supports
//     multiple active Prices per Product). The old stripePriceHistory entry
//     has replacedAt stamped at edit time; the new entry has replacedAt=null.
//   - Re-derives PlanTier.{stripeFee,platformFee,gross,breakEven}Cents via
//     deriveTierFromMonthlyFeeCents so the dashboard stays internally
//     consistent.
//   - Idempotency key: `price-edit:{planId}:{tierId}:v{N}:{cents}` where N is
//     history.length + 1.

const RenameTiersSchema = z.object({
  planId: z.string().uuid(),
  renames: z
    .array(
      z.object({
        tierId: z.string().uuid(),
        tierName: z
          .string()
          .trim()
          .min(1)
          .max(40)
          .regex(/^[^<>]+$/, 'No < or > in tier names'),
      }),
    )
    .min(1)
    .max(3),
});

const UpdatePricesSchema = z.object({
  planId: z.string().uuid(),
  priceChanges: z
    .array(
      z.object({
        tierId: z.string().uuid(),
        newMonthlyFeeCents: z.number().int().min(500).max(100_000),
      }),
    )
    .min(1)
    .max(3),
});

export async function renameTiers(
  input: z.infer<typeof RenameTiersSchema>,
): Promise<{ ok: true } | { ok: false; code: PublishErrorCode; error: string }> {
  const parsed = RenameTiersSchema.safeParse(input);
  if (!parsed.success)
    return {
      ok: false,
      code: 'VALIDATION_FAILED',
      error: parsed.error.issues[0]?.message ?? 'Invalid input',
    };

  let clinic: Awaited<ReturnType<typeof requireClinic>>;
  try {
    clinic = await requireClinic();
  } catch (e) {
    const msg = (e as Error).message;
    if (msg === 'UNAUTHENTICATED')
      return { ok: false, code: 'UNAUTHENTICATED', error: 'Please log in.' };
    if (msg === 'NO_CLINIC')
      return { ok: false, code: 'NO_CLINIC', error: 'No clinic found.' };
    throw e;
  }

  try {
    await withClinic(clinic.id, async (tx) => {
      const plan = await tx.plan.findFirst({
        where: { id: parsed.data.planId, clinicId: clinic.id },
        include: { tiers: true },
      });
      if (!plan) throw new Error('NO_DRAFT_PLAN');
      if (plan.status !== 'draft') throw new Error('ALREADY_PUBLISHED');

      for (const r of parsed.data.renames) {
        const belongs = plan.tiers.some((t) => t.id === r.tierId);
        if (!belongs) throw new Error('NO_DRAFT_PLAN');
        await tx.planTier.update({
          where: { id: r.tierId },
          data: { tierName: r.tierName },
        });
      }
    });
    return { ok: true };
  } catch (e) {
    const msg = (e as Error).message;
    if (msg === 'NO_DRAFT_PLAN')
      return { ok: false, code: 'NO_DRAFT_PLAN', error: 'Draft not found.' };
    if (msg === 'ALREADY_PUBLISHED')
      return {
        ok: false,
        code: 'ALREADY_PUBLISHED',
        error: 'Plan already published. Tier names are locked.',
      };
    console.error('[renameTiers] failed', { clinicId: clinic.id, err: e });
    return {
      ok: false,
      code: 'VALIDATION_FAILED',
      error: 'Something went wrong. Please try again.',
    };
  }
}

export async function updatePlanPrices(
  input: z.infer<typeof UpdatePricesSchema>,
): Promise<
  | {
      ok: true;
      updatedTiers: Array<{ tierId: string; newPriceId: string; newUnitAmountCents: number }>;
    }
  | { ok: false; code: PublishErrorCode; error: string }
> {
  const parsed = UpdatePricesSchema.safeParse(input);
  if (!parsed.success)
    return {
      ok: false,
      code: 'VALIDATION_FAILED',
      error: parsed.error.issues[0]?.message ?? 'Invalid input',
    };

  let clinic: Awaited<ReturnType<typeof requireClinic>>;
  try {
    clinic = await requireClinic();
  } catch (e) {
    const msg = (e as Error).message;
    if (msg === 'UNAUTHENTICATED')
      return { ok: false, code: 'UNAUTHENTICATED', error: 'Please log in.' };
    if (msg === 'NO_CLINIC')
      return { ok: false, code: 'NO_CLINIC', error: 'No clinic found.' };
    throw e;
  }

  if (
    !isPublishReady({
      chargesEnabled: clinic.stripeChargesEnabled,
      payoutsEnabled: clinic.stripePayoutsEnabled,
      disabledReason: clinic.stripeDisabledReason,
    })
  ) {
    return {
      ok: false,
      code: 'NOT_PUBLISH_READY',
      error: "Your Stripe account isn't ready.",
    };
  }

  const plan = await withClinic(clinic.id, (tx) =>
    tx.plan.findFirst({
      where: { id: parsed.data.planId, clinicId: clinic.id, status: 'published' },
      include: { tiers: true },
    }),
  );
  if (!plan)
    return { ok: false, code: 'NO_DRAFT_PLAN', error: 'Published plan not found.' };

  const overheadUsd = Number(plan.monthlyProgramOverheadUsd);

  type TierRow = (typeof plan.tiers)[number];
  const changes: Array<{ tier: TierRow; newCents: number; nextVersion: number }> = [];
  for (const c of parsed.data.priceChanges) {
    const tier = plan.tiers.find((t) => t.id === c.tierId);
    if (!tier)
      return { ok: false, code: 'NO_DRAFT_PLAN', error: 'Tier not found in this plan.' };
    if (!tier.stripeProductId || !tier.stripePriceId) {
      return {
        ok: false,
        code: 'VALIDATION_FAILED',
        error: 'Tier is missing Stripe Product. Re-publish first.',
      };
    }
    if (tier.monthlyFeeCents === c.newMonthlyFeeCents) continue;
    const history =
      (tier.stripePriceHistory as PublishedPriceHistoryEntry[] | null) ?? [];
    changes.push({
      tier,
      newCents: c.newMonthlyFeeCents,
      nextVersion: history.length + 1,
    });
  }
  if (changes.length === 0) {
    return { ok: true, updatedTiers: [] };
  }

  const stripeResults: Array<{
    tierId: string;
    newPriceId: string;
    newUnitAmountCents: number;
    createdAtIso: string;
    nextVersion: number;
  }> = [];
  for (const ch of changes) {
    try {
      const price = await createPlatformPrice({
        productId: ch.tier.stripeProductId!,
        unitAmountCents: ch.newCents,
        metadata: {
          clinicId: clinic.id,
          planId: plan.id,
          tierId: ch.tier.id,
          version: ch.nextVersion,
        },
        idempotencyKey: `price-edit:${plan.id}:${ch.tier.id}:v${ch.nextVersion}:${ch.newCents}`,
      });
      stripeResults.push({
        tierId: ch.tier.id,
        newPriceId: price.id,
        newUnitAmountCents: ch.newCents,
        createdAtIso: new Date(price.created * 1000).toISOString(),
        nextVersion: ch.nextVersion,
      });
    } catch (e) {
      console.error('[updatePlanPrices] prices.create failed', {
        clinicId: clinic.id,
        tierId: ch.tier.id,
        err: e,
      });
      return {
        ok: false,
        code: 'STRIPE_PRICE_CREATE_FAILED',
        error: 'Price update failed. Please try again.',
      };
    }
  }

  try {
    await withClinic(clinic.id, async (tx) => {
      for (const r of stripeResults) {
        const tier = changes.find((c) => c.tier.id === r.tierId)!.tier;
        const oldHistory =
          (tier.stripePriceHistory as PublishedPriceHistoryEntry[] | null) ?? [];
        const nowIso = new Date().toISOString();
        // Stamp replacedAt on the last entry whose replacedAt is still null
        // (the previously-active price). Leave earlier closed entries alone.
        const updatedOldHistory = oldHistory.map((e, i) =>
          i === oldHistory.length - 1 && e.replacedAt === null
            ? { ...e, replacedAt: nowIso }
            : e,
        );
        const newHistory: PublishedPriceHistoryEntry[] = [
          ...updatedOldHistory,
          {
            priceId: r.newPriceId,
            unitAmountCents: r.newUnitAmountCents,
            createdAt: r.createdAtIso,
            replacedAt: null,
          },
        ];
        const derived = deriveTierFromMonthlyFeeCents({
          monthlyFeeCents: r.newUnitAmountCents,
          monthlyProgramOverheadUsd: overheadUsd,
        });
        await tx.planTier.update({
          where: { id: r.tierId },
          data: {
            stripePriceId: r.newPriceId,
            stripePriceHistory: newHistory as unknown as Prisma.InputJsonValue,
            monthlyFeeCents: r.newUnitAmountCents,
            stripeFeePerChargeCents: derived.stripeFeePerChargeCents,
            platformFeePerChargeCents: derived.platformFeePerChargeCents,
            clinicGrossPerPetPerYearCents: derived.clinicGrossPerPetPerYearCents,
            // Coerce Infinity (impossible break-even) to 0 — the UI maps 0 to
            // "Monthly fee too low" in BreakEvenLineItems.
            breakEvenMembers:
              derived.breakEvenMembers === Number.POSITIVE_INFINITY
                ? 0
                : derived.breakEvenMembers,
          },
        });
      }
    });
  } catch (e) {
    console.error('[updatePlanPrices] DB commit failed AFTER Stripe create', {
      clinicId: clinic.id,
      planId: plan.id,
      orphaned: stripeResults.map((r) => ({ priceId: r.newPriceId })),
      err: e,
    });
    return {
      ok: false,
      code: 'VALIDATION_FAILED',
      error: 'Price update failed. Please try again.',
    };
  }

  revalidateTag(`clinic:${clinic.slug}`, 'default');

  return {
    ok: true,
    updatedTiers: stripeResults.map((r) => ({
      tierId: r.tierId,
      newPriceId: r.newPriceId,
      newUnitAmountCents: r.newUnitAmountCents,
    })),
  };
}
