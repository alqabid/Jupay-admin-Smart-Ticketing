import { Check, ArrowRight } from 'lucide-react';
import type { StaffMember, TicketStage, TransferRecord } from '../types.ts';

export function CorridorLine({ transfer }: { transfer: TransferRecord }) {
  return (
    <div className="flex items-center gap-2 text-sm font-medium text-[#161c2d] min-w-0">
      <span className="truncate">{transfer.sender_name}</span>
      <ArrowRight className="w-3.5 h-3.5 text-[#94a3b8] shrink-0" />
      <span className="truncate">{transfer.receiver_name}</span>
    </div>
  );
}

export function SlaProgressBar({
  deadlineIso,
  slaMinutes,
  stage,
  nowMs,
}: {
  deadlineIso: string;
  slaMinutes: number;
  stage: TicketStage;
  nowMs: number;
}) {
  if (stage === 'Resolved' || stage === 'Closed') {
    return (
      <div className="w-full h-1 bg-[#E8F5E9] rounded-full overflow-hidden">
        <div className="h-full w-full bg-[#2E7D32]" />
      </div>
    );
  }

  const totalMs = Math.max(1, slaMinutes * 60_000);
  const remainingMs = new Date(deadlineIso).getTime() - nowMs;
  const pct = Math.max(4, Math.min(100, Math.round((remainingMs / totalMs) * 100)));
  const isUrgent = remainingMs <= 15 * 60_000;
  const isWarning = remainingMs > 15 * 60_000 && remainingMs <= 30 * 60_000;

  const barColor = isUrgent ? 'bg-[#D32F2F]' : isWarning ? 'bg-[#D97706]' : 'bg-[#14426b]';

  return (
    <div className="w-full h-1 bg-[#EEF2F7] rounded-full overflow-hidden">
      <div
        className={`h-full ${barColor} rounded-full transition-all duration-500`}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

const STAGE_ORDER: TicketStage[] = ['Open', 'In Progress (with Ops)', 'Resolved', 'Closed'];
const SHORT_LABELS = ['Open', 'With Ops', 'Resolved', 'Closed'];

export function StageStepper({ stage }: { stage: TicketStage }) {
  const currentIdx = STAGE_ORDER.indexOf(stage);
  return (
    <div className="flex items-center gap-2 w-full">
      {STAGE_ORDER.map((s, idx) => {
        const done = idx <= currentIdx;
        const isCurrent = idx === currentIdx;
        return (
          <div key={s} className="flex-1 flex flex-col gap-1.5">
            <div
              className={`h-1 rounded-full transition-colors ${
                done
                  ? stage === 'Resolved' || stage === 'Closed'
                    ? 'bg-[#2E7D32]'
                    : 'bg-[#14426b]'
                  : 'bg-[#E6EBF2]'
              }`}
            />
            <span
              className={`text-[11px] leading-none truncate ${
                isCurrent ? 'font-medium text-[#161c2d]' : 'text-[#869ab8]'
              }`}
            >
              {SHORT_LABELS[idx]}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export function NameDiffStrip({ transfer }: { transfer: TransferRecord }) {
  const enteredTokens = transfer.receiver_entered_name.split(' ');
  const kycTokens = transfer.receiver_kyc_name.split(' ');

  return (
    <div className="bg-[#F7F9FC] rounded-lg px-3.5 py-2.5 flex flex-wrap items-center justify-between gap-3 text-xs">
      <div className="flex flex-wrap items-center gap-2 text-[#506690]">
        <span>Entered:</span>
        <span className="font-medium text-[#161c2d]">{transfer.receiver_entered_name}</span>
        <ArrowRight className="w-3 h-3 text-[#94a3b8]" />
        <span>{transfer.receiver_network} KYC:</span>
        <span className="font-medium text-[#161c2d] flex items-center gap-1">
          {kycTokens.map((tok, i) => {
            const matched = enteredTokens.some(
              (e) => e.toLowerCase() === tok.toLowerCase()
            );
            return (
              <span
                key={`${tok}-${i}`}
                className={
                  matched
                    ? 'text-[#161c2d]'
                    : 'bg-[#FFF3CD] text-[#7A5200] px-1.5 py-0.5 rounded'
                }
              >
                {tok}
              </span>
            );
          })}
        </span>
      </div>

      <div className="flex items-center gap-3 text-[11px] text-[#2E7D32] font-medium">
        <span className="inline-flex items-center gap-1">
          <Check className="w-3 h-3" />
          <span>DOB</span>
        </span>
        <span className="inline-flex items-center gap-1">
          <Check className="w-3 h-3" />
          <span>Ghana Card ID</span>
        </span>
      </div>
    </div>
  );
}

export function StaffInitialsCluster({ staff }: { staff: StaffMember[] }) {
  const active = staff.filter((s) => s.is_active && s.on_shift);
  return (
    <div className="flex items-center -space-x-1.5">
      {active.slice(0, 5).map((member) => {
        const initials = member.name
          .split(' ')
          .map((p) => p[0])
          .join('')
          .slice(0, 2)
          .toUpperCase();
        return (
          <span
            key={member.id}
            title={`${member.name} · ${member.role}`}
            className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-[#EEF3F8] ring-2 ring-white text-[10px] font-semibold text-[#14426b]"
          >
            {initials}
          </span>
        );
      })}
    </div>
  );
}
