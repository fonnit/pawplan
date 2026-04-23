'use client';
import { createAuthClient } from 'better-auth/react';

/**
 * Better Auth browser client.
 * `baseURL` falls back to window.location.origin when the env var isn't set
 * (shouldn't happen in practice because .env.local pins NEXT_PUBLIC_APP_URL).
 */
export const authClient = createAuthClient({
  baseURL:
    process.env['NEXT_PUBLIC_APP_URL'] ??
    (typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000'),
});

export const { signIn, signUp, signOut, useSession } = authClient;
