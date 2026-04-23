import type Stripe from 'stripe';
import { prisma } from '@/lib/db';
import { withClinic } from '@/lib/tenant';

/**
 * Extract the subscription id from an Invoice. Stripe API 2026-03-25
 * nested it under `invoice.parent.subscription_details.subscription`;
 * prior versions had `invoice.subscription` at the top level. We read
 * from the new shape only — the app is pinned to 2026-03-25.dahlia.
 */
function extractSubscriptionId(invoice: Stripe.Invoice): string | null {
  const parent = invoice.parent;
  if (!parent) return null;
  const sub = parent.subscription_details?.subscription;
  if (!sub) return null;
  return typeof sub === 'string' ? sub : sub.id;
}

/**
 * `invoice.paid` handler.
 *
 * Refreshes Member.currentPeriodEnd and, if the member had been flagged
 * past_due on a prior failure, flips them back to active with paymentFailedAt
 * cleared. If no Member exists yet (checkout.session.completed hasn't fired —
 * Stripe's delivery ordering is best-effort), log and return.
 */
export async function handleInvoicePaid(event: Stripe.Event): Promise<void> {
  const invoice = event.data.object as Stripe.Invoice;
  const subscriptionId = extractSubscriptionId(invoice);
  if (!subscriptionId) return; // one-off invoice, not our subscription flow

  // BYPASSRLS lookup — the webhook runs without clinic context. We only read
  // the minimum fields needed to scope subsequent writes.
  const member = await prisma.member.findUnique({
    where: { stripeSubscriptionId: subscriptionId },
    select: { id: true, clinicId: true },
  });
  if (!member) {
    console.info(
      '[webhook] invoice.paid for unknown subscription (checkout race)',
      subscriptionId,
    );
    return;
  }

  // invoice.lines.data[0].period.end is the end of the billing period the
  // invoice paid — mirrors subscription.items[].current_period_end after
  // renewal.
  const periodEndSec = invoice.lines.data[0]?.period?.end;
  const currentPeriodEnd = periodEndSec ? new Date(periodEndSec * 1000) : undefined;

  await withClinic(member.clinicId, async (tx) => {
    await tx.member.update({
      where: { id: member.id },
      data: {
        status: 'active',
        paymentFailedAt: null,
        ...(currentPeriodEnd ? { currentPeriodEnd } : {}),
      },
    });
  });
}
