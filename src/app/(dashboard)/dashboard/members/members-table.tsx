'use client';

import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { cancelMember, type MemberRow } from '@/app/actions/members';
import { formatInClinicTz } from '@/lib/time';
import { RedemptionPanel } from '@/components/dashboard/redemption-panel';

type StatusFilter = 'all' | 'active' | 'past_due' | 'canceled';

const STATUS_LABELS: Record<MemberRow['status'], string> = {
  active: 'Active',
  past_due: 'Past due',
  canceled: 'Canceled',
};

const STATUS_BADGE_CLASS: Record<MemberRow['status'], string> = {
  active: 'bg-[#E7F3EE] text-[#1F5A4D]',
  past_due: 'bg-[#FCE8E0] text-[#8A3516]', // attention-grabbing, DASH-03
  canceled: 'bg-[#ECEAE4] text-[#4A4946]',
};

interface MembersTableProps {
  initialMembers: MemberRow[];
  /** IANA id from Clinic.timezone — all dates render in this zone (DASH-06). */
  timezone: string;
}

export function MembersTable({ initialMembers, timezone }: MembersTableProps) {
  const [filter, setFilter] = useState<StatusFilter>('all');
  const [members, setMembers] = useState(initialMembers);
  const [isPending, startTransition] = useTransition();
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const filtered =
    filter === 'all' ? members : members.filter((m) => m.status === filter);

  const pastDueCount = members.filter((m) => m.status === 'past_due').length;

  const onConfirmCancel = (memberId: string) => {
    startTransition(async () => {
      const result = await cancelMember(memberId);
      if (!result.ok) {
        toast.error(result.error);
      } else {
        toast.success(
          'Member will be canceled at the end of the current billing period.',
        );
        setMembers((prev) =>
          prev.map((m) =>
            m.id === memberId ? { ...m, canceledAt: result.canceledAt } : m,
          ),
        );
      }
      setConfirmingId(null);
    });
  };

  return (
    <div>
      {/* Filter bar */}
      <div
        className="mb-4 flex flex-wrap gap-2"
        role="group"
        aria-label="Filter members by status"
      >
        {(['all', 'active', 'past_due', 'canceled'] as StatusFilter[]).map((f) => {
          const count =
            f === 'all'
              ? members.length
              : members.filter((m) => m.status === f).length;
          const label =
            f === 'all'
              ? 'All'
              : f === 'past_due'
                ? `Past due (${pastDueCount})`
                : STATUS_LABELS[f];
          return (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              className={[
                'rounded-full border px-3 py-1 text-sm transition-colors',
                filter === f
                  ? 'border-[#2F7D6E] bg-[#2F7D6E] text-white'
                  : 'border-[#E8E6E0] bg-white text-[#1C1B18] hover:bg-[#F6F4EF]',
              ].join(' ')}
            >
              {f === 'all' ? `${label} (${count})` : label}
            </button>
          );
        })}
      </div>

      {/* Table */}
      {filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[#E8E6E0] p-8 text-center text-sm text-[#6B6A63]">
          No members match this filter.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-[#E8E6E0] bg-white">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-[#E8E6E0] bg-[#F6F4EF]">
              <tr>
                <th scope="col" className="w-10 px-2 py-3" aria-label="Expand" />
                <th scope="col" className="px-4 py-3 font-medium text-[#6B6A63]">
                  Pet
                </th>
                <th scope="col" className="px-4 py-3 font-medium text-[#6B6A63]">
                  Owner email
                </th>
                <th scope="col" className="px-4 py-3 font-medium text-[#6B6A63]">
                  Plan
                </th>
                <th scope="col" className="px-4 py-3 font-medium text-[#6B6A63]">
                  Status
                </th>
                <th scope="col" className="px-4 py-3 font-medium text-[#6B6A63]">
                  Services
                </th>
                <th scope="col" className="px-4 py-3 font-medium text-[#6B6A63]">
                  Enrolled
                </th>
                <th scope="col" className="px-4 py-3 font-medium text-[#6B6A63]">
                  Next renewal
                </th>
                <th
                  scope="col"
                  className="px-4 py-3 text-right font-medium text-[#6B6A63]"
                >
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((m) => {
                const isCanceling = !!m.canceledAt && m.status !== 'canceled';
                const isExpanded = expandedId === m.id;
                const remaining = m.includedServices.length - m.redeemedServiceKeys.length;
                return (
                  <>
                    <tr
                      key={m.id}
                      className="border-b border-[#E8E6E0] last:border-b-0"
                    >
                      <td className="px-2 py-3">
                        <button
                          type="button"
                          onClick={() => setExpandedId(isExpanded ? null : m.id)}
                          aria-label={isExpanded ? 'Collapse services' : 'Expand services'}
                          aria-expanded={isExpanded}
                          className="rounded p-1 text-[#6B6A63] hover:bg-[#F6F4EF] hover:text-[#1C1B18]"
                        >
                          {isExpanded ? (
                            <ChevronDown className="h-4 w-4" />
                          ) : (
                            <ChevronRight className="h-4 w-4" />
                          )}
                        </button>
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-medium text-[#1C1B18]">{m.petName}</div>
                        <div className="text-xs capitalize text-[#6B6A63]">
                          {m.species}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-[#1C1B18]">{m.ownerEmail}</td>
                      <td className="px-4 py-3 text-[#1C1B18]">{m.tierName}</td>
                      <td className="px-4 py-3">
                        <span
                          className={[
                            'inline-flex rounded-full px-2 py-0.5 text-xs font-medium',
                            STATUS_BADGE_CLASS[m.status],
                          ].join(' ')}
                        >
                          {STATUS_LABELS[m.status]}
                        </span>
                        {isCanceling && (
                          <div className="mt-1 text-xs text-[#6B6A63]">
                            Cancels {formatInClinicTz(m.currentPeriodEnd, timezone)}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs tabular-nums text-[#6B6A63]">
                        {m.includedServices.length > 0
                          ? `${remaining} / ${m.includedServices.length}`
                          : '—'}
                      </td>
                      <td className="px-4 py-3 text-[#6B6A63]">
                        {formatInClinicTz(m.enrolledAt, timezone)}
                      </td>
                      <td className="px-4 py-3 text-[#6B6A63]">
                        {formatInClinicTz(m.currentPeriodEnd, timezone)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {m.status === 'canceled' || isCanceling ? (
                          <span className="text-xs text-[#6B6A63]">—</span>
                        ) : confirmingId === m.id ? (
                          <span className="inline-flex gap-2">
                            <button
                              type="button"
                              disabled={isPending}
                              onClick={() => onConfirmCancel(m.id)}
                              className="rounded-md bg-[#8A3516] px-2 py-1 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-50"
                            >
                              {isPending ? 'Canceling…' : 'Confirm cancel'}
                            </button>
                            <button
                              type="button"
                              disabled={isPending}
                              onClick={() => setConfirmingId(null)}
                              className="rounded-md border border-[#E8E6E0] px-2 py-1 text-xs text-[#1C1B18] hover:bg-[#F6F4EF]"
                            >
                              Nevermind
                            </button>
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setConfirmingId(m.id)}
                            className="rounded-md border border-[#E8E6E0] px-2 py-1 text-xs text-[#1C1B18] hover:bg-[#F6F4EF]"
                          >
                            Cancel
                          </button>
                        )}
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr key={`${m.id}-expand`} className="border-b border-[#E8E6E0] bg-[#FBFAF7]">
                        <td colSpan={9}>
                          <RedemptionPanel
                            memberId={m.id}
                            includedServices={m.includedServices}
                            initialRedeemed={m.redeemedServiceKeys}
                            billingPeriodLabel={
                              m.billingPeriodStart
                                ? formatInClinicTz(m.billingPeriodStart, timezone)
                                : null
                            }
                          />
                        </td>
                      </tr>
                    )}
                  </>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
