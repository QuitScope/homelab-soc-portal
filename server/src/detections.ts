import { readFileSync } from 'node:fs';
import type { SavedSearch } from './adapters/splunk.js';
import type { Filters, Severity } from './filters.js';

export interface Detection {
  id: string;
  sigmaId: string | null;
  title: string;
  /** imported = Sigma Detection Lab, local = Splunk saved search outside Sigma, simulated = demo entry */
  origin: 'imported' | 'local' | 'simulated';
  level: Severity | 'informational';
  ruleStatus: string | null;
  description: string;
  mitre: string[];
  tactics: string[];
  logsource: Record<string, string> | null;
  logic: string;
  fields: string[];
  falsePositives: string[];
  references: string[];
  eventTypes: string[];
  spl: string;
  savedSearch: string | null;
  scheduled: boolean;
  tests: {
    unit: string | null;
    liveFixture: 'PASS' | 'FAIL' | null;
    liveRealEvent: boolean | null;
    alertFired: boolean | null;
    source: string;
  } | null;
  sourceFile: string | null;
}

const imported = JSON.parse(readFileSync(new URL('../data/sigma-import.json', import.meta.url), 'utf8')) as {
  importedAt: string;
  source: string;
  detections: Detection[];
};

export const sigmaImport = { importedAt: imported.importedAt, source: imported.source };

// Clearly marked demo entries so the coverage view shows how not-yet-deployed sources would appear.
const SIMULATED: Detection[] = [
  {
    id: 'sim_wazuh_rootcheck',
    sigmaId: null,
    title: 'Wazuh Rootcheck: Hidden Process Detected',
    origin: 'simulated',
    level: 'high',
    ruleStatus: 'demo',
    description: 'Demo entry. Would come from Wazuh rootcheck once a Wazuh manager is deployed (not configured).',
    mitre: ['T1014'],
    tactics: ['defense-evasion'],
    logsource: { product: 'wazuh' },
    logic: 'not available – simulated',
    fields: [],
    falsePositives: [],
    references: ['https://attack.mitre.org/techniques/T1014/'],
    eventTypes: [],
    spl: '',
    savedSearch: null,
    scheduled: false,
    tests: null,
    sourceFile: null,
  },
  {
    id: 'sim_network_scan',
    sigmaId: null,
    title: 'Network Service Discovery From Lab Subnet',
    origin: 'simulated',
    level: 'medium',
    ruleStatus: 'demo',
    description: 'Demo entry. Needs firewall/IDS flow logs, which are not collected in the homelab yet.',
    mitre: ['T1046'],
    tactics: ['discovery'],
    logsource: { category: 'firewall' },
    logic: 'not available – simulated',
    fields: [],
    falsePositives: [],
    references: ['https://attack.mitre.org/techniques/T1046/'],
    eventTypes: [],
    spl: '',
    savedSearch: null,
    scheduled: false,
    tests: null,
    sourceFile: null,
  },
];

const SPLUNK_SEVERITY: Record<number, Detection['level']> = { 1: 'informational', 2: 'low', 3: 'medium', 4: 'high', 5: 'critical' };
export const splunkSeverity = (n: number): Severity => {
  const l = SPLUNK_SEVERITY[n] ?? 'medium';
  return l === 'informational' ? 'low' : l;
};

/** Splunk saved searches of the app that are not generated from Sigma → origin "local" */
export function localFromSplunk(saved: SavedSearch[]): Detection[] {
  return saved
    .filter((s) => !s.name.startsWith('Sigma - '))
    .map((s) => ({
      id: `splunk_${s.name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')}`,
      sigmaId: null,
      title: s.name,
      origin: 'local' as const,
      level: s.severity != null ? (SPLUNK_SEVERITY[s.severity] ?? 'medium') : 'informational',
      ruleStatus: s.disabled ? 'disabled' : s.scheduled ? 'scheduled' : 'not scheduled',
      description: s.description || 'Splunk saved search (app homelab_siem), not managed by the Sigma lab.',
      mitre: [],
      tactics: [],
      logsource: null,
      logic: s.search,
      fields: [],
      falsePositives: [],
      references: [],
      eventTypes: [],
      spl: s.search,
      savedSearch: s.name,
      scheduled: s.scheduled,
      tests: null,
      sourceFile: null,
    }));
}

export const importedDetections = () => imported.detections;
export const simulatedDetections = () => SIMULATED;

export const matchesMitre = (d: Detection, mitre?: string) => !mitre || d.mitre.some((t) => t === mitre || t.startsWith(`${mitre}.`));

export function filterDetections(list: Detection[], f: Partial<Filters>) {
  const q = f.q?.toLowerCase();
  return list.filter(
    (d) =>
      matchesMitre(d, f.mitre) &&
      (!f.severity || d.level === f.severity) &&
      (!q || [d.id, d.title, d.description, ...d.mitre].some((v) => v.toLowerCase().includes(q))),
  );
}

/**
 * Severity/MITRE filters narrowed to raw events: the event_types the matching imported rules look at.
 * null = no restriction.
 */
export function eventTypesFor(f: Partial<Filters>): string[] | null {
  if (!f.mitre && !f.severity) return null;
  return [...new Set(filterDetections(imported.detections, { mitre: f.mitre, severity: f.severity }).flatMap((d) => d.eventTypes))];
}

export const detectionForSavedSearch = (name: string) => imported.detections.find((d) => d.savedSearch === name) ?? null;
