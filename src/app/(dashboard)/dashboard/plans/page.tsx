import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';

import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { withClinic } from '@/lib/tenant';
import { isPublishReady } from '@/lib/stripe/types';
import type { StripeConnectRequirements } from '@/lib/stripe/types';
import { getPublishBlockedReason } from '@/lib/stripe/connect';
import { Button } from '@/components/ui/button';

import { PublishedPlanPanel } from './_components/published-plan-panel';
import { TierRenameRow } from './_components/tier-rename-row';
import { PublishPlanButton } from './_components/publish-plan-button';

/**
 * Phase 3 dashboard plans route.
 *
 * Branches:
 *   - No plan → onboarding CTA ("Start plan builder").
 *   - Draft plan → link to /dashboard/plans/new (builder) + tier-name edit
 *     rows + Publish button (BLDR-06 + PUB-03).
 *   - Published plan → PublishedPlanPanel (BLDR-08 price edits, enrollment
 *     URL, per-tier line-item breakdown — MATH-04/05).
 *
 * This is a server component; it loads the plan via withClinic under strict
 * RLS. Client components (PublishedPlanPanel, PublishPlanButton,
 * TierRenameRow, EditTierPricesDialog) receive serialized data as props.
 */
export default async function DashboardPlansPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect('/login');
  const clinic = await prisma.clinic.findUnique({
    where: { ownerUserId: session.user.id },
  });
  if (!clinic) redirect('/signup');

  // Most recent plan (either draft or published). Phase 3 still has one
  // active plan per clinic; the order-by guards against future multi-plan
  // behavior without changing this page's shape.
  const plan = await withClinic(clinic.id, (tx) =>
    tx.plan.findFirst({
      where: { clinicId: clinic.id },
      include: { tiers: { orderBy: { ordering: 'asc' } } },
      orderBy: { updatedAt: 'desc' },
    }),
  );

  if (!plan) {
    return (
      <div className="mx-auto mt-4 max-w-[480px] text-center">
        <h1 className="text-[28px] font-semibold leading-[1.2]">Build your first wellness plan</h1>
        <p className="mt-4 text-sm text-muted-foreground">
          Answer 8 questions. See your break-even math update live. Save a draft whenever you
          want.
        </p>
        <Button asChild className="mt-8">
          <Link href="/dashboard/plans/new">
            Start plan builder
            <ArrowRight className="ml-2 h-4 w-4" />
          </Link>
        </Button>
      </div>
    );
  }

  const canPublish = isPublishReady({
    chargesEnabled: clinic.stripeChargesEnabled,
    payoutsEnabled: clinic.stripePayoutsEnabled,
    disabledReason: clinic.stripeDisabledReason,
  });
  const requirements =
    (clinic.stripeRequirements as StripeConnectRequirements | null) ?? {
      currently_due: [],
      eventually_due: [],
      past_due: [],
      pending_verification: [],
      disabled_reason: clinic.stripeDisabledReason,
    };
  const blockedReason = getPublishBlockedReason({
    onboardingState: clinic.stripeOnboardingState,
    currentlyDue: requirements.currently_due,
    disabledReason: clinic.stripeDisabledReason,
  });

  if (plan.status === 'published') {
    return (
      <div className="mx-auto max-w-3xl">
        <PublishedPlanPanel
          planId={plan.id}
          slug={clinic.slug}
          accentColor={clinic.accentColor}
          publishedAt={plan.publishedAt ?? plan.updatedAt}
          tiers={plan.tiers.map((t) => ({
            tierId: t.id,
            tierName: t.tierName,
            retailValueBundledCents: t.retailValueBundledCents,
            monthlyFeeCents: t.monthlyFeeCents,
            stripeFeePerChargeCents: t.stripeFeePerChargeCents,
            platformFeePerChargeCents: t.platformFeePerChargeCents,
            clinicGrossPerPetPerYearCents: t.clinicGrossPerPetPerYearCents,
            breakEvenMembers: t.breakEvenMembers,
          }))}
        />
      </div>
    );
  }

  // Draft state.
  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <div>
        <h1 className="text-[28px] font-semibold leading-[1.2]">Your draft plan</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Edit inputs in the builder, rename tiers here, then click Publish when your Stripe
          account is ready.
        </p>
        <Button asChild variant="outline" className="mt-4">
          <Link href="/dashboard/plans/new">Open plan builder</Link>
        </Button>
      </div>

      <div className="rounded-lg border border-[#E8E6E0] bg-white p-6">
        <h2 className="text-lg font-semibold text-[#1C1B18]">Tier names</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Tier names are locked once you publish. Rename them now to match your practice.
        </p>
        <div className="mt-4 space-y-3">
          {plan.tiers.map((t) => (
            <TierRenameRow
              key={t.id}
              planId={plan.id}
              tierId={t.id}
              initialName={t.tierName}
            />
          ))}
        </div>
      </div>

      <div className="flex justify-end">
        <PublishPlanButton
          planId={plan.id}
          canPublish={canPublish}
          blockedReason={blockedReason}
        />
      </div>
    </div>
  );
}
