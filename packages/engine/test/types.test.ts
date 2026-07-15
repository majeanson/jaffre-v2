import { describe, expect, it } from 'vitest';
import { cardId, nextSeat, sameCard, teamOf } from '../src/types.js';

describe('helpers', () => {
  it('teamOf maps seats 0&2 to team 0, 1&3 to team 1', () => {
    expect(teamOf(0)).toBe(0);
    expect(teamOf(1)).toBe(1);
    expect(teamOf(2)).toBe(0);
    expect(teamOf(3)).toBe(1);
  });

  it('nextSeat rotates left around the table', () => {
    expect(nextSeat(0)).toBe(1);
    expect(nextSeat(3)).toBe(0);
  });

  it('cardId and sameCard agree', () => {
    expect(cardId({ suit: 'red', value: 0 })).toBe('red-0');
    expect(sameCard({ suit: 'red', value: 0 }, { suit: 'red', value: 0 })).toBe(true);
    expect(sameCard({ suit: 'red', value: 0 }, { suit: 'red', value: 1 })).toBe(false);
    expect(sameCard({ suit: 'red', value: 0 }, { suit: 'blue', value: 0 })).toBe(false);
  });
});
