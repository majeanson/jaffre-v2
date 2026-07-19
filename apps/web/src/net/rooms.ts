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

/** Drop a table from the row (e.g. the user dismisses it). */
export function forgetTable(code: string): void {
  const next = listTables().filter((t) => t.code !== code);
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // ignore
  }
}
