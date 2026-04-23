/**
 * Break-even math — MATH-01
 * PURE FUNCTION: zero I/O, zero async, zero time dependencies.
 * Called by: Plan 05 (client-side live preview), Phase 3 (server-side canonical Publish).
 * Constants locked per REQUIREMENTS.md: PLATFORM_FEE_PCT = 10.
 * Assumptions per CONTEXT.md Q3 + Q5.
 */

import type {
  BreakEvenResult,
  PlanBuilderInputs,
  ServiceKey,
  TierKey,
  TierLineItems,
  TierQuote,
  VaccineCadence,
} from './types';

export const PLATFORM_FEE_PCT = 10;
export const STRIPE_FEE_PCT = 2.9;
export const STRIPE_FEE_FIXED_CENTS = 30;
export const DEFAULT_OVERHEAD_USD = 500;

export const DEFAULT_TIER_SERVICES: Record<TierKey, ServiceKey[]> = {
  preventive: ['annual-exam', 'core-vaccines'],
  'preventive-plus': ['annual-exam', 'core-vaccines', 'dental-cleaning'],
  complete: [
    'annual-exam',
    'core-vaccines',
    'dental-cleaning',
    'heartworm-prevention',
    'flea-tick-prevention',
  ],
};

const TIER_ORDER_3: TierKey[] = ['preventive', 'preventive-plus', 'complete'];
const TIER_ORDER_2: TierKey[] = ['preventive', 'preventive-plus'];

const TIER_NAMES: Record<TierKey, string> = {
  preventive: 'Preventive',
  'preventive-plus': 'Preventive Plus',
  complete: 'Complete',
};

const round2 = (n: number): number => Math.round(n * 100) / 100;

function vaccineDosesPerYear(cadence: VaccineCadence): number {
  if (cadence === 'annual') return 1;
  if (cadence === 'every-2-years') return 0.5;
  return 1 / 3;
}

function servicePriceAnnualUsd(service: ServiceKey, inputs: PlanBuilderInputs): number {
  switch (service) {
    case 'annual-exam':
      return inputs.annualExamPriceUsd;
    case 'core-vaccines':
      return inputs.coreVaccinePriceUsd * vaccineDosesPerYear(inputs.vaccineCadence);
    case 'dental-cleaning':
      return inputs.dentalCleaningPriceUsd;
    case 'heartworm-prevention':
      return inputs.heartwormPreventionAnnualUsd;
    case 'flea-tick-prevention':
      return inputs.fleaTickPreventionAnnualUsd;
  }
}

function computeTier(
  tierKey: TierKey,
  inputs: PlanBuilderInputs,
  overheadUsd: number,
): TierQuote {
  const includedServices = DEFAULT_TIER_SERVICES[tierKey];
  const retailValueBundledUsd = round2(
    includedServices.reduce((sum, svc) => sum + servicePriceAnnualUsd(svc, inputs), 0),
  );
  const monthlyFeeUsd = round2(
    (retailValueBundledUsd * (1 - inputs.memberDiscountPct / 100)) / 12,
  );
  const stripeFeePerChargeUsd = round2(
    monthlyFeeUsd * (STRIPE_FEE_PCT / 100) + STRIPE_FEE_FIXED_CENTS / 100,
  );
  const platformFeePerChargeUsd = round2(monthlyFeeUsd * (PLATFORM_FEE_PCT / 100));
  const clinicGrossPerPetPerYearUsd = round2(
    (monthlyFeeUsd - stripeFeePerChargeUsd - platformFeePerChargeUsd) * 12,
  );
  const breakEvenMembers =
    overheadUsd === 0
      ? 0
      : clinicGrossPerPetPerYearUsd > 0
        ? Math.ceil((overheadUsd * 12) / clinicGrossPerPetPerYearUsd)
        : Number.POSITIVE_INFINITY;

  const lineItems: TierLineItems = {
    retailValueBundledUsd,
    monthlyFeeUsd,
    stripeFeePerChargeUsd,
    platformFeePerChargeUsd,
    clinicGrossPerPetPerYearUsd,
    breakEvenMembers,
  };

  return {
    tierKey,
    tierName: TIER_NAMES[tierKey],
    includedServices,
    lineItems,
  };
}

export function computeBreakEven(inputs: PlanBuilderInputs): BreakEvenResult {
  const overheadUsd = inputs.monthlyProgramOverheadUsd ?? DEFAULT_OVERHEAD_USD;
  const order = inputs.tierCount === 2 ? TIER_ORDER_2 : TIER_ORDER_3;
  const tiers = order.map((tierKey) => computeTier(tierKey, inputs, overheadUsd));
  return {
    tiers,
    assumptionsUsed: {
      platformFeePct: PLATFORM_FEE_PCT,
      stripeFeePct: STRIPE_FEE_PCT,
      stripeFeeFixedCents: STRIPE_FEE_FIXED_CENTS,
      monthlyProgramOverheadUsd: overheadUsd,
    },
  };
}
