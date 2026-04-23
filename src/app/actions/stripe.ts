'use server';

import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import {
  createConnectAccount,
  createAccountLink,
  persistAccountSnapshot,
  accountToSnapshot,
} from '@/lib/stripe/connect';
import { stripe } from '@/lib/stripe/client';

/**
 * Server action — start-or-resume Stripe Connect onboarding.
 *
 * - If clinic has no stripeAccountId: create Express account, persist id,
 *   snapshot capability state (all false initially), then create AccountLink.
 * - If clinic has an id but isn't complete: just regenerate AccountLink
 *   (AccountLinks expire in 5 min — see PITFALLS #1).
 *
 * Always redirects to the AccountLink URL. Stripe handles the rest; the
 * `return_url` brings the owner back to /dashboard?stripe=return, where the
 * dashboard page renders fresh state (webhook has likely arrived by then).
 */
export async function startConnectOnboarding(): Promise<never> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect('/login');
  const clinic = await prisma.clinic.findUnique({
    where: { ownerUserId: session.user.id },
  });
  if (!clinic) redirect('/signup');

  let accountId = clinic.stripeAccountId;
  if (!accountId) {
    const account = await createConnectAccount({
      clinicId: clinic.id,
      ownerEmail: session.user.email,
      practiceName: clinic.practiceName,
    });
    accountId = account.id;
    // Persist the ID immediately so a crash between now and AccountLink
    // creation doesn't create a dangling Stripe account on retry.
    await prisma.clinic.update({
      where: { id: clinic.id },
      data: {
        stripeAccountId: account.id,
        stripeOnboardingState: 'in_progress',
      },
    });
    // Snapshot baseline capability state (all false on fresh account).
    await persistAccountSnapshot(accountToSnapshot(account), 'direct');
  }

  const link = await createAccountLink(accountId);
  // Stripe AccountLink URLs are external (https://connect.stripe.com/…).
  // Next 16's typed routes only type-check internal paths, so we cast to
  // the loose Route type. The URL is sourced directly from Stripe's API
  // response — not user input — so there's no injection risk.
  redirect(link.url as never);
}

/**
 * Server action — poll Stripe for the current account state and persist.
 * Called from the dashboard's return path (`?stripe=return`) as a belt-
 * and-suspenders against webhook delay. The webhook is the primary path;
 * this is defensive.
 */
export async function syncConnectStatus(): Promise<void> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return;
  const clinic = await prisma.clinic.findUnique({
    where: { ownerUserId: session.user.id },
    select: { id: true, stripeAccountId: true },
  });
  if (!clinic?.stripeAccountId) return;
  const account = await stripe.accounts.retrieve(clinic.stripeAccountId);
  await persistAccountSnapshot(accountToSnapshot(account), 'direct');
}
