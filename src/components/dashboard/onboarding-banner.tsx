'use client';

import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { AlertCircle, Loader2 } from 'lucide-react';
import type { OnboardingState, StripeConnectRequirements } from '@/lib/stripe/types';

interface Props {
  state: Exclude<OnboardingState, 'not_started' | 'complete'>;
  requirements: StripeConnectRequirements;
  blockedReason: string;
}

/**
 * Banner shown above dashboard main content when onboarding is incomplete.
 * - in_progress: neutral "verifying" message, no action
 * - action_required: list currently_due items, show Resume button
 * - restricted: red border, disabled_reason message, show Resume button
 *
 * Client component because it posts to /api/stripe/connect/refresh and
 * routes the owner to a fresh AccountLink. Using fetch + window.location
 * keeps the flow a single keypress away from Stripe's hosted onboarding.
 */
export function OnboardingBanner({ state, requirements, blockedReason }: Props) {
  const [loading, setLoading] = useState(false);
  const isRestricted = state === 'restricted';

  async function handleResume() {
    setLoading(true);
    try {
      const res = await fetch('/api/stripe/connect/refresh', { method: 'POST' });
      if (!res.ok) return;
      const { url } = (await res.json()) as { url: string };
      window.location.href = url;
    } catch {
      // Network failure / JSON parse error — swallow so the user can
      // retry. The finally block clears the loading flag so the button
      // doesn't stay wedged on "Loading…" forever.
    } finally {
      // On success this runs after window.location.href is assigned,
      // which is non-blocking; the component unmounts on navigation and
      // setState-on-unmounted is a no-op in React 19.
      setLoading(false);
    }
  }

  return (
    <Card
      className={`mb-6 flex flex-row items-start gap-4 p-4 ${
        isRestricted ? 'border-destructive' : 'border-border'
      }`}
    >
      {state === 'in_progress' ? (
        <Loader2 className="mt-0.5 h-5 w-5 animate-spin text-muted-foreground" aria-hidden />
      ) : (
        <AlertCircle
          className={`mt-0.5 h-5 w-5 ${isRestricted ? 'text-destructive' : 'text-foreground'}`}
          aria-hidden
        />
      )}
      <div className="flex-1">
        <p className="text-sm font-semibold text-foreground">{blockedReason}</p>
        {requirements.currently_due.length > 0 && (
          <ul className="mt-2 list-disc space-y-0.5 pl-5 text-sm text-muted-foreground">
            {requirements.currently_due.map((r) => (
              <li key={r}>{r.replace(/_/g, ' ').replace(/\./g, ' → ')}</li>
            ))}
          </ul>
        )}
        {state !== 'in_progress' && (
          <Button
            type="button"
            onClick={handleResume}
            disabled={loading}
            className="mt-3"
            size="sm"
            variant={isRestricted ? 'destructive' : 'default'}
          >
            {loading ? 'Loading…' : 'Resume onboarding'}
          </Button>
        )}
      </div>
    </Card>
  );
}
