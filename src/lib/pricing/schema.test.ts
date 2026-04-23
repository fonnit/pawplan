import { describe, it, expect } from 'vitest';
import { PlanBuilderInputsSchema } from './schema';

/**
 * Server-side PlanBuilderInputsSchema must reject tampered client payloads
 * (T-01-05-01). These tests are the failure-closed guard that runs inside
 * saveDraftPlan before anything touches Postgres.
 */
describe('PlanBuilderInputsSchema', () => {
  const VALID = {
    speciesMix: { dog: 70, cat: 30 },
    annualExamPriceUsd: 75,
    dentalCleaningPriceUsd: 350,
    coreVaccinePriceUsd: 45,
    vaccineCadence: 'annual' as const,
    heartwormPreventionAnnualUsd: 180,
    fleaTickPreventionAnnualUsd: 200,
    memberDiscountPct: 10,
    tierCount: 3 as const,
    monthlyProgramOverheadUsd: 500,
  };

  it('accepts a full default payload', () => {
    const result = PlanBuilderInputsSchema.safeParse(VALID);
    expect(result.success).toBe(true);
  });

  it('accepts payload without optional monthlyProgramOverheadUsd', () => {
    const { monthlyProgramOverheadUsd: _omit, ...without } = VALID;
    const result = PlanBuilderInputsSchema.safeParse(without);
    expect(result.success).toBe(true);
  });

  it('rejects memberDiscountPct > 20 (BLDR-01 upper bound)', () => {
    const result = PlanBuilderInputsSchema.safeParse({ ...VALID, memberDiscountPct: 21 });
    expect(result.success).toBe(false);
  });

  it('rejects speciesMix that does not sum to 100', () => {
    const result = PlanBuilderInputsSchema.safeParse({
      ...VALID,
      speciesMix: { dog: 50, cat: 49 },
    });
    expect(result.success).toBe(false);
  });

  it('rejects tierCount other than 2 or 3 (BLDR-02)', () => {
    const result = PlanBuilderInputsSchema.safeParse({ ...VALID, tierCount: 4 });
    expect(result.success).toBe(false);
  });

  it('rejects non-enum vaccineCadence', () => {
    const result = PlanBuilderInputsSchema.safeParse({
      ...VALID,
      vaccineCadence: 'daily',
    });
    expect(result.success).toBe(false);
  });

  it('rejects negative prices', () => {
    const result = PlanBuilderInputsSchema.safeParse({ ...VALID, annualExamPriceUsd: -1 });
    expect(result.success).toBe(false);
  });
});
