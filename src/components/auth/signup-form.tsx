'use client';

import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2 } from 'lucide-react';
import { signUpClinicOwner, type SignUpFieldError } from '@/app/actions/auth';
import { normalizeSlug } from '@/lib/slug';

type FieldErrors = Partial<Record<SignUpFieldError, string>>;

export function SignupForm() {
  const [pending, startTransition] = useTransition();
  const [errors, setErrors] = useState<FieldErrors>({});
  const [slugValue, setSlugValue] = useState('');

  async function onSubmit(formData: FormData) {
    setErrors({});
    const payload = {
      email: String(formData.get('email') ?? '').trim(),
      password: String(formData.get('password') ?? ''),
      practiceName: String(formData.get('practiceName') ?? '').trim(),
      slug: String(formData.get('slug') ?? '').trim(),
    };
    startTransition(async () => {
      try {
        const result = await signUpClinicOwner(payload);
        if (result && !result.ok) {
          setErrors({ [result.field]: result.message });
        }
        // On success, the server action redirects — this path is unreachable.
      } catch (e) {
        // Next.js redirects throw a NEXT_REDIRECT digest; let those bubble.
        const digest = (e as { digest?: string }).digest;
        if (typeof digest === 'string' && digest.startsWith('NEXT_REDIRECT')) throw e;
        setErrors({ email: 'Something broke on our end. We\'re looking into it.' });
      }
    });
  }

  return (
    <form action={onSubmit} className="space-y-5">
      <div className="space-y-1.5">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          aria-invalid={Boolean(errors.email)}
          aria-describedby={errors.email ? 'email-error' : undefined}
        />
        {errors.email ? (
          <p id="email-error" className="text-xs text-destructive">
            {errors.email}
          </p>
        ) : null}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="password">Password</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          minLength={8}
          required
          aria-invalid={Boolean(errors.password)}
          aria-describedby={errors.password ? 'password-error' : 'password-helper'}
        />
        {errors.password ? (
          <p id="password-error" className="text-xs text-destructive">
            {errors.password}
          </p>
        ) : (
          <p id="password-helper" className="text-xs text-muted-foreground">
            At least 8 characters.
          </p>
        )}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="practiceName">Clinic name</Label>
        <Input
          id="practiceName"
          name="practiceName"
          type="text"
          autoComplete="organization"
          required
          aria-invalid={Boolean(errors.practiceName)}
          aria-describedby={errors.practiceName ? 'practiceName-error' : 'practiceName-helper'}
        />
        {errors.practiceName ? (
          <p id="practiceName-error" className="text-xs text-destructive">
            {errors.practiceName}
          </p>
        ) : (
          <p id="practiceName-helper" className="text-xs text-muted-foreground">
            The public name pet owners will see.
          </p>
        )}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="slug">Enrollment URL</Label>
        <div className="flex items-center rounded-md border border-input bg-background pl-3 focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/50">
          <span className="text-sm text-muted-foreground">pawplan.app/</span>
          <input
            id="slug"
            name="slug"
            type="text"
            required
            value={slugValue}
            onChange={(e) => setSlugValue(normalizeSlug(e.target.value))}
            className="h-9 w-full border-0 bg-transparent px-2 py-1 text-sm outline-none"
            aria-invalid={Boolean(errors.slug)}
            aria-describedby={errors.slug ? 'slug-error' : 'slug-helper'}
          />
        </div>
        {errors.slug ? (
          <p id="slug-error" className="text-xs text-destructive">
            {errors.slug}
          </p>
        ) : (
          <p id="slug-helper" className="text-xs text-muted-foreground">
            This becomes your enrollment page URL. You can&apos;t change it later.
          </p>
        )}
      </div>

      <Button type="submit" className="h-10 w-full" disabled={pending}>
        {pending ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Creating account…
          </>
        ) : (
          'Create clinic account'
        )}
      </Button>
    </form>
  );
}
