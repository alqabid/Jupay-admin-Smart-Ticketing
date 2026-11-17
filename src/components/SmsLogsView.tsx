import { CheckCircle2, MessageSquare } from 'lucide-react';
import type { SmsNotification } from '../types.ts';

interface SmsLogsViewProps {
  smsLogs: SmsNotification[];
}

export function SmsLogsView({ smsLogs }: SmsLogsViewProps) {
  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <h1 className="text-xl font-semibold text-[#161c2d]">Automatic SMS Log</h1>
        <span className="text-xs text-[#869ab8] tabular-nums">{smsLogs.length} sent</span>
      </div>

      <div className="card-surface rounded-xl overflow-hidden">
        {smsLogs.length === 0 ? (
          <div className="p-10 text-center text-sm text-[#506690]">No SMS logs yet.</div>
        ) : (
          <div className="divide-y divide-[#F1F5F9]">
            {smsLogs.map((sms) => (
              <div
                key={sms.id}
                className="p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-[#F9FBFE]"
              >
                <div className="space-y-1 max-w-3xl">
                  <div className="flex flex-wrap items-center gap-2 text-xs text-[#869ab8]">
                    <MessageSquare className="w-3.5 h-3.5 text-[#14426b]" />
                    <span className="font-medium text-[#161c2d]">{sms.recipient_name}</span>
                    <span className="tabular-nums">{sms.recipient_phone}</span>
                    <span aria-hidden="true">·</span>
                    <span className="font-mono text-[#14426b]">{sms.transaction_id}</span>
                    <span aria-hidden="true">·</span>
                    <span className="font-mono">{sms.ticket_id}</span>
                  </div>
                  <p className="text-sm text-[#506690]">{sms.message}</p>
                </div>

                <div className="flex sm:flex-col items-end justify-between gap-1 shrink-0 text-xs">
                  <span className="inline-flex items-center gap-1.5 font-medium text-[#2E7D32] whitespace-nowrap">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>{sms.trigger_event}</span>
                  </span>
                  <span className="text-[#869ab8] tabular-nums">
                    {new Date(sms.sent_at).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
