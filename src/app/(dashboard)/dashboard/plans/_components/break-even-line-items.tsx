import type { ReactNode } from 'react';

/**
 * Phase 3 MATH-04 / MATH-05.
 *
 * Pure presentational component — renders the 6 line items per tier per Phase
 * 1 UI-SPEC "Break-even preview panel". Used by BOTH:
 *   - The plan builder's live preview (draft state) — via BreakEvenPanel.
 *   - The published-plan dashboard panel.
 *
 * Input is cents throughout (no USD floats at the boundary) so the UI stays
 * internally consistent with what `publishPlan` stores in DB. `accentHex`
 * paints the break-even count; labels are fixed copy per UI-SPEC.
 */

interface Props {
  retailValueBundledCents: number;
  monthlyFeeCents: number;
  stripeFeePerChargeCents: number;
  platformFeePerChargeCents: number;
  clinicGrossPerPetPerYearCents: number;
  breakEvenMembers: number;
  accentHex?: string;
}

const usd = (cents: number) => `$${(cents / 100).toFixed(2)}`;

function Row({
  label,
  value,
  negative = false,
  emphasis = false,
  accentHex,
}: {
  label: string;
  value: ReactNode;
  negative?: boolean;
  emphasis?: boolean;
  accentHex?: string;
}) {
  return (
    <div className="flex items-center justify-between py-2 text-sm">
      <span className="text-[#1C1B18]">{label}</span>
      <span
        className={[
          'font-mono tabular-nums',
          emphasis ? 'text-xl font-semibold' : '',
          negative ? 'text-[#6B6A63]' : '',
        ]
          .filter(Boolean)
          .join(' ')}
        style={emphasis && accentHex ? { color: accentHex } : undefined}
      >
        {value}
      </span>
    </div>
  );
}

export function BreakEvenLineItems(props: Props) {
  const {
    retailValueBundledCents,
    monthlyFeeCents,
    stripeFeePerChargeCents,
    platformFeePerChargeCents,
    clinicGrossPerPetPerYearCents,
    breakEvenMembers,
    accentHex = '#2F7D6E',
  } = props;

  // break-even = 0 is our sentinel for "impossible" (derived helper coerces
  // Infinity → 0). Also guard against absurdly-large counts (>99,999) that
  // indicate a misconfigured plan the owner should see as "too low to work."
  const isImpossible = breakEvenMembers === 0 || breakEvenMembers > 99_999;

  return (
    <div className="divide-y divide-[#E8E6E0]">
      <Row label="Retail value bundled" value={`${usd(retailValueBundledCents)} / yr`} />
      <Row label="Monthly fee (member pays)" value={`${usd(monthlyFeeCents)} / mo`} />
      <Row
        label="Stripe processing estimate"
        value={`−${usd(stripeFeePerChargeCents)} / charge`}
        negative
      />
      <Row
        label="PawPlan platform fee (10%)"
        value={`−${usd(platformFeePerChargeCents)} / charge`}
        negative
      />
      <Row
        label="Clinic gross per pet per year"
        value={`${usd(clinicGrossPerPetPerYearCents)} / yr`}
      />
      <Row
        label="Members to break even"
        value={isImpossible ? 'Monthly fee too low' : `${breakEvenMembers}`}
        emphasis
        accentHex={accentHex}
      />
    </div>
  );
}
