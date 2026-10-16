import { beforeEach, describe, expect, it } from 'vitest';
import { buildApp, healthScore } from '../src/app.js';
import { hashPassword } from '../src/auth.js';
import { loadConfig } from '../src/config.js';
import { openDb } from '../src/db.js';
import type { NewIncident } from '../src/incidents.js';
import { seedDemo } from '../src/simulated.js';

const PASSWORD = 'correct horse battery staple';
const config = loadConfig({ SESSION_SECRET: 'x'.repeat(40), ADMIN_PASSWORD_HASH: hashPassword(PASSWORD), WEB_DIST: './does-not-exist' });

function setup() {
  const { app, repo } = buildApp({ config, db: openDb(':memory:'), splunk: null, cribl: null });
  return { app, repo };
}

const incident = (n: number, over: Partial<NewIncident> = {}): NewIncident => ({
  externalId: `test:${n}`,
  source: 'simulated',
  title: `Incident ${n}`,
  detectionId: 'ssh_password_guessing',
  severity: 'medium',
  host: 'lab-linux-01',
  user: 'bob',
  src: '203.0.113.10',
  mitre: ['T1110.001'],
  eventCount: 3,
  details: [],
  createdAt: new Date(Date.now() - n * 60_000).toISOString(),
  ...over,
});

async function login(app: ReturnType<typeof setup>['app']) {
  const res = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { username: 'admin', password: PASSWORD } });
  expect(res.statusCode).toBe(200);
  const c = res.cookies.find((x) => x.name === 'soc_session')!;
  expect(c.httpOnly).toBe(true);
  return { [c.name]: c.value };
}

describe('API', () => {
  let ctx: ReturnType<typeof setup>;
  beforeEach(() => {
    ctx = setup();
  });

  it('health endpoint', async () => {
    const res = await ctx.app.inject('/api/health');
    expect(res.json().status).toBe('ok');
  });

  it('lists incidents with filter, search, sort and pagination', async () => {
    for (let n = 1; n <= 25; n++) ctx.repo.insertIfNew(incident(n, n % 5 === 0 ? { severity: 'high', host: 'db-01', mitre: ['T1003.008'] } : {}), 'test');
    const page1 = (await ctx.app.inject('/api/incidents?pageSize=10')).json();
    expect(page1.total).toBe(25);
    expect(page1.items).toHaveLength(10);
    expect(page1.items[0].title).toBe('Incident 1'); // newest first
    const page3 = (await ctx.app.inject('/api/incidents?pageSize=10&page=3')).json();
    expect(page3.items).toHaveLength(5);

    const high = (await ctx.app.inject('/api/incidents?severity=high')).json();
    expect(high.total).toBe(5);
    expect(high.items.every((i: { host: string }) => i.host === 'db-01')).toBe(true);
    expect((await ctx.app.inject('/api/incidents?mitre=T1003')).json().total).toBe(5); // parent technique matches sub-technique
    expect((await ctx.app.inject('/api/incidents?q=Incident%2012')).json().total).toBe(1);
    expect((await ctx.app.inject('/api/incidents?host=lab-linux-01')).json().total).toBe(20);

    const bySeverity = (await ctx.app.inject('/api/incidents?sort=severity&order=desc&pageSize=1')).json();
    expect(bySeverity.items[0].severity).toBe('high');

    // range: 1h only covers the first 59 minutes
    ctx.repo.insertIfNew(incident(200), 'test');
    expect((await ctx.app.inject('/api/incidents?range=1h')).json().total).toBe(25);
  });

  it('rejects invalid query values (validation)', async () => {
    for (const qs of ['range=99d', 'host=a%22%20OR%201%3D1', 'severity=urgent', 'mitre=T11', 'pageSize=1000', 'sort=password']) {
      const res = await ctx.app.inject(`/api/incidents?${qs}`);
      expect(res.statusCode, qs).toBe(400);
      expect(res.json().error).toBe('validation failed');
    }
    expect((await ctx.app.inject('/api/incidents/abc')).statusCode).toBe(400);
    expect((await ctx.app.inject('/api/incidents/999')).statusCode).toBe(404);
  });

  it('requires login for status changes', async () => {
    ctx.repo.insertIfNew(incident(1), 'test');
    const res = await ctx.app.inject({ method: 'PATCH', url: '/api/incidents/1/status', payload: { status: 'investigating' } });
    expect(res.statusCode).toBe(401);
    const forged = await ctx.app.inject({ method: 'PATCH', url: '/api/incidents/1/status', payload: { status: 'investigating' }, cookies: { soc_session: 'admin|9999999999999' } });
    expect(forged.statusCode).toBe(401);
  });

  it('rejects wrong passwords and locks out after 5 failures', async () => {
    for (let n = 0; n < 5; n++) {
      const res = await ctx.app.inject({ method: 'POST', url: '/api/auth/login', payload: { username: 'admin', password: 'wrong' } });
      expect(res.statusCode).toBe(401);
    }
    const locked = await ctx.app.inject({ method: 'POST', url: '/api/auth/login', payload: { username: 'admin', password: PASSWORD } });
    expect(locked.statusCode).toBe(429);
  });

  it('runs the status workflow and records history', async () => {
    ctx.repo.insertIfNew(incident(1), 'test');
    const cookies = await login(ctx.app);
    const patch = (status: string, note?: string) =>
      ctx.app.inject({ method: 'PATCH', url: '/api/incidents/1/status', payload: { status, note }, cookies });

    expect((await patch('resolved')).statusCode).toBe(409); // new → resolved skips investigating
    expect((await patch('investigating', 'looking into it')).statusCode).toBe(200);
    expect((await patch('resolved')).statusCode).toBe(200);
    expect((await patch('closed')).statusCode).toBe(200);
    expect((await patch('new')).statusCode).toBe(409);
    expect((await patch('bogus')).statusCode).toBe(400);

    const detail = (await ctx.app.inject('/api/incidents/1')).json();
    expect(detail.status).toBe('closed');
    expect(detail.history.map((h: { toStatus: string }) => h.toStatus)).toEqual(['new', 'investigating', 'resolved', 'closed']);
    expect(detail.history[1]).toMatchObject({ fromStatus: 'new', actor: 'admin', note: 'looking into it' });
  });

  it('dashboard aggregates only filtered incidents and reports integrations as not configured', async () => {
    seedDemo(ctx.repo);
    const all = (await ctx.app.inject('/api/dashboard?range=24h')).json();
    expect(all.counts.total).toBe(4);
    expect(all.counts.open).toBe(3);
    expect(all.integrations.find((i: { id: string }) => i.id === 'splunk').state).toBe('not_configured');
    expect(all.integrations.find((i: { id: string }) => i.id === 'wazuh').detail).toBe('Nicht konfiguriert');
    const high = (await ctx.app.inject('/api/dashboard?range=24h&severity=high')).json();
    expect(high.counts.total).toBe(1);
    expect(high.activity.reduce((n: number, b: { created: number }) => n + b.created, 0)).toBe(1);
    const events = (await ctx.app.inject('/api/events')).json();
    expect(events).toEqual({ data: null, error: 'Splunk: nicht konfiguriert' });
  });

  it('serves imported Sigma detections with test status and filters them', async () => {
    const list = (await ctx.app.inject('/api/detections')).json();
    const imported = list.items.filter((d: { origin: string }) => d.origin === 'imported');
    expect(imported).toHaveLength(4);
    expect(list.items.some((d: { origin: string }) => d.origin === 'simulated')).toBe(true);
    expect((await ctx.app.inject('/api/detections?mitre=T1110')).json().items).toHaveLength(2);
    const detail = (await ctx.app.inject('/api/detections/privileged_command')).json();
    expect(detail.spl).toContain('event_type="sudo"');
    expect(detail.tests.liveFixture).toBe('PASS');
    expect(detail.falsePositives.length).toBeGreaterThan(0);
  });

  it('health score formula', () => {
    expect(healthScore([], 0)).toBe(100);
    expect(healthScore([{ severity: 'high' }, { severity: 'medium' }] as never, 1)).toBe(100 - 10 - 4 - 15);
    expect(healthScore(Array(10).fill({ severity: 'critical' }) as never, 0)).toBe(0);
  });
});

describe('config', () => {
  it('rejects integration hosts outside the allowlist (SSRF guard)', () => {
    const base = { SESSION_SECRET: 'x'.repeat(40) };
    expect(() => loadConfig({ ...base, SPLUNK_URL: 'https://169.254.169.254:8089' })).toThrow(/not in INTEGRATION_ALLOWLIST/);
    expect(() => loadConfig({ ...base, CRIBL_URL: 'file:///etc/passwd' })).toThrow();
    expect(loadConfig({ ...base, SPLUNK_URL: 'https://splunk:8089/ignored/path' }).splunkUrl).toBe('https://splunk:8089');
    expect(() => loadConfig({ SESSION_SECRET: 'short' })).toThrow();
  });
});
