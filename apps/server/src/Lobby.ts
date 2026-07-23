/**
 * The matchmaking registry — a single Durable Object (addressed by the
 * well-known name 'lobby') holding the set of OPEN public rooms so players can
 * Quick Play into one or browse them, which the per-room GameRoom DOs can't
 * offer on their own (they're isolated and addressed only by code).
 *
 * GameRoom pushes register/deregister as its public+waiting state changes;
 * this DO answers /list (browse), /claim (Quick Play) and /ws (live browse:
 * hibernatable WebSockets that get the open list on connect and again whenever
 * it changes — the lobby screen never polls). Entries carry an updatedAt and
 * are pruned after LOBBY_TTL_MS so a room that died without deregistering
 * (crash, close) eventually drops off.
 */
import type { Env } from './env.js';

const LOBBY_TTL_MS = 90_000;
const LIST_LIMIT = 30;

export interface LobbyEntry {
  readonly code: string;
  readonly host: string;
  readonly players: number;
  readonly capacity: number;
  readonly phase: 'waiting' | 'playing';
  /** Set by this DO on write — not trusted from the caller. */
  updatedAt: number;
}

// ── Pure registry logic (DB/DO-free, unit-tested in lobby.test.ts) ──────────

/** Live (un-expired) open rooms with a free seat, freshest first. */
export function openRooms(rooms: Record<string, LobbyEntry>, now: number): LobbyEntry[] {
  return Object.values(rooms)
    .filter(
      (e) => now - e.updatedAt < LOBBY_TTL_MS && e.phase === 'waiting' && e.players < e.capacity,
    )
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

/** The best room to Quick Play into — the fullest joinable one, or null. */
export function claimBest(rooms: Record<string, LobbyEntry>, now: number): string | null {
  return openRooms(rooms, now).sort((a, b) => b.players - a.players)[0]?.code ?? null;
}

/**
 * Claim the best room AND reserve the seat in the same pure step, so two
 * concurrent Quick Plays landing before either GameRoom heartbeat re-registers
 * don't both walk away with the same code (the 5th player bouncing off a full
 * table). The bump is optimistic — the next GameRoom message overwrites it
 * with the true count, and the TTL bounds any leak if the claimant never
 * shows. If the bump fills the room it naturally drops out of openRooms for
 * the next claimer, which is the whole point.
 */
export function claimRoom(
  rooms: Record<string, LobbyEntry>,
  now: number,
): { code: string | null; rooms: Record<string, LobbyEntry> } {
  const code = claimBest(rooms, now);
  const room = code === null ? undefined : rooms[code];
  if (code === null || room === undefined) return { code: null, rooms };
  const reserved: LobbyEntry = { ...room, players: room.players + 1 };
  return { code, rooms: { ...rooms, [code]: reserved } };
}

/** Drop expired entries; returns the pruned map + whether anything changed. */
export function pruneExpired(
  rooms: Record<string, LobbyEntry>,
  now: number,
): { rooms: Record<string, LobbyEntry>; changed: boolean } {
  let changed = false;
  const kept: Record<string, LobbyEntry> = {};
  for (const [code, e] of Object.entries(rooms)) {
    if (now - e.updatedAt >= LOBBY_TTL_MS) changed = true;
    else kept[code] = e;
  }
  return { rooms: kept, changed };
}

/** The list as published to clients — updatedAt is registry bookkeeping, and
 * stripping it here is what lets broadcast() detect REAL changes (the 30s
 * heartbeat re-register only bumps updatedAt; watchers shouldn't hear it). */
function publicList(
  rooms: Record<string, LobbyEntry>,
  now: number,
): Omit<LobbyEntry, 'updatedAt'>[] {
  return openRooms(rooms, now)
    .slice(0, LIST_LIMIT)
    .map(({ code, host, players, capacity, phase }) => ({ code, host, players, capacity, phase }));
}

export class Lobby implements DurableObject {
  /** JSON of the last list sent to watchers. In-memory on purpose: it resets
   * to null when the DO hibernates, costing at worst one redundant broadcast
   * on the next change instead of a storage write per heartbeat. */
  private lastList: string | null = null;

  constructor(private readonly ctx: DurableObjectState) {
    // Keep hibernated watcher sockets alive without waking the DO.
    this.ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'));
  }

  private async rooms(): Promise<Record<string, LobbyEntry>> {
    return (await this.ctx.storage.get<Record<string, LobbyEntry>>('rooms')) ?? {};
  }

  /** Push the open list to every watcher iff it materially changed. */
  private broadcast(rooms: Record<string, LobbyEntry>, now: number): void {
    const json = JSON.stringify({ rooms: publicList(rooms, now) });
    if (json === this.lastList) return;
    this.lastList = json;
    for (const ws of this.ctx.getWebSockets()) {
      try {
        ws.send(json);
      } catch {
        // A closing socket mid-send — it'll be reaped by the runtime.
      }
    }
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const now = Date.now();
    const rooms = await this.rooms();

    // Live browse: hand the socket the current list, then only real changes.
    if (url.pathname === '/ws' && request.headers.get('Upgrade') === 'websocket') {
      const pair = new WebSocketPair();
      const client = pair[0];
      const server = pair[1];
      this.ctx.acceptWebSocket(server);
      server.send(JSON.stringify({ rooms: publicList(rooms, now) }));
      return new Response(null, { status: 101, webSocket: client });
    }

    if (url.pathname === '/register' && request.method === 'POST') {
      const entry = (await request.json()) as Omit<LobbyEntry, 'updatedAt'>;
      rooms[entry.code] = { ...entry, updatedAt: now };
      await this.ctx.storage.put('rooms', rooms);
      await this.ctx.storage.setAlarm(now + LOBBY_TTL_MS);
      this.broadcast(rooms, now);
      return Response.json({ ok: true });
    }

    if (url.pathname === '/deregister' && request.method === 'POST') {
      const { code } = (await request.json()) as { code: string };
      if (code in rooms) {
        const rest = Object.fromEntries(Object.entries(rooms).filter(([k]) => k !== code));
        await this.ctx.storage.put('rooms', rest);
        this.broadcast(rest, now);
      }
      return Response.json({ ok: true });
    }

    if (url.pathname === '/list' && request.method === 'GET') {
      return Response.json({ rooms: publicList(rooms, now) });
    }

    if (url.pathname === '/claim' && request.method === 'POST') {
      // Consolidate into the fullest joinable room so games fill faster. This
      // is a WRITE: reserve the seat now so a second concurrent Quick Play
      // can't also claim it before the real GameRoom heartbeat lands.
      const claimed = claimRoom(rooms, now);
      if (claimed.code !== null) {
        await this.ctx.storage.put('rooms', claimed.rooms);
        this.broadcast(claimed.rooms, now);
      }
      return Response.json({ code: claimed.code });
    }

    return new Response('Not found', { status: 404 });
  }

  /** Prune expired entries; re-arm while any remain. */
  async alarm(): Promise<void> {
    const now = Date.now();
    const { rooms, changed } = pruneExpired(await this.rooms(), now);
    if (changed) {
      await this.ctx.storage.put('rooms', rooms);
      this.broadcast(rooms, now);
    }
    if (Object.keys(rooms).length > 0) await this.ctx.storage.setAlarm(now + LOBBY_TTL_MS);
  }

  /** Watchers never speak (ping/pong is auto-answered) — nothing to do. */
  webSocketMessage(): void {}
  webSocketClose(): void {}
  webSocketError(): void {}
}

/** Resolve the singleton Lobby DO stub, or null when the binding is absent
 * (tests / no-binding envs). */
export function lobbyStub(env: Env): DurableObjectStub | null {
  const ns = env.LOBBY;
  if (ns === undefined) return null;
  return ns.get(ns.idFromName('lobby'));
}
