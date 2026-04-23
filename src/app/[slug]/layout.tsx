import type { ReactNode } from 'react';
import { Toaster } from '@/components/ui/sonner';

/**
 * Public per-clinic layout (Phase 3 PUB-05).
 *
 * Intentionally minimal — no nav, no auth, no session. Sits at /[slug]/* so
 * future public pages (success, signup success, etc.) slot in here without
 * leaking into the authenticated /dashboard route group.
 *
 * Colors are hard-coded to the PawPlan palette (Phase 1 UI-SPEC). Clinic
 * accent only tints the hero bar / CTA border / "Most popular" ribbon inside
 * the page content — NOT the whole page chrome.
 *
 * Toaster is mounted here so the Phase-3 CTA stub's toast.info notification
 * renders (Phase 4 replaces the stub with a Checkout redirect).
 */
export default function PublicClinicLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-[#FAFAF7] text-[#1C1B18]">
      {children}
      <Toaster />
    </div>
  );
}
