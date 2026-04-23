'use client';

import type { BreakEvenResult, TierQuote } from '@/lib/pricing/types';
import { BreakEvenLineItems } from '@/app/(dashboard)/dashboard/plans/_components/break-even-line-items';

/**
 * Break-even preview — sticky right pane that re-renders on every builder
 * input change (BLDR-03 / MATH-02).
 *
 * Phase 3 refactor: line-item rows now render through the shared
 * `BreakEvenLineItems` component so the builder live preview and the
 * published-plan dashboard panel produce identical output (MATH-04 / MATH-05).
 * The builder owns tier-name + monthly-fee headers; the shared component owns
 * the six-row breakdown.
 *
 * computeBreakEven returns USD floats; we convert to cents with
 * Math.round(usd * 100) at the boundary. Keeps everything downstream in cents.
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
          <TierBlock key={tier.tierKey} tier={tier} withSeparator={idx > 0} />
        ))}
      </div>
    </aside>
  );
}

const usdToCents = (usd: number): number =>
  Number.isFinite(usd) ? Math.round(usd * 100) : 0;

function TierBlock({ tier, withSeparator }: { tier: TierQuote; withSeparator: boolean }) {
  const li = tier.lineItems;
  // Infinity break-even (monthly fee too low) → 0 sentinel, matching how the
  // updatePlanPrices DB write coerces. BreakEvenLineItems maps 0 → "Monthly
  // fee too low".
  const breakEven = Number.isFinite(li.breakEvenMembers) ? li.breakEvenMembers : 0;

  return (
    <div className={withSeparator ? 'border-t pt-6' : ''}>
      <div className="flex items-baseline justify-between">
        <h3 className="text-sm font-semibold">{tier.tierName}</h3>
        <span className="font-mono text-[20px] font-semibold tabular-nums">
          ${li.monthlyFeeUsd.toFixed(2)}/mo
        </span>
      </div>
      <div className="mt-3">
        <BreakEvenLineItems
          retailValueBundledCents={usdToCents(li.retailValueBundledUsd)}
          monthlyFeeCents={usdToCents(li.monthlyFeeUsd)}
          stripeFeePerChargeCents={usdToCents(li.stripeFeePerChargeUsd)}
          platformFeePerChargeCents={usdToCents(li.platformFeePerChargeUsd)}
          clinicGrossPerPetPerYearCents={usdToCents(li.clinicGrossPerPetPerYearUsd)}
          breakEvenMembers={breakEven}
        />
      </div>
    </div>
  );
}
