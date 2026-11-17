import { CheckCircle2, Clock } from 'lucide-react';
import type { TicketStage } from '../types.ts';

interface SlaTimerProps {
  deadlineIso: string;
  stage: TicketStage;
  nowMs: number;
  compact?: boolean;
}

export function formatRemaining(diffMs: number): string {
  const absSeconds = Math.floor(Math.abs(diffMs) / 1000);
  const hours = Math.floor(absSeconds / 3600);
  const minutes = Math.floor((absSeconds % 3600) / 60);
  const seconds = absSeconds % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  if (hours > 0) {
    return `${hours}:${pad(minutes)}:${pad(seconds)}`;
  }
  return `${pad(minutes)}:${pad(seconds)}`;
}

export function SlaTimer({ deadlineIso, stage, nowMs, compact = false }: SlaTimerProps) {
  if (stage === 'Resolved' || stage === 'Closed') {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-[#2E7D32] whitespace-nowrap">
        <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
        <span>{stage}</span>
      </span>
    );
  }

  const deadlineMs = new Date(deadlineIso).getTime();
  const diffMs = deadlineMs - nowMs;
  const isBreached = diffMs <= 0;
  const isUrgent = diffMs > 0 && diffMs <= 15 * 60_000;
  const isWarning = diffMs > 15 * 60_000 && diffMs <= 30 * 60_000;

  if (isBreached) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-[#C62828] whitespace-nowrap">
        <Clock className="w-3.5 h-3.5 shrink-0" />
        <span className="tabular-nums">
          {compact ? `-${formatRemaining(diffMs)}` : `Overdue ${formatRemaining(diffMs)}`}
        </span>
      </span>
    );
  }

  if (isUrgent) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#C62828] whitespace-nowrap">
        <Clock className="w-3.5 h-3.5 shrink-0" />
        <span className="tabular-nums">
          {compact ? formatRemaining(diffMs) : `${formatRemaining(diffMs)} left`}
        </span>
      </span>
    );
  }

  if (isWarning) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-[#B45309] whitespace-nowrap">
        <Clock className="w-3.5 h-3.5 shrink-0" />
        <span className="tabular-nums">
          {compact ? formatRemaining(diffMs) : `${formatRemaining(diffMs)} left`}
        </span>
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-[#506690] whitespace-nowrap">
      <Clock className="w-3.5 h-3.5 shrink-0 text-[#869ab8]" />
      <span className="tabular-nums">
        {compact ? formatRemaining(diffMs) : `${formatRemaining(diffMs)} left`}
      </span>
    </span>
  );
}
