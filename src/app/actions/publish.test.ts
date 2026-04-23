/**
 * publishPlan integration tests (Phase 3 PUB-03 / MATH-03).
 *
 * Stripe SDK + Better Auth + next/cache + next/headers are mocked (hoisted).
 * Prisma hits the real local Postgres via pawplan_app role so RLS is honest.
 * Fixtures use the superuser connection to seed Clinic / User / Plan rows
 * (strict-mode RLS on Plan blocks direct INSERTs from pawplan_app). Same
 * pattern as src/lib/tenant.test.ts.
 */
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import type Stripe from 'stripe';

// --- Hoisted mocks -----------------------------------------------------------
const stripeMocks = vi.hoisted(() => ({
  productsCreate: vi.fn(),
  pricesCreate: vi.fn(),
}));

vi.mock('@/lib/stripe/client', () => ({
  stripe: {
    products: { create: stripeMocks.productsCreate },
    prices: { create: stripeMocks.pricesCreate },
  },
  STRIPE_API_VERSION: '2026-03-25.dahlia',
}));

const authMocks = vi.hoisted(() => ({
  getSession: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({
  auth: { api: { getSession: authMocks.getSession } },
}));

vi.mock('next/headers', () => ({
  headers: vi.fn(async () => new Headers()),
}));

const cacheMocks = vi.hoisted(() => ({
  revalidateTag: vi.fn(),
}));

vi.mock('next/cache', () => ({
  revalidateTag: cacheMocks.revalidateTag,
}));

// After mocks — real imports:
import { prisma } from '@/lib/db';
import { withClinic } from '@/lib/tenant';
import { publishPlan, renameTiers, updatePlanPrices } from './publish';

// --- Fixtures ----------------------------------------------------------------

const superuserUrl =
  process.env['DATABASE_URL_TEST_SUPERUSER'] ?? process.env['DATABASE_URL_UNPOOLED'];
if (!superuserUrl) {
  throw new Error(
    'publishPlan test requires DATABASE_URL_TEST_SUPERUSER or DATABASE_URL_UNPOOLED.',
  );
}
const superuserPool = new Pool({ connectionString: superuserUrl });

const VALID_BUILDER_INPUTS = {
  speciesMix: { dog: 70, cat: 30 },
  annualExamPriceUsd: 75,
  dentalCleaningPriceUsd: 350,
  coreVaccinePriceUsd: 45,
  vaccineCadence: 'annual' as const,
  heartwormPreventionAnnualUsd: 180,
  fleaTickPreventionAnnualUsd: 200,
  memberDiscountPct: 10,
  tierCount: 2 as const,
  monthlyProgramOverheadUsd: 500,
};

// Hard-coded tiers for a 2-tier draft that matches computeBreakEven output.
// We DON'T need the numbers to be exactly right — the publishPlan re-runs
// the math server-side; we just need the rows to exist so the update path
// has something to update.
interface TierSeed {
  tierKey: 'preventive' | 'preventive-plus' | 'complete';
  tierName: string;
  ordering: number;
}

const TWO_TIER_SEED: TierSeed[] = [
  { tierKey: 'preventive', tierName: 'Preventive', ordering: 0 },
  { tierKey: 'preventive-plus', tierName: 'Preventive Plus', ordering: 1 },
];

async function createTestClinic(opts: { readyToPublish: boolean }) {
  const userId = `pub-test-${randomUUID()}`;
  const email = `pub-${randomUUID()}@t.test`;
  await superuserPool.query(
    `INSERT INTO "User"(id, email, "emailVerified", "updatedAt") VALUES ($1, $2, false, now())`,
    [userId, email],
  );
  const clinicResult = await superuserPool.query<{ id: string; slug: string }>(
    `INSERT INTO "Clinic"(id, "ownerUserId", "practiceName", slug, "accentColor",
       "stripeAccountId", "stripeChargesEnabled", "stripePayoutsEnabled",
       "stripeDetailsSubmitted", "stripeDisabledReason", "stripeOnboardingState",
       "updatedAt")
     VALUES (gen_random_uuid(), $1, $2, $3, 'sage',
       $4, $5, $5, $5, NULL,
       $6::text::"OnboardingState",
       now())
     RETURNING id, slug`,
    [
      userId,
      `Test Clinic ${userId.slice(-8)}`,
      `test-clinic-${Date.now()}-${randomUUID().slice(0, 6)}`,
      opts.readyToPublish ? `acct_${randomUUID().replace(/-/g, '').slice(0, 16)}` : null,
      opts.readyToPublish,
      opts.readyToPublish ? 'complete' : 'not_started',
    ],
  );
  const clinicRow = clinicResult.rows[0]!;
  return { userId, clinicId: clinicRow.id, clinicSlug: clinicRow.slug };
}

async function createDraftPlan(
  clinicId: string,
  opts: {
    tierCount: 2 | 3;
    status?: 'draft' | 'published';
    seed?: TierSeed[];
    /**
     * When true, populates stripeProductId / stripePriceId / stripePriceHistory
     * on every seeded tier so updatePlanPrices-style tests have Stripe context
     * to edit against. Only relevant for status='published'.
     */
    withStripeIds?: boolean;
  },
) {
  const status = opts.status ?? 'draft';
  const seed = opts.seed ?? TWO_TIER_SEED;
  const planResult = await superuserPool.query<{ id: string }>(
    `INSERT INTO "Plan"(id, "clinicId", status, "builderInputs", "monthlyProgramOverheadUsd",
       "tierCount", "publishedAt", "updatedAt")
     VALUES (gen_random_uuid(), $1, $2::text::"PlanStatus", $3::jsonb, 500, $4,
       CASE WHEN $2 = 'published' THEN now() ELSE NULL END,
       now())
     RETURNING id`,
    [clinicId, status, JSON.stringify(VALID_BUILDER_INPUTS), opts.tierCount],
  );
  const planId = planResult.rows[0]!.id;
  for (const t of seed) {
    const stripeProductId = opts.withStripeIds
      ? `prod_${randomUUID().replace(/-/g, '').slice(0, 14)}`
      : null;
    const stripePriceId = opts.withStripeIds
      ? `price_${randomUUID().replace(/-/g, '').slice(0, 14)}`
      : null;
    const initialCents = 1800;
    const history = opts.withStripeIds
      ? [
          {
            priceId: stripePriceId,
            unitAmountCents: initialCents,
            createdAt: new Date().toISOString(),
            replacedAt: null,
          },
        ]
      : null;
    const publishedAt = status === 'published' ? new Date() : null;
    await superuserPool.query(
      `INSERT INTO "PlanTier"(id, "planId", "clinicId", "tierKey", "tierName",
         "includedServices", "retailValueBundledCents", "monthlyFeeCents",
         "stripeFeePerChargeCents", "platformFeePerChargeCents",
         "clinicGrossPerPetPerYearCents", "breakEvenMembers", ordering,
         "stripeProductId", "stripePriceId", "stripePriceHistory", "publishedAt",
         "updatedAt")
       VALUES (gen_random_uuid(), $1, $2, $3, $4,
         $5::jsonb, 12000, $6,
         82, 180,
         18456, 4, $7,
         $8, $9, $10::jsonb, $11, now())`,
      [
        planId,
        clinicId,
        t.tierKey,
        t.tierName,
        JSON.stringify(
          t.tierKey === 'preventive'
            ? ['annual-exam', 'core-vaccines']
            : t.tierKey === 'preventive-plus'
              ? ['annual-exam', 'core-vaccines', 'dental-cleaning']
              : [
                  'annual-exam',
                  'core-vaccines',
                  'dental-cleaning',
                  'heartworm-prevention',
                  'flea-tick-prevention',
                ],
        ),
        initialCents,
        t.ordering,
        stripeProductId,
        stripePriceId,
        history ? JSON.stringify(history) : null,
        publishedAt,
      ],
    );
  }
  return { id: planId };
}

async function cleanupClinic(clinicId: string, userId: string) {
  await superuserPool.query(`DELETE FROM "PlanTier" WHERE "clinicId" = $1::uuid`, [clinicId]);
  await superuserPool.query(`DELETE FROM "Plan" WHERE "clinicId" = $1::uuid`, [clinicId]);
  await superuserPool.query(`DELETE FROM "Clinic" WHERE id = $1::uuid`, [clinicId]);
  await superuserPool.query(`DELETE FROM "User" WHERE id = $1`, [userId]);
}

// Single top-level teardown — multiple describes below share `superuserPool`
// and `prisma`. Closing them in the first describe's afterAll would kill
// connections before the later describes run.
beforeAll(async () => {
  await superuserPool.query('SELECT 1');
});
afterAll(async () => {
  await superuserPool.end();
  await prisma.$disconnect();
});

describe('publishPlan', () => {
  beforeEach(() => {
    stripeMocks.productsCreate.mockReset();
    stripeMocks.pricesCreate.mockReset();
    authMocks.getSession.mockReset();
    cacheMocks.revalidateTag.mockReset();
  });

  it('happy path: 2-tier draft on ready clinic → creates 2 Products + 2 Prices, publishes atomically', async () => {
    const { userId, clinicId, clinicSlug } = await createTestClinic({ readyToPublish: true });
    try {
      authMocks.getSession.mockResolvedValue({ user: { id: userId } });
      const plan = await createDraftPlan(clinicId, { tierCount: 2 });

      stripeMocks.productsCreate
        .mockResolvedValueOnce({ id: 'prod_P1', name: 'Preventive' } as Stripe.Product)
        .mockResolvedValueOnce({ id: 'prod_P2', name: 'Preventive Plus' } as Stripe.Product);
      stripeMocks.pricesCreate
        .mockResolvedValueOnce({ id: 'price_P1', created: 1_700_000_000 } as Stripe.Price)
        .mockResolvedValueOnce({ id: 'price_P2', created: 1_700_000_000 } as Stripe.Price);

      const result = await publishPlan({ planId: plan.id });

      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error('expected ok');
      expect(result.snapshot.tiers).toHaveLength(2);
      expect(stripeMocks.productsCreate).toHaveBeenCalledTimes(2);
      expect(stripeMocks.pricesCreate).toHaveBeenCalledTimes(2);
      expect(stripeMocks.productsCreate).toHaveBeenCalledWith(
        expect.objectContaining({ metadata: expect.objectContaining({ clinicId }) }),
        expect.objectContaining({
          idempotencyKey: expect.stringMatching(/^publish:.*:product$/),
        }),
      );
      expect(cacheMocks.revalidateTag).toHaveBeenCalledWith(`clinic:${clinicSlug}`, 'default');
      const reloaded = await withClinic(clinicId, (tx) =>
        tx.plan.findUnique({ where: { id: plan.id } }),
      );
      expect(reloaded?.status).toBe('published');
      const tiersPost = await withClinic(clinicId, (tx) =>
        tx.planTier.findMany({ where: { planId: plan.id }, orderBy: { ordering: 'asc' } }),
      );
      expect(tiersPost.every((t) => t.stripePriceId?.startsWith('price_'))).toBe(true);
      expect(tiersPost.every((t) => t.stripeProductId?.startsWith('prod_'))).toBe(true);
    } finally {
      await cleanupClinic(clinicId, userId);
    }
  });

  it('returns NOT_PUBLISH_READY when clinic has no Stripe capabilities', async () => {
    const { userId, clinicId } = await createTestClinic({ readyToPublish: false });
    try {
      authMocks.getSession.mockResolvedValue({ user: { id: userId } });
      const plan = await createDraftPlan(clinicId, { tierCount: 2 });

      const result = await publishPlan({ planId: plan.id });

      expect(result).toMatchObject({ ok: false, code: 'NOT_PUBLISH_READY' });
      expect(stripeMocks.productsCreate).not.toHaveBeenCalled();
      expect(stripeMocks.pricesCreate).not.toHaveBeenCalled();
    } finally {
      await cleanupClinic(clinicId, userId);
    }
  });

  it('returns NO_DRAFT_PLAN when planId belongs to another clinic', async () => {
    const a = await createTestClinic({ readyToPublish: true });
    const b = await createTestClinic({ readyToPublish: true });
    try {
      authMocks.getSession.mockResolvedValue({ user: { id: a.userId } });
      const planOfB = await createDraftPlan(b.clinicId, { tierCount: 2 });

      const result = await publishPlan({ planId: planOfB.id });

      expect(result).toMatchObject({ ok: false, code: 'NO_DRAFT_PLAN' });
      expect(stripeMocks.productsCreate).not.toHaveBeenCalled();
    } finally {
      await cleanupClinic(a.clinicId, a.userId);
      await cleanupClinic(b.clinicId, b.userId);
    }
  });

  it('returns ALREADY_PUBLISHED when plan.status is already published', async () => {
    const { userId, clinicId } = await createTestClinic({ readyToPublish: true });
    try {
      authMocks.getSession.mockResolvedValue({ user: { id: userId } });
      const plan = await createDraftPlan(clinicId, { tierCount: 2, status: 'published' });

      const result = await publishPlan({ planId: plan.id });

      expect(result).toMatchObject({ ok: false, code: 'ALREADY_PUBLISHED' });
      expect(stripeMocks.productsCreate).not.toHaveBeenCalled();
    } finally {
      await cleanupClinic(clinicId, userId);
    }
  });

  it('returns STRIPE_PRODUCT_CREATE_FAILED and does not commit DB when Stripe throws', async () => {
    const { userId, clinicId } = await createTestClinic({ readyToPublish: true });
    try {
      authMocks.getSession.mockResolvedValue({ user: { id: userId } });
      const plan = await createDraftPlan(clinicId, { tierCount: 2 });

      stripeMocks.productsCreate.mockRejectedValueOnce(new Error('Stripe boom'));

      const result = await publishPlan({ planId: plan.id });

      expect(result).toMatchObject({ ok: false, code: 'STRIPE_PRODUCT_CREATE_FAILED' });
      const reloaded = await withClinic(clinicId, (tx) =>
        tx.plan.findUnique({ where: { id: plan.id } }),
      );
      expect(reloaded?.status).toBe('draft');
      expect(reloaded?.publishedAt).toBeNull();
    } finally {
      await cleanupClinic(clinicId, userId);
    }
  });
});

describe('renameTiers', () => {
  beforeEach(() => {
    stripeMocks.productsCreate.mockReset();
    stripeMocks.pricesCreate.mockReset();
    authMocks.getSession.mockReset();
    cacheMocks.revalidateTag.mockReset();
  });

  it('happy path: renames two draft tiers', async () => {
    const { userId, clinicId } = await createTestClinic({ readyToPublish: true });
    try {
      authMocks.getSession.mockResolvedValue({ user: { id: userId } });
      const plan = await createDraftPlan(clinicId, { tierCount: 2 });
      const tiers = await withClinic(clinicId, (tx) =>
        tx.planTier.findMany({ where: { planId: plan.id }, orderBy: { ordering: 'asc' } }),
      );

      const result = await renameTiers({
        planId: plan.id,
        renames: [
          { tierId: tiers[0]!.id, tierName: 'Wellness Starter' },
          { tierId: tiers[1]!.id, tierName: 'Wellness Plus' },
        ],
      });

      expect(result).toEqual({ ok: true });
      const after = await withClinic(clinicId, (tx) =>
        tx.planTier.findMany({ where: { planId: plan.id }, orderBy: { ordering: 'asc' } }),
      );
      expect(after[0]!.tierName).toBe('Wellness Starter');
      expect(after[1]!.tierName).toBe('Wellness Plus');
    } finally {
      await cleanupClinic(clinicId, userId);
    }
  });

  it('rejects rename on an already-published plan', async () => {
    const { userId, clinicId } = await createTestClinic({ readyToPublish: true });
    try {
      authMocks.getSession.mockResolvedValue({ user: { id: userId } });
      const plan = await createDraftPlan(clinicId, {
        tierCount: 2,
        status: 'published',
        withStripeIds: true,
      });
      const tiers = await withClinic(clinicId, (tx) =>
        tx.planTier.findMany({ where: { planId: plan.id }, orderBy: { ordering: 'asc' } }),
      );

      const result = await renameTiers({
        planId: plan.id,
        renames: [{ tierId: tiers[0]!.id, tierName: 'Renamed' }],
      });

      expect(result).toMatchObject({ ok: false, code: 'ALREADY_PUBLISHED' });
    } finally {
      await cleanupClinic(clinicId, userId);
    }
  });

  it('rejects tier names containing HTML brackets (VALIDATION_FAILED)', async () => {
    const { userId, clinicId } = await createTestClinic({ readyToPublish: true });
    try {
      authMocks.getSession.mockResolvedValue({ user: { id: userId } });
      const plan = await createDraftPlan(clinicId, { tierCount: 2 });
      const tiers = await withClinic(clinicId, (tx) =>
        tx.planTier.findMany({ where: { planId: plan.id }, orderBy: { ordering: 'asc' } }),
      );

      const result = await renameTiers({
        planId: plan.id,
        renames: [{ tierId: tiers[0]!.id, tierName: 'Premium <script>' }],
      });

      expect(result).toMatchObject({ ok: false, code: 'VALIDATION_FAILED' });
    } finally {
      await cleanupClinic(clinicId, userId);
    }
  });
});

describe('updatePlanPrices', () => {
  beforeEach(() => {
    stripeMocks.productsCreate.mockReset();
    stripeMocks.pricesCreate.mockReset();
    authMocks.getSession.mockReset();
    cacheMocks.revalidateTag.mockReset();
  });

  it('happy path: 1 changed + 1 unchanged price → 1 Stripe call, 1 PlanTier updated, history appended', async () => {
    const { userId, clinicId, clinicSlug } = await createTestClinic({ readyToPublish: true });
    try {
      authMocks.getSession.mockResolvedValue({ user: { id: userId } });
      const plan = await createDraftPlan(clinicId, {
        tierCount: 2,
        status: 'published',
        withStripeIds: true,
      });
      const tiers = await withClinic(clinicId, (tx) =>
        tx.planTier.findMany({ where: { planId: plan.id }, orderBy: { ordering: 'asc' } }),
      );

      stripeMocks.pricesCreate.mockResolvedValueOnce({
        id: 'price_NEW_P1',
        created: 1_700_000_100,
      } as Stripe.Price);

      const result = await updatePlanPrices({
        planId: plan.id,
        priceChanges: [
          { tierId: tiers[0]!.id, newMonthlyFeeCents: 2100 }, // changed
          { tierId: tiers[1]!.id, newMonthlyFeeCents: 1800 }, // unchanged (same as seed)
        ],
      });

      expect(result).toMatchObject({ ok: true });
      if (!result.ok) throw new Error('expected ok');
      expect(result.updatedTiers).toHaveLength(1);
      expect(result.updatedTiers[0]).toMatchObject({
        tierId: tiers[0]!.id,
        newPriceId: 'price_NEW_P1',
        newUnitAmountCents: 2100,
      });
      expect(stripeMocks.pricesCreate).toHaveBeenCalledTimes(1);
      expect(cacheMocks.revalidateTag).toHaveBeenCalledWith(`clinic:${clinicSlug}`, 'default');

      const updated = await withClinic(clinicId, (tx) =>
        tx.planTier.findUnique({ where: { id: tiers[0]!.id } }),
      );
      expect(updated?.monthlyFeeCents).toBe(2100);
      expect(updated?.stripePriceId).toBe('price_NEW_P1');
      const hist = updated?.stripePriceHistory as Array<{
        priceId: string;
        replacedAt: string | null;
      }>;
      expect(hist).toHaveLength(2);
      expect(hist[0]!.replacedAt).not.toBeNull(); // old entry stamped
      expect(hist[1]!.replacedAt).toBeNull(); // new entry active
      expect(hist[1]!.priceId).toBe('price_NEW_P1');
    } finally {
      await cleanupClinic(clinicId, userId);
    }
  });

  it('rejects updatePlanPrices on a draft plan (NO_DRAFT_PLAN)', async () => {
    const { userId, clinicId } = await createTestClinic({ readyToPublish: true });
    try {
      authMocks.getSession.mockResolvedValue({ user: { id: userId } });
      const plan = await createDraftPlan(clinicId, { tierCount: 2 });
      const tiers = await withClinic(clinicId, (tx) =>
        tx.planTier.findMany({ where: { planId: plan.id }, orderBy: { ordering: 'asc' } }),
      );

      const result = await updatePlanPrices({
        planId: plan.id,
        priceChanges: [{ tierId: tiers[0]!.id, newMonthlyFeeCents: 2100 }],
      });

      expect(result).toMatchObject({ ok: false, code: 'NO_DRAFT_PLAN' });
      expect(stripeMocks.pricesCreate).not.toHaveBeenCalled();
    } finally {
      await cleanupClinic(clinicId, userId);
    }
  });

  it('rejects out-of-range price via Zod (VALIDATION_FAILED)', async () => {
    const { userId, clinicId } = await createTestClinic({ readyToPublish: true });
    try {
      authMocks.getSession.mockResolvedValue({ user: { id: userId } });
      const plan = await createDraftPlan(clinicId, {
        tierCount: 2,
        status: 'published',
        withStripeIds: true,
      });
      const tiers = await withClinic(clinicId, (tx) =>
        tx.planTier.findMany({ where: { planId: plan.id }, orderBy: { ordering: 'asc' } }),
      );

      // 499_999 cents = $4,999.99 — exceeds max 100_000 ($1,000) enforced by Zod.
      const result = await updatePlanPrices({
        planId: plan.id,
        priceChanges: [{ tierId: tiers[0]!.id, newMonthlyFeeCents: 499_999 }],
      });

      expect(result).toMatchObject({ ok: false, code: 'VALIDATION_FAILED' });
      expect(stripeMocks.pricesCreate).not.toHaveBeenCalled();
    } finally {
      await cleanupClinic(clinicId, userId);
    }
  });
});
