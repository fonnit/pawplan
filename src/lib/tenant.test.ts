/**
 * Cross-tenant isolation integration test — FOUND-04.
 *
 * Requires a live DATABASE_URL pointed at a Neon Postgres with the Phase 1
 * schema pushed and `prisma/sql/001-rls-policies.sql` applied.
 *
 * When DATABASE_URL is the stub value (`postgresql://stub:...`) the suite
 * skips — the orchestrator will execute it once a real Neon URL is provisioned
 * (see TODO-DB-PUSH.md).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';

const DATABASE_URL = process.env['DATABASE_URL'] ?? '';
const IS_STUB = DATABASE_URL === '' || DATABASE_URL.includes('stub:stub@localhost');
const describeOrSkip = IS_STUB ? describe.skip : describe;

describeOrSkip('withClinic — cross-tenant isolation (FOUND-04)', () => {
  let userAId = '';
  let userBId = '';
  let clinicAId = '';
  let clinicBId = '';
  let planAId = '';
  let planBId = '';
  let prisma: typeof import('./db').prisma;
  let withClinic: typeof import('./tenant').withClinic;

  beforeAll(async () => {
    if (IS_STUB) return;
    ({ prisma } = await import('./db'));
    ({ withClinic } = await import('./tenant'));

    userAId = `test-user-a-${randomUUID()}`;
    userBId = `test-user-b-${randomUUID()}`;
    await prisma.user.create({ data: { id: userAId, email: `a-${randomUUID()}@t.test` } });
    await prisma.user.create({ data: { id: userBId, email: `b-${randomUUID()}@t.test` } });

    const clinicA = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
      `INSERT INTO "Clinic"(id, "ownerUserId", "practiceName", slug, "accentColor", "updatedAt")
       VALUES (gen_random_uuid(), $1, 'Clinic A', $2, 'sage', now()) RETURNING id`,
      userAId,
      `clinic-a-${Date.now()}`,
    );
    clinicAId = clinicA[0]!.id;

    const clinicB = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
      `INSERT INTO "Clinic"(id, "ownerUserId", "practiceName", slug, "accentColor", "updatedAt")
       VALUES (gen_random_uuid(), $1, 'Clinic B', $2, 'wine', now()) RETURNING id`,
      userBId,
      `clinic-b-${Date.now()}-2`,
    );
    clinicBId = clinicB[0]!.id;

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
    if (IS_STUB) return;
    await prisma.$executeRawUnsafe(
      `DELETE FROM "PlanTier" WHERE "clinicId" IN ($1::uuid, $2::uuid)`,
      clinicAId,
      clinicBId,
    );
    await prisma.$executeRawUnsafe(
      `DELETE FROM "Plan" WHERE "clinicId" IN ($1::uuid, $2::uuid)`,
      clinicAId,
      clinicBId,
    );
    await prisma.$executeRawUnsafe(
      `DELETE FROM "Clinic" WHERE id IN ($1::uuid, $2::uuid)`,
      clinicAId,
      clinicBId,
    );
    await prisma.user.deleteMany({ where: { id: { in: [userAId, userBId] } } });
    await prisma.$disconnect();
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

  it('rejects non-UUID clinicId', async () => {
    const { withClinic: wc } = await import('./tenant');
    await expect(wc('not-a-uuid', () => Promise.resolve(1))).rejects.toThrow(/invalid UUID/);
  });
});
