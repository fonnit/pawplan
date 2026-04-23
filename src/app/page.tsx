import { auth } from '@/lib/auth';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';

export default async function HomePage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (session) redirect('/dashboard');
  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-8">
      <div className="max-w-md text-center">
        <h1 className="text-[28px] font-semibold">PawPlan</h1>
        <p className="mt-4 text-sm text-muted-foreground">
          A self-serve wellness-plan builder for independently owned vet clinics.
        </p>
        <div className="mt-8 flex justify-center gap-4">
          <Button asChild>
            <Link href="/signup">Create clinic account</Link>
          </Button>
          <Button variant="outline" asChild>
            <Link href="/login">Log in</Link>
          </Button>
        </div>
      </div>
    </main>
  );
}
