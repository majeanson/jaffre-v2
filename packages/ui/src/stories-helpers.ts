import type { CardData, SuitId } from './types.js';

export const SUITS_FOR_STORIES: readonly SuitId[] = ['red', 'brown', 'green', 'blue'];

export const SAMPLE_HAND: readonly CardData[] = [
  { suit: 'red', value: 0 },
  { suit: 'red', value: 5 },
  { suit: 'brown', value: 0 },
  { suit: 'brown', value: 6 },
  { suit: 'green', value: 2 },
  { suit: 'green', value: 7 },
  { suit: 'blue', value: 1 },
  { suit: 'blue', value: 4 },
];
