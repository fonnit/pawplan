'use client';

import { Slider } from '@/components/ui/slider';
import { Label } from '@/components/ui/label';

/**
 * SpeciesMix question — two sliders whose values must sum to 100.
 * Moving one auto-adjusts the other (BLDR-01 "species mix").
 */
export function SpeciesMixQuestion({
  dog,
  cat,
  onChange,
}: {
  dog: number;
  cat: number;
  onChange: (next: { dog: number; cat: number }) => void;
}) {
  function handleDog(nextDog: number) {
    const clamped = Math.max(0, Math.min(100, Math.round(nextDog)));
    onChange({ dog: clamped, cat: 100 - clamped });
  }

  return (
    <div className="rounded-lg border bg-card p-6">
      <Label className="text-sm font-semibold">Species mix</Label>
      <p className="mt-1 text-xs text-muted-foreground">
        Rough split of the pets your plan will cover.
      </p>
      <div className="mt-4 space-y-4">
        <div>
          <div className="mb-2 flex items-center justify-between">
            <span className="text-sm">Dogs</span>
            <span className="font-mono text-sm tabular-nums">{dog}%</span>
          </div>
          <Slider
            min={0}
            max={100}
            step={1}
            value={[dog]}
            onValueChange={(values) => {
              const v = values[0];
              if (typeof v === 'number') handleDog(v);
            }}
          />
        </div>
        <div>
          <div className="mb-2 flex items-center justify-between">
            <span className="text-sm">Cats</span>
            <span className="font-mono text-sm tabular-nums">{cat}%</span>
          </div>
          <Slider min={0} max={100} step={1} value={[cat]} disabled />
        </div>
      </div>
    </div>
  );
}
