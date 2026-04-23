import type Stripe from 'stripe';
import { prisma } from '@/lib/db';
import { withClinic } from '@/lib/tenant';

/**
 * PAY-05 — Smart Retries are OFF per locked decision. This handler flags the
 * member in the dashboard so the clinic can reach out manually. ZERO outbound
 * email, ZERO background-job enqueue, ZERO notification side-effect.
 *
 * The dedicated test suite grep-asserts this file contains no email or
 * job-enqueue imports. Adding any such import here will break CI — intentional.
 */

function extractSubscriptionId(invoice: Stripe.Invoice): string | null {
  // Stripe API 2026-03-25 nested the reference under parent.subscription_details.
  const parent = invoice.parent;
  if (!parent) return null;
  const sub = parent.subscription_details?.subscription;
  if (!sub) return null;
  return typeof sub === 'string' ? sub : sub.id;
}

export async function handleInvoicePaymentFailed(
  event: Stripe.Event,
): Promise<void> {
  const invoice = event.data.object as Stripe.Invoice;
  const subscriptionId = extractSubscriptionId(invoice);
  if (!subscriptionId) return;

  const member = await prisma.member.findUnique({
    where: { stripeSubscriptionId: subscriptionId },
    select: { id: true, clinicId: true, paymentFailedAt: true },
  });
  if (!member) {
    console.info(
      '[webhook] invoice.payment_failed for unknown subscription (checkout race)',
      subscriptionId,
    );
    return;
  }

  await withClinic(member.clinicId, async (tx) => {
    await tx.member.update({
      where: { id: member.id },
      data: {
        status: 'past_due',
        // Preserve the first-failure timestamp on replay. StripeEvent
        // idempotency at the route level already prevents this handler
        // from running twice for the same event.id, but a distinct new
        // failure event will (correctly) overwrite paymentFailedAt.
        paymentFailedAt: member.paymentFailedAt ?? new Date(event.created * 1000),
      },
    });
  });
}
