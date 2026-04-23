import { NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import {
  createConnectAccount,
  createAccountLink,
  persistAccountSnapshot,
  accountToSnapshot,
} from '@/lib/stripe/connect';

/**
 * POST /api/stripe/connect/link
 *
 * Thin JSON wrapper over the same start-or-resume flow as the
 * `startConnectOnboarding` server action. Used by client-side JS that
 * needs the AccountLink URL without following a form-action redirect.
 *
 * Response shape: { url: string } on success, { error: code } otherwise.
 * Always Node runtime — we call Stripe + Prisma + Better Auth here.
 */
export const runtime = 'nodejs';

export async function POST(): Promise<Response> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const clinic = await prisma.clinic.findUnique({
    where: { ownerUserId: session.user.id },
  });
  if (!clinic) {
    return NextResponse.json({ error: 'no_clinic' }, { status: 404 });
  }

  let accountId = clinic.stripeAccountId;
  if (!accountId) {
    const account = await createConnectAccount({
      clinicId: clinic.id,
      ownerEmail: session.user.email,
      practiceName: clinic.practiceName,
    });
    accountId = account.id;
    await prisma.clinic.update({
      where: { id: clinic.id },
      data: { stripeAccountId: account.id, stripeOnboardingState: 'in_progress' },
    });
    await persistAccountSnapshot(accountToSnapshot(account), 'direct');
  }

  const link = await createAccountLink(accountId);
  return NextResponse.json({ url: link.url });
}
