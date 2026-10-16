import { createCribl } from './adapters/cribl.js';
import { createSplunk } from './adapters/splunk.js';
import { buildApp } from './app.js';
import { loadConfig } from './config.js';
import { openDb } from './db.js';
import { seedDemo } from './simulated.js';
import { syncFiredAlerts } from './sync.js';

const config = loadConfig();
const db = openDb(config.DB_PATH);
const splunk =
  config.splunkUrl && config.SPLUNK_PASSWORD
    ? createSplunk({ url: config.splunkUrl, user: config.SPLUNK_USER, password: config.SPLUNK_PASSWORD, verifyTls: config.SPLUNK_VERIFY_TLS, timeoutMs: config.HTTP_TIMEOUT_MS })
    : null;
const cribl =
  config.criblUrl && config.CRIBL_PASSWORD
    ? createCribl({ url: config.criblUrl, user: config.CRIBL_USER, password: config.CRIBL_PASSWORD, timeoutMs: config.HTTP_TIMEOUT_MS })
    : null;

const { app, repo } = buildApp({ config, db, splunk, cribl });
if (config.SEED_DEMO) seedDemo(repo);

if (splunk && config.INCIDENT_SYNC_INTERVAL_SEC > 0) {
  const run = () =>
    syncFiredAlerts(splunk, repo)
      .then((r) => r.created && app.log.info(r, 'incident sync'))
      .catch((err) => app.log.warn({ err: err.message }, 'incident sync failed'));
  run();
  setInterval(run, config.INCIDENT_SYNC_INTERVAL_SEC * 1000).unref();
}

await app.listen({ port: config.PORT, host: config.HOST });

for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => app.close().then(() => (db.close(), process.exit(0))));
