import { z } from 'zod';

const optionalUrl = z.string().url().optional().or(z.literal('').transform(() => undefined));
const bool = z.enum(['true', 'false']).default('false').transform((v) => v === 'true');

const EnvSchema = z.object({
  PORT: z.coerce.number().int().default(8080),
  HOST: z.string().default('0.0.0.0'),
  DB_PATH: z.string().default('./data/portal.sqlite'),
  WEB_DIST: z.string().optional(),
  ADMIN_USER: z.string().min(1).default('admin'),
  ADMIN_PASSWORD_HASH: z.string().optional(),
  SESSION_SECRET: z.string().min(32, 'SESSION_SECRET must have at least 32 characters'),
  COOKIE_SECURE: bool,
  SEED_DEMO: bool,
  INTEGRATION_ALLOWLIST: z.string().default('splunk,cribl'),
  HTTP_TIMEOUT_MS: z.coerce.number().int().positive().default(8000),
  INCIDENT_SYNC_INTERVAL_SEC: z.coerce.number().int().min(0).default(120),
  EXCLUDE_HOST_PATTERNS: z.string().default('lab-reduce-*,sigma-live-*'),
  EXCLUDE_SOURCES: z.string().default(''),
  SPLUNK_URL: optionalUrl,
  SPLUNK_USER: z.string().default('admin'),
  SPLUNK_PASSWORD: z.string().optional(),
  SPLUNK_VERIFY_TLS: z.enum(['true', 'false']).default('true').transform((v) => v === 'true'),
  SPLUNK_INDEX: z.string().regex(/^[\w-]+$/).default('homelab_auth'),
  SPLUNK_SOURCETYPE: z.string().regex(/^[\w:.-]+$/).default('homelab:auth'),
  CRIBL_URL: optionalUrl,
  CRIBL_USER: z.string().default('admin'),
  CRIBL_PASSWORD: z.string().optional(),
  SHUFFLE_URL: optionalUrl,
  OPENCTI_URL: optionalUrl,
  PROMETHEUS_URL: optionalUrl,
  GRAFANA_URL: optionalUrl,
  WAZUH_URL: optionalUrl,
});

export type Config = ReturnType<typeof loadConfig>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env) {
  const parsed = EnvSchema.parse(env);
  const allowlist = parsed.INTEGRATION_ALLOWLIST.split(',').map((h) => h.trim().toLowerCase()).filter(Boolean);
  // SSRF guard: integration targets come from env only, and only hosts on the allowlist are accepted.
  const target = (name: string, url: string | undefined) => {
    if (!url) return undefined;
    const u = new URL(url);
    if (!['http:', 'https:'].includes(u.protocol)) throw new Error(`${name}: only http/https allowed`);
    if (!allowlist.includes(u.hostname.toLowerCase())) {
      throw new Error(`${name}: host "${u.hostname}" is not in INTEGRATION_ALLOWLIST`);
    }
    return u.origin;
  };
  return {
    ...parsed,
    allowlist,
    excludeHosts: parsed.EXCLUDE_HOST_PATTERNS.split(',').map((p) => p.trim()).filter((p) => /^[\w.*-]+$/.test(p)),
    excludeSources: parsed.EXCLUDE_SOURCES.split(',').map((p) => p.trim()).filter((p) => /^[\w.:*\/-]+$/.test(p)),
    splunkUrl: target('SPLUNK_URL', parsed.SPLUNK_URL),
    criblUrl: target('CRIBL_URL', parsed.CRIBL_URL),
    stubUrls: {
      shuffle: target('SHUFFLE_URL', parsed.SHUFFLE_URL),
      opencti: target('OPENCTI_URL', parsed.OPENCTI_URL),
      prometheus: target('PROMETHEUS_URL', parsed.PROMETHEUS_URL),
      grafana: target('GRAFANA_URL', parsed.GRAFANA_URL),
      wazuh: target('WAZUH_URL', parsed.WAZUH_URL),
    },
  };
}
