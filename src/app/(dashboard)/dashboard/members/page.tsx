import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { listMembers } from '@/app/actions/members';
import { MembersTable } from './members-table';

export const dynamic = 'force-dynamic'; // session-scoped; never cache

export default async function MembersPage() {
  // Load the clinic's timezone once at the server layer so the table renders
  // every date in the clinic's wall time (DASH-06). Passing it through props
  // means the client component never reaches back for it.
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect('/login');
  const clinic = await prisma.clinic.findUnique({
    where: { ownerUserId: session.user.id },
    select: { timezone: true },
  });
  if (!clinic) redirect('/signup');

  const members = await listMembers();

  return (
    <main className="mx-auto max-w-6xl">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold text-[#1C1B18]">Members</h1>
        <p className="mt-1 text-sm text-[#6B6A63]">
          {members.length === 0
            ? "You don't have any members yet. Share your enrollment link to get started."
            : `${members.length} ${members.length === 1 ? 'member' : 'members'}`}
        </p>
      </header>

      <MembersTable initialMembers={members} timezone={clinic.timezone} />
    </main>
  );
}
