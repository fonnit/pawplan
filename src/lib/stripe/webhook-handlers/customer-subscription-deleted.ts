import type Stripe from 'stripe';
import { prisma } from '@/lib/db';
import { withClinic } from '@/lib/tenant';

/**
 * `customer.subscription.deleted` handler.
 *
 * Flips Member.status to canceled at period end + sets Member.canceledAt.
 * If the owner-initiated cancel server action (plan 04-04) already wrote
 * an earlier canceledAt optimistically, we preserve that timestamp rather
 * than overwrite with the later Stripe-side cancellation time — the
 * "canceled-on" date the dashboard displays should reflect when the owner
 * ASKED to cancel, not when the billing period mechanically ended.
 */
export async function handleSubscriptionDeleted(
  event: Stripe.Event,
): Promise<void> {
  const subscription = event.data.object as Stripe.Subscription;

  const member = await prisma.member.findUnique({
    where: { stripeSubscriptionId: subscription.id },
    select: { id: true, clinicId: true, canceledAt: true },
  });
  if (!member) {
    console.info(
      '[webhook] subscription.deleted for unknown sub',
      subscription.id,
    );
    return;
  }

  const webhookCanceledAt = subscription.canceled_at
    ? new Date(subscription.canceled_at * 1000)
    : new Date(event.created * 1000);

  // Preserve the optimistic owner-click timestamp if it's earlier (DASH-05).
  const canceledAt =
    member.canceledAt && member.canceledAt < webhookCanceledAt
      ? member.canceledAt
      : webhookCanceledAt;

  await withClinic(member.clinicId, async (tx) => {
    await tx.member.update({
      where: { id: member.id },
      data: {
        status: 'canceled',
        canceledAt,
      },
    });
  });
}
