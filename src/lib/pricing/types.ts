/**
 * Shared types for PawPlan break-even math (MATH-01).
 * Consumed by `computeBreakEven` (client builder + server Publish).
 */

export type Species = 'dog' | 'cat';
export type VaccineCadence = 'annual' | 'every-2-years' | 'every-3-years';
export type TierCount = 2 | 3;
export type TierKey = 'preventive' | 'preventive-plus' | 'complete';
export type ServiceKey =
  | 'annual-exam'
  | 'core-vaccines'
  | 'dental-cleaning'
  | 'heartworm-prevention'
  | 'flea-tick-prevention';

export interface PlanBuilderInputs {
  // 8 primary builder inputs (BLDR-01)
  speciesMix: { dog: number; cat: number };
  annualExamPriceUsd: number;
  dentalCleaningPriceUsd: number;
  coreVaccinePriceUsd: number;
  vaccineCadence: VaccineCadence;
  heartwormPreventionAnnualUsd: number;
  fleaTickPreventionAnnualUsd: number;
  memberDiscountPct: number;
  tierCount: TierCount;
  // Advanced (CONTEXT Q3) — collapsible in UI; defaults to $500/mo
  monthlyProgramOverheadUsd?: number;
}

export interface TierLineItems {
  retailValueBundledUsd: number;
  monthlyFeeUsd: number;
  stripeFeePerChargeUsd: number;
  platformFeePerChargeUsd: number;
  clinicGrossPerPetPerYearUsd: number;
  breakEvenMembers: number;
}

export interface TierQuote {
  tierKey: TierKey;
  tierName: string;
  includedServices: ServiceKey[];
  lineItems: TierLineItems;
}

export interface BreakEvenResult {
  tiers: TierQuote[];
  assumptionsUsed: {
    platformFeePct: number;
    stripeFeePct: number;
    stripeFeeFixedCents: number;
    monthlyProgramOverheadUsd: number;
  };
}
