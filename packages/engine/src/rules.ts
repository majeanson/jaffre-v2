/**
 * Jaffre rules & scoring — the canonical reference. Keep this in sync with the
 * player-facing copy in apps/web/src/help/HelpSheet.tsx and the bot bid
 * evaluator in packages/bots/src/evaluate.ts.
 *
 * DECK: 32 cards — 4 suits (red, brown, green, blue) × values 0-7. 8 cards dealt
 * to each of 4 seats; partners sit across (teams are seat % 2).
 *
 * TRUMP: whatever suit the declarer LEADS FIRST becomes trump (sans-atout = no
 * trump at all). Highest trump wins a trick, else highest card of the led suit;
 * you must follow the led suit when you can.
 *
 * POINTS (per round, 11 total): each trick is worth 1, +5 if it contains the
 * red 0 (the prize), −2 if it contains the brown 0 (the trap). 8 + 5 − 2 = 11.
 *
 * BIDDING: one round, dealer last. A bid of 7-12 promises the contract team
 * captures at least that many points; sans-atout doubles the stake. If all four
 * pass, the dealer is FORCED to a plain 7. Higher value or (at equal value)
 * sans-atout outbids.
 *
 * SETTLEMENT (see reducer.ts scoreRound): the contract team scores +stake if it
 * makes the contract, −stake if it misses (stake = value, ×2 sans-atout). The
 * DEFENDERS ALWAYS KEEP THEIR CAPTURED POINTS, win or lose. First team to 41
 * wins (TARGET_SCORE).
 *
 * STRATEGIC CONSEQUENCE (drives bot bidding): because a miss is −value AND the
 * defenders still bank their points, bidding is a real gamble while passing
 * quietly collects defensive points. So opening marginal hands is −EV — it's
 * correct to pass often and let weak auctions fall to the forced dealer-7. When
 * a hand IS worth bidding, bid the value it can actually make (a made 9 scores
 * more than a made 7), not a timid minimum.
 */
import type { Card, Suit, Team, TrickPlay } from './types.js';
import { sameCard } from './types.js';

export const RED_ZERO: Card = { suit: 'red', value: 0 };
export const BROWN_ZERO: Card = { suit: 'brown', value: 0 };

/** Cards a hand may legally play: must follow the led suit when possible. */
export function legalCards(hand: readonly Card[], ledSuit: Suit | null): readonly Card[] {
  if (ledSuit === null) return hand;
  const following = hand.filter((c) => c.suit === ledSuit);
  return following.length > 0 ? following : hand;
}

/** Winner of a completed 4-card trick: highest trump, else highest of the led suit. */
export function trickWinner(trick: readonly TrickPlay[], trump: Suit | null): TrickPlay {
  const ledSuit = (trick[0] as TrickPlay).card.suit;
  const rankedSuit = trump !== null && trick.some((p) => p.card.suit === trump) ? trump : ledSuit;
  let best = trick[0] as TrickPlay;
  for (const play of trick) {
    if (
      play.card.suit === rankedSuit &&
      (best.card.suit !== rankedSuit || play.card.value > best.card.value)
    ) {
      best = play;
    }
  }
  return best;
}

/** Trick value: 1, +5 if it contains the red 0, −2 if it contains the brown 0. */
export function trickPoints(cards: readonly Card[]): {
  points: number;
  specials: ('red_zero' | 'brown_zero')[];
} {
  let points = 1;
  const specials: ('red_zero' | 'brown_zero')[] = [];
  if (cards.some((c) => sameCard(c, RED_ZERO))) {
    points += 5;
    specials.push('red_zero');
  }
  if (cards.some((c) => sameCard(c, BROWN_ZERO))) {
    points -= 2;
    specials.push('brown_zero');
  }
  return { points, specials };
}

/** Total trick points in a round is invariant: 8 tricks + 5 (red 0) − 2 (brown 0). */
export const ROUND_TOTAL_POINTS = 11;

/** First team to reach this score wins. */
export const TARGET_SCORE = 41;

/**
 * Winner once a round is scored (M3 ruling, 2026-07-15): if both teams cross
 * the target in the same round, the higher total wins; the contract team wins
 * only an exact tie.
 */
export function decideWinner(scores: readonly [number, number], contractTeam: Team): Team | null {
  const aWins = scores[0] >= TARGET_SCORE;
  const bWins = scores[1] >= TARGET_SCORE;
  if (!aWins && !bWins) return null;
  if (aWins && !bWins) return 0;
  if (bWins && !aWins) return 1;
  if (scores[0] !== scores[1]) return scores[0] > scores[1] ? 0 : 1;
  return contractTeam;
}
