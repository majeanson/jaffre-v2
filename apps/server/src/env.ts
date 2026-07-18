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
  /**
   * Resend API key for email login codes (wrangler secret). OPTIONAL: unset →
   * /api/auth/email/* return 503 and the client hides the email option. The
   * marcportal Resend account/key works as-is (from-domain marcportal.com is
   * already verified there): `wrangler secret put RESEND_API_KEY`.
   */
  RESEND_API_KEY?: string;
  /**
   * Google OAuth web client (wrangler secrets). OPTIONAL: unset → the
   * /api/auth/google routes return 503 and the client hides the Google
   * button. Create at console.cloud.google.com → Credentials → OAuth client
   * (Web), authorized redirect URI:
   *   https://jaffre.marcportal.com/api/auth/google/callback
   */
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  /**
   * Cloudflare Realtime TURN key (wrangler secrets). Optional: without them
   * /api/ice returns STUN only and voice works for most-but-not-all NATs.
   * Create a key at dash.cloudflare.com → Realtime → TURN, then:
   *   wrangler secret put TURN_KEY_ID
   *   wrangler secret put TURN_KEY_API_TOKEN
   */
  TURN_KEY_ID?: string;
  TURN_KEY_API_TOKEN?: string;
  /**
   * Web Push VAPID keypair (wrangler secrets). OPTIONAL: unset → /api/push/*
   * return 503 and the client hides the notifications toggle. Public key is
   * the base64url uncompressed P-256 point, private key the base64url 32-byte
   * scalar — generate both with `node apps/server/scripts/gen-vapid.mjs`, then:
   *   wrangler secret put VAPID_PUBLIC_KEY
   *   wrangler secret put VAPID_PRIVATE_KEY
   */
  VAPID_PUBLIC_KEY?: string;
  VAPID_PRIVATE_KEY?: string;
}
