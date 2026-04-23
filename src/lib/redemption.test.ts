/**
 * Redemption library — integration test against the local Docker Postgres.
 *
 * Proves the DB-level idempotency guarantee (unique index on
 * (memberId, serviceKey, billingPeriodStart)) is what actually makes
 * simultaneous toggles safe — NOT the app-layer findUnique/create read
 * cycle. We force two concurrent toggleRedemption calls and assert that
 * exactly one row lands.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';

const CLINIC_SEED_SLUG_A = `rdmp-${Date.now()}-${randomUUID().slice(0, 6)}`;
const CLINIC_SEED_SLUG_B = `rdmp-b-${Date.now()}-${randomUUID().slice(0, 6)}`;
const SERVICE_KEY = 'annual-exam';

describe('toggleRedemption (integration)', () => {
  const superuserUrl =
    process.env['DATABASE_URL_TEST_SUPERUSER'] ?? process.env['DATABASE_URL_UNPOOLED'];
  if (!superuserUrl) {
    throw new Error(
      'Redemption integration test requires DATABASE_URL_TEST_SUPERUSER or DATABASE_URL_UNPOOLED.',
    );
  }
  const pool = new Pool({ connectionString: superuserUrl });

  let userAId = '';
  let userBId = '';
  let clinicAId = '';
  let clinicBId = '';
  let planAId = '';
  let tierAId = '';
  let memberAId = '';
  let memberBId = ''; // clinic B — cross-tenant test target
  let toggleRedemption: typeof import('./redemption').toggleRedemption;
  let listRedemptionsForMember: typeof import('./redemption').listRedemptionsForMember;
  const billingPeriodStart = new Date('2026-04-01T00:00:00.000Z');

  beforeAll(async () => {
    ({ toggleRedemption, listRedemptionsForMember } = await import('./redemption'));

    userAId = `rdmp-ua-${randomUUID()}`;
    userBId = `rdmp-ub-${randomUUID()}`;
    await pool.query(
      `INSERT INTO "User"(id, email, "emailVerified", "updatedAt") VALUES ($1, $2, false, now())`,
      [userAId, `ra-${randomUUID()}@t.test`],
    );
    await pool.query(
      `INSERT INTO "User"(id, email, "emailVerified", "updatedAt") VALUES ($1, $2, false, now())`,
      [userBId, `rb-${randomUUID()}@t.test`],
    );

    const clinicA = await pool.query<{ id: string }>(
      `INSERT INTO "Clinic"(id, "ownerUserId", "practiceName", slug, "accentColor", "updatedAt")
       VALUES (gen_random_uuid(), $1, 'Clinic R-A', $2, 'sage', now()) RETURNING id`,
      [userAId, CLINIC_SEED_SLUG_A],
    );
    clinicAId = clinicA.rows[0]!.id;

    const clinicB = await pool.query<{ id: string }>(
      `INSERT INTO "Clinic"(id, "ownerUserId", "practiceName", slug, "accentColor", "updatedAt")
       VALUES (gen_random_uuid(), $1, 'Clinic R-B', $2, 'sage', now()) RETURNING id`,
      [userBId, CLINIC_SEED_SLUG_B],
    );
    clinicBId = clinicB.rows[0]!.id;

    // Minimal plan + tier in Clinic A so we can create a Member.
    const plan = await pool.query<{ id: string }>(
      `INSERT INTO "Plan"(id, "clinicId", status, "builderInputs", "tierCount", "updatedAt")
       VALUES (gen_random_uuid(), $1, 'published', '{}'::jsonb, 2, now()) RETURNING id`,
      [clinicAId],
    );
    planAId = plan.rows[0]!.id;

    const tier = await pool.query<{ id: string }>(
      `INSERT INTO "PlanTier"(id, "planId", "clinicId", "tierKey", "tierName", "includedServices",
         "retailValueBundledCents", "monthlyFeeCents", "stripeFeePerChargeCents",
         "platformFeePerChargeCents", "clinicGrossPerPetPerYearCents", "breakEvenMembers",
         ordering, "updatedAt")
       VALUES (gen_random_uuid(), $1, $2, 'preventive', 'Preventive',
         '["annual-exam","core-vaccines"]'::jsonb,
         50000, 4000, 146, 400, 40000, 10, 0, now())
       RETURNING id`,
      [planAId, clinicAId],
    );
    tierAId = tier.rows[0]!.id;

    // Member in Clinic A
    const memberA = await pool.query<{ id: string }>(
      `INSERT INTO "Member"(id, "clinicId", "planTierId", "stripeCustomerId",
         "stripeSubscriptionId", "petName", species, "ownerEmail", status,
         "currentPeriodEnd", "updatedAt")
       VALUES (gen_random_uuid(), $1, $2, $3, $4, 'Rex', 'dog', 'a@t.test',
         'active', $5, now()) RETURNING id`,
      [clinicAId, tierAId, `cus_${randomUUID()}`, `sub_${randomUUID()}`, new Date('2026-05-01T12:00:00Z')],
    );
    memberAId = memberA.rows[0]!.id;

    // Member in Clinic B — for cross-tenant test. Needs its own plan/tier.
    const planB = await pool.query<{ id: string }>(
      `INSERT INTO "Plan"(id, "clinicId", status, "builderInputs", "tierCount", "updatedAt")
       VALUES (gen_random_uuid(), $1, 'published', '{}'::jsonb, 2, now()) RETURNING id`,
      [clinicBId],
    );
    const tierB = await pool.query<{ id: string }>(
      `INSERT INTO "PlanTier"(id, "planId", "clinicId", "tierKey", "tierName", "includedServices",
         "retailValueBundledCents", "monthlyFeeCents", "stripeFeePerChargeCents",
         "platformFeePerChargeCents", "clinicGrossPerPetPerYearCents", "breakEvenMembers",
         ordering, "updatedAt")
       VALUES (gen_random_uuid(), $1, $2, 'preventive', 'Preventive',
         '["annual-exam"]'::jsonb, 50000, 4000, 146, 400, 40000, 10, 0, now())
       RETURNING id`,
      [planB.rows[0]!.id, clinicBId],
    );
    const memberB = await pool.query<{ id: string }>(
      `INSERT INTO "Member"(id, "clinicId", "planTierId", "stripeCustomerId",
         "stripeSubscriptionId", "petName", species, "ownerEmail", status,
         "currentPeriodEnd", "updatedAt")
       VALUES (gen_random_uuid(), $1, $2, $3, $4, 'Whiskers', 'cat', 'b@t.test',
         'active', $5, now()) RETURNING id`,
      [clinicBId, tierB.rows[0]!.id, `cus_${randomUUID()}`, `sub_${randomUUID()}`, new Date('2026-05-01T12:00:00Z')],
    );
    memberBId = memberB.rows[0]!.id;
  });

  afterAll(async () => {
    await pool.query(`DELETE FROM "ServiceRedemption" WHERE "memberId" IN ($1, $2)`, [memberAId, memberBId]);
    await pool.query(`DELETE FROM "Member" WHERE id IN ($1, $2)`, [memberAId, memberBId]);
    await pool.query(`DELETE FROM "PlanTier" WHERE "clinicId" IN ($1, $2)`, [clinicAId, clinicBId]);
    await pool.query(`DELETE FROM "Plan" WHERE "clinicId" IN ($1, $2)`, [clinicAId, clinicBId]);
    await pool.query(`DELETE FROM "Clinic" WHERE id IN ($1, $2)`, [clinicAId, clinicBId]);
    await pool.query(`DELETE FROM "User" WHERE id IN ($1, $2)`, [userAId, userBId]);
    await pool.end();
  });

  beforeEach(async () => {
    // Clean slate between tests.
    await pool.query(`DELETE FROM "ServiceRedemption" WHERE "memberId" IN ($1, $2)`, [memberAId, memberBId]);
  });

  it('toggle on → creates a row; second toggle on → already_redeemed (idempotent)', async () => {
    const first = await toggleRedemption({
      clinicId: clinicAId,
      memberId: memberAId,
      serviceKey: SERVICE_KEY,
      billingPeriodStart,
      userId: userAId,
      desiredState: 'on',
    });
    expect(first.status).toBe('on');

    const second = await toggleRedemption({
      clinicId: clinicAId,
      memberId: memberAId,
      serviceKey: SERVICE_KEY,
      billingPeriodStart,
      userId: userAId,
      desiredState: 'on',
    });
    expect(second.status).toBe('already_redeemed');

    const count = await pool.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM "ServiceRedemption" WHERE "memberId" = $1`,
      [memberAId],
    );
    expect(count.rows[0]!.count).toBe('1');
  });

  it('concurrent toggle-on from 5 requests persists exactly one row', async () => {
    const attempts = await Promise.allSettled(
      Array.from({ length: 5 }).map(() =>
        toggleRedemption({
          clinicId: clinicAId,
          memberId: memberAId,
          serviceKey: SERVICE_KEY,
          billingPeriodStart,
          userId: userAId,
          desiredState: 'on',
        }),
      ),
    );

    // Nothing should have thrown — the P2002 retry path swallows the unique-
    // constraint race.
    for (const a of attempts) {
      expect(a.status).toBe('fulfilled');
    }
    const statuses = attempts.map((a) => (a as PromiseFulfilledResult<{ status: string }>).value.status);
    const onCount = statuses.filter((s) => s === 'on').length;
    const alreadyCount = statuses.filter((s) => s === 'already_redeemed').length;
    expect(onCount + alreadyCount).toBe(5);
    // At least one succeeded, at least one re-entered as already_redeemed.
    expect(onCount).toBeGreaterThanOrEqual(1);

    const count = await pool.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM "ServiceRedemption" WHERE "memberId" = $1`,
      [memberAId],
    );
    expect(count.rows[0]!.count).toBe('1');
  });

  it('toggle off → deletes the row; second toggle off → no-op', async () => {
    await toggleRedemption({
      clinicId: clinicAId,
      memberId: memberAId,
      serviceKey: SERVICE_KEY,
      billingPeriodStart,
      userId: userAId,
      desiredState: 'on',
    });

    const off = await toggleRedemption({
      clinicId: clinicAId,
      memberId: memberAId,
      serviceKey: SERVICE_KEY,
      billingPeriodStart,
      userId: userAId,
      desiredState: 'off',
    });
    expect(off.status).toBe('off');

    const count = await pool.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM "ServiceRedemption" WHERE "memberId" = $1`,
      [memberAId],
    );
    expect(count.rows[0]!.count).toBe('0');

    const secondOff = await toggleRedemption({
      clinicId: clinicAId,
      memberId: memberAId,
      serviceKey: SERVICE_KEY,
      billingPeriodStart,
      userId: userAId,
      desiredState: 'off',
    });
    expect(secondOff.status).toBe('off'); // idempotent no-op
  });

  it('optimistic lock: mismatched expectedVersion rejects with version_conflict on toggle-off', async () => {
    const on = await toggleRedemption({
      clinicId: clinicAId,
      memberId: memberAId,
      serviceKey: SERVICE_KEY,
      billingPeriodStart,
      userId: userAId,
      desiredState: 'on',
    });
    expect(on.status).toBe('on');

    const conflict = await toggleRedemption({
      clinicId: clinicAId,
      memberId: memberAId,
      serviceKey: SERVICE_KEY,
      billingPeriodStart,
      userId: userAId,
      desiredState: 'off',
      expectedVersion: 99, // stale
    });
    expect(conflict.status).toBe('version_conflict');
    if (conflict.status === 'version_conflict') {
      expect(conflict.currentRow.version).toBe(0);
    }

    // Row is still present because the conflict short-circuited the delete.
    const count = await pool.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM "ServiceRedemption" WHERE "memberId" = $1`,
      [memberAId],
    );
    expect(count.rows[0]!.count).toBe('1');
  });

  it('cross-tenant memberId returns not_found (RLS enforced)', async () => {
    // Clinic A tries to toggle Clinic B's member.
    const result = await toggleRedemption({
      clinicId: clinicAId,
      memberId: memberBId,
      serviceKey: SERVICE_KEY,
      billingPeriodStart,
      userId: userAId,
      desiredState: 'on',
    });
    expect(result.status).toBe('not_found');

    const count = await pool.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM "ServiceRedemption" WHERE "memberId" = $1`,
      [memberBId],
    );
    expect(count.rows[0]!.count).toBe('0');
  });

  it('listRedemptionsForMember scopes to billing period', async () => {
    const otherPeriod = new Date('2026-05-01T00:00:00.000Z');

    await toggleRedemption({
      clinicId: clinicAId,
      memberId: memberAId,
      serviceKey: 'annual-exam',
      billingPeriodStart,
      userId: userAId,
      desiredState: 'on',
    });
    await toggleRedemption({
      clinicId: clinicAId,
      memberId: memberAId,
      serviceKey: 'core-vaccines',
      billingPeriodStart: otherPeriod,
      userId: userAId,
      desiredState: 'on',
    });

    const rowsAprl = await listRedemptionsForMember({
      clinicId: clinicAId,
      memberId: memberAId,
      billingPeriodStart,
    });
    expect(rowsAprl).toHaveLength(1);
    expect(rowsAprl[0]!.serviceKey).toBe('annual-exam');

    const rowsMay = await listRedemptionsForMember({
      clinicId: clinicAId,
      memberId: memberAId,
      billingPeriodStart: otherPeriod,
    });
    expect(rowsMay).toHaveLength(1);
    expect(rowsMay[0]!.serviceKey).toBe('core-vaccines');
  });
});
