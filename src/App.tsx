import { useCallback, useEffect, useState } from 'react';
import {
  ArrowLeftRight,
  FileSpreadsheet,
  Inbox,
  MessageSquare,
  Plus,
  Users,
} from 'lucide-react';
import type { DashboardState, Ticket, TicketPriority, TicketStage } from './types.ts';
import { TicketsWorkspace } from './components/TicketsWorkspace.tsx';
import { TransfersView } from './components/TransfersView.tsx';
import { StaffRosterView } from './components/StaffRosterView.tsx';
import { SmsLogsView } from './components/SmsLogsView.tsx';
import { ImportSheetView } from './components/ImportSheetView.tsx';
import { NewTicketModal } from './components/NewTicketModal.tsx';
import { TicketDetailDrawer } from './components/TicketDetailDrawer.tsx';

type NavTab = 'tickets' | 'transfers' | 'import' | 'staff' | 'sms';

const NAV_ITEMS: Array<{ id: NavTab; label: string; icon: typeof Inbox }> = [
  { id: 'tickets', label: 'Tickets', icon: Inbox },
  { id: 'transfers', label: 'Transfers', icon: ArrowLeftRight },
  { id: 'import', label: 'Import Sheet', icon: FileSpreadsheet },
  { id: 'staff', label: 'Staff & Shifts', icon: Users },
  { id: 'sms', label: 'SMS Log', icon: MessageSquare },
];

export default function App() {
  const [data, setData] = useState<DashboardState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<NavTab>('tickets');
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [activeUserId, setActiveUserId] = useState('STF-01');
  const [newTicketOpen, setNewTicketOpen] = useState(false);
  const [prefillTxId, setPrefillTxId] = useState('');
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage((prev) => (prev === msg ? null : prev));
    }, 4000);
  }, []);

  const fetchState = useCallback(async () => {
    try {
      const res = await fetch('/api/state');
      if (!res.ok) throw new Error('Failed to load Jupay dashboard state.');
      const json = (await res.json()) as DashboardState;
      setData(json);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to connect to server.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchState();
  }, [fetchState]);

  useEffect(() => {
    const timer = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const handleOpenNewTicket = (txId = '') => {
    setPrefillTxId(txId);
    setNewTicketOpen(true);
  };

  const handleCreateTicket = async (payload: {
    transaction_id: string;
    issue_category: string;
    summary: string;
    priority: TicketPriority;
    escalate_to_ops: boolean;
    assigned_to_id: string | null;
    created_by_id: string;
  }) => {
    const res = await fetch('/api/tickets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const json = await res.json();
    if (!res.ok) {
      return { error: json.error || 'Could not create ticket.' };
    }
    setData(json.state);
    setActiveTab('tickets');
    setSelectedTicketId(json.ticket.id);
    showToast(
      payload.escalate_to_ops
        ? `${json.ticket.id} escalated to ${json.ticket.assigned_to_name} (30m SLA)`
        : `${json.ticket.id} logged in Open queue`
    );
    return {};
  };

  const handleStageChange = async (ticketId: string, stage: TicketStage) => {
    const res = await fetch(`/api/tickets/${ticketId}/stage`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ stage, actor_id: activeUserId }),
    });
    if (res.ok) {
      const json = await res.json();
      setData(json.state);
      showToast(`${ticketId} moved to ${stage}`);
    }
  };

  const handleAssignStaff = async (ticketId: string, staffId: string) => {
    const res = await fetch(`/api/tickets/${ticketId}/stage`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ assigned_to_id: staffId, actor_id: activeUserId }),
    });
    const json = await res.json();
    if (!res.ok) {
      showToast(json.error || 'Assignment blocked.');
      return;
    }
    setData(json.state);
    showToast(`${ticketId} assigned to ${json.ticket.assigned_to_name}`);
  };

  const handleTicketAction = async (
    ticketId: string,
    actionType: 'retrigger_payout' | 'confirm_compliance_release' | 'escalate_to_ops' | 'add_note',
    note?: string
  ) => {
    const res = await fetch(`/api/tickets/${ticketId}/action`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ actionType, actorId: activeUserId, note }),
    });
    if (res.ok) {
      const json = await res.json();
      setData(json.state);
      if (actionType === 'retrigger_payout') {
        showToast(`${ticketId} payout re-triggered & settled`);
      } else if (actionType === 'confirm_compliance_release') {
        showToast(`${ticketId} match confirmed & funds released`);
      } else if (actionType === 'escalate_to_ops') {
        showToast(`${ticketId} escalated to Ops`);
      }
    }
  };

  const handleRunAiTriage = async (ticketId: string) => {
    const res = await fetch(`/api/tickets/${ticketId}/ai-triage`, {
      method: 'POST',
    });
    if (res.ok) {
      await fetchState();
      showToast(`Check refreshed for ${ticketId}`);
    }
  };

  const handleToggleStaff = async (
    staffId: string,
    updates: { is_active?: boolean; on_shift?: boolean }
  ) => {
    const res = await fetch(`/api/staff/${staffId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    });
    if (res.ok) {
      const json = await res.json();
      setData(json.state);
      showToast(`${json.member.name} shift status updated`);
    }
  };

  const activeUser =
    data?.staff.find((s) => s.id === activeUserId) ??
    data?.staff.find((s) => s.is_active && s.on_shift) ??
    data?.staff[0];

  const selectedTicket: Ticket | null =
    data?.tickets.find((t) => t.id === selectedTicketId) ?? null;

  const activeLabel = NAV_ITEMS.find((n) => n.id === activeTab)?.label ?? 'Tickets';

  return (
    <div className="min-h-screen bg-[#F7F9FC] text-[#161c2d] flex">
      {/* Sidebar */}
      <aside className="hidden md:flex w-60 shrink-0 bg-white border-r border-[#E6EBF2] flex-col justify-between">
        <div>
          <div className="h-16 px-5 flex items-center border-b border-[#EEF2F7]">
            <img
              src="/jupay-logo.png"
              alt="Jupay"
              className="h-10 w-auto object-contain select-none"
            />
          </div>

          <nav className="p-3 space-y-0.5" aria-label="Dashboard sections">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActiveTab(item.id)}
                  className={`w-full flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-lg transition-colors duration-150 whitespace-nowrap ${
                    isActive
                      ? 'bg-[#F0F4F9] text-[#14426b]'
                      : 'text-[#506690] hover:bg-[#F7F9FC] hover:text-[#161c2d]'
                  }`}
                >
                  <Icon
                    className={`w-4 h-4 shrink-0 ${
                      isActive ? 'text-[#14426b]' : 'text-[#869ab8]'
                    }`}
                  />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </nav>
        </div>

        {/* Desk Profile */}
        <div className="p-4 border-t border-[#EEF2F7]">
          {data && (
            <select
              aria-label="Acting Desk Agent"
              value={activeUser?.id ?? ''}
              onChange={(e) => setActiveUserId(e.target.value)}
              className="w-full px-2.5 py-2 text-xs bg-[#F7F9FC] border border-[#E6EBF2] rounded-lg text-[#161c2d] focus:outline-none focus:ring-2 focus:ring-[#14426b]/15 focus:border-[#14426b]"
            >
              {data.staff
                .filter((s) => s.is_active && s.on_shift)
                .map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} · {s.role}
                  </option>
                ))}
            </select>
          )}
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Top Bar Contract: Breadcrumb on left, 1 primary CTA on right */}
        <header className="h-16 bg-white border-b border-[#E6EBF2] px-6 flex items-center justify-between gap-8 sticky top-0 z-30">
          <div className="flex items-center gap-2 text-sm min-w-0">
            <img
              src="/jupay-logo.png"
              alt="Jupay"
              className="h-8 w-auto object-contain shrink-0 md:hidden select-none"
            />
            <span className="text-[#cbd5e1] md:hidden" aria-hidden="true">
              /
            </span>
            <span className="text-[#869ab8] hidden md:inline whitespace-nowrap shrink-0">
              Admin
            </span>
            <span className="text-[#cbd5e1] hidden md:inline" aria-hidden="true">
              /
            </span>
            <span className="font-semibold text-[#161c2d] truncate">{activeLabel}</span>
          </div>

          <button
            type="button"
            onClick={() => handleOpenNewTicket()}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs sm:text-sm font-medium text-white bg-[#14426b] hover:bg-[#0e2e4b] rounded-lg transition-colors duration-150 whitespace-nowrap shrink-0"
          >
            <Plus className="w-4 h-4 shrink-0" />
            <span>New Complaint / Ticket</span>
          </button>
        </header>

        {/* Mobile Nav */}
        <div className="md:hidden bg-white border-b border-[#E6EBF2] px-4 py-2 flex items-center gap-1 overflow-x-auto">
          {NAV_ITEMS.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setActiveTab(item.id)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md whitespace-nowrap shrink-0 ${
                activeTab === item.id
                  ? 'bg-[#F0F4F9] text-[#14426b]'
                  : 'text-[#506690] hover:bg-[#F7F9FC]'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>

        {/* Main Viewport */}
        <main className="flex-1 p-6 lg:p-8 max-w-[1400px] w-full mx-auto">
          {loading ? (
            <div className="space-y-4">
              <div className="h-24 bg-white border border-[#E6EBF2] rounded-xl animate-pulse" />
              <div className="h-64 bg-white border border-[#E6EBF2] rounded-xl animate-pulse" />
            </div>
          ) : error || !data ? (
            <div className="bg-white border border-[#E6CACA] rounded-xl p-6 text-sm text-[#C62828]">
              {error || 'Failed to load dashboard data.'}
            </div>
          ) : (
            <>
              {activeTab === 'tickets' && (
                <TicketsWorkspace
                  tickets={data.tickets}
                  staff={data.staff}
                  nowMs={nowMs}
                  onSelectTicket={(t) => setSelectedTicketId(t.id)}
                  onQuickAction={(ticketId, actionType) =>
                    handleTicketAction(ticketId, actionType)
                  }
                />
              )}
              {activeTab === 'transfers' && (
                <TransfersView
                  transfers={data.transfers}
                  tickets={data.tickets}
                  onCreateTicketForTx={(txId) => handleOpenNewTicket(txId)}
                  onOpenTicket={(t) => setSelectedTicketId(t.id)}
                />
              )}
              {activeTab === 'import' && activeUser && (
                <ImportSheetView
                  tickets={data.tickets}
                  actorId={activeUser.id}
                  onImportComplete={({ importedCount, reroutedCount, state }) => {
                    setData(state);
                    setActiveTab('tickets');
                    showToast(
                      `Imported ${importedCount} tickets (${reroutedCount} ghost staff rerouted)`
                    );
                  }}
                />
              )}
              {activeTab === 'staff' && (
                <StaffRosterView staff={data.staff} onToggleStaff={handleToggleStaff} />
              )}
              {activeTab === 'sms' && <SmsLogsView smsLogs={data.smsLogs} />}
            </>
          )}
        </main>
      </div>

      {/* New Ticket Modal */}
      {data && activeUser && (
        <NewTicketModal
          isOpen={newTicketOpen}
          onClose={() => setNewTicketOpen(false)}
          transfers={data.transfers}
          tickets={data.tickets}
          staff={data.staff}
          currentUser={activeUser}
          initialTransactionId={prefillTxId}
          onInspectTicket={(tk) => setSelectedTicketId(tk.id)}
          onCreateTicket={handleCreateTicket}
        />
      )}

      {/* Ticket Detail Drawer */}
      {data && activeUser && (
        <TicketDetailDrawer
          ticket={selectedTicket}
          staff={data.staff}
          smsLogs={data.smsLogs}
          currentUser={activeUser}
          nowMs={nowMs}
          onClose={() => setSelectedTicketId(null)}
          onStageChange={handleStageChange}
          onAssignStaff={handleAssignStaff}
          onTicketAction={handleTicketAction}
          onRunAiTriage={handleRunAiTriage}
        />
      )}

      {/* Toast */}
      {toastMessage && (
        <div
          role="status"
          className="fixed bottom-5 right-5 z-50 bg-[#14426b] text-white text-xs font-medium px-4 py-2.5 rounded-lg shadow-lg max-w-md"
        >
          {toastMessage}
        </div>
      )}
    </div>
  );
}
