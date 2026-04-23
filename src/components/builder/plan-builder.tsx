'use client';

import { useMemo, useState, useTransition, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';
import { computeBreakEven } from '@/lib/pricing/breakEven';
import type { PlanBuilderInputs, VaccineCadence, TierCount } from '@/lib/pricing/types';
import { saveDraftPlan } from '@/app/actions/plans';
import { SpeciesMixQuestion } from './questions/species-mix';
import { PriceInputQuestion } from './questions/price-input';
import { VaccineCadenceQuestion } from './questions/vaccine-cadence';
import { PreventionInclusionQuestion } from './questions/prevention-inclusion';
import { MemberDiscountQuestion } from './questions/member-discount';
import { TierCountQuestion } from './questions/tier-count';
import { AdvancedOverheadQuestion } from './questions/advanced-overhead';
import { BreakEvenPanel } from './break-even-panel';

type SaveState =
  | { kind: 'idle' }
  | { kind: 'saving' }
  | { kind: 'saved'; at: Date }
  | { kind: 'error'; message: string };

export function PlanBuilder({
  initialInputs,
  initialPlanId,
}: {
  initialInputs: PlanBuilderInputs;
  initialPlanId?: string;
}) {
  const [inputs, setInputs] = useState<PlanBuilderInputs>(initialInputs);
  const [planId, setPlanId] = useState<string | undefined>(initialPlanId);
  const [saveState, setSaveState] = useState<SaveState>({ kind: 'idle' });
  const [isPending, startTransition] = useTransition();
  const dirtyRef = useRef(false);

  // Live break-even recompute (BLDR-03). Pure function — zero I/O.
  const result = useMemo(() => computeBreakEven(inputs), [inputs]);

  function patch(next: Partial<PlanBuilderInputs>) {
    dirtyRef.current = true;
    setInputs((prev) => ({ ...prev, ...next }));
  }

  function save() {
    startTransition(async () => {
      setSaveState({ kind: 'saving' });
      const res = await saveDraftPlan({ planId, builderInputs: inputs });
      if (res.ok) {
        setPlanId(res.planId);
        setSaveState({ kind: 'saved', at: res.updatedAt });
        dirtyRef.current = false;
      } else {
        setSaveState({ kind: 'error', message: res.error });
      }
    });
  }

  // Autosave every 30s if dirty (UI-SPEC line 172). Skipped when there are
  // no unsaved changes — avoids Postgres churn on an idle builder.
  useEffect(() => {
    const id = setInterval(() => {
      if (dirtyRef.current && !isPending) save();
    }, 30_000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPending]);

  return (
    <div className="flex flex-col gap-8 lg:flex-row">
      <div className="flex-1 space-y-6 lg:w-3/5">
        <SpeciesMixQuestion
          dog={inputs.speciesMix.dog}
          cat={inputs.speciesMix.cat}
          onChange={(speciesMix) => patch({ speciesMix })}
        />
        <PriceInputQuestion
          label="Annual exam price"
          helper="Your walk-in retail price for a standard annual exam."
          value={inputs.annualExamPriceUsd}
          max={1000}
          onChange={(annualExamPriceUsd) => patch({ annualExamPriceUsd })}
        />
        <PriceInputQuestion
          label="Dental cleaning price"
          helper="Retail price for a routine dental prophylaxis (non-surgical)."
          value={inputs.dentalCleaningPriceUsd}
          max={2000}
          onChange={(dentalCleaningPriceUsd) => patch({ dentalCleaningPriceUsd })}
        />
        <PriceInputQuestion
          label="Core vaccine price"
          helper="Retail price for one round of core vaccines."
          value={inputs.coreVaccinePriceUsd}
          max={500}
          onChange={(coreVaccinePriceUsd) => patch({ coreVaccinePriceUsd })}
        />
        <VaccineCadenceQuestion
          value={inputs.vaccineCadence}
          onChange={(vaccineCadence: VaccineCadence) => patch({ vaccineCadence })}
        />
        <PreventionInclusionQuestion
          heartworm={inputs.heartwormPreventionAnnualUsd}
          fleaTick={inputs.fleaTickPreventionAnnualUsd}
          onChange={({ heartworm, fleaTick }) =>
            patch({
              heartwormPreventionAnnualUsd: heartworm,
              fleaTickPreventionAnnualUsd: fleaTick,
            })
          }
        />
        <MemberDiscountQuestion
          value={inputs.memberDiscountPct}
          onChange={(memberDiscountPct) => patch({ memberDiscountPct })}
        />
        <TierCountQuestion
          value={inputs.tierCount}
          onChange={(tierCount: TierCount) => patch({ tierCount })}
        />
        <AdvancedOverheadQuestion
          value={inputs.monthlyProgramOverheadUsd ?? 500}
          onChange={(monthlyProgramOverheadUsd) => patch({ monthlyProgramOverheadUsd })}
        />

        <div className="sticky bottom-0 -mx-6 border-t bg-card px-6 py-4">
          <Button onClick={save} disabled={isPending} className="h-10 w-full">
            {saveState.kind === 'saving' ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Saving…
              </>
            ) : (
              'Save draft'
            )}
          </Button>
          <p className="mt-2 text-center text-xs text-muted-foreground">
            {saveState.kind === 'saved'
              ? `Autosaves every 30s · Last saved ${formatRelative(saveState.at)}`
              : saveState.kind === 'error'
                ? `Couldn't save. Check your connection.`
                : 'Autosaves every 30s'}
          </p>
        </div>
      </div>

      <div className="lg:w-2/5">
        <BreakEvenPanel result={result} />
      </div>
    </div>
  );
}

function formatRelative(at: Date): string {
  const diffSec = Math.max(0, Math.floor((Date.now() - at.getTime()) / 1000));
  if (diffSec < 10) return 'just now';
  if (diffSec < 60) return `${diffSec}s ago`;
  const minutes = Math.floor(diffSec / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return at.toLocaleString();
}
