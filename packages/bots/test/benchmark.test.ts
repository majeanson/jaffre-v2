import { describe, expect, it } from 'vitest';
import { applyAction, createGame, mulberry32, teamOf, viewFor } from '@jaffre/engine';
import type { GameState, Seat } from '@jaffre/engine';
import { type BotDifficulty, chooseAction } from '../src/index.js';

/**
 * A fast, deterministic slice of scripts/botbench.ts: the difficulty ladder is
 * a shipped guarantee, so a regression that makes Hard no better than Easy must
 * fail CI. Fixed seeds + seeded RNG ⇒ exact, reproducible win counts.
 */

function winRate(diffA: BotDifficulty, diffB: BotDifficulty, games: number): number {
  let winsA = 0;
  let decided = 0;
  for (let i = 0; i < games; i++) {
    const swap = i % 2 === 1;
    const teamDiff: [BotDifficulty, BotDifficulty] = swap ? [diffB, diffA] : [diffA, diffB];
    const teamA: 0 | 1 = swap ? 1 : 0;
    const rng = mulberry32((i ^ 0xb07) >>> 0);
    let state: GameState = createGame(i);
    let steps = 0;
    while (state.phase !== 'game_over' && steps++ < 60_000) {
      const seat: Seat = state.turn;
      const action = chooseAction(
        viewFor(state, seat),
        rng,
        teamDiff[teamOf(seat)] as BotDifficulty,
      );
      if (action === null) break;
      const result = applyAction(state, action);
      if (!result.ok) throw new Error(`illegal: ${JSON.stringify(action)}`);
      state = result.state;
    }
    if (state.winner !== null) {
      decided++;
      if (state.winner === teamA) winsA++;
    }
  }
  return winsA / Math.max(1, decided);
}

describe('difficulty ladder', () => {
  const GAMES = 60;

  it('Hard beats Easy comfortably', () => {
    expect(winRate('hard', 'easy', GAMES)).toBeGreaterThanOrEqual(0.62);
  }, 60_000);

  it('Hard beats Normal', () => {
    expect(winRate('hard', 'normal', GAMES)).toBeGreaterThanOrEqual(0.53);
  }, 60_000);

  it('Normal beats Easy', () => {
    expect(winRate('normal', 'easy', GAMES)).toBeGreaterThanOrEqual(0.55);
  }, 60_000);
});
