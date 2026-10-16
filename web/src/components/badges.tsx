import { FlaskConical } from 'lucide-react';
import type { Detection, IntegrationState, Severity, Status } from '@/lib/types';
import { cn } from '@/lib/utils';
import { Badge } from './ui/misc';

export const SEVERITY_LABEL: Record<Severity | 'informational', string> = { critical: 'Kritisch', high: 'Hoch', medium: 'Mittel', low: 'Niedrig', informational: 'Info' };
const SEV_CLASS: Record<Severity | 'informational', string> = {
  critical: 'text-sev-critical border-sev-critical/40 bg-sev-critical/10',
  high: 'text-sev-high border-sev-high/40 bg-sev-high/10',
  medium: 'text-sev-medium border-sev-medium/40 bg-sev-medium/10',
  low: 'text-sev-low border-sev-low/40 bg-sev-low/10',
  informational: 'text-fg-muted border-border-strong bg-panel-3',
};
export const SeverityBadge = ({ severity }: { severity: Severity | 'informational' }) => <Badge className={SEV_CLASS[severity]}>{SEVERITY_LABEL[severity]}</Badge>;

export const STATUS_LABEL: Record<Status, string> = { new: 'Neu', investigating: 'In Bearbeitung', resolved: 'Gelöst', closed: 'Geschlossen' };
const ST_CLASS: Record<Status, string> = {
  new: 'text-st-new border-st-new/40 bg-st-new/10',
  investigating: 'text-st-investigating border-st-investigating/40 bg-st-investigating/10',
  resolved: 'text-st-resolved border-st-resolved/40 bg-st-resolved/10',
  closed: 'text-st-closed border-st-closed/40 bg-st-closed/10',
};
export const StatusBadge = ({ status }: { status: Status }) => (
  <Badge className={ST_CLASS[status]} data-testid="status-badge">
    {STATUS_LABEL[status]}
  </Badge>
);

export const STATE_LABEL: Record<string, string> = {
  up: 'Online', degraded: 'Eingeschränkt', down: 'Offline', not_configured: 'Nicht konfiguriert',
  active: 'Aktiv', idle: 'Ruhig', attack: 'Angriff', suspicious: 'Verdächtig', normal: 'Normal',
};
export const STATE_COLOR: Record<string, string> = {
  up: 'bg-ok', active: 'bg-ok', normal: 'bg-primary', degraded: 'bg-warn', suspicious: 'bg-warn', idle: 'bg-fg-subtle',
  down: 'bg-down', attack: 'bg-down', not_configured: 'bg-off',
};
export function StateDot({ state, pulse }: { state: IntegrationState | string; pulse?: boolean }) {
  return (
    <span className="relative inline-flex size-2">
      {pulse && (state === 'up' || state === 'attack') && <span className={cn('absolute inset-0 animate-ping rounded-full opacity-60', STATE_COLOR[state])} />}
      <span className={cn('relative size-2 rounded-full', STATE_COLOR[state] ?? 'bg-off')} />
    </span>
  );
}

const ORIGIN: Record<Detection['origin'], { label: string; cls: string }> = {
  imported: { label: 'Importiert', cls: 'text-primary border-primary/40 bg-primary/10' },
  local: { label: 'Lokal', cls: 'text-sev-low border-petrol/60 bg-petrol/15' },
  simulated: { label: 'Simuliert', cls: 'text-sim border-sim/40 bg-sim/10' },
};
export const OriginBadge = ({ origin }: { origin: Detection['origin'] }) => <Badge className={ORIGIN[origin].cls}>{ORIGIN[origin].label}</Badge>;

/** every piece of demo data carries this marker */
export const SimulatedBadge = ({ className }: { className?: string }) => (
  <Badge className={cn('text-sim border-sim/40 bg-sim/10', className)}>
    <FlaskConical className="size-3" /> Simuliert
  </Badge>
);

export const MitreTag = ({ id }: { id: string }) => (
  <a
    href={`https://attack.mitre.org/techniques/${id.replace('.', '/')}/`}
    target="_blank"
    rel="noreferrer"
    className="rounded border border-border-strong bg-panel-3 px-1.5 py-px font-mono text-2xs text-fg-muted hover:border-petrol hover:text-primary"
  >
    {id}
  </a>
);
