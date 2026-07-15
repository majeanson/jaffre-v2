import type { Card, Suit, TrickPlay } from './types.js';
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
