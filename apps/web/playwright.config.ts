import { defineConfig, devices } from '@playwright/test';
import { fileURLToPath } from 'node:url';

/**
 * E2E suite: builds the web app, then runs the real stack — the Cloudflare
 * Worker (wrangler dev) serving the built SPA plus the GameRoom Durable
 * Object — on port 8788. Bots act on 700ms server alarms (750ms client-side
 * in practice mode), so a full round takes ~30s: timeouts are generous.
 */
const repoRoot = fileURLToPath(new URL('../..', import.meta.url));

export default defineConfig({
  testDir: './e2e',
  timeout: 120_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env['CI'] === undefined ? 0 : 1,
  reporter: [['list']],
  use: {
    baseURL: 'http://127.0.0.1:8788',
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command:
      'npm run build -w apps/web && npx wrangler dev --config apps/server/wrangler.toml --port 8788',
    cwd: repoRoot,
    url: 'http://127.0.0.1:8788/api/health',
    reuseExistingServer: false,
    timeout: 240_000,
  },
});
