import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { createCribl } from '../src/adapters/cribl.js';
import { AdapterError } from '../src/adapters/http.js';
import { createSplunk } from '../src/adapters/splunk.js';
import { STUBS, stubHealth } from '../src/adapters/stubs.js';

type Handler = (req: IncomingMessage, res: ServerResponse, body: string) => void;
let server: Server | null = null;

async function mock(handler: Handler) {
  server = createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => handler(req, res, body));
  });
  await new Promise<void>((r) => server!.listen(0, '127.0.0.1', r));
  return `http://127.0.0.1:${(server!.address() as AddressInfo).port}`;
}
afterEach(() => new Promise<void>((r) => (server ? server.close(() => r()) : r())));

const send = (res: ServerResponse, status: number, body: unknown) => {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(typeof body === 'string' ? body : JSON.stringify(body));
};

const splunk = (url: string, timeoutMs = 500) => createSplunk({ url, user: 'admin', password: 'pw', verifyTls: true, timeoutMs });
const cribl = (url: string, timeoutMs = 500) => createCribl({ url, user: 'admin', password: 'pw', timeoutMs });

describe('Splunk adapter', () => {
  it('reports health from server/info with basic auth', async () => {
    const url = await mock((req, res) => {
      expect(req.headers.authorization).toBe(`Basic ${Buffer.from('admin:pw').toString('base64')}`);
      expect(req.url).toBe('/services/server/info?output_mode=json');
      send(res, 200, { entry: [{ content: { version: '10.6.0.5', health_info: 'green' } }] });
    });
    const h = await splunk(url).health();
    expect(h).toMatchObject({ id: 'splunk', state: 'up', version: '10.6.0.5' });
  });

  it('maps yellow and red health of a reachable splunkd to degraded', async () => {
    let health = 'yellow';
    const url = await mock((_q, res) => send(res, 200, { entry: [{ content: { version: '1', health_info: health } }] }));
    expect((await splunk(url).health()).state).toBe('degraded');
    health = 'red';
    expect(await splunk(url).health()).toMatchObject({ state: 'degraded', detail: 'splunkd-Status: red' });
  });

  it('turns timeouts, auth errors, 5xx and broken JSON into a down status', async () => {
    const hang = await mock(() => {});
    expect((await splunk(hang, 100).health()).detail).toBe('timeout: timeout after 100 ms');
    await new Promise<void>((r) => server!.close(() => r()));
    server = null;

    for (const [status, body, detail] of [
      [401, {}, 'auth: HTTP 401'],
      [500, {}, 'http: HTTP 500'],
      [200, 'not json', 'parse: invalid JSON response'],
      [200, { entry: [] }, 'parse: unexpected server/info response'],
    ] as const) {
      const url = await mock((_q, res) => send(res, status, body));
      const h = await splunk(url).health();
      expect(h.state).toBe('down');
      expect(h.detail).toBe(detail);
      await new Promise<void>((r) => server!.close(() => r()));
      server = null;
    }
  });

  it('reports network errors when nothing listens', async () => {
    const h = await splunk('http://127.0.0.1:1').health();
    expect(h.state).toBe('down');
    expect(h.detail).toMatch(/^network: network error/);
  });

  it('parses export results, skips previews and raises search errors', async () => {
    let posted = '';
    const url = await mock((_q, res, body) => {
      posted = body;
      res.writeHead(200);
      res.end(
        [
          JSON.stringify({ preview: true, result: { count: '1' } }),
          JSON.stringify({ preview: false, result: { host: 'lab-linux-01', count: '4' } }),
          JSON.stringify({ preview: false, lastrow: true, result: { host: 'b', count: '2' } }),
          '',
        ].join('\n'),
      );
    });
    const rows = await splunk(url).search('search index=x', '-24h');
    expect(rows).toEqual([{ host: 'lab-linux-01', count: '4' }, { host: 'b', count: '2' }]);
    const params = new URLSearchParams(posted);
    expect(params.get('search')).toBe('search index=x');
    expect(params.get('earliest_time')).toBe('-24h');
    expect(params.get('output_mode')).toBe('json');
  });

  it('raises FATAL search messages', async () => {
    const url = await mock((_q, res) => send(res, 200, { preview: false, messages: [{ type: 'FATAL', text: 'Unknown search command' }] }));
    await expect(splunk(url).search('search |bad', '-1h')).rejects.toThrow('search error: Unknown search command');
  });

  it('reads fired alerts and filters saved searches by app', async () => {
    const url = await mock((req, res) => {
      if (req.url!.startsWith('/servicesNS/-/-/alerts/fired_alerts/-')) {
        return send(res, 200, { entry: [{ name: 'x', content: { sid: 'scheduler__a_1', savedsearch_name: 'Sigma - Local User Account Created', severity: 3, trigger_time: 1792089900 } }, { name: 'y', content: {} }] });
      }
      send(res, 200, {
        entry: [
          { name: 'HomeLab - Data Quality', acl: { app: 'homelab_siem' }, content: { search: 'index=x', is_scheduled: true, 'alert.severity': 2 } },
          { name: 'Errors in the last hour', acl: { app: 'search' }, content: { search: 'index=_internal' } },
        ],
      });
    });
    const a = splunk(url);
    expect(await a.firedAlerts()).toEqual([{ sid: 'scheduler__a_1', savedSearch: 'Sigma - Local User Account Created', severity: 3, triggerTime: 1792089900 }]);
    const saved = await a.savedSearches('homelab_siem');
    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatchObject({ name: 'HomeLab - Data Quality', scheduled: true, severity: 2 });
  });

  it('rejects malformed sids before calling Splunk', async () => {
    await expect(splunk('http://127.0.0.1:1').jobResults('../../etc')).rejects.toBeInstanceOf(AdapterError);
  });
});

describe('Cribl adapter', () => {
  it('logs in, reads health/version and never passes on output secrets', async () => {
    let logins = 0;
    const url = await mock((req, res, body) => {
      if (req.url === '/api/v1/auth/login') {
        logins++;
        expect(JSON.parse(body)).toEqual({ username: 'admin', password: 'pw' });
        return send(res, 200, { token: 'tok' });
      }
      if (req.url === '/api/v1/health') return send(res, 200, { status: 'healthy' });
      expect(req.headers.authorization).toBe('Bearer tok');
      switch (req.url) {
        case '/api/v1/system/info':
          return send(res, 200, { items: [{ BUILD: { VERSION: '4.20.2-7199aa90' } }] });
        case '/api/v1/system/inputs':
          return send(res, 200, { items: [{ id: 'in_syslog', type: 'syslog', disabled: false, status: { health: 'Green', metrics: { numPushed: 5 } } }] });
        case '/api/v1/system/outputs':
          return send(res, 200, {
            items: [
              { id: 'default', type: 'default', defaultId: 'devnull' },
              { id: 'splunk_homelab', type: 'splunk_hec', url: 'http://splunk:8088', token: 'SECRET-HEC-TOKEN', status: { health: 'Green', metrics: { sentCount: 12, lastFlushTime: 1, label: 'x' } } },
            ],
          });
        case '/api/v1/routes':
          return send(res, 200, { items: [{ id: 'default', routes: [{ id: 'r1', name: 'homelab_auth', filter: "appname=='sshd'", pipeline: 'homelab_auth_normalize', output: 'splunk_homelab', final: true }] }] });
        case '/api/v1/pipelines':
          return send(res, 200, { items: [{ id: 'homelab_auth_normalize', conf: { description: 'normalize', functions: [{}, {}, {}] } }] });
      }
      send(res, 404, {});
    });
    const c = cribl(url);
    expect(await c.health()).toMatchObject({ state: 'up', version: '4.20.2-7199aa90' });
    const o = await c.overview();
    expect(logins).toBe(1);
    expect(JSON.stringify(o)).not.toContain('SECRET-HEC-TOKEN');
    expect(JSON.stringify(o)).not.toContain('http://splunk:8088');
    expect(o.outputs).toEqual([{ id: 'splunk_homelab', type: 'splunk_hec', disabled: false, health: 'Green', metrics: { sentCount: 12, lastFlushTime: 1 } }]);
    expect(o.routes[0]).toMatchObject({ name: 'homelab_auth', pipeline: 'homelab_auth_normalize' });
    expect(o.pipelines[0].functions).toBe(3);
  });

  it('re-logs in once when the token expired', async () => {
    let logins = 0;
    let calls = 0;
    const url = await mock((req, res) => {
      if (req.url === '/api/v1/auth/login') return send(res, 200, { token: `t${++logins}` });
      calls++;
      if (req.headers.authorization === 'Bearer t1') return send(res, 401, {});
      send(res, 200, { items: [] });
    });
    const o = await cribl(url).overview();
    expect(logins).toBe(2);
    expect(o.inputs).toEqual([]);
    expect(calls).toBeGreaterThan(4);
  });

  it('reports wrong credentials as down', async () => {
    const url = await mock((req, res) => (req.url === '/api/v1/health' ? send(res, 200, { status: 'healthy' }) : send(res, 401, { message: 'bad' })));
    expect(await cribl(url).health()).toMatchObject({ state: 'down', detail: 'auth: HTTP 401' });
  });
});

describe('stub adapters', () => {
  it('are "Not configured" without URL and do not guess undocumented APIs', async () => {
    const wazuh = STUBS.find((s) => s.id === 'wazuh')!;
    expect((await stubHealth(wazuh, undefined, 100)).detail).toBe('Nicht konfiguriert');
    expect((await stubHealth(wazuh, 'http://wazuh:55000', 100)).detail).toBe('URL gesetzt, Adapter in v1 nicht implementiert');
  });

  it('probe documented health endpoints (Grafana /api/health)', async () => {
    const url = await mock((req, res) => send(res, req.url === '/api/health' ? 200 : 404, { database: 'ok' }));
    const grafana = STUBS.find((s) => s.id === 'grafana')!;
    expect((await stubHealth(grafana, url, 500)).state).toBe('up');
  });
});
