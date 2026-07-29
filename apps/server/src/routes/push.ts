/**
 * Web Push subscriptions.
 *
 * Degradation policy is the opposite of telemetry's: these routes REFUSE
 * rather than degrade. Storing a subscription against the wrong uid would
 * send someone else's turn notifications to this browser, so an unconfigured
 * feature is a 503 and a missing/invalid token is a 401 — never a silent
 * best-effort write.
 */
import { isUsableSecret, verifyToken } from '../auth/session.js';
import type { Env } from '../env.js';
import { pushEnabled } from '../push.js';
import { bearerToken, noSecret } from './http.js';

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

export async function handlePushSubscribe(request: Request, env: Env): Promise<Response> {
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

export async function handlePushUnsubscribe(request: Request, env: Env): Promise<Response> {
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

/** GET /api/push/vapid — the client needs the public key to subscribe;
 * null = feature off. */
export function handleVapidKey(env: Env): Response {
  return Response.json({ key: pushEnabled(env) ? (env.VAPID_PUBLIC_KEY ?? null) : null });
}
