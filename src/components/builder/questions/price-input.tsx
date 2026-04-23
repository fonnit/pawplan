'use client';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

/**
 * Reusable $-prefix money input for annual exam, dental cleaning, core
 * vaccine, heartworm, flea/tick prices (BLDR-01).
 */
export function PriceInputQuestion({
  label,
  helper,
  value,
  max = 2000,
  onChange,
}: {
  label: string;
  helper?: string;
  value: number;
  max?: number;
  onChange: (next: number) => void;
}) {
  return (
    <div className="rounded-lg border bg-card p-6">
      <Label className="text-sm font-semibold">{label}</Label>
      {helper ? <p className="mt-1 text-xs text-muted-foreground">{helper}</p> : null}
      <div className="mt-4 flex h-10 items-center overflow-hidden rounded-md border border-input bg-background focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/50">
        <span className="pl-3 text-sm text-muted-foreground">$</span>
        <input
          type="number"
          inputMode="decimal"
          min={0}
          max={max}
          step={0.01}
          value={Number.isFinite(value) ? value : 0}
          onChange={(e) => {
            const next = Number.parseFloat(e.target.value);
            onChange(Number.isFinite(next) ? next : 0);
          }}
          className="h-full w-full border-0 bg-transparent px-2 font-mono text-sm tabular-nums outline-none"
        />
      </div>
    </div>
  );
}
