import Stripe from 'stripe';
import { env } from '@/lib/env';

/**
 * Pinned Stripe API version for the entire app.
 *
 * Keep in sync with the package.json pin on `stripe@22.0.2`. Bumping this
 * literal without also bumping the SDK version is a guaranteed source of
 * silent bugs (SDK types drift from the wire format). Do both together.
 *
 * Reference: https://docs.stripe.com/api/versioning
 */
export const STRIPE_API_VERSION = '2026-03-25.dahlia' as const;

/**
 * Singleton Stripe client.
 *
 * v22 is an ES6 class breaking change — `new Stripe(...)` is mandatory and
 * callbacks are gone. We export a single module-scoped instance to share
 * connection pooling across server routes.
 *
 * For Connect calls acting on a connected account, pass
 * `{ stripeAccount: 'acct_…' }` as the second arg to the method call —
 * do NOT create a second Stripe client per account.
 */
export const stripe = new Stripe(env.STRIPE_SECRET_KEY, {
  apiVersion: STRIPE_API_VERSION,
  typescript: true,
  appInfo: {
    name: 'pawplan',
    version: '0.1.0',
  },
});
