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
    roundSummaries: [],
    winner: null,
    rules: { hailMary12: false },
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

  it('explains the red-0 ruff, over-ruff warning included', () => {
    const v = view({
      trump: 'red',
      trickLeader: 1,
      hand: [c('red', 0), c('red', 5), c('blue', 3)],
      currentTrick: [play(1, c('green', 7)), play(2, c('green', 4)), play(3, c('green', 2))],
    });
    const advice = suggest(v);
    expect(advice.card).toEqual(c('red', 0));
    expect(advice.tip).toContain('Ruff with the Red 0');
    expect(advice.tip).toContain('over-ruff');
    expect(suggest(v, 'fr').tip).toContain('surcoupe');
  });

  it('names the void that will cash the +5 when it tells you to pass', () => {
    // The thin defending hand that started this: the red 0, no green at all.
    const v = view({
      phase: 'bidding',
      hand: [
        c('red', 0),
        c('red', 4),
        c('brown', 0),
        c('brown', 3),
        c('brown', 4),
        c('blue', 0),
        c('blue', 3),
        c('blue', 4),
      ],
    });
    const advice = suggest(v);
    expect(advice.bid?.kind).toBe('pass');
    expect(advice.tip).toContain('green void');
    expect(suggest(v, 'fr').tip).toContain('chute en vert');
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

  it('warns the dealer that a fourth pass means the forced 7', () => {
    const v = view({
      phase: 'bidding',
      viewer: 0,
      dealer: 0,
      turn: 0,
      bids: [
        { seat: 1, choice: { kind: 'pass' } },
        { seat: 2, choice: { kind: 'pass' } },
        { seat: 3, choice: { kind: 'pass' } },
      ],
      hand: [
        c('green', 4),
        c('green', 3),
        c('green', 2),
        c('blue', 4),
        c('blue', 2),
        c('red', 3),
        c('red', 1),
        c('brown', 2),
      ],
    });
    const advice = suggest(v);
    expect(advice.tip).toContain('forced 7');
  });

  it('explains the forced-7 opening: longest suit as trump', () => {
    const v = view({
      contract: { seat: 0, value: 7, sansAtout: false, forced: true },
      trump: null,
      trumpDecided: false,
      hand: [
        c('blue', 5),
        c('blue', 4),
        c('blue', 3),
        c('blue', 2),
        c('green', 6),
        c('green', 5),
        c('red', 4),
        c('brown', 3),
      ],
    });
    const advice = suggest(v);
    expect(advice.card?.suit).toBe('blue');
    expect(advice.tip).toContain('Forced to 7');
  });

  it('recommends leading red from strength while the red 0 is live', () => {
    // Red 7-6 in hand, nothing red played: force the red 0 to follow.
    const v = view({
      trump: 'green',
      hand: [c('red', 7), c('red', 6), c('blue', 2), c('green', 1)],
    });
    const advice = suggest(v);
    expect(advice.card?.suit).toBe('red');
    expect(advice.tip).toContain('Red 0 is still out');
  });

  it('explains winning with the lowest of equals', () => {
    // Green 7-6-5 all boss: the bot takes with the 5 and the coach says why.
    const v = view({
      trickLeader: 1,
      hand: [c('green', 7), c('green', 6), c('green', 5), c('blue', 2)],
      currentTrick: [play(1, c('green', 4)), play(2, c('green', 3)), play(3, c('green', 2))],
    });
    const advice = suggest(v);
    expect(advice.card).toEqual(c('green', 5));
    expect(advice.tip.toLowerCase()).toContain('equals');
  });

  it('explains ducking with the low brown while holding the brown 0', () => {
    const v = view({
      trump: 'green',
      trickLeader: 1,
      hand: [c('brown', 0), c('brown', 2), c('brown', 5)],
      currentTrick: [play(1, c('brown', 6))],
    });
    const advice = suggest(v);
    expect(advice.card).toEqual(c('brown', 2));
    expect(advice.tip).toContain('Brown 0');
  });

  it('explains sloughing when the cheapest shed is the last of its suit', () => {
    const v = view({
      trump: 'red',
      trickLeader: 1,
      hand: [c('blue', 1), c('green', 3), c('green', 4), c('red', 3)],
      currentTrick: [play(1, c('brown', 6))],
    });
    const advice = suggest(v, 'fr');
    expect(advice.card).toEqual(c('blue', 1));
    expect(advice.tip).toContain('couper');
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
