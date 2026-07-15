import { describe, expect, it } from 'vitest';
import { replay } from '../src/replay.js';
import { TARGET_SCORE } from '../src/rules.js';
import { playFullGame } from './helpers/driver.js';

describe('full games', () => {
  it(
    '1000 seeded games all run to completion with a legitimate winner',
    { timeout: 120_000 },
    () => {
      let totalActions = 0;
      for (let seed = 0; seed < 1000; seed++) {
        const { final, actions } = playFullGame(seed);
        totalActions += actions.length;
        expect(final.phase).toBe('game_over');
        expect(final.winner === 0 || final.winner === 1).toBe(true);
        expect(final.scores[final.winner as 0 | 1]).toBeGreaterThanOrEqual(TARGET_SCORE);
      }
      expect(totalActions).toBeGreaterThan(0);
    },
  );

  it('golden seeds replay to a stable final state (canon frozen at M3)', () => {
    for (const seed of [1, 2, 3]) {
      const { actions, final } = playFullGame(seed);
      const replayed = replay(seed, actions);
      expect(replayed.ok).toBe(true);
      if (replayed.ok) expect(replayed.state).toEqual(final);
      expect({
        seed,
        actionCount: actions.length,
        rounds: final.roundIndex + 1,
        scores: final.scores,
        winner: final.winner,
      }).toMatchSnapshot();
    }
  });
});
