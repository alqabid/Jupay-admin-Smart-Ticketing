import { useMemo, useState } from 'react';
import { CheckCircle2, Clock, Plus, Search } from 'lucide-react';
import type { Ticket, TransferRecord } from '../types.ts';
import { CorridorLine } from './VisualPrimitives.tsx';

interface TransfersViewProps {
  transfers: TransferRecord[];
  tickets: Ticket[];
  onCreateTicketForTx: (txId: string) => void;
  onOpenTicket: (ticket: Ticket) => void;
}

export function TransfersView({
  transfers,
  tickets,
  onCreateTicketForTx,
  onOpenTicket,
}: TransfersViewProps) {
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return transfers.filter((t) => {
      const matchesStatus = statusFilter === 'all' || t.transfer_status === statusFilter;
      const matchesQuery =
        !q ||
        t.id.toLowerCase().includes(q) ||
        t.sender_name.toLowerCase().includes(q) ||
        t.receiver_name.toLowerCase().includes(q) ||
        t.receiver_kyc_name.toLowerCase().includes(q) ||
        t.sender_phone.toLowerCase().includes(q) ||
        t.receiver_phone.toLowerCase().includes(q) ||
        t.receiver_network.toLowerCase().includes(q) ||
        t.destination_city.toLowerCase().includes(q);
      return matchesStatus && matchesQuery;
    });
  }, [transfers, query, statusFilter]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <h1 className="text-xl font-semibold text-[#161c2d]">Transfers Ledger</h1>
      </div>

      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-[#869ab8] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name, phone, city, or Tx ID..."
            className="w-full pl-10 pr-4 py-2 text-sm bg-white border border-[#E6EBF2] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#14426b]/15 focus:border-[#14426b]"
          />
        </div>

        <div className="flex items-center gap-1 p-1 bg-[#EEF2F7] rounded-lg overflow-x-auto">
          {['all', 'Network Delay', 'Compliance Hold', 'Pending Payout', 'Completed'].map((st) => (
            <button
              key={st}
              type="button"
              onClick={() => setStatusFilter(st)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                statusFilter === st
                  ? 'bg-white text-[#14426b] shadow-sm'
                  : 'text-[#506690] hover:text-[#161c2d]'
              }`}
            >
              {st === 'all' ? 'All' : st}
            </button>
          ))}
        </div>
      </div>

      <div className="card-surface rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-[#EEF2F7] text-xs font-medium text-[#869ab8]">
                <th className="py-3.5 px-5">Tx ID</th>
                <th className="py-3.5 px-5">Transfer</th>
                <th className="py-3.5 px-5">Rail & City</th>
                <th className="py-3.5 px-5 text-right">Amount</th>
                <th className="py-3.5 px-5">Status</th>
                <th className="py-3.5 px-5 text-right" />
              </tr>
            </thead>
            <tbody className="divide-y divide-[#F1F5F9] text-sm">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-10 text-center text-sm text-[#506690]">
                    No transfers found.
                  </td>
                </tr>
              ) : (
                filtered.map((tx) => {
                  const linkedTicket = tickets.find((t) => t.transaction_id === tx.id);
                  return (
                    <tr key={tx.id} className="hover:bg-[#F9FBFE] transition-colors">
                      <td className="py-4 px-5 font-mono text-xs font-medium text-[#14426b] tabular-nums whitespace-nowrap">
                        {tx.id}
                      </td>
                      <td className="py-4 px-5">
                        <CorridorLine transfer={tx} />
                      </td>
                      <td className="py-4 px-5 text-xs text-[#506690] whitespace-nowrap">
                        {tx.receiver_network} · {tx.destination_city}
                      </td>
                      <td className="py-4 px-5 text-right text-sm font-medium text-[#161c2d] tabular-nums whitespace-nowrap">
                        GHS {tx.ghs_amount.toLocaleString('en-GH', { minimumFractionDigits: 2 })}
                      </td>
                      <td className="py-4 px-5 whitespace-nowrap">
                        {tx.transfer_status === 'Completed' && (
                          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-[#2E7D32]">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>Completed</span>
                          </span>
                        )}
                        {tx.transfer_status === 'Compliance Hold' && (
                          <span className="text-xs font-medium text-[#C62828]">
                            Compliance Hold
                          </span>
                        )}
                        {(tx.transfer_status === 'Network Delay' ||
                          tx.transfer_status === 'Pending Payout') && (
                          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-[#B45309]">
                            <Clock className="w-3.5 h-3.5" />
                            <span>{tx.transfer_status}</span>
                          </span>
                        )}
                      </td>
                      <td className="py-4 px-5 text-right whitespace-nowrap">
                        {linkedTicket ? (
                          <button
                            type="button"
                            onClick={() => onOpenTicket(linkedTicket)}
                            className="px-3 py-1.5 text-xs font-medium text-[#506690] hover:text-[#161c2d] hover:bg-[#F7F9FC] rounded-lg transition-colors whitespace-nowrap"
                          >
                            {linkedTicket.id}
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => onCreateTicketForTx(tx.id)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[#14426b] bg-[#F0F4F9] hover:bg-[#E4ECF5] rounded-lg transition-colors whitespace-nowrap"
                          >
                            <Plus className="w-3.5 h-3.5" />
                            <span>Create Ticket</span>
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
