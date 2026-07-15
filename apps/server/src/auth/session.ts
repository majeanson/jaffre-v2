/**
 * Stateless HMAC-SHA-256 session tokens (WebCrypto only — runs in Workers and
 * in vitest-pool-workers). Format: base64url(payload).base64url(signature),
 * payload = JSON `{ uid, name, exp }` with `exp` in epoch milliseconds.
 *
 * Pure functions of (payload|token, secret) — no env access — so they are
 * unit-testable and the header path and any future query-param path verify a
 * token identically.
 */

export interface SessionPayload {
  readonly uid: string;
  readonly name: string;
  /** Expiry, epoch milliseconds. */
  readonly exp: number;
}

export interface SessionIdentity {
  readonly uid: string;
  readonly name: string;
}

/**
 * Minimum secret length. Without this guard,
 * `new TextEncoder().encode(undefined as never)` would yield the bytes of the
 * literal string "undefined" — a publicly-known HMAC key that silently makes
 * every token forgeable. Callers must check availability BEFORE minting.
 */
const MIN_SECRET_LENGTH = 32;

function b64urlEncode(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64urlDecode(s: string): Uint8Array {
  const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4));
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/') + pad);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function hmac(secret: string, message: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message));
  return new Uint8Array(sig);
}

/** Constant-time compare so a forged signature can't be guessed byte-by-byte. */
function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
  return diff === 0;
}

/** True when `secret` is usable as an HMAC key (present and long enough). */
export function isUsableSecret(secret: string | undefined): secret is string {
  return typeof secret === 'string' && secret.length >= MIN_SECRET_LENGTH;
}

export async function mintToken(payload: SessionPayload, secret: string): Promise<string> {
  if (!isUsableSecret(secret)) {
    throw new Error(`SESSION_SECRET missing or < ${String(MIN_SECRET_LENGTH)} chars`);
  }
  const body = b64urlEncode(new TextEncoder().encode(JSON.stringify(payload)));
  const sig = b64urlEncode(await hmac(secret, body));
  return `${body}.${sig}`;
}

/**
 * Verify signature + expiry. A malformed token (bad base64, non-JSON payload,
 * wrong shape) resolves to null, never throws — this runs on the Worker
 * dispatch path for every request that carries a token.
 */
export async function verifyToken(token: string, secret: string): Promise<SessionIdentity | null> {
  if (!isUsableSecret(secret)) return null;
  const dot = token.indexOf('.');
  if (dot < 0) return null;
  const body = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  try {
    const expected = await hmac(secret, body);
    if (!timingSafeEqual(b64urlDecode(sig), expected)) return null;
    const payload = JSON.parse(new TextDecoder().decode(b64urlDecode(body))) as Partial<
      Record<keyof SessionPayload, unknown>
    >;
    if (typeof payload.uid !== 'string' || typeof payload.name !== 'string') return null;
    if (typeof payload.exp !== 'number' || payload.exp < Date.now()) return null;
    return { uid: payload.uid, name: payload.name };
  } catch {
    return null;
  }
}
