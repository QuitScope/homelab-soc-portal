import { useQuery } from '@tanstack/react-query';
import { Printer } from 'lucide-react';
import { Link } from 'react-router';
import { SeverityBadge, SimulatedBadge, STATUS_LABEL, StateDot } from '@/components/badges';
import { EventTimelineChart, HBarChart } from '@/components/charts';
import { Empty, Loading, PageHeader, Panel, Unavailable } from '@/components/Panel';
import { Topology, TopologyLegend } from '@/components/Topology';
import { Button } from '@/components/ui/button';
import { Table, Td, Th } from '@/components/ui/misc';
import { IntegrationList, PipelineFlow } from '@/components/widgets';
import { api } from '@/lib/api';
import { RANGE_OPTIONS, useFilters } from '@/lib/filters';
import type { CriblOverview, Dashboard, EventAnalytics, Guarded, HostStat, Incident, IntegrationStatus, Page, Topology as TopologyData } from '@/lib/types';
import { fmtDateTime, fmtDuration, fmtNumber, relTime } from '@/lib/utils';
import { RefreshButton } from './Dashboard';

export function Hosts() {
  const { query, setFilter } = useFilters();
  const q = useQuery({ queryKey: ['hosts', query], queryFn: () => api<{ items: HostStat[]; error: string | null }>(`/hosts?${query}`) });
  return (
    <>
      <PageHeader title="Hosts" subtitle="Linux-Hosts, die Auth-Logs über rsyslog → Cribl → Splunk liefern (synthetische Testhosts ausgeblendet)." actions={<RefreshButton />} />
      <Panel title={`${q.data?.items.length ?? '…'} Hosts`} scope={['range', 'host', 'severity', 'mitre', 'q']} bodyClassName="px-1.5" testId="hosts">
        {!q.data ? <Loading rows={4} /> : q.data.error ? <Unavailable reason={q.data.error} /> : q.data.items.length === 0 ? <Empty>Keine Host-Events im Filter</Empty> : (
          <Table>
            <thead><tr><Th>Host</Th><Th>Zustand</Th><Th className="text-right">Ereignisse</Th><Th className="text-right">Fehlschläge</Th><Th className="text-right">Quell-IPs</Th><Th>event_types</Th><Th className="text-right">Offene Incidents</Th><Th className="text-right">Zuletzt gesehen</Th></tr></thead>
            <tbody>
              {q.data.items.map((h) => {
                const recent = Date.now() - Date.parse(h.lastSeen) < 3_600_000;
                return (
                  <tr key={h.host} className="hover:bg-panel-3/60">
                    <Td><button type="button" className="font-medium hover:text-primary" onClick={() => setFilter('host', h.host)} title="Als Filter setzen">{h.host}</button></Td>
                    <Td><span className="flex items-center gap-1.5 text-2xs"><StateDot state={h.openIncidents ? 'attack' : recent ? 'active' : 'idle'} />{h.openIncidents ? 'Offene Incidents' : recent ? 'Aktiv (< 1 h)' : 'Ruhig'}</span></Td>
                    <Td className="text-right tabular-nums">{fmtNumber(h.events)}</Td>
                    <Td className="text-right tabular-nums text-sev-critical">{fmtNumber(h.failures)}</Td>
                    <Td className="text-right tabular-nums">{h.sources}</Td>
                    <Td className="text-2xs text-fg-muted">{Object.entries(h.eventTypes).map(([k, v]) => `${k === '-' ? '(ohne)' : k}: ${v}`).join(' · ')}</Td>
                    <Td className="text-right tabular-nums">{h.openIncidents ?? 0}</Td>
                    <Td className="text-right text-fg-muted" title={fmtDateTime(h.lastSeen)}>{relTime(h.lastSeen)}</Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}
        <p className="px-2 pt-2 text-2xs text-fg-subtle">Inventar-/Agentendaten (Wazuh, Prometheus node_exporter) sind nicht angebunden – siehe Settings.</p>
      </Panel>
    </>
  );
}

export function NetworkPage() {
  const { query } = useFilters();
  const topo = useQuery({ queryKey: ['topology', query], queryFn: () => api<TopologyData>(`/topology?${query}`) });
  const events = useQuery({ queryKey: ['events', query], queryFn: () => api<Guarded<EventAnalytics>>(`/events?${query}`) });
  return (
    <>
      <PageHeader title="Netzwerk" subtitle="Datenfluss und Anmeldequellen, aus Splunk-Events abgeleitet." actions={<RefreshButton />} />
      <Panel title="Topologie" scope={['range', 'host', 'severity', 'mitre', 'q']} actions={<TopologyLegend />} bodyClassName="p-0">
        {!topo.data ? <div className="p-3.5"><Loading rows={6} /></div> : <Topology data={topo.data} height={460} />}
      </Panel>
      <Panel title="Anmeldequellen (src)" subtitle="Quell-IP-Adressen der Auth-Events, sortiert nach Fehlschlägen" scope={['range', 'host', 'severity', 'mitre', 'q']} bodyClassName="px-1.5">
        {!events.data ? <Loading /> : !events.data.data ? <Unavailable reason={events.data.error ?? ''} /> : events.data.data.topSources.length === 0 ? <Empty>Keine Quellen</Empty> : (
          <Table>
            <thead><tr><Th>Quelle</Th><Th className="text-right">Ereignisse</Th><Th className="text-right">Fehlschläge</Th><Th>Bewertung</Th></tr></thead>
            <tbody>{events.data.data.topSources.map((s) => (
              <tr key={s.src}><Td className="font-mono">{s.src}</Td><Td className="text-right tabular-nums">{s.count}</Td><Td className="text-right tabular-nums text-sev-critical">{s.failures}</Td>
                <Td className="text-2xs">{s.failures >= 3 ? <span className="text-sev-critical">≥ 3 Fehlschläge – Schwelle der Regel ssh_password_guessing</span> : <span className="text-fg-subtle">unauffällig</span>}</Td></tr>
            ))}</tbody>
          </Table>
        )}
      </Panel>
    </>
  );
}

export function Pipelines() {
  const q = useQuery({ queryKey: ['pipelines'], queryFn: () => api<Guarded<CriblOverview>>('/pipelines') });
  const d = q.data?.data;
  return (
    <>
      <PageHeader title="Pipelines" subtitle="Cribl Stream live über die REST-API (Secrets werden serverseitig entfernt)." actions={<RefreshButton />} />
      {!q.data ? <Loading rows={6} /> : !d ? <Unavailable reason={q.data.error ?? ''} /> : (
        <>
          <Panel title="Datenfluss"><PipelineFlow data={d} /></Panel>
          <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
            <Panel title="Routen" subtitle="Reihenfolge wie in Cribl" bodyClassName="px-1.5" testId="routes">
              <Table>
                <thead><tr><Th>Route</Th><Th>Filter</Th><Th>Pipeline</Th><Th>Ausgang</Th></tr></thead>
                <tbody>{d.routes.map((r) => (
                  <tr key={r.id} className={r.disabled ? 'opacity-50' : ''}><Td className="font-medium">{r.name}{r.final && <span className="ml-1 text-2xs text-fg-subtle">final</span>}</Td><Td className="max-w-[18rem] truncate font-mono text-2xs text-fg-muted" title={r.filter}>{r.filter}</Td><Td>{r.pipeline}</Td><Td>{r.output ?? '–'}</Td></tr>
                ))}</tbody>
              </Table>
            </Panel>
            <Panel title="Ausgänge & Zähler" subtitle="Zähler seit Worker-Start" bodyClassName="px-1.5">
              <Table>
                <thead><tr><Th>Ausgang</Th><Th>Typ</Th><Th>Zustand</Th><Th className="text-right">Gesendet</Th><Th className="text-right">Bytes</Th><Th className="text-right">Verworfen</Th></tr></thead>
                <tbody>{d.outputs.map((o) => (
                  <tr key={o.id}><Td className="font-medium">{o.id}</Td><Td className="text-fg-muted">{o.type}</Td><Td><span className="flex items-center gap-1.5"><StateDot state={o.health === 'Green' ? 'up' : 'degraded'} />{o.health ?? '–'}</span></Td>
                    <Td className="text-right tabular-nums">{fmtNumber(o.metrics.sentCount)}</Td><Td className="text-right tabular-nums">{fmtNumber(o.metrics.bytesOut)}</Td><Td className="text-right tabular-nums">{fmtNumber(o.metrics.numDropped)}</Td></tr>
                ))}</tbody>
              </Table>
            </Panel>
            <Panel title="Pipelines" bodyClassName="px-1.5">
              <Table>
                <thead><tr><Th>Pipeline</Th><Th className="text-right">Funktionen</Th><Th>Beschreibung</Th></tr></thead>
                <tbody>{d.pipelines.map((p) => <tr key={p.id}><Td className="font-medium">{p.id}</Td><Td className="text-right">{p.functions}</Td><Td className="text-fg-muted">{p.description || '–'}</Td></tr>)}</tbody>
              </Table>
            </Panel>
            <Panel title="Eingänge" bodyClassName="px-1.5">
              <Table>
                <thead><tr><Th>Eingang</Th><Th>Typ</Th><Th>Aktiv</Th><Th>Zustand</Th></tr></thead>
                <tbody>{d.inputs.map((i) => <tr key={i.id} className={i.disabled ? 'opacity-50' : ''}><Td className="font-medium">{i.id}</Td><Td className="text-fg-muted">{i.type}</Td><Td>{i.disabled ? 'nein' : 'ja'}</Td><Td>{i.health ?? '–'}</Td></tr>)}</tbody>
              </Table>
            </Panel>
          </div>
        </>
      )}
    </>
  );
}

function NotConfiguredBanner({ integration }: { integration?: IntegrationStatus }) {
  return (
    <div className="panel flex flex-wrap items-center gap-3 border-sim/30 p-3 text-xs">
      <StateDot state={integration?.state ?? 'not_configured'} />
      <span className="font-medium">{integration?.name}: {integration?.detail ?? 'Nicht konfiguriert'}</span>
      <SimulatedBadge />
      <span className="text-fg-muted">Die Daten unten sind Demo-Daten und stammen nicht aus dem Homelab.</span>
    </div>
  );
}

export function Soar() {
  const q = useQuery({ queryKey: ['soar'], queryFn: () => api<{ integration?: IntegrationStatus; playbooks: { id: string; name: string; trigger: string; steps: string[]; state: string }[] }>('/soar') });
  return (
    <>
      <PageHeader title="SOAR" subtitle="Shuffle-Playbooks – Adapter vorbereitet, Instanz noch nicht angebunden." />
      {!q.data ? <Loading /> : (
        <>
          <NotConfiguredBanner integration={q.data.integration} />
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            {q.data.playbooks.map((p) => (
              <Panel key={p.id} title={p.name} subtitle={`Trigger: ${p.trigger}`} actions={<SimulatedBadge />}>
                <ol className="flex flex-col gap-1.5 text-xs">{p.steps.map((s, i) => <li key={s} className="flex items-center gap-2"><span className="grid size-5 place-items-center rounded-full border border-border-strong text-2xs text-fg-muted">{i + 1}</span>{s}</li>)}</ol>
                <p className="mt-3 text-2xs text-fg-subtle">Zustand: {p.state} · nie ausgeführt</p>
              </Panel>
            ))}
          </div>
        </>
      )}
    </>
  );
}

export function ThreatIntel() {
  const q = useQuery({ queryKey: ['threat-intel'], queryFn: () => api<{ integration?: IntegrationStatus; indicators: { indicator: string; type: string; source: string; confidence: number; labels: string[]; firstSeen: string }[] }>('/threat-intel') });
  return (
    <>
      <PageHeader title="Threat Intel" subtitle="OpenCTI – Adapter vorbereitet, Instanz noch nicht angebunden." />
      {!q.data ? <Loading /> : (
        <>
          <NotConfiguredBanner integration={q.data.integration} />
          <Panel title="Indikatoren" actions={<SimulatedBadge />} bodyClassName="px-1.5">
            <Table>
              <thead><tr><Th>Indikator</Th><Th>Typ</Th><Th>Quelle</Th><Th className="text-right">Konfidenz</Th><Th>Labels</Th><Th className="text-right">Erstmals</Th></tr></thead>
              <tbody>{q.data.indicators.map((i) => (
                <tr key={i.indicator}><Td className="font-mono">{i.indicator}</Td><Td className="text-fg-muted">{i.type}</Td><Td className="text-fg-muted">{i.source}</Td><Td className="text-right">{i.confidence}</Td><Td className="text-2xs">{i.labels.join(', ')}</Td><Td className="text-right text-fg-muted">{fmtDateTime(i.firstSeen)}</Td></tr>
              ))}</tbody>
            </Table>
          </Panel>
        </>
      )}
    </>
  );
}

export function Reports() {
  const { filters, query } = useFilters();
  const dash = useQuery({ queryKey: ['dashboard', query], queryFn: () => api<Dashboard>(`/dashboard?${query}`) });
  const events = useQuery({ queryKey: ['events', query], queryFn: () => api<Guarded<EventAnalytics>>(`/events?${query}`) });
  const list = useQuery({ queryKey: ['report-incidents', query], queryFn: () => api<Page<Incident>>(`/incidents?${query}&pageSize=100`) });
  const d = dash.data;
  const byDetection = new Map<string, number>();
  list.data?.items.forEach((i) => byDetection.set(i.title, (byDetection.get(i.title) ?? 0) + 1));
  return (
    <>
      <PageHeader
        title="Sicherheitsbericht"
        subtitle={`${RANGE_OPTIONS.find((r) => r.value === filters.range)?.label} · erstellt ${fmtDateTime(new Date().toISOString())}${filters.host ? ` · Host ${filters.host}` : ''}${filters.severity ? ` · Schweregrad ${filters.severity}` : ''}${filters.mitre ? ` · ${filters.mitre}` : ''}`}
        actions={<Button size="sm" onClick={() => window.print()}><Printer /> Drucken / PDF</Button>}
      />
      {!d ? <Loading rows={6} /> : (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
          <Panel title="Zusammenfassung" scope={['range', 'host', 'severity', 'mitre', 'q']}>
            <dl className="grid grid-cols-2 gap-3 text-xs">
              {[['Incidents', d.counts.total], ['Offen', d.counts.open], ['Kritisch/Hoch offen', d.counts.criticalOpen], ['Gelöst/geschlossen', d.counts.resolved], ['Ø Lösungszeit', fmtDuration(d.mttrMinutes) ?? 'nicht verfügbar'], ['Health Score', `${d.health.score}/100`]].map(([k, v]) => (
                <div key={k}><dt className="text-2xs text-fg-subtle">{k}</dt><dd className="text-lg font-semibold">{v}</dd></div>
              ))}
            </dl>
          </Panel>
          <Panel title="Nach Status / Schweregrad">
            <div className="flex flex-col gap-1.5 text-xs">
              {Object.entries(d.counts.byStatus).map(([k, v]) => <p key={k} className="flex justify-between"><span>{STATUS_LABEL[k as keyof typeof STATUS_LABEL]}</span><span className="tabular-nums">{v}</span></p>)}
              <div className="my-1 h-px bg-border" />
              {Object.entries(d.counts.bySeverity).map(([k, v]) => <p key={k} className="flex justify-between"><SeverityBadge severity={k as 'low'} /><span className="tabular-nums">{v}</span></p>)}
            </div>
          </Panel>
          <Panel title="Nach Detection">
            {byDetection.size ? <HBarChart data={[...byDetection].map(([name, count]) => ({ name, count }))} height={Math.max(80, byDetection.size * 30)} /> : <Empty>Keine Incidents</Empty>}
          </Panel>
          <Panel className="lg:col-span-3" title="Anmelde-Ereignisse (Splunk)">
            {!events.data ? <Loading /> : events.data.data ? <EventTimelineChart data={events.data.data.timeline} range={filters.range} /> : <Unavailable reason={events.data.error ?? ''} compact />}
          </Panel>
          <Panel className="lg:col-span-3" title="Incidents im Zeitraum" bodyClassName="px-1.5">
            <Table>
              <thead><tr><Th>ID</Th><Th>Titel</Th><Th>Schweregrad</Th><Th>Status</Th><Th>Host</Th><Th className="text-right">Erstellt</Th></tr></thead>
              <tbody>{list.data?.items.map((i) => (
                <tr key={i.id}><Td className="font-mono text-2xs"><Link to={`/incidents/${i.id}`}>INC-{String(i.id).padStart(4, '0')}</Link></Td><Td>{i.title}{i.source === 'simulated' && ' (simuliert)'}</Td><Td><SeverityBadge severity={i.severity} /></Td><Td>{STATUS_LABEL[i.status]}</Td><Td>{i.host ?? '–'}</Td><Td className="text-right">{fmtDateTime(i.createdAt)}</Td></tr>
              ))}</tbody>
            </Table>
          </Panel>
        </div>
      )}
    </>
  );
}

interface SettingsData {
  authConfigured: boolean;
  adminUser: string;
  allowlist: string[];
  excludeHosts: string[];
  excludeSources: string[];
  splunk: { url: string | null; index: string; sourcetype: string; verifyTls: boolean };
  cribl: { url: string | null };
  stubs: Record<string, string | null>;
  syncIntervalSec: number;
  timeoutMs: number;
  sigmaImport: { importedAt: string; source: string };
}

export function Settings() {
  const s = useQuery({ queryKey: ['settings'], queryFn: () => api<SettingsData>('/settings') });
  const i = useQuery({ queryKey: ['integrations'], queryFn: () => api<{ items: IntegrationStatus[] }>('/integrations') });
  const row = (k: string, v: React.ReactNode) => (
    <div key={k} className="flex justify-between gap-4 border-b border-border/60 py-1.5 text-xs"><dt className="text-fg-muted">{k}</dt><dd className="break-all text-right font-mono text-2xs">{v}</dd></div>
  );
  return (
    <>
      <PageHeader title="Einstellungen" subtitle="Nur lesend – Konfiguration erfolgt über .env auf dem Server. Secrets werden nie ausgeliefert." />
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <Panel title="Integrationen" subtitle="Live-Health-Check">{!i.data ? <Loading rows={5} /> : <IntegrationList items={i.data.items} />}</Panel>
        <Panel title="Konfiguration">
          {!s.data ? <Loading rows={8} /> : (
            <dl>
              {row('Login', s.data.authConfigured ? `Single-User „${s.data.adminUser}“, scrypt-Hash` : 'nicht konfiguriert (nur lesend)')}
              {row('Integration-Allowlist (SSRF-Schutz)', s.data.allowlist.join(', '))}
              {row('Splunk REST', s.data.splunk.url ?? 'nicht gesetzt')}
              {row('Splunk Index / Sourcetype', `${s.data.splunk.index} / ${s.data.splunk.sourcetype}`)}
              {row('Splunk TLS-Prüfung', s.data.splunk.verifyTls ? 'an' : 'aus (selbstsigniert, nur internes Docker-Netz)')}
              {row('Cribl API', s.data.cribl.url ?? 'nicht gesetzt')}
              {Object.entries(s.data.stubs).map(([k, v]) => row(k, v ?? 'nicht konfiguriert'))}
              {row('Ausgeblendete Hosts', s.data.excludeHosts.join(', '))}
              {row('Ausgeblendete Splunk-Sources', s.data.excludeSources.join(', ') || '–')}
              {row('Incident-Sync', s.data.syncIntervalSec ? `alle ${s.data.syncIntervalSec} s` : 'aus')}
              {row('HTTP-Timeout', `${s.data.timeoutMs} ms`)}
              {row('Sigma-Import', `${s.data.sigmaImport.source} · ${fmtDateTime(s.data.sigmaImport.importedAt)}`)}
            </dl>
          )}
        </Panel>
      </div>
    </>
  );
}
