import { formatUsdFromCents } from '@/lib/metrics';
import { formatInClinicTz } from '@/lib/time';
import type { DashboardMetrics } from '@/app/actions/metrics';

/**
 * Dashboard metrics panel (DASH-01).
 *
 * Pure server component — no client state. Re-renders on every dashboard
 * load via force-dynamic upstream. Design follows the existing
 * BreakEvenLineItems card visual language: off-white panels, sage accent,
 * mono numbers for dollar amounts.
 */
export function DashboardMetricsCards({
  metrics,
}: {
  metrics: DashboardMetrics;
}) {
  const { mrr, projectedArrCents, renewalForecast, tierBreakdown, pastDueCount, timezone } = metrics;
  return (
    <section aria-label="Business metrics" className="mb-10">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* Active members */}
        <Card title="Active members" value={String(mrr.activeMemberCount)}>
          {pastDueCount > 0 && (
            <p className="mt-2 text-xs text-[#8A3516]">{pastDueCount} past due</p>
          )}
        </Card>

        {/* MRR */}
        <Card title="MRR (net)" value={formatUsdFromCents(mrr.netCents)}>
          <dl className="mt-3 space-y-1 text-xs text-[#6B6A63]">
            <div className="flex justify-between">
              <dt>Gross</dt>
              <dd className="font-mono tabular-nums text-[#1C1B18]">
                {formatUsdFromCents(mrr.grossCents)}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt>− Est. Stripe fees</dt>
              <dd className="font-mono tabular-nums text-[#1C1B18]">
                {formatUsdFromCents(mrr.stripeFeesCents)}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt>− Platform fee (10%)</dt>
              <dd className="font-mono tabular-nums text-[#1C1B18]">
                {formatUsdFromCents(mrr.platformFeeCents)}
              </dd>
            </div>
          </dl>
        </Card>

        {/* Projected ARR */}
        <Card title="Projected ARR" value={formatUsdFromCents(projectedArrCents)}>
          <p className="mt-2 text-xs text-[#6B6A63]">Gross MRR × 12</p>
        </Card>

        {/* 30-day renewal forecast */}
        <Card
          title="30-day renewals"
          value={String(renewalForecast.count)}
        >
          <p className="mt-2 text-xs text-[#6B6A63]">
            {formatUsdFromCents(renewalForecast.grossCents)} expected
          </p>
          <p className="mt-1 text-[11px] text-[#6B6A63]">
            Window closes {formatInClinicTz(renewalForecast.windowEnd, timezone)}
          </p>
        </Card>
      </div>

      {/* Tier breakdown */}
      {tierBreakdown.length > 0 && (
        <div className="mt-6 rounded-xl border border-[#E8E6E0] bg-white p-5">
          <h3 className="mb-3 text-sm font-medium text-[#1C1B18]">Plan tier breakdown</h3>
          <ul className="space-y-2">
            {tierBreakdown.map((row) => (
              <li
                key={row.tierId}
                className="flex items-center justify-between text-sm"
              >
                <span className="text-[#1C1B18]">{row.tierName}</span>
                <span className="flex items-baseline gap-3 font-mono tabular-nums">
                  <span className="text-xs text-[#6B6A63]">{row.memberCount} members</span>
                  <span className="text-[#1C1B18]">{formatUsdFromCents(row.mrrCents)}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

function Card({
  title,
  value,
  children,
}: {
  title: string;
  value: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-[#E8E6E0] bg-white p-5">
      <h3 className="text-xs font-medium uppercase tracking-wide text-[#6B6A63]">
        {title}
      </h3>
      <p className="mt-2 font-mono text-2xl tabular-nums text-[#1C1B18]">{value}</p>
      {children}
    </div>
  );
}
