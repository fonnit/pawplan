import { PlanBuilder } from '@/components/builder/plan-builder';
import { getActiveDraft } from '@/app/actions/plans';
import type { PlanBuilderInputs } from '@/lib/pricing/types';

const DEFAULT_INPUTS: PlanBuilderInputs = {
  speciesMix: { dog: 70, cat: 30 },
  annualExamPriceUsd: 75,
  dentalCleaningPriceUsd: 350,
  coreVaccinePriceUsd: 45,
  vaccineCadence: 'annual',
  heartwormPreventionAnnualUsd: 180,
  fleaTickPreventionAnnualUsd: 200,
  memberDiscountPct: 10,
  tierCount: 3,
  monthlyProgramOverheadUsd: 500,
};

export default async function NewPlanPage() {
  const draft = await getActiveDraft();
  return (
    <div>
      <h1 className="text-[20px] font-semibold leading-[1.3]">
        {draft ? 'Edit plan draft' : 'New wellness plan'}
      </h1>
      <div className="mt-8">
        <PlanBuilder
          initialInputs={draft?.builderInputs ?? DEFAULT_INPUTS}
          {...(draft?.planId ? { initialPlanId: draft.planId } : {})}
        />
      </div>
    </div>
  );
}
