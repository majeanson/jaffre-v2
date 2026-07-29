/**
 * Identity: minting it, recovering it, and linking it to a real login.
 *
 * The server token `uid` is the ONE canonical player id — every route below
 * either mints a token for an existing uid or creates exactly one new uid.
 * Email and Google both LINK onto the signed-in guest when there is one, so
 * progress carries over instead of stranding it on an anonymous account.
 *
 * Every mint answers in the same shape (`{userId, name, token, exp,
 * ...profile}`) so the client stores each one identically.
 */
import { generateRecoveryCode, hashRecoveryCode } from '../auth/recovery.js';
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
} from '../auth/login.js';
import { isUsableSecret, mintToken, verifyToken } from '../auth/session.js';
import type { Env } from '../env.js';
// DEFAULT_NAME lives beside publicId because both answer "what do other people
// see when nobody has said who they are?" — adoptLoginName below upgrades it,
// displayName disambiguates whatever survives.
import { DEFAULT_NAME } from '../publicId.js';
import { bearerToken, noDb, noSecret } from './http.js';
import { NO_PROFILE, readProfile } from './profile.js';

export const SESSION_TTL_MS = 90 * 24 * 60 * 60 * 1000; // 90 days

/**
 * POST /api/auth/guest {name} → {userId, name, token, exp, recoveryCode?}.
 * Anonymous-first: no password, just a minted identity the client stores
 * locally. The server token `uid` is the ONE canonical player id:
 *   - Called WITH a valid Bearer token: re-mints a token for the SAME uid
 *     (a name change is a rename, not a new identity).
 *   - Called without one: mints a brand-new uid and a 3-word recovery code
 *     (hash persisted, plaintext returned exactly this once).
 */
export async function handleGuestAuth(request: Request, env: Env): Promise<Response> {
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
export async function handleRecover(request: Request, env: Env): Promise<Response> {
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
export function handleAuthMethods(env: Env): Response {
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
export async function handleAuthMe(request: Request, env: Env): Promise<Response> {
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
 * A login landing on an account still named the placeholder adopts the
 * provider's name (Google display name, email local-part). A guest who linked
 * without ever renaming stayed "Player" forever — and a table of Players is
 * exactly the who's-who confusion two linked browsers produce. Deliberate
 * renames are respected: only the untouched default is upgraded. Returns the
 * name to mint the session with. Best-effort: on DB failure keep the old name.
 */
async function adoptLoginName(
  env: Env,
  uid: string,
  current: string,
  candidate: string | null,
): Promise<string> {
  if (current !== DEFAULT_NAME || candidate === null || candidate === DEFAULT_NAME) return current;
  if (env.DB === undefined) return current;
  try {
    await env.DB.prepare('UPDATE users SET name = ?1 WHERE id = ?2 AND name = ?3')
      .bind(candidate, uid, DEFAULT_NAME)
      .run();
    return candidate;
  } catch {
    return current;
  }
}

/**
 * POST /api/auth/email/start {email} → {sent:true}. Mints a 6-digit one-time
 * code (hash-at-rest, 10 min TTL) and emails it via Resend. Always answers
 * {sent:true} on a plausible address — no account enumeration. Rate-limited
 * from the login_codes table itself: 5/hour per email, 20/hour per IP.
 */
export async function handleEmailStart(request: Request, env: Env): Promise<Response> {
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
export async function handleEmailVerify(request: Request, env: Env): Promise<Response> {
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
    // The address's local part is the fallback display name for accounts that
    // never left the "Player" placeholder (see adoptLoginName).
    const localPart = rawEmail.split('@')[0]?.slice(0, 20) ?? null;
    const existing = await env.DB.prepare('SELECT id, name FROM users WHERE email = ?1')
      .bind(rawEmail)
      .first<{ id: string; name: string }>();
    if (existing !== null) {
      return loginResponse(
        env,
        existing.id,
        await adoptLoginName(env, existing.id, existing.name, localPart),
      );
    }

    const token = bearerToken(request);
    const identity = token !== null ? await verifyToken(token, env.SESSION_SECRET) : null;
    if (identity !== null) {
      await env.DB.prepare('UPDATE users SET email = ?1 WHERE id = ?2 AND email IS NULL')
        .bind(rawEmail, identity.uid)
        .run();
      return loginResponse(
        env,
        identity.uid,
        await adoptLoginName(env, identity.uid, identity.name, localPart),
      );
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
export async function handleGoogleStart(request: Request, env: Env): Promise<Response> {
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
export async function handleGoogleCallback(request: Request, env: Env): Promise<Response> {
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
    // Sign-in or link that lands on an untouched "Player" adopts the Google
    // display name — otherwise a linked account keeps the placeholder forever.
    name = await adoptLoginName(
      env,
      uid,
      name,
      readName(gUser.name) ?? gUser.email?.split('@')[0]?.slice(0, 20) ?? null,
    );
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
