import type {
  BreakEvenResult,
  PlanBuilderInputs,
  ServiceKey,
  TierKey,
} from './types';

export const PLATFORM_FEE_PCT = 10;
export const STRIPE_FEE_PCT = 2.9;
export const STRIPE_FEE_FIXED_CENTS = 30;
export const DEFAULT_OVERHEAD_USD = 500;

export const DEFAULT_TIER_SERVICES: Record<TierKey, ServiceKey[]> = {
  preventive: ['annual-exam', 'core-vaccines'],
  'preventive-plus': ['annual-exam', 'core-vaccines', 'dental-cleaning'],
  complete: [
    'annual-exam',
    'core-vaccines',
    'dental-cleaning',
    'heartworm-prevention',
    'flea-tick-prevention',
  ],
};

// RED stub — replaced in Task 2 (GREEN).
export function computeBreakEven(_inputs: PlanBuilderInputs): BreakEvenResult {
  throw new Error('not implemented');
}
