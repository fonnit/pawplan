import Link from 'next/link';
import { Suspense } from 'react';
import { LoginForm } from '@/components/auth/login-form';

export default function LoginPage() {
  return (
    <div className="rounded-lg border bg-card p-8 shadow-sm">
      <h1 className="text-[28px] font-semibold leading-[1.2]">Log in to PawPlan</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        No account yet?{' '}
        <Link href="/signup" className="font-semibold text-foreground underline">
          Create one
        </Link>
      </p>
      <div className="mt-8">
        <Suspense fallback={null}>
          <LoginForm />
        </Suspense>
      </div>
    </div>
  );
}
