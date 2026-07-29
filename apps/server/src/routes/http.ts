/**
 * The request plumbing every route shares: bearer extraction, the two
 * "feature isn't configured" responses, and the ONE rule for deciding which
 * uid a request is allowed to read.
 *
 * Nothing here touches game truth — it decides who is asking, not what they
 * get back.
 */
import { isUsableSecret, verifyToken } from '../auth/session.js';
import type { Env } from '../env.js';

/** `Authorization: Bearer <token>` → token, or null. */
export function bearerToken(request: Request): string | null {
  const header = request.headers.get('Authorization');
  if (header === null || !header.startsWith('Bearer ')) return null;
  const token = header.slice('Bearer '.length).trim();
  return token === '' ? null : token;
}

export function noSecret(): Response {
  return Response.json({ error: 'Auth is not configured (SESSION_SECRET unset)' }, { status: 503 });
}

export function noDb(): Response {
  return Response.json({ error: 'History is not configured (no D1 binding)' }, { status: 503 });
}

/**
 * The uid a history/stats request is scoped to. TOKEN MODE (secret set — i.e.
 * prod): a verified Bearer token is REQUIRED; `?u=` is credential-shaped and
 * is never trusted, with or without a token attached — before this, omitting
 * the Bearer let anyone read any uid's private stats. The `?u=` fallback
 * survives only in no-secret mode (local dev / tests), mirroring the WS path.
 * Returns `undefined` on a missing-or-invalid token in token mode (caller
 * should 401), `null` when no identity was supplied at all (caller: 400).
 */
export async function resolveUserId(
  request: Request,
  env: Env,
  url: URL,
): Promise<string | null | undefined> {
  if (isUsableSecret(env.SESSION_SECRET)) {
    const token = bearerToken(request);
    if (token === null) return undefined;
    return (await verifyToken(token, env.SESSION_SECRET))?.uid ?? undefined;
  }
  return url.searchParams.get('u');
}
