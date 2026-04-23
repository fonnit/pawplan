import {
  getBoss,
  QUEUE_WELCOME_PACKET,
  QUEUE_OWNER_NEW_ENROLLMENT,
  type WelcomePacketPayload,
  type OwnerEnrollmentPayload,
} from './boss';

/**
 * Enqueue the two notification jobs for a new-enrollment event.
 *
 * Called from the `checkout.session.completed` webhook dispatcher AFTER
 * the Member row has been upserted. `singletonKey` is the Stripe
 * event.id so a delivery retry cannot produce duplicate jobs — pg-boss
 * will reject the second send() with a null job id.
 *
 * Why two separate jobs instead of one: pet-owner email and clinic-owner
 * email have different failure modes. A SendGrid transient 5xx on the
 * owner notification must not block the welcome packet retry, and the
 * opposite. Splitting them lets pg-boss retry each independently.
 *
 * Payloads are deliberately minimal (memberId + eventId). The handlers
 * re-resolve full context from Postgres so stale enqueued data cannot
 * leak into the rendered PDF or email body.
 */
export async function enqueueNewEnrollmentJobs(args: {
  memberId: string;
  eventId: string;
}): Promise<{ welcomePacketJobId: string | null; ownerEnrollmentJobId: string | null }> {
  const boss = await getBoss();
  const welcomePacketPayload: WelcomePacketPayload = {
    memberId: args.memberId,
    eventId: args.eventId,
  };
  const ownerEnrollmentPayload: OwnerEnrollmentPayload = {
    memberId: args.memberId,
    eventId: args.eventId,
  };

  const [welcomePacketJobId, ownerEnrollmentJobId] = await Promise.all([
    boss.send(QUEUE_WELCOME_PACKET, welcomePacketPayload, {
      singletonKey: `${QUEUE_WELCOME_PACKET}:${args.eventId}`,
      retryLimit: 5,
      retryBackoff: true,
      retryDelay: 30,
      expireInHours: 1,
    }),
    boss.send(QUEUE_OWNER_NEW_ENROLLMENT, ownerEnrollmentPayload, {
      singletonKey: `${QUEUE_OWNER_NEW_ENROLLMENT}:${args.eventId}`,
      retryLimit: 5,
      retryBackoff: true,
      retryDelay: 30,
      expireInHours: 1,
    }),
  ]);

  return { welcomePacketJobId, ownerEnrollmentJobId };
}
