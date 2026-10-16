import { z } from 'zod';
import type { Db } from './db.js';
import { FilterSchema, rangeStart, SEVERITIES, type Severity } from './filters.js';

export const STATUSES = ['new', 'investigating', 'resolved', 'closed'] as const;
export type Status = (typeof STATUSES)[number];

/** New → Investigating → Resolved → Closed; a resolved incident may be reopened. */
export const TRANSITIONS: Record<Status, Status[]> = {
  new: ['investigating'],
  investigating: ['resolved'],
  resolved: ['closed', 'investigating'],
  closed: [],
};

export const ListQuerySchema = FilterSchema.extend({
  status: z.enum(STATUSES).optional(),
  sort: z.enum(['created_at', 'severity', 'status', 'title', 'host']).default('created_at'),
  order: z.enum(['asc', 'desc']).default('desc'),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
export type ListQuery = z.infer<typeof ListQuerySchema>;

export const StatusChangeSchema = z.object({
  status: z.enum(STATUSES),
  note: z.string().trim().max(500).optional(),
});

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

export type NewIncident = Omit<Incident, 'id' | 'status' | 'updatedAt'>;

export class TransitionError extends Error {}
export class NotFoundError extends Error {}

type Row = Record<string, unknown>;

const toIncident = (r: Row): Incident => ({
  id: Number(r.id),
  externalId: String(r.external_id),
  source: r.source as Incident['source'],
  title: String(r.title),
  detectionId: (r.detection_id as string) ?? null,
  severity: r.severity as Severity,
  status: r.status as Status,
  host: (r.host as string) ?? null,
  user: (r.user as string) ?? null,
  src: (r.src as string) ?? null,
  mitre: JSON.parse(String(r.mitre)),
  eventCount: Number(r.event_count),
  details: JSON.parse(String(r.details)),
  createdAt: String(r.created_at),
  updatedAt: String(r.updated_at),
});

const SEVERITY_RANK = `CASE severity ${SEVERITIES.map((s, i) => `WHEN '${s}' THEN ${i}`).join(' ')} END`;
const STATUS_RANK = `CASE status ${STATUSES.map((s, i) => `WHEN '${s}' THEN ${i}`).join(' ')} END`;
const SORT_SQL: Record<ListQuery['sort'], string> = {
  created_at: 'created_at',
  severity: SEVERITY_RANK,
  status: STATUS_RANK,
  title: 'title COLLATE NOCASE',
  host: 'host COLLATE NOCASE',
};

/** WHERE clause for the global filter bar (+ optional status), shared by list and stats */
function where(f: Omit<Partial<ListQuery>, 'range'> & { range: ListQuery['range'] }) {
  const clauses = ['created_at >= ?'];
  const params: (string | number)[] = [rangeStart(f.range)];
  if (f.host) (clauses.push('host = ?'), params.push(f.host));
  if (f.severity) (clauses.push('severity = ?'), params.push(f.severity));
  if (f.status) (clauses.push('status = ?'), params.push(f.status));
  if (f.mitre) {
    clauses.push(`EXISTS (SELECT 1 FROM json_each(mitre) WHERE value = ? OR value LIKE ?)`);
    params.push(f.mitre, `${f.mitre}.%`);
  }
  if (f.q) {
    clauses.push(`(title LIKE ? OR host LIKE ? OR user LIKE ? OR src LIKE ? OR detection_id LIKE ? OR external_id LIKE ? OR 'INC-' || id = ?)`);
    const like = `%${f.q.replace(/[%_]/g, '')}%`;
    params.push(like, like, like, like, like, like, f.q.toUpperCase());
  }
  return { sql: clauses.join(' AND '), params };
}

export function createIncidentRepo(db: Db) {
  return {
    list(q: ListQuery) {
      const w = where(q);
      const total = Number((db.prepare(`SELECT count(*) AS n FROM incidents WHERE ${w.sql}`).get(...w.params) as Row).n);
      const rows = db
        .prepare(`SELECT * FROM incidents WHERE ${w.sql} ORDER BY ${SORT_SQL[q.sort]} ${q.order}, id ${q.order} LIMIT ? OFFSET ?`)
        .all(...w.params, q.pageSize, (q.page - 1) * q.pageSize) as Row[];
      return { items: rows.map(toIncident), total, page: q.page, pageSize: q.pageSize };
    },

    /** all incidents matching the filter bar (dashboard aggregations; homelab volumes are small) */
    all(f: Parameters<typeof where>[0]) {
      const w = where(f);
      return (db.prepare(`SELECT * FROM incidents WHERE ${w.sql} ORDER BY created_at DESC`).all(...w.params) as Row[]).map(toIncident);
    },

    get(id: number) {
      const r = db.prepare('SELECT * FROM incidents WHERE id = ?').get(id) as Row | undefined;
      return r ? toIncident(r) : null;
    },

    history(id: number): HistoryEntry[] {
      return (db.prepare('SELECT * FROM incident_history WHERE incident_id = ? ORDER BY id').all(id) as Row[]).map((r) => ({
        id: Number(r.id),
        fromStatus: (r.from_status as Status) ?? null,
        toStatus: r.to_status as Status,
        actor: String(r.actor),
        note: (r.note as string) ?? null,
        changedAt: String(r.changed_at),
      }));
    },

    /** inserts unless external_id exists; returns true when created */
    insertIfNew(i: NewIncident, actor: string): boolean {
      const res = db
        .prepare(
          `INSERT OR IGNORE INTO incidents (external_id, source, title, detection_id, severity, host, user, src, mitre, event_count, details, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(i.externalId, i.source, i.title, i.detectionId, i.severity, i.host, i.user, i.src, JSON.stringify(i.mitre), i.eventCount, JSON.stringify(i.details), i.createdAt, i.createdAt);
      if (res.changes === 0) return false;
      db.prepare('INSERT INTO incident_history (incident_id, from_status, to_status, actor, note, changed_at) VALUES (?, NULL, ?, ?, ?, ?)')
        .run(Number(res.lastInsertRowid), 'new', actor, `erstellt aus ${i.source}`, i.createdAt);
      return true;
    },

    changeStatus(id: number, to: Status, actor: string, note?: string) {
      db.exec('BEGIN IMMEDIATE');
      try {
        const current = this.get(id);
        if (!current) throw new NotFoundError(`incident ${id} not found`);
        if (!TRANSITIONS[current.status].includes(to)) {
          throw new TransitionError(`transition ${current.status} → ${to} not allowed`);
        }
        const now = new Date().toISOString();
        db.prepare('UPDATE incidents SET status = ?, updated_at = ? WHERE id = ?').run(to, now, id);
        db.prepare('INSERT INTO incident_history (incident_id, from_status, to_status, actor, note, changed_at) VALUES (?, ?, ?, ?, ?, ?)')
          .run(id, current.status, to, actor, note ?? null, now);
        db.exec('COMMIT');
        return this.get(id)!;
      } catch (err) {
        db.exec('ROLLBACK');
        throw err;
      }
    },

    /** mean minutes from creation to first "resolved" for incidents in the filter */
    resolutionMinutes(f: Parameters<typeof where>[0]): number | null {
      const w = where(f);
      const r = db
        .prepare(
          `SELECT avg((julianday(h.changed_at) - julianday(i.created_at)) * 1440) AS m
           FROM (SELECT id, created_at FROM incidents WHERE ${w.sql}) i
           JOIN (SELECT incident_id, min(changed_at) AS changed_at FROM incident_history WHERE to_status = 'resolved' GROUP BY incident_id) h
           ON h.incident_id = i.id`,
        )
        .get(...w.params) as Row;
      return r.m == null ? null : Math.round(Number(r.m));
    },
  };
}

export type IncidentRepo = ReturnType<typeof createIncidentRepo>;
