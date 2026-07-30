import type { Action, Suit } from '@jaffre/engine';
import { getGuestToken } from './auth.js';
import { playerName } from './socket.js';

/**
 * Read-only history + replay fetches. Identity mirrors the socket's rule so
 * "your games" match how they were recorded: a signed guest token (Bearer)
 * when the server has a SESSION_SECRET, else the plain jaffre-uid (?u=).
 */

export interface HistoryPlayer {
  readonly seat: number;
  readonly name: string;
  readonly isBot: boolean;
}

export interface HistoryGame {
  readonly id: string;
  readonly roomCode: string;
  readonly finishedAt: number | null;
  readonly winnerTeam: number | null;
  readonly scores: readonly [number, number];
  readonly yourSeat: number;
  readonly players: readonly HistoryPlayer[];
  /**
   * Memorable-game flags (server-derived from round_summaries — see
   * `memorableFlags` in apps/server/src/history.ts). Optional: a client can
   * outrun its server, and head2head's SharedGame (which reuses HistoryGame's
   * shape) doesn't compute them at all. GameRow.tsx shows at most one chip,
   * reading each as `?? false`.
   */
  readonly hailMary?: boolean;
  readonly sweep?: boolean;
  readonly comeback?: boolean;
}

export interface ReplayData {
  readonly seed: number;
  readonly actions: readonly Action[];
  readonly players?: readonly HistoryPlayer[];
  /** Same D1 row `/api/history` lists this game from — feeds the replay
   * header (Replay.tsx). Optional: a scene/demo replay (no real game id)
   * carries none of these, and older cached responses may predate them. */
  readonly roomCode?: string;
  readonly finishedAt?: number | null;
  readonly winnerTeam?: number | null;
  readonly scores?: readonly [number, number];
}

/** One mastery lane: contracts declared in a given trump, and how many stood. */
export interface MasteryLane {
  readonly attempted: number;
  readonly made: number;
}

export interface StatsPartner {
  /** Their PUBLIC id — the head-to-head link's address. Optional because a
   * client can outrun its server (an older worker answers without it), in
   * which case the tile stays a plain fact instead of a link. */
  readonly pid?: string;
  readonly name: string;
  readonly games: number;
  readonly wins: number;
}

/** The opponent who has beaten you most (min 2 games faced). */
export interface StatsNemesis {
  readonly pid?: string;
  readonly name: string;
  readonly games: number;
  readonly losses: number;
}

/** Someone you've shared 3+ games with, partnered or opposed. */
export interface StatsRegular {
  readonly pid: string;
  readonly name: string;
  readonly withGames: number;
  readonly vsGames: number;
}

export interface Stats {
  readonly games: number;
  readonly wins: number;
  readonly winRate: number;
  /** Your team's final-score margin summed across every finished game. */
  readonly netPoints: number;
  readonly bids: { readonly attempted: number; readonly made: number };
  readonly sansAtout: { readonly attempted: number; readonly made: number };
  /**
   * Contracts you declared, split by the trump you named. Only the four suits
   * live here — the sans-atout lane is the `sansAtout` field above, not a
   * duplicate counter.
   *
   * Optional because a client can outrun its server: an older worker (or a
   * cached response) returns stats without it. Read through `masteryOf()`
   * rather than indexing directly.
   */
  readonly mastery?: Readonly<Record<Suit, MasteryLane>>;
  readonly bestPartner: StatsPartner | null;
  readonly nemesis: StatsNemesis | null;
  /** The people you keep sitting with, most-played first. Optional for the
   * same reason as `mastery` — read it as `?? []`. */
  readonly regulars?: readonly StatsRegular[];
  readonly streak: { readonly current: number; readonly best: number };
  /** Games watched to the end as a spectator. Optional for the same reason as
   * `mastery`: a client can outrun its server. Read it as `?? 0`. */
  readonly spectated?: number;
}

/** Auth headers/query for a request scoped to "your" identity, mirroring the
 * socket's rule: a signed guest token (Bearer) when the server has a
 * SESSION_SECRET, else the plain jaffre-uid (?u=). Null when neither exists
 * yet — callers treat that as "nothing to show" rather than fetching. */
export async function authedFetch(path: string, init?: RequestInit): Promise<Response | null> {
  const token = await getGuestToken(playerName());
  if (token !== null) {
    return fetch(path, {
      ...init,
      headers: { ...init?.headers, Authorization: `Bearer ${token.token}` },
    });
  }
  const uid = localStorage.getItem('jaffre-uid');
  if (uid === null) return null;
  const sep = path.includes('?') ? '&' : '?';
  return fetch(`${path}${sep}u=${encodeURIComponent(uid)}`, init);
}

/** How long a resolved stats/history fetch stays reusable. Home → Corner →
 * Journey → Stats → Awards can each want the same read within seconds of one
 * another; a game finishing on the felt (table/ hooks) is the only thing
 * that makes a cached read stale sooner, and that path isn't wired to bust
 * the cache yet (no obvious non-table hook) — the TTL alone bounds the
 * staleness to this window. */
const CACHE_TTL_MS = 30_000;

/** The identity a cached read is scoped to — mirrors authedFetch's own rule
 * (Bearer token, else the plain uid) so a login/guest-identity switch never
 * serves someone else's cached record. */
async function identityKey(): Promise<string> {
  const token = await getGuestToken(playerName());
  if (token !== null) return `t:${token.token}`;
  const uid = localStorage.getItem('jaffre-uid');
  return uid !== null ? `u:${uid}` : 'anon';
}

interface CacheEntry<T> {
  readonly identity: string;
  readonly at: number;
  readonly promise: Promise<T>;
}

/** Wraps a fetcher with in-flight dedupe (two callers within the same tick
 * share one request) AND a short TTL reuse of the resolved value, both keyed
 * on the current identity. A rejected fetch clears the entry so the next
 * call retries instead of caching the failure. */
export function cached<T>(fetcher: () => Promise<T>): {
  readonly run: () => Promise<T>;
  readonly bust: () => void;
} {
  let entry: CacheEntry<T> | null = null;
  const run = async (): Promise<T> => {
    const identity = await identityKey();
    const now = Date.now();
    if (entry !== null && entry.identity === identity && now - entry.at < CACHE_TTL_MS) {
      return entry.promise;
    }
    const promise = fetcher();
    entry = { identity, at: now, promise };
    promise.catch(() => {
      if (entry?.promise === promise) entry = null;
    });
    return promise;
  };
  return { run, bust: () => (entry = null) };
}

/** Games per page — mirrors HISTORY_PAGE_SIZE in apps/server/src/routes/games.ts
 * (the server owns the real LIMIT; this is only for "did that look like a full
 * page, so Show more might find another one"). */
export const HISTORY_PAGE_SIZE = 20;

async function fetchHistoryPageUncached(before?: number): Promise<readonly HistoryGame[]> {
  const path = before === undefined ? '/api/history' : `/api/history?before=${String(before)}`;
  const res = await authedFetch(path);
  if (res === null) return []; // no identity established yet → nothing to show
  if (!res.ok) throw new Error(`history ${String(res.status)}`);
  const data = (await res.json()) as { games: readonly HistoryGame[] };
  return data.games;
}

const historyCache = cached(() => fetchHistoryPageUncached());

/** Page one of "your games" — the only page that's cached (see CACHE_TTL_MS). */
export function fetchHistory(): Promise<readonly HistoryGame[]> {
  return historyCache.run();
}

/** The next page, older than `before` (a finishedAt cursor — pass the last
 * loaded row's `finishedAt`). Deliberately NOT cached: it's a one-shot "Show
 * more" tap, not a read multiple screens share, and caching it risks handing
 * back a stale older page on a second click. */
export function fetchHistoryPage(before: number): Promise<readonly HistoryGame[]> {
  return fetchHistoryPageUncached(before);
}

export async function fetchReplay(gameId: string): Promise<ReplayData> {
  const res = await fetch(`/api/replay/${encodeURIComponent(gameId)}`);
  if (!res.ok) throw new Error(`replay ${String(res.status)}`);
  return (await res.json()) as ReplayData;
}

const EMPTY_STATS: Stats = {
  games: 0,
  wins: 0,
  winRate: 0,
  netPoints: 0,
  bids: { attempted: 0, made: 0 },
  sansAtout: { attempted: 0, made: 0 },
  bestPartner: null,
  nemesis: null,
  streak: { current: 0, best: 0 },
};

async function fetchStatsUncached(): Promise<Stats> {
  const res = await authedFetch('/api/stats');
  if (res === null) return EMPTY_STATS; // no identity established yet → nothing to show
  if (!res.ok) throw new Error(`stats ${String(res.status)}`);
  return (await res.json()) as Stats;
}

const statsCache = cached(fetchStatsUncached);

export function fetchStats(): Promise<Stats> {
  return statsCache.run();
}

/** One shared game, in the history row shape (so the same row component
 * renders it) plus which side of the table they were on. */
export interface SharedGame extends HistoryGame {
  readonly side: 'with' | 'vs';
}

/** Your record with and against one other player, addressed by their public
 * id. `name` is null when you have never shared a table with them. */
export interface HeadToHead {
  readonly pid: string;
  readonly name: string | null;
  readonly together: { readonly games: number; readonly wins: number };
  readonly against: { readonly games: number; readonly wins: number };
  readonly games: readonly SharedGame[];
}

/** Deliberately NOT cached: it is one screen's read, opened on purpose, and a
 * stale head-to-head right after a game with that very person is exactly the
 * wrong answer to give. */
export async function fetchHeadToHead(pid: string): Promise<HeadToHead> {
  const res = await authedFetch(`/api/head2head?vs=${encodeURIComponent(pid)}`);
  if (res === null || !res.ok) throw new Error(`head2head ${String(res?.status ?? 'no-identity')}`);
  return (await res.json()) as HeadToHead;
}

/** Drop the cached stats/history reads — call this after something that
 * changes them server-side (a finished game, a stat award grant) so the next
 * fetch sees fresh numbers instead of waiting out the TTL. Wired to the
 * game_over view (net/socket.ts) and the XP strip's re-read
 * (table/XpStrip.tsx); the 30s TTL bounds staleness everywhere else. */
export function bustStatsCache(): void {
  statsCache.bust();
  historyCache.bust();
  leaderboardCache.bust();
}

export interface LeaderboardRow {
  readonly id: string;
  readonly name: string;
  readonly color: string | null;
  /** Pixel-art avatar (data URL) — same field every other roster carries, so
   * a ladder row can show a real AvatarChip instead of just an initial. */
  readonly paint?: string | null;
  readonly rating: number;
  readonly ratingGames: number;
}

export interface Leaderboard {
  readonly top: readonly LeaderboardRow[];
  /** The caller's own standing when ranked (>= min games), else null. */
  readonly you: (LeaderboardRow & { readonly rank: number }) | null;
}

async function fetchLeaderboardUncached(): Promise<Leaderboard> {
  // Authed when possible (so the board can mark "you"), but the board is public
  // — fall back to an anonymous fetch when no identity exists yet.
  const res = (await authedFetch('/api/leaderboard')) ?? (await fetch('/api/leaderboard'));
  if (!res.ok) throw new Error(`leaderboard ${String(res.status)}`);
  return (await res.json()) as Leaderboard;
}

/** One row of THIS MONTH's board. A different shape from the all-time ladder
 * on purpose: it answers a different question (who has won the most this
 * month) and carries no rating, because no per-game rating delta is stored
 * anywhere to build a monthly Elo from. */
export interface MonthlyRow {
  readonly id: string;
  readonly name: string;
  readonly color: string | null;
  readonly paint?: string | null;
  readonly games: number;
  readonly wins: number;
  readonly net: number;
  readonly rank: number;
}

export interface MonthlyLeaderboard {
  readonly top: readonly MonthlyRow[];
  readonly you: MonthlyRow | null;
}

async function fetchMonthlyUncached(monthKey?: string): Promise<MonthlyLeaderboard> {
  const path =
    monthKey === undefined
      ? '/api/leaderboard?period=month'
      : `/api/leaderboard?period=month&month=${encodeURIComponent(monthKey)}`;
  const res = (await authedFetch(path)) ?? (await fetch(path));
  if (!res.ok) throw new Error(`monthly leaderboard ${String(res.status)}`);
  return (await res.json()) as MonthlyLeaderboard;
}

const monthlyCache = cached(() => fetchMonthlyUncached());

/**
 * Session-cached like the all-time board (30s TTL, in-flight-deduped) — but
 * ONLY the current month (no `monthKey`). An archived month ('yyyy-mm', from
 * the "Last month →" flip) is a deliberate, occasional read rather than a hot
 * path shared by every caller, so it goes straight to the network instead of
 * sharing — and potentially colliding with — the single current-month cache
 * slot.
 */
export function fetchMonthlyLeaderboard(monthKey?: string): Promise<MonthlyLeaderboard> {
  return monthKey === undefined ? monthlyCache.run() : fetchMonthlyUncached(monthKey);
}

const leaderboardCache = cached(fetchLeaderboardUncached);

/** Session-cached (30s TTL, in-flight-deduped) — PlayerPeek and every other
 * caller (Leaderboard screen, Home) share one read instead of each refetching
 * on open. See `cached()` above. */
export function fetchLeaderboard(): Promise<Leaderboard> {
  return leaderboardCache.run();
}
