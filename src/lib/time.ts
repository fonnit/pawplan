/**
 * Phase 6 (DASH-06) — time-zone render helper.
 *
 * Rule: storage is UTC (Postgres timestamptz), display is clinic-local.
 * This module is the ONLY sanctioned place the dashboard renders a date.
 * Hand-formatting Date.toLocaleString() elsewhere is a bug — it uses the
 * server's timezone (Vercel = UTC) not the clinic's.
 *
 * Implementation: Node 22 ships full ICU, so Intl.DateTimeFormat accepts
 * any IANA zone. No polyfill, no date-fns-tz dependency.
 *
 * Jan 31 / Feb 28 / DST edge cases: we render whatever UTC instant Stripe
 * gives us — the locale formatter handles DST transitions. We do NOT
 * compute "next month" here; that's Stripe's job via currentPeriodEnd.
 */

/**
 * Format an absolute instant in the clinic's wall time.
 *
 * @param date  a Date (or ISO-8601 string) stored in UTC
 * @param timezone  IANA id from Clinic.timezone (default 'America/New_York')
 * @param variant  'date' → "Apr 23, 2026"; 'datetime' → "Apr 23, 2026, 10:04 AM"
 */
export function formatInClinicTz(
  date: Date | string | null | undefined,
  timezone: string,
  variant: 'date' | 'datetime' = 'date',
): string {
  if (!date) return '—';
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return '—';

  const options: Intl.DateTimeFormatOptions =
    variant === 'datetime'
      ? {
          year: 'numeric',
          month: 'short',
          day: 'numeric',
          hour: 'numeric',
          minute: '2-digit',
          timeZone: timezone,
        }
      : {
          year: 'numeric',
          month: 'short',
          day: 'numeric',
          timeZone: timezone,
        };

  try {
    return new Intl.DateTimeFormat('en-US', options).format(d);
  } catch {
    // Invalid timezone id — fall back to UTC so dates don't become "—".
    return new Intl.DateTimeFormat('en-US', { ...options, timeZone: 'UTC' }).format(d);
  }
}

/**
 * Derive the start of the current billing period for a member.
 *
 * Rule (PITFALLS): never compute from wall clock. Stripe's
 * `subscription.current_period_end` is the anchor; we subtract one calendar
 * month to recover the period start. Returns null if the member has no
 * currentPeriodEnd mirrored yet (common for brand-new members between
 * checkout.session.completed and the first invoice.paid).
 *
 * Month arithmetic handles day-of-month rollover correctly: Mar 31 →
 * Feb 28 (or 29 on leap years). Date's setMonth clamps automatically.
 */
export function billingPeriodStartFrom(
  currentPeriodEnd: Date | null | undefined,
): Date | null {
  if (!currentPeriodEnd) return null;
  const d = new Date(currentPeriodEnd);
  if (Number.isNaN(d.getTime())) return null;
  const start = new Date(d);
  start.setUTCMonth(start.getUTCMonth() - 1);
  return start;
}
