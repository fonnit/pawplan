'use client';

import { Slider } from '@/components/ui/slider';
import { Label } from '@/components/ui/label';

export function MemberDiscountQuestion({
  value,
  onChange,
}: {
  value: number;
  onChange: (next: number) => void;
}) {
  return (
    <div className="rounded-lg border bg-card p-6">
      <div className="flex items-center justify-between">
        <Label className="text-sm font-semibold">Member discount</Label>
        <span className="font-mono text-sm tabular-nums">{value}%</span>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        Percentage off retail price members receive for the bundled services.
      </p>
      <Slider
        className="mt-4"
        min={0}
        max={20}
        step={1}
        value={[value]}
        onValueChange={(values) => {
          const v = values[0];
          if (typeof v === 'number') onChange(v);
        }}
      />
    </div>
  );
}
