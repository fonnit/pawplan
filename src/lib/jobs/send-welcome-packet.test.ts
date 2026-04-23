import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockFindUnique, mockUpdate, mockSendEmail, mockRenderPdf } = vi.hoisted(
  () => ({
    mockFindUnique: vi.fn(),
    mockUpdate: vi.fn(),
    mockSendEmail: vi.fn(),
    mockRenderPdf: vi.fn(),
  }),
);

vi.mock('@/lib/db', () => ({
  prisma: {
    member: { findUnique: mockFindUnique },
  },
}));

vi.mock('@/lib/tenant', () => ({
  withClinic: async (_id: string, fn: (tx: unknown) => Promise<unknown>) =>
    fn({ member: { update: mockUpdate } }),
}));

vi.mock('@/lib/email/sendgrid', () => ({
  sendEmail: (...args: unknown[]) => mockSendEmail(...args),
}));

vi.mock('@/lib/pdf/welcome-packet', () => ({
  renderWelcomePacketBuffer: (...args: unknown[]) => mockRenderPdf(...args),
}));

import { runSendWelcomePacket } from './send-welcome-packet';

const CLINIC_ID = '11111111-1111-1111-1111-111111111111';
const MEMBER_ID = '22222222-2222-2222-2222-222222222222';
const EVENT_ID = 'evt_wp_1';

function memberFixture(overrides: Record<string, unknown> = {}) {
  return {
    id: MEMBER_ID,
    clinicId: CLINIC_ID,
    petName: 'Rex',
    species: 'dog',
    ownerEmail: 'owner@example.com',
    enrolledAt: new Date('2026-04-23T12:00:00Z'),
    currentPeriodEnd: new Date('2026-05-23T12:00:00Z'),
    welcomePacketSentAt: null,
    clinic: {
      practiceName: 'Sage Vet',
      owner: { email: 'clinic@sage.example' },
    },
    planTier: {
      tierName: 'Puppy Plus',
      monthlyFeeCents: 4900,
      includedServices: ['Annual wellness exam', 'Vaccinations'],
    },
    ...overrides,
  };
}

describe('runSendWelcomePacket', () => {
  beforeEach(() => {
    mockFindUnique.mockReset();
    mockUpdate.mockReset();
    mockSendEmail.mockReset();
    mockRenderPdf.mockReset();
    mockRenderPdf.mockResolvedValue(Buffer.from('%PDF-1.4 mock'));
    mockSendEmail.mockResolvedValue({
      delivered: true,
      sandbox: true,
      messageId: 'msg_1',
    });
  });

  it('sends packet + stamps welcomePacketSentAt on first run', async () => {
    mockFindUnique.mockResolvedValueOnce(memberFixture());
    const out = await runSendWelcomePacket({ memberId: MEMBER_ID, eventId: EVENT_ID });
    expect(out.status).toBe('sent');
    expect(mockRenderPdf).toHaveBeenCalledTimes(1);
    expect(mockSendEmail).toHaveBeenCalledTimes(1);
    const emailArgs = mockSendEmail.mock.calls[0]![0];
    expect(emailArgs.to).toBe('owner@example.com');
    expect(emailArgs.attachments).toHaveLength(1);
    expect(emailArgs.attachments[0]).toMatchObject({
      filename: 'welcome-packet.pdf',
      type: 'application/pdf',
    });
    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: MEMBER_ID },
      data: { welcomePacketSentAt: expect.any(Date) },
    });
  });

  it('is idempotent: second run with welcomePacketSentAt set is a noop', async () => {
    mockFindUnique.mockResolvedValueOnce(
      memberFixture({ welcomePacketSentAt: new Date('2026-04-23T13:00:00Z') }),
    );
    const out = await runSendWelcomePacket({ memberId: MEMBER_ID, eventId: EVENT_ID });
    expect(out.status).toBe('skipped-already-sent');
    expect(mockRenderPdf).not.toHaveBeenCalled();
    expect(mockSendEmail).not.toHaveBeenCalled();
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('skips safely when member has been deleted', async () => {
    mockFindUnique.mockResolvedValueOnce(null);
    const out = await runSendWelcomePacket({ memberId: MEMBER_ID, eventId: EVENT_ID });
    expect(out.status).toBe('skipped-member-missing');
    expect(mockSendEmail).not.toHaveBeenCalled();
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('handles object-shaped includedServices JSON (label / name / displayName)', async () => {
    mockFindUnique.mockResolvedValueOnce(
      memberFixture({
        planTier: {
          tierName: 'Gold',
          monthlyFeeCents: 7900,
          includedServices: [
            { label: 'Wellness exam' },
            { name: 'Vaccinations' },
            { displayName: 'Dental cleaning' },
            'Unlimited nail trims',
            42, // non-string ignored
          ],
        },
      }),
    );
    await runSendWelcomePacket({ memberId: MEMBER_ID, eventId: EVENT_ID });
    const pdfInput = mockRenderPdf.mock.calls[0]![0];
    expect(pdfInput.plan.includedServices).toEqual([
      'Wellness exam',
      'Vaccinations',
      'Dental cleaning',
      'Unlimited nail trims',
    ]);
  });

  it('treats missing SendGrid API key as success-and-stamp (no infinite retry)', async () => {
    mockFindUnique.mockResolvedValueOnce(memberFixture());
    mockSendEmail.mockResolvedValueOnce({
      delivered: false,
      sandbox: true,
      messageId: null,
      skippedReason: 'SENDGRID_API_KEY not configured',
    });
    const out = await runSendWelcomePacket({ memberId: MEMBER_ID, eventId: EVENT_ID });
    expect(out.status).toBe('skipped-no-key');
    expect(mockUpdate).toHaveBeenCalledTimes(1); // still stamped
  });

  it('throws on generic SendGrid failure so pg-boss retries', async () => {
    mockFindUnique.mockResolvedValueOnce(memberFixture());
    mockSendEmail.mockResolvedValueOnce({
      delivered: false,
      sandbox: true,
      messageId: null,
      skippedReason: 'sendgrid 500',
    });
    await expect(
      runSendWelcomePacket({ memberId: MEMBER_ID, eventId: EVENT_ID }),
    ).rejects.toThrow(/did not accept/);
    expect(mockUpdate).not.toHaveBeenCalled();
  });
});
