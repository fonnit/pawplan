/**
 * Public queue barrel — the ONLY module the webhook route imports.
 *
 * Invariant: importing `@/lib/queue` must NOT transitively pull in
 * `@sendgrid/mail` or `@react-pdf/renderer`. The webhook hot-path
 * depends on that bundle discipline (NOTIF-04). Handler modules live
 * under `@/lib/jobs/*` and are only imported by the worker entry point.
 */
export {
  getBoss,
  stopBoss,
  QUEUE_WELCOME_PACKET,
  QUEUE_OWNER_NEW_ENROLLMENT,
  QUEUE_NAMES,
  type QueueName,
  type WelcomePacketPayload,
  type OwnerEnrollmentPayload,
} from './boss';
export { enqueueNewEnrollmentJobs } from './enqueue';
