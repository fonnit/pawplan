import { unstable_cache } from 'next/cache';
import { cache } from 'react';
import { prisma } from '@/lib/db';
import type { AccentColor } from '@prisma/client';
import type {
  PublishedPlanSnapshot,
  PublishedPlanTierSnapshot,
} from '@/lib/stripe/types';

/**
 * Raw row shape from `v_public_clinic_plans`. One row per tier; a clinic with
 * a 3-tier plan returns 3 rows that we fold into one snapshot.
 *
 * Column names match the SQL view from plan 03-01 task 2.
 */
interface PublicViewRow {
  clinic_slug: string;
  clinic_practice_name: string;
  clinic_logo_url: string | null;
  clinic_accent_color: AccentColor;
  plan_id: string;
  plan_published_at: Date;
  plan_tier_count: number;
  tier_id: string;
  tier_key: string;
  tier_name: string;
  tier_included_services: string[];
  tier_retail_value_bundled_cents: number;
  tier_monthly_fee_cents: number;
  tier_stripe_fee_per_charge_cents: number;
  tier_platform_fee_per_charge_cents: number;
  tier_clinic_gross_per_pet_per_year_cents: number;
  tier_break_even_members: number;
  tier_stripe_price_id: string;
  tier_ordering: number;
}

/**
 * Fetch a published clinic's plan snapshot, or null.
 *
 * Caching strategy (PUB-06):
 *   - `unstable_cache` wraps the query with tag `clinic:{slug}`.
 *   - `publishPlan` (plan 03-02) and `updatePlanPrices` (plan 03-04) call
 *     `revalidateTag('clinic:' + slug, 'default')`.
 *   - `cache()` from React dedupes within a single request (loader may be
 *     called by page.tsx + generateMetadata on the same request).
 *   - A miss on an unknown slug is cached too — prevents slug enumeration
 *     from repeatedly hitting the DB.
 */
async function fetchFromView(slug: string): Promise<PublishedPlanSnapshot | null> {
  const rows = await prisma.$queryRaw<PublicViewRow[]>`
    SELECT *
    FROM v_public_clinic_plans
    WHERE clinic_slug = ${slug}
    ORDER BY tier_ordering ASC
  `;
  if (rows.length === 0) return null;

  const first = rows[0]!;
  const tiers: PublishedPlanTierSnapshot[] = rows.map((r) => ({
    tierId: r.tier_id,
    tierKey: r.tier_key as PublishedPlanTierSnapshot['tierKey'],
    tierName: r.tier_name,
    includedServices: r.tier_included_services,
    retailValueBundledCents: r.tier_retail_value_bundled_cents,
    monthlyFeeCents: r.tier_monthly_fee_cents,
    stripeFeePerChargeCents: r.tier_stripe_fee_per_charge_cents,
    platformFeePerChargeCents: r.tier_platform_fee_per_charge_cents,
    clinicGrossPerPetPerYearCents: r.tier_clinic_gross_per_pet_per_year_cents,
    breakEvenMembers: r.tier_break_even_members,
    // Product ID is intentionally not in the view (not needed on public surface).
    // The public page never reads stripeProductId; fill empty for type parity.
    stripeProductId: '',
    stripePriceId: r.tier_stripe_price_id,
    ordering: r.tier_ordering,
  }));

  return {
    clinicSlug: first.clinic_slug,
    clinicPracticeName: first.clinic_practice_name,
    clinicLogoUrl: first.clinic_logo_url,
    clinicAccentColor: first.clinic_accent_color,
    planId: first.plan_id,
    planPublishedAt: first.plan_published_at,
    tierCount: first.plan_tier_count as 2 | 3,
    tiers,
  };
}

/**
 * Public API. Always call this — never fetchFromView directly.
 *
 * `cache()` (React) dedupes within a single render pass.
 * `unstable_cache` (Next.js) dedupes across requests and participates in ISR.
 */
export const getPublishedPlan = cache(
  async (slug: string): Promise<PublishedPlanSnapshot | null> => {
    const loader = unstable_cache(
      async (s: string) => fetchFromView(s),
      ['public-clinic-plan', slug],
      { tags: [`clinic:${slug}`], revalidate: 300 },
    );
    return loader(slug);
  },
);
