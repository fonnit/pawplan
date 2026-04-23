/**
 * Phase 6 (DASH-04) — service-redemption toggle library.
 *
 * Invariant: existence-as-state.
 *   - No row  ≡ service NOT redeemed this period
 *   - One row ≡ service redeemed (by `redeemedByUserId` at `redeemedAt`)
 *
 * A toggle-on INSERTs. A toggle-off DELETEs. Two toggle-on requests racing
 * → exactly one row lands (DB unique index on
 * (memberId, serviceKey, billingPeriodStart)); the other gets a
 * Prisma P2002 we translate to {status: 'already_redeemed'}.
 *
 * Optimistic concurrency (`version`) is forward-compat scaffolding: the
 * column is reserved for future mutable attributes (notes, photo, vet sig)
 * where readers + writers can race on the same row. It is NOT consulted on
 * INSERT or DELETE today — the unique constraint + delete-by-pk fully
 * cover the current flows. The parameter is accepted so callers can pass
 * what they saw; the server returns the canonical version so they re-sync.
 *
 * ALL queries run through `withClinic(clinicId, tx)` so the RLS policy on
 * ServiceRedemption enforces that the memberId actually belongs to the
 * caller's clinic. A cross-tenant memberId returns {status: 'not_found'}
 * because the policy filters it out at SELECT time.
 */

import { Prisma } from '@prisma/client';
import { withClinic } from '@/lib/tenant';
import type { ServiceKey } from '@/lib/pricing/types';

export interface RedemptionRow {
  id: string;
  memberId: string;
  serviceKey: string;
  billingPeriodStart: Date;
  redeemedAt: Date;
  redeemedByUserId: string | null;
  version: number;
}

export type ToggleRedemptionResult =
  | { status: 'on'; row: RedemptionRow }
  | { status: 'off'; deletedId: string }
  | { status: 'not_found' }
  | { status: 'already_redeemed'; row: RedemptionRow }
  | { status: 'version_conflict'; currentRow: RedemptionRow };

export interface ToggleRedemptionInput {
  clinicId: string;
  memberId: string;
  serviceKey: ServiceKey | string;
  billingPeriodStart: Date;
  /** Better-Auth user id of the staffer clicking the checkbox. */
  userId: string;
  /** Desired post-toggle state. UI passes `!currentlyRedeemed`. */
  desiredState: 'on' | 'off';
  /** For future mutable-attribute updates (not used today). */
  expectedVersion?: number;
}

function normalizeBillingPeriodStart(d: Date): Date {
  // Normalize to exact millisecond precision the DB stores, so the unique
  // key lookup is stable across JS Date construction paths.
  return new Date(d.getTime());
}

export async function toggleRedemption(
  input: ToggleRedemptionInput,
): Promise<ToggleRedemptionResult> {
  const { clinicId, memberId, serviceKey, userId, desiredState } = input;
  const billingPeriodStart = normalizeBillingPeriodStart(input.billingPeriodStart);

  return withClinic(clinicId, async (tx) => {
    // Member existence + tenant ownership via RLS — a cross-tenant member
    // simply returns null.
    const member = await tx.member.findUnique({
      where: { id: memberId },
      select: { id: true },
    });
    if (!member) return { status: 'not_found' };

    // Read current state.
    const existing = await tx.serviceRedemption.findUnique({
      where: {
        memberId_serviceKey_billingPeriodStart: {
          memberId,
          serviceKey: String(serviceKey),
          billingPeriodStart,
        },
      },
    });

    if (desiredState === 'on') {
      if (existing) {
        // Idempotent: already redeemed. Return the row so the UI can
        // reconcile (show who/when) without a second round trip.
        return { status: 'already_redeemed', row: toRow(existing) };
      }
      try {
        const created = await tx.serviceRedemption.create({
          data: {
            memberId,
            serviceKey: String(serviceKey),
            billingPeriodStart,
            redeemedByUserId: userId,
          },
        });
        return { status: 'on', row: toRow(created) };
      } catch (err) {
        // Race condition: another request inserted the same triple
        // between our findUnique and create. The unique index fired.
        if (
          err instanceof Prisma.PrismaClientKnownRequestError &&
          err.code === 'P2002'
        ) {
          const now = await tx.serviceRedemption.findUnique({
            where: {
              memberId_serviceKey_billingPeriodStart: {
                memberId,
                serviceKey: String(serviceKey),
                billingPeriodStart,
              },
            },
          });
          if (now) return { status: 'already_redeemed', row: toRow(now) };
        }
        throw err;
      }
    }

    // desiredState === 'off'
    if (!existing) {
      // Already absent — idempotent no-op.
      return { status: 'off', deletedId: '' };
    }

    // Optimistic lock hook — only enforced if caller provided a version AND
    // it mismatches. Today this is a no-op in practice (version stays 0),
    // but the plumbing is tested so future mutable-attribute flows can
    // start using it without another migration.
    if (
      typeof input.expectedVersion === 'number' &&
      input.expectedVersion !== existing.version
    ) {
      return { status: 'version_conflict', currentRow: toRow(existing) };
    }

    await tx.serviceRedemption.delete({ where: { id: existing.id } });
    return { status: 'off', deletedId: existing.id };
  });
}

/**
 * List every redemption row for one member within the given billing period.
 * UI consumer: renders a row's services-remaining panel. The caller computes
 * "remaining" as (tier.includedServices.length − rows.length).
 */
export async function listRedemptionsForMember(params: {
  clinicId: string;
  memberId: string;
  billingPeriodStart: Date;
}): Promise<RedemptionRow[]> {
  const { clinicId, memberId } = params;
  const billingPeriodStart = normalizeBillingPeriodStart(params.billingPeriodStart);
  return withClinic(clinicId, async (tx) => {
    const rows = await tx.serviceRedemption.findMany({
      where: { memberId, billingPeriodStart },
      orderBy: { redeemedAt: 'asc' },
    });
    return rows.map(toRow);
  });
}

function toRow(r: {
  id: string;
  memberId: string;
  serviceKey: string;
  billingPeriodStart: Date;
  redeemedAt: Date;
  redeemedByUserId: string | null;
  version: number;
}): RedemptionRow {
  return {
    id: r.id,
    memberId: r.memberId,
    serviceKey: r.serviceKey,
    billingPeriodStart: r.billingPeriodStart,
    redeemedAt: r.redeemedAt,
    redeemedByUserId: r.redeemedByUserId,
    version: r.version,
  };
}
