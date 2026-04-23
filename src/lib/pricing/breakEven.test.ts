import { describe, it, expect } from 'vitest';
import {
  computeBreakEven,
  DEFAULT_TIER_SERVICES,
  DEFAULT_OVERHEAD_USD,
  PLATFORM_FEE_PCT,
  STRIPE_FEE_PCT,
  STRIPE_FEE_FIXED_CENTS,
} from './breakEven';
import type { PlanBuilderInputs } from './types';

/**
 * 15-scenario suite for MATH-01. Every expected value is hand-computed using:
 *   monthly = round2(retail*(1-disc/100)/12)
 *   stripe  = round2(monthly*0.029 + 0.30)
 *   plat    = round2(monthly*0.10)
 *   gross   = round2((monthly - stripe - plat)*12)
 *   beMem   = ceil(overhead*12/gross); 0 if overhead=0; Infinity if gross<=0
 */

const baseline = (overrides: Partial<PlanBuilderInputs> = {}): PlanBuilderInputs => ({
  speciesMix: { dog: 50, cat: 50 },
  annualExamPriceUsd: 75,
  dentalCleaningPriceUsd: 350,
  coreVaccinePriceUsd: 45,
  vaccineCadence: 'annual',
  heartwormPreventionAnnualUsd: 180,
  fleaTickPreventionAnnualUsd: 200,
  memberDiscountPct: 0,
  tierCount: 3,
  monthlyProgramOverheadUsd: 500,
  ...overrides,
});

describe('computeBreakEven — MATH-01', () => {
  it('scenario 1 — baseline 3 tiers, 0% discount, annual vaccines', () => {
    // Preventive retail 120 / monthly 10 / stripe 0.59 / plat 1.00 / gross 100.92 / be 60
    // Prev+    retail 470 / monthly 39.17 / stripe 1.44 / plat 3.92 / gross 405.72 / be 15
    // Complete retail 850 / monthly 70.83 / stripe 2.35 / plat 7.08 / gross 736.80 / be 9
    const r = computeBreakEven(baseline());
    expect(r.tiers).toHaveLength(3);
    const [p, pp, c] = r.tiers;
    expect(p!.tierKey).toBe('preventive');
    expect(p!.lineItems.retailValueBundledUsd).toBeCloseTo(120, 2);
    expect(p!.lineItems.monthlyFeeUsd).toBeCloseTo(10.0, 2);
    expect(p!.lineItems.stripeFeePerChargeUsd).toBeCloseTo(0.59, 2);
    expect(p!.lineItems.platformFeePerChargeUsd).toBeCloseTo(1.0, 2);
    expect(p!.lineItems.clinicGrossPerPetPerYearUsd).toBeCloseTo(100.92, 2);
    expect(p!.lineItems.breakEvenMembers).toBe(60);

    expect(pp!.tierKey).toBe('preventive-plus');
    expect(pp!.lineItems.retailValueBundledUsd).toBeCloseTo(470, 2);
    expect(pp!.lineItems.monthlyFeeUsd).toBeCloseTo(39.17, 2);
    expect(pp!.lineItems.stripeFeePerChargeUsd).toBeCloseTo(1.44, 2);
    expect(pp!.lineItems.platformFeePerChargeUsd).toBeCloseTo(3.92, 2);
    expect(pp!.lineItems.clinicGrossPerPetPerYearUsd).toBeCloseTo(405.72, 2);
    expect(pp!.lineItems.breakEvenMembers).toBe(15);

    expect(c!.tierKey).toBe('complete');
    expect(c!.lineItems.retailValueBundledUsd).toBeCloseTo(850, 2);
    expect(c!.lineItems.monthlyFeeUsd).toBeCloseTo(70.83, 2);
    expect(c!.lineItems.stripeFeePerChargeUsd).toBeCloseTo(2.35, 2);
    expect(c!.lineItems.platformFeePerChargeUsd).toBeCloseTo(7.08, 2);
    expect(c!.lineItems.clinicGrossPerPetPerYearUsd).toBeCloseTo(736.8, 2);
    expect(c!.lineItems.breakEvenMembers).toBe(9);
  });

  it('scenario 2 — 20% discount, 3 tiers, annual vaccines', () => {
    // Prev  retail 120 / monthly 8.00 / stripe 0.53 / plat 0.80 / gross 80.04 / be 75
    // Prev+ retail 470 / monthly 31.33 / stripe 1.21 / plat 3.13 / gross 323.88 / be 19
    // Comp  retail 850 / monthly 56.67 / stripe 1.94 / plat 5.67 / gross 588.72 / be 11
    const r = computeBreakEven(baseline({ memberDiscountPct: 20 }));
    const [p, pp, c] = r.tiers;
    expect(p!.lineItems.monthlyFeeUsd).toBeCloseTo(8.0, 2);
    expect(p!.lineItems.breakEvenMembers).toBe(75);
    expect(pp!.lineItems.monthlyFeeUsd).toBeCloseTo(31.33, 2);
    expect(pp!.lineItems.breakEvenMembers).toBe(19);
    expect(c!.lineItems.monthlyFeeUsd).toBeCloseTo(56.67, 2);
    expect(c!.lineItems.breakEvenMembers).toBe(11);
  });

  it('scenario 3 — 2 tiers returns Preventive + Preventive Plus only', () => {
    const r = computeBreakEven(baseline({ tierCount: 2 }));
    expect(r.tiers).toHaveLength(2);
    expect(r.tiers[0]!.tierKey).toBe('preventive');
    expect(r.tiers[1]!.tierKey).toBe('preventive-plus');
  });

  it('scenario 4 — every-2-years vaccine cadence', () => {
    // coreVaccinesAnnual = 45*0.5 = 22.5
    // Prev retail = 75 + 22.5 = 97.5 ; monthly = round2(97.5/12) = 8.13
    // stripe = round2(8.13*0.029 + 0.30) = 0.54 ; plat = 0.81
    // gross = round2((8.13 - 0.54 - 0.81)*12) = round2(81.36) = 81.36
    // be = ceil(6000/81.36) = 74
    const r = computeBreakEven(baseline({ vaccineCadence: 'every-2-years' }));
    const p = r.tiers[0]!;
    expect(p.lineItems.retailValueBundledUsd).toBeCloseTo(97.5, 2);
    expect(p.lineItems.monthlyFeeUsd).toBeCloseTo(8.13, 2);
    expect(p.lineItems.breakEvenMembers).toBe(74);
  });

  it('scenario 5 — every-3-years vaccine cadence', () => {
    // coreVaccinesAnnual = 45*(1/3) = 15 ; Prev retail = 90
    // monthly = 7.50 ; stripe = 0.52 ; plat = 0.75
    // gross = round2((7.5 - 0.52 - 0.75)*12) = round2(74.76) = 74.76
    // be = ceil(6000/74.76) = 81
    const r = computeBreakEven(baseline({ vaccineCadence: 'every-3-years' }));
    const p = r.tiers[0]!;
    expect(p.lineItems.retailValueBundledUsd).toBeCloseTo(90.0, 2);
    expect(p.lineItems.monthlyFeeUsd).toBeCloseTo(7.5, 2);
    expect(p.lineItems.breakEvenMembers).toBe(81);
  });

  it('scenario 6 — 0% discount, low prices', () => {
    // exam 50, dental 200, vaccine 30 ; Prev retail = 50 + 30 = 80
    // monthly = round2(80/12) = 6.67 ; stripe = round2(6.67*0.029+0.30) = round2(0.49343) = 0.49
    // plat = 0.67 ; gross = round2((6.67 - 0.49 - 0.67)*12) = round2(66.12) = 66.12
    // be = ceil(6000/66.12) = 91
    const r = computeBreakEven(
      baseline({
        annualExamPriceUsd: 50,
        dentalCleaningPriceUsd: 200,
        coreVaccinePriceUsd: 30,
      }),
    );
    const p = r.tiers[0]!;
    expect(p.lineItems.retailValueBundledUsd).toBeCloseTo(80.0, 2);
    expect(p.lineItems.monthlyFeeUsd).toBeCloseTo(6.67, 2);
    expect(p.lineItems.breakEvenMembers).toBe(91);
  });

  it('scenario 7 — 20% discount, high prices', () => {
    // exam 120, dental 500, vaccine 60 ; Prev retail = 120 + 60 = 180
    // monthly = round2(180*0.8/12) = round2(12.00) = 12.00
    // stripe = round2(12*0.029+0.30) = round2(0.648) = 0.65
    // plat = 1.20 ; gross = round2((12 - 0.65 - 1.20)*12) = round2(121.80) = 121.80
    // be = ceil(6000/121.80) = 50
    const r = computeBreakEven(
      baseline({
        annualExamPriceUsd: 120,
        dentalCleaningPriceUsd: 500,
        coreVaccinePriceUsd: 60,
        memberDiscountPct: 20,
      }),
    );
    const p = r.tiers[0]!;
    expect(p.lineItems.retailValueBundledUsd).toBeCloseTo(180.0, 2);
    expect(p.lineItems.monthlyFeeUsd).toBeCloseTo(12.0, 2);
    expect(p.lineItems.breakEvenMembers).toBe(50);
  });

  it('scenario 8 — dog-only species mix produces identical math to baseline', () => {
    // Species mix is metadata-only in v1 (doesn't affect math).
    const base = computeBreakEven(baseline());
    const dogOnly = computeBreakEven(baseline({ speciesMix: { dog: 100, cat: 0 } }));
    expect(dogOnly.tiers[0]!.lineItems).toEqual(base.tiers[0]!.lineItems);
  });

  it('scenario 9 — cat-only species mix produces identical math to baseline', () => {
    const base = computeBreakEven(baseline());
    const catOnly = computeBreakEven(baseline({ speciesMix: { dog: 0, cat: 100 } }));
    expect(catOnly.tiers[0]!.lineItems).toEqual(base.tiers[0]!.lineItems);
  });

  it('scenario 10 — monthlyProgramOverheadUsd=$1000 doubles the break-even count', () => {
    // Prev gross 100.92 ; be = ceil(12000/100.92) = 119
    const r = computeBreakEven(baseline({ monthlyProgramOverheadUsd: 1000 }));
    expect(r.tiers[0]!.lineItems.breakEvenMembers).toBe(119);
  });

  it('scenario 11 — monthlyProgramOverheadUsd=$0 means break-even count is 0', () => {
    const r = computeBreakEven(baseline({ monthlyProgramOverheadUsd: 0 }));
    for (const tier of r.tiers) {
      expect(tier.lineItems.breakEvenMembers).toBe(0);
    }
  });

  it('scenario 12 — discount boundary 0%: monthlyFee equals retail/12 (rounded)', () => {
    const r = computeBreakEven(baseline({ memberDiscountPct: 0 }));
    const p = r.tiers[0]!;
    expect(p.lineItems.monthlyFeeUsd).toBeCloseTo(120 / 12, 2);
  });

  it('scenario 13 — discount boundary 20%: monthlyFee equals retail*0.8/12 (rounded)', () => {
    const r = computeBreakEven(baseline({ memberDiscountPct: 20 }));
    const p = r.tiers[0]!;
    expect(p.lineItems.monthlyFeeUsd).toBeCloseTo((120 * 0.8) / 12, 2);
  });

  it('scenario 14 — default tier services matrix matches CONTEXT Q5', () => {
    const r = computeBreakEven(baseline());
    expect(r.tiers[0]!.includedServices).toEqual(DEFAULT_TIER_SERVICES.preventive);
    expect(r.tiers[1]!.includedServices).toEqual(DEFAULT_TIER_SERVICES['preventive-plus']);
    expect(r.tiers[2]!.includedServices).toEqual(DEFAULT_TIER_SERVICES.complete);
  });

  it('scenario 15 — result.assumptionsUsed reports locked constants', () => {
    const r = computeBreakEven(baseline());
    expect(r.assumptionsUsed.platformFeePct).toBe(10);
    expect(r.assumptionsUsed.stripeFeePct).toBe(2.9);
    expect(r.assumptionsUsed.stripeFeeFixedCents).toBe(30);
    expect(r.assumptionsUsed.monthlyProgramOverheadUsd).toBe(500);
    // When monthlyProgramOverheadUsd is omitted, the default kicks in.
    const r2 = computeBreakEven({ ...baseline(), monthlyProgramOverheadUsd: undefined });
    expect(r2.assumptionsUsed.monthlyProgramOverheadUsd).toBe(DEFAULT_OVERHEAD_USD);
  });

  it('is deterministic across calls', () => {
    const r1 = computeBreakEven(baseline());
    const r2 = computeBreakEven(baseline());
    const r3 = computeBreakEven(baseline());
    expect(r1).toEqual(r2);
    expect(r2).toEqual(r3);
  });

  it('exports locked constants', () => {
    expect(PLATFORM_FEE_PCT).toBe(10);
    expect(STRIPE_FEE_PCT).toBe(2.9);
    expect(STRIPE_FEE_FIXED_CENTS).toBe(30);
    expect(DEFAULT_OVERHEAD_USD).toBe(500);
  });
});
