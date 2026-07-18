import type { RoundSummary } from '@jaffre/engine';
import { GameRoom } from './GameRoom.js';
import { generateRecoveryCode, hashRecoveryCode } from './auth/recovery.js';
import {
  LOGIN_CODE_MAX_ATTEMPTS,
  LOGIN_CODE_TTL_MS,
  LOGIN_START_PER_EMAIL_HOUR,
  LOGIN_START_PER_IP_HOUR,
  exchangeGoogleCode,
  generateLoginCode,
  hashLoginCode,
  isPlausibleEmail,
  sendLoginCode,
  signGoogleState,
  verifyGoogleState,
} from './auth/login.js';
import { isUsableSecret, mintToken, verifyToken } from './auth/session.js';
import type { Env } from './env.js';
import { pushEnabled } from './push.js';

export { GameRoom };
export type { Env };

const SESSION_TTL_MS = 90 * 24 * 60 * 60 * 1000; // 90 days

/** `Authorization: Bearer <token>` → token, or null. */
function bearerToken(request: Request): string | null {
  const header = request.headers.get('Authorization');
  if (header === null || !header.startsWith('Bearer ')) return null;
  const token = header.slice('Bearer '.length).trim();
  return token === '' ? null : token;
}

function noSecret(): Response {
  return Response.json({ error: 'Auth is not configured (SESSION_SECRET unset)' }, { status: 503 });
}

function noDb(): Response {
  return Response.json({ error: 'History is not configured (no D1 binding)' }, { status: 503 });
}

interface Profile {
  readonly color: string | null;
  readonly paint: string | null;
  readonly cardSkin: string | null;
  readonly theme: string | null;
}

const NO_PROFILE: Profile = { color: null, paint: null, cardSkin: null, theme: null };

/** The player's cosmetics (colour, painted card, card skin, theme), or nulls
 * when unset / no DB. Best-effort: a read failure degrades to "no profile",
 * never throws. */
async function readProfile(env: Env, uid: string): Promise<Profile> {
  if (env.DB === undefined) return NO_PROFILE;
  try {
    const row = await env.DB.prepare(
      'SELECT color, paint, card_skin, theme FROM users WHERE id = ?1',
    )
      .bind(uid)
      .first<{
        color: string | null;
        paint: string | null;
        card_skin: string | null;
        theme: string | null;
      }>();
    return {
      color: row?.color ?? null,
      paint: row?.paint ?? null,
      cardSkin: row?.card_skin ?? null,
      theme: row?.theme ?? null,
    };
  } catch (err) {
    console.error('[users] profile read failed', err);
    return NO_PROFILE;
  }
}

/**
 * POST /api/auth/guest {name} → {userId, name, token, exp, recoveryCode?}.
 * Anonymous-first: no password, just a minted identity the client stores
 * locally. The server token `uid` is the ONE canonical player id:
 *   - Called WITH a valid Bearer token: re-mints a token for the SAME uid
 *     (a name change is a rename, not a new identity).
 *   - Called without one: mints a brand-new uid and a 3-word recovery code
 *     (hash persisted, plaintext returned exactly this once).
 */
async function handleGuestAuth(request: Request, env: Env): Promise<Response> {
  if (!isUsableSecret(env.SESSION_SECRET)) return noSecret();
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Expected a JSON body' }, { status: 400 });
  }
  const name =
    typeof body === 'object' && body !== null && 'name' in body
      ? (body as { name: unknown }).name
      : null;
  if (typeof name !== 'string' || name.trim().length < 1 || name.trim().length > 20) {
    return Response.json({ error: 'name must be 1-20 characters' }, { status: 400 });
  }
  const trimmed = name.trim();

  const existingToken = bearerToken(request);
  const identity =
    existingToken !== null ? await verifyToken(existingToken, env.SESSION_SECRET) : null;
  if (identity !== null) {
    // Rename-in-place: same uid, fresh token. Best-effort — the row may not
    // exist (e.g. D1 was down at first mint), and that must not block play.
    if (env.DB !== undefined) {
      try {
        await env.DB.prepare('UPDATE users SET name = ?1 WHERE id = ?2')
          .bind(trimmed, identity.uid)
          .run();
      } catch (err) {
        console.error('users rename failed', err);
      }
    }
    const exp = Date.now() + SESSION_TTL_MS;
    const token = await mintToken({ uid: identity.uid, name: trimmed, exp }, env.SESSION_SECRET);
    const profile = await readProfile(env, identity.uid);
    return Response.json({ userId: identity.uid, name: trimmed, token, exp, ...profile });
  }

  const userId = crypto.randomUUID();
  const recoveryCode = generateRecoveryCode();
  const recoveryHash = await hashRecoveryCode(recoveryCode);
  // The users row is best-effort: identity is carried by the signed token, so
  // a missing/failed D1 write must not block the guest from playing — but it
  // does mean the recovery code would be useless (nothing to look it up
  // against), so it's only handed back when the insert actually landed.
  let dbOk = false;
  if (env.DB !== undefined) {
    try {
      await env.DB.prepare(
        'INSERT INTO users (id, name, recovery_hash, created_at) VALUES (?1, ?2, ?3, ?4)',
      )
        .bind(userId, trimmed, recoveryHash, Date.now())
        .run();
      dbOk = true;
    } catch (err) {
      console.error('[users] insert failed', err);
    }
  }
  const exp = Date.now() + SESSION_TTL_MS;
  const token = await mintToken({ uid: userId, name: trimmed, exp }, env.SESSION_SECRET);
  return Response.json({
    userId,
    name: trimmed,
    token,
    exp,
    // A brand-new user has no colour/paint yet — echo the nulls so the client
    // response shape is identical across mint / re-mint / recover / me.
    ...NO_PROFILE,
    ...(dbOk ? { recoveryCode } : {}),
  });
}

/**
 * POST /api/auth/recover {code, name?} → same shape as guest (minus
 * recoveryCode) for the uid whose recovery hash matches. 404 on miss.
 */
async function handleRecover(request: Request, env: Env): Promise<Response> {
  if (!isUsableSecret(env.SESSION_SECRET)) return noSecret();
  if (env.DB === undefined) return noDb();
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Expected a JSON body' }, { status: 400 });
  }
  const code =
    typeof body === 'object' && body !== null && 'code' in body
      ? (body as { code: unknown }).code
      : null;
  if (typeof code !== 'string' || code.length < 1 || code.length > 64) {
    return Response.json({ error: 'code must be 1-64 characters' }, { status: 400 });
  }
  const rawName =
    typeof body === 'object' && body !== null && 'name' in body
      ? (body as { name: unknown }).name
      : null;
  const name =
    typeof rawName === 'string' && rawName.trim().length >= 1 && rawName.trim().length <= 20
      ? rawName.trim()
      : null;

  const hash = await hashRecoveryCode(code);
  const row = await env.DB.prepare('SELECT id, name FROM users WHERE recovery_hash = ?1')
    .bind(hash)
    .first<{ id: string; name: string }>();
  if (row === null) return Response.json({ error: 'Unknown recovery code' }, { status: 404 });

  const finalName = name ?? row.name;
  if (name !== null) {
    try {
      await env.DB.prepare('UPDATE users SET name = ?1 WHERE id = ?2')
        .bind(finalName, row.id)
        .run();
    } catch (err) {
      console.error('users recover-rename failed', err);
    }
  }
  const exp = Date.now() + SESSION_TTL_MS;
  const token = await mintToken({ uid: row.id, name: finalName, exp }, env.SESSION_SECRET);
  const profile = await readProfile(env, row.id);
  return Response.json({ userId: row.id, name: finalName, token, exp, ...profile });
}

/** Which login methods (beyond guest) this deployment can offer — lets the
 * client show only buttons that will actually work. */
function handleAuthMethods(env: Env): Response {
  return Response.json({
    email:
      isUsableSecret(env.SESSION_SECRET) &&
      env.DB !== undefined &&
      env.RESEND_API_KEY !== undefined,
    google:
      isUsableSecret(env.SESSION_SECRET) &&
      env.DB !== undefined &&
      env.GOOGLE_CLIENT_ID !== undefined &&
      env.GOOGLE_CLIENT_SECRET !== undefined,
  });
}

/** The account links (email / google) on a user row, for /me. Best-effort. */
async function readLinks(
  env: Env,
  uid: string,
): Promise<{ email: string | null; google: boolean }> {
  if (env.DB === undefined) return { email: null, google: false };
  try {
    const row = await env.DB.prepare('SELECT email, google_sub FROM users WHERE id = ?1')
      .bind(uid)
      .first<{ email: string | null; google_sub: string | null }>();
    return { email: row?.email ?? null, google: (row?.google_sub ?? null) !== null };
  } catch (err) {
    console.error('[users] links read failed', err);
    return { email: null, google: false };
  }
}

/** GET /api/auth/me — validates the Bearer token, echoes the identity (with
 * the player's colour + painted card + account links when a DB is bound). */
async function handleAuthMe(request: Request, env: Env): Promise<Response> {
  if (!isUsableSecret(env.SESSION_SECRET)) return noSecret();
  const token = bearerToken(request);
  if (token === null) return Response.json({ error: 'Missing bearer token' }, { status: 401 });
  const identity = await verifyToken(token, env.SESSION_SECRET);
  if (identity === null) {
    return Response.json({ error: 'Invalid or expired token' }, { status: 401 });
  }
  const profile = await readProfile(env, identity.uid);
  const links = await readLinks(env, identity.uid);
  return Response.json({ userId: identity.uid, name: identity.name, ...profile, links });
}

/** Resolve the signed-in player for a login endpoint: the response mirrors
 * /api/auth/guest so the client stores every mint identically. */
async function loginResponse(env: Env, uid: string, name: string): Promise<Response> {
  const exp = Date.now() + SESSION_TTL_MS;
  const token = await mintToken({ uid, name, exp }, env.SESSION_SECRET as string);
  const profile = await readProfile(env, uid);
  const links = await readLinks(env, uid);
  return Response.json({ userId: uid, name, token, exp, ...profile, links });
}

/** Trimmed 1-20 char name from an unknown value, or null. */
function readName(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length >= 1 && value.trim().length <= 20
    ? value.trim()
    : null;
}

/**
 * POST /api/auth/email/start {email} → {sent:true}. Mints a 6-digit one-time
 * code (hash-at-rest, 10 min TTL) and emails it via Resend. Always answers
 * {sent:true} on a plausible address — no account enumeration. Rate-limited
 * from the login_codes table itself: 5/hour per email, 20/hour per IP.
 */
async function handleEmailStart(request: Request, env: Env): Promise<Response> {
  if (!isUsableSecret(env.SESSION_SECRET)) return noSecret();
  if (env.DB === undefined) return noDb();
  if (env.RESEND_API_KEY === undefined) {
    return Response.json({ error: 'Email login is not configured' }, { status: 503 });
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Expected a JSON body' }, { status: 400 });
  }
  const rawEmail =
    typeof body === 'object' && body !== null && 'email' in body
      ? (body as { email: unknown }).email
      : null;
  if (typeof rawEmail !== 'string' || !isPlausibleEmail(rawEmail.trim())) {
    return Response.json({ error: 'A valid email is required' }, { status: 400 });
  }
  const email = rawEmail.trim().toLowerCase();
  const ip = request.headers.get('CF-Connecting-IP') ?? 'unknown';
  const hourAgo = Date.now() - 60 * 60 * 1000;

  try {
    const byEmail = await env.DB.prepare(
      'SELECT COUNT(*) AS n FROM login_codes WHERE email = ?1 AND created_at > ?2',
    )
      .bind(email, hourAgo)
      .first<{ n: number }>();
    const byIp = await env.DB.prepare(
      'SELECT COUNT(*) AS n FROM login_codes WHERE ip = ?1 AND created_at > ?2',
    )
      .bind(ip, hourAgo)
      .first<{ n: number }>();
    if (
      (byEmail?.n ?? 0) >= LOGIN_START_PER_EMAIL_HOUR ||
      (byIp?.n ?? 0) >= LOGIN_START_PER_IP_HOUR
    ) {
      return Response.json(
        { error: 'Too many codes requested — try again later' },
        { status: 429 },
      );
    }

    const code = generateLoginCode();
    const now = Date.now();
    await env.DB.prepare(
      'INSERT INTO login_codes (id, email, code_hash, created_at, expires_at, ip) VALUES (?1, ?2, ?3, ?4, ?5, ?6)',
    )
      .bind(
        crypto.randomUUID(),
        email,
        await hashLoginCode(email, code),
        now,
        now + LOGIN_CODE_TTL_MS,
        ip,
      )
      .run();

    const sent = await sendLoginCode(env.RESEND_API_KEY, email, code);
    if (!sent)
      return Response.json({ error: 'Could not send the code — try again' }, { status: 502 });
    return Response.json({ sent: true });
  } catch (err) {
    console.error('[login] email start failed', err);
    return Response.json({ error: 'Could not send the code — try again' }, { status: 500 });
  }
}

/**
 * POST /api/auth/email/verify {email, code, name?} (+ optional Bearer) →
 * guest-shaped mint for the account behind the email.
 *   - Email already linked to a user → sign in as that user.
 *   - Unlinked + valid Bearer guest → LINK the email to that guest (progress
 *     carries over — the whole point).
 *   - Unlinked + no Bearer → brand-new user.
 * Codes are single-use and die after LOGIN_CODE_MAX_ATTEMPTS wrong tries.
 */
async function handleEmailVerify(request: Request, env: Env): Promise<Response> {
  if (!isUsableSecret(env.SESSION_SECRET)) return noSecret();
  if (env.DB === undefined) return noDb();
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Expected a JSON body' }, { status: 400 });
  }
  const b = typeof body === 'object' && body !== null ? (body as Record<string, unknown>) : {};
  const rawEmail = typeof b['email'] === 'string' ? b['email'].trim().toLowerCase() : '';
  const code = typeof b['code'] === 'string' ? b['code'].trim() : '';
  if (!isPlausibleEmail(rawEmail) || !/^\d{6}$/.test(code)) {
    return Response.json({ error: 'Email and 6-digit code are required' }, { status: 400 });
  }

  try {
    const now = Date.now();
    const row = await env.DB.prepare(
      'SELECT id, code_hash, attempts FROM login_codes WHERE email = ?1 AND used_at IS NULL AND expires_at > ?2 ORDER BY created_at DESC LIMIT 1',
    )
      .bind(rawEmail, now)
      .first<{ id: string; code_hash: string; attempts: number }>();
    if (row === null || row.attempts >= LOGIN_CODE_MAX_ATTEMPTS) {
      return Response.json({ error: 'Code expired — request a new one' }, { status: 404 });
    }
    if ((await hashLoginCode(rawEmail, code)) !== row.code_hash) {
      await env.DB.prepare('UPDATE login_codes SET attempts = attempts + 1 WHERE id = ?1')
        .bind(row.id)
        .run();
      return Response.json({ error: 'Wrong code — check the digits' }, { status: 401 });
    }
    await env.DB.prepare('UPDATE login_codes SET used_at = ?1 WHERE id = ?2')
      .bind(now, row.id)
      .run();

    // Resolve the account. Existing link wins; else link the current guest;
    // else mint a brand-new user for this address.
    const existing = await env.DB.prepare('SELECT id, name FROM users WHERE email = ?1')
      .bind(rawEmail)
      .first<{ id: string; name: string }>();
    if (existing !== null) return loginResponse(env, existing.id, existing.name);

    const token = bearerToken(request);
    const identity = token !== null ? await verifyToken(token, env.SESSION_SECRET) : null;
    if (identity !== null) {
      await env.DB.prepare('UPDATE users SET email = ?1 WHERE id = ?2 AND email IS NULL')
        .bind(rawEmail, identity.uid)
        .run();
      return loginResponse(env, identity.uid, identity.name);
    }

    const userId = crypto.randomUUID();
    const name = readName(b['name']) ?? rawEmail.split('@')[0]?.slice(0, 20) ?? 'Player';
    await env.DB.prepare('INSERT INTO users (id, name, email, created_at) VALUES (?1, ?2, ?3, ?4)')
      .bind(userId, name, rawEmail, now)
      .run();
    return loginResponse(env, userId, name);
  } catch (err) {
    console.error('[login] email verify failed', err);
    return Response.json({ error: 'Sign-in failed — try again' }, { status: 500 });
  }
}

/**
 * GET /api/auth/google[?link=<current token>] → 302 to Google's consent page.
 * The signed state carries the guest uid to link (CSRF-safe, 10 min).
 */
async function handleGoogleStart(request: Request, env: Env): Promise<Response> {
  if (!isUsableSecret(env.SESSION_SECRET)) return noSecret();
  if (env.GOOGLE_CLIENT_ID === undefined || env.GOOGLE_CLIENT_SECRET === undefined) {
    return Response.json({ error: 'Google login is not configured' }, { status: 503 });
  }
  const url = new URL(request.url);
  const link = url.searchParams.get('link');
  const identity = link !== null ? await verifyToken(link, env.SESSION_SECRET) : null;
  const state = await signGoogleState(identity?.uid ?? '', env.SESSION_SECRET);
  const redirect = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  redirect.searchParams.set('client_id', env.GOOGLE_CLIENT_ID);
  redirect.searchParams.set('redirect_uri', `${url.origin}/api/auth/google/callback`);
  redirect.searchParams.set('response_type', 'code');
  redirect.searchParams.set('scope', 'openid email profile');
  redirect.searchParams.set('state', state);
  return Response.redirect(redirect.toString(), 302);
}

/**
 * GET /api/auth/google/callback?code&state → link-or-create, then bounce back
 * into the app with the fresh token in the URL fragment (#login=…): fragments
 * never hit the server or logs, and the client stores + strips it on boot.
 */
async function handleGoogleCallback(request: Request, env: Env): Promise<Response> {
  if (!isUsableSecret(env.SESSION_SECRET)) return noSecret();
  if (env.DB === undefined) return noDb();
  if (env.GOOGLE_CLIENT_ID === undefined || env.GOOGLE_CLIENT_SECRET === undefined) {
    return Response.json({ error: 'Google login is not configured' }, { status: 503 });
  }
  const url = new URL(request.url);
  const back = (reason: string) => Response.redirect(`${url.origin}/#login-error=${reason}`, 302);

  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  if (code === null || state === null) return back('missing');
  const statePayload = await verifyGoogleState(state, env.SESSION_SECRET);
  if (statePayload === null) return back('state');

  const gUser = await exchangeGoogleCode(
    code,
    env.GOOGLE_CLIENT_ID,
    env.GOOGLE_CLIENT_SECRET,
    `${url.origin}/api/auth/google/callback`,
  );
  if (gUser === null) return back('google');

  try {
    let uid: string;
    let name: string;
    const existing = await env.DB.prepare('SELECT id, name FROM users WHERE google_sub = ?1')
      .bind(gUser.sub)
      .first<{ id: string; name: string }>();
    if (existing !== null) {
      ({ id: uid, name } = existing);
    } else if (statePayload.linkUid !== '') {
      // Link Google to the signed-in guest — their games carry over.
      await env.DB.prepare('UPDATE users SET google_sub = ?1 WHERE id = ?2 AND google_sub IS NULL')
        .bind(gUser.sub, statePayload.linkUid)
        .run();
      const linked = await env.DB.prepare('SELECT id, name FROM users WHERE id = ?1')
        .bind(statePayload.linkUid)
        .first<{ id: string; name: string }>();
      if (linked === null) return back('google');
      ({ id: uid, name } = linked);
    } else {
      uid = crypto.randomUUID();
      name = readName(gUser.name) ?? gUser.email?.split('@')[0]?.slice(0, 20) ?? 'Player';
      await env.DB.prepare(
        'INSERT INTO users (id, name, google_sub, email, created_at) VALUES (?1, ?2, ?3, ?4, ?5)',
      )
        .bind(uid, name, gUser.sub, gUser.email, Date.now())
        .run();
    }
    const exp = Date.now() + SESSION_TTL_MS;
    const token = await mintToken({ uid, name, exp }, env.SESSION_SECRET);
    // Fragment, not query: never reaches server logs or Referer headers.
    return Response.redirect(
      `${url.origin}/#login=${encodeURIComponent(token)}&exp=${String(exp)}`,
      302,
    );
  } catch (err) {
    console.error('[login] google callback failed', err);
    return back('google');
  }
}

const HEX_RE = /^#[0-9a-fA-F]{6}$/;
/** A cosmetic id (card skin / theme): lowercase slug, mirrors the client
 * catalogs. We validate SHAPE only — eligibility to *use* a skin is derived
 * from `/api/stats` on the client, keeping `/api/stats` the single unlock
 * source with zero new server state. */
const SKIN_ID_RE = /^[a-z0-9-]{1,24}$/;
/** Cap on the whole POST body — the painted-canvas data URL is the big field.
 * A 260×347 PNG of brush strokes compresses well under this. */
const PROFILE_MAX_BYTES = 512 * 1024;

/**
 * POST /api/profile {color?, paint?, cardSkin?, theme?} → {userId, ...profile}.
 * Authenticated by Bearer token; persists the player's cosmetics to `users`.
 * Each field is optional: absent leaves the column untouched, explicit `null`
 * clears it. No account vocabulary — this is just the look of your cards.
 */
async function handleProfile(request: Request, env: Env): Promise<Response> {
  if (!isUsableSecret(env.SESSION_SECRET)) return noSecret();
  if (env.DB === undefined) return noDb();
  const token = bearerToken(request);
  if (token === null) return Response.json({ error: 'Missing bearer token' }, { status: 401 });
  const identity = await verifyToken(token, env.SESSION_SECRET);
  if (identity === null) {
    return Response.json({ error: 'Invalid or expired token' }, { status: 401 });
  }

  const lengthHeader = request.headers.get('Content-Length');
  if (lengthHeader !== null && Number(lengthHeader) > PROFILE_MAX_BYTES) {
    return new Response('Payload too large', { status: 413 });
  }
  const raw = await request.text();
  if (raw.length > PROFILE_MAX_BYTES) return new Response('Payload too large', { status: 413 });
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return Response.json({ error: 'Expected a JSON body' }, { status: 400 });
  }
  if (typeof body !== 'object' || body === null) {
    return Response.json({ error: 'Expected a JSON object' }, { status: 400 });
  }
  const b = body as Record<string, unknown>;

  let color: string | null | undefined;
  if ('color' in b) {
    if (b.color === null) color = null;
    else if (typeof b.color === 'string' && HEX_RE.test(b.color)) color = b.color.toLowerCase();
    else return Response.json({ error: 'color must be a #rrggbb hex or null' }, { status: 400 });
  }
  let paint: string | null | undefined;
  if ('paint' in b) {
    if (b.paint === null) paint = null;
    else if (typeof b.paint === 'string' && b.paint.startsWith('data:image/')) paint = b.paint;
    else
      return Response.json({ error: 'paint must be a data:image/ URL or null' }, { status: 400 });
  }
  let cardSkin: string | null | undefined;
  if ('cardSkin' in b) {
    if (b.cardSkin === null) cardSkin = null;
    else if (typeof b.cardSkin === 'string' && SKIN_ID_RE.test(b.cardSkin)) cardSkin = b.cardSkin;
    else return Response.json({ error: 'cardSkin must be a skin id or null' }, { status: 400 });
  }
  let theme: string | null | undefined;
  if ('theme' in b) {
    if (b.theme === null) theme = null;
    else if (typeof b.theme === 'string' && SKIN_ID_RE.test(b.theme)) theme = b.theme;
    else return Response.json({ error: 'theme must be a theme id or null' }, { status: 400 });
  }
  if (color === undefined && paint === undefined && cardSkin === undefined && theme === undefined) {
    return Response.json({ error: 'Provide color, paint, cardSkin and/or theme' }, { status: 400 });
  }

  // Partial UPDATE touching only the provided columns; bind indices track the
  // running length so the provided values and uid line up regardless of which
  // are present.
  const sets: string[] = [];
  const binds: (string | null)[] = [];
  if (color !== undefined) {
    binds.push(color);
    sets.push(`color = ?${String(binds.length)}`);
  }
  if (paint !== undefined) {
    binds.push(paint);
    sets.push(`paint = ?${String(binds.length)}`);
  }
  if (cardSkin !== undefined) {
    binds.push(cardSkin);
    sets.push(`card_skin = ?${String(binds.length)}`);
  }
  if (theme !== undefined) {
    binds.push(theme);
    sets.push(`theme = ?${String(binds.length)}`);
  }
  binds.push(identity.uid);
  try {
    await env.DB.prepare(`UPDATE users SET ${sets.join(', ')} WHERE id = ?${String(binds.length)}`)
      .bind(...binds)
      .run();
  } catch (err) {
    console.error('[users] profile update failed', err);
    return Response.json({ error: 'Could not save profile' }, { status: 500 });
  }
  const profile = await readProfile(env, identity.uid);
  return Response.json({ userId: identity.uid, ...profile });
}

/**
 * The uid a history/stats request is scoped to: a verified Bearer token when
 * one is present, else the `?u=` fallback (mirrors the WS no-secret path).
 * Returns `undefined` on an explicitly invalid token (caller should 401),
 * `null` when no identity was supplied at all (caller should 400).
 */
async function resolveUserId(
  request: Request,
  env: Env,
  url: URL,
): Promise<string | null | undefined> {
  const token = bearerToken(request);
  if (token !== null && isUsableSecret(env.SESSION_SECRET)) {
    const uid = (await verifyToken(token, env.SESSION_SECRET))?.uid ?? null;
    return uid ?? undefined;
  }
  return url.searchParams.get('u');
}

interface GamePlayer {
  readonly seat: number;
  readonly name: string;
  readonly isBot: boolean;
  readonly userId: string | null;
}

/** {seat, name, isBot, userId}[] per game_id, ordered by seat — shared by
 * history, replay and stats (userId is dropped before it reaches the client
 * in the history/replay responses; stats needs it for the partner lookup). */
async function playersByGame(
  env: Env,
  gameIds: readonly string[],
): Promise<Map<string, GamePlayer[]>> {
  const map = new Map<string, GamePlayer[]>();
  if (gameIds.length === 0 || env.DB === undefined) return map;
  const placeholders = gameIds.map((_, i) => `?${String(i + 1)}`).join(', ');
  const rows = await env.DB.prepare(
    `SELECT game_id, seat, name, is_bot, user_id FROM game_players WHERE game_id IN (${placeholders}) ORDER BY seat`,
  )
    .bind(...gameIds)
    .all<{
      game_id: string;
      seat: number;
      name: string | null;
      is_bot: number;
      user_id: string | null;
    }>();
  for (const r of rows.results) {
    const list = map.get(r.game_id) ?? [];
    list.push({ seat: r.seat, name: r.name ?? 'Player', isBot: r.is_bot === 1, userId: r.user_id });
    map.set(r.game_id, list);
  }
  return map;
}

/** GET /api/history?u=<userId> (or Bearer token) → last 20 finished games. */
async function handleHistory(request: Request, env: Env, url: URL): Promise<Response> {
  if (env.DB === undefined) return noDb();
  const userId = await resolveUserId(request, env, url);
  if (userId === undefined) return Response.json({ error: 'Invalid token' }, { status: 401 });
  if (userId === null || userId === '') {
    return Response.json({ error: 'Missing user (Bearer token or ?u=)' }, { status: 400 });
  }
  const rows = await env.DB.prepare(
    `SELECT g.id, g.room_code, g.finished_at, g.winner_team, g.score_0, g.score_1, gp.seat
     FROM games g JOIN game_players gp ON gp.game_id = g.id
     WHERE gp.user_id = ?1
     ORDER BY g.finished_at DESC
     LIMIT 20`,
  )
    .bind(userId)
    .all<{
      id: string;
      room_code: string;
      finished_at: number | null;
      winner_team: number | null;
      score_0: number | null;
      score_1: number | null;
      seat: number;
    }>();
  const players = await playersByGame(
    env,
    rows.results.map((r) => r.id),
  );
  return Response.json({
    games: rows.results.map((r) => ({
      id: r.id,
      roomCode: r.room_code,
      finishedAt: r.finished_at,
      winnerTeam: r.winner_team,
      scores: [r.score_0, r.score_1],
      yourSeat: r.seat,
      players: (players.get(r.id) ?? []).map((p) => ({
        seat: p.seat,
        name: p.name,
        isBot: p.isBot,
      })),
    })),
  });
}

/** GET /api/replay/:gameId → {seed, actions, players}. */
async function handleReplay(env: Env, gameId: string): Promise<Response> {
  if (env.DB === undefined) return noDb();
  const row = await env.DB.prepare('SELECT seed, action_log FROM games WHERE id = ?1')
    .bind(gameId)
    .first<{ seed: number; action_log: string | null }>();
  if (row === null) return Response.json({ error: 'Unknown game' }, { status: 404 });
  const players = await playersByGame(env, [gameId]);
  return Response.json({
    seed: row.seed,
    actions: row.action_log !== null ? (JSON.parse(row.action_log) as unknown) : [],
    players: (players.get(gameId) ?? []).map((p) => ({
      seat: p.seat,
      name: p.name,
      isBot: p.isBot,
    })),
  });
}

interface StatsRow {
  readonly id: string;
  readonly finished_at: number | null;
  readonly winner_team: number | null;
  readonly round_summaries: string | null;
  readonly score_0: number;
  readonly score_1: number;
  readonly seat: number;
}

const EMPTY_STATS = {
  games: 0,
  wins: 0,
  winRate: 0,
  netPoints: 0,
  bids: { attempted: 0, made: 0 },
  sansAtout: { attempted: 0, made: 0 },
  bestPartner: null,
  nemesis: null,
  streak: { current: 0, best: 0 },
};

/**
 * GET /api/stats?u=<userId> (or Bearer token) → aggregate record for that
 * player, computed in JS from their finished games (kept out of SQL since
 * bid/sans-atout stats require parsing each game's round_summaries JSON).
 */
async function handleStats(request: Request, env: Env, url: URL): Promise<Response> {
  if (env.DB === undefined) return noDb();
  const userId = await resolveUserId(request, env, url);
  if (userId === undefined) return Response.json({ error: 'Invalid token' }, { status: 401 });
  if (userId === null || userId === '') {
    return Response.json({ error: 'Missing user (Bearer token or ?u=)' }, { status: 400 });
  }
  // Ascending by finished_at: the streak walk needs oldest-first so the
  // running count at the end of the loop IS the current (trailing) streak.
  const rows = await env.DB.prepare(
    `SELECT g.id, g.finished_at, g.winner_team, g.round_summaries, g.score_0, g.score_1, gp.seat
     FROM games g JOIN game_players gp ON gp.game_id = g.id
     WHERE gp.user_id = ?1 AND g.finished_at IS NOT NULL
     ORDER BY g.finished_at ASC`,
  )
    .bind(userId)
    .all<StatsRow>();
  const games = rows.results;
  if (games.length === 0) return Response.json(EMPTY_STATS);

  const players = await playersByGame(
    env,
    games.map((g) => g.id),
  );

  let wins = 0;
  let netPoints = 0;
  let bidsAttempted = 0;
  let bidsMade = 0;
  let saAttempted = 0;
  let saMade = 0;
  let running = 0;
  let best = 0;
  const partners = new Map<string, { name: string; games: number; wins: number }>();
  // Opponents you've faced: "losses" counts games they beat you → your nemesis.
  const opponents = new Map<string, { name: string; games: number; losses: number }>();

  for (const g of games) {
    const yourTeam = g.seat % 2;
    const won = g.winner_team !== null && g.winner_team === yourTeam;
    if (won) wins++;
    // Net points: your team's final margin summed across every finished game.
    netPoints += yourTeam === 0 ? g.score_0 - g.score_1 : g.score_1 - g.score_0;
    running = won ? running + 1 : 0;
    best = Math.max(best, running);

    if (g.round_summaries !== null) {
      const summaries = JSON.parse(g.round_summaries) as readonly RoundSummary[];
      for (const s of summaries) {
        if (s.contract.seat !== g.seat) continue;
        bidsAttempted++;
        if (s.contractMade) bidsMade++;
        if (s.contract.sansAtout) {
          saAttempted++;
          if (s.contractMade) saMade++;
        }
      }
    }

    const roster = players.get(g.id) ?? [];
    const teammate = roster.find(
      (p) => p.seat % 2 === yourTeam && p.seat !== g.seat && !p.isBot && p.userId !== null,
    );
    if (teammate?.userId !== null && teammate !== undefined) {
      const entry = partners.get(teammate.userId) ?? { name: teammate.name, games: 0, wins: 0 };
      entry.games++;
      if (won) entry.wins++;
      partners.set(teammate.userId, entry);
    }

    // Both opponents (the other team's humans) get credit for beating you.
    const decided = g.winner_team !== null;
    for (const p of roster) {
      if (p.seat % 2 === yourTeam || p.isBot || p.userId === null) continue;
      const entry = opponents.get(p.userId) ?? { name: p.name, games: 0, losses: 0 };
      entry.games++;
      if (decided && !won) entry.losses++;
      opponents.set(p.userId, entry);
    }
  }

  let bestPartner: { name: string; games: number; wins: number } | null = null;
  for (const entry of partners.values()) {
    if (entry.games < 2) continue;
    if (bestPartner === null || entry.wins > bestPartner.wins) bestPartner = entry;
  }

  // Nemesis: the opponent (min 2 games faced) who has beaten you the most.
  let nemesis: { name: string; games: number; losses: number } | null = null;
  for (const entry of opponents.values()) {
    if (entry.games < 2 || entry.losses === 0) continue;
    if (nemesis === null || entry.losses > nemesis.losses) nemesis = entry;
  }

  return Response.json({
    games: games.length,
    wins,
    winRate: wins / games.length,
    netPoints,
    bids: { attempted: bidsAttempted, made: bidsMade },
    sansAtout: { attempted: saAttempted, made: saMade },
    bestPartner,
    nemesis,
    streak: { current: running, best },
  });
}

const TELEMETRY_MAX_BYTES = 4 * 1024;

/**
 * POST /api/telemetry {kind, message, stack?, url?, ua?} → 204. First-party,
 * no-storage client error reporting: log one line so Workers Logs captures
 * it. Body is size-capped and loosely shape-checked — this must never throw
 * on malformed input from a misbehaving client.
 */
async function handleTelemetry(request: Request): Promise<Response> {
  const lengthHeader = request.headers.get('Content-Length');
  if (lengthHeader !== null && Number(lengthHeader) > TELEMETRY_MAX_BYTES) {
    return new Response('Payload too large', { status: 413 });
  }
  const raw = await request.text();
  if (raw.length > TELEMETRY_MAX_BYTES) {
    return new Response('Payload too large', { status: 413 });
  }
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return Response.json({ error: 'Expected a JSON body' }, { status: 400 });
  }
  if (typeof body !== 'object' || body === null) {
    return Response.json({ error: 'Expected a JSON object' }, { status: 400 });
  }
  const b = body as Record<string, unknown>;
  if (typeof b.kind !== 'string' || typeof b.message !== 'string') {
    return Response.json({ error: 'kind and message must be strings' }, { status: 400 });
  }
  console.error('[client]', {
    kind: b.kind,
    message: b.message,
    stack: typeof b.stack === 'string' ? b.stack : undefined,
    url: typeof b.url === 'string' ? b.url : undefined,
    ua: typeof b.ua === 'string' ? b.ua : undefined,
  });
  return new Response(null, { status: 204 });
}

/**
 * GET /api/ice → { iceServers } for the voice mesh. STUN always; when a
 * Cloudflare Realtime TURN key is configured, adds short-lived TURN
 * credentials so voice connects even across strict NATs. TURN failures
 * degrade to STUN-only — this endpoint never errors.
 */
async function handleIce(env: Env): Promise<Response> {
  const iceServers: unknown[] = [
    { urls: 'stun:stun.cloudflare.com:3478' },
    { urls: 'stun:stun.l.google.com:19302' },
  ];
  if (env.TURN_KEY_ID !== undefined && env.TURN_KEY_API_TOKEN !== undefined) {
    try {
      const res = await fetch(
        `https://rtc.live.cloudflare.com/v1/turn/keys/${env.TURN_KEY_ID}/credentials/generate-ice-servers`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${env.TURN_KEY_API_TOKEN}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ ttl: 6 * 3600 }),
        },
      );
      if (res.ok) {
        const data = (await res.json()) as { iceServers?: unknown };
        if (Array.isArray(data.iceServers)) iceServers.push(...(data.iceServers as unknown[]));
        else if (data.iceServers !== undefined) iceServers.push(data.iceServers);
      }
    } catch {
      // STUN-only fallback.
    }
  }
  return Response.json({ iceServers }, { headers: { 'Cache-Control': 'no-store' } });
}

/* ── Web Push subscriptions ─────────────────────────────────────────────── */

/** Bearer-authed identity, or an error Response — shared by the push routes. */
async function pushIdentity(request: Request, env: Env): Promise<{ uid: string } | Response> {
  if (!pushEnabled(env)) {
    return Response.json({ error: 'Push not configured' }, { status: 503 });
  }
  if (!isUsableSecret(env.SESSION_SECRET)) return noSecret();
  const token = bearerToken(request);
  if (token === null) return Response.json({ error: 'Missing bearer token' }, { status: 401 });
  const identity = await verifyToken(token, env.SESSION_SECRET);
  if (identity === null) {
    return Response.json({ error: 'Invalid or expired token' }, { status: 401 });
  }
  return { uid: identity.uid };
}

async function handlePushSubscribe(request: Request, env: Env): Promise<Response> {
  const who = await pushIdentity(request, env);
  if (who instanceof Response) return who;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Expected a JSON body' }, { status: 400 });
  }
  const b = body as { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } };
  const endpoint = b.endpoint;
  const p256dh = b.keys?.p256dh;
  const auth = b.keys?.auth;
  if (
    typeof endpoint !== 'string' ||
    !endpoint.startsWith('https://') ||
    endpoint.length > 2048 ||
    typeof p256dh !== 'string' ||
    p256dh.length > 256 ||
    typeof auth !== 'string' ||
    auth.length > 64
  ) {
    return Response.json({ error: 'Expected {endpoint, keys:{p256dh, auth}}' }, { status: 400 });
  }
  // REPLACE: a re-subscribe (new browser profile, permission re-grant) hands
  // the same endpoint to whatever uid currently owns this browser.
  await (env.DB as D1Database)
    .prepare(
      'INSERT OR REPLACE INTO push_subscriptions (endpoint, user_id, p256dh, auth, created_at) VALUES (?, ?, ?, ?, ?)',
    )
    .bind(endpoint, who.uid, p256dh, auth, Date.now())
    .run();
  return Response.json({ ok: true });
}

async function handlePushUnsubscribe(request: Request, env: Env): Promise<Response> {
  const who = await pushIdentity(request, env);
  if (who instanceof Response) return who;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Expected a JSON body' }, { status: 400 });
  }
  const endpoint = (body as { endpoint?: unknown }).endpoint;
  if (typeof endpoint !== 'string') {
    return Response.json({ error: 'Expected {endpoint}' }, { status: 400 });
  }
  await (env.DB as D1Database)
    .prepare('DELETE FROM push_subscriptions WHERE endpoint = ? AND user_id = ?')
    .bind(endpoint, who.uid)
    .run();
  return Response.json({ ok: true });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/api/health') {
      return Response.json({ ok: true, service: 'jaffre' });
    }

    if (url.pathname === '/api/ice') {
      return handleIce(env);
    }

    if (url.pathname === '/api/auth/guest' && request.method === 'POST') {
      return handleGuestAuth(request, env);
    }
    if (url.pathname === '/api/auth/methods' && request.method === 'GET') {
      return handleAuthMethods(env);
    }
    if (url.pathname === '/api/auth/email/start' && request.method === 'POST') {
      return handleEmailStart(request, env);
    }
    if (url.pathname === '/api/auth/email/verify' && request.method === 'POST') {
      return handleEmailVerify(request, env);
    }
    if (url.pathname === '/api/auth/google' && request.method === 'GET') {
      return handleGoogleStart(request, env);
    }
    if (url.pathname === '/api/auth/google/callback' && request.method === 'GET') {
      return handleGoogleCallback(request, env);
    }
    if (url.pathname === '/api/auth/recover' && request.method === 'POST') {
      return handleRecover(request, env);
    }
    if (url.pathname === '/api/auth/me' && request.method === 'GET') {
      return handleAuthMe(request, env);
    }
    if (url.pathname === '/api/profile' && request.method === 'POST') {
      return handleProfile(request, env);
    }
    if (url.pathname === '/api/history' && request.method === 'GET') {
      return handleHistory(request, env, url);
    }
    if (url.pathname === '/api/stats' && request.method === 'GET') {
      return handleStats(request, env, url);
    }
    const replayMatch = /^\/api\/replay\/([A-Za-z0-9-]{1,64})$/.exec(url.pathname);
    if (replayMatch !== null && request.method === 'GET') {
      return handleReplay(env, replayMatch[1] as string);
    }
    if (url.pathname === '/api/telemetry' && request.method === 'POST') {
      return handleTelemetry(request);
    }
    // Web Push: the client needs the public key to subscribe; null = feature off.
    if (url.pathname === '/api/push/vapid' && request.method === 'GET') {
      return Response.json({ key: pushEnabled(env) ? (env.VAPID_PUBLIC_KEY ?? null) : null });
    }
    if (url.pathname === '/api/push/subscribe' && request.method === 'POST') {
      return handlePushSubscribe(request, env);
    }
    if (url.pathname === '/api/push/unsubscribe' && request.method === 'POST') {
      return handlePushUnsubscribe(request, env);
    }

    // GET /api/room/:code/status — a cheap, unauthenticated peek at a room's
    // live phase/turn for the home "Your tables" row. Forwarded to the DO.
    const statusMatch = /^\/api\/room\/([A-Za-z0-9-]{1,32})\/status$/.exec(url.pathname);
    if (statusMatch && request.method === 'GET') {
      const id = env.GAME_ROOM.idFromName(statusMatch[1] as string);
      return env.GAME_ROOM.get(id).fetch(new Request('https://do/status'));
    }

    // /ws/:roomCode — WebSocket upgrade routed to the room's Durable Object.
    const wsMatch = /^\/ws\/([A-Za-z0-9-]{1,32})$/.exec(url.pathname);
    if (wsMatch) {
      if (request.headers.get('Upgrade') !== 'websocket') {
        return new Response('Expected WebSocket upgrade', { status: 426 });
      }
      const roomCode = wsMatch[1] as string;
      const id = env.GAME_ROOM.idFromName(roomCode);

      if (isUsableSecret(env.SESSION_SECRET)) {
        // Token mode: verify BEFORE dispatching to the DO, then forward the
        // authenticated identity via headers — the DO trusts headers only,
        // never the query string, in this mode.
        const token = url.searchParams.get('t');
        if (token === null || token === '') {
          return new Response('Missing token (?t=)', { status: 401 });
        }
        const identity = await verifyToken(token, env.SESSION_SECRET);
        if (identity === null) {
          return new Response('Invalid or expired token', { status: 401 });
        }
        const headers = new Headers(request.headers);
        headers.set('X-User-Id', identity.uid);
        // Header values must be ISO-8859-1-safe; the DO decodes this.
        headers.set('X-User-Name', encodeURIComponent(identity.name));
        return env.GAME_ROOM.get(id).fetch(new Request(request, { headers }));
      }

      // No-secret fallback (local dev / tests): plain ?u=&n= identity.
      const u = url.searchParams.get('u');
      const n = url.searchParams.get('n');
      if (u === null || u === '' || n === null || n === '') {
        return new Response('Missing u/n query params', { status: 400 });
      }
      return env.GAME_ROOM.get(id).fetch(request);
    }

    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;
