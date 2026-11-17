import { useState } from 'react';
import {
  ArrowRight,
  CheckCircle2,
  MessageSquare,
  RefreshCw,
  Send,
  ShieldCheck,
  UserCheck,
  X,
} from 'lucide-react';
import type { SmsNotification, StaffMember, Ticket, TicketStage } from '../types.ts';
import { SlaTimer } from './SlaTimer.tsx';
import {
  CorridorLine,
  NameDiffStrip,
  SlaProgressBar,
  StageStepper,
} from './VisualPrimitives.tsx';

interface TicketDetailDrawerProps {
  ticket: Ticket | null;
  staff: StaffMember[];
  smsLogs: SmsNotification[];
  currentUser: StaffMember;
  nowMs: number;
  onClose: () => void;
  onStageChange: (ticketId: string, stage: TicketStage) => Promise<void>;
  onAssignStaff: (ticketId: string, staffId: string) => Promise<void>;
  onTicketAction: (
    ticketId: string,
    actionType: 'retrigger_payout' | 'confirm_compliance_release' | 'escalate_to_ops' | 'add_note',
    note?: string
  ) => Promise<void>;
  onRunAiTriage: (ticketId: string) => Promise<void>;
}

const STAGES: TicketStage[] = ['Open', 'In Progress (with Ops)', 'Resolved', 'Closed'];

export function TicketDetailDrawer({
  ticket,
  staff,
  smsLogs,
  nowMs,
  onClose,
  onStageChange,
  onAssignStaff,
  onTicketAction,
  onRunAiTriage,
}: TicketDetailDrawerProps) {
  const [noteInput, setNoteInput] = useState('');
  const [busyAction, setBusyAction] = useState<string | null>(null);

  if (!ticket) return null;

  const eligibleStaff = staff.filter((s) => s.is_active && s.on_shift);
  const ticketSms = smsLogs.filter((s) => s.ticket_id === ticket.id);
  const t = ticket.transfer;
  const isActionable = ticket.stage === 'Open' || ticket.stage === 'In Progress (with Ops)';

  const handleAction = async (
    actionType: 'retrigger_payout' | 'confirm_compliance_release' | 'escalate_to_ops' | 'add_note',
    note?: string
  ) => {
    setBusyAction(actionType);
    await onTicketAction(ticket.id, actionType, note);
    if (actionType === 'add_note') {
      setNoteInput('');
    }
    setBusyAction(null);
  };

  const handleAiTriage = async () => {
    setBusyAction('ai_triage');
    await onRunAiTriage(ticket.id);
    setBusyAction(null);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-[#161c2d]/30"
      role="dialog"
      aria-modal="true"
      aria-labelledby="drawer-ticket-title"
    >
      <div className="w-full max-w-xl bg-white h-full border-l border-[#E6EBF2] flex flex-col shadow-2xl">
        <div className="px-6 py-5 border-b border-[#EEF2F7] space-y-3">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 text-xs text-[#869ab8]">
                <span className="font-mono font-medium text-[#161c2d]">{ticket.id}</span>
                <span aria-hidden="true">·</span>
                <span className="font-mono">{ticket.transaction_id}</span>
                <span aria-hidden="true">·</span>
                <span>{ticket.issue_category}</span>
              </div>
              <h2 id="drawer-ticket-title" className="text-lg font-semibold text-[#161c2d] mt-1">
                GHS {t.ghs_amount.toLocaleString('en-GH', { minimumFractionDigits: 2 })} ·{' '}
                {t.receiver_network}
              </h2>
            </div>
            <div className="flex items-center gap-3 shrink-0">
              <SlaTimer deadlineIso={ticket.sla_deadline} stage={ticket.stage} nowMs={nowMs} />
              <button
                type="button"
                onClick={onClose}
                className="p-2 text-[#869ab8] hover:text-[#161c2d] rounded-lg hover:bg-[#F7F9FC] transition-colors"
                aria-label="Close ticket drawer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          <CorridorLine transfer={t} />
          <SlaProgressBar
            deadlineIso={ticket.sla_deadline}
            slaMinutes={ticket.sla_minutes}
            stage={ticket.stage}
            nowMs={nowMs}
          />
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Lifecycle Stage */}
          <div className="space-y-2.5">
            <StageStepper stage={ticket.stage} />
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-1 p-1 bg-[#F2F5F9] rounded-lg">
              {STAGES.map((stage) => {
                const active = ticket.stage === stage;
                return (
                  <button
                    key={stage}
                    type="button"
                    onClick={() => onStageChange(ticket.id, stage)}
                    className={`px-2 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap truncate ${
                      active
                        ? 'bg-white text-[#14426b] shadow-sm'
                        : 'text-[#506690] hover:text-[#161c2d]'
                    }`}
                  >
                    {stage}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Identity Comparison for Compliance Holds */}
          {t.flag_type === 'compliance_mismatch' && <NameDiffStrip transfer={t} />}

          {/* Primary Resolution Action */}
          {isActionable && (
            <div className="flex flex-wrap items-center justify-between gap-3 py-3 border-y border-[#EEF2F7]">
              <span className="text-xs text-[#506690]">Resolution Action</span>

              <div className="flex flex-wrap items-center gap-2">
                {t.flag_type === 'compliance_mismatch' && (
                  <button
                    type="button"
                    disabled={busyAction !== null}
                    onClick={() => handleAction('confirm_compliance_release')}
                    className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium text-white bg-[#14426b] hover:bg-[#0e2e4b] rounded-lg transition-colors disabled:opacity-50 whitespace-nowrap"
                  >
                    <ShieldCheck className="w-4 h-4" />
                    <span>
                      {busyAction === 'confirm_compliance_release'
                        ? 'Releasing...'
                        : `Confirm Match & Release`}
                    </span>
                  </button>
                )}

                {(t.flag_type === 'network_delay' || t.flag_type === 'interbank_clearing') && (
                  <button
                    type="button"
                    disabled={busyAction !== null}
                    onClick={() => handleAction('retrigger_payout')}
                    className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium text-white bg-[#14426b] hover:bg-[#0e2e4b] rounded-lg transition-colors disabled:opacity-50 whitespace-nowrap"
                  >
                    <RefreshCw className="w-4 h-4" />
                    <span>
                      {busyAction === 'retrigger_payout'
                        ? 'Re-triggering...'
                        : `Re-trigger ${t.receiver_network}`}
                    </span>
                  </button>
                )}

                {ticket.stage === 'Open' && (
                  <button
                    type="button"
                    disabled={busyAction !== null}
                    onClick={() => handleAction('escalate_to_ops')}
                    className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-medium text-[#384c74] bg-[#F7F9FC] hover:bg-[#EEF2F7] rounded-lg transition-colors disabled:opacity-50 whitespace-nowrap"
                  >
                    <ArrowRight className="w-3.5 h-3.5" />
                    <span>Escalate to Ops</span>
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Diagnostic Summary */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-[#506690]">Triage Summary</span>
              <button
                type="button"
                disabled={busyAction !== null}
                onClick={handleAiTriage}
                className="text-xs font-medium text-[#14426b] hover:underline disabled:opacity-50"
              >
                {busyAction === 'ai_triage' ? 'Refreshing...' : 'Refresh'}
              </button>
            </div>
            <p className="text-sm text-[#161c2d] leading-relaxed">
              {ticket.ai_summary || ticket.summary}
            </p>
          </div>

          {/* Active Staff Assignment */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label
                htmlFor="drawer-assignee"
                className="flex items-center gap-1.5 text-xs font-medium text-[#506690]"
              >
                <UserCheck className="w-3.5 h-3.5 text-[#14426b]" />
                <span>Assigned Officer</span>
              </label>
              <span className="text-xs text-[#869ab8]">Active & on-shift only</span>
            </div>
            <select
              id="drawer-assignee"
              value={ticket.assigned_to_id ?? ''}
              onChange={(e) => {
                if (e.target.value) onAssignStaff(ticket.id, e.target.value);
              }}
              className="w-full px-3 py-2 text-sm bg-white border border-[#E6EBF2] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#14426b]/15 focus:border-[#14426b]"
            >
              <option value="" disabled>
                Select officer...
              </option>
              {eligibleStaff.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} — {s.role}
                </option>
              ))}
            </select>
          </div>

          {/* SMS Dispatches */}
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-xs font-medium text-[#506690]">
              <MessageSquare className="w-3.5 h-3.5" />
              <span>SMS Updates ({ticketSms.length})</span>
            </div>
            {ticketSms.length === 0 ? (
              <div className="text-xs text-[#869ab8]">No SMS sent yet.</div>
            ) : (
              <div className="space-y-2">
                {ticketSms.map((sms) => (
                  <div key={sms.id} className="bg-[#F7F9FC] rounded-lg p-3 text-xs space-y-1">
                    <div className="flex items-center justify-between text-[#869ab8]">
                      <span className="font-medium text-[#161c2d]">
                        {sms.recipient_name} · {sms.recipient_phone}
                      </span>
                      <span className="tabular-nums">
                        {new Date(sms.sent_at).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    </div>
                    <p className="text-[#506690]">{sms.message}</p>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Audit Timeline */}
          <div className="space-y-3">
            <div className="text-xs font-medium text-[#506690]">Activity</div>
            <div className="space-y-2.5">
              {ticket.events.map((evt) => (
                <div key={evt.id} className="flex items-start gap-2.5 text-xs">
                  <CheckCircle2 className="w-3.5 h-3.5 text-[#14426b] mt-0.5 shrink-0" />
                  <div className="flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium text-[#161c2d]">
                        {evt.action} · {evt.actor_name}
                      </span>
                      <span className="text-[#869ab8] tabular-nums shrink-0">
                        {new Date(evt.timestamp).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    </div>
                    <p className="text-[#506690] mt-0.5">{evt.note}</p>
                  </div>
                </div>
              ))}
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (noteInput.trim()) {
                  handleAction('add_note', noteInput);
                }
              }}
              className="flex items-center gap-2 pt-2"
            >
              <input
                type="text"
                value={noteInput}
                onChange={(e) => setNoteInput(e.target.value)}
                placeholder="Add handoff note..."
                className="flex-1 px-3 py-2 text-xs bg-white border border-[#E6EBF2] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#14426b]/15 focus:border-[#14426b]"
              />
              <button
                type="submit"
                disabled={!noteInput.trim() || busyAction !== null}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-white bg-[#14426b] hover:bg-[#0e2e4b] rounded-lg disabled:opacity-45 transition-colors whitespace-nowrap"
              >
                <Send className="w-3.5 h-3.5" />
                <span>Send</span>
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
