'use client';

import type { AccentColor } from '@prisma/client';
import { toast } from 'sonner';
import type { PublishedPlanTierSnapshot } from '@/lib/stripe/types';

const ACCENT_HEX: Record<AccentColor, string> = {
  sage: '#2F7D6E',
  terracotta: '#B85A3C',
  midnight: '#2B3A55',
  wine: '#8B2E4E',
  forest: '#3D5E3A',
  clay: '#7A5230',
};

// PawPlan primary CTA stays sage-teal per Phase 1 UI-SPEC:
// "Accent (#2F7D6E) reserved for: Primary CTA". Clinic accent only paints
// the "Most popular" ribbon + middle-card border.
const PAWPLAN_PRIMARY = '#2F7D6E';

const centsToUsdDisplay = (cents: number): string => `$${(cents / 100).toFixed(2)}`;

// Human-readable labels for the service keys the plan builder emits. Any
// unknown key falls back to the raw key string (still renders, doesn't crash).
const SERVICE_LABELS: Record<string, string> = {
  'annual-exam': 'Annual wellness exam',
  'core-vaccines': 'Core vaccines',
  'dental-cleaning': 'Dental cleaning',
  'heartworm-prevention': 'Heartworm prevention',
  'flea-tick-prevention': 'Flea & tick prevention',
};

const formatService = (key: string): string => SERVICE_LABELS[key] ?? key;

interface TierComparisonProps {
  clinicSlug: string;
  clinicAccentColor: AccentColor;
  tiers: PublishedPlanTierSnapshot[];
}

export function TierComparison({ clinicSlug, clinicAccentColor, tiers }: TierComparisonProps) {
  const clinicAccent = ACCENT_HEX[clinicAccentColor];

  const onEnroll = (tier: PublishedPlanTierSnapshot) => {
    // PITFALLS #8: defer Checkout session creation to button click.
    // Phase 4 replaces this stub with a fetch to /api/stripe/checkout.
    console.info('[enroll-stub]', {
      clinicSlug,
      tierKey: tier.tierKey,
      priceId: tier.stripePriceId,
    });
    toast.info('Checkout lands in Phase 4. Your tier selection was noted.');
  };

  const isThree = tiers.length === 3;

  return (
    <section aria-labelledby="plans-heading">
      <h2 id="plans-heading" className="sr-only">
        Available wellness plans
      </h2>
      <div
        className={
          isThree
            ? 'grid grid-cols-1 gap-6 lg:grid-cols-3'
            : 'mx-auto grid max-w-4xl grid-cols-1 gap-6 lg:grid-cols-2'
        }
      >
        {tiers.map((tier, idx) => {
          const isMiddle = idx === 1;
          return (
            <article
              key={tier.tierId}
              className={[
                'flex flex-col rounded-xl border bg-white p-6 transition-shadow',
                isMiddle ? 'border-2 shadow-lg' : 'border-[#E8E6E0]',
              ].join(' ')}
              style={isMiddle ? { borderColor: clinicAccent } : undefined}
            >
              {isMiddle && (
                <span
                  className="mb-3 inline-block self-start rounded-full px-3 py-1 text-xs font-semibold text-white"
                  style={{ backgroundColor: clinicAccent }}
                >
                  Most popular
                </span>
              )}
              <h3 className="text-xl font-semibold text-[#1C1B18]">{tier.tierName}</h3>
              <p className="mt-1 text-sm text-[#6B6A63]">
                Retail value {centsToUsdDisplay(tier.retailValueBundledCents)} / year
              </p>
              <div className="mt-6">
                <span className="text-4xl font-semibold tabular-nums text-[#1C1B18]">
                  {centsToUsdDisplay(tier.monthlyFeeCents)}
                </span>
                <span className="ml-1 text-sm text-[#6B6A63]">/ month</span>
              </div>
              <ul className="mt-6 flex-1 space-y-2 text-sm text-[#1C1B18]">
                {tier.includedServices.map((svc) => (
                  <li key={svc} className="flex items-start gap-2">
                    <span aria-hidden style={{ color: clinicAccent }}>
                      ✓
                    </span>
                    <span>{formatService(svc)}</span>
                  </li>
                ))}
              </ul>
              <button
                type="button"
                onClick={() => onEnroll(tier)}
                className="mt-6 inline-flex h-11 w-full items-center justify-center rounded-md text-sm font-semibold text-white transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
                style={{ backgroundColor: PAWPLAN_PRIMARY }}
              >
                Start {tier.tierName} membership
              </button>
            </article>
          );
        })}
      </div>
    </section>
  );
}
