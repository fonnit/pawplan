'use client';

import Link from 'next/link';
import type { Route } from 'next';
import { usePathname } from 'next/navigation';
import { LayoutGrid, Settings, Users } from 'lucide-react';
import { cn } from '@/lib/utils';

interface NavItem {
  href: Route;
  label: string;
  icon: typeof LayoutGrid;
  matchPrefix: string;
}

const NAV_ITEMS: readonly NavItem[] = [
  { href: '/dashboard', label: 'Plans', icon: LayoutGrid, matchPrefix: '/dashboard' },
  {
    // Typed-routes will pick this up on the next build; Route cast keeps dev/tsc
    // green in the interim (the file /dashboard/members/page.tsx exists on disk).
    href: '/dashboard/members' as Route,
    label: 'Members',
    icon: Users,
    matchPrefix: '/dashboard/members',
  },
  { href: '/dashboard', label: 'Profile', icon: Settings, matchPrefix: '/dashboard/profile' },
];

export function Sidebar() {
  const pathname = usePathname();
  return (
    <aside className="fixed inset-y-0 left-0 top-16 w-[240px] border-r bg-card">
      <nav className="flex flex-col gap-1 p-3">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          // Plans matches /dashboard + /dashboard/plans (not /dashboard/profile, /dashboard/members).
          const isProfile = item.matchPrefix === '/dashboard/profile';
          const isMembers = item.matchPrefix === '/dashboard/members';
          const active = isProfile
            ? pathname.startsWith('/dashboard/profile')
            : isMembers
              ? pathname.startsWith('/dashboard/members')
              : (pathname === '/dashboard' ||
                  pathname.startsWith('/dashboard/plans')) &&
                !pathname.startsWith('/dashboard/profile') &&
                !pathname.startsWith('/dashboard/members');
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
