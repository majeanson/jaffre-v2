import { describe, expect, it } from 'vitest';
import type { Card, Contract, SeatView, Suit, TrickPlay } from '@jaffre/engine';
import { mulberry32 } from '@jaffre/engine';
import { bestTrump, chooseAction, heuristicCard } from '../src/index.js';

const c = (suit: Suit, value: number): Card => ({ suit, value: value as Card['value'] });
const rng = () => mulberry32(1)();

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
    winner: null,
    ...partial,
  };
}

const play = (seat: 0 | 1 | 2 | 3, card: Card): TrickPlay => ({ seat, card });
const contract = (seat: 0 | 1 | 2 | 3, value: Contract['value']): Contract => ({
  seat,
  value,
  sansAtout: false,
  forced: false,
});

function cardOf(v: SeatView, level: 'normal' | 'hard'): Card {
  return heuristicCard(v, mulberry32(1), level);
}

describe('play heuristics', () => {
  it('never trumps or overtakes a partner who has certainly won', () => {
    // Seat 0 is last to play, void in the led red suit; partner (2) already won.
    const v = view({
      trump: 'green',
      trickLeader: 1,
      hand: [c('green', 3), c('blue', 1), c('brown', 4)],
      currentTrick: [play(1, c('red', 6)), play(2, c('red', 7)), play(3, c('red', 2))],
    });
    for (const level of ['normal', 'hard'] as const) {
      const chosen = cardOf(v, level);
      expect(chosen.suit).not.toBe('green'); // did not ruff our own side
      expect(chosen).toEqual(c('blue', 1)); // ducked with the lowest card
    }
  });

  it('cashes the red 0 on a partner who has certainly won', () => {
    const v = view({
      trump: 'green',
      trickLeader: 1,
      hand: [c('red', 0), c('red', 3)],
      currentTrick: [play(1, c('red', 4)), play(2, c('red', 7)), play(3, c('red', 1))],
    });
    expect(cardOf(v, 'normal')).toEqual(c('red', 0));
  });

  it('dumps the brown 0 onto a trick the opponents have won', () => {
    // Seat 0 last, void in led red, no trump — cannot win, sheds the −2.
    const v = view({
      trump: 'green',
      trickLeader: 1,
      hand: [c('brown', 0), c('blue', 5)],
      currentTrick: [play(1, c('red', 6)), play(2, c('red', 2)), play(3, c('red', 4))],
    });
    expect(cardOf(v, 'normal')).toEqual(c('brown', 0));
  });

  it('never hands the brown 0 to a winning partner', () => {
    const v = view({
      trump: 'green',
      trickLeader: 1,
      hand: [c('brown', 0), c('blue', 5)],
      currentTrick: [play(1, c('red', 2)), play(2, c('red', 7)), play(3, c('red', 4))],
    });
    expect(cardOf(v, 'normal')).toEqual(c('blue', 5));
  });

  it('never discards the red 0', () => {
    const v = view({
      trump: 'green',
      trickLeader: 1,
      hand: [c('red', 0), c('blue', 2)],
      currentTrick: [play(1, c('green', 6)), play(2, c('green', 1)), play(3, c('green', 3))],
    });
    expect(cardOf(v, 'normal')).toEqual(c('blue', 2));
  });

  it("declarer's opening lead names trump — the highest of its best suit", () => {
    const hand = [
      c('green', 7),
      c('green', 6),
      c('green', 5),
      c('green', 3),
      c('red', 1),
      c('blue', 2),
      c('blue', 4),
      c('brown', 3),
    ];
    const v = view({ contract: contract(0, 8), trump: null, trumpDecided: false, hand });
    const chosen = cardOf(v, 'normal');
    expect(chosen.suit).toBe(bestTrump(hand).suit);
    expect(chosen).toEqual(c('green', 7));
  });
});

describe('bidding heuristics', () => {
  const strongSpread = [
    c('red', 7),
    c('red', 1),
    c('green', 7),
    c('green', 1),
    c('blue', 7),
    c('blue', 1),
    c('brown', 7),
    c('brown', 1),
  ];

  it('only Hard bids sans atout', () => {
    const v = view({ phase: 'bidding', hand: strongSpread });
    const easy = chooseAction(v, rng, 'easy');
    const normal = chooseAction(v, rng, 'normal');
    const hard = chooseAction(v, rng, 'hard');
    expect(easy?.type).toBe('place_bid');
    if (easy?.type === 'place_bid') {
      expect(easy.choice.kind === 'bid' && easy.choice.sansAtout).not.toBe(true);
    }
    if (normal?.type === 'place_bid') {
      expect(normal.choice.kind === 'bid' && normal.choice.sansAtout).not.toBe(true);
    }
    expect(hard?.type).toBe('place_bid');
    if (hard?.type === 'place_bid') {
      expect(hard.choice.kind).toBe('bid');
      expect(hard.choice.kind === 'bid' && hard.choice.sansAtout).toBe(true);
    }
  });

  it('Normal never outbids its own partner', () => {
    // Partner (seat 2) holds a plain 9; seat 0 has a monster hand.
    const v = view({
      phase: 'bidding',
      bids: [
        { seat: 1, choice: { kind: 'pass' } },
        { seat: 2, choice: { kind: 'bid', value: 9, sansAtout: false } },
        { seat: 3, choice: { kind: 'pass' } },
      ],
      hand: [
        c('green', 7),
        c('green', 6),
        c('green', 5),
        c('green', 4),
        c('green', 3),
        c('red', 7),
        c('blue', 7),
        c('brown', 7),
      ],
    });
    const normal = chooseAction(v, rng, 'normal');
    expect(normal?.type).toBe('place_bid');
    if (normal?.type === 'place_bid') expect(normal.choice.kind).toBe('pass');
  });
});
