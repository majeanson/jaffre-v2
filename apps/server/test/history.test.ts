import { describe, expect, it } from 'vitest';
import { createGame } from '@jaffre/engine';
import type { Action, GameState } from '@jaffre/engine';
import { gameRecordFrom } from '../src/history.js';

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
      players: [
        { seat: 0, user_id: 'alice', is_bot: 0 },
        { seat: 1, user_id: null, is_bot: 1 },
        { seat: 2, user_id: 'bob', is_bot: 0 },
        { seat: 3, user_id: null, is_bot: 1 },
      ],
    });
  });
});
