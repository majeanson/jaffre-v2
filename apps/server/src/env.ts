/** Worker/DO environment. Lives in its own module so both index.ts and
 * GameRoom.ts can import it without a cycle. */
export interface Env {
  ASSETS: Fetcher;
  GAME_ROOM: DurableObjectNamespace;
  /**
   * D1 (games history). Optional: the vitest env or a fresh local dev setup
   * may run without it — every read/write path must guard
   * `env.DB === undefined` and degrade to "no history".
   */
  DB?: D1Database;
  /**
   * HMAC key for guest session tokens (wrangler secret; `.dev.vars` locally).
   * OPTIONAL BY DESIGN — when unset:
   *   - /api/auth/* endpoints return 503, and
   *   - the WebSocket path falls back to the plain `?u=&n=` query-param
   *     identity (so local dev and the existing tests keep working without a
   *     secret).
   * When set (>= 32 chars), the WS path requires a valid `?t=<token>` and the
   * plain mode is disabled.
   */
  SESSION_SECRET?: string;
}
