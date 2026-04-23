import { Button } from '@/components/ui/button';
import { ArrowRight } from 'lucide-react';
import Link from 'next/link';
import { getActiveDraft } from '@/app/actions/plans';
import { DraftCard } from '@/components/builder/draft-card';

export default async function DashboardHome() {
  const draft = await getActiveDraft();

  if (draft) {
    return (
      <div className="mx-auto mt-8 max-w-[480px]">
        <DraftCard
          draft={{
            planId: draft.planId,
            tierCount: draft.tierCount,
            updatedAt: draft.updatedAt,
          }}
        />
      </div>
    );
  }

  return (
    <div className="mx-auto mt-8 max-w-[480px] text-center">
      <h1 className="text-[28px] font-semibold leading-[1.2]">Build your first wellness plan</h1>
      <p className="mt-4 text-sm text-muted-foreground">
        Answer 8 questions. See your break-even math update live. Save a draft whenever you want.
      </p>
      <Button asChild className="mt-8">
        <Link href="/dashboard/plans/new">
          Start plan builder
          <ArrowRight className="ml-2 h-4 w-4" />
        </Link>
      </Button>
    </div>
  );
}
