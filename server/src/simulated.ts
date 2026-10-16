import type { IncidentRepo, NewIncident, Status } from './incidents.js';

// Everything in this file is demo data. The API returns it with `simulated: true`
// and the UI labels it "Simuliert". Addresses come from the documentation ranges (RFC 5737).

export const SOAR_PLAYBOOKS = [
  { id: 'pb-ssh-block', name: 'Block SSH brute-force source', trigger: 'Sigma - SSH Password Guessing From Single Source', steps: ['Enrich IP (OpenCTI)', 'Create firewall block', 'Notify'], lastRun: null, state: 'draft' },
  { id: 'pb-sudoers', name: 'Sudoers change review', trigger: 'Sigma - Sudo Command On Credential Or Sudoers Files', steps: ['Snapshot /etc/sudoers.d', 'Open ticket', 'Ask owner'], lastRun: null, state: 'draft' },
  { id: 'pb-new-user', name: 'New local account verification', trigger: 'Sigma - Local User Account Created', steps: ['Check onboarding list', 'Disable if unknown'], lastRun: null, state: 'draft' },
];

export const THREAT_INTEL = [
  { indicator: '203.0.113.10', type: 'ipv4', source: 'demo feed', confidence: 80, labels: ['ssh-bruteforce'], firstSeen: '2026-10-01T00:00:00Z' },
  { indicator: '198.51.100.23', type: 'ipv4', source: 'demo feed', confidence: 60, labels: ['scanner'], firstSeen: '2026-10-05T00:00:00Z' },
  { indicator: 'mallory', type: 'username', source: 'demo feed', confidence: 40, labels: ['credential-stuffing-wordlist'], firstSeen: '2026-10-07T00:00:00Z' },
  { indicator: 'T1110.001', type: 'attack-pattern', source: 'MITRE ATT&CK', confidence: 100, labels: ['password-guessing'], firstSeen: '2026-01-01T00:00:00Z' },
];

const DEMO: (Omit<NewIncident, 'createdAt' | 'source'> & { ageMin: number; status: Status })[] = [
  { externalId: 'sim:1', title: 'SSH Password Guessing From Single Source', detectionId: 'ssh_password_guessing', severity: 'medium', host: 'lab-linux-01', user: 'mallory', src: '203.0.113.10', mitre: ['T1110.001'], eventCount: 7, details: [], ageMin: 40, status: 'new' },
  { externalId: 'sim:2', title: 'Sudo Command On Credential Or Sudoers Files', detectionId: 'privileged_command', severity: 'high', host: 'lab-linux-01', user: 'labsudo', src: null, mitre: ['T1003.008', 'T1548.003'], eventCount: 1, details: [], ageMin: 180, status: 'investigating' },
  { externalId: 'sim:3', title: 'Local User Account Created', detectionId: 'user_account_created', severity: 'medium', host: 'lab-linux-01', user: 'sigmatest', src: null, mitre: ['T1136.001'], eventCount: 1, details: [], ageMin: 600, status: 'resolved' },
  { externalId: 'sim:4', title: 'SSH Password Guessing From Single Source', detectionId: 'ssh_password_guessing', severity: 'medium', host: 'lab-linux-01', user: 'admin', src: '198.51.100.23', mitre: ['T1110.001'], eventCount: 4, details: [], ageMin: 1300, status: 'new' },
];

/** SEED_DEMO=true: inserts simulated incidents (source=simulated) for local development and the E2E test */
export function seedDemo(repo: IncidentRepo) {
  for (const { ageMin, status, ...d } of DEMO) {
    const createdAt = new Date(Date.now() - ageMin * 60_000).toISOString();
    if (!repo.insertIfNew({ ...d, source: 'simulated', createdAt }, 'demo-seed')) continue;
    const id = repo.list({ range: '30d', q: d.externalId, sort: 'created_at', order: 'desc', page: 1, pageSize: 1 }).items[0].id;
    const path: Status[] = ['investigating', 'resolved', 'closed'];
    for (const s of path.slice(0, path.indexOf(status as Status) + 1)) repo.changeStatus(id, s, 'demo-seed');
  }
}
