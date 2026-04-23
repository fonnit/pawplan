'use client';

import { Button } from '@/components/ui/button';
import { LogOut } from 'lucide-react';
import { authClient } from '@/lib/auth-client';
import { useRouter } from 'next/navigation';
import { useTransition } from 'react';

export function LogoutButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <Button
      variant="ghost"
      size="sm"
      className="h-8 gap-1"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          await authClient.signOut();
          router.replace('/login');
          router.refresh();
        })
      }
    >
      <LogOut className="h-4 w-4" />
      {pending ? 'Logging out…' : 'Log out'}
    </Button>
  );
}
