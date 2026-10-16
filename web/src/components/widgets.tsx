import { ExternalLink } from 'lucide-react';
import { Link } from 'react-router';
import type { CoverageItem, CriblOverview, IntegrationStatus } from '@/lib/types';
import { cn, fmtNumber } from '@/lib/utils';
import { STATE_LABEL, StateDot } from './badges';
import { Tooltip } from './ui/tooltip';

/** MITRE technique rows with bar for detections + incident count (replaces "Threat Attribution" of the reference) */
export function CoverageList({ items, search }: { items: CoverageItem[]; search: string }) {
  const max = Math.max(1, ...items.map((i) => i.detections.length));
  return (
    <ul className="flex flex-col gap-2">
      {items.map((t) => {
        const real = t.detections.filter((d) => d.origin !== 'simulated');
        return (
          <li key={t.technique} className="flex flex-col gap-1">
            <div className="flex items-center justify-between gap-2 text-2xs">
              <Link to={{ pathname: '/detections', search: new URLSearchParams([...new URLSearchParams(search), ['mitre', t.technique]]).toString() }} className="font-mono text-fg hover:text-primary">
                {t.technique}
              </Link>
              <span className="truncate text-fg-subtle">{t.tactics.join(', ')}</span>
              <Tooltip content={t.detections.map((d) => `${d.title} (${d.origin})`).join('\n')}>
                <span className="shrink-0 text-fg-muted">
                  {t.detections.length} {t.detections.length === 1 ? 'Regel' : 'Regeln'} · <span className={cn(t.incidents > 0 && 'text-sev-medium')}>{t.incidents} Inc.</span>
                </span>
              </Tooltip>
            </div>
            <div className="flex h-1.5 overflow-hidden rounded-full bg-panel-3">
              <span className="bg-primary" style={{ width: `${(real.length / max) * 100}%` }} />
              <span className="bg-sim/60" style={{ width: `${((t.detections.length - real.length) / max) * 100}%` }} />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

export function IntegrationList({ items }: { items: IntegrationStatus[] }) {
  return (
    <ul className="flex flex-col divide-y divide-border/70" data-testid="integrations">
      {items.map((i) => (
        <li key={i.id} className="flex items-center gap-2.5 py-1.5 text-xs">
          <StateDot state={i.state} pulse />
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-1.5 font-medium text-fg">
              {i.name}
              {i.docsUrl && (
                <a href={i.docsUrl} target="_blank" rel="noreferrer" aria-label={`${i.name} API-Doku`} className="text-fg-subtle hover:text-primary">
                  <ExternalLink className="size-3" />
                </a>
              )}
            </p>
            <p className="truncate text-2xs text-fg-subtle" title={i.detail}>
              {i.category} · {i.detail}
            </p>
          </div>
          <div className="text-right text-2xs">
            <p className={cn(i.state === 'up' ? 'text-ok' : i.state === 'not_configured' ? 'text-fg-subtle' : i.state === 'degraded' ? 'text-warn' : 'text-down')}>{STATE_LABEL[i.state]}</p>
            <p className="text-fg-subtle">{[i.version, i.latencyMs != null ? `${i.latencyMs} ms` : null].filter(Boolean).join(' · ')}</p>
          </div>
        </li>
      ))}
    </ul>
  );
}

/** Cribl flow: active inputs → routes → outputs */
export function PipelineFlow({ data }: { data: CriblOverview }) {
  const inputs = data.inputs.filter((i) => !i.disabled);
  const routes = data.routes.filter((r) => !r.disabled);
  const outputs = data.outputs.filter((o) => o.type !== 'devnull');
  const col = (title: string, rows: { key: string; label: string; sub: string; health?: string | null }[]) => (
    <div className="flex min-w-0 flex-1 flex-col gap-1.5">
      <p className="text-2xs uppercase tracking-wide text-fg-subtle">{title}</p>
      {rows.map((r) => (
        <div key={r.key} className="rounded-md border border-border bg-panel-2 px-2 py-1.5">
          <p className="flex items-center gap-1.5 truncate text-xs font-medium">
            {r.health !== undefined && <StateDot state={r.health === 'Green' ? 'up' : r.health ? 'degraded' : 'not_configured'} />}
            {r.label}
          </p>
          <p className="truncate text-2xs text-fg-subtle" title={r.sub}>{r.sub}</p>
        </div>
      ))}
    </div>
  );
  return (
    <div className="flex gap-2" data-testid="pipeline-flow">
      {col('Eingänge', inputs.map((i) => ({ key: i.id, label: i.id, sub: i.type, health: i.health })))}
      {col('Routen', routes.map((r) => ({ key: r.id, label: r.name, sub: `${r.pipeline}${r.final ? ' · final' : ''}` })))}
      {col('Ausgänge', outputs.map((o) => ({ key: o.id, label: o.id, sub: `${o.type} · ${fmtNumber(o.metrics.sentCount ?? null)} seit Start`, health: o.health })))}
    </div>
  );
}
