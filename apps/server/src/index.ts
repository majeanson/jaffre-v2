import { GameRoom } from './GameRoom.js';
import { isUsableSecret, mintToken, verifyToken } from './auth/session.js';
import type { Env } from './env.js';

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

/** POST /api/auth/guest {name} → {userId, name, token}. Anonymous-first: no
 * password, just a minted identity the client stores locally. */
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
  const userId = crypto.randomUUID();
  // The users row is best-effort: identity is carried by the signed token, so
  // a missing/failed D1 write must not block the guest from playing.
  if (env.DB !== undefined) {
    try {
      await env.DB.prepare('INSERT INTO users (id, name, created_at) VALUES (?1, ?2, ?3)')
        .bind(userId, trimmed, Date.now())
        .run();
    } catch (err) {
      console.error('users insert failed', err);
    }
  }
  const token = await mintToken(
    { uid: userId, name: trimmed, exp: Date.now() + SESSION_TTL_MS },
    env.SESSION_SECRET,
  );
  return Response.json({ userId, name: trimmed, token });
}

/** GET /api/auth/me — validates the Bearer token, echoes the identity. */
async function handleAuthMe(request: Request, env: Env): Promise<Response> {
  if (!isUsableSecret(env.SESSION_SECRET)) return noSecret();
  const token = bearerToken(request);
  if (token === null) return Response.json({ error: 'Missing bearer token' }, { status: 401 });
  const identity = await verifyToken(token, env.SESSION_SECRET);
  if (identity === null) {
    return Response.json({ error: 'Invalid or expired token' }, { status: 401 });
  }
  return Response.json({ userId: identity.uid, name: identity.name });
}

/** GET /api/history?u=<userId> (or Bearer token) → last 20 finished games. */
async function handleHistory(request: Request, env: Env, url: URL): Promise<Response> {
  if (env.DB === undefined) return noDb();
  let userId: string | null = null;
  const token = bearerToken(request);
  if (token !== null && isUsableSecret(env.SESSION_SECRET)) {
    userId = (await verifyToken(token, env.SESSION_SECRET))?.uid ?? null;
    if (userId === null) return Response.json({ error: 'Invalid token' }, { status: 401 });
  } else {
    userId = url.searchParams.get('u');
  }
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
  return Response.json({
    games: rows.results.map((r) => ({
      id: r.id,
      roomCode: r.room_code,
      finishedAt: r.finished_at,
      winnerTeam: r.winner_team,
      scores: [r.score_0, r.score_1],
      yourSeat: r.seat,
    })),
  });
}

/** GET /api/replay/:gameId → {seed, actions}. */
async function handleReplay(env: Env, gameId: string): Promise<Response> {
  if (env.DB === undefined) return noDb();
  const row = await env.DB.prepare('SELECT seed, action_log FROM games WHERE id = ?1')
    .bind(gameId)
    .first<{ seed: number; action_log: string | null }>();
  if (row === null) return Response.json({ error: 'Unknown game' }, { status: 404 });
  return Response.json({
    seed: row.seed,
    actions: row.action_log !== null ? (JSON.parse(row.action_log) as unknown) : [],
  });
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
  return Response.json(
    { iceServers },
    { headers: { 'Cache-Control': 'no-store' } },
  );
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
    if (url.pathname === '/api/auth/me' && request.method === 'GET') {
      return handleAuthMe(request, env);
    }
    if (url.pathname === '/api/history' && request.method === 'GET') {
      return handleHistory(request, env, url);
    }
    const replayMatch = /^\/api\/replay\/([A-Za-z0-9-]{1,64})$/.exec(url.pathname);
    if (replayMatch !== null && request.method === 'GET') {
      return handleReplay(env, replayMatch[1] as string);
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
