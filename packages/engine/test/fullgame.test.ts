import { describe, expect, it } from 'vitest';
import { replay } from '../src/replay.js';
import { TARGET_SCORE } from '../src/rules.js';
import { playFullGame } from './helpers/driver.js';

describe('full games', () => {
  it(
    '1000 seeded games all run to completion with a legitimate winner',
    // 240s, up from 120s: a round holds 10 points instead of 11, so games need
    // more rounds to reach 41 (~26 vs ~21 under the driver's random model) and
    // the loop got proportionally longer. Still a hard termination guarantee —
    // the per-game MAX_ACTIONS cap in the driver is what proves convergence.
    { timeout: 240_000 },
    async () => {
      let totalActions = 0;
      for (let seed = 0; seed < 1000; seed++) {
        const { final, actions } = playFullGame(seed);
        totalActions += actions.length;
        expect(final.phase).toBe('game_over');
        expect(final.winner === 0 || final.winner === 1).toBe(true);
        expect(final.scores[final.winner as 0 | 1]).toBeGreaterThanOrEqual(TARGET_SCORE);
        // This loop runs ~70s of uninterrupted synchronous work. Vitest's
        // worker reports progress to the main process over an RPC that must
        // resolve within 60s; a sync block that long starves the worker's own
        // event loop, so the pending `onTaskUpdate` call trips its timeout and
        // fails the run even though every game passed. Yield each 100 games so
        // the reporter RPC gets serviced.
        if (seed % 100 === 99) await new Promise((resolve) => setTimeout(resolve, 0));
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
