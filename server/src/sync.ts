import type { Splunk, SplunkRow } from './adapters/splunk.js';
import { detectionForSavedSearch, splunkSeverity } from './detections.js';
import type { IncidentRepo, NewIncident } from './incidents.js';

const first = (rows: SplunkRow[], ...keys: string[]) => {
  for (const r of rows) for (const k of keys) {
    const v = r[k];
    const s = Array.isArray(v) ? v[0] : v;
    if (s && s !== '-') return s;
  }
  return null;
};

/**
 * Turns Splunk fired alerts into incidents. Fired alerts expire in Splunk (default 24 h),
 * so the job results are copied into the incident when it is first seen.
 */
export async function syncFiredAlerts(splunk: Splunk, repo: IncidentRepo) {
  const alerts = await splunk.firedAlerts();
  let created = 0;
  for (const a of alerts) {
    let rows: SplunkRow[] = [];
    try {
      rows = await splunk.jobResults(a.sid);
    } catch {
      // job artifacts can already be gone; the incident is still created without details
    }
    const det = detectionForSavedSearch(a.savedSearch);
    const incident: NewIncident = {
      externalId: `splunk:${a.sid}`,
      source: 'splunk',
      title: det?.title ?? a.savedSearch,
      detectionId: det?.id ?? null,
      severity: det && det.level !== 'informational' ? det.level : splunkSeverity(a.severity),
      host: first(rows, 'dest', 'host'),
      user: first(rows, 'user', 'target_user'),
      src: first(rows, 'src'),
      mitre: det?.mitre ?? [],
      eventCount: rows.reduce((n, r) => n + (Number(r.event_count) || 1), 0),
      details: rows.slice(0, 20),
      createdAt: new Date(a.triggerTime * 1000).toISOString(),
    };
    if (repo.insertIfNew(incident, 'splunk-sync')) created++;
  }
  return { alerts: alerts.length, created };
}
