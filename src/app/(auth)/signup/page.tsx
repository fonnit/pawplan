import Link from 'next/link';
import { SignupForm } from '@/components/auth/signup-form';

export default function SignupPage() {
  return (
    <div className="rounded-lg border bg-card p-8 shadow-sm">
      <h1 className="text-[28px] font-semibold leading-[1.2]">Create your clinic account</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Already have an account?{' '}
        <Link href="/login" className="font-semibold text-foreground underline">
          Log in
        </Link>
      </p>
      <div className="mt-8">
        <SignupForm />
      </div>
    </div>
  );
}
