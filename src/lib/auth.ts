import { betterAuth } from 'better-auth';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import { nextCookies } from 'better-auth/next-js';
import { prisma } from './db';
import { env } from './env';

/**
 * Better Auth 1.6.7 server instance (FOUND-01/02/03).
 *
 * Email/password only — no email verification (CONTEXT Q4: instant signup).
 * Session cookie persists 7 days (FOUND-02 — survives browser restart).
 * Cookie name: `better-auth.session_token` (default prefix "better-auth").
 *
 * `nextCookies()` plugin is REQUIRED when invoking auth.api.* from inside a
 * Next.js Server Action — it propagates Set-Cookie headers into the
 * `cookies()` store so the browser receives the session cookie on the
 * action's response. Without it, the signup flow creates a user but the
 * subsequent `redirect('/dashboard')` arrives without a session cookie and
 * the middleware bounces the request back to /login.
 */
export const auth = betterAuth({
  database: prismaAdapter(prisma, { provider: 'postgresql' }),
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: false,
  },
  secret: env.BETTER_AUTH_SECRET,
  baseURL: env.BETTER_AUTH_URL,
  session: {
    expiresIn: 60 * 60 * 24 * 7, // 7 days
    updateAge: 60 * 60 * 24, // extend daily
    cookieCache: { enabled: true, maxAge: 5 * 60 },
  },
  plugins: [nextCookies()],
});

export type Session = typeof auth.$Infer.Session;
