'use client';

import { useState } from 'react';
import { Copy, ExternalLink, Pencil } from 'lucide-react';
import { toast } from 'sonner';
import type { AccentColor } from '@prisma/client';
import { Button } from '@/components/ui/button';
import { BreakEvenLineItems } from './break-even-line-items';
import { EditTierPricesDialog } from './edit-tier-prices-dialog';

/**
 * Phase 3 dashboard "published plan" surface.
 *
 * Renders:
 *   - Published-at stamp + enrollment URL with copy + open buttons.
 *   - Per-tier line-item breakdown (shared BreakEvenLineItems — parity with
 *     the builder's live preview).
 *   - "Edit prices" button → EditTierPricesDialog (BLDR-08).
 *
 * Accent hex is the clinic's 6-preset palette; ACCENT_HEX mirror lives in
 * src/components/enrollment/clinic-header.tsx. Both import the same
 * AccentColor enum from @prisma/client so the key set can't drift.
 */

const ACCENT_HEX: Record<AccentColor, string> = {
  sage: '#2F7D6E',
  terracotta: '#B85A3C',
  midnight: '#2B3A55',
  wine: '#8B2E4E',
  forest: '#3D5E3A',
  clay: '#7A5230',
};

interface TierRow {
  tierId: string;
  tierName: string;
  retailValueBundledCents: number;
  monthlyFeeCents: number;
  stripeFeePerChargeCents: number;
  platformFeePerChargeCents: number;
  clinicGrossPerPetPerYearCents: number;
  breakEvenMembers: number;
}

interface Props {
  planId: string;
  slug: string;
  accentColor: AccentColor;
  publishedAt: Date;
  tiers: TierRow[];
}

export function PublishedPlanPanel({ planId, slug, accentColor, publishedAt, tiers }: Props) {
  const [editOpen, setEditOpen] = useState(false);
  const accentHex = ACCENT_HEX[accentColor];
  // Build the full URL lazily (client only — the origin isn't known SSR).
  const enrollmentPath = `/${slug}/enroll`;

  const onCopy = async () => {
    try {
      const base = typeof window !== 'undefined' ? window.location.origin : '';
      await navigator.clipboard.writeText(`${base}${enrollmentPath}`);
      toast.success('Link copied');
    } catch {
      toast.error('Copy failed');
    }
  };

  return (
    <section className="space-y-6">
      <div className="rounded-lg border border-[#E8E6E0] bg-white p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold text-[#1C1B18]">Published</h2>
            <p className="text-sm text-[#6B6A63]">
              Since {publishedAt.toLocaleDateString()}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <code className="rounded bg-[#F4F2EC] px-2 py-1 font-mono text-sm text-[#1C1B18]">
              {enrollmentPath}
            </code>
            <Button variant="outline" size="sm" onClick={onCopy}>
              <Copy className="mr-1 h-4 w-4" /> Copy link
            </Button>
            <Button variant="outline" size="sm" asChild>
              <a href={enrollmentPath} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="mr-1 h-4 w-4" /> Open
              </a>
            </Button>
          </div>
        </div>
      </div>

      <div className="rounded-lg border border-[#E8E6E0] bg-white p-6">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-[#1C1B18]">Plan tiers</h3>
          <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
            <Pencil className="mr-1 h-4 w-4" /> Edit prices
          </Button>
        </div>
        <div className="space-y-8">
          {tiers.map((t) => (
            <div key={t.tierId}>
              <div className="mb-2 flex items-baseline justify-between">
                <h4 className="text-base font-semibold text-[#1C1B18]">{t.tierName}</h4>
                <span className="font-mono text-xl font-semibold tabular-nums">
                  ${(t.monthlyFeeCents / 100).toFixed(2)} / mo
                </span>
              </div>
              <BreakEvenLineItems {...t} accentHex={accentHex} />
            </div>
          ))}
        </div>
      </div>

      <EditTierPricesDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        planId={planId}
        tiers={tiers.map((t) => ({
          tierId: t.tierId,
          tierName: t.tierName,
          currentMonthlyFeeCents: t.monthlyFeeCents,
        }))}
      />
    </section>
  );
}
