'use client';

import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import type { TierCount } from '@/lib/pricing/types';

export function TierCountQuestion({
  value,
  onChange,
}: {
  value: TierCount;
  onChange: (next: TierCount) => void;
}) {
  return (
    <div className="rounded-lg border bg-card p-6">
      <Label className="text-sm font-semibold">Tier count</Label>
      <p className="mt-1 text-xs text-muted-foreground">
        How many plan tiers pet owners can choose between. 3 is the default and maps to
        Preventive / Preventive Plus / Complete.
      </p>
      <RadioGroup
        className="mt-4 grid grid-cols-2 gap-2"
        value={String(value)}
        onValueChange={(v) => onChange(Number(v) === 2 ? 2 : 3)}
      >
        {[3, 2].map((tiers) => (
          <label
            key={tiers}
            className="flex cursor-pointer items-center gap-2 rounded-md border border-input px-3 py-2 text-sm has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-muted"
          >
            <RadioGroupItem value={String(tiers)} id={`tiers-${tiers}`} />
            <span>{tiers} tiers</span>
          </label>
        ))}
      </RadioGroup>
    </div>
  );
}
