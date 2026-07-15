import { defineConfig, devices } from '@playwright/test';
import { fileURLToPath } from 'node:url';

/**
 * Screenshot gallery: captures every notable table state across viewports and
 * skins into apps/web/shots-output/, then builds a contact-sheet index.html.
 * Purely for human eyes — no pixel assertions, layout problems are reported as
 * warnings in shots-output/report.txt. Run with `npm run shots` (never part of
 * the normal e2e suite: separate testDir).
 */
const repoRoot = fileURLToPath(new URL('../..', import.meta.url));

export default defineConfig({
  testDir: './e2e-shots',
  globalSetup: './e2e-shots/global-setup.ts',
  globalTeardown: './e2e-shots/global-teardown.ts',
  timeout: 240_000,
  expect: { timeout: 30_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
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
