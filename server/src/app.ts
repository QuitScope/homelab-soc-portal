import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import cookie from '@fastify/cookie';
import fastifyStatic from '@fastify/static';
import Fastify, { LogController, type FastifyReply } from 'fastify';
import { z, ZodError } from 'zod';
import type { Cribl, CriblOverview } from './adapters/cribl.js';
import type { IntegrationStatus } from './adapters/http.js';
import type { Splunk } from './adapters/splunk.js';
import { STUBS, stubHealth } from './adapters/stubs.js';
import { COOKIE, cookieOptions, createLoginLimiter, LoginSchema, requireAuth, sessionUser, sessionValue, verifyPassword } from './auth.js';
import type { Config } from './config.js';
import type { Db } from './db.js';
import { filterDetections, importedDetections, localFromSplunk, sigmaImport, simulatedDetections, type Detection } from './detections.js';
import { createEventService, type EventAnalytics } from './events.js';
import { FilterSchema, globMatcher, RANGES, rangeStart, type Filters } from './filters.js';
import { createIncidentRepo, ListQuerySchema, NotFoundError, StatusChangeSchema, TransitionError, type Incident } from './incidents.js';
import { SOAR_PLAYBOOKS, THREAT_INTEL } from './simulated.js';
import { syncFiredAlerts } from './sync.js';
import { buildTopology } from './topology.js';

export interface Deps {
  config: Config;
  db: Db;
  splunk: Splunk | null;
  cribl: Cribl | null;
}

const IdParam = z.object({ id: z.coerce.number().int().positive() });

export function healthScore(open: Incident[], downIntegrations: number) {
  const weights = { critical: 25, high: 10, medium: 4, low: 1 } as const;
  const penalty = open.reduce((n, i) => n + weights[i.severity], 0) + downIntegrations * 15;
  return Math.max(0, 100 - penalty);
}

export function buildApp({ config, db, splunk, cribl }: Deps) {
  const app = Fastify({
    logger: { level: process.env.NODE_ENV === 'test' ? 'silent' : 'info' },
    // the Docker health check would log two lines every 30 s
    logController: new LogController({ disableRequestLogging: (req) => req.url === '/api/health' }),
    trustProxy: false,
  });
  const repo = createIncidentRepo(db);
  const events = createEventService(splunk, { index: config.SPLUNK_INDEX, sourcetype: config.SPLUNK_SOURCETYPE, excludeHosts: config.excludeHosts, excludeSources: config.excludeSources });
  const isExcluded = globMatcher(config.excludeHosts);
  const limiter = createLoginLimiter();
  const auth = { preHandler: requireAuth };

  app.register(cookie, { secret: config.SESSION_SECRET });

  app.setErrorHandler((err, _req, reply) => {
    if (err instanceof ZodError) return reply.code(400).send({ error: 'validation failed', issues: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })) });
    if (err instanceof NotFoundError) return reply.code(404).send({ error: err.message });
    if (err instanceof TransitionError) return reply.code(409).send({ error: err.message });
    const status = (err as { statusCode?: number }).statusCode;
    if (status && status < 500) return reply.code(status).send({ error: (err as Error).message });
    app.log.error(err);
    return reply.code(500).send({ error: 'internal error' });
  });

  async function integrations(): Promise<IntegrationStatus[]> {
    const now = new Date().toISOString();
    const notConfigured = (id: string, name: string, category: string): IntegrationStatus => ({ id, name, category, state: 'not_configured', detail: 'Nicht konfiguriert', checkedAt: now });
    return Promise.all([
      splunk ? splunk.health() : notConfigured('splunk', 'Splunk Enterprise', 'SIEM'),
      cribl ? cribl.health() : notConfigured('cribl', 'Cribl Stream', 'Datenpipeline'),
      ...STUBS.map((s) => stubHealth(s, config.stubUrls[s.id], config.HTTP_TIMEOUT_MS)),
    ]);
  }

  /** wraps an integration call: {data} on success, {data:null,error} when the source is down or not configured */
  async function guarded<T>(fn: () => Promise<T | null>, what: string) {
    try {
      const data = await fn();
      return data == null ? { data: null, error: `${what}: nicht konfiguriert` } : { data, error: null };
    } catch (err) {
      return { data: null, error: `${what}: ${(err as Error).message}` };
    }
  }

  const eventsFor = (f: Filters) => guarded<EventAnalytics>(() => events.analytics(f), 'Splunk');
  const criblOverview = () => guarded<CriblOverview>(async () => (cribl ? cribl.overview() : null), 'Cribl');

  async function allDetections(): Promise<{ list: Detection[]; error: string | null }> {
    const local = splunk ? await guarded(() => splunk.savedSearches('homelab_siem'), 'Splunk') : { data: [], error: null };
    return { list: [...importedDetections(), ...localFromSplunk(local.data ?? []), ...simulatedDetections()], error: local.error };
  }

  // ---------- system ----------
  app.get('/api/health', async () => ({ status: 'ok', time: new Date().toISOString() }));
  app.get('/api/integrations', async () => ({ items: await integrations() }));
  app.get('/api/settings', async () => ({
    authConfigured: Boolean(config.ADMIN_PASSWORD_HASH),
    adminUser: config.ADMIN_USER,
    allowlist: config.allowlist,
    excludeHosts: config.excludeHosts,
    excludeSources: config.excludeSources,
    splunk: { url: config.splunkUrl ?? null, index: config.SPLUNK_INDEX, sourcetype: config.SPLUNK_SOURCETYPE, verifyTls: config.SPLUNK_VERIFY_TLS },
    cribl: { url: config.criblUrl ?? null },
    stubs: Object.fromEntries(Object.entries(config.stubUrls).map(([k, v]) => [k, v ?? null])),
    syncIntervalSec: config.INCIDENT_SYNC_INTERVAL_SEC,
    timeoutMs: config.HTTP_TIMEOUT_MS,
    sigmaImport,
  }));

  // ---------- auth ----------
  app.get('/api/auth/me', async (req) => ({ user: sessionUser(req), authConfigured: Boolean(config.ADMIN_PASSWORD_HASH) }));
  app.post('/api/auth/login', async (req, reply) => {
    if (!config.ADMIN_PASSWORD_HASH) return reply.code(503).send({ error: 'login not configured (ADMIN_PASSWORD_HASH missing)' });
    if (limiter.blocked(req.ip)) return reply.code(429).send({ error: 'too many failed logins, try again later' });
    const body = LoginSchema.parse(req.body);
    const ok = body.username === config.ADMIN_USER && verifyPassword(body.password, config.ADMIN_PASSWORD_HASH);
    if (!ok) {
      limiter.fail(req.ip);
      return reply.code(401).send({ error: 'invalid credentials' });
    }
    limiter.reset(req.ip);
    reply.setCookie(COOKIE, sessionValue(body.username), cookieOptions(config.COOKIE_SECURE));
    return { user: body.username };
  });
  app.post('/api/auth/logout', async (_req, reply) => {
    reply.clearCookie(COOKIE, { path: '/' });
    return { user: null };
  });

  // ---------- incidents ----------
  app.get('/api/incidents', async (req) => repo.list(ListQuerySchema.parse(req.query)));
  app.get('/api/incidents/:id', async (req) => {
    const { id } = IdParam.parse(req.params);
    const incident = repo.get(id);
    if (!incident) throw new NotFoundError(`incident ${id} not found`);
    return { ...incident, history: repo.history(id) };
  });
  app.patch('/api/incidents/:id/status', auth, async (req) => {
    const { id } = IdParam.parse(req.params);
    const { status, note } = StatusChangeSchema.parse(req.body);
    const incident = repo.changeStatus(id, status, sessionUser(req)!, note);
    return { ...incident, history: repo.history(id) };
  });
  app.post('/api/incidents/sync', auth, async (_req, reply: FastifyReply) => {
    if (!splunk) return reply.code(503).send({ error: 'Splunk not configured' });
    return syncFiredAlerts(splunk, repo);
  });

  // ---------- dashboard ----------
  app.get('/api/dashboard', async (req) => {
    const f = FilterSchema.parse(req.query);
    const inRange = repo.all(f);
    const open = inRange.filter((i) => i.status === 'new' || i.status === 'investigating');
    const status = await integrations();
    const down = status.filter((s) => (s.id === 'splunk' || s.id === 'cribl') && s.state === 'down').length;
    const score = healthScore(open, down);

    // created vs resolved per bucket
    const spanMs = { '5m': 300_000, '1h': 3_600_000, '6h': 21_600_000, '1d': 86_400_000 }[RANGES[f.range].span];
    const start = Date.parse(rangeStart(f.range));
    const buckets = Array.from({ length: Math.ceil(RANGES[f.range].ms / spanMs) }, (_, i) => ({
      time: new Date(Math.floor((start + i * spanMs) / spanMs) * spanMs).toISOString(), created: 0, resolved: 0,
    }));
    const bucketOf = (iso: string) => buckets[Math.floor((Date.parse(iso) - Date.parse(buckets[0].time)) / spanMs)];
    for (const i of inRange) {
      const b = bucketOf(i.createdAt);
      if (b) b.created++;
      const resolved = repo.history(i.id).find((h) => h.toStatus === 'resolved');
      const rb = resolved && bucketOf(resolved.changedAt);
      if (rb) rb.resolved++;
    }
    const latestOpen = open[0] ?? inRange[0] ?? null;
    return {
      health: {
        score,
        label: score >= 85 ? 'Sehr gut' : score >= 70 ? 'Gut' : score >= 40 ? 'Gefährdet' : 'Kritisch',
        formula: '100 − 25×kritisch − 10×hoch − 4×mittel − 1×niedrig (offene Incidents) − 15 je ausgefallener Kernintegration (Splunk, Cribl)',
      },
      counts: {
        total: inRange.length,
        open: open.length,
        criticalOpen: open.filter((i) => i.severity === 'critical' || i.severity === 'high').length,
        resolved: inRange.filter((i) => i.status === 'resolved' || i.status === 'closed').length,
        byStatus: Object.fromEntries(['new', 'investigating', 'resolved', 'closed'].map((s) => [s, inRange.filter((i) => i.status === s).length])),
        bySeverity: Object.fromEntries(['critical', 'high', 'medium', 'low'].map((s) => [s, inRange.filter((i) => i.severity === s).length])),
      },
      mttrMinutes: repo.resolutionMinutes(f),
      activity: buckets,
      latest: inRange.slice(0, 8),
      focus: latestOpen ? { incident: latestOpen, history: repo.history(latestOpen.id) } : null,
      integrations: status,
    };
  });

  app.get('/api/events', async (req) => eventsFor(FilterSchema.parse(req.query)));

  app.get('/api/hosts', async (req) => {
    const f = FilterSchema.parse(req.query);
    const ev = await eventsFor(f);
    const incidents = repo.all(f);
    return {
      error: ev.error,
      items: (ev.data?.hosts ?? []).filter((h) => !isExcluded(h.host)).map((h) => ({
        ...h,
        openIncidents: incidents.filter((i) => i.host === h.host && (i.status === 'new' || i.status === 'investigating')).length,
      })),
    };
  });

  app.get('/api/topology', async (req) => {
    const f = FilterSchema.parse(req.query);
    const [ev, status, pipe] = await Promise.all([eventsFor(f), integrations(), criblOverview()]);
    return buildTopology({ events: ev.data, eventsError: ev.error, integrations: status, cribl: pipe.data, incidents: repo.all(f), isExcluded });
  });

  app.get('/api/pipelines', async () => criblOverview());

  app.get('/api/detections', async (req) => {
    const f = FilterSchema.parse(req.query);
    const { list, error } = await allDetections();
    const incidents = repo.all(f);
    return {
      error,
      sigmaImport,
      items: filterDetections(list, f).map(({ logic, spl, ...d }) => ({ ...d, incidents: incidents.filter((i) => i.detectionId === d.id).length })),
    };
  });
  app.get('/api/detections/:id', async (req) => {
    const { id } = z.object({ id: z.string().regex(/^[\w-]{1,120}$/) }).parse(req.params);
    const { list } = await allDetections();
    const d = list.find((x) => x.id === id);
    if (!d) throw new NotFoundError(`detection ${id} not found`);
    return { ...d, incidents: repo.all({ range: '30d' }).filter((i) => i.detectionId === d.id).slice(0, 20) };
  });

  app.get('/api/coverage', async (req) => {
    const f = FilterSchema.parse(req.query);
    const { list } = await allDetections();
    const incidents = repo.all(f);
    const techniques = new Map<string, { technique: string; tactics: Set<string>; detections: { id: string; title: string; origin: string; level: string }[]; incidents: number }>();
    for (const d of filterDetections(list, { mitre: f.mitre, severity: f.severity })) {
      for (const t of d.mitre) {
        const e = techniques.get(t) ?? { technique: t, tactics: new Set<string>(), detections: [], incidents: 0 };
        d.tactics.forEach((x) => e.tactics.add(x));
        e.detections.push({ id: d.id, title: d.title, origin: d.origin, level: d.level });
        techniques.set(t, e);
      }
    }
    for (const i of incidents) for (const t of i.mitre) {
      const e = techniques.get(t);
      if (e) e.incidents++;
    }
    return { items: [...techniques.values()].map((t) => ({ ...t, tactics: [...t.tactics] })).sort((a, b) => a.technique.localeCompare(b.technique)) };
  });

  // ---------- simulated modules ----------
  app.get('/api/soar', async () => ({ simulated: true, integration: (await integrations()).find((i) => i.id === 'shuffle'), playbooks: SOAR_PLAYBOOKS }));
  app.get('/api/threat-intel', async () => ({ simulated: true, integration: (await integrations()).find((i) => i.id === 'opencti'), indicators: THREAT_INTEL }));

  app.all('/api/*', async (_req, reply) => reply.code(404).send({ error: 'not found' }));

  // ---------- SPA ----------
  const web = resolve(config.WEB_DIST ?? '../web/dist');
  if (existsSync(web)) {
    app.register(fastifyStatic, { root: web, wildcard: false });
    app.setNotFoundHandler((_req, reply) => reply.sendFile('index.html'));
  }

  return { app, repo };
}
