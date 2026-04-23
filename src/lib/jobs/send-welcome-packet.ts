import { prisma } from '@/lib/db';
import { withClinic } from '@/lib/tenant';
import { sendEmail } from '@/lib/email/sendgrid';
import { renderWelcomePacketBuffer } from '@/lib/pdf/welcome-packet';
import type { WelcomePacketPayload } from '@/lib/queue/boss';

/**
 * `welcome-packet` job handler — NOTIF-01 + NOTIF-02.
 *
 * Flow:
 *  1. Re-read the Member + Plan/Tier + Clinic fresh from Postgres. The
 *     enqueued payload is just {memberId, eventId}; we do not trust any
 *     other enqueued data to avoid stale-attribute leaks into the PDF.
 *  2. If Member is gone (deleted between enqueue and run) → skip success.
 *  3. If Member.welcomePacketSentAt is set → idempotent skip success.
 *  4. Render the PDF, base64-encode, send via SendGrid (sandbox forced on).
 *  5. Stamp welcomePacketSentAt inside a withClinic tx so RLS is honored.
 *
 * The handler never throws on a skip — only on a real SendGrid/render
 * failure. pg-boss will retry on throw.
 */

export interface WelcomePacketJobResult {
  status: 'sent' | 'skipped-already-sent' | 'skipped-member-missing' | 'skipped-no-key';
  memberId: string;
}

export async function runSendWelcomePacket(
  payload: WelcomePacketPayload,
): Promise<WelcomePacketJobResult> {
  const member = await prisma.member.findUnique({
    where: { id: payload.memberId },
    select: {
      id: true,
      clinicId: true,
      petName: true,
      species: true,
      ownerEmail: true,
      enrolledAt: true,
      currentPeriodEnd: true,
      welcomePacketSentAt: true,
      clinic: {
        select: {
          practiceName: true,
          owner: { select: { email: true } },
        },
      },
      planTier: {
        select: {
          tierName: true,
          monthlyFeeCents: true,
          includedServices: true,
        },
      },
    },
  });

  if (!member) {
    return { status: 'skipped-member-missing', memberId: payload.memberId };
  }
  if (member.welcomePacketSentAt) {
    return { status: 'skipped-already-sent', memberId: member.id };
  }

  const services = extractServiceNames(member.planTier.includedServices);

  const pdf = await renderWelcomePacketBuffer({
    clinic: {
      practiceName: member.clinic.practiceName,
      contactEmail: member.clinic.owner.email,
    },
    plan: {
      tierName: member.planTier.tierName,
      monthlyFeeCents: member.planTier.monthlyFeeCents,
      includedServices: services,
    },
    member: {
      petName: member.petName,
      species: member.species,
      ownerEmail: member.ownerEmail,
      enrolledAt: member.enrolledAt,
      nextBillingAt: member.currentPeriodEnd,
    },
  });

  const result = await sendEmail({
    to: member.ownerEmail,
    subject: `Welcome to ${member.clinic.practiceName}, ${member.petName}!`,
    html: buildWelcomeEmailHtml({
      practiceName: member.clinic.practiceName,
      petName: member.petName,
      tierName: member.planTier.tierName,
    }),
    text: buildWelcomeEmailText({
      practiceName: member.clinic.practiceName,
      petName: member.petName,
      tierName: member.planTier.tierName,
    }),
    replyTo: member.clinic.owner.email ?? undefined,
    attachments: [
      {
        filename: 'welcome-packet.pdf',
        content: pdf.toString('base64'),
        type: 'application/pdf',
      },
    ],
  });

  if (!result.delivered && result.skippedReason?.includes('SENDGRID_API_KEY')) {
    // No key configured — treat as success-equivalent so we don't retry
    // forever. Stamp anyway so we don't re-attempt every retry.
    await stampSent(member.id, member.clinicId);
    return { status: 'skipped-no-key', memberId: member.id };
  }
  if (!result.delivered) {
    throw new Error(
      `SendGrid did not accept welcome packet (reason=${result.skippedReason ?? 'unknown'})`,
    );
  }

  await stampSent(member.id, member.clinicId);
  return { status: 'sent', memberId: member.id };
}

async function stampSent(memberId: string, clinicId: string): Promise<void> {
  await withClinic(clinicId, async (tx) => {
    await tx.member.update({
      where: { id: memberId },
      data: { welcomePacketSentAt: new Date() },
    });
  });
}

/**
 * Tier.includedServices is JSON. Historical shapes we've seen in Phase 3:
 *   - string[]                                    → use as-is
 *   - Array<{ label: string; … }>                 → read .label
 *   - Array<{ name: string; … }>                  → read .name
 *   - Array<{ serviceId: string; displayName: string; … }> → read .displayName
 * We normalize defensively so the PDF renders something human-readable in
 * all current and near-future variants.
 */
function extractServiceNames(services: unknown): string[] {
  if (!Array.isArray(services)) return [];
  return services
    .map((svc) => {
      if (typeof svc === 'string') return svc;
      if (svc && typeof svc === 'object') {
        const rec = svc as Record<string, unknown>;
        if (typeof rec.label === 'string') return rec.label;
        if (typeof rec.name === 'string') return rec.name;
        if (typeof rec.displayName === 'string') return rec.displayName;
        if (typeof rec.serviceName === 'string') return rec.serviceName;
      }
      return null;
    })
    .filter((v): v is string => typeof v === 'string' && v.length > 0);
}

function buildWelcomeEmailHtml(args: {
  practiceName: string;
  petName: string;
  tierName: string;
}): string {
  return `
    <div style="font-family: -apple-system, 'Segoe UI', sans-serif; color: #111827; line-height: 1.55;">
      <h1 style="margin: 0 0 12px; color: #4b6049;">Welcome, ${escapeHtml(args.petName)}!</h1>
      <p>Thank you for enrolling with <strong>${escapeHtml(args.practiceName)}</strong>.</p>
      <p>Your PawPlan membership (<strong>${escapeHtml(args.tierName)}</strong>) is now active. Your
      welcome packet is attached as a PDF — it lists everything included in your plan, your next
      billing date, and how to reach your clinic.</p>
      <p>Stripe will email a separate receipt for every monthly charge.</p>
      <p style="color:#6b7280; font-size: 12px; margin-top: 32px;">If you have questions about
      your plan, reply to this email and your clinic will be in touch.</p>
    </div>
  `.trim();
}

function buildWelcomeEmailText(args: {
  practiceName: string;
  petName: string;
  tierName: string;
}): string {
  return [
    `Welcome, ${args.petName}!`,
    '',
    `Thank you for enrolling with ${args.practiceName}.`,
    '',
    `Your PawPlan membership (${args.tierName}) is now active. Your welcome packet is attached as a PDF.`,
    '',
    'Stripe will email a separate receipt for every monthly charge.',
    '',
    'If you have questions about your plan, reply to this email.',
  ].join('\n');
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
