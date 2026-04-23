'use client';

import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { renameTiers } from '@/app/actions/publish';

/**
 * Phase 3 BLDR-06: inline rename for draft tiers.
 *
 * One row per tier — user edits the name, clicks Save, action runs with the
 * single rename payload. Published plans never render this component (the
 * parent page branches on plan.status).
 *
 * Validation happens server-side (renameTiers); this client only trims
 * whitespace and disables Save when the value is unchanged or empty.
 */

interface Props {
  planId: string;
  tierId: string;
  initialName: string;
}

export function TierRenameRow({ planId, tierId, initialName }: Props) {
  const [name, setName] = useState(initialName);
  const [pending, startTransition] = useTransition();

  const trimmed = name.trim();
  const isDirty = trimmed.length > 0 && trimmed !== initialName;

  const onSave = () => {
    startTransition(async () => {
      const res = await renameTiers({
        planId,
        renames: [{ tierId, tierName: trimmed }],
      });
      if (res.ok) {
        toast.success('Tier renamed.');
      } else {
        toast.error(res.error);
      }
    });
  };

  return (
    <div className="grid grid-cols-[140px_1fr_auto] items-center gap-3">
      <Label htmlFor={`tier-name-${tierId}`} className="text-sm text-[#6B6A63]">
        Tier name
      </Label>
      <Input
        id={`tier-name-${tierId}`}
        value={name}
        onChange={(e) => setName(e.target.value)}
        maxLength={40}
        disabled={pending}
      />
      <Button size="sm" variant="outline" onClick={onSave} disabled={!isDirty || pending}>
        {pending ? 'Saving…' : 'Save'}
      </Button>
    </div>
  );
}
