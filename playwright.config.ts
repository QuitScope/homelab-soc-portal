import { randomBytes, scryptSync } from 'node:crypto';
import { defineConfig, devices } from '@playwright/test';

// Local run: builds nothing, starts the API (serving web/dist) with a fresh SQLite file, simulated demo
// incidents and a throw-away test password. Remote run: E2E_BASE_URL + E2E_PASSWORD, no web server.
const remote = process.env.E2E_BASE_URL;
export const E2E_PASSWORD = process.env.E2E_PASSWORD ?? 'e2e-only-test-password';
const salt = randomBytes(16);
const hash = `scrypt:${salt.toString('base64')}:${scryptSync(E2E_PASSWORD, salt, 64).toString('base64')}`;
const port = 8181;

export default defineConfig({
  testDir: 'e2e',
  timeout: 30_000,
  retries: 0,
  reporter: [['list']],
  use: { baseURL: remote ?? `http://127.0.0.1:${port}`, trace: 'retain-on-failure', ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
  webServer: remote
    ? undefined
    : {
        command: `node -e "require('fs').rmSync('server/data/e2e.sqlite',{force:true})" && npm run start -w server`,
        url: `http://127.0.0.1:${port}/api/health`,
        reuseExistingServer: false,
        timeout: 30_000,
        env: {
          PORT: String(port),
          HOST: '127.0.0.1',
          DB_PATH: './data/e2e.sqlite',
          WEB_DIST: '../web/dist',
          SESSION_SECRET: randomBytes(32).toString('hex'),
          ADMIN_USER: 'admin',
          ADMIN_PASSWORD_HASH: hash,
          SEED_DEMO: 'true',
          INCIDENT_SYNC_INTERVAL_SEC: '0',
        },
      },
});
