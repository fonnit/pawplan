import { listMembers } from '@/app/actions/members';
import { MembersTable } from './members-table';

export const dynamic = 'force-dynamic'; // session-scoped; never cache

export default async function MembersPage() {
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

      <MembersTable initialMembers={members} />
    </main>
  );
}
