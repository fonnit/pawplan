'use server';

import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { safeNext } from '@/lib/safe-next';
import { normalizeSlug, validateSlug } from '@/lib/slug';
import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { z } from 'zod';

/**
 * signUpClinicOwner — atomic User + Clinic creation (FOUND-01 / T-01-04-02).
 *
 * Better Auth and Prisma run on separate DB connections, so true cross-table
 * transactional atomicity isn't available without plumbing Better Auth
 * through a Prisma $transaction. Instead we implement a tight rollback that
 * guarantees the invariant "if the request returns an error, no orphan User
 * remains AND the browser has no valid session cookie":
 *
 *   1. Zod-validate inputs.
 *   2. Normalize + validate slug (reserved-word + ASCII-lowercase guard, FOUND-05).
 *   3. Pre-check slug uniqueness (UX signal — @unique at DB is the final guard).
 *   4. auth.api.signUpEmail creates the User + Account + Session + sets cookie.
 *   5. prisma.clinic.create links User -> Clinic.
 *   6. If (5) fails:
 *        a. auth.api.signOut — clear the session row AND the Set-Cookie header,
 *           so the browser doesn't walk away with a live cookie pointing at a
 *           User we're about to delete (HI-03).
 *        b. prisma.user.delete — cascades Session/Account rows.
 *        c. If (6b) fails, log and re-throw so the client sees a generic 500
 *           rather than a NEXT_REDIRECT into a broken /dashboard. No orphan
 *           is silently retained.
 *
 * On success, server-side redirects to `redirectTo` (safeNext-validated).
 * Next.js throws a NEXT_REDIRECT sentinel so the client component never sees
 * a return value; the return-type shape exists only for the error path.
 */

const SignUpSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(128),
  practiceName: z.string().min(2).max(100),
  slug: z.string().min(3).max(40),
  next: z.string().optional(),
});

export type SignUpFieldError = 'email' | 'password' | 'practiceName' | 'slug';
export type SignUpResult =
  | { ok: true }
  | { ok: false; field: SignUpFieldError; message: string };

export async function signUpClinicOwner(raw: {
  email: string;
  password: string;
  practiceName: string;
  slug: string;
  next?: string;
}): Promise<SignUpResult> {
  const parsed = SignUpSchema.safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const field = (issue?.path[0] as SignUpFieldError | undefined) ?? 'email';
    return { ok: false, field, message: issue?.message ?? 'Invalid input.' };
  }

  const { email, password, practiceName, slug: rawSlug, next: rawNext } = parsed.data;
  // CR-01: same-origin guard applies server-side too — client could bypass.
  const redirectTo = safeNext(rawNext ?? null);
  const slug = normalizeSlug(rawSlug);
  const slugCheck = validateSlug(slug);
  if (!slugCheck.ok) {
    const message =
      slugCheck.reason === 'reserved'
        ? 'That URL is taken. Try another.'
        : 'Use only lowercase letters, numbers, and hyphens (3-40 chars).';
    return { ok: false, field: 'slug', message };
  }

  const existingSlug = await prisma.clinic.findUnique({ where: { slug } });
  if (existingSlug) {
    return { ok: false, field: 'slug', message: 'That URL is taken. Try another.' };
  }

  let userId: string | undefined;
  try {
    const result = await auth.api.signUpEmail({
      body: { email, password, name: practiceName },
      headers: await headers(),
      asResponse: false,
    });
    // Better Auth 1.6 returns { user: { id }, token } or { user, session }
    // depending on plugin config. Narrow via runtime check.
    const maybeUser = (result as { user?: { id?: string } }).user;
    if (!maybeUser?.id) {
      return { ok: false, field: 'email', message: 'Signup failed. Please try again.' };
    }
    userId = maybeUser.id;

    // Clinic INSERT does not need withClinic — the Clinic RLS policy is
    // permissive when `app.current_clinic_id` is unset (bootstrap mode), and
    // strict when set. Signup runs in bootstrap mode. Dashboard layout also
    // uses bootstrap mode to resolve the caller's clinic by ownerUserId
    // (which is already UNIQUE + session-bound — tenant scope is enforced at
    // the app layer for Clinic lookups).
    try {
      await prisma.clinic.create({
        data: {
          ownerUserId: userId,
          practiceName,
          slug,
          accentColor: 'sage',
        },
      });
    } catch (e) {
      // HI-03: Clinic create failed. Before deleting the user, clear the
      // session cookie so the browser doesn't retain a token pointing at a
      // user we're about to remove. signOut clears both the server-side
      // Session row (so any cookie replay is rejected) and issues a
      // Set-Cookie header via nextCookies() that invalidates the cookie on
      // the response. Swallow signOut errors — the user.delete cascade will
      // still clean up the Session row, and re-throwing here would hide the
      // original clinic-create error from the client.
      try {
        await auth.api.signOut({ headers: await headers() });
      } catch {
        // Best effort. user.delete below cascades Session rows anyway.
      }

      // HI-03: no `.catch(() => {})` — if the user.delete fails, we do NOT
      // silently leave an orphan. Log and re-throw. The outer catch surfaces
      // a generic error to the client.
      if (userId) {
        try {
          await prisma.user.delete({ where: { id: userId } });
        } catch (rollbackErr) {
          console.error('signUpClinicOwner: rollback user.delete failed', {
            userId,
            clinicErr: (e as Error).message,
            rollbackErr: (rollbackErr as Error).message,
          });
          // Re-throw the rollback error so the outer catch runs its generic
          // mapping. The client does NOT get a NEXT_REDIRECT into /dashboard.
          throw rollbackErr;
        }
      }
      if ((e as { code?: string }).code === 'P2002') {
        return { ok: false, field: 'slug', message: 'That URL is taken. Try another.' };
      }
      throw e;
    }
  } catch (e) {
    const msg = (e as Error).message?.toLowerCase() ?? '';
    if (
      msg.includes('email') &&
      (msg.includes('exist') || msg.includes('already') || msg.includes('taken') || msg.includes('in use'))
    ) {
      return {
        ok: false,
        field: 'email',
        message: 'That email is already in use. Log in instead?',
      };
    }
    // Unknown failure — bubble up (never leak raw error text to the client).
    throw e;
  }

  // `redirectTo` is runtime-validated by safeNext(); cast satisfies Next.js
  // typed routes (which want a string-literal URL).
  redirect(redirectTo as Parameters<typeof redirect>[0]);
}
