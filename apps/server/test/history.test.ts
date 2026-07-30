import { describe, expect, it } from 'vitest';
import { createGame } from '@jaffre/engine';
import type { Action, GameState, RoundSummary } from '@jaffre/engine';
import { gameRecordFrom, memorableFlags } from '../src/history.js';

describe('gameRecordFrom', () => {
  it('assembles a full record from meta, final state and the ordered log', () => {
    const state: GameState = {
      ...createGame(4242),
      phase: 'game_over',
      winner: 1,
      scores: [38, 62],
    };
    const a1: Action = { type: 'place_bid', seat: 0, choice: { kind: 'pass' } };
    const a2: Action = { type: 'continue' };
    const record = gameRecordFrom(
      {
        roomCode: 'room-x',
        startedAt: 1000,
        seats: ['alice', { bot: true }, 'bob', { bot: true }],
        names: { alice: 'Alice', bob: 'Bob' },
      },
      state,
      // Deliberately out of order — the record must sort by seq.
      [
        { seq: 2, action: a2 },
        { seq: 1, action: a1 },
      ],
      { id: 'game-1', finishedAt: 2000 },
    );
    expect(record).toEqual({
      id: 'game-1',
      room_code: 'room-x',
      seed: 4242,
      started_at: 1000,
      finished_at: 2000,
      winner_team: 1,
      score_0: 38,
      score_1: 62,
      action_log: JSON.stringify([a1, a2]),
      round_summaries: null, // no rounds were scored in this staged state
      players: [
        { seat: 0, user_id: 'alice', is_bot: 0, name: 'Alice' },
        { seat: 1, user_id: null, is_bot: 1, name: 'Bot 2' },
        { seat: 2, user_id: 'bob', is_bot: 0, name: 'Bob' },
        { seat: 3, user_id: null, is_bot: 1, name: 'Bot 4' },
      ],
    });
  });

  it('serializes roundSummaries and falls back to a "Player" name for an unknown user', () => {
    const summary: GameState['lastRoundSummary'] = {
      roundIndex: 0,
      contract: { seat: 0, value: 8, sansAtout: false, forced: false },
      contractMade: true,
      trump: 'red',
      trickPoints: [50, 12],
      deltas: [8, -8],
      scores: [8, -8],
    };
    const state: GameState = {
      ...createGame(1),
      phase: 'game_over',
      winner: 0,
      scores: [8, -8],
      lastRoundSummary: summary,
      roundSummaries: [summary],
    };
    const record = gameRecordFrom(
      {
        roomCode: 'room-y',
        startedAt: null,
        seats: ['alice', 'unknown-uid', { bot: true }, null],
        names: { alice: 'Alice' },
      },
      state,
      [],
      { id: 'game-2', finishedAt: 3000 },
    );
    expect(record.round_summaries).toBe(JSON.stringify([summary]));
    expect(record.players).toEqual([
      { seat: 0, user_id: 'alice', is_bot: 0, name: 'Alice' },
      { seat: 1, user_id: 'unknown-uid', is_bot: 0, name: 'Player' },
      { seat: 2, user_id: null, is_bot: 1, name: 'Bot 3' },
      { seat: 3, user_id: null, is_bot: 0, name: 'Player' },
    ]);
  });
});

function summary(over: Partial<RoundSummary> & Pick<RoundSummary, 'contract' | 'contractMade'>) {
  return {
    roundIndex: 0,
    trump: null,
    trickPoints: [0, 0],
    deltas: [0, 0],
    scores: [0, 0],
    ...over,
  } satisfies RoundSummary;
}

describe('memorableFlags', () => {
  it('flags a made 12 sans-atout as hailMary', () => {
    const flags = memorableFlags(
      [
        summary({
          contract: { seat: 0, value: 12, sansAtout: true, forced: false },
          contractMade: true,
        }),
      ],
      0,
    );
    expect(flags.hailMary).toBe(true);
  });

  it('does not flag a MISSED 12 sans-atout, or a made 12 WITH a trump', () => {
    const missed = memorableFlags(
      [
        summary({
          contract: { seat: 0, value: 12, sansAtout: true, forced: false },
          contractMade: false,
        }),
      ],
      0,
    );
    expect(missed.hailMary).toBe(false);
    const withTrump = memorableFlags(
      [
        summary({
          contract: { seat: 0, value: 12, sansAtout: false, forced: false },
          contractMade: true,
          trump: 'red',
        }),
      ],
      0,
    );
    expect(withTrump.hailMary).toBe(false);
  });

  it('flags a round where one team took all 8 tricks as sweep', () => {
    const flags = memorableFlags(
      [
        summary({
          contract: { seat: 1, value: 8, sansAtout: false, forced: false },
          contractMade: true,
          trickCounts: [0, 4, 0, 4],
        }),
      ],
      1,
    );
    expect(flags.sweep).toBe(true);
  });

  it('does not guess a sweep from a legacy summary with no trickCounts', () => {
    const flags = memorableFlags(
      [
        summary({
          contract: { seat: 0, value: 8, sansAtout: false, forced: false },
          contractMade: true,
        }),
      ],
      0,
    );
    expect(flags.sweep).toBe(false);
  });

  it('flags a comeback: winner trailed by 10+ before the final round', () => {
    const flags = memorableFlags(
      [
        summary({
          contract: { seat: 1, value: 10, sansAtout: false, forced: false },
          contractMade: true,
          scores: [0, 15],
        }),
        summary({
          contract: { seat: 0, value: 12, sansAtout: false, forced: false },
          contractMade: true,
          scores: [41, 15],
        }),
      ],
      0,
    );
    expect(flags.comeback).toBe(true);
  });

  it('does not call a narrow final-round swing a comeback', () => {
    // Team 0 wins, but was never behind by 10+ before the last round.
    const flags = memorableFlags(
      [
        summary({
          contract: { seat: 0, value: 9, sansAtout: false, forced: false },
          contractMade: true,
          scores: [9, 5],
        }),
        summary({
          contract: { seat: 0, value: 8, sansAtout: false, forced: false },
          contractMade: true,
          scores: [17, 12],
        }),
      ],
      0,
    );
    expect(flags.comeback).toBe(false);
  });

  it('never flags a comeback for an undecided game (winnerTeam null)', () => {
    const flags = memorableFlags(
      [
        summary({
          contract: { seat: 1, value: 10, sansAtout: false, forced: false },
          contractMade: true,
          scores: [0, 15],
        }),
      ],
      null,
    );
    expect(flags.comeback).toBe(false);
  });
});
