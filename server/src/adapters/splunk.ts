import { AdapterError, errorStatus, insecureAgent, json, request, type IntegrationStatus } from './http.js';

// REST endpoints (Splunk Enterprise REST API reference, verified against Splunk 10.6 in the homelab):
//   GET  /services/server/info                       https://docs.splunk.com/Documentation/Splunk/latest/RESTREF/RESTsystem#server.2Finfo
//   POST /services/search/jobs/export                https://docs.splunk.com/Documentation/Splunk/latest/RESTREF/RESTsearch#search.2Fjobs.2Fexport
//   GET  /servicesNS/-/-/alerts/fired_alerts/-       https://docs.splunk.com/Documentation/Splunk/latest/RESTREF/RESTsearch#alerts.2Ffired_alerts.2F.7Bname.7D
//   GET  /services/search/jobs/{sid}/results         https://docs.splunk.com/Documentation/Splunk/latest/RESTREF/RESTsearch#search.2Fjobs.2F.7Bsearch_id.7D.2Fresults
//   GET  /servicesNS/-/{app}/saved/searches          https://docs.splunk.com/Documentation/Splunk/latest/RESTREF/RESTsearch#saved.2Fsearches

export interface SplunkConfig {
  url: string;
  user: string;
  password: string;
  verifyTls: boolean;
  timeoutMs: number;
}

export interface FiredAlert {
  sid: string;
  savedSearch: string;
  severity: number;
  triggerTime: number;
}

export interface SavedSearch {
  name: string;
  app: string;
  search: string;
  description: string;
  scheduled: boolean;
  disabled: boolean;
  cron: string | null;
  severity: number | null;
}

export type SplunkRow = Record<string, string | string[] | undefined>;

const BASE = { id: 'splunk', name: 'Splunk Enterprise', category: 'SIEM', docsUrl: 'https://docs.splunk.com/Documentation/Splunk/latest/RESTREF' };

export function createSplunk(cfg: SplunkConfig) {
  const headers = { Authorization: `Basic ${Buffer.from(`${cfg.user}:${cfg.password}`).toString('base64')}` };
  const dispatcher = cfg.verifyTls ? undefined : insecureAgent;

  const get = async <T>(path: string, timeoutMs = cfg.timeoutMs) =>
    json<T>(await request(`${cfg.url}${path}`, { headers, dispatcher, timeoutMs }));

  return {
    async health(): Promise<IntegrationStatus> {
      const started = Date.now();
      try {
        const body = await get<{ entry: { content: { version: string; health_info?: string; serverName?: string } }[] }>(
          '/services/server/info?output_mode=json',
        );
        const c = body.entry?.[0]?.content;
        if (!c) throw new AdapterError('unexpected server/info response', 'parse');
        const health = c.health_info ?? 'unknown';
        return {
          ...BASE,
          // reachable but unhealthy (e.g. IOWait red) is degraded; down means unreachable
          state: health === 'green' ? 'up' : 'degraded',
          detail: `splunkd-Status: ${health}`,
          version: c.version,
          latencyMs: Date.now() - started,
          checkedAt: new Date().toISOString(),
        };
      } catch (err) {
        return errorStatus(BASE, err);
      }
    },

    /** runs a blocking export search and returns the final result rows */
    async search(spl: string, earliest: string, latest = 'now'): Promise<SplunkRow[]> {
      const body = new URLSearchParams({ search: spl, earliest_time: earliest, latest_time: latest, output_mode: 'json' });
      const res = await request(`${cfg.url}/services/search/jobs/export`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
        dispatcher,
        timeoutMs: cfg.timeoutMs * 3,
      });
      const text = await res.text();
      const rows: SplunkRow[] = [];
      for (const line of text.split('\n')) {
        if (!line.trim()) continue;
        let obj: { preview?: boolean; result?: SplunkRow; messages?: { type: string; text: string }[] };
        try {
          obj = JSON.parse(line);
        } catch {
          throw new AdapterError('invalid export response', 'parse');
        }
        const fatal = obj.messages?.find((m) => m.type === 'FATAL' || m.type === 'ERROR');
        if (fatal) throw new AdapterError(`search error: ${fatal.text}`, 'http');
        if (obj.result && obj.preview === false) rows.push(obj.result);
      }
      return rows;
    },

    async firedAlerts(): Promise<FiredAlert[]> {
      const body = await get<{ entry: { name: string; content: Record<string, unknown> }[] }>(
        '/servicesNS/-/-/alerts/fired_alerts/-?output_mode=json&count=0',
      );
      return (body.entry ?? [])
        .map((e) => ({
          sid: String(e.content.sid ?? ''),
          savedSearch: String(e.content.savedsearch_name ?? ''),
          severity: Number(e.content.severity ?? 3),
          triggerTime: Number(e.content.trigger_time ?? 0),
        }))
        .filter((a) => a.sid && a.savedSearch);
    },

    async jobResults(sid: string, count = 20): Promise<SplunkRow[]> {
      if (!/^[\w.:-]+$/.test(sid)) throw new AdapterError('invalid sid', 'parse');
      const body = await get<{ results?: SplunkRow[] }>(
        `/services/search/jobs/${encodeURIComponent(sid)}/results?output_mode=json&count=${count}`,
      );
      return body.results ?? [];
    },

    async savedSearches(app: string): Promise<SavedSearch[]> {
      const body = await get<{ entry: { name: string; acl: { app: string }; content: Record<string, unknown> }[] }>(
        `/servicesNS/-/${encodeURIComponent(app)}/saved/searches?output_mode=json&count=0`,
      );
      return (body.entry ?? [])
        .filter((e) => e.acl?.app === app)
        .map((e) => ({
          name: e.name,
          app: e.acl.app,
          search: String(e.content.search ?? ''),
          description: String(e.content.description ?? ''),
          scheduled: Boolean(e.content.is_scheduled),
          disabled: Boolean(e.content.disabled),
          cron: (e.content.cron_schedule as string) || null,
          severity: e.content['alert.severity'] != null ? Number(e.content['alert.severity']) : null,
        }));
    },
  };
}

export type Splunk = ReturnType<typeof createSplunk>;

/** quote a value for SPL: "..." with backslash and quote escaped */
export const splQuote = (v: string) => `"${v.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
