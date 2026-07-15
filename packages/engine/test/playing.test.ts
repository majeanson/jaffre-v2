import { describe, expect, it } from 'vitest';
import { BROWN_ZERO, legalCards, RED_ZERO, trickPoints, trickWinner } from '../src/rules.js';
import { applyAction } from '../src/reducer.js';
import type { Card, GameState, TrickPlay } from '../src/types.js';
import { sameCard } from '../src/types.js';
import { bid, bidPhase, PASS } from './helpers/driver.js';

const c = (suit: Card['suit'], value: Card['value']): Card => ({ suit, value });

describe('legalCards', () => {
  const hand = [c('red', 3), c('red', 7), c('blue', 1)];

  it('anything is legal when leading', () => {
    expect(legalCards(hand, null)).toEqual(hand);
  });

  it('must follow the led suit when holding it', () => {
    expect(legalCards(hand, 'red')).toEqual([c('red', 3), c('red', 7)]);
  });

  it('anything goes when void in the led suit', () => {
    expect(legalCards(hand, 'green')).toEqual(hand);
  });
});

describe('trickWinner', () => {
  const trick: TrickPlay[] = [
    { seat: 0, card: c('red', 3) },
    { seat: 1, card: c('red', 6) },
    { seat: 2, card: c('blue', 7) },
    { seat: 3, card: c('red', 5) },
  ];

  it('highest of led suit wins without trump', () => {
    expect(trickWinner(trick, null).seat).toBe(1);
  });

  it('highest of led suit wins when trump was not played', () => {
    expect(trickWinner(trick, 'green').seat).toBe(1);
  });

  it('trump beats the led suit', () => {
    expect(trickWinner(trick, 'blue').seat).toBe(2);
  });

  it('highest trump wins among several', () => {
    const twoTrumps: TrickPlay[] = [
      { seat: 0, card: c('green', 2) },
      { seat: 1, card: c('blue', 1) },
      { seat: 2, card: c('blue', 4) },
      { seat: 3, card: c('green', 7) },
    ];
    expect(trickWinner(twoTrumps, 'blue').seat).toBe(2);
  });
});

describe('trickPoints', () => {
  it('a plain trick is worth 1', () => {
    expect(trickPoints([c('red', 1), c('red', 2), c('blue', 3), c('green', 4)])).toEqual({
      points: 1,
      specials: [],
    });
  });

  it('red 0 adds 5', () => {
    expect(trickPoints([RED_ZERO, c('red', 2), c('blue', 3), c('green', 4)])).toEqual({
      points: 6,
      specials: ['red_zero'],
    });
  });

  it('brown 0 subtracts 2', () => {
    expect(trickPoints([BROWN_ZERO, c('red', 2), c('blue', 3), c('green', 4)])).toEqual({
      points: -1,
      specials: ['brown_zero'],
    });
  });

  it('both specials combine to +4', () => {
    expect(trickPoints([RED_ZERO, BROWN_ZERO, c('blue', 3), c('green', 4)])).toEqual({
      points: 4,
      specials: ['red_zero', 'brown_zero'],
    });
  });
});

/** Bid seat 1 to a plain 7 so seat 1 leads and trump comes from its first card. */
function playingState(seed: number): GameState {
  const state = bidPhase(seed, [bid(7), PASS, PASS, PASS]);
  expect(state.phase).toBe('playing');
  expect(state.contract?.seat).toBe(1);
  return state;
}

function firstHand(state: GameState): readonly Card[] {
  return state.hands[state.turn] as readonly Card[];
}

describe('reducer: playing', () => {
  it('rejects plays outside the playing phase', () => {
    const bidding = bidPhase(1, []);
    const result = applyAction(bidding, { type: 'play_card', seat: 1, card: c('red', 1) });
    expect(result).toMatchObject({ ok: false, error: { code: 'WRONG_PHASE' } });
  });

  it('rejects plays out of turn', () => {
    const state = playingState(1);
    const wrongSeat = state.turn === 0 ? 1 : 0;
    const card = state.hands[wrongSeat]?.[0] as Card;
    const result = applyAction(state, { type: 'play_card', seat: wrongSeat as 0 | 1, card });
    expect(result).toMatchObject({ ok: false, error: { code: 'NOT_YOUR_TURN' } });
  });

  it('rejects a card the seat does not hold', () => {
    const state = playingState(1);
    const otherSeat = state.turn === 0 ? 1 : 0;
    const foreign = state.hands[otherSeat]?.[0] as Card;
    const result = applyAction(state, { type: 'play_card', seat: state.turn, card: foreign });
    expect(result).toMatchObject({ ok: false, error: { code: 'CARD_NOT_IN_HAND' } });
  });

  it("the contract holder's first card sets trump and emits trump_set", () => {
    const state = playingState(1);
    const card = firstHand(state)[0] as Card;
    const result = applyAction(state, { type: 'play_card', seat: state.turn, card });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.state.trump).toBe(card.suit);
      expect(result.state.trumpDecided).toBe(true);
      expect(result.events.map((e) => e.type)).toEqual(['trump_set', 'card_played']);
      expect(result.state.hands[state.turn]).toHaveLength(7);
    }
  });

  it('enforces following the led suit', () => {
    // Search seeds for a follower who holds the led suit plus another suit.
    for (let seed = 0; seed < 100; seed++) {
      let state = playingState(seed);
      const lead = firstHand(state)[0] as Card;
      const led = applyAction(state, { type: 'play_card', seat: state.turn, card: lead });
      expect(led.ok).toBe(true);
      if (!led.ok) continue;
      state = led.state;
      const hand = firstHand(state);
      const hasLed = hand.some((x) => x.suit === lead.suit);
      const offSuit = hand.find((x) => x.suit !== lead.suit);
      if (!hasLed || offSuit === undefined) continue;
      const bad = applyAction(state, { type: 'play_card', seat: state.turn, card: offSuit });
      expect(bad).toMatchObject({ ok: false, error: { code: 'MUST_FOLLOW_SUIT' } });
      // and the legal follow is accepted
      const follow = hand.find((x) => x.suit === lead.suit) as Card;
      const good = applyAction(state, { type: 'play_card', seat: state.turn, card: follow });
      expect(good.ok).toBe(true);
      return;
    }
    expect.unreachable('no seed produced a follow-suit scenario');
  });

  it('a completed trick awards points and the winner leads next', () => {
    let state = playingState(1);
    for (let i = 0; i < 4; i++) {
      const hand = firstHand(state);
      const led = state.currentTrick[0]?.card.suit ?? null;
      const card = legalCards(hand, led)[0] as Card;
      const result = applyAction(state, { type: 'play_card', seat: state.turn, card });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      if (i === 3) {
        const trickEvent = result.events.find((e) => e.type === 'trick_won');
        expect(trickEvent).toBeDefined();
        expect(result.state.currentTrick).toEqual([]);
        expect(result.state.capturedTricks).toHaveLength(1);
        if (trickEvent?.type === 'trick_won') {
          expect(result.state.turn).toBe(trickEvent.winner);
          expect(result.state.trickLeader).toBe(trickEvent.winner);
        }
      }
      state = result.state;
    }
  });

  it('rejects continue outside round_over', () => {
    const state = playingState(1);
    const result = applyAction(state, { type: 'continue' });
    expect(result).toMatchObject({ ok: false, error: { code: 'WRONG_PHASE' } });
  });

  it('removes exactly the played card from the hand', () => {
    const state = playingState(2);
    const hand = firstHand(state);
    const card = hand[3] as Card;
    const result = applyAction(state, { type: 'play_card', seat: state.turn, card });
    expect(result.ok).toBe(true);
    if (result.ok) {
      const after = result.state.hands[state.turn] as readonly Card[];
      expect(after.some((x) => sameCard(x, card))).toBe(false);
      expect(after).toHaveLength(hand.length - 1);
    }
  });
});
