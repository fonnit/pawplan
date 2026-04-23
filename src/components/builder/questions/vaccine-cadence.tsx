'use client';

import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import type { VaccineCadence } from '@/lib/pricing/types';

const OPTIONS: Array<{ value: VaccineCadence; label: string }> = [
  { value: 'annual', label: 'Annual' },
  { value: 'every-2-years', label: 'Every 2 years' },
  { value: 'every-3-years', label: 'Every 3 years' },
];

export function VaccineCadenceQuestion({
  value,
  onChange,
}: {
  value: VaccineCadence;
  onChange: (next: VaccineCadence) => void;
}) {
  return (
    <div className="rounded-lg border bg-card p-6">
      <Label className="text-sm font-semibold">Core vaccine cadence</Label>
      <p className="mt-1 text-xs text-muted-foreground">
        How often your plan assumes a full core-vaccine round.
      </p>
      <RadioGroup
        className="mt-4 grid gap-2"
        value={value}
        onValueChange={(v) => onChange(v as VaccineCadence)}
      >
        {OPTIONS.map((opt) => (
          <label
            key={opt.value}
            className="flex cursor-pointer items-center gap-2 rounded-md border border-input px-3 py-2 text-sm has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-muted"
          >
            <RadioGroupItem value={opt.value} id={`cadence-${opt.value}`} />
            <span>{opt.label}</span>
          </label>
        ))}
      </RadioGroup>
    </div>
  );
}
