import { AlertTriangle, Info, PlugZap } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { Tooltip } from './ui/tooltip';

const SCOPE_LABEL = { range: 'Zeitraum', host: 'Host', severity: 'Schweregrad', mitre: 'MITRE', q: 'Suche' } as const;
export type Scope = keyof typeof SCOPE_LABEL;

export function Panel({
  title,
  subtitle,
  actions,
  scope,
  className,
  bodyClassName,
  children,
  testId,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  /** which global filters this panel honours; shown as hint so no filter is decorative */
  scope?: Scope[];
  className?: string;
  bodyClassName?: string;
  children: ReactNode;
  testId?: string;
}) {
  return (
    <section className={cn('panel flex min-w-0 flex-col', className)} data-testid={testId}>
      <header className="flex items-start justify-between gap-2 px-3.5 pt-3">
        <div className="min-w-0">
          <h2 className="flex items-center gap-1.5 text-[13px] font-semibold text-fg">
            {title}
            {scope && (
              <Tooltip content={`Filter wirken auf: ${scope.map((s) => SCOPE_LABEL[s]).join(', ')}`}>
                <Info className="size-3 text-fg-subtle" aria-label="Filterbereich" />
              </Tooltip>
            )}
          </h2>
          {subtitle && <p className="mt-0.5 truncate text-2xs text-fg-subtle">{subtitle}</p>}
        </div>
        {actions && <div className="flex shrink-0 items-center gap-1.5">{actions}</div>}
      </header>
      <div className={cn('min-h-0 flex-1 p-3.5 pt-2.5', bodyClassName)}>{children}</div>
    </section>
  );
}

export function Unavailable({ reason, compact }: { reason: string; compact?: boolean }) {
  const notConfigured = /not configured|nicht konfiguriert/i.test(reason);
  return (
    <div className={cn('flex flex-col items-center justify-center gap-1.5 text-center text-xs text-fg-muted', compact ? 'py-3' : 'h-full min-h-28 py-6')}>
      {notConfigured ? <PlugZap className="size-4 text-fg-subtle" /> : <AlertTriangle className="size-4 text-warn" />}
      <span className="font-medium text-fg">{notConfigured ? 'Nicht konfiguriert' : 'Nicht verfügbar'}</span>
      <span className="max-w-xs text-2xs text-fg-subtle">{reason}</span>
    </div>
  );
}

export function Loading({ rows = 3 }: { rows?: number }) {
  return (
    <div className="flex flex-col gap-2" aria-busy="true" aria-label="Lädt">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="h-4 animate-pulse rounded bg-panel-3" style={{ width: `${90 - i * 12}%` }} />
      ))}
    </div>
  );
}

export const Empty = ({ children }: { children: ReactNode }) => <div className="py-6 text-center text-xs text-fg-subtle">{children}</div>;

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-[22px] font-semibold tracking-tight text-fg">{title}</h1>
        {subtitle && <p className="mt-0.5 text-xs text-fg-muted">{subtitle}</p>}
      </div>
      {actions && <div className="no-print flex items-center gap-2">{actions}</div>}
    </div>
  );
}
