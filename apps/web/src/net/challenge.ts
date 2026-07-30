import type { Action, Cadence } from '@jaffre/engine';
import { authedFetch } from './history.js';

/**
 * Deal Board client. Thin on purpose: the board is server-authoritative, and
 * the only thing this sends is the action log — never a score (see
 * apps/server/src/challenge.ts for why).
 */

export interface BoardRow {
  readonly id: string;
  readonly name: string;
  readonly color: string | null;
  /** Pixel-art avatar (data URL) — same field every other roster carries, so
   * a board row can render a real AvatarChip instead of just an initial. */
  readonly paint?: string | null;
  readonly score: number;
  readonly tricks: number;
  readonly rank: number;
}

export interface ChallengeBoard {
  readonly challenge: {
    readonly id: string;
    readonly cadence: Cadence;
    readonly periodKey: string;
    readonly seed: number;
  };
  readonly board: readonly BoardRow[];
  /** Your own row. Score/tricks/rank as always; id/name/color/paint ride
   * along too so an off-page "you" can be pinned in the same AvatarChip style
   * as every other row (see DealBoard's BoardRowLink) — optional so a stale
   * cached response still degrades to the plain text line instead of
   * breaking. */
  readonly you:
    | (Partial<Pick<BoardRow, 'id' | 'name' | 'color' | 'paint'>> & {
        readonly score: number;
        readonly tricks: number;
        readonly rank: number;
      })
    | null;
  /** Everyone who posted to this board, not just the rows shown — so a share
   * line can say "#3 of 47". Absent on older responses. */
  readonly entries?: number;
  /** Your daily habit, derived server-side from challenge_scores (no stored
   * counter): the streak still alive today, and the longest one you've ever
   * strung together. `current` is 0 when the run is broken or you haven't
   * started one — `best` still reads truthfully in that case. */
  readonly streak?: { readonly current: number; readonly best: number };
}

/** Today's daily board, or a named challenge's. Null when offline / no server. */
export async function fetchBoard(challengeId?: string): Promise<ChallengeBoard | null> {
  const path =
    challengeId === undefined
      ? '/api/challenge'
      : `/api/challenge?id=${encodeURIComponent(challengeId)}`;
  try {
    const res = await authedFetch(path);
    if (res === null || !res.ok) return null;
    return (await res.json()) as ChallengeBoard;
  } catch {
    return null;
  }
}

export type SubmitResult =
  | {
      readonly ok: true;
      readonly accepted: boolean;
      readonly score: number;
      readonly tricks: number;
    }
  | { readonly ok: false; readonly reason: string };

/**
 * Submit a finished run. The server re-plays the log and decides the score;
 * `accepted: false` means a run was already recorded for this challenge (one
 * attempt each), in which case the returned score is the stored one.
 */
export async function submitRun(
  challengeId: string,
  actions: readonly Action[],
): Promise<SubmitResult> {
  try {
    const res = await authedFetch('/api/challenge/submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ challengeId, actions }),
    });
    if (res === null) return { ok: false, reason: 'offline' };
    const body = (await res.json()) as {
      accepted?: boolean;
      score?: number;
      tricks?: number;
      reason?: string;
      error?: string;
    };
    if (!res.ok) return { ok: false, reason: body.reason ?? body.error ?? 'rejected' };
    return {
      ok: true,
      accepted: body.accepted ?? false,
      score: body.score ?? 0,
      tricks: body.tricks ?? 0,
    };
  } catch {
    return { ok: false, reason: 'offline' };
  }
}
