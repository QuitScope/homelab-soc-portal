import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, CheckCircle2, CircleSlash, XCircle } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link, useParams } from 'react-router';
import { MitreTag, OriginBadge, SeverityBadge } from '@/components/badges';
import { IncidentTable } from '@/components/IncidentTable';
import { Empty, Loading, PageHeader, Panel, Unavailable } from '@/components/Panel';
import { Table, Td, Th } from '@/components/ui/misc';
import { CoverageList } from '@/components/widgets';
import { api } from '@/lib/api';
import { useFilters } from '@/lib/filters';
import type { CoverageItem, DetectionDetail as Detail, DetectionListItem, DetectionTests } from '@/lib/types';
import { fmtDateTime } from '@/lib/utils';

function TestState({ ok, label }: { ok: boolean | null; label: ReactNode }) {
  const Icon = ok === true ? CheckCircle2 : ok === false ? XCircle : CircleSlash;
  return (
    <span className="flex items-center gap-1.5 text-xs">
      <Icon className={ok === true ? 'size-3.5 text-ok' : ok === false ? 'size-3.5 text-down' : 'size-3.5 text-fg-subtle'} />
      {label}
    </span>
  );
}

const testSummary = (t: DetectionTests | null) =>
  !t ? <span className="text-fg-subtle">–</span> : t.liveFixture === 'PASS' ? <span className="text-ok">PASS</span> : t.liveFixture === 'FAIL' ? <span className="text-down">FAIL</span> : <span className="text-fg-subtle">nicht getestet</span>;

export function Detections() {
  const { query } = useFilters();
  const list = useQuery({ queryKey: ['detections', query], queryFn: () => api<{ items: DetectionListItem[]; error: string | null; sigmaImport: { importedAt: string; source: string } }>(`/detections?${query}`) });
  const coverage = useQuery({ queryKey: ['coverage', query], queryFn: () => api<{ items: CoverageItem[] }>(`/coverage?${query}`) });
  return (
    <>
      <PageHeader
        title="Erkennungsregeln"
        subtitle={list.data ? `Sigma-Regeln aus ${list.data.sigmaImport.source}, importiert ${fmtDateTime(list.data.sigmaImport.importedAt)} · lokale Splunk-Suchen live` : 'Sigma Detection Lab, Splunk Saved Searches'}
      />
      <div className="grid grid-cols-1 gap-3 xl:grid-cols-4">
        <Panel className="xl:col-span-3" title={`${list.data?.items.length ?? '…'} Regeln`} subtitle="Importiert = Sigma Detection Lab · Lokal = Splunk-Suche ohne Sigma · Simuliert = Demo" scope={['severity', 'mitre', 'q']} bodyClassName="px-1.5" testId="detection-list">
          {list.data?.error && <p className="px-2 pb-2 text-2xs text-warn">Lokale Regeln nicht verfügbar: {list.data.error}</p>}
          {!list.data ? <Loading rows={5} /> : list.data.items.length === 0 ? <Empty>Keine Regeln für diesen Filter</Empty> : (
            <Table>
              <thead><tr><Th>Regel</Th><Th>Herkunft</Th><Th>Schweregrad</Th><Th>MITRE</Th><Th>Alarm</Th><Th>Live-Test</Th><Th className="text-right">Incidents</Th></tr></thead>
              <tbody>
                {list.data.items.map((d) => (
                  <tr key={d.id} className="hover:bg-panel-3/60">
                    <Td className="max-w-[20rem]"><Link to={{ pathname: `/detections/${d.id}`, search: query }} className="block truncate font-medium hover:text-primary">{d.title}</Link><span className="font-mono text-2xs text-fg-subtle">{d.id}</span></Td>
                    <Td><OriginBadge origin={d.origin} /></Td>
                    <Td><SeverityBadge severity={d.level} /></Td>
                    <Td><span className="flex flex-wrap gap-1">{d.mitre.map((m) => <MitreTag key={m} id={m} />)}</span></Td>
                    <Td className="text-fg-muted">{d.origin === 'simulated' ? '–' : d.scheduled ? 'geplant (5 min)' : 'nicht geplant'}</Td>
                    <Td>{testSummary(d.tests)}</Td>
                    <Td className="text-right tabular-nums">{d.incidents}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Panel>
        <Panel title="MITRE-Abdeckung" scope={['range', 'severity', 'mitre']}>
          {!coverage.data ? <Loading /> : <CoverageList items={coverage.data.items} search={query} />}
        </Panel>
      </div>
    </>
  );
}

export function DetectionDetail() {
  const { id } = useParams();
  const { query } = useFilters();
  const q = useQuery({ queryKey: ['detection', id], queryFn: () => api<Detail>(`/detections/${id}`) });
  const d = q.data;
  if (q.error) return <Unavailable reason={q.error.message} />;
  if (!d) return <Loading rows={6} />;
  return (
    <>
      <Link to={{ pathname: '/detections', search: query }} className="flex w-fit items-center gap-1 text-xs text-fg-muted hover:text-primary"><ArrowLeft className="size-3.5" /> Detections</Link>
      <PageHeader title={d.title} subtitle={<span className="flex flex-wrap items-center gap-2"><OriginBadge origin={d.origin} /><SeverityBadge severity={d.level} />{d.ruleStatus && <span>Status: {d.ruleStatus}</span>}{d.sigmaId && <span className="font-mono">{d.sigmaId}</span>}</span>} />
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        <div className="flex flex-col gap-3 lg:col-span-2">
          <Panel title="Beschreibung">
            <p className="whitespace-pre-line text-xs leading-relaxed text-fg-muted">{d.description}</p>
            <div className="mt-3 flex flex-wrap gap-1.5">{d.mitre.map((m) => <MitreTag key={m} id={m} />)}{d.tactics.map((t) => <span key={t} className="rounded bg-panel-3 px-1.5 text-2xs text-fg-muted">{t}</span>)}</div>
          </Panel>
          <Panel title="Logik" subtitle={d.logsource ? `logsource: ${Object.entries(d.logsource).map(([k, v]) => `${k}=${v}`).join(', ')}` : undefined}>
            <pre className="overflow-x-auto rounded-md border border-border bg-bg/60 p-3 font-mono text-2xs leading-relaxed text-fg">{d.logic}</pre>
          </Panel>
          <Panel title="Generierte SPL" subtitle={d.savedSearch ? `Gespeicherte Splunk-Suche „${d.savedSearch}“${d.scheduled ? ' · alle 5 Minuten' : ''}` : undefined}>
            {d.spl ? <pre className="overflow-x-auto whitespace-pre-wrap rounded-md border border-border bg-bg/60 p-3 font-mono text-2xs leading-relaxed text-primary">{d.spl}</pre> : <Empty>Keine SPL (simuliert)</Empty>}
          </Panel>
          <Panel title="Incidents dieser Regel" subtitle="letzte 30 Tage" bodyClassName="px-1.5">
            {d.incidents.length ? <IncidentTable items={d.incidents} search={query} compact /> : <Empty>Keine Incidents</Empty>}
          </Panel>
        </div>
        <div className="flex flex-col gap-3">
          <Panel title="Teststatus" subtitle={d.tests?.source ?? 'keine Testergebnisse'} testId="test-status">
            {d.tests ? (
              <div className="flex flex-col gap-2">
                <TestState ok={d.tests.unit ? true : null} label={d.tests.unit ?? 'Unit-Tests: keine Angabe'} />
                <TestState ok={d.tests.liveFixture === 'PASS' ? true : d.tests.liveFixture === 'FAIL' ? false : null} label={`Fixtures Cribl → Splunk: ${d.tests.liveFixture ?? 'nicht getestet'}`} />
                <TestState ok={d.tests.liveRealEvent} label={d.tests.liveRealEvent ? 'Echtes Linux-Event erkannt (lab-linux-01)' : 'Kein Test mit echtem Linux-Event'} />
                <TestState ok={d.tests.alertFired} label={d.tests.alertFired ? 'Als Splunk-Alarm ausgelöst' : 'Alarm-Auslösung nicht getestet'} />
              </div>
            ) : <Empty>{d.origin === 'simulated' ? 'Simulierte Regel – nicht getestet' : 'Lokale Splunk-Suche – keine Sigma-Tests'}</Empty>}
          </Panel>
          <Panel title="Felder">
            {d.fields.length ? <div className="flex flex-wrap gap-1">{d.fields.map((f) => <code key={f} className="rounded bg-panel-3 px-1.5 text-2xs">{f}</code>)}</div> : <Empty>–</Empty>}
          </Panel>
          <Panel title="Mögliche Fehlalarme">
            {d.falsePositives.length ? <ul className="list-disc space-y-1 pl-4 text-xs text-fg-muted">{d.falsePositives.map((f) => <li key={f}>{f}</li>)}</ul> : <Empty>–</Empty>}
          </Panel>
          {d.references.length > 0 && (
            <Panel title="Referenzen">
              <ul className="space-y-1 text-2xs">{d.references.map((r) => <li key={r}><a href={r} target="_blank" rel="noreferrer" className="break-all text-primary hover:underline">{r}</a></li>)}</ul>
              {d.sourceFile && <p className="mt-2 font-mono text-2xs text-fg-subtle">{d.sourceFile}</p>}
            </Panel>
          )}
        </div>
      </div>
    </>
  );
}
