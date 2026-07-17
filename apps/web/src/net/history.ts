import type { Action } from '@jaffre/engine';
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
}

export interface ReplayData {
  readonly seed: number;
  readonly actions: readonly Action[];
  readonly players?: readonly HistoryPlayer[];
}

export interface StatsPartner {
  readonly name: string;
  readonly games: number;
  readonly wins: number;
}

/** The opponent who has beaten you most (min 2 games faced). */
export interface StatsNemesis {
  readonly name: string;
  readonly games: number;
  readonly losses: number;
}

export interface Stats {
  readonly games: number;
  readonly wins: number;
  readonly winRate: number;
  /** Your team's final-score margin summed across every finished game. */
  readonly netPoints: number;
  readonly bids: { readonly attempted: number; readonly made: number };
  readonly sansAtout: { readonly attempted: number; readonly made: number };
  readonly bestPartner: StatsPartner | null;
  readonly nemesis: StatsNemesis | null;
  readonly streak: { readonly current: number; readonly best: number };
}

/** Auth headers/query for a request scoped to "your" identity, mirroring the
 * socket's rule: a signed guest token (Bearer) when the server has a
 * SESSION_SECRET, else the plain jaffre-uid (?u=). Null when neither exists
 * yet — callers treat that as "nothing to show" rather than fetching. */
async function authedFetch(path: string): Promise<Response | null> {
  const token = await getGuestToken(playerName());
  if (token !== null) {
    return fetch(path, { headers: { Authorization: `Bearer ${token.token}` } });
  }
  const uid = localStorage.getItem('jaffre-uid');
  if (uid === null) return null;
  const sep = path.includes('?') ? '&' : '?';
  return fetch(`${path}${sep}u=${encodeURIComponent(uid)}`);
}

export async function fetchHistory(): Promise<readonly HistoryGame[]> {
  const res = await authedFetch('/api/history');
  if (res === null) return []; // no identity established yet → nothing to show
  if (!res.ok) throw new Error(`history ${String(res.status)}`);
  const data = (await res.json()) as { games: readonly HistoryGame[] };
  return data.games;
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

export async function fetchStats(): Promise<Stats> {
  const res = await authedFetch('/api/stats');
  if (res === null) return EMPTY_STATS; // no identity established yet → nothing to show
  if (!res.ok) throw new Error(`stats ${String(res.status)}`);
  return (await res.json()) as Stats;
}
