/**
 * The matchmaking registry — a single Durable Object (addressed by the
 * well-known name 'lobby') holding the set of OPEN public rooms so players can
 * Quick Play into one or browse them, which the per-room GameRoom DOs can't
 * offer on their own (they're isolated and addressed only by code).
 *
 * GameRoom pushes register/deregister as its public+waiting state changes;
 * this DO answers /list (browse) and /claim (Quick Play). Entries carry an
 * updatedAt and are pruned after LOBBY_TTL_MS so a room that died without
 * deregistering (crash, close) eventually drops off.
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

export class Lobby implements DurableObject {
  constructor(private readonly ctx: DurableObjectState) {}

  private async rooms(): Promise<Record<string, LobbyEntry>> {
    return (await this.ctx.storage.get<Record<string, LobbyEntry>>('rooms')) ?? {};
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const now = Date.now();
    const rooms = await this.rooms();

    if (url.pathname === '/register' && request.method === 'POST') {
      const entry = (await request.json()) as Omit<LobbyEntry, 'updatedAt'>;
      rooms[entry.code] = { ...entry, updatedAt: now };
      await this.ctx.storage.put('rooms', rooms);
      await this.ctx.storage.setAlarm(now + LOBBY_TTL_MS);
      return Response.json({ ok: true });
    }

    if (url.pathname === '/deregister' && request.method === 'POST') {
      const { code } = (await request.json()) as { code: string };
      if (code in rooms) {
        const rest = Object.fromEntries(Object.entries(rooms).filter(([k]) => k !== code));
        await this.ctx.storage.put('rooms', rest);
      }
      return Response.json({ ok: true });
    }

    if (url.pathname === '/list' && request.method === 'GET') {
      return Response.json({ rooms: openRooms(rooms, now).slice(0, LIST_LIMIT) });
    }

    if (url.pathname === '/claim' && request.method === 'POST') {
      // Consolidate into the fullest joinable room so games fill faster.
      return Response.json({ code: claimBest(rooms, now) });
    }

    return new Response('Not found', { status: 404 });
  }

  /** Prune expired entries; re-arm while any remain. */
  async alarm(): Promise<void> {
    const now = Date.now();
    const { rooms, changed } = pruneExpired(await this.rooms(), now);
    if (changed) await this.ctx.storage.put('rooms', rooms);
    if (Object.keys(rooms).length > 0) await this.ctx.storage.setAlarm(now + LOBBY_TTL_MS);
  }
}

/** Resolve the singleton Lobby DO stub, or null when the binding is absent
 * (tests / no-binding envs). */
export function lobbyStub(env: Env): DurableObjectStub | null {
  const ns = env.LOBBY;
  if (ns === undefined) return null;
  return ns.get(ns.idFromName('lobby'));
}
