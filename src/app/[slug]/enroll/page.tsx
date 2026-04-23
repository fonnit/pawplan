import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getPublishedPlan } from '@/lib/enrollment/getPublishedPlan';
import { ClinicHeader } from '@/components/enrollment/clinic-header';
import { TierComparison } from '@/components/enrollment/tier-comparison';

// ISR: regenerate every 5 minutes as a safety net. Tag-based invalidation
// (clinic:{slug}) is primary — publishPlan / updatePlanPrices fire it.
export const revalidate = 300;

// No generateStaticParams — the slug set grows as clinics sign up. With
// dynamicParams = true, ISR fills the cache on first hit for a new slug.
export const dynamicParams = true;

interface PageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const snapshot = await getPublishedPlan(slug);
  if (!snapshot) return { title: 'Not found' };
  return {
    title: `${snapshot.clinicPracticeName} Wellness Plans`,
    description: `Monthly wellness membership plans from ${snapshot.clinicPracticeName}.`,
    openGraph: {
      title: `${snapshot.clinicPracticeName} Wellness Plans`,
      type: 'website',
    },
  };
}

export default async function EnrollPage({ params }: PageProps) {
  const { slug } = await params;
  const snapshot = await getPublishedPlan(slug);
  if (!snapshot) notFound();

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-12 lg:py-16">
      <ClinicHeader
        practiceName={snapshot.clinicPracticeName}
        logoUrl={snapshot.clinicLogoUrl}
        accentColor={snapshot.clinicAccentColor}
      />
      <TierComparison
        clinicSlug={snapshot.clinicSlug}
        clinicAccentColor={snapshot.clinicAccentColor}
        tiers={snapshot.tiers}
      />
      <footer className="mt-16 text-center text-sm text-[#6B6A63]">
        Secure payments powered by Stripe · PawPlan
      </footer>
    </main>
  );
}
