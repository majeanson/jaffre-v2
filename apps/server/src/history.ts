/**
 * Game-history record assembly, kept as a pure function of (room meta, final
 * state, action log) so it is unit-testable without a database. GameRoom
 * writes the returned record to D1 after game_over; the write path itself is
 * fire-safe (try/catch, skipped when no DB binding) and never touches the
 * live game path.
 */
import type { Action, GameState, RoundSummary } from '@jaffre/engine';

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

/** A game's "memorable" flags — booleans, so `handleHistory` can attach them
 * to every row without a client-side re-derivation. At most one is ever
 * SHOWN (GameRow.tsx picks one chip, priority hailMary > comeback > sweep),
 * but a game can trigger more than one and the caller decides. */
export interface MemorableFlags {
  readonly hailMary: boolean;
  readonly sweep: boolean;
  readonly comeback: boolean;
}

/** A round whose contract was a MADE 12-sans-atout — the boldest legal
 * declaration on the bid ladder (rules.ts: BID_VALUES tops out at 12).
 * Independent of whether this game's own `hailMary12` house rule was ON:
 * naming and making the biggest possible bid is memorable either way. */
function isHailMaryRound(s: RoundSummary): boolean {
  return s.contract.value === 12 && s.contract.sansAtout && s.contractMade;
}

/** A round where one team captured all 8 tricks. `trickCounts` is absent on
 * summaries scored before that field existed — undetermined there, so it
 * reads as no sweep rather than guessing from trickPoints alone (a sweep
 * without the red 0 nets only 8, indistinguishable from a strong round). */
function isSweepRound(s: RoundSummary): boolean {
  if (s.trickCounts === undefined) return false;
  const [seat0, seat1, seat2, seat3] = s.trickCounts;
  return seat0 + seat2 === 8 || seat1 + seat3 === 8;
}

/** How far behind (in points) counts as a story, not a coin toss — about a
 * quarter of TARGET_SCORE (41, rules.ts), the same ballpark as a single made
 * sans-atout contract swinging the board. */
const COMEBACK_MARGIN = 10;

/**
 * Memorable-game flags, derived from the round-by-round history alone:
 * - hailMary: some round was a made 12 sans-atout.
 * - sweep: some round saw one team take every trick.
 * - comeback: the team that WON the game was trailing by COMEBACK_MARGIN or
 *   more after some round strictly before the last one — a deficit big
 *   enough that the finish reads as a turnaround. (The last round is
 *   excluded because every winner is, trivially, ahead at the very end —
 *   the question is whether they were ever meaningfully behind before it.)
 */
export function memorableFlags(
  roundSummaries: readonly RoundSummary[],
  winnerTeam: 0 | 1 | null,
): MemorableFlags {
  const hailMary = roundSummaries.some(isHailMaryRound);
  const sweep = roundSummaries.some(isSweepRound);
  let comeback = false;
  if (winnerTeam !== null) {
    const loserTeam = winnerTeam === 0 ? 1 : 0;
    for (let i = 0; i < roundSummaries.length - 1; i++) {
      const s = roundSummaries[i];
      if (s !== undefined && s.scores[loserTeam] - s.scores[winnerTeam] >= COMEBACK_MARGIN) {
        comeback = true;
        break;
      }
    }
  }
  return { hailMary, sweep, comeback };
}
