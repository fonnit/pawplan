import Link from 'next/link';
import { LogoutButton } from './logout-button';

export function TopNav({ practiceName }: { practiceName: string }) {
  return (
    <header className="fixed inset-x-0 top-0 z-40 flex h-16 items-center justify-between border-b bg-card px-6">
      <div className="flex items-center gap-2">
        <Link href="/dashboard" className="text-[18px] font-semibold text-foreground">
          PawPlan
        </Link>
        <span className="text-muted-foreground">/</span>
        <span className="text-sm text-muted-foreground">{practiceName}</span>
      </div>
      <LogoutButton />
    </header>
  );
}
