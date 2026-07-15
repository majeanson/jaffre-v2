import { describe, expect, it } from 'vitest';
import { applyAction, createGame, mulberry32, viewFor } from '@jaffre/engine';
import { chooseAction } from '../src/index.js';

describe('bot policy', () => {
  it('returns null when it is not the bot turn or for spectators', () => {
    const state = createGame(1);
    const rng = mulberry32(1);
    const notTurn = state.turn === 0 ? 1 : 0;
    expect(chooseAction(viewFor(state, notTurn), rng)).toBeNull();
    expect(chooseAction(viewFor(state, 'spectator'), rng)).toBeNull();
  });

  it('four bots complete 100 full games through redacted views only', () => {
    for (let seed = 0; seed < 100; seed++) {
      const rng = mulberry32(seed ^ 0xb07);
      let state = createGame(seed);
      let steps = 0;
      while (state.phase !== 'game_over') {
        expect(steps++).toBeLessThan(40_000);
        const action = chooseAction(viewFor(state, state.turn), rng);
        expect(action).not.toBeNull();
        if (action === null) break;
        const result = applyAction(state, action);
        expect(result.ok, `bot proposed illegal ${JSON.stringify(action)}`).toBe(true);
        if (!result.ok) break;
        state = result.state;
      }
      expect(state.phase).toBe('game_over');
    }
  }, 120_000);
});
