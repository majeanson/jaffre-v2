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
    // Entrance animations (rise-in/pop-in) are gated on no-preference, so this
    // renders them at their final state instantly. Without it, axe can read an
    // element mid-fade at partial opacity and flag a false contrast failure
    // (deterministic on CI's timing, invisible locally).
    reducedMotion: 'reduce',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    // The identity stack (guest tokens, 3-word recovery, history/stats) needs
    // a SESSION_SECRET and the D1 tables. `--var` injects a dummy dev-only
    // secret (≥32 chars — see isUsableSecret) and the migrations are applied
    // to wrangler's local D1 store first, so /api/auth/* and /api/history,
    // /api/stats run for real in e2e instead of returning 503.
    command:
      'npm run build -w apps/web && npx wrangler d1 migrations apply jaffre --local --config apps/server/wrangler.toml && npx wrangler dev --config apps/server/wrangler.toml --port 8788 --var SESSION_SECRET:jaffre-e2e-only-dummy-secret-0123456789abcdef',
    cwd: repoRoot,
    url: 'http://127.0.0.1:8788/api/health',
    reuseExistingServer: false,
    timeout: 240_000,
  },
});
