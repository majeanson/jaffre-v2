/**
 * Everything that talks to the Lobby DO: matchmaking into an open table, the
 * browsable open-tables list, and the live feed behind it.
 *
 * All three degrade to "no lobby" rather than failing — an unreachable Lobby
 * must still leave a player able to host their own room.
 */
import type { Env } from '../env.js';
import { lobbyStub } from '../Lobby.js';

/** A friendly, route-safe room code for a freshly-created public table. The
 * full 32-bit random suffix (~6 base36 chars) keeps collisions negligible —
 * two hosts colliding would be routed into the same GameRoom DO. */
function newRoomCode(): string {
  const adjectives = ['brisk', 'sunny', 'lucky', 'bold', 'calm', 'swift', 'keen', 'wily'];
  const animals = ['fox', 'lynx', 'otter', 'hawk', 'moose', 'heron', 'stoat', 'marten'];
  const buf = new Uint32Array(3);
  crypto.getRandomValues(buf);
  const pick = <T>(arr: readonly T[], n: number): T => arr[n % arr.length] as T;
  return `${pick(adjectives, buf[0] ?? 0)}-${pick(animals, buf[1] ?? 0)}-${(buf[2] ?? 0).toString(36)}`;
}

/**
 * POST /api/quickplay → { code, created } — match the caller into an open
 * public room, or mint a fresh code for them to host (the client makes it
 * public on join). Public: guests can quick-play. No-op-safe when the lobby
 * binding is absent (always returns a fresh code to host).
 */
export async function handleQuickplay(env: Env): Promise<Response> {
  const lobby = lobbyStub(env);
  if (lobby !== null) {
    try {
      const res = await lobby.fetch('https://lobby/claim', { method: 'POST' });
      const { code } = (await res.json()) as { code: string | null };
      if (code !== null) return Response.json({ code, created: false });
    } catch {
      // Lobby unreachable — fall through to hosting a fresh room.
    }
  }
  return Response.json({ code: newRoomCode(), created: true });
}

/** GET /api/rooms → { rooms: LobbyEntry[] } — the browsable open-tables list. */
export async function handleRooms(env: Env): Promise<Response> {
  const lobby = lobbyStub(env);
  if (lobby === null) return Response.json({ rooms: [] });
  try {
    const res = await lobby.fetch('https://lobby/list');
    return Response.json(await res.json());
  } catch {
    return Response.json({ rooms: [] });
  }
}

/** /api/rooms/ws — live open-tables feed, upgraded straight to the Lobby DO. */
export function handleRoomsSocket(request: Request, env: Env): Promise<Response> | Response {
  if (request.headers.get('Upgrade') !== 'websocket') {
    return new Response('Expected WebSocket upgrade', { status: 426 });
  }
  const lobby = lobbyStub(env);
  if (lobby === null) return new Response('Lobby unavailable', { status: 503 });
  return lobby.fetch(new Request('https://lobby/ws', request));
}
