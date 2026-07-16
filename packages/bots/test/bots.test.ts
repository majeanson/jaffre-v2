import { describe, expect, it } from 'vitest';
import { applyAction, createGame, mulberry32, viewFor } from '@jaffre/engine';
import { BOT_DIFFICULTIES, chooseAction } from '../src/index.js';

describe('bot policy', () => {
  it('returns null when it is not the bot turn or for spectators', () => {
    const state = createGame(1);
    const rng = mulberry32(1);
    const notTurn = state.turn === 0 ? 1 : 0;
    expect(chooseAction(viewFor(state, notTurn), rng)).toBeNull();
    expect(chooseAction(viewFor(state, 'spectator'), rng)).toBeNull();
  });

  it('the default difficulty is normal (back-compat)', () => {
    for (let seed = 0; seed < 20; seed++) {
      const state = createGame(seed);
      const seat = state.turn;
      const a = chooseAction(viewFor(state, seat), mulberry32(seed));
      const b = chooseAction(viewFor(state, seat), mulberry32(seed), 'normal');
      expect(a).toEqual(b);
    }
  });

  describe.each(BOT_DIFFICULTIES)('%s bots', (difficulty) => {
    const games = difficulty === 'hard' ? 40 : 100;

    it(`four ${difficulty} bots complete ${games} full games through redacted views only`, () => {
      for (let seed = 0; seed < games; seed++) {
        const rng = mulberry32(seed ^ 0xb07);
        let state = createGame(seed);
        let steps = 0;
        while (state.phase !== 'game_over') {
          expect(steps++).toBeLessThan(40_000);
          const action = chooseAction(viewFor(state, state.turn), rng, difficulty);
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

    it(`${difficulty} play is deterministic for a fixed seed`, () => {
      const run = (): string => {
        const rng = mulberry32(7 ^ 0xb07);
        let state = createGame(7);
        const log: string[] = [];
        let steps = 0;
        while (state.phase !== 'game_over' && steps++ < 40_000) {
          const action = chooseAction(viewFor(state, state.turn), rng, difficulty);
          if (action === null) break;
          log.push(JSON.stringify(action));
          const result = applyAction(state, action);
          if (!result.ok) break;
          state = result.state;
        }
        return log.join('|');
      };
      expect(run()).toEqual(run());
    }, 60_000);
  });
});
