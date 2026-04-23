import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockFindUnique, mockUpdate, mockSendEmail } = vi.hoisted(() => ({
  mockFindUnique: vi.fn(),
  mockUpdate: vi.fn(),
  mockSendEmail: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  prisma: { member: { findUnique: mockFindUnique } },
}));

vi.mock('@/lib/tenant', () => ({
  withClinic: async (_id: string, fn: (tx: unknown) => Promise<unknown>) =>
    fn({ member: { update: mockUpdate } }),
}));

vi.mock('@/lib/email/sendgrid', () => ({
  sendEmail: (...args: unknown[]) => mockSendEmail(...args),
}));

import { runNotifyOwnerNewEnrollment } from './notify-owner-new-enrollment';

const CLINIC_ID = '11111111-1111-1111-1111-111111111111';
const MEMBER_ID = '22222222-2222-2222-2222-222222222222';

function memberFixture(overrides: Record<string, unknown> = {}) {
  return {
    id: MEMBER_ID,
    clinicId: CLINIC_ID,
    petName: 'Rex',
    species: 'dog',
    ownerEmail: 'owner@example.com',
    enrolledAt: new Date('2026-04-23T12:00:00Z'),
    ownerNotifiedAt: null,
    clinic: {
      practiceName: 'Sage Vet',
      owner: { email: 'clinic@sage.example', name: 'Dr. Sage' },
    },
    planTier: { tierName: 'Puppy Plus', monthlyFeeCents: 4900 },
    ...overrides,
  };
}

describe('runNotifyOwnerNewEnrollment', () => {
  beforeEach(() => {
    mockFindUnique.mockReset();
    mockUpdate.mockReset();
    mockSendEmail.mockReset();
    mockSendEmail.mockResolvedValue({
      delivered: true,
      sandbox: true,
      messageId: 'msg_owner_1',
    });
  });

  it('sends plain-text email to clinic owner and stamps ownerNotifiedAt', async () => {
    mockFindUnique.mockResolvedValueOnce(memberFixture());
    const out = await runNotifyOwnerNewEnrollment({
      memberId: MEMBER_ID,
      eventId: 'evt_oe_1',
    });
    expect(out.status).toBe('sent');
    const args = mockSendEmail.mock.calls[0]![0];
    expect(args.to).toBe('clinic@sage.example');
    expect(args.subject).toMatch(/Rex/);
    expect(typeof args.text).toBe('string');
    expect(args.text).toMatch(/Rex \(dog\)/);
    expect(args.text).toMatch(/Puppy Plus/);
    expect(args.text).toMatch(/\$49\.00\/mo/);
    // Plain-text email — no HTML body, no attachments.
    expect(args.html).toBeUndefined();
    expect(args.attachments).toBeUndefined();
    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: MEMBER_ID },
      data: { ownerNotifiedAt: expect.any(Date) },
    });
  });

  it('is idempotent: skips when ownerNotifiedAt already stamped', async () => {
    mockFindUnique.mockResolvedValueOnce(
      memberFixture({ ownerNotifiedAt: new Date() }),
    );
    const out = await runNotifyOwnerNewEnrollment({
      memberId: MEMBER_ID,
      eventId: 'evt_oe_2',
    });
    expect(out.status).toBe('skipped-already-sent');
    expect(mockSendEmail).not.toHaveBeenCalled();
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('skips when member missing', async () => {
    mockFindUnique.mockResolvedValueOnce(null);
    const out = await runNotifyOwnerNewEnrollment({
      memberId: MEMBER_ID,
      eventId: 'evt_oe_3',
    });
    expect(out.status).toBe('skipped-member-missing');
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it('skips + stamps when clinic owner has no email (do not retry forever)', async () => {
    mockFindUnique.mockResolvedValueOnce(
      memberFixture({
        clinic: { practiceName: 'Sage Vet', owner: { email: null, name: null } },
      }),
    );
    const out = await runNotifyOwnerNewEnrollment({
      memberId: MEMBER_ID,
      eventId: 'evt_oe_4',
    });
    expect(out.status).toBe('skipped-no-owner-email');
    expect(mockSendEmail).not.toHaveBeenCalled();
    expect(mockUpdate).toHaveBeenCalledTimes(1);
  });

  it('throws on generic SendGrid failure (retry)', async () => {
    mockFindUnique.mockResolvedValueOnce(memberFixture());
    mockSendEmail.mockResolvedValueOnce({
      delivered: false,
      sandbox: true,
      messageId: null,
      skippedReason: 'sendgrid 502',
    });
    await expect(
      runNotifyOwnerNewEnrollment({ memberId: MEMBER_ID, eventId: 'evt_oe_5' }),
    ).rejects.toThrow(/did not accept/);
    expect(mockUpdate).not.toHaveBeenCalled();
  });
});
