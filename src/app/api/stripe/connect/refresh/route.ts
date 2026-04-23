import { NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { createAccountLink } from '@/lib/stripe/connect';

/**
 * POST /api/stripe/connect/refresh
 *
 * Regenerates a fresh AccountLink for a clinic whose onboarding is
 * in-progress or action-required. AccountLinks expire 5 min after creation
 * (PITFALLS #1), so every time the owner returns to resume onboarding we
 * mint a brand-new link.
 *
 * Never creates an account — 400 if stripeAccountId isn't set.
 * Never regenerates for a completed clinic — 400 to signal the UI shouldn't
 * surface a resume button once state has flipped to 'complete'.
 */
export const runtime = 'nodejs';

export async function POST(): Promise<Response> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const clinic = await prisma.clinic.findUnique({
    where: { ownerUserId: session.user.id },
    select: { stripeAccountId: true, stripeOnboardingState: true },
  });
  if (!clinic?.stripeAccountId) {
    return NextResponse.json({ error: 'no_stripe_account' }, { status: 400 });
  }
  if (clinic.stripeOnboardingState === 'complete') {
    return NextResponse.json({ error: 'already_complete' }, { status: 400 });
  }
  const link = await createAccountLink(clinic.stripeAccountId);
  return NextResponse.json({ url: link.url });
}
