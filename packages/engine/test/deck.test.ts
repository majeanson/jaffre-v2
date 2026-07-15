import { describe, expect, it } from 'vitest';
import { buildDeck, deal, handOf, shuffledDeck } from '../src/deck.js';
import { cardId, SUITS } from '../src/types.js';

describe('buildDeck', () => {
  it('has 32 unique cards, 8 per suit', () => {
    const deck = buildDeck();
    expect(deck).toHaveLength(32);
    expect(new Set(deck.map(cardId)).size).toBe(32);
    for (const suit of SUITS) {
      expect(deck.filter((c) => c.suit === suit)).toHaveLength(8);
    }
  });
});

describe('shuffledDeck', () => {
  it('is a permutation of the full deck', () => {
    const shuffled = shuffledDeck(1234, 0);
    expect(new Set(shuffled.map(cardId)).size).toBe(32);
  });

  it('is deterministic per (seed, round) and varies across rounds', () => {
    expect(shuffledDeck(5, 1).map(cardId)).toEqual(shuffledDeck(5, 1).map(cardId));
    expect(shuffledDeck(5, 1).map(cardId)).not.toEqual(shuffledDeck(5, 2).map(cardId));
    expect(shuffledDeck(5, 1).map(cardId)).not.toEqual(shuffledDeck(6, 1).map(cardId));
  });
});

describe('deal', () => {
  it('gives each seat 8 cards covering the whole deck', () => {
    const hands = deal(42, 0);
    expect(hands).toHaveLength(4);
    for (const hand of hands) expect(hand).toHaveLength(8);
    const all = hands.flat().map(cardId);
    expect(new Set(all).size).toBe(32);
  });

  it('handOf returns the seat hand', () => {
    const hands = deal(42, 0);
    expect(handOf(hands, 2)).toBe(hands[2]);
  });
});
