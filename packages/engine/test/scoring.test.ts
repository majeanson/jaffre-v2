import { describe, expect, it } from 'vitest';
import { applyAction } from '../src/reducer.js';
import { decideWinner, ROUND_TOTAL_POINTS, TARGET_SCORE } from '../src/rules.js';
import type { Card, CapturedTrick, GameState, Result, RoundSummary, Seat } from '../src/types.js';
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

  it('records the trump suit — null exactly for a sans-atout contract', () => {
    for (let seed = 0; seed < 25; seed++) {
      const { summary } = firstRoundSummary(seed);
      if (summary.contract.sansAtout) {
        expect(summary.trump).toBeNull();
      } else {
        expect(summary.trump).not.toBeNull();
        expect(['red', 'brown', 'green', 'blue']).toContain(summary.trump);
      }
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

describe('decideWinner (M3 ruling: higher total wins, contract team on exact tie)', () => {
  it('no winner below the target', () => {
    expect(decideWinner([40, 40], 0)).toBeNull();
    expect(decideWinner([-20, 12], 1)).toBeNull();
  });

  it('single team crossing wins', () => {
    expect(decideWinner([41, 10], 1)).toBe(0);
    expect(decideWinner([10, 45], 0)).toBe(1);
  });

  it('both cross: higher total wins regardless of contract', () => {
    expect(decideWinner([44, 42], 1)).toBe(0);
    expect(decideWinner([42, 44], 0)).toBe(1);
  });

  it('both cross with equal totals: contract team wins', () => {
    expect(decideWinner([43, 43], 0)).toBe(0);
    expect(decideWinner([43, 43], 1)).toBe(1);
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

describe('hail-mary 12 sans atout', () => {
  const g = (value: Card['value']): Card => ({ suit: 'green', value });

  /**
   * A game one trick from the end: seat 0 holds a 12-sans-atout contract, seven
   * tricks are already captured, and each seat has a single green card left so
   * the final trick plays out with no follow-suit complications. `roundPoints`
   * is preset so the last trick (worth 1) lands the contract team on `made`.
   */
  function nearEnd(opts: {
    hands: readonly [Card, Card, Card, Card];
    roundPoints: [number, number];
    hailMary12: boolean;
    scores?: [number, number];
    value?: 7 | 8 | 9 | 10 | 11 | 12;
    sansAtout?: boolean;
  }): GameState {
    const dummy: CapturedTrick = { winner: 0, cards: [], plays: [], points: 0 };
    return {
      schemaVersion: 1,
      seed: 1,
      phase: 'playing',
      roundIndex: 0,
      dealer: 3,
      turn: 0,
      hands: opts.hands.map((c) => [c]),
      bids: [],
      contract: {
        seat: 0,
        value: opts.value ?? 12,
        sansAtout: opts.sansAtout ?? true,
        forced: false,
      },
      trump: null,
      trumpDecided: true,
      currentTrick: [],
      trickLeader: 0,
      capturedTricks: Array.from({ length: 7 }, () => dummy),
      roundPoints: opts.roundPoints,
      scores: opts.scores ?? [0, 0],
      lastRoundSummary: null,
      roundSummaries: [],
      winner: null,
      rules: { hailMary12: opts.hailMary12 },
    };
  }

  /** Play out the four single-card hands in seat order; return the last result. */
  function playFinalTrick(state: GameState, order: readonly Card[]): Result {
    let s = state;
    let last: Result = { ok: true, state: s, events: [] };
    for (let seat = 0; seat < 4; seat++) {
      last = applyAction(s, { type: 'play_card', seat: seat as Seat, card: order[seat] as Card });
      expect(last.ok).toBe(true);
      if (!last.ok) break;
      s = last.state;
    }
    return last;
  }

  it('made 12 sans atout wins the game outright, even below the target score', () => {
    // seat 2 (team 0) holds the highest green → contract team wins the trick,
    // 11 → 12 points: contract made.
    const hands: [Card, Card, Card, Card] = [g(5), g(3), g(7), g(2)];
    const res = playFinalTrick(nearEnd({ hands, roundPoints: [11, 0], hailMary12: true }), hands);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.state.lastRoundSummary?.contractMade).toBe(true);
    expect(res.state.phase).toBe('game_over');
    expect(res.state.winner).toBe(0);
    expect(res.state.endReason).toBe('hailMary12');
    expect(Math.max(...res.state.scores)).toBeLessThan(TARGET_SCORE); // won on the rule, not the score
  });

  it('missed 12 sans atout loses the game outright to the defenders', () => {
    // seat 1 (team 1) holds the highest green → contract team stays at 10: missed.
    const hands: [Card, Card, Card, Card] = [g(5), g(7), g(4), g(2)];
    const res = playFinalTrick(nearEnd({ hands, roundPoints: [10, 0], hailMary12: true }), hands);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.state.lastRoundSummary?.contractMade).toBe(false);
    expect(res.state.phase).toBe('game_over');
    expect(res.state.winner).toBe(1);
    expect(res.state.endReason).toBe('hailMary12');
  });

  it('with the rule off, a made 12 sans atout scores normally and the game continues', () => {
    const hands: [Card, Card, Card, Card] = [g(5), g(3), g(7), g(2)];
    const res = playFinalTrick(nearEnd({ hands, roundPoints: [11, 0], hailMary12: false }), hands);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.state.lastRoundSummary?.contractMade).toBe(true);
    expect(res.state.lastRoundSummary?.deltas[0]).toBe(24); // stake 12 × 2 (sans atout)
    expect(res.state.phase).toBe('round_over');
    expect(res.state.winner).toBeNull();
    expect(res.state.endReason).toBeUndefined();
  });

  it('the rule ignores a non-12 sans-atout contract', () => {
    const hands: [Card, Card, Card, Card] = [g(5), g(3), g(7), g(2)];
    // A 7 sans atout with the rule on — not a hail-mary, so it scores normally.
    const res = playFinalTrick(
      nearEnd({ hands, roundPoints: [11, 0], hailMary12: true, value: 7 }),
      hands,
    );
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.state.phase).toBe('round_over');
    expect(res.state.winner).toBeNull();
    expect(res.state.endReason).toBeUndefined();
  });

  it('the rule ignores a plain (trump) 12 contract — only sans atout counts', () => {
    const hands: [Card, Card, Card, Card] = [g(5), g(3), g(7), g(2)];
    const res = playFinalTrick(
      nearEnd({ hands, roundPoints: [11, 0], hailMary12: true, sansAtout: false }),
      hands,
    );
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.state.phase).toBe('round_over');
    expect(res.state.winner).toBeNull();
    expect(res.state.endReason).toBeUndefined();
  });

  it('createGame carries the chosen house rules', () => {
    expect(createGame(1, { hailMary12: true }).rules.hailMary12).toBe(true);
    expect(createGame(1).rules.hailMary12).toBe(false);
  });
});
