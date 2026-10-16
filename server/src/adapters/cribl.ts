import { AdapterError, errorStatus, json, request, type IntegrationStatus } from './http.js';

// Cribl Stream REST API (https://docs.cribl.io/api-reference/), verified against Cribl Stream 4.20.2 in the homelab:
//   POST /api/v1/auth/login   GET /api/v1/health   GET /api/v1/system/info
//   GET  /api/v1/system/inputs   GET /api/v1/system/outputs   GET /api/v1/routes   GET /api/v1/pipelines

export interface CriblConfig {
  url: string;
  user: string;
  password: string;
  timeoutMs: number;
}

export interface CriblComponent {
  id: string;
  type: string;
  disabled: boolean;
  health: string | null;
  /** numeric status metrics only; config fields (tokens, passwords, URLs) are never passed on */
  metrics: Record<string, number>;
}

export interface CriblRoute {
  id: string;
  name: string;
  filter: string;
  pipeline: string;
  output: string | null;
  final: boolean;
  disabled: boolean;
}

export interface CriblPipeline {
  id: string;
  description: string;
  functions: number;
}

const BASE = { id: 'cribl', name: 'Cribl Stream', category: 'Datenpipeline', docsUrl: 'https://docs.cribl.io/api-reference/' };

type Item = Record<string, unknown> & { id: string };

function component(item: Item): CriblComponent {
  const status = (item.status ?? {}) as { health?: string; metrics?: Record<string, unknown> };
  const metrics: Record<string, number> = {};
  for (const [k, v] of Object.entries(status.metrics ?? {})) if (typeof v === 'number') metrics[k] = v;
  return {
    id: item.id,
    type: String(item.type ?? ''),
    disabled: Boolean(item.disabled),
    health: status.health ?? null,
    metrics,
  };
}

export function createCribl(cfg: CriblConfig) {
  // shared promise: parallel requests wait for one login instead of each logging in
  let token: Promise<string> | null = null;

  function login() {
    token = (async () => {
      const res = await request(`${cfg.url}/api/v1/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: cfg.user, password: cfg.password }),
        timeoutMs: cfg.timeoutMs,
      });
      const body = await json<{ token?: string }>(res);
      if (!body.token) throw new AdapterError('login returned no token', 'auth');
      return body.token;
    })();
    token.catch(() => (token = null));
    return token;
  }

  async function get<T>(path: string): Promise<T> {
    const call = (t: string) => request(`${cfg.url}${path}`, { headers: { Authorization: `Bearer ${t}` }, timeoutMs: cfg.timeoutMs });
    const current = token ?? login();
    const used = await current;
    try {
      return await json<T>(await call(used));
    } catch (err) {
      if (!(err instanceof AdapterError && err.kind === 'auth')) throw err;
      // token expired: log in again once (unless another request already did)
      const fresh = token === current ? login() : (token ?? login());
      return json<T>(await call(await fresh));
    }
  }

  return {
    async health(): Promise<IntegrationStatus> {
      const started = Date.now();
      try {
        const h = await json<{ status?: string }>(await request(`${cfg.url}/api/v1/health`, { timeoutMs: cfg.timeoutMs }));
        const info = await get<{ items: { BUILD?: { VERSION?: string } }[] }>('/api/v1/system/info');
        return {
          ...BASE,
          state: h.status === 'healthy' ? 'up' : 'degraded',
          detail: `Status: ${h.status ?? 'unbekannt'}`,
          version: info.items?.[0]?.BUILD?.VERSION,
          latencyMs: Date.now() - started,
          checkedAt: new Date().toISOString(),
        };
      } catch (err) {
        return errorStatus(BASE, err);
      }
    },

    async overview() {
      const [inputs, outputs, routes, pipelines] = await Promise.all([
        get<{ items: Item[] }>('/api/v1/system/inputs'),
        get<{ items: Item[] }>('/api/v1/system/outputs'),
        get<{ items: { id: string; routes?: Item[] }[] }>('/api/v1/routes'),
        get<{ items: (Item & { conf?: { description?: string; functions?: unknown[] } })[] }>('/api/v1/pipelines'),
      ]);
      return {
        inputs: (inputs.items ?? []).map(component),
        outputs: (outputs.items ?? []).filter((o) => o.type !== 'default').map(component),
        routes: (routes.items ?? []).flatMap((table) =>
          (table.routes ?? []).map(
            (r): CriblRoute => ({
              id: r.id,
              name: String(r.name ?? r.id),
              filter: String(r.filter ?? ''),
              pipeline: String(r.pipeline ?? ''),
              output: (r.output as string) ?? null,
              final: Boolean(r.final),
              disabled: Boolean(r.disabled),
            }),
          ),
        ),
        pipelines: (pipelines.items ?? []).map(
          (p): CriblPipeline => ({ id: p.id, description: p.conf?.description ?? '', functions: p.conf?.functions?.length ?? 0 }),
        ),
      };
    },
  };
}

export type Cribl = ReturnType<typeof createCribl>;
export type CriblOverview = Awaited<ReturnType<Cribl['overview']>>;
