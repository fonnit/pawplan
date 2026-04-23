/**
 * Cross-tenant isolation integration test — FOUND-04 + T-01-03-03.
 *
 * Runs unconditionally against the local Docker Postgres on port 5433 (see
 * .env.local). The suite is NOT skipped — if the DB is unreachable the test
 * fails loudly, which is the correct signal for "RLS is unverified."
 *
 * Two connections:
 *   - `prisma` (app role `pawplan_app`, NOBYPASSRLS) — the connection under
 *     test. Every RLS assertion runs through this client.
 *   - `superuserPool` (superuser `pawplan`, BYPASSRLS) — used ONLY by the
 *     beforeAll/afterAll fixtures to seed + tear down Clinic A and Clinic B
 *     rows without the RLS policy getting in the way.
 *
 * The superuser URL is read from `DATABASE_URL_TEST_SUPERUSER` first, falling
 * back to `DATABASE_URL_UNPOOLED`. The fixture pool is a plain node-postgres
 * Pool — no Prisma — because we only need a few parameterized INSERTs and
 * avoiding a second PrismaClient keeps connection churn low.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';

describe('withClinic — cross-tenant isolation (FOUND-04)', () => {
  const superuserUrl =
    process.env['DATABASE_URL_TEST_SUPERUSER'] ?? process.env['DATABASE_URL_UNPOOLED'];
  if (!superuserUrl) {
    throw new Error(
      'Cross-tenant isolation test requires DATABASE_URL_TEST_SUPERUSER or DATABASE_URL_UNPOOLED.',
    );
  }
  const superuserPool = new Pool({ connectionString: superuserUrl });

  let userAId = '';
  let userBId = '';
  let clinicAId = '';
  let clinicBId = '';
  let planAId = '';
  let planBId = '';
  let prisma: typeof import('./db').prisma;
  let withClinic: typeof import('./tenant').withClinic;

  beforeAll(async () => {
    ({ prisma } = await import('./db'));
    ({ withClinic } = await import('./tenant'));

    userAId = `test-user-a-${randomUUID()}`;
    userBId = `test-user-b-${randomUUID()}`;
    // Seed User rows via the superuser pool — User has no RLS policy, so this
    // would work on the app connection too, but going through the fixture
    // connection keeps the "test setup uses superuser, assertions use app
    // role" boundary explicit.
    await superuserPool.query(
      `INSERT INTO "User"(id, email, "emailVerified", "updatedAt") VALUES ($1, $2, false, now())`,
      [userAId, `a-${randomUUID()}@t.test`],
    );
    await superuserPool.query(
      `INSERT INTO "User"(id, email, "emailVerified", "updatedAt") VALUES ($1, $2, false, now())`,
      [userBId, `b-${randomUUID()}@t.test`],
    );

    // Seed Clinic A + Clinic B as superuser — bypasses RLS, which would
    // otherwise reject the second INSERT if we tried to do both through the
    // app role (`current_clinic_id` GUC can only match one id at a time).
    const clinicAResult = await superuserPool.query<{ id: string }>(
      `INSERT INTO "Clinic"(id, "ownerUserId", "practiceName", slug, "accentColor", "updatedAt")
       VALUES (gen_random_uuid(), $1, 'Clinic A', $2, 'sage', now()) RETURNING id`,
      [userAId, `clinic-a-${Date.now()}-${randomUUID().slice(0, 6)}`],
    );
    clinicAId = clinicAResult.rows[0]!.id;

    const clinicBResult = await superuserPool.query<{ id: string }>(
      `INSERT INTO "Clinic"(id, "ownerUserId", "practiceName", slug, "accentColor", "updatedAt")
       VALUES (gen_random_uuid(), $1, 'Clinic B', $2, 'wine', now()) RETURNING id`,
      [userBId, `clinic-b-${Date.now()}-${randomUUID().slice(0, 6)}`],
    );
    clinicBId = clinicBResult.rows[0]!.id;

    // Seed one Plan per clinic via the app role + withClinic (proves the
    // happy path works end-to-end).
    const planA = await withClinic(clinicAId, (tx) =>
      tx.plan.create({ data: { clinicId: clinicAId, builderInputs: {}, tierCount: 3 } }),
    );
    planAId = planA.id;
    const planB = await withClinic(clinicBId, (tx) =>
      tx.plan.create({ data: { clinicId: clinicBId, builderInputs: {}, tierCount: 3 } }),
    );
    planBId = planB.id;
  });

  afterAll(async () => {
    // Tear down as superuser to bypass RLS and avoid per-clinic scoping.
    await superuserPool.query(
      `DELETE FROM "PlanTier" WHERE "clinicId" IN ($1::uuid, $2::uuid)`,
      [clinicAId, clinicBId],
    );
    await superuserPool.query(
      `DELETE FROM "Plan" WHERE "clinicId" IN ($1::uuid, $2::uuid)`,
      [clinicAId, clinicBId],
    );
    await superuserPool.query(
      `DELETE FROM "Clinic" WHERE id IN ($1::uuid, $2::uuid)`,
      [clinicAId, clinicBId],
    );
    await superuserPool.query(`DELETE FROM "User" WHERE id IN ($1, $2)`, [userAId, userBId]);
    await superuserPool.end();
    await prisma.$disconnect();
  });

  it('app role is provisioned with NOBYPASSRLS (T-01-03-03)', async () => {
    const rows = await prisma.$queryRawUnsafe<Array<{ rolbypassrls: boolean }>>(
      `SELECT rolbypassrls FROM pg_roles WHERE rolname = current_user`,
    );
    expect(rows[0]?.rolbypassrls).toBe(false);
  });

  it('clinic A cannot see clinic B plans even with no WHERE filter', async () => {
    const rows = await withClinic(clinicAId, (tx) => tx.plan.findMany());
    expect(rows.map((r) => r.id)).toContain(planAId);
    expect(rows.map((r) => r.id)).not.toContain(planBId);
  });

  it('clinic B cannot see clinic A plans', async () => {
    const rows = await withClinic(clinicBId, (tx) => tx.plan.findMany());
    expect(rows.map((r) => r.id)).toContain(planBId);
    expect(rows.map((r) => r.id)).not.toContain(planAId);
  });

  it('raw SELECT inside withClinic() respects RLS (no clinicId filter)', async () => {
    const rows = await withClinic(clinicAId, (tx) =>
      tx.$queryRawUnsafe<Array<{ id: string; clinicId: string }>>(
        `SELECT id, "clinicId" FROM "Plan"`,
      ),
    );
    expect(rows.every((r) => r.clinicId === clinicAId)).toBe(true);
  });

  it('UPDATE Clinic SET ... against foreign tenant fails via RLS', async () => {
    // Inside withClinic(A), any write against Clinic B must be invisible
    // (RLS filter makes the row effectively not-exist). Prisma reports this
    // as a not-found error for update-by-unique. The critical correctness
    // property is: the target row is NOT modified. We confirm post-hoc by
    // reading the row through the superuser pool.
    const before = await superuserPool.query<{ practiceName: string }>(
      `SELECT "practiceName" FROM "Clinic" WHERE id = $1::uuid`,
      [clinicBId],
    );
    expect(before.rows[0]?.practiceName).toBe('Clinic B');

    let threw = false;
    try {
      await withClinic(clinicAId, (tx) =>
        tx.clinic.update({
          where: { id: clinicBId },
          data: { practiceName: 'HACKED BY A' },
        }),
      );
    } catch {
      threw = true;
    }
    expect(threw).toBe(true);

    const after = await superuserPool.query<{ practiceName: string }>(
      `SELECT "practiceName" FROM "Clinic" WHERE id = $1::uuid`,
      [clinicBId],
    );
    expect(after.rows[0]?.practiceName).toBe('Clinic B');
  });

  it('rejects non-UUID clinicId', async () => {
    const { withClinic: wc } = await import('./tenant');
    await expect(wc('not-a-uuid', () => Promise.resolve(1))).rejects.toThrow(/invalid UUID/);
  });
});
