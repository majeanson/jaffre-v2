import type { Card, SeatView } from '@jaffre/engine';
import { describe, expect, it } from 'vitest';
import { queueableCards, queueStillValid } from '../src/table/queue.js';

const c = (suit: Card['suit'], value: number): Card => ({ suit, value }) as Card;

const HAND: readonly Card[] = [c('red', 3), c('red', 7), c('green', 2), c('blue', 5)];

function makeView(overrides: Partial<SeatView> = {}): SeatView {
  return {
    viewer: 0,
    phase: 'playing',
    roundIndex: 0,
    dealer: 3,
    turn: 1,
    hand: HAND,
    handCounts: [4, 4, 4, 4],
    bids: [],
    contract: { seat: 1, value: 8, sansAtout: false },
    trump: 'green',
    trumpDecided: true,
    currentTrick: [],
    trickLeader: 1,
    capturedTricks: [],
    roundPoints: [0, 0],
    scores: [0, 0],
    lastRoundSummary: null,
    roundSummaries: [],
    winner: null,
    rules: { hailMary12: false },
    ...overrides,
  };
}

describe('queueableCards', () => {
  it('offers the whole hand when you will lead (trick empty)', () => {
    expect(queueableCards(makeView(), 0, false)).toEqual(HAND);
  });

  it('offers only legal cards once the led suit is fixed', () => {
    const view = makeView({ currentTrick: [{ seat: 1, card: c('red', 4) }] });
    expect(queueableCards(view, 0, false)).toEqual([c('red', 3), c('red', 7)]);
  });

  it('offers the whole hand when the led suit is void in your hand', () => {
    const view = makeView({
      hand: [c('green', 2), c('blue', 5)],
      currentTrick: [{ seat: 1, card: c('red', 4) }],
    });
    expect(queueableCards(view, 0, false)).toEqual([c('green', 2), c('blue', 5)]);
  });

  it('offers the whole hand once you already played in the current trick (next play is a lead)', () => {
    const view = makeView({
      currentTrick: [
        { seat: 0, card: c('blue', 5) },
        { seat: 1, card: c('blue', 1) },
      ],
    });
    expect(queueableCards(view, 0, false)).toEqual(HAND);
  });

  it('is empty for spectators, on your own turn, and outside the playing phase', () => {
    expect(queueableCards(makeView(), null, false)).toEqual([]);
    expect(queueableCards(makeView({ turn: 0 }), 0, true)).toEqual([]);
    expect(queueableCards(makeView({ phase: 'bidding' }), 0, false)).toEqual([]);
    expect(queueableCards(makeView({ phase: 'round_over' }), 0, false)).toEqual([]);
  });
});

describe('queueStillValid', () => {
  it('holds while the card is in hand and still queueable', () => {
    expect(queueStillValid(c('red', 3), makeView(), 0, false)).toBe(true);
  });

  it('drops when the card leaves the hand', () => {
    const view = makeView({ hand: [c('green', 2), c('blue', 5)] });
    expect(queueStillValid(c('red', 3), view, 0, false)).toBe(false);
  });

  it('drops when play ends', () => {
    expect(queueStillValid(c('red', 3), makeView({ phase: 'round_over' }), 0, false)).toBe(false);
  });

  it('drops when the led suit rules the card out (follow-suit)', () => {
    const view = makeView({ currentTrick: [{ seat: 1, card: c('green', 4) }] });
    expect(queueStillValid(c('red', 3), view, 0, false)).toBe(false);
    expect(queueStillValid(c('green', 2), view, 0, false)).toBe(true);
  });

  it('checks against legal cards once it IS your turn', () => {
    const view = makeView({ turn: 0, currentTrick: [{ seat: 3, card: c('green', 4) }] });
    expect(queueStillValid(c('red', 3), view, 0, true)).toBe(false);
    expect(queueStillValid(c('green', 2), view, 0, true)).toBe(true);
  });
});
