import Image from 'next/image';
import type { AccentColor } from '@prisma/client';

/**
 * The 6-preset accent palette locked in Phase 1 UI-SPEC. All WCAG-AA for
 * white text on the hex swatch. Duplicated in tier-comparison.tsx — any
 * changes must be mirrored.
 */
const ACCENT_HEX: Record<AccentColor, string> = {
  sage: '#2F7D6E',
  terracotta: '#B85A3C',
  midnight: '#2B3A55',
  wine: '#8B2E4E',
  forest: '#3D5E3A',
  clay: '#7A5230',
};

interface ClinicHeaderProps {
  practiceName: string;
  logoUrl: string | null;
  accentColor: AccentColor;
}

export function ClinicHeader({ practiceName, logoUrl, accentColor }: ClinicHeaderProps) {
  const accent = ACCENT_HEX[accentColor];
  return (
    <header className="mb-12 sm:mb-16">
      {/* Hero bar in the clinic's accent color (PUB-05). */}
      <div className="h-2 rounded-full" style={{ backgroundColor: accent }} aria-hidden />
      <div className="mt-6 flex flex-col items-center gap-4 sm:flex-row sm:items-center sm:gap-6">
        {logoUrl && (
          <div className="relative h-16 w-16 shrink-0 sm:h-20 sm:w-20">
            <Image
              src={logoUrl}
              alt={`${practiceName} logo`}
              fill
              sizes="80px"
              className="rounded-md object-contain"
              unoptimized
            />
          </div>
        )}
        <div className="text-center sm:text-left">
          <h1 className="text-3xl font-semibold tracking-tight text-[#1C1B18] sm:text-4xl">
            {practiceName}
          </h1>
          <p className="mt-1 text-base text-[#6B6A63]">Wellness membership plans</p>
        </div>
      </div>
    </header>
  );
}
