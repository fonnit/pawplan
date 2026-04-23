import { z } from 'zod';

const Env = z.object({
  DATABASE_URL: z.string().url(),
  DATABASE_URL_UNPOOLED: z.string().url().optional(),
  NEXT_PUBLIC_APP_URL: z.string().url(),
  BETTER_AUTH_SECRET: z.string().min(32),
  BETTER_AUTH_URL: z.string().url(),
  // Phase 2 — Stripe Connect (test mode for v1 demo per known_decisions).
  // Fail-fast at boot: if these are missing or malformed, the app refuses to
  // start rather than paper over missing webhooks / broken signature verification.
  STRIPE_SECRET_KEY: z.string().regex(/^sk_(test|live)_/, 'must be sk_test_… or sk_live_…'),
  STRIPE_WEBHOOK_SECRET: z.string().regex(/^whsec_/, 'must be whsec_…'),
});

export const env = Env.parse(process.env);
