'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { ArrowRight, Trash2, Loader2 } from 'lucide-react';
import { deleteDraftPlan } from '@/app/actions/plans';

export function DraftCard({
  draft,
}: {
  draft: { planId: string; tierCount: 2 | 3; updatedAt: Date };
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [confirmOpen, setConfirmOpen] = useState(false);

  function onDelete() {
    startTransition(async () => {
      const res = await deleteDraftPlan(draft.planId);
      if (res.ok) router.refresh();
      setConfirmOpen(false);
    });
  }

  return (
    <div className="rounded-lg border bg-card p-6 shadow-sm">
      <h2 className="text-[20px] font-semibold leading-[1.3]">
        Plan draft — last edited {formatRelative(draft.updatedAt)}
      </h2>
      <p className="mt-2 text-sm text-muted-foreground">
        {draft.tierCount} tiers · saved {formatRelative(draft.updatedAt)}
      </p>

      <div className="mt-6 flex flex-wrap gap-3">
        <Button asChild>
          <Link href="/dashboard/plans/new">
            Resume builder
            <ArrowRight className="ml-2 h-4 w-4" />
          </Link>
        </Button>
        <Button
          variant="ghost"
          className="text-destructive hover:bg-destructive/10 hover:text-destructive"
          onClick={() => setConfirmOpen(true)}
          disabled={pending}
        >
          <Trash2 className="mr-2 h-4 w-4" />
          Delete draft
        </Button>
      </div>

      {confirmOpen ? (
        <div className="mt-6 rounded-md border border-destructive/40 bg-destructive/5 p-4">
          <p className="text-sm font-semibold">Delete this draft?</p>
          <p className="mt-1 text-sm text-muted-foreground">
            This can&apos;t be undone. Your answers will be lost.
          </p>
          <div className="mt-3 flex gap-2">
            <Button variant="destructive" size="sm" onClick={onDelete} disabled={pending}>
              {pending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Deleting…
                </>
              ) : (
                'Delete draft'
              )}
            </Button>
            <Button variant="outline" size="sm" onClick={() => setConfirmOpen(false)} disabled={pending}>
              Keep draft
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function formatRelative(at: Date): string {
  const diffSec = Math.max(0, Math.floor((Date.now() - new Date(at).getTime()) / 1000));
  if (diffSec < 10) return 'just now';
  if (diffSec < 60) return `${diffSec}s ago`;
  const minutes = Math.floor(diffSec / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
