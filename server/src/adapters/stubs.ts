import { errorStatus, request, type IntegrationStatus } from './http.js';

/**
 * Integrations that are not deployed in the homelab yet. Without a URL they report "not_configured".
 * Only health endpoints that are documented without authentication are probed; the rest report
 * "configured, adapter not implemented" instead of guessing an API.
 */
export const STUBS = [
  { id: 'shuffle', name: 'Shuffle', category: 'SOAR', docsUrl: 'https://shuffler.io/docs/API', healthPath: null },
  { id: 'opencti', name: 'OpenCTI', category: 'Threat Intel', docsUrl: 'https://docs.opencti.io/latest/deployment/integrations/', healthPath: null },
  { id: 'prometheus', name: 'Prometheus', category: 'Metriken', docsUrl: 'https://prometheus.io/docs/prometheus/latest/management_api/', healthPath: '/-/healthy' },
  { id: 'grafana', name: 'Grafana', category: 'Metriken', docsUrl: 'https://grafana.com/docs/grafana/latest/developers/http_api/other/', healthPath: '/api/health' },
  { id: 'wazuh', name: 'Wazuh', category: 'EDR / HIDS', docsUrl: 'https://documentation.wazuh.com/current/user-manual/api/reference.html', healthPath: null },
] as const;

export type StubId = (typeof STUBS)[number]['id'];

export async function stubHealth(stub: (typeof STUBS)[number], url: string | undefined, timeoutMs: number): Promise<IntegrationStatus> {
  const base = { id: stub.id, name: stub.name, category: stub.category, docsUrl: stub.docsUrl };
  const checkedAt = new Date().toISOString();
  if (!url) return { ...base, state: 'not_configured', detail: 'Nicht konfiguriert', checkedAt };
  if (!stub.healthPath) return { ...base, state: 'not_configured', detail: 'URL gesetzt, Adapter in v1 nicht implementiert', checkedAt };
  const started = Date.now();
  try {
    await request(`${url}${stub.healthPath}`, { timeoutMs });
    return { ...base, state: 'up', detail: `GET ${stub.healthPath} OK`, latencyMs: Date.now() - started, checkedAt };
  } catch (err) {
    return errorStatus(base, err);
  }
}
