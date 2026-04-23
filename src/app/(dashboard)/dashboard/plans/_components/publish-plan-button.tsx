'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { publishPlan } from '@/app/actions/publish';

/**
 * Phase 3 PUB-03 dashboard Publish button.
 *
 * Replaces the Phase 2 stub in src/components/dashboard/publish-button.tsx
 * WITHIN the /dashboard/plans route only — the dashboard home still uses the
 * stub button (which fires `onPublish` undefined = no-op). This component is
 * the live wiring.
 *
 * Disabled with tooltip reason if !canPublish. On click, calls publishPlan
 * via a useTransition, toast on the result, router.refresh() on success so
 * the server-component page re-renders into the PublishedPlanPanel branch.
 */

interface Props {
  planId: string;
  canPublish: boolean;
  blockedReason: string | null;
}

export function PublishPlanButton({ planId, canPublish, blockedReason }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  if (!canPublish) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <span tabIndex={0} aria-describedby="publish-blocked">
              <Button type="button" disabled size="lg" aria-disabled>
                Publish plan
              </Button>
            </span>
          </TooltipTrigger>
          <TooltipContent id="publish-blocked">
            {blockedReason ?? 'Publish is currently unavailable.'}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  const onClick = () => {
    startTransition(async () => {
      const res = await publishPlan({ planId });
      if (res.ok) {
        toast.success(`Published! Your enrollment page is live at /${res.snapshot.clinicSlug}/enroll.`);
        router.refresh();
      } else {
        toast.error(res.error);
      }
    });
  };

  return (
    <Button type="button" onClick={onClick} size="lg" disabled={pending}>
      {pending ? 'Publishing…' : 'Publish plan'}
    </Button>
  );
}
