import { describe, expect, it } from 'vitest';
import { replay } from '../src/replay.js';
import { playFullGame } from './helpers/driver.js';

describe('replay', () => {
  it('reproduces the live final state bit-identically', () => {
    const { seed, actions, final } = playFullGame(21);
    const result = replay(seed, actions);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.state).toEqual(final);
      expect(JSON.stringify(result.state)).toBe(JSON.stringify(final));
    }
  });

  it('reproduces every intermediate state from action-log prefixes', () => {
    const { seed, actions, states } = playFullGame(22);
    // Spot-check a handful of prefixes (full quadratic check would be slow).
    for (const cut of [0, 1, 5, Math.floor(actions.length / 2), actions.length - 1]) {
      const result = replay(seed, actions.slice(0, cut));
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.state).toEqual(states[cut]);
    }
  });

  it('propagates a rejected action as an error', () => {
    const result = replay(1, [{ type: 'continue' }]);
    expect(result).toMatchObject({ ok: false, error: { code: 'WRONG_PHASE' } });
  });

  it('an empty log yields the initial deal', () => {
    const result = replay(9, []);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.state.phase).toBe('bidding');
      expect(result.state.roundIndex).toBe(0);
      expect(result.events).toEqual([]);
    }
  });
});
