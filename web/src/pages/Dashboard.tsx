import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Clock, Flame, FolderOpen, RefreshCw, ShieldAlert, Timer } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import { StateDot } from '@/components/badges';
import { ActivityChart, EventTimelineChart, HBarChart } from '@/components/charts';
import { Gauge } from '@/components/Gauge';
import { IncidentTable } from '@/components/IncidentTable';
import { Empty, Loading, PageHeader, Panel, Unavailable } from '@/components/Panel';
import { Timeline } from '@/components/Timeline';
import { Topology, TopologyLegend } from '@/components/Topology';
import { Button } from '@/components/ui/button';
import { Tooltip } from '@/components/ui/tooltip';
import { CoverageList, IntegrationList, PipelineFlow } from '@/components/widgets';
import { api, send } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useFilters } from '@/lib/filters';
import type { CoverageItem, CriblOverview, Dashboard as DashboardData, EventAnalytics, Guarded, Topology as TopologyData } from '@/lib/types';
import { fmtDuration, fmtNumber, incidentKey } from '@/lib/utils';

function Kpi({ icon, label, value, hint, testId }: { icon: ReactNode; label: string; value: ReactNode; hint: string; testId: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5 px-3.5 py-3" data-testid={testId}>
      <p className="flex items-center gap-1.5 text-2xs text-fg-muted [&_svg]:size-3.5">{icon}{label}</p>
      <p className="text-2xl font-semibold tabular-nums text-fg">{value}</p>
      <p className="truncate text-2xs text-fg-subtle">{hint}</p>
    </div>
  );
}

export function SyncButton() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const sync = useMutation({
    mutationFn: () => send<{ alerts: number; created: number }>('/incidents/sync', {}),
    onSuccess: () => qc.invalidateQueries(),
  });
  return (
    <Tooltip content={user ? (sync.data ? `${sync.data.alerts} ausgelöste Alerts gelesen, ${sync.data.created} neue Incidents` : 'Ausgelöste Alerts aus Splunk übernehmen') : 'Anmeldung nötig'}>
      <span>
        <Button size="sm" onClick={() => sync.mutate()} disabled={!user || sync.isPending}>
          <ShieldAlert /> Splunk-Sync
        </Button>
      </span>
    </Tooltip>
  );
}

export function RefreshButton() {
  const qc = useQueryClient();
  return (
    <Button size="sm" onClick={() => qc.invalidateQueries()}>
      <RefreshCw /> Daten aktualisieren
    </Button>
  );
}

export function Dashboard() {
  const { filters, query } = useFilters();
  const dash = useQuery({ queryKey: ['dashboard', query], queryFn: () => api<DashboardData>(`/dashboard?${query}`), refetchInterval: 60_000 });
  const topo = useQuery({ queryKey: ['topology', query], queryFn: () => api<TopologyData>(`/topology?${query}`), refetchInterval: 60_000 });
  const events = useQuery({ queryKey: ['events', query], queryFn: () => api<Guarded<EventAnalytics>>(`/events?${query}`), refetchInterval: 60_000 });
  const coverage = useQuery({ queryKey: ['coverage', query], queryFn: () => api<{ items: CoverageItem[] }>(`/coverage?${query}`) });
  const pipes = useQuery({ queryKey: ['pipelines'], queryFn: () => api<Guarded<CriblOverview>>('/pipelines'), refetchInterval: 60_000 });
  const d = dash.data;
  const [showFormula, setShowFormula] = useState(false);
  const integrationsUp = d?.integrations.filter((i) => i.state === 'up').length ?? 0;
  const core = d?.integrations.filter((i) => i.id === 'splunk' || i.id === 'cribl') ?? [];

  return (
    <>
      <PageHeader title="Lagebild" subtitle="Überwachen, untersuchen, priorisieren und abschließen – Daten live aus Splunk und Cribl." actions={<><RefreshButton /><SyncButton /></>} />

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-12">
        {/* left column */}
        <div className="flex flex-col gap-3 lg:col-span-4 xl:col-span-3">
          <Panel title="Sicherheitsindex" scope={['range', 'host', 'severity', 'mitre', 'q']} testId="health-panel"
            actions={d && (
              // click instead of hover: works with touch and keyboard, and the text stays inside the panel
              <button type="button" onClick={() => setShowFormula((v) => !v)} aria-expanded={showFormula} aria-controls="health-formula"
                className="cursor-pointer rounded border border-border-strong px-1.5 text-2xs text-fg-subtle hover:border-petrol hover:text-fg aria-expanded:border-primary/60 aria-expanded:text-primary">
                Formel
              </button>
            )}>
            {!d ? <Loading /> : (
              <div className="flex flex-col items-center gap-2">
                {showFormula && (
                  <p id="health-formula" className="w-full rounded-md border border-border bg-panel-3/60 px-2.5 py-2 text-2xs leading-relaxed text-fg-muted" data-testid="health-formula">
                    {d.health.formula}
                  </p>
                )}
                <Gauge value={d.health.score} label={d.health.label} />
                <dl className="flex w-full flex-col divide-y divide-border/70 text-xs">
                  {[
                    [<FolderOpen key="i" />, 'Offene Incidents', fmtNumber(d.counts.open)],
                    [<Flame key="i" />, 'Kritisch / Hoch offen', fmtNumber(d.counts.criticalOpen)],
                    [<Timer key="i" />, 'Ø Zeit bis Gelöst', fmtDuration(d.mttrMinutes) ?? <span className="text-fg-subtle">nicht verfügbar</span>],
                    [<CheckCircle2 key="i" />, 'Gelöst / geschlossen', fmtNumber(d.counts.resolved)],
                  ].map(([icon, label, value], i) => (
                    <div key={i} className="flex items-center justify-between py-1.5">
                      <dt className="flex items-center gap-2 text-fg-muted [&_svg]:size-3.5 [&_svg]:text-fg-subtle">{icon}{label}</dt>
                      <dd className="font-medium tabular-nums">{value}</dd>
                    </div>
                  ))}
                  <div className="flex items-center justify-between py-1.5">
                    <dt className="text-fg-muted">Kernintegrationen</dt>
                    <dd className="flex items-center gap-1.5 text-2xs">
                      {core.map((c) => <span key={c.id} className="flex items-center gap-1"><StateDot state={c.state} pulse />{c.name.split(' ')[0]}</span>)}
                    </dd>
                  </div>
                </dl>
              </div>
            )}
          </Panel>
          <Panel title="Erkennungsabdeckung" subtitle="MITRE ATT&CK – Regeln und Incidents je Technik" scope={['range', 'severity', 'mitre']} testId="coverage-panel"
            actions={<Link to={{ pathname: '/detections', search: query }} className="text-2xs text-primary hover:underline">Alle</Link>}>
            {!coverage.data ? <Loading /> : coverage.data.items.length ? <CoverageList items={coverage.data.items} search={query} /> : <Empty>Keine Regeln für diesen Filter</Empty>}
            <p className="mt-3 flex gap-3 text-2xs text-fg-subtle"><span className="flex items-center gap-1"><span className="size-2 rounded-full bg-primary" />Regel aktiv</span><span className="flex items-center gap-1"><span className="size-2 rounded-full bg-sim/60" />Simuliert</span></p>
          </Panel>
        </div>

        {/* center column */}
        <div className="flex min-w-0 flex-col gap-3 lg:col-span-8 xl:col-span-6">
          <Panel title="Netzwerktopologie" subtitle="Live aus Splunk-Events und Integrationsstatus – Knoten anklicken für Details" scope={['range', 'host', 'severity', 'mitre', 'q']} actions={<TopologyLegend />} bodyClassName="p-0" testId="topology-panel">
            {!topo.data ? <div className="p-3.5"><Loading rows={5} /></div> : <Topology data={topo.data} height={320} showPlanned={false} />}
            {topo.data?.eventsError && <p className="px-3.5 pb-2 text-2xs text-warn">Events: {topo.data.eventsError}</p>}
            <div className="grid grid-cols-2 border-t border-border sm:grid-cols-4 sm:divide-x sm:divide-border">
              <Kpi testId="kpi-open" icon={<FolderOpen className="text-primary" />} label="Offene Incidents" value={d ? fmtNumber(d.counts.open) : '…'} hint="Neu + In Bearbeitung" />
              <Kpi testId="kpi-critical" icon={<Flame className="text-sev-critical" />} label="Kritisch / Hoch offen" value={d ? fmtNumber(d.counts.criticalOpen) : '…'} hint="offen, sofort prüfen" />
              <Kpi testId="kpi-resolved" icon={<CheckCircle2 className="text-st-resolved" />} label="Gelöst" value={d ? fmtNumber(d.counts.resolved) : '…'} hint="im Zeitraum" />
              <Kpi testId="kpi-mttr" icon={<Clock className="text-sev-medium" />} label="Ø Lösungszeit" value={d ? (fmtDuration(d.mttrMinutes) ?? '–') : '…'} hint={d?.mttrMinutes == null ? 'nicht verfügbar' : 'Erkannt → Gelöst'} />
            </div>
          </Panel>
          <Panel title="Incident-Warteschlange" subtitle="Neueste Incidents im Filter" scope={['range', 'host', 'severity', 'mitre', 'q']} testId="queue-panel"
            actions={<Link to={{ pathname: '/incidents', search: query }} className="text-2xs text-primary hover:underline" data-testid="all-incidents">Alle Incidents</Link>} bodyClassName="px-1.5">
            {!d ? <Loading /> : d.latest.length ? <IncidentTable items={d.latest} search={query} compact /> : <Empty>Keine Incidents im gewählten Filter</Empty>}
          </Panel>
        </div>

        {/* right column */}
        <div className="flex flex-col gap-3 lg:col-span-12 lg:grid lg:grid-cols-2 xl:col-span-3 xl:flex">
          <Panel title="Incident-Verlauf" subtitle={d?.focus ? `${incidentKey(d.focus.incident.id)} · ${d.focus.incident.title}` : 'Verlauf des aktuellsten Incidents'} scope={['range', 'host', 'severity', 'mitre', 'q']}
            actions={d?.focus && <Link to={{ pathname: `/incidents/${d.focus.incident.id}`, search: query }} className="text-2xs text-primary hover:underline">Öffnen</Link>}>
            {!d ? <Loading /> : d.focus ? <Timeline history={d.focus.history} /> : <Empty>Kein Incident im Filter</Empty>}
          </Panel>
          <Panel title="Incident-Aktivität" subtitle="Neu vs. gelöst je Intervall" scope={['range', 'host', 'severity', 'mitre', 'q']}
            actions={<span className="flex gap-2 text-2xs text-fg-muted"><span className="flex items-center gap-1"><span className="size-2 rounded-full bg-primary" />Neu</span><span className="flex items-center gap-1"><span className="size-2 rounded-full bg-st-resolved" />Gelöst</span></span>}>
            {!d ? <Loading /> : <ActivityChart data={d.activity} range={filters.range} />}
          </Panel>
        </div>

        {/* bottom row */}
        <Panel className="lg:col-span-12 xl:col-span-6" title="Ereignisanalyse" subtitle={events.data?.data ? `${fmtNumber(events.data.data.total)} Auth-Events aus Splunk (index=homelab_auth)` : 'Splunk index=homelab_auth'} scope={['range', 'host', 'severity', 'mitre', 'q']} testId="events-panel">
          {!events.data ? <Loading rows={4} /> : !events.data.data ? <Unavailable reason={events.data.error ?? 'unbekannt'} /> : events.data.data.total === 0 ? <Empty>Keine Events im gewählten Filter</Empty> : (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-[1fr_220px]">
              <EventTimelineChart data={events.data.data.timeline} range={filters.range} />
              <div>
                <p className="mb-1 text-2xs uppercase tracking-wide text-fg-subtle">event_type</p>
                <HBarChart data={events.data.data.byType.map((t) => ({ ...t, name: t.name === '-' ? '(ohne)' : t.name }))} height={150} />
              </div>
            </div>
          )}
        </Panel>
        <Panel className="lg:col-span-6 xl:col-span-3" title="Systemstatus" subtitle={d ? `${integrationsUp} von ${d.integrations.length} Integrationen online` : undefined} testId="status-panel">
          {!d ? <Loading rows={5} /> : <IntegrationList items={d.integrations} />}
        </Panel>
        <Panel className="lg:col-span-6 xl:col-span-3" title="Datenpipeline" subtitle="Cribl Stream: Eingänge → Routen → Ausgänge" testId="pipeline-panel"
          actions={<Link to="/pipelines" className="text-2xs text-primary hover:underline">Details</Link>}>
          {!pipes.data ? <Loading /> : pipes.data.data ? <PipelineFlow data={pipes.data.data} /> : <Unavailable reason={pipes.data.error ?? 'unbekannt'} />}
        </Panel>
      </div>
    </>
  );
}
