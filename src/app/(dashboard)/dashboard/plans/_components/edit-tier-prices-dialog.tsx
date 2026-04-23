'use client';

import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { updatePlanPrices } from '@/app/actions/publish';

/**
 * BLDR-08 price-edit dialog.
 *
 * Disclosure: "Applies to new enrollments only. Existing members keep their
 * current price." — greppable, locked copy per Phase 3 plan.
 *
 * Behavior:
 *   - One input per tier, pre-filled with the current monthly fee (dollars).
 *   - Only changed values are submitted; unchanged tiers are filtered out.
 *   - updatePlanPrices server action creates new Stripe Prices on the same
 *     Products and stamps history. Existing subs are untouched (Stripe
 *     supports multiple active Prices per Product).
 */

interface TierOption {
  tierId: string;
  tierName: string;
  currentMonthlyFeeCents: number;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  planId: string;
  tiers: TierOption[];
}

const centsToDollarString = (c: number) => (c / 100).toFixed(2);
const dollarStringToCents = (s: string): number | null => {
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 100);
};

export function EditTierPricesDialog({ open, onOpenChange, planId, tiers }: Props) {
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(tiers.map((t) => [t.tierId, centsToDollarString(t.currentMonthlyFeeCents)])),
  );
  const [pending, startTransition] = useTransition();

  const onSubmit = () => {
    const changes = tiers.flatMap((t) => {
      const cents = dollarStringToCents(values[t.tierId] ?? '');
      if (cents === null) return [];
      if (cents === t.currentMonthlyFeeCents) return [];
      return [{ tierId: t.tierId, newMonthlyFeeCents: cents }];
    });
    if (changes.length === 0) {
      toast.info('No changes to save.');
      onOpenChange(false);
      return;
    }
    startTransition(async () => {
      const res = await updatePlanPrices({ planId, priceChanges: changes });
      if (res.ok) {
        toast.success(`Updated ${res.updatedTiers.length} tier price(s).`);
        onOpenChange(false);
      } else {
        toast.error(res.error);
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit plan prices</DialogTitle>
          <DialogDescription>
            <strong>Applies to new enrollments only.</strong> Existing members keep their current
            price until they cancel and re-enroll.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          {tiers.map((t) => (
            <div key={t.tierId} className="grid grid-cols-[1fr_120px] items-center gap-3">
              <Label htmlFor={`price-${t.tierId}`}>{t.tierName}</Label>
              <div className="relative">
                <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-[#6B6A63]">
                  $
                </span>
                <Input
                  id={`price-${t.tierId}`}
                  type="number"
                  step="0.01"
                  min="5.00"
                  max="1000.00"
                  inputMode="decimal"
                  className="pl-7 font-mono"
                  value={values[t.tierId] ?? ''}
                  onChange={(e) => setValues((v) => ({ ...v, [t.tierId]: e.target.value }))}
                />
              </div>
            </div>
          ))}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            Cancel
          </Button>
          <Button onClick={onSubmit} disabled={pending}>
            {pending ? 'Saving…' : 'Save new prices'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
