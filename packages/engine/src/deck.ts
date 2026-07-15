import type { Card, Seat } from './types.js';
import { SUITS, VALUES } from './types.js';
import { hashSeed, mulberry32 } from './rng.js';

/** The full 32-card deck in canonical order (suit-major, ascending values). */
export function buildDeck(): Card[] {
  return SUITS.flatMap((suit) => VALUES.map((value) => ({ suit, value })));
}

/** Fisher-Yates over the canonical deck, seeded by (seed, round). */
export function shuffledDeck(seed: number, round: number): Card[] {
  const rng = mulberry32(hashSeed(seed, round));
  const deck = buildDeck();
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const a = deck[i] as Card;
    deck[i] = deck[j] as Card;
    deck[j] = a;
  }
  return deck;
}

/** Deal 8 cards to each seat, in blocks, from a shuffled deck. */
export function deal(seed: number, round: number): Card[][] {
  const deck = shuffledDeck(seed, round);
  const hands: Card[][] = [[], [], [], []];
  deck.forEach((card, i) => {
    (hands[i % 4] as Card[]).push(card);
  });
  return hands;
}

export function handOf(hands: readonly (readonly Card[])[], seat: Seat): readonly Card[] {
  return hands[seat] as readonly Card[];
}
