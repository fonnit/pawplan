'use client';

import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip';

interface Props {
  canPublish: boolean;
  blockedReason: string | null;
  onPublish?: () => void;
}

/**
 * Publish button — disabled until Stripe capability gate passes.
 * Tooltip on the wrapper (disabled buttons don't fire hover in some browsers,
 * so the tooltip hangs on a span).
 *
 * Actual publish action lands in Phase 3 (PUB-03/04). Phase 2 ships the
 * button + gating wiring so Phase 3 only needs to implement onPublish.
 */
export function PublishButton({ canPublish, blockedReason, onPublish }: Props) {
  if (canPublish) {
    return (
      <Button type="button" onClick={onPublish} size="lg">
        Publish plan
      </Button>
    );
  }
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
