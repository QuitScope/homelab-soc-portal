import type { CriblOverview } from './adapters/cribl.js';
import type { IntegrationStatus } from './adapters/http.js';
import type { EventAnalytics } from './events.js';
import type { Incident } from './incidents.js';

export type NodeStatus = 'up' | 'degraded' | 'down' | 'not_configured' | 'active' | 'idle' | 'attack' | 'suspicious' | 'normal';

export interface TopoNode {
  id: string;
  type: 'source' | 'host' | 'pipeline' | 'siem' | 'portal' | 'integration';
  label: string;
  status: NodeStatus;
  column: number;
  meta: Record<string, string | number | null>;
}

export interface TopoEdge {
  id: string;
  source: string;
  target: string;
  label: string;
  kind: 'attack' | 'normal' | 'planned';
}

interface Input {
  events: EventAnalytics | null;
  eventsError: string | null;
  integrations: IntegrationStatus[];
  cribl: CriblOverview | null;
  incidents: Incident[];
  isExcluded: (host: string) => boolean;
}

/** Topology built only from live data: Splunk event sources, Linux hosts, Cribl/Splunk health and configured integrations. */
export function buildTopology({ events, eventsError, integrations, cribl, incidents, isExcluded }: Input) {
  const nodes: TopoNode[] = [];
  const edges: TopoEdge[] = [];
  const integ = (id: string) => integrations.find((i) => i.id === id);
  const hosts = (events?.hosts ?? []).filter((h) => !isExcluded(h.host)).slice(0, 6);

  // sources with failed logins (top 4); red only while an incident for the source is open, else ≥3 failures = suspicious
  const attackers = (events?.topSources ?? []).filter((s) => s.failures > 0).slice(0, 4);
  for (const s of attackers) {
    const srcIncidents = incidents.filter((i) => i.src === s.src);
    const open = srcIncidents.filter((i) => i.status === 'new' || i.status === 'investigating').length;
    nodes.push({
      id: `src:${s.src}`,
      type: 'source',
      label: s.src,
      status: open > 0 ? 'attack' : s.failures >= 3 ? 'suspicious' : 'normal',
      column: 0,
      meta: { 'Ereignisse': s.count, 'Fehlgeschlagene Logins': s.failures, Incidents: srcIncidents.length, 'Offene Incidents': open },
    });
    for (const t of s.hosts) {
      if (!hosts.some((h) => h.host === t.host)) continue;
      edges.push({ id: `e:${s.src}:${t.host}`, source: `src:${s.src}`, target: `host:${t.host}`, label: `${t.failures} Fehlversuche`, kind: open > 0 && t.failures >= 3 ? 'attack' : 'normal' });
    }
  }

  for (const h of hosts) {
    const recent = Date.now() - Date.parse(h.lastSeen) < 3_600_000;
    const open = incidents.filter((i) => i.host === h.host && (i.status === 'new' || i.status === 'investigating')).length;
    nodes.push({
      id: `host:${h.host}`,
      type: 'host',
      label: h.host,
      status: open > 0 ? 'attack' : recent ? 'active' : 'idle',
      column: 1,
      meta: { 'Typ': 'Linux-Host (rsyslog)', 'Ereignisse': h.events, 'Fehlschläge': h.failures, 'Quell-IPs': h.sources, 'Zuletzt gesehen': h.lastSeen, 'Offene Incidents': open },
    });
    edges.push({ id: `e:${h.host}:cribl`, source: `host:${h.host}`, target: 'cribl', label: 'syslog UDP 9514', kind: 'normal' });
  }

  const c = integ('cribl');
  nodes.push({
    id: 'cribl',
    type: 'pipeline',
    label: 'Cribl Stream',
    status: c?.state ?? 'not_configured',
    column: 2,
    meta: {
      Version: c?.version ?? null,
      Status: c?.detail ?? null,
      'Latenz (ms)': c?.latencyMs ?? null,
      'Aktive Inputs': cribl ? cribl.inputs.filter((i) => !i.disabled).length : null,
      Routen: cribl ? cribl.routes.filter((r) => !r.disabled).length : null,
      'Gesendet an Splunk (seit Start)': cribl?.outputs.find((o) => o.type === 'splunk_hec')?.metrics.sentCount ?? null,
    },
  });
  const s = integ('splunk');
  nodes.push({
    id: 'splunk',
    type: 'siem',
    label: 'Splunk',
    status: s?.state ?? 'not_configured',
    column: 3,
    meta: { Version: s?.version ?? null, Status: s?.detail ?? null, 'Latenz (ms)': s?.latencyMs ?? null, 'Events im Zeitraum': events?.total ?? null, Fehler: eventsError },
  });
  nodes.push({ id: 'portal', type: 'portal', label: 'SOC Portal', status: 'up', column: 4, meta: { Incidents: incidents.length } });
  edges.push(
    { id: 'e:cribl:splunk', source: 'cribl', target: 'splunk', label: 'HEC 8088', kind: 'normal' },
    { id: 'e:splunk:portal', source: 'splunk', target: 'portal', label: 'REST 8089', kind: 'normal' },
    { id: 'e:cribl:portal', source: 'cribl', target: 'portal', label: 'API 9000', kind: 'normal' },
  );

  for (const i of integrations.filter((x) => !['splunk', 'cribl'].includes(x.id))) {
    nodes.push({ id: i.id, type: 'integration', label: i.name, status: i.state, column: 5, meta: { Kategorie: i.category, Status: i.detail } });
    edges.push({ id: `e:portal:${i.id}`, source: 'portal', target: i.id, label: i.category, kind: 'planned' });
  }

  return { nodes, edges, eventsError };
}
