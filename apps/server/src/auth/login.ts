/**
 * Real login on top of the guest identity: email one-time codes (Resend) and
 * Google OAuth. Both paths end the same way — resolve a `users.id`, then the
 * caller mints the SAME stateless session token guests use. Patterns mirror
 * marcportal's magic-link auth (hash-at-rest, TTL, per-email/per-IP rate
 * limits) adapted to a typed 6-digit code: a clickable link would open in the
 * email app's in-app browser, whose localStorage is NOT the game's browser.
 */

export const LOGIN_CODE_TTL_MS = 10 * 60 * 1000; // 10 min to type 6 digits
export const LOGIN_CODE_MAX_ATTEMPTS = 5; // then the code is dead
export const LOGIN_START_PER_EMAIL_HOUR = 5;
export const LOGIN_START_PER_IP_HOUR = 20;
const GOOGLE_STATE_TTL_MS = 10 * 60 * 1000;

/** Resend, raw fetch — same endpoint + auth marcportal uses (no SDK). The
 * from-domain is marcportal.com, already verified on Resend, so jaffre sends
 * with the same API key and zero new DNS. */
const RESEND_URL = 'https://api.resend.com/emails';
export const EMAIL_FROM = 'Jaffre <noreply@marcportal.com>';

function b64url(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function sha256B64url(message: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(message));
  return b64url(new Uint8Array(digest));
}

/** 6 random digits from WebCrypto (rejection-sampled, no modulo bias). */
export function generateLoginCode(): string {
  const buf = new Uint32Array(1);
  for (;;) {
    crypto.getRandomValues(buf);
    const v = buf[0] ?? 0;
    if (v < 4_000_000_000) return String(v % 1_000_000).padStart(6, '0');
  }
}

/** Hash bound to the email so a code can never be replayed cross-address. */
export function hashLoginCode(email: string, code: string): Promise<string> {
  return sha256B64url(`${email.toLowerCase()}:${code}`);
}

/** Loose-but-useful email shape check (marcportal's isPlausibleEmail). */
export function isPlausibleEmail(s: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s) && s.length <= 254;
}

/** Send the one-time code. Bilingual body — the game itself is en/fr. Returns
 * false (never throws) on failure so the endpoint can degrade gracefully. */
export async function sendLoginCode(apiKey: string, email: string, code: string): Promise<boolean> {
  const text = [
    `Ton code Jaffre : ${code}`,
    `Your Jaffre code: ${code}`,
    '',
    'Entre ce code dans le jeu pour lier ton compte. Il expire dans 10 minutes.',
    'Enter this code in the game to link your account. It expires in 10 minutes.',
  ].join('\n');
  try {
    const res = await fetch(RESEND_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        from: EMAIL_FROM,
        to: [email],
        subject: `${code} — ton code Jaffre / your Jaffre code`,
        text,
      }),
    });
    if (!res.ok) console.error('[login] resend send failed', res.status, await res.text());
    return res.ok;
  } catch (err) {
    console.error('[login] resend send threw', err);
    return false;
  }
}

/* ── Google OAuth ──────────────────────────────────────────────────────── */

export interface GoogleStatePayload {
  /** Guest uid to LINK the Google identity to (empty = plain sign-in). */
  readonly linkUid: string;
  readonly exp: number;
}

async function hmacB64url(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message));
  return b64url(new Uint8Array(sig));
}

/** CSRF state for the OAuth round-trip: HMAC-signed, self-validating, 10 min. */
export async function signGoogleState(linkUid: string, secret: string): Promise<string> {
  const body = b64url(
    new TextEncoder().encode(
      JSON.stringify({
        linkUid,
        exp: Date.now() + GOOGLE_STATE_TTL_MS,
      } satisfies GoogleStatePayload),
    ),
  );
  return `${body}.${await hmacB64url(secret, body)}`;
}

export async function verifyGoogleState(
  state: string,
  secret: string,
): Promise<GoogleStatePayload | null> {
  const dot = state.indexOf('.');
  if (dot < 0) return null;
  const body = state.slice(0, dot);
  if ((await hmacB64url(secret, body)) !== state.slice(dot + 1)) return null;
  try {
    const pad = body.length % 4 === 0 ? '' : '='.repeat(4 - (body.length % 4));
    const json = atob(body.replace(/-/g, '+').replace(/_/g, '/') + pad);
    const payload = JSON.parse(json) as Partial<Record<keyof GoogleStatePayload, unknown>>;
    if (typeof payload.linkUid !== 'string') return null;
    if (typeof payload.exp !== 'number' || payload.exp < Date.now()) return null;
    return { linkUid: payload.linkUid, exp: payload.exp };
  } catch {
    return null;
  }
}

export interface GoogleUser {
  readonly sub: string;
  readonly email: string | null;
  readonly name: string | null;
}

/**
 * Exchange the OAuth `code` for Google's id_token and read the identity out
 * of it. The id_token arrives server-to-server over TLS straight from
 * Google's token endpoint, so decoding without a JWKS round-trip is sound —
 * we still validate the audience and expiry. Null on any failure.
 */
export async function exchangeGoogleCode(
  code: string,
  clientId: string,
  clientSecret: string,
  redirectUri: string,
): Promise<GoogleUser | null> {
  try {
    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }),
    });
    if (!res.ok) {
      console.error('[login] google token exchange failed', res.status, await res.text());
      return null;
    }
    const data = (await res.json()) as { id_token?: string };
    if (typeof data.id_token !== 'string') return null;
    const parts = data.id_token.split('.');
    const body = parts[1];
    if (body === undefined) return null;
    const pad = body.length % 4 === 0 ? '' : '='.repeat(4 - (body.length % 4));
    const claims = JSON.parse(atob(body.replace(/-/g, '+').replace(/_/g, '/') + pad)) as {
      sub?: unknown;
      email?: unknown;
      name?: unknown;
      aud?: unknown;
      exp?: unknown;
    };
    if (typeof claims.sub !== 'string' || claims.sub === '') return null;
    if (claims.aud !== clientId) return null;
    if (typeof claims.exp !== 'number' || claims.exp * 1000 < Date.now()) return null;
    return {
      sub: claims.sub,
      email: typeof claims.email === 'string' ? claims.email : null,
      name: typeof claims.name === 'string' ? claims.name : null,
    };
  } catch (err) {
    console.error('[login] google exchange threw', err);
    return null;
  }
}
