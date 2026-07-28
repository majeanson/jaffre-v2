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
  readonly you: { readonly score: number; readonly tricks: number; readonly rank: number } | null;
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
