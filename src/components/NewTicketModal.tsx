import { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowUpRight,
  CheckCircle2,
  Clock,
  History,
  Search,
  ShieldCheck,
  X,
} from 'lucide-react';
import type { StaffMember, Ticket, TicketPriority, TransferRecord } from '../types.ts';
import { CorridorLine } from './VisualPrimitives.tsx';

interface NewTicketModalProps {
  isOpen: boolean;
  onClose: () => void;
  transfers: TransferRecord[];
  tickets: Ticket[];
  staff: StaffMember[];
  currentUser: StaffMember;
  initialTransactionId?: string;
  onInspectTicket?: (ticket: Ticket) => void;
  onCreateTicket: (payload: {
    transaction_id: string;
    issue_category: string;
    summary: string;
    priority: TicketPriority;
    escalate_to_ops: boolean;
    assigned_to_id: string | null;
    created_by_id: string;
  }) => Promise<{ error?: string }>;
}

const ISSUE_CATEGORIES = [
  'Delayed Wallet Payout',
  'Compliance Name-Mismatch Hold',
  'Bank Clearing Delay',
  'Duplicate Debit Inquiry',
  'Recipient Wallet Limit',
];

function formatShortDate(iso: string): string {
  const date = new Date(iso);
  const diffDays = Math.floor((Date.now() - date.getTime()) / (24 * 60 * 60_000));
  if (diffDays <= 0) {
    return date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  }
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 30) return `${diffDays}d ago`;
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

function getTicketsForTransferPerson(transfer: TransferRecord, allTickets: Ticket[]): Ticket[] {
  const senderLower = transfer.sender_name.toLowerCase();
  const receiverLower = transfer.receiver_name.toLowerCase();
  return allTickets
    .filter(
      (tk) =>
        tk.transaction_id === transfer.id ||
        tk.transfer.sender_name.toLowerCase() === senderLower ||
        tk.transfer.sender_phone === transfer.sender_phone ||
        tk.transfer.receiver_phone === transfer.receiver_phone ||
        tk.transfer.receiver_name.toLowerCase() === receiverLower
    )
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
}

function getResolutionInfo(ticket: Ticket) {
  const isSolved = ticket.stage === 'Resolved' || ticket.stage === 'Closed';
  const lastEvent = ticket.events[ticket.events.length - 1];
  return {
    isSolved,
    action: lastEvent?.action ?? ticket.stage,
    note: lastEvent?.note ?? '',
    actorName: lastEvent?.actor_name ?? ticket.assigned_to_name ?? 'Ops Team',
    when: formatShortDate(ticket.closed_at ?? ticket.resolved_at ?? ticket.created_at),
  };
}

export function NewTicketModal({
  isOpen,
  onClose,
  transfers,
  tickets,
  staff,
  currentUser,
  initialTransactionId = '',
  onInspectTicket,
  onCreateTicket,
}: NewTicketModalProps) {
  const [queryInput, setQueryInput] = useState(initialTransactionId);
  const [matchedTransfer, setMatchedTransfer] = useState<TransferRecord | null>(null);
  const [issueCategory, setIssueCategory] = useState(ISSUE_CATEGORIES[0]);
  const [priority, setPriority] = useState<TicketPriority>('High');
  const [assignedToId, setAssignedToId] = useState<string>('');
  const [summary, setSummary] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');

  const eligibleStaff = staff.filter((s) => s.is_active && s.on_shift);
  const excludedCount = staff.length - eligibleStaff.length;

  const selectTransfer = (found: TransferRecord) => {
    setMatchedTransfer(found);
    setQueryInput(`${found.id} · ${found.sender_name}`);
    if (found.flag_type === 'compliance_mismatch') {
      setIssueCategory('Compliance Name-Mismatch Hold');
      setPriority('Critical');
    } else if (found.flag_type === 'network_delay') {
      setIssueCategory('Delayed Wallet Payout');
      setPriority('High');
    } else if (found.flag_type === 'interbank_clearing') {
      setIssueCategory('Bank Clearing Delay');
      setPriority('Normal');
    }
    if (!summary) {
      setSummary(found.status_reason);
    }
    const preferredRole =
      found.flag_type === 'compliance_mismatch' ? 'Compliance' : 'Operations';
    const defaultOfficer =
      eligibleStaff.find((s) => s.role === preferredRole) ?? eligibleStaff[0];
    if (defaultOfficer && !assignedToId) {
      setAssignedToId(defaultOfficer.id);
    }
  };

  useEffect(() => {
    if (isOpen) {
      setMatchedTransfer(null);
      setQueryInput(initialTransactionId);
      setSubmitError('');
      setSummary('');
      if (initialTransactionId) {
        const exact = transfers.find(
          (t) => t.id.toUpperCase() === initialTransactionId.trim().toUpperCase()
        );
        if (exact) {
          selectTransfer(exact);
        }
      }
    }
  }, [isOpen, initialTransactionId]);

  const searchMatches = useMemo(() => {
    const q = queryInput.trim().toLowerCase();
    if (!q || matchedTransfer) return [];
    const cleanedTokens = q
      .replace(/\b(uncle|auntie|aunty|dr\.?|mr\.?|mrs\.?|ms\.?)\b/g, '')
      .trim()
      .split(/\s+/)
      .filter(Boolean);
    if (cleanedTokens.length === 0) return [];

    return transfers.filter((t) => {
      const haystack = [
        t.id,
        t.sender_name,
        t.receiver_name,
        t.receiver_kyc_name,
        t.sender_phone,
        t.receiver_phone,
        t.receiver_network,
        t.destination_city,
      ]
        .join(' ')
        .toLowerCase();
      return cleanedTokens.every((tok) => haystack.includes(tok));
    });
  }, [queryInput, transfers, matchedTransfer]);

  useEffect(() => {
    if (matchedTransfer) return;
    const trimmed = queryInput.trim().toUpperCase();
    if (!trimmed) return;
    const exactId = transfers.find((t) => t.id.toUpperCase() === trimmed);
    if (exactId) {
      selectTransfer(exactId);
    }
  }, [queryInput, transfers, matchedTransfer]);

  // Prior complaint history for either the selected transfer OR anyone matching the live search query
  const customerHistory = useMemo(() => {
    if (matchedTransfer) {
      return getTicketsForTransferPerson(matchedTransfer, tickets);
    }

    const q = queryInput.trim().toLowerCase();
    if (q.length < 2) return [];

    const cleanedTokens = q
      .replace(/\b(uncle|auntie|aunty|dr\.?|mr\.?|mrs\.?|ms\.?)\b/g, '')
      .trim()
      .split(/\s+/)
      .filter(Boolean);

    const seen = new Map<string, Ticket>();

    // 1. Include prior tickets of any person whose transfer matched the search
    for (const tx of searchMatches) {
      for (const tk of getTicketsForTransferPerson(tx, tickets)) {
        seen.set(tk.id, tk);
      }
    }

    // 2. Include tickets directly matching ticket ID, tx ID, name, or phone
    if (cleanedTokens.length > 0) {
      for (const tk of tickets) {
        const haystack = [
          tk.id,
          tk.transaction_id,
          tk.transfer.sender_name,
          tk.transfer.receiver_name,
          tk.transfer.receiver_kyc_name,
          tk.transfer.sender_phone,
          tk.transfer.receiver_phone,
        ]
          .join(' ')
          .toLowerCase();
        if (cleanedTokens.every((tok) => haystack.includes(tok))) {
          seen.set(tk.id, tk);
        }
      }
    }

    return Array.from(seen.values()).sort((a, b) => {
      const aSolved = a.stage === 'Resolved' || a.stage === 'Closed' ? 0 : 1;
      const bSolved = b.stage === 'Resolved' || b.stage === 'Closed' ? 0 : 1;
      if (aSolved !== bSolved) return aSolved - bSolved;
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
  }, [matchedTransfer, queryInput, searchMatches, tickets]);

  if (!isOpen) return null;

  const solvedHistoryCount = customerHistory.filter(
    (tk) => tk.stage === 'Resolved' || tk.stage === 'Closed'
  ).length;

  const handleSubmit = async (escalateToOps: boolean) => {
    if (!matchedTransfer) {
      setSubmitError('Search by sender name, receiver name, or Transaction ID first.');
      return;
    }
    setSubmitting(true);
    setSubmitError('');
    const result = await onCreateTicket({
      transaction_id: matchedTransfer.id,
      issue_category: issueCategory,
      summary: summary.trim() || matchedTransfer.status_reason,
      priority: escalateToOps && priority === 'Normal' ? 'High' : priority,
      escalate_to_ops: escalateToOps,
      assigned_to_id: assignedToId || null,
      created_by_id: currentUser.id,
    });
    setSubmitting(false);
    if (result.error) {
      setSubmitError(result.error);
      return;
    }
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#161c2d]/30 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="new-ticket-title"
    >
      <div className="w-full max-w-2xl bg-white border border-[#E6EBF2] rounded-xl overflow-hidden shadow-xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#EEF2F7]">
          <h2 id="new-ticket-title" className="text-base font-semibold text-[#161c2d]">
            New Complaint / Ticket
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="p-2 text-[#869ab8] hover:text-[#161c2d] rounded-lg hover:bg-[#F7F9FC] transition-colors"
            aria-label="Close modal"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 space-y-5 max-h-[78vh] overflow-y-auto">
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label htmlFor="tx-id-input" className="block text-xs font-medium text-[#506690]">
                Search by Name, Phone, or Transaction ID
              </label>
              {matchedTransfer && (
                <button
                  type="button"
                  onClick={() => {
                    setMatchedTransfer(null);
                    setQueryInput('');
                    setSummary('');
                  }}
                  className="text-xs font-medium text-[#14426b] hover:underline"
                >
                  Change transfer
                </button>
              )}
            </div>

            <div className="relative">
              <Search className="w-4 h-4 text-[#869ab8] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                id="tx-id-input"
                type="text"
                value={queryInput}
                onChange={(e) => {
                  setMatchedTransfer(null);
                  setQueryInput(e.target.value);
                  setSummary('');
                }}
                placeholder="Type Kwame, Grace, Ama, or JP-48213..."
                className="w-full pl-10 pr-4 py-2.5 text-sm bg-white border border-[#E6EBF2] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#14426b]/15 focus:border-[#14426b]"
                autoFocus
              />
            </div>

            {/* Live Typeahead Search Results by Name / ID */}
            {!matchedTransfer && queryInput.trim().length >= 2 && (
              <div className="mt-2 border border-[#E6EBF2] rounded-lg bg-white divide-y divide-[#F1F5F9] max-h-44 overflow-y-auto">
                {searchMatches.length === 0 ? (
                  <div className="px-3.5 py-2.5 text-xs text-[#869ab8]">
                    No transfer matching "{queryInput.trim()}"
                  </div>
                ) : (
                  searchMatches.map((tx) => {
                    const personHistory = getTicketsForTransferPerson(tx, tickets);
                    const solvedCount = personHistory.filter(
                      (tk) => tk.stage === 'Resolved' || tk.stage === 'Closed'
                    ).length;

                    return (
                      <button
                        key={tx.id}
                        type="button"
                        onClick={() => selectTransfer(tx)}
                        className="w-full text-left px-3.5 py-2.5 hover:bg-[#F7F9FC] transition-colors flex items-center justify-between gap-3"
                      >
                        <div className="min-w-0">
                          <div className="text-xs font-medium text-[#161c2d] truncate">
                            {tx.sender_name} → {tx.receiver_name}
                          </div>
                          <div className="text-[11px] text-[#869ab8] truncate">
                            <span className="font-mono text-[#14426b]">{tx.id}</span> ·{' '}
                            {tx.receiver_network} · {tx.destination_city}
                            {solvedCount > 0 && (
                              <span className="text-[#2E7D32] font-medium">
                                {' '}
                                · {solvedCount} solved prior
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <div className="text-xs font-semibold text-[#161c2d] tabular-nums">
                            GHS {tx.ghs_amount.toLocaleString('en-GH')}
                          </div>
                          <div className="text-[11px] text-[#506690]">{tx.transfer_status}</div>
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
            )}

            {!matchedTransfer && (
              <div className="flex flex-wrap items-center gap-2 mt-2 text-xs text-[#869ab8]">
                <span>Recent holds:</span>
                {transfers
                  .filter((t) => t.transfer_status !== 'Completed')
                  .slice(0, 3)
                  .map((tx) => (
                    <button
                      key={tx.id}
                      type="button"
                      onClick={() => {
                        setSummary('');
                        selectTransfer(tx);
                      }}
                      className="px-2.5 py-1 bg-[#F7F9FC] hover:bg-[#EEF2F7] text-[#14426b] rounded-md font-medium transition-colors"
                    >
                      {tx.sender_name} ({tx.id})
                    </button>
                  ))}
              </div>
            )}
          </div>

          {matchedTransfer && (
            <div className="bg-[#F7F9FC] rounded-lg p-4 space-y-2.5">
              <div className="flex items-center justify-between text-xs">
                <span className="inline-flex items-center gap-1.5 font-medium text-[#14426b]">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Auto-filled · {matchedTransfer.id}</span>
                </span>
                <span className="font-semibold text-[#161c2d] tabular-nums">
                  GHS{' '}
                  {matchedTransfer.ghs_amount.toLocaleString('en-GH', {
                    minimumFractionDigits: 2,
                  })}
                </span>
              </div>

              <CorridorLine transfer={matchedTransfer} />

              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[#506690]">
                <span>
                  {matchedTransfer.sender_country} ({matchedTransfer.source_currency}{' '}
                  {matchedTransfer.source_amount}) · {matchedTransfer.receiver_network} ·{' '}
                  {matchedTransfer.destination_city}
                </span>
                <span className="inline-flex items-center gap-1 text-[#2E7D32] font-medium">
                  <ShieldCheck className="w-3.5 h-3.5" />
                  <span>{matchedTransfer.transfer_status}</span>
                </span>
              </div>
            </div>
          )}

          {/* Customer Prior Complaint & Resolution History Popup */}
          {customerHistory.length > 0 && (
            <section
              aria-label="Customer prior complaint history"
              className="border border-[#E6EBF2] rounded-xl overflow-hidden bg-white"
            >
              <div className="px-4 py-2.5 bg-[#F7F9FC] border-b border-[#EEF2F7] flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-xs font-semibold text-[#161c2d]">
                  <History className="w-3.5 h-3.5 text-[#14426b]" />
                  <span>
                    Prior Complaint History ({customerHistory.length})
                  </span>
                </div>
                <span className="text-[11px] font-medium text-[#2E7D32]">
                  {solvedHistoryCount} solved earlier
                </span>
              </div>

              <div className="divide-y divide-[#F1F5F9] max-h-52 overflow-y-auto">
                {customerHistory.map((tk) => {
                  const res = getResolutionInfo(tk);
                  return (
                    <div key={tk.id} className="p-3.5 space-y-1.5 text-xs">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="font-mono font-medium text-[#161c2d]">{tk.id}</span>
                          <span className="text-[#cbd5e1]" aria-hidden="true">
                            ·
                          </span>
                          <span className="font-mono text-[#506690]">{tk.transaction_id}</span>
                          <span className="text-[#cbd5e1]" aria-hidden="true">
                            ·
                          </span>
                          <span className="font-medium text-[#384c74] truncate">
                            {tk.issue_category}
                          </span>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          {res.isSolved ? (
                            <span className="inline-flex items-center gap-1 font-medium text-[#2E7D32]">
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              <span>{tk.stage}</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 font-medium text-[#B45309]">
                              <Clock className="w-3.5 h-3.5" />
                              <span>{tk.stage}</span>
                            </span>
                          )}

                          {onInspectTicket && (
                            <button
                              type="button"
                              onClick={() => {
                                onClose();
                                onInspectTicket(tk);
                              }}
                              className="inline-flex items-center gap-0.5 text-[11px] font-medium text-[#14426b] hover:underline"
                            >
                              <span>View</span>
                              <ArrowUpRight className="w-3 h-3" />
                            </button>
                          )}
                        </div>
                      </div>

                      <div className="text-[#506690]">
                        <span className="font-medium text-[#161c2d]">Complaint:</span> {tk.summary}
                      </div>

                      {res.isSolved ? (
                        <div className="text-[#2E7D32] bg-[#F4FAF5] rounded-md px-2.5 py-1.5">
                          <span className="font-medium">Solved ({res.when}):</span> {res.action}
                          {res.note ? ` — ${res.note}` : ''} ·{' '}
                          <span className="text-[#506690]">{res.actorName}</span>
                        </div>
                      ) : (
                        <div className="text-[#B45309] bg-[#FFFBEB] rounded-md px-2.5 py-1.5">
                          Active ticket assigned to {tk.assigned_to_name ?? 'Ops'} ({res.when})
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="issue-cat" className="block text-xs font-medium text-[#506690] mb-1.5">
                Category
              </label>
              <select
                id="issue-cat"
                value={issueCategory}
                onChange={(e) => setIssueCategory(e.target.value)}
                className="w-full px-3 py-2 text-sm bg-white border border-[#E6EBF2] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#14426b]/15 focus:border-[#14426b]"
              >
                {ISSUE_CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label
                htmlFor="ticket-priority"
                className="block text-xs font-medium text-[#506690] mb-1.5"
              >
                SLA Window
              </label>
              <select
                id="ticket-priority"
                value={priority}
                onChange={(e) => setPriority(e.target.value as TicketPriority)}
                className="w-full px-3 py-2 text-sm bg-white border border-[#E6EBF2] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#14426b]/15 focus:border-[#14426b]"
              >
                <option value="Critical">Critical (30m · Pinned)</option>
                <option value="High">High (30m Ops SLA)</option>
                <option value="Normal">Normal (60m SLA)</option>
              </select>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label htmlFor="assign-staff" className="block text-xs font-medium text-[#506690]">
                Active Officer
              </label>
              <span className="text-xs text-[#869ab8]">
                {eligibleStaff.length} on-shift · {excludedCount} excluded
              </span>
            </div>
            <select
              id="assign-staff"
              value={assignedToId}
              onChange={(e) => setAssignedToId(e.target.value)}
              className="w-full px-3 py-2 text-sm bg-white border border-[#E6EBF2] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#14426b]/15 focus:border-[#14426b]"
            >
              <option value="">Auto-assign active on-duty Operations officer</option>
              {eligibleStaff.map((member) => (
                <option key={member.id} value={member.id}>
                  {member.name} — {member.role}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="ticket-notes" className="block text-xs font-medium text-[#506690] mb-1.5">
              Note
            </label>
            <textarea
              id="ticket-notes"
              rows={2}
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              placeholder="Optional caller context..."
              className="w-full px-3 py-2 text-sm bg-white border border-[#E6EBF2] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#14426b]/15 focus:border-[#14426b] resize-none"
            />
          </div>

          {submitError && (
            <div className="p-3 bg-[#FFF5F5] rounded-lg text-xs text-[#C62828] flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{submitError}</span>
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-4 bg-[#F7F9FC] border-t border-[#EEF2F7]">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-[#506690] hover:text-[#161c2d] rounded-lg transition-colors whitespace-nowrap"
          >
            Cancel
          </button>
          <div className="flex items-center gap-3">
            <button
              type="button"
              disabled={submitting || !matchedTransfer}
              onClick={() => handleSubmit(false)}
              className="px-4 py-2 text-sm font-medium text-[#384c74] bg-white border border-[#E6EBF2] rounded-lg hover:bg-[#F7F9FC] disabled:opacity-45 disabled:cursor-not-allowed transition-colors whitespace-nowrap"
            >
              Log Open
            </button>
            <button
              type="button"
              disabled={submitting || !matchedTransfer}
              onClick={() => handleSubmit(true)}
              className="px-4 py-2 text-sm font-medium text-white bg-[#14426b] rounded-lg hover:bg-[#0e2e4b] disabled:opacity-45 disabled:cursor-not-allowed transition-colors whitespace-nowrap"
            >
              {submitting ? 'Routing...' : 'Escalate to Ops'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
