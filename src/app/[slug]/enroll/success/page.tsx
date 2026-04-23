import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getPublishedPlan } from '@/lib/enrollment/getPublishedPlan';
import { ClinicHeader } from '@/components/enrollment/clinic-header';

// This page is rendered AFTER Stripe Checkout succeeds. It is allowed to
// be dynamic (not ISR) because the user lands here once per enrollment
// with a one-off session ID in the query string. The Member row is NOT
// created here — it's created by the webhook (plan 04-03). This page
// simply acknowledges the completed Checkout and shows the clinic header.
//
// The `cs` (Checkout session id) query param is NOT read in v1 — we
// deliberately avoid making an inline Stripe API call here because:
//   (a) the webhook is the source of truth for "active";
//   (b) a failed webhook would otherwise be masked by the success page
//       showing green. If the owner wants a "verify" button, that's a
//       Phase 6 dashboard concern.
export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ cs?: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const snapshot = await getPublishedPlan(slug);
  if (!snapshot) return { title: 'Enrollment confirmed' };
  return {
    title: `Welcome to ${snapshot.clinicPracticeName}`,
  };
}

export default async function EnrollSuccessPage({ params }: PageProps) {
  const { slug } = await params;
  const snapshot = await getPublishedPlan(slug);
  if (!snapshot) notFound();

  return (
    <main className="mx-auto max-w-2xl px-4 py-16 text-center sm:px-6">
      <ClinicHeader
        practiceName={snapshot.clinicPracticeName}
        logoUrl={snapshot.clinicLogoUrl}
        accentColor={snapshot.clinicAccentColor}
      />
      <div className="mt-12 rounded-xl border border-[#E8E6E0] bg-white p-8">
        <h1 className="text-2xl font-semibold text-[#1C1B18]">You&apos;re enrolled.</h1>
        <p className="mt-3 text-[#6B6A63]">
          Your first payment is confirmed. {snapshot.clinicPracticeName} will email you a
          welcome packet shortly with the full list of services included in your plan.
        </p>
        <p className="mt-3 text-sm text-[#6B6A63]">
          If you have questions, reach out to {snapshot.clinicPracticeName} directly — their
          staff can answer anything about the plan.
        </p>
      </div>
      <footer className="mt-16 text-center text-xs text-[#6B6A63]">
        Secure payments powered by Stripe · PawPlan
      </footer>
    </main>
  );
}
