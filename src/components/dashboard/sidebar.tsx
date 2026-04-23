'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutGrid, Settings } from 'lucide-react';
import { cn } from '@/lib/utils';

const NAV_ITEMS = [
  { href: '/dashboard' as const, label: 'Plans', icon: LayoutGrid, matchPrefix: '/dashboard' },
  { href: '/dashboard' as const, label: 'Profile', icon: Settings, matchPrefix: '/dashboard/profile' },
] as const;

export function Sidebar() {
  const pathname = usePathname();
  return (
    <aside className="fixed inset-y-0 left-0 top-16 w-[240px] border-r bg-card">
      <nav className="flex flex-col gap-1 p-3">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          // Plans matches /dashboard but NOT /dashboard/profile.
          const isProfile = item.matchPrefix === '/dashboard/profile';
          const active = isProfile
            ? pathname.startsWith('/dashboard/profile')
            : pathname === '/dashboard' ||
              (pathname.startsWith('/dashboard/plans') && !pathname.startsWith('/dashboard/profile'));
          return (
            <Link
              key={item.label}
              href={item.href}
              className={cn(
                'relative flex h-10 items-center gap-2 rounded-md px-3 text-sm',
                active
                  ? 'bg-muted font-semibold text-primary before:absolute before:left-0 before:top-1/2 before:h-6 before:w-[3px] before:-translate-y-1/2 before:rounded-r-sm before:bg-primary'
                  : 'text-foreground hover:bg-muted',
              )}
            >
              <Icon className="h-4 w-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
