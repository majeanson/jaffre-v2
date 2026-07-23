import type { Roster } from '@jaffre/protocol';
import { getGuestToken } from './auth.js';

/**
 * A local record of the tables this browser has sat at — powers the home
 * "Your tables" row. Kept in localStorage (there's no server "list my rooms"
 * index); each snapshot is the last roster we saw for that room. The row's
 * LIVE badge (your turn / waiting / finished) comes from a cheap per-room
 * status peek — see fetchTableStatus.
 */
export interface TableEntry {
  readonly code: string;
  /** Date.now() of the last roster snapshot for this room. */
  readonly updatedAt: number;
  readonly started: boolean;
  readonly seriesWins?: readonly [number, number];
  /** Last-known seats (name + bot flag), for the avatar stack. */
  readonly seats: readonly { readonly name: string; readonly isBot: boolean }[];
  /** Your absolute seat in this room, or null if you were spectating. */
  readonly yourSeat?: number | null;
}

/** A room's current live state, from GET /api/room/:code/status. */
export interface TableStatus {
  readonly started: boolean;
  readonly phase: string | null;
  readonly turn: number | null;
  readonly seriesWins?: readonly [number, number];
}

const KEY = 'jaffre-tables';
const MAX = 6;

/** Recently-seen tables, newest first. Tolerates absent / malformed storage. */
export function listTables(): TableEntry[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw === null) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return (parsed as TableEntry[])
      .filter((t) => typeof t.code === 'string' && typeof t.updatedAt === 'number')
      .sort((a, b) => b.updatedAt - a.updatedAt);
  } catch {
    return [];
  }
}

/** Upsert a snapshot of `code` from the latest roster (called on every roster).
 * `yourSeat` is known only from the welcome message; on plain roster updates it
 * carries over from the prior snapshot. */
export function rememberTable(code: string, roster: Roster, yourSeat?: number | null): void {
  const prior = listTables().find((t) => t.code === code);
  const seat = yourSeat !== undefined ? yourSeat : (prior?.yourSeat ?? null);
  const entry: TableEntry = {
    code,
    updatedAt: Date.now(),
    started: roster.started,
    ...(roster.seriesWins !== undefined ? { seriesWins: roster.seriesWins } : {}),
    seats: roster.seats
      .filter((s): s is NonNullable<typeof s> => s !== null)
      .map((s) => ({ name: s.name, isBot: s.isBot })),
    yourSeat: seat,
  };
  const next = [entry, ...listTables().filter((t) => t.code !== code)].slice(0, MAX);
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // Storage full / unavailable (private mode) — the row just won't persist.
  }
}

/** Peek a room's current phase/turn (cheap, unauthenticated). Null on error. */
export async function fetchTableStatus(code: string): Promise<TableStatus | null> {
  try {
    const res = await fetch(`/api/room/${encodeURIComponent(code)}/status`);
    if (!res.ok) return null;
    return (await res.json()) as TableStatus;
  } catch {
    return null;
  }
}

/**
 * Permanently give up your seat at `code` and drop its card from the row.
 * Works without a socket to the room (the home "Your tables" row); the seat
 * frees up in the lobby / after a game, or hands to a bot mid-game. The
 * server call is best-effort — the card is gone locally either way.
 */
export async function leaveTable(code: string): Promise<void> {
  forgetTable(code);
  try {
    const name = localStorage.getItem('jaffre-name') ?? 'Player';
    const auth = await getGuestToken(name);
    // ?u= is the no-secret dev fallback; ignored by the worker in token mode.
    const uid = localStorage.getItem('jaffre-uid') ?? '';
    await fetch(`/api/room/${encodeURIComponent(code)}/leave?u=${encodeURIComponent(uid)}`, {
      method: 'POST',
      ...(auth !== null ? { headers: { Authorization: `Bearer ${auth.token}` } } : {}),
    });
  } catch {
    // Offline / room gone — nothing to clean up server-side right now.
  }
}

/** An open public table in the matchmaking lobby (GET /api/rooms). */
export interface PublicRoom {
  readonly code: string;
  readonly host: string;
  readonly players: number;
  readonly capacity: number;
  readonly phase: 'waiting' | 'playing';
}

/** The browsable list of open public tables. Empty on error / lobby off. */
export async function fetchPublicRooms(): Promise<readonly PublicRoom[]> {
  try {
    const res = await fetch('/api/rooms');
    if (!res.ok) return [];
    return ((await res.json()) as { rooms: readonly PublicRoom[] }).rooms;
  } catch {
    return [];
  }
}

/** Keepalive cadence for the lobby watcher — matches the DO's ping/pong
 * auto-response so hibernated sockets aren't reaped as idle. */
const WATCH_PING_MS = 30_000;
const WATCH_RETRY_MS = 3_000;

/**
 * Watch the open-tables list live over a WebSocket — the server pushes the
 * full list on connect and again whenever it actually changes, so the lobby
 * screen never polls. Reconnects quietly while mounted; if the socket can't
 * be had at all (lobby off, old server), it falls back to one plain fetch so
 * the screen still settles. Returns an unsubscribe.
 */
export function watchPublicRooms(onRooms: (rooms: readonly PublicRoom[]) => void): () => void {
  let disposed = false;
  let ws: WebSocket | null = null;
  let pingTimer: ReturnType<typeof setInterval> | undefined;
  let retryTimer: ReturnType<typeof setTimeout> | undefined;
  let everConnected = false;

  const connect = () => {
    if (disposed) return;
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    try {
      ws = new WebSocket(`${proto}//${location.host}/api/rooms/ws`);
    } catch {
      void fetchPublicRooms().then((r) => !disposed && onRooms(r));
      return;
    }
    ws.onmessage = (e) => {
      everConnected = true;
      try {
        const { rooms } = JSON.parse(e.data as string) as { rooms: readonly PublicRoom[] };
        if (!disposed) onRooms(rooms);
      } catch {
        // 'pong' or malformed — ignore.
      }
    };
    ws.onopen = () => {
      clearInterval(pingTimer);
      pingTimer = setInterval(
        () => ws?.readyState === WebSocket.OPEN && ws.send('ping'),
        WATCH_PING_MS,
      );
    };
    ws.onclose = () => {
      clearInterval(pingTimer);
      if (disposed) return;
      // Never got a list over the socket → the feed may not exist here; give
      // the screen a settled answer, then still retry (the server may return).
      if (!everConnected) void fetchPublicRooms().then((r) => !disposed && onRooms(r));
      retryTimer = setTimeout(connect, WATCH_RETRY_MS);
    };
  };
  connect();

  return () => {
    disposed = true;
    clearInterval(pingTimer);
    clearTimeout(retryTimer);
    ws?.close();
  };
}

/** sessionStorage marker: a code the client should make public on join — any
 * room this browser just created (Quick Play or Create a room). Rooms are
 * public by default; the pre-game toggle opts DOWN to private. Consumed by
 * Lobby. */
const MAKE_PUBLIC_KEY = 'jaffre-make-public';

/** Quick Play: match into an open public table, or get a fresh code to host.
 * When we're the host of a new room, mark it to be made public on join. */
export async function quickPlay(): Promise<string> {
  try {
    const res = await fetch('/api/quickplay', { method: 'POST' });
    if (res.ok) {
      const { code, created } = (await res.json()) as { code: string; created: boolean };
      if (created) markMakePublic(code);
      return code;
    }
  } catch {
    // Fall through to a client-only fallback below.
  }
  // Lobby unreachable — host a fresh local-style code (still made public on join).
  const code = `qp-${Math.random().toString(36).slice(2, 8)}`;
  markMakePublic(code);
  return code;
}

/** Flag `code` to be made public once its creator takes a seat. */
export function markMakePublic(code: string): void {
  try {
    sessionStorage.setItem(MAKE_PUBLIC_KEY, code);
  } catch {
    // Session storage unavailable — the host can still toggle public manually.
  }
}

/** True (once) if `code` was flagged to be made public on join; clears the flag. */
export function consumeMakePublic(code: string): boolean {
  try {
    if (sessionStorage.getItem(MAKE_PUBLIC_KEY) !== code) return false;
    sessionStorage.removeItem(MAKE_PUBLIC_KEY);
    return true;
  } catch {
    return false;
  }
}

/** Drop a table from the row (e.g. the user dismisses it). */
export function forgetTable(code: string): void {
  const next = listTables().filter((t) => t.code !== code);
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // ignore
  }
}
