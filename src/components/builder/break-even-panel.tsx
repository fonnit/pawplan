'use client';

import type { BreakEvenResult, TierQuote } from '@/lib/pricing/types';

/**
 * Break-even preview — sticky right pane that re-renders on every builder
 * input change (BLDR-03). All numbers in Geist Mono with tabular-nums so
 * columns align across tiers.
 */
export function BreakEvenPanel({ result }: { result: BreakEvenResult | null }) {
  if (!result || result.tiers.length === 0) {
    return (
      <aside className="sticky top-24 rounded-lg bg-muted p-6">
        <h2 className="text-[20px] font-semibold leading-[1.3]">Break-even math</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Updates as you type. Numbers already include Stripe fees and PawPlan&apos;s 10%
          platform fee.
        </p>
        <div className="mt-6 space-y-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-20 animate-pulse rounded-md bg-background/50" />
          ))}
          <p className="text-center text-sm text-muted-foreground">
            Fill in the builder to see your numbers.
          </p>
        </div>
      </aside>
    );
  }

  return (
    <aside className="sticky top-24 rounded-lg bg-muted p-6">
      <h2 className="text-[20px] font-semibold leading-[1.3]">Break-even math</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        Updates as you type. Numbers already include Stripe fees and PawPlan&apos;s 10%
        platform fee.
      </p>
      <div className="mt-6 space-y-6">
        {result.tiers.map((tier, idx) => (
          <TierCard key={tier.tierKey} tier={tier} withSeparator={idx > 0} />
        ))}
      </div>
    </aside>
  );
}

function TierCard({ tier, withSeparator }: { tier: TierQuote; withSeparator: boolean }) {
  const li = tier.lineItems;
  return (
    <div className={withSeparator ? 'border-t pt-6' : ''}>
      <div className="flex items-baseline justify-between">
        <h3 className="text-sm font-semibold">{tier.tierName}</h3>
        <span className="font-mono text-[20px] font-semibold tabular-nums">
          ${li.monthlyFeeUsd.toFixed(2)}/mo
        </span>
      </div>

      <dl className="mt-4 space-y-1 font-mono text-sm tabular-nums">
        <Row label="Retail value bundled" value={`$${li.retailValueBundledUsd.toFixed(2)}`} />
        <Row label="Monthly fee" value={`$${li.monthlyFeeUsd.toFixed(2)}`} />
        <Row
          label="Stripe processing estimate"
          value={`−$${li.stripeFeePerChargeUsd.toFixed(2)}`}
        />
        <Row
          label="PawPlan platform fee (10%)"
          value={`−$${li.platformFeePerChargeUsd.toFixed(2)}`}
        />
        <Row
          label="Clinic gross per pet per year"
          value={`$${li.clinicGrossPerPetPerYearUsd.toFixed(2)}`}
        />
      </dl>

      <div className="mt-4 flex items-baseline justify-between border-t pt-4">
        <span className="text-sm font-semibold">Members to break even</span>
        <span className="font-mono text-[20px] font-semibold tabular-nums text-primary">
          {Number.isFinite(li.breakEvenMembers) ? li.breakEvenMembers : '—'}
        </span>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <dt className="font-sans text-xs text-muted-foreground">{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}
