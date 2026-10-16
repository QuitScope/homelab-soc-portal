import { describe, expect, it } from 'vitest';
import type { Splunk } from '../src/adapters/splunk.js';
import { eventTypesFor } from '../src/detections.js';
import { aggregate, buildEventSpl, fillGaps } from '../src/events.js';
import { FilterSchema } from '../src/filters.js';
import { createIncidentRepo, type Incident } from '../src/incidents.js';
import { openDb } from '../src/db.js';
import { syncFiredAlerts } from '../src/sync.js';
import { buildTopology } from '../src/topology.js';

const opts = { index: 'homelab_auth', sourcetype: 'homelab:auth', excludeHosts: ['lab-reduce-*', 'sigma-live-*'], excludeSources: ['cribl:http:*'] };

describe('event SPL', () => {
  it('applies every filter and quotes user input', () => {
    const spl = buildEventSpl(FilterSchema.parse({ range: '7d', host: 'lab-linux-01', mitre: 'T1110', q: 'a" | delete' }), opts);
    expect(spl).toContain('search index="homelab_auth" sourcetype="homelab:auth"');
    expect(spl).toContain('NOT host IN ("lab-reduce-*", "sigma-live-*")');
    expect(spl).toContain('NOT source IN ("cribl:http:*")');
    expect(buildEventSpl(FilterSchema.parse({}), { ...opts, excludeSources: [] })).not.toContain('NOT source');
    expect(spl).toContain('host="lab-linux-01"');
    expect(spl).toContain('event_type IN ("authentication")');
    expect(spl).toContain('"a\\" | delete"');
    expect(spl).toContain('span=6h');
  });

  it('maps severity/MITRE filters to the event types of matching Sigma rules', () => {
    expect(eventTypesFor({})).toBeNull();
    expect(eventTypesFor({ severity: 'high' })).toEqual(['sudo']);
    expect(eventTypesFor({ mitre: 'T1136' })).toEqual(['user_created']);
    expect(eventTypesFor({ severity: 'critical' })).toEqual([]);
    expect(buildEventSpl(FilterSchema.parse({ severity: 'critical' }), opts)).toContain('event_type="__no_matching_detection__"');
  });

  it('rejects host values that could break out of the SPL string', () => {
    expect(() => FilterSchema.parse({ host: 'x" OR index=*' })).toThrow();
  });

  it('aggregates stats rows into timeline, sources and hosts', () => {
    const t = 1792080000;
    const a = aggregate(
      [
        { _time: String(t), host: 'lab-linux-01', event_type: 'authentication', action: 'failure', src: '203.0.113.10', count: '5', last_seen: String(t + 100) },
        { _time: String(t), host: 'lab-linux-01', event_type: 'authentication', action: 'success', src: '192.0.2.5', count: '2', last_seen: String(t + 50) },
        { _time: String(t + 3600), host: 'lab-linux-01', event_type: 'sudo', action: 'success', src: '-', count: '1', last_seen: String(t + 3700) },
      ],
      'spl',
    );
    expect(a.total).toBe(8);
    expect(a.timeline).toEqual([
      { time: new Date(t * 1000).toISOString(), success: 2, failure: 5, other: 0 },
      { time: new Date((t + 3600) * 1000).toISOString(), success: 1, failure: 0, other: 0 },
    ]);
    expect(a.topSources[0]).toEqual({ src: '203.0.113.10', count: 5, failures: 5, hosts: [{ host: 'lab-linux-01', count: 5, failures: 5 }] });
    expect(a.hosts[0]).toMatchObject({ host: 'lab-linux-01', events: 8, failures: 5, sources: 2, lastSeen: new Date((t + 3700) * 1000).toISOString() });
  });
});

describe('fillGaps', () => {
  it('adds zero buckets between Splunk bins and keeps existing ones', () => {
    const now = Date.parse('2026-10-15T22:30:00Z');
    const b = (h: number, failure: number) => ({ time: `2026-10-15T${String(h).padStart(2, '0')}:00:00.000Z`, success: 0, failure, other: 0 });
    const out = fillGaps([b(19, 4), b(22, 1)], '24h', now);
    expect(out).toHaveLength(25); // 22:00 yesterday … 22:00 today
    expect(out.find((x) => x.time.startsWith('2026-10-15T20'))).toEqual(b(20, 0));
    expect(out.find((x) => x.time.startsWith('2026-10-15T19'))!.failure).toBe(4);
    expect(out.at(-1)).toEqual(b(22, 1));
  });
});

describe('incident sync', () => {
  it('creates one incident per fired alert, maps the Sigma rule and is idempotent', async () => {
    const repo = createIncidentRepo(openDb(':memory:'));
    const fake = {
      firedAlerts: async () => [
        { sid: 'scheduler_a', savedSearch: 'Sigma - Sudo Command On Credential Or Sudoers Files', severity: 4, triggerTime: Date.now() / 1000 - 60 },
        { sid: 'scheduler_b', savedSearch: 'HomeLab - Something Else', severity: 2, triggerTime: Date.now() / 1000 - 120 },
      ],
      jobResults: async (sid: string) => {
        if (sid === 'scheduler_b') throw new Error('job expired');
        return [{ user: 'labsudo', target_user: 'root', command: '/usr/bin/cat /etc/shadow', dest: 'lab-linux-01' }];
      },
    } as unknown as Splunk;
    expect(await syncFiredAlerts(fake, repo)).toEqual({ alerts: 2, created: 2 });
    expect(await syncFiredAlerts(fake, repo)).toEqual({ alerts: 2, created: 0 });
    const [a, b] = repo.list({ range: '24h', sort: 'created_at', order: 'desc', page: 1, pageSize: 10 }).items;
    expect(a).toMatchObject({ source: 'splunk', detectionId: 'privileged_command', severity: 'high', host: 'lab-linux-01', user: 'labsudo', mitre: ['T1003.008', 'T1548.003'], status: 'new' });
    expect(b).toMatchObject({ title: 'HomeLab - Something Else', severity: 'low', detectionId: null, details: [] });
    expect(repo.history(a.id)[0]).toMatchObject({ toStatus: 'new', actor: 'splunk-sync' });
  });
});

describe('topology', () => {
  it('builds nodes from live data and marks attack paths', () => {
    const t = buildTopology({
      events: {
        total: 10, timeline: [], byType: [], byAction: [], spl: '',
        topSources: [{ src: '203.0.113.10', count: 5, failures: 5, hosts: [{ host: 'lab-linux-01', count: 5, failures: 5 }, { host: 'sigma-live-1', count: 1, failures: 1 }] }, { src: '192.0.2.5', count: 2, failures: 0, hosts: [] }],
        hosts: [
          { host: 'lab-linux-01', events: 7, failures: 5, sources: 2, lastSeen: new Date().toISOString(), eventTypes: {} },
          { host: 'sigma-live-1', events: 3, failures: 0, sources: 0, lastSeen: new Date().toISOString(), eventTypes: {} },
        ],
      },
      eventsError: null,
      integrations: [
        { id: 'splunk', name: 'Splunk', category: 'SIEM', state: 'up', detail: 'ok', checkedAt: '' },
        { id: 'cribl', name: 'Cribl', category: 'Data Pipeline', state: 'down', detail: 'timeout', checkedAt: '' },
        { id: 'wazuh', name: 'Wazuh', category: 'EDR', state: 'not_configured', detail: 'Not configured', checkedAt: '' },
      ],
      cribl: null,
      incidents: [],
      isExcluded: (h) => h.startsWith('sigma-live-'),
    });
    const ids = t.nodes.map((n) => n.id);
    expect(ids).toEqual(['src:203.0.113.10', 'host:lab-linux-01', 'cribl', 'splunk', 'portal', 'wazuh']);
    expect(t.nodes.find((n) => n.id === 'cribl')!.status).toBe('down');
    expect(t.nodes[0].status).toBe('suspicious');
    expect(t.edges.filter((e) => e.source === 'src:203.0.113.10').map((e) => [e.target, e.kind])).toEqual([['host:lab-linux-01', 'normal']]);
    expect(t.edges.find((e) => e.target === 'wazuh')!.kind).toBe('planned');
  });

  it('marks a source as attack only while it has open incidents', () => {
    const base = {
      events: {
        total: 5, timeline: [], byType: [], byAction: [], spl: '',
        topSources: [{ src: '203.0.113.10', count: 5, failures: 5, hosts: [{ host: 'lab-linux-01', count: 5, failures: 5 }] }],
        hosts: [{ host: 'lab-linux-01', events: 5, failures: 5, sources: 1, lastSeen: new Date().toISOString(), eventTypes: {} }],
      },
      eventsError: null, integrations: [], cribl: null, isExcluded: () => false,
    };
    const inc = (status: string) => [{ src: '203.0.113.10', host: 'other', status }] as unknown as Incident[];
    const open = buildTopology({ ...base, incidents: inc('investigating') });
    expect(open.nodes[0].status).toBe('attack');
    expect(open.edges[0].kind).toBe('attack');
    const resolved = buildTopology({ ...base, incidents: inc('resolved') });
    expect(resolved.nodes[0].status).toBe('suspicious');
    expect(resolved.edges[0].kind).toBe('normal');
  });
});
