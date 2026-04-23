'use client';

import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Checkbox } from '@/components/ui/checkbox';
import { toggleMemberService } from '@/app/actions/redemption';

interface RedemptionPanelProps {
  memberId: string;
  includedServices: string[];
  initialRedeemed: string[];
  /** Display-friendly billing-period anchor string (already clinic-tz formatted). */
  billingPeriodLabel: string | null;
}

const SERVICE_LABELS: Record<string, string> = {
  'annual-exam': 'Annual exam',
  'core-vaccines': 'Core vaccines',
  'dental-cleaning': 'Dental cleaning',
  'heartworm-prevention': 'Heartworm prevention',
  'flea-tick-prevention': 'Flea/tick prevention',
};

/**
 * Services-remaining panel (DASH-02 + DASH-04).
 *
 * Optimistic UI: toggle the local Set immediately, fire the server action,
 * roll back on any non-success status. Works against the toggleMemberService
 * action which handles the idempotency + optimistic-lock contract.
 */
export function RedemptionPanel({
  memberId,
  includedServices,
  initialRedeemed,
  billingPeriodLabel,
}: RedemptionPanelProps) {
  const [redeemed, setRedeemed] = useState<Set<string>>(() => new Set(initialRedeemed));
  const [busy, setBusy] = useState<Set<string>>(() => new Set());
  const [isPending, startTransition] = useTransition();

  const onToggle = (serviceKey: string, nextOn: boolean) => {
    // Optimistic local flip.
    const prev = new Set(redeemed);
    setBusy((b) => new Set(b).add(serviceKey));
    setRedeemed((r) => {
      const next = new Set(r);
      if (nextOn) next.add(serviceKey);
      else next.delete(serviceKey);
      return next;
    });

    startTransition(async () => {
      const result = await toggleMemberService({
        memberId,
        serviceKey,
        desiredState: nextOn ? 'on' : 'off',
      });

      setBusy((b) => {
        const next = new Set(b);
        next.delete(serviceKey);
        return next;
      });

      if (result.status === 'on' || result.status === 'already_redeemed') {
        // Server says on; our optimistic flip already says on. No-op.
        return;
      }
      if (result.status === 'off') {
        // Server says off; optimistic flip already says off. No-op.
        return;
      }
      if (result.status === 'not_found') {
        toast.error('Member no longer exists. Refresh the page.');
        setRedeemed(prev);
        return;
      }
      if (result.status === 'no_billing_period') {
        toast.error(result.message);
        setRedeemed(prev);
        return;
      }
      if (result.status === 'version_conflict') {
        toast.error('This service was updated by someone else. Refresh to see the latest.');
        setRedeemed(prev);
        return;
      }
      // Unknown failure — roll back and surface.
      toast.error('Could not update redemption. Try again.');
      setRedeemed(prev);
    });
  };

  const remaining = includedServices.length - redeemed.size;

  return (
    <div className="px-4 py-3">
      <div className="mb-2 flex items-center justify-between text-xs text-[#6B6A63]">
        <span>
          {remaining} of {includedServices.length} services remaining
          {billingPeriodLabel ? ` · billing period since ${billingPeriodLabel}` : ''}
        </span>
        {isPending && <span>Saving…</span>}
      </div>
      {includedServices.length === 0 ? (
        <p className="text-xs text-[#6B6A63]">
          This tier has no tracked services. Staff toggles will appear once the plan includes services.
        </p>
      ) : (
        <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {includedServices.map((key) => {
            const isRedeemed = redeemed.has(key);
            const isBusy = busy.has(key);
            return (
              <li key={key} className="flex items-center gap-2 text-sm">
                <Checkbox
                  id={`redemption-${memberId}-${key}`}
                  checked={isRedeemed}
                  disabled={isBusy}
                  onCheckedChange={(next) => onToggle(key, next === true)}
                />
                <label
                  htmlFor={`redemption-${memberId}-${key}`}
                  className={isRedeemed ? 'text-[#6B6A63] line-through' : 'text-[#1C1B18]'}
                >
                  {SERVICE_LABELS[key] ?? key}
                </label>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
