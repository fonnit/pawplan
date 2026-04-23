import {
  getBoss,
  QUEUE_WELCOME_PACKET,
  QUEUE_OWNER_NEW_ENROLLMENT,
  type WelcomePacketPayload,
  type OwnerEnrollmentPayload,
} from '@/lib/queue/boss';
import { runSendWelcomePacket } from './send-welcome-packet';
import { runNotifyOwnerNewEnrollment } from './notify-owner-new-enrollment';

/**
 * Register pg-boss workers with their handlers.
 *
 * pg-boss v10 hands jobs to the handler as an array (batch-capable). We
 * process one by one and return the results so pg-boss records completion
 * per-job. Throwing from the handler triggers retry.
 *
 * Called by:
 *   - `/api/jobs/worker` route (Vercel Cron pokes it each minute in prod)
 *   - Local dev long-running worker process (`pnpm tsx scripts/worker.ts`)
 *   - Tests, for deterministic drain
 */
export async function registerWorkers(): Promise<void> {
  const boss = await getBoss();

  await boss.work<WelcomePacketPayload>(
    QUEUE_WELCOME_PACKET,
    { batchSize: 1 },
    async (jobs) => {
      const results = [];
      for (const job of jobs) {
        results.push(await runSendWelcomePacket(job.data));
      }
      return results;
    },
  );

  await boss.work<OwnerEnrollmentPayload>(
    QUEUE_OWNER_NEW_ENROLLMENT,
    { batchSize: 1 },
    async (jobs) => {
      const results = [];
      for (const job of jobs) {
        results.push(await runNotifyOwnerNewEnrollment(job.data));
      }
      return results;
    },
  );
}

/**
 * One-shot drain, intended for the Vercel Cron-driven `/api/jobs/worker`
 * route. Fetches up to `limit` pending jobs per queue, runs them inline,
 * and completes/fails them. Unlike `work()`, does not leave a subscription
 * behind — safe for serverless invocations.
 */
export async function drainWorkers(limit = 25): Promise<{
  welcomePacket: number;
  ownerEnrollment: number;
}> {
  const boss = await getBoss();

  let wpCount = 0;
  const wpJobs = await boss.fetch<WelcomePacketPayload>(QUEUE_WELCOME_PACKET, {
    batchSize: limit,
  });
  for (const job of wpJobs) {
    try {
      const out = await runSendWelcomePacket(job.data);
      await boss.complete(QUEUE_WELCOME_PACKET, job.id, out as unknown as object);
      wpCount++;
    } catch (err) {
      await boss.fail(QUEUE_WELCOME_PACKET, job.id, {
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  let oeCount = 0;
  const oeJobs = await boss.fetch<OwnerEnrollmentPayload>(
    QUEUE_OWNER_NEW_ENROLLMENT,
    { batchSize: limit },
  );
  for (const job of oeJobs) {
    try {
      const out = await runNotifyOwnerNewEnrollment(job.data);
      await boss.complete(
        QUEUE_OWNER_NEW_ENROLLMENT,
        job.id,
        out as unknown as object,
      );
      oeCount++;
    } catch (err) {
      await boss.fail(QUEUE_OWNER_NEW_ENROLLMENT, job.id, {
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return { welcomePacket: wpCount, ownerEnrollment: oeCount };
}
