'use client';

import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2 } from 'lucide-react';
import { authClient } from '@/lib/auth-client';
import { safeNext } from '@/lib/safe-next';
import { useRouter, useSearchParams } from 'next/navigation';

export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(formData: FormData) {
    setError(null);
    const email = String(formData.get('email') ?? '').trim();
    const password = String(formData.get('password') ?? '');
    // CR-01: never trust the raw `next` query param — require same-origin path.
    const next = safeNext(params.get('next'));
    startTransition(async () => {
      const result = await authClient.signIn.email({ email, password });
      if ('error' in result && result.error) {
        setError('Email or password didn\'t match. Try again.');
        return;
      }
      // Navigate client-side — Better Auth set the cookie already.
      // `next` is runtime-validated by safeNext(); cast is needed because
      // Next.js typed routes require a string-literal route type. Runtime
      // correctness comes from safeNext, not the cast.
      router.replace(next as Parameters<typeof router.replace>[0]);
      router.refresh();
    });
  }

  return (
    <form action={onSubmit} className="space-y-5">
      <div className="space-y-1.5">
        <Label htmlFor="email">Email</Label>
        <Input id="email" name="email" type="email" autoComplete="email" required />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="password">Password</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
        />
      </div>

      {error ? <p className="text-xs text-destructive">{error}</p> : null}

      <Button type="submit" className="h-10 w-full" disabled={pending}>
        {pending ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Logging in…
          </>
        ) : (
          'Log in'
        )}
      </Button>
    </form>
  );
}
