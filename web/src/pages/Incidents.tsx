import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, ChevronLeft, ChevronRight } from 'lucide-react';
import { useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router';
import { MitreTag, SeverityBadge, SimulatedBadge, STATUS_LABEL, StatusBadge } from '@/components/badges';
import { IncidentTable, type SortKey } from '@/components/IncidentTable';
import { Empty, Loading, PageHeader, Panel, Unavailable } from '@/components/Panel';
import { Timeline } from '@/components/Timeline';
import { Button } from '@/components/ui/button';
import { Input, Select, Table, Td, Th } from '@/components/ui/misc';
import { Tooltip } from '@/components/ui/tooltip';
import { api, send } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useFilters } from '@/lib/filters';
import type { Incident, IncidentDetail as Detail, Page, Status } from '@/lib/types';
import { fmtDateTime, incidentKey } from '@/lib/utils';
import { RefreshButton, SyncButton } from './Dashboard';

// same transition table as the server (server/src/incidents.ts) – the server is authoritative
const TRANSITIONS: Record<Status, Status[]> = { new: ['investigating'], investigating: ['resolved'], resolved: ['closed', 'investigating'], closed: [] };

export function Incidents() {
  const { query } = useFilters();
  const [params, setParams] = useSearchParams();
  const page = Number(params.get('page') ?? 1);
  const sort = (params.get('sort') as SortKey) ?? 'created_at';
  const order = (params.get('order') as 'asc' | 'desc') ?? 'desc';
  const status = params.get('status') ?? '';
  const set = (patch: Record<string, string | undefined>) =>
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      for (const [k, v] of Object.entries(patch)) v ? next.set(k, v) : next.delete(k);
      return next;
    });
  const qs = new URLSearchParams(query);
  Object.entries({ page: String(page), sort, order, status, pageSize: '15' }).forEach(([k, v]) => v && qs.set(k, v));
  const list = useQuery({ queryKey: ['incidents', qs.toString()], queryFn: () => api<Page<Incident>>(`/incidents?${qs}`), placeholderData: (p) => p });
  const pages = list.data ? Math.max(1, Math.ceil(list.data.total / list.data.pageSize)) : 1;

  return (
    <>
      <PageHeader title="Incidents" subtitle="Aus Splunk-Alerts (Sigma-Regeln) erzeugt, Status persistent in SQLite." actions={<><RefreshButton /><SyncButton /></>} />
      <Panel
        title={`${list.data?.total ?? '…'} Incidents`}
        subtitle="Globale Filter + Status; Spaltenköpfe sortieren"
        scope={['range', 'host', 'severity', 'mitre', 'q']}
        actions={
          <Select aria-label="Status" value={status} onChange={(e) => set({ status: e.target.value || undefined, page: undefined })}>
            <option value="">Status: alle</option>
            {Object.entries(STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>Status: {v}</option>)}
          </Select>
        }
        bodyClassName="px-1.5"
        testId="incident-list"
      >
        {list.error ? <Unavailable reason={list.error.message} /> : !list.data ? <Loading rows={6} /> : list.data.items.length === 0 ? <Empty>Keine Incidents für diesen Filter</Empty> : (
          <IncidentTable
            items={list.data.items}
            search={query}
            sort={sort}
            order={order}
            onSort={(key) => set({ sort: key, order: sort === key && order === 'desc' ? 'asc' : 'desc', page: undefined })}
          />
        )}
        <div className="flex items-center justify-end gap-2 px-2 pt-2.5 text-2xs text-fg-muted">
          Seite {page} von {pages}
          <Button size="icon" variant="ghost" aria-label="Vorherige Seite" disabled={page <= 1} onClick={() => set({ page: String(page - 1) })}><ChevronLeft /></Button>
          <Button size="icon" variant="ghost" aria-label="Nächste Seite" disabled={page >= pages} onClick={() => set({ page: String(page + 1) })}><ChevronRight /></Button>
        </div>
      </Panel>
    </>
  );
}

export function IncidentDetail() {
  const { id } = useParams();
  const { query } = useFilters();
  const { user } = useAuth();
  const qc = useQueryClient();
  const [note, setNote] = useState('');
  const q = useQuery({ queryKey: ['incident', id], queryFn: () => api<Detail>(`/incidents/${id}`) });
  const change = useMutation({
    mutationFn: (status: Status) => send<Detail>(`/incidents/${id}/status`, { status, note: note || undefined }, 'PATCH'),
    onSuccess: (data) => {
      qc.setQueryData(['incident', id], data);
      qc.invalidateQueries({ predicate: (x) => x.queryKey[0] !== 'incident' });
      setNote('');
    },
  });
  const i = q.data;
  if (q.error) return <Unavailable reason={q.error.message} />;
  if (!i) return <Loading rows={6} />;
  const details = i.details.filter((r) => Object.keys(r).length);
  const cols = [...new Set(details.flatMap((r) => Object.keys(r)))].filter((c) => !c.startsWith('_') || c === '_time');

  return (
    <>
      <Link to={{ pathname: '/incidents', search: query }} className="flex w-fit items-center gap-1 text-xs text-fg-muted hover:text-primary"><ArrowLeft className="size-3.5" /> Incidents</Link>
      <PageHeader
        title={`${incidentKey(i.id)} · ${i.title}`}
        subtitle={<span className="flex flex-wrap items-center gap-2">Status <span data-testid="current-status"><StatusBadge status={i.status} /></span> <SeverityBadge severity={i.severity} /> {i.source === 'simulated' ? <SimulatedBadge /> : <span>Quelle: ausgelöster Splunk-Alarm</span>}</span>}
      />
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        <div className="flex flex-col gap-3 lg:col-span-2">
          <Panel title="Übersicht">
            <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-xs sm:grid-cols-3">
              {[
                ['Erstellt', fmtDateTime(i.createdAt)],
                ['Aktualisiert', fmtDateTime(i.updatedAt)],
                ['Host', i.host],
                ['Benutzer', i.user],
                ['Quelle (src)', i.src],
                ['Ereignisse', String(i.eventCount)],
              ].map(([k, v]) => (
                <div key={k}><dt className="text-2xs text-fg-subtle">{k}</dt><dd className="font-medium">{v ?? <span className="text-fg-subtle">–</span>}</dd></div>
              ))}
              <div><dt className="text-2xs text-fg-subtle">Detection</dt><dd>{i.detectionId ? <Link className="font-medium text-primary hover:underline" to={{ pathname: `/detections/${i.detectionId}`, search: query }}>{i.detectionId}</Link> : '–'}</dd></div>
              <div className="col-span-2"><dt className="text-2xs text-fg-subtle">MITRE ATT&CK</dt><dd className="mt-0.5 flex gap-1">{i.mitre.length ? i.mitre.map((m) => <MitreTag key={m} id={m} />) : '–'}</dd></div>
              <div className="col-span-full"><dt className="text-2xs text-fg-subtle">Externe ID</dt><dd className="break-all font-mono text-2xs text-fg-muted">{i.externalId}</dd></div>
            </dl>
          </Panel>
          <Panel title="Ergebnisse der Suche" subtitle="Momentaufnahme der Splunk-Ergebnisse beim ersten Sync">
            {details.length === 0 ? <Empty>Keine Ergebnisdaten gespeichert</Empty> : (
              <Table>
                <thead><tr>{cols.map((c) => <Th key={c}>{c}</Th>)}</tr></thead>
                <tbody>{details.map((r, n) => <tr key={n}>{cols.map((c) => <Td key={c} className="font-mono text-2xs">{String(r[c] ?? '')}</Td>)}</tr>)}</tbody>
              </Table>
            )}
          </Panel>
        </div>
        <div className="flex flex-col gap-3">
          <Panel title="Status ändern" subtitle="Neu → In Bearbeitung → Gelöst → Geschlossen" testId="status-panel">
            {!user && <p className="mb-2 text-2xs text-warn">Zum Ändern anmelden (oben rechts).</p>}
            <div className="flex flex-col gap-2">
              <Input placeholder="Notiz (optional)" value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} disabled={!user} aria-label="Notiz" />
              <div className="flex flex-wrap gap-2">
                {TRANSITIONS[i.status].length === 0 && <span className="text-2xs text-fg-subtle">Abgeschlossen – keine weiteren Übergänge.</span>}
                {TRANSITIONS[i.status].map((s) => (
                  <Tooltip key={s} content={user ? `Status auf ${STATUS_LABEL[s]} setzen` : 'Anmeldung nötig'}>
                    <span>
                      <Button variant={s === 'investigating' && i.status === 'resolved' ? 'outline' : 'default'} size="sm" disabled={!user || change.isPending} onClick={() => change.mutate(s)} data-testid={`to-${s}`}>
                        {i.status === 'resolved' && s === 'investigating' ? 'Wieder öffnen' : `→ ${STATUS_LABEL[s]}`}
                      </Button>
                    </span>
                  </Tooltip>
                ))}
              </div>
              {change.error && <p className="text-2xs text-sev-critical" role="alert">{change.error.message}</p>}
            </div>
          </Panel>
          <Panel title="Änderungsverlauf" subtitle="persistent in SQLite">
            <Timeline history={i.history} />
          </Panel>
        </div>
      </div>
    </>
  );
}
