// Shared typing for the vitest-pool-workers ProvidedEnv (merged with the
// per-file declarations in the test files).
declare module 'cloudflare:test' {
  interface ProvidedEnv {
    GAME_ROOM: DurableObjectNamespace;
    DB: D1Database;
    /** Injected by vitest.config.ts; consumed once by apply-migrations.ts. */
    TEST_MIGRATIONS: D1Migration[];
  }
}
