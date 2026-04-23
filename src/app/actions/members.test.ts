import { describe, it, expect, vi, beforeEach } from 'vitest';

const CLINIC_ID = '11111111-1111-1111-1111-111111111111';
const USER_ID = 'user_123';

const {
  findMany,
  findUniqueClinic,
  findUniqueMember,
  memberUpdate,
  cancelSubFn,
  getSession,
  revalidatePathMock,
} = vi.hoisted(() => ({
  findMany: vi.fn(),
  findUniqueClinic: vi.fn(),
  findUniqueMember: vi.fn(),
  memberUpdate: vi.fn(),
  cancelSubFn: vi.fn(),
  getSession: vi.fn(),
  revalidatePathMock: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  prisma: {
    clinic: { findUnique: findUniqueClinic },
  },
}));

vi.mock('@/lib/tenant', () => ({
  withClinic: async (_id: string, fn: (tx: unknown) => Promise<unknown>) =>
    fn({
      member: {
        findMany,
        findUnique: findUniqueMember,
        update: memberUpdate,
      },
    }),
}));

vi.mock('@/lib/auth', () => ({
  auth: { api: { getSession } },
}));

vi.mock('next/headers', () => ({
  headers: vi.fn(async () => new Headers()),
}));

vi.mock('next/cache', () => ({
  revalidatePath: revalidatePathMock,
}));

vi.mock('@/lib/stripe/cancel-subscription', () => ({
  cancelSubscriptionAtPeriodEnd: cancelSubFn,
}));

import { listMembers, cancelMember } from './members';

beforeEach(() => {
  findMany.mockReset();
  findUniqueClinic.mockReset();
  findUniqueMember.mockReset();
  memberUpdate.mockReset();
  cancelSubFn.mockReset();
  getSession.mockReset();
  revalidatePathMock.mockReset();

  // Default happy-path auth.
  getSession.mockResolvedValue({ user: { id: USER_ID } });
  findUniqueClinic.mockResolvedValue({ id: CLINIC_ID });
});

// ─── listMembers ───────────────────────────────────────────────────────────

describe('listMembers', () => {
  it('returns rows with past_due first (via paymentFailedAt DESC)', async () => {
    findMany.mockResolvedValueOnce([
      {
        id: 'm1',
        petName: 'Rex',
        species: 'dog',
        ownerEmail: 'a@x.com',
        status: 'past_due',
        enrolledAt: new Date('2026-04-10'),
        currentPeriodEnd: new Date('2026-05-10'),
        paymentFailedAt: new Date('2026-04-22'),
        canceledAt: null,
        planTier: { tierName: 'Preventive Plus' },
      },
      {
        id: 'm2',
        petName: 'Whiskers',
        species: 'cat',
        ownerEmail: 'b@x.com',
        status: 'active',
        enrolledAt: new Date('2026-04-20'),
        currentPeriodEnd: new Date('2026-05-20'),
        paymentFailedAt: null,
        canceledAt: null,
        planTier: { tierName: 'Preventive' },
      },
    ]);

    const rows = await listMembers();
    expect(rows).toHaveLength(2);
    expect(rows[0]!.petName).toBe('Rex');
    expect(rows[0]!.tierName).toBe('Preventive Plus');
    expect(rows[1]!.petName).toBe('Whiskers');

    // Verify sort: paymentFailedAt desc (nulls-last), then enrolledAt desc.
    const call = findMany.mock.calls[0]![0]!;
    expect(call.orderBy).toEqual([
      { paymentFailedAt: { sort: 'desc', nulls: 'last' } },
      { enrolledAt: 'desc' },
    ]);
  });

  it('output rows do NOT include stripeCustomerId / stripeSubscriptionId (T-04-04-02)', async () => {
    findMany.mockResolvedValueOnce([
      {
        id: 'm1',
        petName: 'Rex',
        species: 'dog',
        ownerEmail: 'a@x.com',
        status: 'active',
        enrolledAt: new Date(),
        currentPeriodEnd: null,
        paymentFailedAt: null,
        canceledAt: null,
        planTier: { tierName: 'Preventive' },
      },
    ]);

    const rows = await listMembers();
    expect(rows[0]!).not.toHaveProperty('stripeCustomerId');
    expect(rows[0]!).not.toHaveProperty('stripeSubscriptionId');
    // Verify the select clause also omits those fields (compile-time and
    // belt-and-braces).
    const call = findMany.mock.calls[0]![0]!;
    expect(call.select.stripeCustomerId).toBeUndefined();
    expect(call.select.stripeSubscriptionId).toBeUndefined();
  });

  it('throws UNAUTHENTICATED when no session', async () => {
    getSession.mockResolvedValueOnce(null);
    await expect(listMembers()).rejects.toThrow(/UNAUTHENTICATED/);
  });
});

// ─── cancelMember ──────────────────────────────────────────────────────────

describe('cancelMember', () => {
  const MEMBER_ID = 'mem_1';
  const SUB_ID = 'sub_x';

  it('happy path: calls cancel-helper with subId + writes optimistic canceledAt + revalidates', async () => {
    findUniqueMember.mockResolvedValueOnce({
      id: MEMBER_ID,
      stripeSubscriptionId: SUB_ID,
      canceledAt: null,
      status: 'active',
    });
    cancelSubFn.mockResolvedValueOnce({ id: SUB_ID });

    const result = await cancelMember(MEMBER_ID);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.canceledAt).toBeInstanceOf(Date);
    }
    expect(cancelSubFn).toHaveBeenCalledWith(SUB_ID);
    expect(memberUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: MEMBER_ID },
        data: expect.objectContaining({ canceledAt: expect.any(Date) }),
      }),
    );
    expect(revalidatePathMock).toHaveBeenCalledWith('/dashboard/members');
  });

  it('already-canceled: short-circuits with code already_canceled, no Stripe call', async () => {
    findUniqueMember.mockResolvedValueOnce({
      id: MEMBER_ID,
      stripeSubscriptionId: SUB_ID,
      canceledAt: new Date('2026-04-22'),
      status: 'active',
    });
    const result = await cancelMember(MEMBER_ID);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('already_canceled');
    expect(cancelSubFn).not.toHaveBeenCalled();
    expect(memberUpdate).not.toHaveBeenCalled();
  });

  it('Stripe failure: returns stripe_error code, canceledAt NOT written', async () => {
    findUniqueMember.mockResolvedValueOnce({
      id: MEMBER_ID,
      stripeSubscriptionId: SUB_ID,
      canceledAt: null,
      status: 'active',
    });
    cancelSubFn.mockRejectedValueOnce(new Error('Stripe boom'));
    const result = await cancelMember(MEMBER_ID);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('stripe_error');
    expect(memberUpdate).not.toHaveBeenCalled();
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it('not-found (cross-tenant or bad id): returns not_found, no Stripe call', async () => {
    findUniqueMember.mockResolvedValueOnce(null);
    const result = await cancelMember(MEMBER_ID);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('not_found');
    expect(cancelSubFn).not.toHaveBeenCalled();
    expect(memberUpdate).not.toHaveBeenCalled();
  });
});
