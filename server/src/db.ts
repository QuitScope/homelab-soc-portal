import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS incidents (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  external_id   TEXT NOT NULL UNIQUE,
  source        TEXT NOT NULL CHECK (source IN ('splunk', 'simulated')),
  title         TEXT NOT NULL,
  detection_id  TEXT,
  severity      TEXT NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  status        TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'investigating', 'resolved', 'closed')),
  host          TEXT,
  user          TEXT,
  src           TEXT,
  mitre         TEXT NOT NULL DEFAULT '[]',
  event_count   INTEGER NOT NULL DEFAULT 0,
  details       TEXT NOT NULL DEFAULT '[]',
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS incidents_created ON incidents (created_at);
CREATE TABLE IF NOT EXISTS incident_history (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  incident_id  INTEGER NOT NULL REFERENCES incidents (id) ON DELETE CASCADE,
  from_status  TEXT,
  to_status    TEXT NOT NULL,
  actor        TEXT NOT NULL,
  note         TEXT,
  changed_at   TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS history_incident ON incident_history (incident_id);
`;

export function openDb(path: string) {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
  db.exec(SCHEMA);
  // v1.0 wrote English history notes
  db.exec("UPDATE incident_history SET note = 'erstellt aus ' || substr(note, 14) WHERE note LIKE 'created from %'");
  return db;
}

export type Db = DatabaseSync;
