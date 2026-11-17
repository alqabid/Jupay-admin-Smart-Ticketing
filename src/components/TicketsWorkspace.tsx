import { useMemo, useState } from 'react';
import {
  CheckCircle2,
  Clock,
  RefreshCw,
  Search,
  ShieldCheck,
} from 'lucide-react';
import type { StaffMember, Ticket, TicketStage } from '../types.ts';
import { SlaTimer } from './SlaTimer.tsx';
import {
  CorridorLine,
  NameDiffStrip,
  SlaProgressBar,
  StaffInitialsCluster,
} from './VisualPrimitives.tsx';

interface TicketsWorkspaceProps {
  tickets: Ticket[];
  staff: StaffMember[];
  nowMs: number;
  onSelectTicket: (ticket: Ticket) => void;
  onQuickAction: (
    ticketId: string,
    actionType: 'retrigger_payout' | 'confirm_compliance_release'
  ) => Promise<void>;
}

const STAGE_FILTERS: Array<'All' | TicketStage> = [
  'All',
  'Open',
  'In Progress (with Ops)',
  'Resolved',
  'Closed',
];

export function TicketsWorkspace({
  tickets,
  staff,
  nowMs,
  onSelectTicket,
  onQuickAction,
}: TicketsWorkspaceProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [stageFilter, setStageFilter] = useState<'All' | TicketStage>('All');
  const [busyTicketId, setBusyTicketId] = useState<string | null>(null);

  const pinnedEscalations = useMemo(
    () =>
      tickets.filter(
        (t) => t.pinned_escalation && t.stage !== 'Resolved' && t.stage !== 'Closed'
      ),
    [tickets]
  );

  const filteredTickets = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return tickets.filter((t) => {
      const matchesStage = stageFilter === 'All' || t.stage === stageFilter;
      const matchesSearch =
        !q ||
        t.id.toLowerCase().includes(q) ||
        t.transaction_id.toLowerCase().includes(q) ||
        t.transfer.sender_name.toLowerCase().includes(q) ||
        t.transfer.receiver_name.toLowerCase().includes(q) ||
        t.transfer.receiver_kyc_name.toLowerCase().includes(q) ||
        t.transfer.sender_phone.toLowerCase().includes(q) ||
        t.transfer.receiver_phone.toLowerCase().includes(q) ||
        t.transfer.destination_city.toLowerCase().includes(q) ||
        t.transfer.receiver_network.toLowerCase().includes(q) ||
        (t.assigned_to_name ?? '').toLowerCase().includes(q);
      return matchesStage && matchesSearch;
    });
  }, [tickets, searchQuery, stageFilter]);

  const activeOnShiftCount = staff.filter((s) => s.is_active && s.on_shift).length;
  const activeQueueCount = tickets.filter(
    (t) => t.stage === 'Open' || t.stage === 'In Progress (with Ops)'
  ).length;
  const resolvedCount = tickets.filter(
    (t) => t.stage === 'Resolved' || t.stage === 'Closed'
  ).length;

  const activeGhsVolume = tickets
    .filter((t) => t.stage !== 'Resolved' && t.stage !== 'Closed')
    .reduce((acc, t) => acc + t.transfer.ghs_amount, 0);

  const handleOneClickResolve = async (
    e: React.MouseEvent,
    ticket: Ticket,
    actionType: 'retrigger_payout' | 'confirm_compliance_release'
  ) => {
    e.stopPropagation();
    setBusyTicketId(ticket.id);
    await onQuickAction(ticket.id, actionType);
    setBusyTicketId(null);
  };

  return (
    <div className="space-y-8">
      {/* Unified Summary Bar */}
      <div className="card-surface rounded-xl grid grid-cols-2 lg:grid-cols-4 divide-y lg:divide-y-0 lg:divide-x divide-[#EEF2F7]">
        <div className="p-5">
          <div className="text-xs text-[#506690]">Flagged Escalations</div>
          <div className="text-2xl font-semibold text-[#C62828] mt-1 tabular-nums">
            {pinnedEscalations.length}
          </div>
          <div className="text-xs text-[#869ab8] mt-1">Locked with live SLA</div>
        </div>

        <div className="p-5">
          <div className="text-xs text-[#506690]">Active Queue</div>
          <div className="text-2xl font-semibold text-[#161c2d] mt-1 tabular-nums">
            {activeQueueCount}
          </div>
          <div className="text-xs text-[#869ab8] mt-1">{resolvedCount} resolved today</div>
        </div>

        <div className="p-5">
          <div className="text-xs text-[#506690]">Held Payout Volume</div>
          <div className="text-2xl font-semibold text-[#161c2d] mt-1 tabular-nums">
            GHS {activeGhsVolume.toLocaleString('en-GH')}
          </div>
          <div className="text-xs text-[#869ab8] mt-1">MoMo, Telecel, AirtelTigo, Bank</div>
        </div>

        <div className="p-5 flex items-center justify-between gap-3">
          <div>
            <div className="text-xs text-[#506690]">On-Shift Officers</div>
            <div className="text-2xl font-semibold text-[#14426b] mt-1 tabular-nums">
              {activeOnShiftCount}
            </div>
            <div className="text-xs text-[#869ab8] mt-1">
              {staff.length - activeOnShiftCount} excluded
            </div>
          </div>
          <StaffInitialsCluster staff={staff} />
        </div>
      </div>

      {/* Flagged Escalations */}
      <section aria-labelledby="flagged-heading" className="space-y-3.5">
        <div className="flex items-center justify-between gap-4">
          <h2 id="flagged-heading" className="text-sm font-semibold text-[#161c2d]">
            Flagged Escalations ({pinnedEscalations.length})
          </h2>
          <span className="text-xs text-[#869ab8]">Pinned above queue</span>
        </div>

        {pinnedEscalations.length === 0 ? (
          <div className="card-surface rounded-xl p-8 text-center text-sm text-[#506690]">
            No active escalations pending.
          </div>
        ) : (
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            {pinnedEscalations.map((ticket) => {
              const t = ticket.transfer;
              const isCompliance = t.flag_type === 'compliance_mismatch';
              const isBusy = busyTicketId === ticket.id;

              return (
                <div
                  key={ticket.id}
                  onClick={() => onSelectTicket(ticket)}
                  className="card-surface hover:border-[#CBD5E1] rounded-xl p-5 cursor-pointer transition-all duration-150 flex flex-col justify-between gap-4"
                >
                  <div className="space-y-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2 text-xs text-[#506690] min-w-0">
                        <span className="font-mono font-medium text-[#161c2d]">{ticket.id}</span>
                        <span aria-hidden="true">·</span>
                        <span className="font-mono">{ticket.transaction_id}</span>
                        <span aria-hidden="true">·</span>
                        <span className="truncate">{ticket.issue_category}</span>
                      </div>
                      <SlaTimer
                        deadlineIso={ticket.sla_deadline}
                        stage={ticket.stage}
                        nowMs={nowMs}
                      />
                    </div>

                    <div className="flex items-baseline justify-between gap-3">
                      <CorridorLine transfer={t} />
                      <span className="text-sm font-semibold text-[#161c2d] tabular-nums shrink-0">
                        GHS {t.ghs_amount.toLocaleString('en-GH', { minimumFractionDigits: 2 })}
                      </span>
                    </div>

                    <div className="text-xs text-[#506690]">
                      {t.sender_country} ({t.source_currency} {t.source_amount}) · {t.receiver_network} ·{' '}
                      {t.destination_city} · Owner: {ticket.assigned_to_name || 'Unassigned'}
                    </div>

                    {isCompliance && <NameDiffStrip transfer={t} />}

                    <SlaProgressBar
                      deadlineIso={ticket.sla_deadline}
                      slaMinutes={ticket.sla_minutes}
                      stage={ticket.stage}
                      nowMs={nowMs}
                    />
                  </div>

                  <div className="flex items-center justify-between gap-3 pt-1">
                    <span className="text-xs text-[#869ab8]">{ticket.stage}</span>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelectTicket(ticket);
                        }}
                        className="px-3 py-1.5 text-xs font-medium text-[#506690] hover:text-[#161c2d] hover:bg-[#F7F9FC] rounded-lg transition-colors whitespace-nowrap"
                      >
                        Inspect
                      </button>

                      {isCompliance ? (
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={(e) =>
                            handleOneClickResolve(e, ticket, 'confirm_compliance_release')
                          }
                          className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium text-white bg-[#14426b] hover:bg-[#0e2e4b] rounded-lg transition-colors disabled:opacity-50 whitespace-nowrap"
                        >
                          <ShieldCheck className="w-3.5 h-3.5" />
                          <span>{isBusy ? 'Releasing...' : 'Confirm & Release'}</span>
                        </button>
                      ) : (
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={(e) => handleOneClickResolve(e, ticket, 'retrigger_payout')}
                          className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium text-white bg-[#14426b] hover:bg-[#0e2e4b] rounded-lg transition-colors disabled:opacity-50 whitespace-nowrap"
                        >
                          <RefreshCw className="w-3.5 h-3.5" />
                          <span>
                            {isBusy ? 'Re-triggering...' : `Re-trigger ${t.receiver_network}`}
                          </span>
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Complaint Ticket Queue */}
      <section aria-labelledby="queue-heading" className="space-y-3.5">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <h2 id="queue-heading" className="text-sm font-semibold text-[#161c2d]">
            All Tickets ({filteredTickets.length})
          </h2>

          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <div className="relative">
              <Search className="w-4 h-4 text-[#869ab8] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by name, phone, or ID..."
                className="w-full sm:w-60 pl-9 pr-3 py-1.5 text-xs bg-white border border-[#E6EBF2] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#14426b]/15 focus:border-[#14426b]"
              />
            </div>

            <div className="flex items-center gap-1 p-1 bg-[#EEF2F7] rounded-lg overflow-x-auto">
              {STAGE_FILTERS.map((stage) => (
                <button
                  key={stage}
                  type="button"
                  onClick={() => setStageFilter(stage)}
                  className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors duration-150 whitespace-nowrap shrink-0 ${
                    stageFilter === stage
                      ? 'bg-white text-[#14426b] shadow-sm'
                      : 'text-[#506690] hover:text-[#161c2d]'
                  }`}
                >
                  {stage}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="card-surface rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-[#EEF2F7] text-xs font-medium text-[#869ab8]">
                  <th className="py-3.5 px-5">Ticket</th>
                  <th className="py-3.5 px-5">Transfer</th>
                  <th className="py-3.5 px-5 text-right">Amount</th>
                  <th className="py-3.5 px-5">Stage</th>
                  <th className="py-3.5 px-5">Owner</th>
                  <th className="py-3.5 px-5">SLA</th>
                  <th className="py-3.5 px-5 text-right" />
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F1F5F9] text-sm">
                {filteredTickets.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-10 text-center text-sm text-[#506690]">
                      No tickets match this filter.
                    </td>
                  </tr>
                ) : (
                  filteredTickets.map((ticket) => {
                    const t = ticket.transfer;
                    return (
                      <tr
                        key={ticket.id}
                        onClick={() => onSelectTicket(ticket)}
                        className="hover:bg-[#F9FBFE] cursor-pointer transition-colors duration-150"
                      >
                        <td className="py-4 px-5 whitespace-nowrap">
                          <div className="font-mono text-xs font-medium text-[#161c2d]">
                            {ticket.id}
                          </div>
                          <div className="font-mono text-xs text-[#869ab8]">
                            {ticket.transaction_id}
                          </div>
                        </td>
                        <td className="py-4 px-5">
                          <CorridorLine transfer={t} />
                          <div className="text-xs text-[#869ab8] mt-0.5">
                            {t.sender_country} · {t.receiver_network} · {t.destination_city}
                          </div>
                        </td>
                        <td className="py-4 px-5 text-right text-sm font-medium text-[#161c2d] tabular-nums whitespace-nowrap">
                          GHS {t.ghs_amount.toLocaleString('en-GH', { minimumFractionDigits: 2 })}
                        </td>
                        <td className="py-4 px-5 whitespace-nowrap">
                          {ticket.stage === 'Resolved' || ticket.stage === 'Closed' ? (
                            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-[#2E7D32]">
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              <span>{ticket.stage}</span>
                            </span>
                          ) : ticket.stage === 'In Progress (with Ops)' ? (
                            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-[#B45309]">
                              <Clock className="w-3.5 h-3.5" />
                              <span>{ticket.stage}</span>
                            </span>
                          ) : (
                            <span className="text-xs font-medium text-[#506690]">
                              {ticket.stage}
                            </span>
                          )}
                        </td>
                        <td className="py-4 px-5 text-xs text-[#506690] whitespace-nowrap">
                          {ticket.assigned_to_name || 'Unassigned'}
                        </td>
                        <td className="py-4 px-5 whitespace-nowrap">
                          <SlaTimer
                            deadlineIso={ticket.sla_deadline}
                            stage={ticket.stage}
                            nowMs={nowMs}
                            compact
                          />
                        </td>
                        <td className="py-4 px-5 text-right whitespace-nowrap">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onSelectTicket(ticket);
                            }}
                            className="px-3 py-1.5 text-xs font-medium text-[#14426b] hover:bg-[#F0F4F9] rounded-lg transition-colors whitespace-nowrap"
                          >
                            Open
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </div>
  );
}
