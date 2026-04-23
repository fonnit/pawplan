'use client';

import { useRef } from 'react';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';

/**
 * Prevention-inclusion — two checkboxes that toggle heartworm + flea/tick
 * annual prices to 0 / previous value. Previous value is held in a ref so
 * unchecking + rechecking restores the last user-entered number instead of
 * re-defaulting to 0.
 *
 * BLDR-01 "heartworm + flea/tick inclusion".
 */
export function PreventionInclusionQuestion({
  heartworm,
  fleaTick,
  heartwormDefault = 180,
  fleaTickDefault = 200,
  onChange,
}: {
  heartworm: number;
  fleaTick: number;
  heartwormDefault?: number;
  fleaTickDefault?: number;
  onChange: (next: { heartworm: number; fleaTick: number }) => void;
}) {
  const lastHeartworm = useRef(heartworm || heartwormDefault);
  const lastFleaTick = useRef(fleaTick || fleaTickDefault);

  const heartwormOn = heartworm > 0;
  const fleaTickOn = fleaTick > 0;

  function toggleHeartworm(next: boolean) {
    if (next) {
      onChange({ heartworm: lastHeartworm.current || heartwormDefault, fleaTick });
    } else {
      lastHeartworm.current = heartworm || lastHeartworm.current;
      onChange({ heartworm: 0, fleaTick });
    }
  }

  function toggleFleaTick(next: boolean) {
    if (next) {
      onChange({ heartworm, fleaTick: lastFleaTick.current || fleaTickDefault });
    } else {
      lastFleaTick.current = fleaTick || lastFleaTick.current;
      onChange({ heartworm, fleaTick: 0 });
    }
  }

  return (
    <div className="rounded-lg border bg-card p-6">
      <Label className="text-sm font-semibold">Prevention inclusion</Label>
      <p className="mt-1 text-xs text-muted-foreground">
        Which prevention products are bundled into the plan. Uncheck to exclude.
      </p>
      <div className="mt-4 space-y-3">
        <label className="flex items-center gap-3 text-sm">
          <Checkbox
            checked={heartwormOn}
            onCheckedChange={(v) => toggleHeartworm(v === true)}
          />
          <span>Heartworm prevention</span>
          <span className="ml-auto font-mono text-xs tabular-nums text-muted-foreground">
            ${heartworm.toFixed(2)}/yr
          </span>
        </label>
        <label className="flex items-center gap-3 text-sm">
          <Checkbox
            checked={fleaTickOn}
            onCheckedChange={(v) => toggleFleaTick(v === true)}
          />
          <span>Flea/tick prevention</span>
          <span className="ml-auto font-mono text-xs tabular-nums text-muted-foreground">
            ${fleaTick.toFixed(2)}/yr
          </span>
        </label>
      </div>
    </div>
  );
}
