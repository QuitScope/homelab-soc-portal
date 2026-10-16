import { z } from 'zod';

export const RANGES = {
  '1h': { ms: 3_600_000, splunk: '-1h', span: '5m' },
  '24h': { ms: 86_400_000, splunk: '-24h', span: '1h' },
  '7d': { ms: 7 * 86_400_000, splunk: '-7d', span: '6h' },
  '30d': { ms: 30 * 86_400_000, splunk: '-30d', span: '1d' },
} as const;

export const SEVERITIES = ['low', 'medium', 'high', 'critical'] as const;
export type Severity = (typeof SEVERITIES)[number];

/** Global filter bar; every endpoint that shows data parses its query with this schema. */
export const FilterSchema = z.object({
  range: z.enum(['1h', '24h', '7d', '30d']).default('24h'),
  host: z.string().regex(/^[\w.-]{1,64}$/).optional(),
  severity: z.enum(SEVERITIES).optional(),
  mitre: z.string().regex(/^T\d{4}(\.\d{3})?$/).optional(),
  q: z.preprocess((v) => (typeof v === 'string' && !v.trim() ? undefined : v), z.string().trim().max(100).optional()),
});
export type Filters = z.infer<typeof FilterSchema>;

export function rangeStart(range: Filters['range'], now = Date.now()) {
  return new Date(now - RANGES[range].ms).toISOString();
}

/** glob (only * wildcard) → RegExp, used for EXCLUDE_HOST_PATTERNS */
export function globMatcher(patterns: string[]) {
  const res = patterns.map((p) => new RegExp(`^${p.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')}$`));
  return (value: string) => res.some((r) => r.test(value));
}
