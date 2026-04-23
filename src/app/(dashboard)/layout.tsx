import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import { TopNav } from '@/components/dashboard/top-nav';
import { Sidebar } from '@/components/dashboard/sidebar';

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect('/login');
  const clinic = await prisma.clinic.findUnique({
    where: { ownerUserId: session.user.id },
  });
  if (!clinic) redirect('/signup');

  return (
    <div className="min-h-screen bg-background">
      <TopNav practiceName={clinic.practiceName} />
      <div className="flex">
        <Sidebar />
        <main className="ml-[240px] mt-16 w-full max-w-[1280px] px-12 pt-8">{children}</main>
      </div>
    </div>
  );
}
