import type { Action } from '@jaffre/engine';
import { getGuestToken } from './auth.js';
import { playerName } from './socket.js';

/**
 * Read-only history + replay fetches. Identity mirrors the socket's rule so
 * "your games" match how they were recorded: a signed guest token (Bearer)
 * when the server has a SESSION_SECRET, else the plain jaffre-uid (?u=).
 */

export interface HistoryGame {
  readonly id: string;
  readonly roomCode: string;
  readonly finishedAt: number | null;
  readonly winnerTeam: number | null;
  readonly scores: readonly [number, number];
  readonly yourSeat: number;
}

export interface ReplayData {
  readonly seed: number;
  readonly actions: readonly Action[];
}

export async function fetchHistory(): Promise<readonly HistoryGame[]> {
  const token = await getGuestToken(playerName());
  let res: Response;
  if (token !== null) {
    res = await fetch('/api/history', { headers: { Authorization: `Bearer ${token.token}` } });
  } else {
    const uid = localStorage.getItem('jaffre-uid');
    if (uid === null) return []; // no identity established yet → nothing to show
    res = await fetch(`/api/history?u=${encodeURIComponent(uid)}`);
  }
  if (!res.ok) throw new Error(`history ${String(res.status)}`);
  const data = (await res.json()) as { games: readonly HistoryGame[] };
  return data.games;
}

export async function fetchReplay(gameId: string): Promise<ReplayData> {
  const res = await fetch(`/api/replay/${encodeURIComponent(gameId)}`);
  if (!res.ok) throw new Error(`replay ${String(res.status)}`);
  return (await res.json()) as ReplayData;
}
