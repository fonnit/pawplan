import PgBoss from 'pg-boss';
import { env } from '@/lib/env';

/**
 * pg-boss singleton.
 *
 * Phase 5 NOTIF-04 — webhook handlers must enqueue work without importing
 * any email/PDF modules, so we isolate all queue concerns here. pg-boss
 * creates its own `pgboss` schema on first `start()` and is fully
 * compatible with the rest of the Prisma-managed `public` schema.
 *
 * Lifecycle:
 *   - `getBoss()` returns a lazily-started singleton. Suitable for the
 *     webhook route (single start, reused across warm invocations).
 *   - `stopBoss()` is exposed for tests and graceful shutdown.
 *
 * On Vercel: the webhook route is the enqueue site only (lightweight,
 * no long-poll work). A dedicated worker is wired in Plan 05 Wave 2 at
 * `/api/jobs/worker` which Vercel Cron pokes once a minute to drain the
 * queue. In local dev any Node process that calls `registerWorkers()` on
 * the same boss instance will pick up jobs immediately.
 */

// Queue name constants — referenced by webhook (enqueue) + worker (register).
export const QUEUE_WELCOME_PACKET = 'welcome-packet';
export const QUEUE_OWNER_NEW_ENROLLMENT = 'notify-owner-new-enrollment';

export const QUEUE_NAMES = [
  QUEUE_WELCOME_PACKET,
  QUEUE_OWNER_NEW_ENROLLMENT,
] as const;

export type QueueName = (typeof QUEUE_NAMES)[number];

// Minimal payload shape — we intentionally pass only identifiers so the
// handler re-reads fresh context from the DB. This avoids stale-data
// replay bugs (PITFALL: enqueue with a stale tier name, handler sends it
// after the clinic edits the price).
export interface WelcomePacketPayload extends Record<string, unknown> {
  memberId: string;
  eventId: string; // Stripe event.id — used as singletonKey for dedupe
}

export interface OwnerEnrollmentPayload extends Record<string, unknown> {
  memberId: string;
  eventId: string;
}

type BossState = {
  boss: PgBoss | null;
  starting: Promise<PgBoss> | null;
};

const globalForBoss = globalThis as unknown as { __pgboss?: BossState };
const state: BossState = globalForBoss.__pgboss ?? { boss: null, starting: null };
if (process.env['NODE_ENV'] !== 'production') {
  globalForBoss.__pgboss = state;
}

/**
 * Return the started pg-boss instance, starting it on first call.
 *
 * The start promise is cached so concurrent callers (two webhook requests
 * arriving back-to-back on a cold serverless instance) share one startup
 * rather than racing `CREATE SCHEMA` statements.
 */
export async function getBoss(): Promise<PgBoss> {
  if (state.boss) return state.boss;
  if (state.starting) return state.starting;

  state.starting = (async () => {
    const boss = new PgBoss({
      connectionString: env.DATABASE_URL,
      // Keep maintenance light — welcome-packet volume is tiny.
      retentionDays: 7,
      archiveCompletedAfterSeconds: 60 * 60 * 24, // 1 day
    });
    boss.on('error', (err: Error) => {
      console.error('[pg-boss]', err.message);
    });
    await boss.start();

    // Create queues up-front. pg-boss v10 requires queues to exist before
    // `send()` accepts jobs for them. `createQueue` is idempotent.
    for (const name of QUEUE_NAMES) {
      await boss.createQueue(name);
    }

    state.boss = boss;
    state.starting = null;
    return boss;
  })();

  return state.starting;
}

/**
 * Stop the singleton. Test suites and graceful shutdown call this.
 */
export async function stopBoss(): Promise<void> {
  if (!state.boss) return;
  try {
    await state.boss.stop({ graceful: true, wait: true, timeout: 5_000 });
  } finally {
    state.boss = null;
    state.starting = null;
  }
}
