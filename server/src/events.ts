import { splQuote, type Splunk, type SplunkRow } from './adapters/splunk.js';
import { ttlCache } from './adapters/http.js';
import { eventTypesFor } from './detections.js';
import { RANGES, type Filters } from './filters.js';

export interface EventBucket {
  time: string;
  success: number;
  failure: number;
  other: number;
}

export interface HostStat {
  host: string;
  events: number;
  failures: number;
  sources: number;
  lastSeen: string;
  eventTypes: Record<string, number>;
}

export interface EventAnalytics {
  total: number;
  timeline: EventBucket[];
  byType: { name: string; count: number }[];
  byAction: { name: string; count: number }[];
  topSources: { src: string; count: number; failures: number; hosts: { host: string; count: number; failures: number }[] }[];
  hosts: HostStat[];
  spl: string;
}

export interface EventSearchOptions {
  index: string;
  sourcetype: string;
  excludeHosts: string[];
  /** Splunk `source` patterns hidden everywhere, e.g. synthetic test input cribl:http:* */
  excludeSources: string[];
}

/** SPL for the global filter bar. Every user value is validated by FilterSchema and quoted. */
export function buildEventSpl(f: Filters, o: EventSearchOptions) {
  const parts = [`search index=${splQuote(o.index)} sourcetype=${splQuote(o.sourcetype)}`];
  if (o.excludeHosts.length) parts.push(`NOT host IN (${o.excludeHosts.map(splQuote).join(', ')})`);
  if (o.excludeSources.length) parts.push(`NOT source IN (${o.excludeSources.map(splQuote).join(', ')})`);
  if (f.host) parts.push(`host=${splQuote(f.host)}`);
  const types = eventTypesFor(f);
  if (types) parts.push(types.length ? `event_type IN (${types.map(splQuote).join(', ')})` : 'event_type="__no_matching_detection__"');
  if (f.q) parts.push(splQuote(f.q));
  return `${parts.join(' ')}
| eval event_ts=_time
| bin _time span=${RANGES[f.range].span}
| fillnull value="-" event_type action src
| stats count, max(event_ts) AS last_seen BY _time host event_type action src`;
}

const num = (v: SplunkRow[string]) => Number(Array.isArray(v) ? v[0] : (v ?? 0));
const str = (v: SplunkRow[string]) => String(Array.isArray(v) ? v[0] : (v ?? ''));
const top = (m: Map<string, number>, n = 10) =>
  [...m].sort((a, b) => b[1] - a[1]).slice(0, n).map(([name, count]) => ({ name, count }));

export function aggregate(rows: SplunkRow[], spl: string): EventAnalytics {
  const timeline = new Map<string, EventBucket>();
  const byType = new Map<string, number>();
  const byAction = new Map<string, number>();
  const sources = new Map<string, { count: number; failures: number; hosts: Map<string, { host: string; count: number; failures: number }> }>();
  const hosts = new Map<string, HostStat & { srcSet: Set<string> }>();
  let total = 0;
  for (const r of rows) {
    const count = num(r.count);
    const time = new Date(num(r._time) * 1000 || Date.parse(str(r._time))).toISOString();
    const action = str(r.action);
    const type = str(r.event_type);
    const src = str(r.src);
    const host = str(r.host);
    const lastSeen = new Date(num(r.last_seen) * 1000).toISOString();
    total += count;
    const b = timeline.get(time) ?? { time, success: 0, failure: 0, other: 0 };
    if (action === 'success') b.success += count;
    else if (action === 'failure') b.failure += count;
    else b.other += count;
    timeline.set(time, b);
    byType.set(type, (byType.get(type) ?? 0) + count);
    byAction.set(action, (byAction.get(action) ?? 0) + count);
    if (src !== '-') {
      const s = sources.get(src) ?? { count: 0, failures: 0, hosts: new Map() };
      const sh = s.hosts.get(host) ?? { host, count: 0, failures: 0 };
      s.count += count;
      sh.count += count;
      if (action === 'failure') (s.failures += count), (sh.failures += count);
      s.hosts.set(host, sh);
      sources.set(src, s);
    }
    const h = hosts.get(host) ?? { host, events: 0, failures: 0, sources: 0, lastSeen, eventTypes: {}, srcSet: new Set<string>() };
    h.events += count;
    if (action === 'failure') h.failures += count;
    if (src !== '-') h.srcSet.add(src);
    h.eventTypes[type] = (h.eventTypes[type] ?? 0) + count;
    if (lastSeen > h.lastSeen) h.lastSeen = lastSeen;
    hosts.set(host, h);
  }
  return {
    total,
    timeline: [...timeline.values()].sort((a, b) => a.time.localeCompare(b.time)),
    byType: top(byType),
    byAction: top(byAction),
    topSources: [...sources].sort((a, b) => b[1].failures - a[1].failures || b[1].count - a[1].count).slice(0, 10)
      .map(([src, s]) => ({ src, count: s.count, failures: s.failures, hosts: [...s.hosts.values()] })),
    hosts: [...hosts.values()].map(({ srcSet, ...h }) => ({ ...h, sources: srcSet.size })).sort((a, b) => b.events - a.events),
    spl,
  };
}

const SPAN_MS = { '5m': 300_000, '1h': 3_600_000, '6h': 21_600_000, '1d': 86_400_000 } as const;

/** Splunk's stats drops empty bins; add zero buckets (same epoch alignment as `bin`) so charts show the gaps */
export function fillGaps(timeline: EventBucket[], range: Filters['range'], now = Date.now()): EventBucket[] {
  const span = SPAN_MS[RANGES[range].span];
  const byTime = new Map(timeline.map((b) => [b.time, b]));
  const out: EventBucket[] = [];
  for (let t = Math.floor((now - RANGES[range].ms) / span) * span; t <= now; t += span) {
    const time = new Date(t).toISOString();
    out.push(byTime.get(time) ?? { time, success: 0, failure: 0, other: 0 });
    byTime.delete(time);
  }
  return [...out, ...byTime.values()].sort((a, b) => a.time.localeCompare(b.time));
}

export function createEventService(splunk: Splunk | null, o: EventSearchOptions) {
  const cache = ttlCache(30_000);
  return {
    async analytics(f: Filters): Promise<EventAnalytics | null> {
      if (!splunk) return null;
      const spl = buildEventSpl(f, o);
      return cache(spl, async () => {
        const a = aggregate(await splunk.search(spl, RANGES[f.range].splunk), spl);
        return { ...a, timeline: fillGaps(a.timeline, f.range) };
      });
    },
  };
}

export type EventService = ReturnType<typeof createEventService>;
