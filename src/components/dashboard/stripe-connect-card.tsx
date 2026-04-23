import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { startConnectOnboarding } from '@/app/actions/stripe';

/**
 * Shown when clinic.stripeOnboardingState === 'not_started'.
 * Single CTA — clicks post to the server action which creates the account
 * + AccountLink and redirects to Stripe.
 *
 * Server component — no client-side JS needed. <form action={action}>
 * with a server action submits via native form POST.
 */
export function StripeConnectCard() {
  return (
    <Card className="max-w-[640px] p-6">
      <h2 className="text-[20px] font-semibold text-foreground">Connect payouts</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        Before you can publish your plan, connect a Stripe account. PawPlan uses Stripe Connect
        Express — Stripe handles bank verification and payouts land directly in your account.
      </p>
      <form action={startConnectOnboarding} className="mt-4">
        <Button type="submit" size="lg">
          Connect Stripe
        </Button>
      </form>
    </Card>
  );
}
