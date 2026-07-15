/**
 * Game-history record assembly, kept as a pure function of (room meta, final
 * state, action log) so it is unit-testable without a database. GameRoom
 * writes the returned record to D1 after game_over; the write path itself is
 * fire-safe (try/catch, skipped when no DB binding) and never touches the
 * live game path.
 */
import type { Action, GameState } from '@jaffre/engine';

/** Mirror of GameRoom's SeatOwner: a userId, a bot marker, or empty. */
export type SeatOwnerLike = string | { readonly bot: true } | null;

export interface LogEntryLike {
  readonly seq: number;
  readonly action: Action;
}

export interface GameRecord {
  readonly id: string;
  readonly room_code: string;
  readonly seed: number;
  readonly started_at: number | null;
  readonly finished_at: number;
  readonly winner_team: number | null;
  readonly score_0: number;
  readonly score_1: number;
  /** JSON array of the ordered engine actions. */
  readonly action_log: string;
  readonly players: readonly {
    readonly seat: number;
    readonly user_id: string | null;
    readonly is_bot: 0 | 1;
  }[];
}

export function gameRecordFrom(
  meta: {
    readonly roomCode: string;
    readonly startedAt: number | null;
    readonly seats: readonly SeatOwnerLike[];
  },
  state: GameState,
  log: readonly LogEntryLike[],
  ids: { readonly id: string; readonly finishedAt: number },
): GameRecord {
  const actions = [...log].sort((a, b) => a.seq - b.seq).map((entry) => entry.action);
  return {
    id: ids.id,
    room_code: meta.roomCode,
    seed: state.seed,
    started_at: meta.startedAt,
    finished_at: ids.finishedAt,
    winner_team: state.winner,
    score_0: state.scores[0],
    score_1: state.scores[1],
    action_log: JSON.stringify(actions),
    players: meta.seats.map((owner, seat) => ({
      seat,
      user_id: typeof owner === 'string' ? owner : null,
      is_bot: typeof owner === 'object' && owner !== null ? 1 : 0,
    })),
  };
}
