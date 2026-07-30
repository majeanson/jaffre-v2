import { describe, expect, it } from 'vitest';
import { memorableChip, yourScore } from '../src/components/GameRow.js';
import type { HistoryGame } from '../src/net/history.js';

/** A minimal HistoryGame, only the fields these pure helpers read. */
function game(over: Partial<HistoryGame> = {}): HistoryGame {
  return {
    id: 'g1',
    roomCode: 'salon',
    finishedAt: 1000,
    winnerTeam: 0,
    scores: [41, 33],
    yourSeat: 0,
    players: [],
    ...over,
  };
}

const T = { chipHailMary: '12 SA!', chipComeback: 'Comeback', chipSweep: 'Sweep' };

describe('yourScore', () => {
  it('leads with your team when you sit on team 0 (even seat)', () => {
    expect(yourScore(game({ yourSeat: 0, scores: [41, 33] }))).toEqual([41, 33]);
    expect(yourScore(game({ yourSeat: 2, scores: [41, 33] }))).toEqual([41, 33]);
  });

  it('flips the pair when you sit on team 1 (odd seat)', () => {
    expect(yourScore(game({ yourSeat: 1, scores: [41, 33] }))).toEqual([33, 41]);
    expect(yourScore(game({ yourSeat: 3, scores: [41, 33] }))).toEqual([33, 41]);
  });
});

describe('memorableChip', () => {
  it('shows nothing when no flag is set', () => {
    expect(memorableChip(game(), T)).toBeNull();
  });

  it('prioritizes hailMary over comeback and sweep', () => {
    expect(memorableChip(game({ hailMary: true, comeback: true, sweep: true }), T)).toBe('12 SA!');
  });

  it('prioritizes comeback over sweep when hailMary is absent', () => {
    expect(memorableChip(game({ comeback: true, sweep: true }), T)).toBe('Comeback');
  });

  it('falls back to sweep alone', () => {
    expect(memorableChip(game({ sweep: true }), T)).toBe('Sweep');
  });
});
