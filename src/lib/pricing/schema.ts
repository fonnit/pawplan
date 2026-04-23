import { z } from 'zod';

/**
 * Canonical PlanBuilderInputs validator — used by:
 *   - client-side react-hook-form resolver (live builder)
 *   - server-side safeParse guard in saveDraftPlan action (anti-tamper)
 *   - server-side safeParse when thawing stored JSON in getActiveDraft
 *
 * Numeric ranges match REQUIREMENTS.md BLDR-01/02 and CONTEXT Q3.
 * Species-mix refinement rejects totals that don't sum to 100.
 */
export const PlanBuilderInputsSchema = z
  .object({
    speciesMix: z
      .object({
        dog: z.number().int().min(0).max(100),
        cat: z.number().int().min(0).max(100),
      })
      .refine((v) => v.dog + v.cat === 100, {
        message: 'Dog + cat must total 100%',
      }),
    annualExamPriceUsd: z.number().min(0).max(1000),
    dentalCleaningPriceUsd: z.number().min(0).max(2000),
    coreVaccinePriceUsd: z.number().min(0).max(500),
    vaccineCadence: z.enum(['annual', 'every-2-years', 'every-3-years']),
    heartwormPreventionAnnualUsd: z.number().min(0).max(1000),
    fleaTickPreventionAnnualUsd: z.number().min(0).max(1000),
    memberDiscountPct: z.number().int().min(0).max(20),
    tierCount: z.union([z.literal(2), z.literal(3)]),
    monthlyProgramOverheadUsd: z.number().min(0).max(50000).optional(),
  });

export type PlanBuilderInputsValid = z.infer<typeof PlanBuilderInputsSchema>;
