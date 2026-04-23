import { drainWorkers } from '@/lib/jobs/register-workers';

/**
 * Cron-driven one-shot worker endpoint.
 *
 * Vercel Cron configured to hit this path every minute (see
 * `vercel.json` when the app deploys). Each invocation fetches a small
 * batch of pending jobs from pg-boss, runs them inline, and completes
 * or fails each one. A second concurrent request is safe because
 * `boss.fetch` atomically transitions jobs to `active`.
 *
 * Security: in production we gate on the `Authorization: Bearer
 * ${CRON_SECRET}` header Vercel Cron injects. Locally, the secret is
 * optional so devs can `curl localhost:3000/api/jobs/worker` by hand.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request): Promise<Response> {
  const secret = process.env['CRON_SECRET'];
  if (secret) {
    const header = req.headers.get('authorization') ?? '';
    if (header !== `Bearer ${secret}`) {
      return new Response('unauthorized', { status: 401 });
    }
  }

  const result = await drainWorkers();
  return Response.json({ ok: true, ...result });
}

export async function POST(req: Request): Promise<Response> {
  // Allow POST for operator-triggered manual drains too (curl -X POST).
  return GET(req);
}
