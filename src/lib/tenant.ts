import { Prisma } from '@prisma/client';
import { prisma } from './db';

type Tx = Prisma.TransactionClient;

/**
 * withClinic — FOUND-04.
 *
 * Opens a Postgres transaction, sets `app.current_clinic_id` for RLS, then
 * runs `fn(tx)`. This is the ONLY sanctioned path for tenant-scoped queries.
 * `SET LOCAL` scopes the GUC to the transaction and does not leak across
 * pool checkouts.
 */
export async function withClinic<T>(
  clinicId: string,
  fn: (tx: Tx) => Promise<T>,
): Promise<T> {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(clinicId)) {
    throw new Error(`withClinic: invalid UUID: ${clinicId}`);
  }
  return prisma.$transaction(async (tx) => {
    // Prisma.sql parameter substitution does not work inside SET LOCAL, so we
    // validate UUID format above and interpolate directly. SQL-injection-safe
    // because the regex guard rejects anything that isn't a strict UUID.
    await tx.$executeRawUnsafe(`SET LOCAL app.current_clinic_id = '${clinicId}'`);
    return fn(tx);
  });
}
