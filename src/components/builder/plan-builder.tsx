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
  // ME-04: Track in-flight save at commit time (not via useTransition's
  // isPending, which flips to false on render batch, not on network
  // resolution). Guards against clobbering updates when manual save + 30s
  // autosave overlap.
  const savingRef = useRef(false);
  const autosaveTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Live break-even recompute (BLDR-03). Pure function — zero I/O.
  const result = useMemo(() => computeBreakEven(inputs), [inputs]);

  function patch(next: Partial<PlanBuilderInputs>) {
    dirtyRef.current = true;
    setInputs((prev) => ({ ...prev, ...next }));
  }

  function save() {
    // ME-04: coalesce concurrent calls — a manual click mid-autosave (or
    // vice versa) must not fire a second request. The second call drops
    // silently; the in-flight save will pick up the latest `inputs`
    // closure on its next tick.
    if (savingRef.current) return;
    savingRef.current = true;
    startTransition(async () => {
      setSaveState({ kind: 'saving' });
      try {
        const res = await saveDraftPlan({ planId, builderInputs: inputs });
        if (res.ok) {
          setPlanId(res.planId);
          setSaveState({ kind: 'saved', at: res.updatedAt });
          dirtyRef.current = false;
        } else {
          setSaveState({ kind: 'error', message: res.error });
        }
      } finally {
        savingRef.current = false;
      }
    });
  }

  // ME-04: Manual save also resets the 30s autosave clock so we don't fire
  // a redundant autosave seconds after the user clicks Save.
  function manualSave() {
    if (autosaveTimerRef.current) {
      clearInterval(autosaveTimerRef.current);
      autosaveTimerRef.current = setInterval(autosaveTick, 30_000);
    }
    save();
  }

  function autosaveTick() {
    if (dirtyRef.current && !savingRef.current) save();
  }

  // Autosave every 30s if dirty (UI-SPEC line 172). Skipped when there are
  // no unsaved changes — avoids Postgres churn on an idle builder.
  useEffect(() => {
    autosaveTimerRef.current = setInterval(autosaveTick, 30_000);
    return () => {
      if (autosaveTimerRef.current) clearInterval(autosaveTimerRef.current);
      autosaveTimerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
          <Button onClick={manualSave} disabled={isPending} className="h-10 w-full">
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
