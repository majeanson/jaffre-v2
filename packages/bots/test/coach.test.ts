import { describe, expect, it } from 'vitest';
import type { Card, Contract, SeatView, Suit, TrickPlay } from '@jaffre/engine';
import { createGame, viewFor } from '@jaffre/engine';
import { suggest } from '../src/index.js';

const c = (suit: Suit, value: number): Card => ({ suit, value: value as Card['value'] });
const play = (seat: 0 | 1 | 2 | 3, card: Card): TrickPlay => ({ seat, card });
const contract = (seat: 0 | 1 | 2 | 3, value: Contract['value']): Contract => ({
  seat,
  value,
  sansAtout: false,
  forced: false,
});

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

describe('coach', () => {
  it('stays silent when it is not the viewer’s turn', () => {
    const state = createGame(1);
    const notTurn = state.turn === 0 ? 1 : 0;
    const advice = suggest(viewFor(state, notTurn));
    expect(advice.action).toBeNull();
    expect(advice.tip).toBe('');
  });

  it('recommends a legal, actionable move during bidding', () => {
    const state = createGame(3);
    const advice = suggest(viewFor(state, state.turn));
    expect(advice.action?.type).toBe('place_bid');
    expect(advice.bid).not.toBeNull();
    expect(advice.tip.length).toBeGreaterThan(0);
  });

  it('advises cashing the red 0 on a partner’s certain trick', () => {
    const v = view({
      trump: 'green',
      trickLeader: 1,
      hand: [c('red', 0), c('red', 3)],
      currentTrick: [play(1, c('red', 4)), play(2, c('red', 7)), play(3, c('red', 1))],
    });
    const advice = suggest(v);
    expect(advice.card).toEqual(c('red', 0));
    expect(advice.tip.toLowerCase()).toContain('red 0');
  });

  it('advises dumping the brown 0 on the opponents', () => {
    const v = view({
      trump: 'green',
      trickLeader: 1,
      hand: [c('brown', 0), c('blue', 5)],
      currentTrick: [play(1, c('red', 6)), play(2, c('red', 2)), play(3, c('red', 4))],
    });
    const advice = suggest(v);
    expect(advice.card).toEqual(c('brown', 0));
    expect(advice.tip.toLowerCase()).toContain('brown 0');
  });

  it('explains the opening lead that names trump', () => {
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
    const advice = suggest(v);
    expect(advice.card).toEqual(c('green', 7));
    expect(advice.tip.toLowerCase()).toContain('trump');
  });
});
