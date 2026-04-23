import { prisma } from '@/lib/db';
import { withClinic } from '@/lib/tenant';
import { sendEmail } from '@/lib/email/sendgrid';
import type { OwnerEnrollmentPayload } from '@/lib/queue/boss';

/**
 * `notify-owner-new-enrollment` job handler — NOTIF-03.
 *
 * Plain-text email to the clinic owner when a new member enrolls. Short
 * format: pet name, tier, owner email, enrolled timestamp. No PDF.
 *
 * Idempotency: Member.ownerNotifiedAt gates the send. Single handler
 * responsibility keeps the retry blast-radius small — a SendGrid 5xx on
 * THIS email cannot hold back the pet-owner welcome packet (separate job,
 * separate singleton key).
 */

export interface OwnerEnrollmentJobResult {
  status: 'sent' | 'skipped-already-sent' | 'skipped-member-missing' | 'skipped-no-owner-email' | 'skipped-no-key';
  memberId: string;
}

export async function runNotifyOwnerNewEnrollment(
  payload: OwnerEnrollmentPayload,
): Promise<OwnerEnrollmentJobResult> {
  const member = await prisma.member.findUnique({
    where: { id: payload.memberId },
    select: {
      id: true,
      clinicId: true,
      petName: true,
      species: true,
      ownerEmail: true,
      enrolledAt: true,
      ownerNotifiedAt: true,
      clinic: {
        select: {
          practiceName: true,
          owner: { select: { email: true, name: true } },
        },
      },
      planTier: { select: { tierName: true, monthlyFeeCents: true } },
    },
  });

  if (!member) {
    return { status: 'skipped-member-missing', memberId: payload.memberId };
  }
  if (member.ownerNotifiedAt) {
    return { status: 'skipped-already-sent', memberId: member.id };
  }
  const ownerEmail = member.clinic.owner.email;
  if (!ownerEmail) {
    // Clinic owner somehow has no email on record — nothing to do.
    // Stamp so we don't retry forever.
    await stampNotified(member.id, member.clinicId);
    return { status: 'skipped-no-owner-email', memberId: member.id };
  }

  const priceUsd = (member.planTier.monthlyFeeCents / 100).toFixed(2);
  const body = [
    `New PawPlan enrollment at ${member.clinic.practiceName}.`,
    '',
    `Pet:      ${member.petName} (${member.species})`,
    `Plan:     ${member.planTier.tierName} — $${priceUsd}/mo`,
    `Owner:    ${member.ownerEmail}`,
    `Enrolled: ${member.enrolledAt.toISOString()}`,
    '',
    'View the member in your dashboard to confirm and reach out with any onboarding details.',
  ].join('\n');

  const result = await sendEmail({
    to: ownerEmail,
    subject: `New PawPlan enrollment: ${member.petName} (${member.planTier.tierName})`,
    text: body,
  });

  if (!result.delivered && result.skippedReason?.includes('SENDGRID_API_KEY')) {
    await stampNotified(member.id, member.clinicId);
    return { status: 'skipped-no-key', memberId: member.id };
  }
  if (!result.delivered) {
    throw new Error(
      `SendGrid did not accept owner-enrollment email (reason=${result.skippedReason ?? 'unknown'})`,
    );
  }

  await stampNotified(member.id, member.clinicId);
  return { status: 'sent', memberId: member.id };
}

async function stampNotified(memberId: string, clinicId: string): Promise<void> {
  await withClinic(clinicId, async (tx) => {
    await tx.member.update({
      where: { id: memberId },
      data: { ownerNotifiedAt: new Date() },
    });
  });
}
