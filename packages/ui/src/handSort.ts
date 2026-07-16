import type { CardData } from './types.js';

/** Colour grouping order for the hand sort: red, brown, green, blue. */
const SUIT_ORDER: Record<CardData['suit'], number> = {
  red: 0,
  brown: 1,
  green: 2,
  blue: 3,
};

/**
 * Sort a hand by colour then value, low→high — the classic "tidy your hand"
 * order. Returns a new array; the input is untouched.
 */
export function sortByColour(cards: readonly CardData[]): CardData[] {
  return [...cards].sort((a, b) => SUIT_ORDER[a.suit] - SUIT_ORDER[b.suit] || a.value - b.value);
}
