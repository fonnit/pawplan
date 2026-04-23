'use client';

/**
 * Advanced overhead — collapsible disclosure, NOT a 9th top-level question
 * (CONTEXT Q3). Default value is $500/mo when the field is omitted from the
 * builder-inputs payload.
 */
export function AdvancedOverheadQuestion({
  value,
  onChange,
}: {
  value: number;
  onChange: (next: number) => void;
}) {
  return (
    <details className="rounded-lg border bg-card p-6 [&_summary]:list-none" open={false}>
      <summary className="flex cursor-pointer items-center justify-between">
        <span>
          <span className="text-sm font-semibold">Advanced — program overhead</span>
          <p className="mt-1 text-xs text-muted-foreground">
            Estimated monthly overhead you need to recover. Defaults to $500/mo.
          </p>
        </span>
        <span aria-hidden className="text-xs text-muted-foreground">Show/hide</span>
      </summary>
      <div className="mt-4 flex h-10 items-center overflow-hidden rounded-md border border-input bg-background focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/50">
        <span className="pl-3 text-sm text-muted-foreground">$</span>
        <input
          type="number"
          inputMode="decimal"
          min={0}
          max={50000}
          step={10}
          value={Number.isFinite(value) ? value : 500}
          onChange={(e) => {
            const next = Number.parseFloat(e.target.value);
            onChange(Number.isFinite(next) ? next : 0);
          }}
          className="h-full w-full border-0 bg-transparent px-2 font-mono text-sm tabular-nums outline-none"
        />
        <span className="pr-3 text-sm text-muted-foreground">/mo</span>
      </div>
    </details>
  );
}
