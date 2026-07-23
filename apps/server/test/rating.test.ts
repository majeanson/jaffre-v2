import { describe, expect, it } from 'vitest';
import { DEFAULT_RATING, ratingUpdates, type RatingPlayer } from '../src/rating.js';

/** Four humans, one per seat (teams are seat % 2). */
const FOUR_HUMANS: readonly RatingPlayer[] = [
  { seat: 0, userId: 'a', isBot: 0 },
  { seat: 1, userId: 'b', isBot: 0 },
  { seat: 2, userId: 'c', isBot: 0 },
  { seat: 3, userId: 'd', isBot: 0 },
];

describe('ratingUpdates', () => {
  it('makes no change for an undecided game', () => {
    expect(ratingUpdates(FOUR_HUMANS, null, {})).toEqual([]);
  });

  it('makes no change when a team has no human (bot-farm guard)', () => {
    const oneTeamBots: readonly RatingPlayer[] = [
      { seat: 0, userId: 'a', isBot: 0 },
      { seat: 1, userId: null, isBot: 1 },
      { seat: 2, userId: 'c', isBot: 0 },
      { seat: 3, userId: null, isBot: 1 },
    ];
    expect(ratingUpdates(oneTeamBots, 0, {})).toEqual([]);
  });

  it('moves winners up and losers down by the same amount at equal ratings', () => {
    const updates = ratingUpdates(FOUR_HUMANS, 0, {});
    const rating = (id: string): number =>
      updates.find((u) => u.userId === id)?.rating ?? Number.NaN;
    // Team 0 (a,c) won; team 1 (b,d) lost. Equal ratings → expected 0.5 → ±12.
    expect(rating('a')).toBeCloseTo(DEFAULT_RATING + 12);
    expect(rating('c')).toBeCloseTo(DEFAULT_RATING + 12);
    expect(rating('b')).toBeCloseTo(DEFAULT_RATING - 12);
    expect(rating('d')).toBeCloseTo(DEFAULT_RATING - 12);
    // Every human plays one rated game.
    for (const u of updates) expect(u.ratingGames).toBe(1);
    // Zero-sum at equal ratings.
    expect(updates.reduce((s, u) => s + (u.rating - DEFAULT_RATING), 0)).toBeCloseTo(0);
  });

  it('rewards an underdog win more than a favourite win (team-average Elo)', () => {
    // Team 0 (a,c) are underdogs at 1000 vs team 1 (b,d) at 1400.
    const current = {
      a: { rating: 1000, ratingGames: 5 },
      c: { rating: 1000, ratingGames: 5 },
      b: { rating: 1400, ratingGames: 5 },
      d: { rating: 1400, ratingGames: 5 },
    };
    const upset = ratingUpdates(FOUR_HUMANS, 0, current);
    const aGain = (upset.find((u) => u.userId === 'a')?.rating ?? 0) - 1000;
    expect(aGain).toBeGreaterThan(12); // more than an even-odds win
    expect(upset.find((u) => u.userId === 'a')?.ratingGames).toBe(6);
  });

  it("exposes delta as the exact move applied to each player's old rating", () => {
    // The delta lets a caller re-apply the same move on top of a freshly re-read
    // rating (cross-room race retry) instead of re-deriving it from `rating`.
    const current = {
      a: { rating: 1000, ratingGames: 5 },
      c: { rating: 1000, ratingGames: 5 },
      b: { rating: 1400, ratingGames: 5 },
      d: { rating: 1400, ratingGames: 5 },
    };
    const updates = ratingUpdates(FOUR_HUMANS, 0, current);
    for (const u of updates) {
      const oldRating = current[u.userId as keyof typeof current].rating;
      expect(u.rating - oldRating).toBeCloseTo(u.delta);
    }
  });
});
