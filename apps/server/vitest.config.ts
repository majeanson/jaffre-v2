import { cloudflareTest, readD1Migrations } from '@cloudflare/vitest-plugin';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [
    cloudflareTest(async () => {
      // Read the D1 migrations so test/apply-migrations.ts can apply them to the
      // miniflare-faked database before any test runs.
      // (A string join, not `new URL(...)`: this tsconfig also loads
      // workers-types, whose global URL clashes with node:url's.)
      const migrationsPath = join(dirname(fileURLToPath(import.meta.url)), 'migrations');
      const migrations = await readD1Migrations(migrationsPath);
      return {
        wrangler: { configPath: './wrangler.test.toml' },
        miniflare: {
          bindings: { TEST_MIGRATIONS: migrations },
        },
      };
    }),
  ],
  test: {
    setupFiles: ['./test/apply-migrations.ts'],
    // One workerd runtime at a time (the old `singleWorker`): parallel
    // runtimes fight over miniflare temp/storage files on Windows (EBUSY →
    // "Isolated storage failed" crashes).
    maxWorkers: 1,
  },
});
