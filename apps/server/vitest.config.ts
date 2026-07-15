import { defineWorkersConfig, readD1Migrations } from '@cloudflare/vitest-pool-workers/config';
import { fileURLToPath } from 'node:url';

export default defineWorkersConfig(async () => {
  // Read the D1 migrations so test/apply-migrations.ts can apply them to the
  // miniflare-faked database before any test runs.
  const migrationsPath = fileURLToPath(new URL('./migrations', import.meta.url));
  const migrations = await readD1Migrations(migrationsPath);
  return {
    test: {
      setupFiles: ['./test/apply-migrations.ts'],
      poolOptions: {
        workers: {
          // One workerd process for all test files: parallel runtimes fight
          // over miniflare temp/storage files on Windows (EBUSY → "Isolated
          // storage failed" crashes).
          singleWorker: true,
          wrangler: { configPath: './wrangler.test.toml' },
          miniflare: {
            bindings: { TEST_MIGRATIONS: migrations },
          },
        },
      },
    },
  };
});
