import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';

import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { isPublishReady } from '@/lib/stripe/types';
import type { StripeConnectRequirements } from '@/lib/stripe/types';
import { getPublishBlockedReason } from '@/lib/stripe/connect';
import { syncConnectStatus } from '@/app/actions/stripe';
import { getActiveDraft } from '@/app/actions/plans';

import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { DraftCard } from '@/components/builder/draft-card';
import { StripeConnectCard } from '@/components/dashboard/stripe-connect-card';
import { OnboardingBanner } from '@/components/dashboard/onboarding-banner';

export default async function DashboardHome({
  searchParams,
}: {
  searchParams: Promise<{ stripe?: string }>;
}) {
  const sp = await searchParams;

  // Returning from Stripe onboarding? Pull fresh state from Stripe as a
  // belt-and-suspenders against webhook delay. Happens BEFORE we read the
  // clinic row so the UI reflects authoritative Stripe state on the same
  // request.
  if (sp.stripe === 'return' || sp.stripe === 'refresh') {
    await syncConnectStatus();
  }

  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect('/login');
  const clinic = await prisma.clinic.findUnique({
    where: { ownerUserId: session.user.id },
  });
  if (!clinic) redirect('/signup');

  const state = clinic.stripeOnboardingState;
  const requirements = (clinic.stripeRequirements as StripeConnectRequirements | null) ?? {
    currently_due: [],
    eventually_due: [],
    past_due: [],
    pending_verification: [],
    disabled_reason: clinic.stripeDisabledReason,
  };

  const canPublish = isPublishReady({
    chargesEnabled: clinic.stripeChargesEnabled,
    payoutsEnabled: clinic.stripePayoutsEnabled,
    disabledReason: clinic.stripeDisabledReason,
  });

  const blockedReason = getPublishBlockedReason({
    onboardingState: state,
    currentlyDue: requirements.currently_due,
    disabledReason: clinic.stripeDisabledReason,
  });

  const draft = await getActiveDraft();

  return (
    <div>
      {/* Onboarding surface — exactly one of: connect card / banner / nothing (when complete). */}
      {state === 'not_started' && (
        <div className="mb-8">
          <StripeConnectCard />
        </div>
      )}
      {(state === 'in_progress' || state === 'action_required' || state === 'restricted') && (
        <OnboardingBanner
          state={state}
          requirements={requirements}
          blockedReason={blockedReason ?? 'Complete Stripe onboarding to publish.'}
        />
      )}

      {/* Primary content — existing Phase 1 draft surface, preserved unchanged. */}
      {draft ? (
        <div className="mx-auto mt-4 max-w-[480px]">
          <DraftCard
            draft={{
              planId: draft.planId,
              tierCount: draft.tierCount,
              updatedAt: draft.updatedAt,
            }}
          />
          <div className="mt-6 flex justify-center">
            {canPublish ? (
              <Button asChild size="lg">
                <Link href="/dashboard/plans">Review &amp; publish</Link>
              </Button>
            ) : (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span tabIndex={0} aria-describedby="publish-blocked">
                      <Button type="button" disabled size="lg" aria-disabled>
                        Publish plan
                      </Button>
                    </span>
                  </TooltipTrigger>
                  <TooltipContent id="publish-blocked">
                    {blockedReason ?? 'Publish is currently unavailable.'}
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
          </div>
        </div>
      ) : (
        <div className="mx-auto mt-4 max-w-[480px] text-center">
          <h1 className="text-[28px] font-semibold leading-[1.2]">
            Build your first wellness plan
          </h1>
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
      )}
    </div>
  );
}
