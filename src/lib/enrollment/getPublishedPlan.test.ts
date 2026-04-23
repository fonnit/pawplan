/**
 * getPublishedPlan integration tests (PUB-05).
 *
 * Verifies:
 *   - unknown slug → null
 *   - published 2-tier plan → full snapshot, tiers sorted by ordering
 *   - draft plan → null (view WHERE filter enforces)
 *
 * next/cache is mocked so unstable_cache is a pass-through (no cross-test
 * state pollution). React's `cache()` is left real; it only dedupes within
 * one render which doesn't happen in Vitest.
 *
 * Fixture seed uses the superuser pool (same pattern as tenant.test + publish.test).
 */
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';

vi.mock('next/cache', () => ({
  unstable_cache: <T extends (...args: unknown[]) => unknown>(fn: T) => fn,
  revalidateTag: vi.fn(),
}));

import { prisma } from '@/lib/db';
import { getPublishedPlan } from './getPublishedPlan';

const superuserUrl =
  process.env['DATABASE_URL_TEST_SUPERUSER'] ?? process.env['DATABASE_URL_UNPOOLED'];
if (!superuserUrl) {
  throw new Error(
    'getPublishedPlan test requires DATABASE_URL_TEST_SUPERUSER or DATABASE_URL_UNPOOLED.',
  );
}
const superuserPool = new Pool({ connectionString: superuserUrl });

interface Fixture {
  userId: string;
  clinicId: string;
  slug: string;
  planId: string;
}

async function seedClinicWithPlan(opts: {
  status: 'draft' | 'published';
  tierCount: 2;
  withStripeIds: boolean;
}): Promise<Fixture> {
  const userId = `enr-test-${randomUUID()}`;
  await superuserPool.query(
    `INSERT INTO "User"(id, email, "emailVerified", "updatedAt") VALUES ($1, $2, false, now())`,
    [userId, `enr-${randomUUID()}@t.test`],
  );
  const slug = `enr-${Date.now()}-${randomUUID().slice(0, 6)}`;
  const clinicResult = await superuserPool.query<{ id: string }>(
    `INSERT INTO "Clinic"(id, "ownerUserId", "practiceName", slug, "accentColor", "logoUrl", "updatedAt")
     VALUES (gen_random_uuid(), $1, 'Enrollment Test Clinic', $2, 'terracotta', 'https://example.test/logo.png', now())
     RETURNING id`,
    [userId, slug],
  );
  const clinicId = clinicResult.rows[0]!.id;

  const planResult = await superuserPool.query<{ id: string }>(
    `INSERT INTO "Plan"(id, "clinicId", status, "builderInputs", "monthlyProgramOverheadUsd",
       "tierCount", "publishedAt", "updatedAt")
     VALUES (gen_random_uuid(), $1, $2::text::"PlanStatus", '{}'::jsonb, 500, $3,
       CASE WHEN $2 = 'published' THEN now() ELSE NULL END, now())
     RETURNING id`,
    [clinicId, opts.status, opts.tierCount],
  );
  const planId = planResult.rows[0]!.id;

  const tiers = [
    { tierKey: 'preventive', tierName: 'Preventive', ordering: 0, cents: 1800 },
    { tierKey: 'preventive-plus', tierName: 'Preventive Plus', ordering: 1, cents: 3200 },
  ];
  for (const t of tiers) {
    const stripeProductId = opts.withStripeIds ? `prod_${randomUUID().slice(0, 10)}` : null;
    const stripePriceId = opts.withStripeIds ? `price_${randomUUID().slice(0, 10)}` : null;
    const publishedAt = opts.status === 'published' ? new Date() : null;
    await superuserPool.query(
      `INSERT INTO "PlanTier"(id, "planId", "clinicId", "tierKey", "tierName",
         "includedServices", "retailValueBundledCents", "monthlyFeeCents",
         "stripeFeePerChargeCents", "platformFeePerChargeCents",
         "clinicGrossPerPetPerYearCents", "breakEvenMembers", ordering,
         "stripeProductId", "stripePriceId", "publishedAt", "updatedAt")
       VALUES (gen_random_uuid(), $1, $2, $3, $4,
         $5::jsonb, 12000, $6,
         82, 180,
         18456, 4, $7,
         $8, $9, $10, now())`,
      [
        planId,
        clinicId,
        t.tierKey,
        t.tierName,
        JSON.stringify(['annual-exam', 'core-vaccines']),
        t.cents,
        t.ordering,
        stripeProductId,
        stripePriceId,
        publishedAt,
      ],
    );
  }
  return { userId, clinicId, slug, planId };
}

async function cleanupFixture(f: Fixture) {
  await superuserPool.query(`DELETE FROM "PlanTier" WHERE "clinicId" = $1::uuid`, [f.clinicId]);
  await superuserPool.query(`DELETE FROM "Plan" WHERE "clinicId" = $1::uuid`, [f.clinicId]);
  await superuserPool.query(`DELETE FROM "Clinic" WHERE id = $1::uuid`, [f.clinicId]);
  await superuserPool.query(`DELETE FROM "User" WHERE id = $1`, [f.userId]);
}

describe('getPublishedPlan', () => {
  beforeAll(async () => {
    await superuserPool.query('SELECT 1');
  });

  afterAll(async () => {
    await superuserPool.end();
    await prisma.$disconnect();
  });

  it('returns null for an unknown slug', async () => {
    const result = await getPublishedPlan(`does-not-exist-${randomUUID()}`);
    expect(result).toBeNull();
  });

  it('returns a full snapshot for a published 2-tier plan', async () => {
    const f = await seedClinicWithPlan({
      status: 'published',
      tierCount: 2,
      withStripeIds: true,
    });
    try {
      const snapshot = await getPublishedPlan(f.slug);
      expect(snapshot).not.toBeNull();
      expect(snapshot!.clinicSlug).toBe(f.slug);
      expect(snapshot!.clinicPracticeName).toBe('Enrollment Test Clinic');
      expect(snapshot!.clinicAccentColor).toBe('terracotta');
      expect(snapshot!.clinicLogoUrl).toBe('https://example.test/logo.png');
      expect(snapshot!.tierCount).toBe(2);
      expect(snapshot!.tiers).toHaveLength(2);
      // Ordering check — Preventive (ordering 0) before Preventive Plus (1).
      expect(snapshot!.tiers[0]!.tierKey).toBe('preventive');
      expect(snapshot!.tiers[1]!.tierKey).toBe('preventive-plus');
      expect(snapshot!.tiers[0]!.monthlyFeeCents).toBe(1800);
      expect(snapshot!.tiers[1]!.monthlyFeeCents).toBe(3200);
      // stripePriceId surfaced from the view; product id deliberately blank.
      expect(snapshot!.tiers[0]!.stripePriceId).toMatch(/^price_/);
      expect(snapshot!.tiers[0]!.stripeProductId).toBe('');
    } finally {
      await cleanupFixture(f);
    }
  });

  it('returns null for a draft plan (view filter enforces)', async () => {
    const f = await seedClinicWithPlan({
      status: 'draft',
      tierCount: 2,
      withStripeIds: false,
    });
    try {
      const result = await getPublishedPlan(f.slug);
      expect(result).toBeNull();
    } finally {
      await cleanupFixture(f);
    }
  });
});
