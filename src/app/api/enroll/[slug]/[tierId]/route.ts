import { NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { prisma } from '@/lib/db';
import { isPublishReady } from '@/lib/stripe/types';
import {
  createEnrollmentCheckoutSession,
  EnrollmentNotReadyError,
} from '@/lib/stripe/checkout';

// Node runtime required — Stripe SDK + Prisma Neon adapter both want it.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface RouteContext {
  params: Promise<{ slug: string; tierId: string }>;
}

/**
 * POST /api/enroll/{slug}/{tierId}
 *
 * Called from the public enrollment page when the pet owner clicks
 * "Start {tier} membership". Defers Checkout session creation to the
 * click (PITFALLS.md #8) so a newsletter-blast burst doesn't torch
 * our Stripe rate limit.
 *
 * Returns `{ url }` with the Stripe-hosted Checkout URL. Client redirects.
 * Does NOT create a Member row — that happens in the webhook (plan 04-03).
 *
 * SECURITY: this route is PUBLIC (no auth session). We read Clinic directly
 * via a BYPASSRLS query because:
 *   1. The enrollment page is unauthenticated; no session GUC is set.
 *   2. We only expose the three fields Checkout needs (id, slug, stripeAccountId)
 *      — never member data, never draft plans.
 *   3. We gate strictly on Plan.status === 'published' + isPublishReady().
 * Adding RLS scoping here would require a "public" GUC mode that's leakier
 * than the explicit tight query below.
 */
export async function POST(_req: Request, ctx: RouteContext): Promise<Response> {
  const { slug, tierId } = await ctx.params;

  // Parse origin from Host header so success_url/cancel_url match the
  // deployment (localhost:3000 dev vs pawplan.app prod).
  const hdrs = await headers();
  const host = hdrs.get('host');
  const proto =
    hdrs.get('x-forwarded-proto') ?? (host?.startsWith('localhost') ? 'http' : 'https');
  if (!host) {
    return NextResponse.json({ error: 'missing host header' }, { status: 400 });
  }
  const origin = `${proto}://${host}`;

  // Tight query: specific published tier + its plan's clinic matching slug.
  // PlanTier has no direct `clinic` relation (only clinicId), so we join via
  // `plan.clinic` — a bad slug or a draft plan returns null.
  const tier = await prisma.planTier.findFirst({
    where: {
      id: tierId,
      plan: {
        clinic: { slug },
        status: 'published',
      },
    },
    select: {
      id: true,
      planId: true,
      stripePriceId: true,
      tierName: true,
      plan: {
        select: {
          clinic: {
            select: {
              id: true,
              slug: true,
              stripeAccountId: true,
              stripeChargesEnabled: true,
              stripePayoutsEnabled: true,
              stripeDisabledReason: true,
            },
          },
        },
      },
    },
  });

  if (!tier) {
    // 404, not 403 — don't confirm existence of the slug for squatters (PITFALLS #5).
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }

  const clinic = tier.plan.clinic;

  // PITFALLS #1: re-verify the Connect account is still usable — a clinic
  // may have published yesterday and had capabilities revoked this morning.
  if (
    !isPublishReady({
      chargesEnabled: clinic.stripeChargesEnabled,
      payoutsEnabled: clinic.stripePayoutsEnabled,
      disabledReason: clinic.stripeDisabledReason,
    })
  ) {
    return NextResponse.json(
      { error: 'clinic_not_accepting_enrollments' },
      { status: 409 },
    );
  }

  try {
    const { url } = await createEnrollmentCheckoutSession({
      clinic: {
        id: clinic.id,
        slug: clinic.slug,
        stripeAccountId: clinic.stripeAccountId,
      },
      tier: {
        id: tier.id,
        planId: tier.planId,
        stripePriceId: tier.stripePriceId,
        tierName: tier.tierName,
      },
      origin,
    });

    return NextResponse.json({ url });
  } catch (err) {
    if (err instanceof EnrollmentNotReadyError) {
      return NextResponse.json({ error: err.code }, { status: 409 });
    }
    // Surface the raw Stripe/Prisma message so debugging isn't opaque.
    // Stripe error messages are human-readable and don't contain secrets.
    const detail = err instanceof Error ? err.message : String(err);
    console.error('[enroll] checkout session create failed', { slug, tierId, detail });
    return NextResponse.json(
      { error: 'checkout_failed', detail },
      { status: 500 },
    );
  }
}
