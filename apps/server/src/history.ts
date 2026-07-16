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
  /** JSON array of the engine's RoundSummary[] — null when the game scored no rounds. */
  readonly round_summaries: string | null;
  readonly players: readonly {
    readonly seat: number;
    readonly user_id: string | null;
    readonly is_bot: 0 | 1;
    readonly name: string;
  }[];
}

/** Bot seats are named the same way the live roster names them (roster()
 * in GameRoom). Keeping this in one place avoids the two drifting apart. */
function botSeatName(seat: number): string {
  return `Bot ${String(seat + 1)}`;
}

export function gameRecordFrom(
  meta: {
    readonly roomCode: string;
    readonly startedAt: number | null;
    readonly seats: readonly SeatOwnerLike[];
    /** userId → display name, as tracked by GameRoom.Meta.names. */
    readonly names: Readonly<Record<string, string>>;
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
    round_summaries: state.roundSummaries.length > 0 ? JSON.stringify(state.roundSummaries) : null,
    players: meta.seats.map((owner, seat) => {
      const isBot = typeof owner === 'object' && owner !== null;
      const userId = typeof owner === 'string' ? owner : null;
      return {
        seat,
        user_id: userId,
        is_bot: isBot ? 1 : 0,
        name: isBot
          ? botSeatName(seat)
          : userId !== null
            ? (meta.names[userId] ?? 'Player')
            : 'Player',
      };
    }),
  };
}
