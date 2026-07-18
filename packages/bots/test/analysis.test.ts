import { describe, expect, it } from 'vitest';
import type { Card, SeatView, Suit, TrickPlay } from '@jaffre/engine';
import { brownZeroLive, equivalenceRuns, lowestEquivalent, tricksPlayed } from '../src/analysis.js';

const c = (suit: Suit, value: number): Card => ({ suit, value: value as Card['value'] });

function view(partial: Partial<SeatView>): SeatView {
  return {
    viewer: 0,
    phase: 'playing',
    roundIndex: 0,
    dealer: 3,
    turn: 0,
    hand: [],
    handCounts: [8, 8, 8, 8],
    bids: [],
    contract: null,
    trump: null,
    trumpDecided: true,
    currentTrick: [],
    trickLeader: 0,
    capturedTricks: [],
    roundPoints: [0, 0],
    scores: [0, 0],
    lastRoundSummary: null,
    roundSummaries: [],
    winner: null,
    ...partial,
  };
}

const play = (seat: 0 | 1 | 2 | 3, card: Card): TrickPlay => ({ seat, card });

function capturedTrick(winner: 0 | 1 | 2 | 3, cards: Card[]): SeatView['capturedTricks'][number] {
  const plays = cards.map((card, i) => play(((winner + i) % 4) as 0 | 1 | 2 | 3, card));
  return { winner, plays, cards, points: 1 };
}

describe('equivalence runs', () => {
  it('groups touching cards when nothing outstanding sits between them', () => {
    // Hand holds green 7-6-5; every lower green is still out, so 7-6-5 is one run.
    const v = view({ hand: [c('green', 7), c('green', 6), c('green', 5), c('blue', 2)] });
    const runs = equivalenceRuns([c('green', 7), c('green', 6), c('green', 5)], v);
    expect(runs).toHaveLength(1);
    expect(runs[0]).toEqual([c('green', 5), c('green', 6), c('green', 7)]);
  });

  it('splits a run where an outstanding card wedges in', () => {
    // Green 6 is still out, so 7 and 5 are NOT equal.
    const v = view({ hand: [c('green', 7), c('green', 5)] });
    const runs = equivalenceRuns([c('green', 7), c('green', 5)], v);
    expect(runs).toHaveLength(2);
  });

  it('treats a gap as closed once the wedge card has been played', () => {
    // Green 6 already fell in a captured trick — 7 and 5 become equals.
    const v = view({
      hand: [c('green', 7), c('green', 5)],
      capturedTricks: [
        capturedTrick(1, [c('green', 6), c('green', 2), c('green', 1), c('blue', 0)]),
      ],
    });
    const runs = equivalenceRuns([c('green', 7), c('green', 5)], v);
    expect(runs).toHaveLength(1);
  });

  it('lowestEquivalent picks the cheapest member of the run', () => {
    const pool = [c('green', 7), c('green', 6), c('green', 5)];
    const v = view({ hand: [...pool, c('blue', 2)] });
    expect(lowestEquivalent(c('green', 7), pool, v)).toEqual(c('green', 5));
    expect(lowestEquivalent(c('blue', 2), pool, v)).toEqual(c('blue', 2)); // not in pool → itself
  });
});

describe('special-card liveness', () => {
  it('brownZeroLive flips off once the brown 0 has been captured or tabled', () => {
    expect(brownZeroLive(view({}))).toBe(true);
    expect(
      brownZeroLive(
        view({
          capturedTricks: [
            capturedTrick(1, [c('brown', 0), c('brown', 3), c('brown', 5), c('brown', 7)]),
          ],
        }),
      ),
    ).toBe(false);
    expect(brownZeroLive(view({ currentTrick: [play(1, c('brown', 0))] }))).toBe(false);
  });

  it('tricksPlayed counts completed tricks', () => {
    expect(tricksPlayed(view({}))).toBe(0);
    expect(
      tricksPlayed(
        view({
          capturedTricks: [capturedTrick(0, [c('red', 3), c('red', 4), c('red', 5), c('red', 6)])],
        }),
      ),
    ).toBe(1);
  });
});
