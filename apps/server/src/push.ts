/**
 * Web Push from the Worker/DO, no dependencies: VAPID (RFC 8292) auth via an
 * ES256 JWT, payload encryption per RFC 8291 (aes128gcm) — all on WebCrypto,
 * since the node `web-push` package can't run on Workers.
 *
 * OPTIONAL BY DESIGN (same pattern as auth): without the VAPID secrets the
 * /api/push/* endpoints return 503 and the client hides its notifications
 * toggle. Setup:
 *   node apps/server/scripts/gen-vapid.mjs   # prints both keys
 *   wrangler secret put VAPID_PUBLIC_KEY
 *   wrangler secret put VAPID_PRIVATE_KEY
 */

import type { Env } from './env.js';

export interface PushSubscriptionRow {
  endpoint: string;
  p256dh: string;
  auth: string;
}

export function pushEnabled(env: Env): boolean {
  return (
    env.DB !== undefined &&
    typeof env.VAPID_PUBLIC_KEY === 'string' &&
    env.VAPID_PUBLIC_KEY.length > 0 &&
    typeof env.VAPID_PRIVATE_KEY === 'string' &&
    env.VAPID_PRIVATE_KEY.length > 0
  );
}

/* ── base64url ─────────────────────────────────────────────────────────── */

function b64urlDecode(s: string): Uint8Array {
  const pad = '='.repeat((4 - (s.length % 4)) % 4);
  const raw = atob(s.replace(/-/g, '+').replace(/_/g, '/') + pad);
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

function b64urlEncode(bytes: ArrayBuffer | Uint8Array): string {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let raw = '';
  for (const b of arr) raw += String.fromCharCode(b);
  return btoa(raw).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function utf8(s: string): Uint8Array {
  return new TextEncoder().encode(s);
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let off = 0;
  for (const p of parts) {
    out.set(p, off);
    off += p.length;
  }
  return out;
}

/* ── VAPID JWT (ES256) ─────────────────────────────────────────────────── */

async function vapidJwt(env: Env, audience: string): Promise<string> {
  // Private key: base64url of the raw 32-byte scalar `d`; public key:
  // base64url of the uncompressed point (65 bytes) — x/y are its two halves.
  const pub = b64urlDecode(env.VAPID_PUBLIC_KEY as string);
  const key = await crypto.subtle.importKey(
    'jwk',
    {
      kty: 'EC',
      crv: 'P-256',
      d: env.VAPID_PRIVATE_KEY as string,
      x: b64urlEncode(pub.slice(1, 33)),
      y: b64urlEncode(pub.slice(33, 65)),
    },
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign'],
  );
  const header = b64urlEncode(utf8(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const claims = b64urlEncode(
    utf8(
      JSON.stringify({
        aud: audience,
        exp: Math.floor(Date.now() / 1000) + 12 * 3600,
        sub: 'https://jaffre.marcportal.com',
      }),
    ),
  );
  const signingInput = `${header}.${claims}`;
  // WebCrypto ECDSA yields the raw r||s form JWS wants — no DER wrangling.
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, utf8(signingInput));
  return `${signingInput}.${b64urlEncode(sig)}`;
}

/* ── RFC 8291 payload encryption (aes128gcm) ───────────────────────────── */

async function hkdf(
  ikm: Uint8Array,
  salt: Uint8Array,
  info: Uint8Array,
  length: number,
): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', ikm as BufferSource, 'HKDF', false, [
    'deriveBits',
  ]);
  const bits = await crypto.subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt: salt as BufferSource, info: info as BufferSource },
    key,
    length * 8,
  );
  return new Uint8Array(bits);
}

async function encryptPayload(
  plaintext: string,
  p256dh: string,
  auth: string,
): Promise<Uint8Array> {
  const uaPublic = b64urlDecode(p256dh); // 65-byte uncompressed EC point
  const authSecret = b64urlDecode(auth); // 16-byte shared auth secret

  const asKeys = (await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, [
    'deriveBits',
  ])) as CryptoKeyPair;
  const asPublic = new Uint8Array(
    (await crypto.subtle.exportKey('raw', asKeys.publicKey)) as ArrayBuffer,
  );
  const uaKey = await crypto.subtle.importKey(
    'raw',
    uaPublic as BufferSource,
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    [],
  );
  const shared = new Uint8Array(
    await crypto.subtle.deriveBits(
      // workers-types spells the ECDH peer-key field `$public`; the runtime
      // (and every other WebCrypto typing) wants `public` — cast around it.
      { name: 'ECDH', public: uaKey } as unknown as SubtleCryptoDeriveKeyAlgorithm,
      asKeys.privateKey,
      256,
    ),
  );

  // RFC 8291 §3.3–3.4: two HKDF stages, then AES-128-GCM over one record.
  const ikm = await hkdf(
    shared,
    authSecret,
    concat(utf8('WebPush: info\0'), uaPublic, asPublic),
    32,
  );
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(ikm, salt, utf8('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(ikm, salt, utf8('Content-Encoding: nonce\0'), 12);

  const aesKey = await crypto.subtle.importKey('raw', cek as BufferSource, 'AES-GCM', false, [
    'encrypt',
  ]);
  // 0x02 delimiter marks the (only) record as final.
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: nonce as BufferSource },
      aesKey,
      concat(utf8(plaintext), new Uint8Array([2])) as BufferSource,
    ),
  );

  // aes128gcm header: salt(16) | record size(4, BE) | key id length(1) | key
  const header = new Uint8Array(16 + 4 + 1 + asPublic.length);
  header.set(salt, 0);
  new DataView(header.buffer).setUint32(16, 4096);
  header[20] = asPublic.length;
  header.set(asPublic, 21);
  return concat(header, ciphertext);
}

/* ── send ──────────────────────────────────────────────────────────────── */

export interface PushPayload {
  title: string;
  body: string;
  url: string;
  tag?: string;
}

/**
 * POST one encrypted notification to a push service. Returns false when the
 * subscription is dead (404/410) and should be dropped.
 */
async function sendWebPush(
  env: Env,
  sub: PushSubscriptionRow,
  payload: PushPayload,
): Promise<boolean> {
  const jwt = await vapidJwt(env, new URL(sub.endpoint).origin);
  const body = await encryptPayload(JSON.stringify(payload), sub.p256dh, sub.auth);
  const res = await fetch(sub.endpoint, {
    method: 'POST',
    headers: {
      Authorization: `vapid t=${jwt}, k=${env.VAPID_PUBLIC_KEY as string}`,
      'Content-Encoding': 'aes128gcm',
      'Content-Type': 'application/octet-stream',
      // A turn notification is stale within minutes — don't queue it for hours.
      TTL: '600',
      Urgency: 'high',
    },
    body: body as BodyInit,
  });
  if (res.status === 404 || res.status === 410) return false;
  if (!res.ok) console.error('[push] send failed', res.status, await res.text());
  return true;
}

/**
 * Send a notification to every subscription a user has, pruning dead ones.
 * Best-effort: any failure is logged and never breaks the caller.
 */
export async function notifyUser(env: Env, userId: string, payload: PushPayload): Promise<void> {
  if (!pushEnabled(env)) return;
  const db = env.DB as D1Database;
  try {
    const { results } = await db
      .prepare('SELECT endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = ?')
      .bind(userId)
      .all<PushSubscriptionRow>();
    for (const sub of results) {
      const alive = await sendWebPush(env, sub, payload).catch((err) => {
        console.error('[push] send threw', err);
        return true;
      });
      if (!alive) {
        await db
          .prepare('DELETE FROM push_subscriptions WHERE endpoint = ?')
          .bind(sub.endpoint)
          .run();
      }
    }
  } catch (err) {
    console.error('[push] notifyUser failed', err);
  }
}
