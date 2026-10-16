// Mirrors the API responses of server/src (kept small on purpose).
export type Severity = 'low' | 'medium' | 'high' | 'critical';
export type Status = 'new' | 'investigating' | 'resolved' | 'closed';
export type IntegrationState = 'up' | 'degraded' | 'down' | 'not_configured';

export interface Incident {
  id: number;
  externalId: string;
  source: 'splunk' | 'simulated';
  title: string;
  detectionId: string | null;
  severity: Severity;
  status: Status;
  host: string | null;
  user: string | null;
  src: string | null;
  mitre: string[];
  eventCount: number;
  details: Record<string, unknown>[];
  createdAt: string;
  updatedAt: string;
}

export interface HistoryEntry {
  id: number;
  fromStatus: Status | null;
  toStatus: Status;
  actor: string;
  note: string | null;
  changedAt: string;
}

export type IncidentDetail = Incident & { history: HistoryEntry[] };

export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface IntegrationStatus {
  id: string;
  name: string;
  category: string;
  state: IntegrationState;
  detail: string;
  version?: string;
  latencyMs?: number;
  checkedAt: string;
  docsUrl?: string;
}

export interface Dashboard {
  health: { score: number; label: string; formula: string };
  counts: { total: number; open: number; criticalOpen: number; resolved: number; byStatus: Record<Status, number>; bySeverity: Record<Severity, number> };
  mttrMinutes: number | null;
  activity: { time: string; created: number; resolved: number }[];
  latest: Incident[];
  focus: { incident: Incident; history: HistoryEntry[] } | null;
  integrations: IntegrationStatus[];
}

export interface HostStat {
  host: string;
  events: number;
  failures: number;
  sources: number;
  lastSeen: string;
  eventTypes: Record<string, number>;
  openIncidents?: number;
}

export interface EventAnalytics {
  total: number;
  timeline: { time: string; success: number; failure: number; other: number }[];
  byType: { name: string; count: number }[];
  byAction: { name: string; count: number }[];
  topSources: { src: string; count: number; failures: number; hosts: { host: string; count: number; failures: number }[] }[];
  hosts: HostStat[];
  spl: string;
}

export interface Guarded<T> {
  data: T | null;
  error: string | null;
}

export interface TopoNode {
  id: string;
  type: 'source' | 'host' | 'pipeline' | 'siem' | 'portal' | 'integration';
  label: string;
  status: string;
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

export interface Topology {
  nodes: TopoNode[];
  edges: TopoEdge[];
  eventsError: string | null;
}

export interface DetectionTests {
  unit: string | null;
  liveFixture: 'PASS' | 'FAIL' | null;
  liveRealEvent: boolean | null;
  alertFired: boolean | null;
  source: string;
}

export interface Detection {
  id: string;
  sigmaId: string | null;
  title: string;
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
  tests: DetectionTests | null;
  sourceFile: string | null;
}

export type DetectionListItem = Omit<Detection, 'logic' | 'spl'> & { incidents: number };
export type DetectionDetail = Detection & { incidents: Incident[] };

export interface CoverageItem {
  technique: string;
  tactics: string[];
  detections: { id: string; title: string; origin: Detection['origin']; level: string }[];
  incidents: number;
}

export interface CriblComponent {
  id: string;
  type: string;
  disabled: boolean;
  health: string | null;
  metrics: Record<string, number>;
}

export interface CriblOverview {
  inputs: CriblComponent[];
  outputs: CriblComponent[];
  routes: { id: string; name: string; filter: string; pipeline: string; output: string | null; final: boolean; disabled: boolean }[];
  pipelines: { id: string; description: string; functions: number }[];
}
