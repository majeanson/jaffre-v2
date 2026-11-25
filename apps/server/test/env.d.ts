// Shared typing for the `cloudflare:test` env (Cloudflare.Env). Lives here,
// not per test file: module files can't augment the global namespace without
// tripping @typescript-eslint/no-namespace.
declare namespace Cloudflare {
  interface Env {
    GAME_ROOM: DurableObjectNamespace;
    LOBBY: DurableObjectNamespace;
    DB: D1Database;
    /** Injected by vitest.config.ts; consumed once by apply-migrations.ts. */
    TEST_MIGRATIONS: import('cloudflare:test').D1Migration[];
  }
}
