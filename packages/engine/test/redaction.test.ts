import { describe, expect, it } from 'vitest';
import { redactEvent, viewFor } from '../src/view.js';
import { createGame } from '../src/reducer.js';
import type { Card, Seat } from '../src/types.js';
import { cardId } from '../src/types.js';
import { playFullGame } from './helpers/driver.js';

describe('viewFor', () => {
  it('shows a seat its own hand and only counts for others', () => {
    const state = createGame(7);
    const view = viewFor(state, 2);
    expect(view.hand).toEqual(state.hands[2]);
    expect(view.handCounts).toEqual([8, 8, 8, 8]);
    expect(JSON.stringify(view)).not.toContain('"seed"');
  });

  it('spectators see no hand at all', () => {
    const state = createGame(7);
    const view = viewFor(state, 'spectator');
    expect(view.hand).toEqual([]);
    expect(view.handCounts).toEqual([8, 8, 8, 8]);
  });

  it('never leaks another hand at any state of a full game', () => {
    const { states } = playFullGame(11);
    for (const state of states) {
      for (const viewer of [0, 1, 2, 3] as Seat[]) {
        const view = viewFor(state, viewer);
        const visible = new Set(view.hand.map(cardId));
        const otherCards = state.hands
          .filter((_, seat) => seat !== viewer)
          .flat()
          .map(cardId);
        // No other seat's card may appear in this viewer's hand.
        for (const id of otherCards) expect(visible.has(id)).toBe(false);
      }
    }
  });
});

describe('redactEvent', () => {
  it('strips other hands from round_started', () => {
    const state = createGame(3);
    const event = {
      type: 'round_started',
      roundIndex: 0,
      dealer: 0 as Seat,
      hands: state.hands,
    } as const;
    const forSeat1 = redactEvent(event, 1);
    if (forSeat1.type === 'round_started') {
      expect(forSeat1.hands[1]).toEqual(state.hands[1]);
      expect(forSeat1.hands[0]).toEqual([]);
      expect(forSeat1.hands[2]).toEqual([]);
      expect(forSeat1.hands[3]).toEqual([]);
    }
    const forSpectator = redactEvent(event, 'spectator');
    if (forSpectator.type === 'round_started') {
      expect(forSpectator.hands.every((h: readonly Card[]) => h.length === 0)).toBe(true);
    }
  });

  it('passes public events through unchanged', () => {
    const event = { type: 'trump_set', trump: 'red' } as const;
    expect(redactEvent(event, 0)).toBe(event);
    expect(redactEvent(event, 'spectator')).toBe(event);
  });
});
