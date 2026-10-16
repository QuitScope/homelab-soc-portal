import { CheckCircle2, CircleDot, Search, ShieldCheck, type LucideIcon } from 'lucide-react';
import type { HistoryEntry, Status } from '@/lib/types';
import { cn, fmtDateTime } from '@/lib/utils';
import { StatusBadge } from './badges';

const ICON: Record<Status, LucideIcon> = { new: CircleDot, investigating: Search, resolved: CheckCircle2, closed: ShieldCheck };
const STEP_LABEL: Record<Status, string> = { new: 'Erkannt', investigating: 'Untersuchung gestartet', resolved: 'Gelöst', closed: 'Geschlossen' };

/** Incident change history as vertical timeline (reference: right column) */
export function Timeline({ history }: { history: HistoryEntry[] }) {
  return (
    <ol className="relative flex flex-col gap-3" data-testid="history">
      {history.map((h, idx) => {
        const Icon = ICON[h.toStatus];
        return (
          <li key={h.id} className="relative flex gap-2.5">
            {idx < history.length - 1 && <span className="absolute left-[13px] top-7 h-[calc(100%-12px)] w-px bg-border-strong" />}
            <span className={cn('grid size-7 shrink-0 place-items-center rounded-full border bg-panel-2', idx === history.length - 1 ? 'glow border-primary text-primary' : 'border-border-strong text-fg-muted')}>
              <Icon className="size-3.5" />
            </span>
            <div className="flex min-w-0 flex-1 items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-xs font-medium text-fg">{STEP_LABEL[h.toStatus]}</p>
                <p className="text-2xs text-fg-subtle">
                  {fmtDateTime(h.changedAt)} · {h.actor}
                </p>
                {h.note && <p className="mt-0.5 text-2xs text-fg-muted">{h.note}</p>}
              </div>
              <StatusBadge status={h.toStatus} />
            </div>
          </li>
        );
      })}
    </ol>
  );
}
