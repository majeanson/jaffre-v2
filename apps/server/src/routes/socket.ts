/**
 * Everything that dispatches into a room's GameRoom DO: the play socket, the
 * cheap status peek, and the seat-surrender that needs no socket at all.
 *
 * These share ONE identity rule. In token mode (SESSION_SECRET set — i.e.
 * prod) the token is verified HERE, before the DO is touched, and the
 * authenticated identity is forwarded as headers: the DO trusts headers only
 * and never the query string in that mode. The plain `?u=` / `?u=&n=`
 * fallbacks survive only in no-secret mode (local dev / tests).
 */
import { isUsableSecret, verifyToken } from '../auth/session.js';
import type { Env } from '../env.js';
import { bearerToken } from './http.js';

/**
 * GET /api/room/:code/status — a cheap, unauthenticated peek at a room's
 * live phase/turn for the home "Your tables" row. Forwarded to the DO.
 */
export function handleRoomStatus(env: Env, code: string): Promise<Response> {
  const id = env.GAME_ROOM.idFromName(code);
  return env.GAME_ROOM.get(id).fetch(new Request('https://do/status'));
}

/**
 * POST /api/room/:code/leave — permanently give up your seat in a room
 * without opening a socket (the home "Your tables" row). Same identity
 * rules as /ws: verified token in token mode, plain ?u= fallback otherwise.
 */
export async function handleRoomLeave(
  request: Request,
  env: Env,
  url: URL,
  code: string,
): Promise<Response> {
  const id = env.GAME_ROOM.idFromName(code);
  let uid: string | null;
  if (isUsableSecret(env.SESSION_SECRET)) {
    const token = bearerToken(request);
    const identity = token !== null ? await verifyToken(token, env.SESSION_SECRET) : null;
    if (identity === null) {
      return Response.json({ error: 'Invalid or missing token' }, { status: 401 });
    }
    uid = identity.uid;
  } else {
    uid = url.searchParams.get('u');
    if (uid === null || uid === '') {
      return Response.json({ error: 'Missing u query param' }, { status: 400 });
    }
  }
  return env.GAME_ROOM.get(id).fetch(
    new Request('https://do/leave', { method: 'POST', headers: { 'X-User-Id': uid } }),
  );
}

/** /ws/:roomCode — WebSocket upgrade routed to the room's Durable Object. */
export async function handleRoomSocket(
  request: Request,
  env: Env,
  url: URL,
  roomCode: string,
): Promise<Response> {
  if (request.headers.get('Upgrade') !== 'websocket') {
    return new Response('Expected WebSocket upgrade', { status: 426 });
  }
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
