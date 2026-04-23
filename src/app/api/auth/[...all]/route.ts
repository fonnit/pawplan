import { auth } from '@/lib/auth';
import { toNextJsHandler } from 'better-auth/next-js';

/**
 * Better Auth catch-all route — handles /api/auth/sign-up/email,
 * /api/auth/sign-in/email, /api/auth/sign-out, /api/auth/session, etc.
 */
export const { GET, POST } = toNextJsHandler(auth);
