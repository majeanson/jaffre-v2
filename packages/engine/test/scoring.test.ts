import { describe, expect, it } from 'vitest';
import { applyAction } from '../src/reducer.js';
import { ROUND_TOTAL_POINTS, TARGET_SCORE } from '../src/rules.js';
import type { GameState, RoundSummary } from '../src/types.js';
import { teamOf } from '../src/types.js';
import { playFullGame, randomAction } from './helpers/driver.js';
import { mulberry32 } from '../src/rng.js';
import { createGame } from '../src/reducer.js';

/** Drive a game with random legal play until the first round_scored, return its summary. */
function firstRoundSummary(seed: number): { summary: RoundSummary; state: GameState } {
  const rng = mulberry32(seed ^ 0x5eed);
  let state = createGame(seed);
  for (let i = 0; i < 200; i++) {
    const result = applyAction(state, randomAction(state, rng));
    expect(result.ok).toBe(true);
    if (!result.ok) break;
    const scored = result.events.find((e) => e.type === 'round_scored');
    if (scored?.type === 'round_scored') return { summary: scored.summary, state: result.state };
    state = result.state;
  }
  expect.unreachable('round never finished');
}

describe('round scoring', () => {
  it('trick points always sum to the round invariant (11)', () => {
    for (let seed = 0; seed < 25; seed++) {
      const { summary } = firstRoundSummary(seed);
      expect(summary.trickPoints[0] + summary.trickPoints[1]).toBe(ROUND_TOTAL_POINTS);
    }
  });

  it('contract team gains the stake when made, loses it when set; defenders keep trick points', () => {
    for (let seed = 0; seed < 25; seed++) {
      const { summary } = firstRoundSummary(seed);
      const contractTeam = teamOf(summary.contract.seat);
      const defenderTeam = contractTeam === 0 ? 1 : 0;
      const stake = summary.contract.value * (summary.contract.sansAtout ? 2 : 1);
      const made = (summary.trickPoints[contractTeam] as number) >= summary.contract.value;
      expect(summary.contractMade).toBe(made);
      expect(summary.deltas[contractTeam]).toBe(made ? stake : -stake);
      expect(summary.deltas[defenderTeam]).toBe(summary.trickPoints[defenderTeam]);
    }
  });

  it('scores accumulate the deltas', () => {
    const { summary } = firstRoundSummary(3);
    expect(summary.scores).toEqual([summary.deltas[0], summary.deltas[1]]);
  });

  it('round_over exposes the summary and continue deals the next round', () => {
    const { state } = firstRoundSummary(4);
    if (state.phase === 'game_over') return; // improbable first-round win
    expect(state.phase).toBe('round_over');
    expect(state.lastRoundSummary).not.toBeNull();
    const next = applyAction(state, { type: 'continue' });
    expect(next.ok).toBe(true);
    if (next.ok) {
      expect(next.state.phase).toBe('bidding');
      expect(next.state.roundIndex).toBe(state.roundIndex + 1);
      expect(next.state.dealer).toBe((state.dealer + 1) % 4);
      expect(next.state.bids).toEqual([]);
      expect(next.state.capturedTricks).toEqual([]);
      expect(next.state.roundPoints).toEqual([0, 0]);
      expect(next.state.scores).toEqual(state.scores);
      expect(next.events[0]?.type).toBe('round_started');
    }
  });
});

describe('game end', () => {
  it('the game ends when a team reaches the target score', () => {
    for (let seed = 0; seed < 10; seed++) {
      const { final } = playFullGame(seed);
      expect(final.phase).toBe('game_over');
      expect(final.winner).not.toBeNull();
      expect(Math.max(final.scores[0], final.scores[1])).toBeGreaterThanOrEqual(TARGET_SCORE);
      expect(final.scores[final.winner as 0 | 1]).toBeGreaterThanOrEqual(TARGET_SCORE);
    }
  });

  it('game_over is emitted with the winning team and further actions are rejected', () => {
    const { final } = playFullGame(1);
    const bidAttempt = applyAction(final, {
      type: 'place_bid',
      seat: final.turn,
      choice: { kind: 'pass' },
    });
    expect(bidAttempt).toMatchObject({ ok: false, error: { code: 'WRONG_PHASE' } });
    const continueAttempt = applyAction(final, { type: 'continue' });
    expect(continueAttempt).toMatchObject({ ok: false, error: { code: 'WRONG_PHASE' } });
  });
});
