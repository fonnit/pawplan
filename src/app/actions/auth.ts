'use server';

import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { safeNext } from '@/lib/safe-next';
import { normalizeSlug, validateSlug } from '@/lib/slug';
import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { z } from 'zod';

/**
 * signUpClinicOwner — atomic User + Clinic creation (FOUND-01).
 *
 * Flow:
 *   1. Zod-validate inputs.
 *   2. Normalize + validate slug (reserved-word + ASCII-lowercase guard, FOUND-05).
 *   3. Pre-check slug uniqueness (UX signal — @unique at DB is the final guard).
 *   4. auth.api.signUpEmail creates the User + session cookie.
 *   5. prisma.clinic.create links User -> Clinic with defaults.
 *   6. If (5) fails, roll back (4) via user.delete to avoid an orphan.
 *
 * On success, server-side redirects to `/dashboard`. Next.js throws a
 * NEXT_REDIRECT sentinel so the client component never sees a return value;
 * the return-type shape exists only for the error path.
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
      // Roll back the Better Auth user to avoid an orphan (T-01-04-02).
      if (userId) {
        await prisma.user.delete({ where: { id: userId } }).catch(() => {});
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
