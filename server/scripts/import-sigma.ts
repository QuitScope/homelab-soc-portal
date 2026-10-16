/**
 * Imports the Sigma Detection Lab (QuitScope/homelab-siem, folder sigma-detection-lab) into data/sigma-import.json.
 * Usage: npm run import:sigma -- <path to sigma-detection-lab>
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { parseAllDocuments, stringify } from 'yaml';
import type { Detection } from '../src/detections.js';

const lab = process.argv[2];
if (!lab) {
  console.error('usage: npm run import:sigma -- <path to sigma-detection-lab>');
  process.exit(1);
}

type Rule = Record<string, any>;
const rules: Rule[] = [];
const ruleDir = join(lab, 'rules');
for (const sub of readdirSync(ruleDir, { recursive: true, withFileTypes: true })) {
  if (!sub.isFile() || !sub.name.endsWith('.yml')) continue;
  const file = join(sub.parentPath, sub.name);
  for (const doc of parseAllDocuments(readFileSync(file, 'utf8'))) {
    rules.push({ ...doc.toJS(), __file: relative(lab, file).replaceAll('\\', '/') });
  }
}

const savedConf = readFileSync(join(lab, 'generated', 'savedsearches.conf'), 'utf8');
const results = readFileSync(join(lab, 'docs', 'test-results.md'), 'utf8');
const pytest = results.match(/\*\*(\d+) passed\*\*/)?.[1];

function stanza(title: string) {
  const start = savedConf.indexOf(`[Sigma - ${title}]`);
  if (start < 0) return null;
  const end = savedConf.indexOf('\n[', start + 1);
  return savedConf.slice(start, end < 0 ? undefined : end);
}

function eventTypes(rule: Rule): string[] {
  if (rule.correlation) return rule.correlation.rules.flatMap((n: string) => eventTypes(rules.find((r) => r.name === n)!));
  const v = rule.detection?.selection?.event_type;
  return v ? [v].flat() : [];
}

const out: Detection[] = rules.map((r) => {
  const tags: string[] = r.tags ?? [];
  const block = stanza(r.title);
  const fixture = results.match(new RegExp(`\\|\\s*\`${r.name}\`\\s*\\|[^\\n]*\\|\\s*(PASS|FAIL)\\s*\\|`))?.[1] ?? null;
  const alertRow = results.match(new RegExp(`\\|\\s*Sigma - ${r.title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\|[^\\n]*\\|\\s*(✔|✘|–)\\s*\\|`))?.[1];
  const realEvent = new RegExp(`\`${r.name}\` ✔`).test(results);
  return {
    id: r.name,
    sigmaId: r.id,
    title: r.title,
    origin: 'imported',
    level: r.level,
    ruleStatus: r.status,
    description: String(r.description ?? '').trim(),
    mitre: tags.filter((t) => /^attack\.t\d{4}/.test(t)).map((t) => t.slice(7).toUpperCase()),
    tactics: tags.filter((t) => /^attack\.[a-z-]+$/.test(t)).map((t) => t.slice(7)),
    logsource: r.logsource ?? null,
    logic: stringify(r.correlation ? { correlation: r.correlation } : { detection: r.detection }).trim(),
    fields: r.fields ?? [],
    falsePositives: r.falsepositives ?? [],
    references: r.references ?? [],
    eventTypes: [...new Set(eventTypes(r))],
    spl: readFileSync(join(lab, 'generated', 'spl', `${r.name}.spl`), 'utf8').trim(),
    savedSearch: block ? `Sigma - ${r.title}` : null,
    scheduled: block ? /enableSched = 1/.test(block) : false,
    tests: {
      unit: pytest ? `pytest: ${pytest} passed (gesamte Suite)` : null,
      liveFixture: fixture as 'PASS' | 'FAIL' | null,
      liveRealEvent: realEvent || null,
      alertFired: alertRow === '✔' ? true : alertRow === '✘' ? false : null,
      source: 'sigma-detection-lab/docs/test-results.md',
    },
    sourceFile: `sigma-detection-lab/${r.__file}`,
  };
});

const target = new URL('../data/sigma-import.json', import.meta.url);
writeFileSync(target, `${JSON.stringify({ importedAt: new Date().toISOString(), source: 'QuitScope/homelab-siem/sigma-detection-lab', detections: out }, null, 2)}\n`);
console.log(`imported ${out.length} rules → ${target.pathname}`);
