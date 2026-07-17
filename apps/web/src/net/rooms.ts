import type { Roster } from '@jaffre/protocol';

/**
 * A local record of the tables this browser has sat at — powers the home
 * "Your tables" row. Kept in localStorage (no server "list my rooms" endpoint
 * exists); each snapshot is the last roster we saw for that room, so the row
 * shows who was there and the standing-table tally without reconnecting.
 * Live turn status isn't known offline, so the row leads with recency, not a
 * fabricated "your turn".
 */
export interface TableEntry {
  readonly code: string;
  /** Date.now() of the last roster snapshot for this room. */
  readonly updatedAt: number;
  readonly started: boolean;
  readonly seriesWins?: readonly [number, number];
  /** Last-known seats (name + bot flag), for the avatar stack. */
  readonly seats: readonly { readonly name: string; readonly isBot: boolean }[];
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

/** Upsert a snapshot of `code` from the latest roster (called on every roster). */
export function rememberTable(code: string, roster: Roster): void {
  const entry: TableEntry = {
    code,
    updatedAt: Date.now(),
    started: roster.started,
    ...(roster.seriesWins !== undefined ? { seriesWins: roster.seriesWins } : {}),
    seats: roster.seats
      .filter((s): s is NonNullable<typeof s> => s !== null)
      .map((s) => ({ name: s.name, isBot: s.isBot })),
  };
  const next = [entry, ...listTables().filter((t) => t.code !== code)].slice(0, MAX);
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // Storage full / unavailable (private mode) — the row just won't persist.
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
