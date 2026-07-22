/**
 * Elo-like skill rating for the leaderboard. Pure and DB-free so the update
 * math is unit-testable exactly like history.ts / awards.ts. GameRoom feeds it
 * the finished game's seats + winner and the players' current ratings, then
 * writes the returned updates to D1.
 *
 * A Jaffre game is a 2v2 partnership, so a team's rating is the average of its
 * humans' ratings, and both humans on a team move by the same amount. To keep
 * the ladder a PvP measure (not a bot-farm), a game is only rated when EACH
 * team has at least one human; bots are ignored in the team averages.
 */

export const DEFAULT_RATING = 1000;
const K = 24;

export interface RatingPlayer {
  readonly seat: number;
  readonly userId: string | null;
  readonly isBot: 0 | 1;
}

export interface CurrentRating {
  readonly rating: number;
  readonly ratingGames: number;
}

export interface RatingUpdate {
  readonly userId: string;
  readonly rating: number;
  readonly ratingGames: number;
}

/** Expected score of A vs B under the logistic Elo curve. */
function expected(ratingA: number, ratingB: number): number {
  return 1 / (1 + 10 ** ((ratingB - ratingA) / 400));
}

/**
 * The rating updates for a finished game. Returns [] (no change) when the game
 * was undecided or either team has no human — the two cases where a rating move
 * would be meaningless or farmable.
 */
export function ratingUpdates(
  players: readonly RatingPlayer[],
  winnerTeam: number | null,
  current: Readonly<Record<string, CurrentRating>>,
): readonly RatingUpdate[] {
  if (winnerTeam !== 0 && winnerTeam !== 1) return [];

  const humans: readonly [string[], string[]] = [[], []];
  for (const p of players) {
    if (p.isBot === 1 || p.userId === null) continue;
    humans[(p.seat % 2) as 0 | 1].push(p.userId);
  }
  if (humans[0].length === 0 || humans[1].length === 0) return [];

  const ratingOf = (userId: string): number => current[userId]?.rating ?? DEFAULT_RATING;
  const teamAvg = (team: 0 | 1): number => {
    const ids = humans[team];
    return ids.reduce((sum, id) => sum + ratingOf(id), 0) / ids.length;
  };
  const avg0 = teamAvg(0);
  const avg1 = teamAvg(1);
  const expectedByTeam = [expected(avg0, avg1), expected(avg1, avg0)] as const;

  const updates: RatingUpdate[] = [];
  for (const team of [0, 1] as const) {
    const actual = winnerTeam === team ? 1 : 0;
    for (const userId of humans[team]) {
      const cur = current[userId] ?? { rating: DEFAULT_RATING, ratingGames: 0 };
      updates.push({
        userId,
        rating: cur.rating + K * (actual - expectedByTeam[team]),
        ratingGames: cur.ratingGames + 1,
      });
    }
  }
  return updates;
}
