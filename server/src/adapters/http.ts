import { Agent, fetch as undiciFetch, type Dispatcher } from 'undici';

export type IntegrationState = 'up' | 'degraded' | 'down' | 'not_configured';

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

export class AdapterError extends Error {
  constructor(
    message: string,
    readonly kind: 'timeout' | 'network' | 'http' | 'auth' | 'parse',
    readonly status?: number,
  ) {
    super(message);
  }
}

/** fetch with timeout and uniform errors; adapters never leak raw response bodies upstream. */
export async function request(
  url: string,
  init: RequestInit & { timeoutMs: number; dispatcher?: Dispatcher },
): Promise<Response> {
  const { timeoutMs, ...rest } = init;
  let res: Response;
  try {
    // undici's own fetch: the global fetch rejects a dispatcher from a different undici version
    res = (await undiciFetch(url, { ...rest, signal: AbortSignal.timeout(timeoutMs) } as never)) as unknown as Response;
  } catch (err) {
    const e = err as Error;
    if (e.name === 'TimeoutError' || e.name === 'AbortError') {
      throw new AdapterError(`timeout after ${timeoutMs} ms`, 'timeout');
    }
    const cause = (e as { cause?: { code?: string } }).cause?.code;
    throw new AdapterError(`network error${cause ? ` (${cause})` : ''}`, 'network');
  }
  if (res.status === 401 || res.status === 403) throw new AdapterError(`HTTP ${res.status}`, 'auth', res.status);
  if (!res.ok) throw new AdapterError(`HTTP ${res.status}`, 'http', res.status);
  return res;
}

export async function json<T>(res: Response): Promise<T> {
  try {
    return (await res.json()) as T;
  } catch {
    throw new AdapterError('invalid JSON response', 'parse');
  }
}

export const insecureAgent = new Agent({ connect: { rejectUnauthorized: false } });

export function errorStatus(base: Omit<IntegrationStatus, 'state' | 'detail' | 'checkedAt'>, err: unknown): IntegrationStatus {
  const e = err instanceof AdapterError ? err : new AdapterError(String((err as Error)?.message ?? err), 'network');
  return { ...base, state: 'down', detail: `${e.kind}: ${e.message}`, checkedAt: new Date().toISOString() };
}

/** tiny TTL cache so dashboard refreshes do not hammer Splunk/Cribl */
export function ttlCache(ttlMs: number) {
  const store = new Map<string, { at: number; value: Promise<unknown> }>();
  return <T>(key: string, fn: () => Promise<T>): Promise<T> => {
    const hit = store.get(key);
    if (hit && Date.now() - hit.at < ttlMs) return hit.value as Promise<T>;
    const value = fn();
    store.set(key, { at: Date.now(), value });
    value.catch(() => store.delete(key));
    return value;
  };
}
