import { describe, expect, it } from 'vitest';
import { applyAction, createGame, viewFor, type Action, type GameState } from '@jaffre/engine';
import { chooseAction } from '@jaffre/bots';
import { mulberry32 } from '@jaffre/engine';
import {
  parsePositionHash,
  positionHash,
  stateAt,
  trickStartIndex,
} from '../src/replay/position.js';

/** Play a real game to completion, capturing the action log — the same shape
 * the server persists and `/api/replay` hands back. */
function playOut(seed: number): { actions: Action[]; final: GameState } {
  const rng = mulberry32(seed ^ 0x51ed);
  let state = createGame(seed);
  const actions: Action[] = [];
  for (let guard = 0; guard < 4000 && state.phase !== 'game_over'; guard++) {
    let action: Action | null;
    if (state.phase === 'round_over') {
      action = { type: 'continue' } as Action;
    } else {
      action = chooseAction(viewFor(state, state.turn), rng, 'normal');
    }
    if (action === null) break;
    const result = applyAction(state, action);
    if (!result.ok) break;
    actions.push(action);
    state = result.state;
  }
  return { actions, final: state };
}

const SEED = 12345;

describe('position links', () => {
  it('round-trips through the hash', () => {
    const p = { gameId: 'abc-123', actionIndex: 42, seat: 2 as const };
    expect(parsePositionHash(positionHash(p))).toEqual(p);
  });

  it('rejects anything that is not a position hash', () => {
    for (const h of [
      '',
      '#',
      '#replay/abc',
      '#hand/abc',
      '#hand/abc/1',
      '#hand/abc/1/4', // seat out of range
      '#hand/abc/x/1',
      '#hand//1/1',
      '#hand/abc/1/1/extra',
    ]) {
      expect(parsePositionHash(h), h).toBeNull();
    }
  });
});

describe('folding to a position', () => {
  const { actions, final } = playOut(SEED);

  it('produces a real game with actions to spare', () => {
    expect(actions.length).toBeGreaterThan(20);
    expect(final.phase).toBe('game_over');
  });

  it('index 0 is the untouched deal', () => {
    const state = stateAt(SEED, actions, 0);
    expect(state).not.toBeNull();
    expect(state?.phase).toBe('bidding');
    expect(state?.roundIndex).toBe(0);
  });

  it('is deterministic — the same link always opens the same position', () => {
    const a = stateAt(SEED, actions, 25);
    const b = stateAt(SEED, actions, 25);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('clamps past the end of the log rather than failing', () => {
    // A link that outlived an edit to the log must still open something.
    const state = stateAt(SEED, actions, actions.length + 500);
    expect(state).not.toBeNull();
    expect(state?.phase).toBe('game_over');
  });

  it('clamps a negative index to the deal', () => {
    expect(stateAt(SEED, actions, -5)?.phase).toBe('bidding');
  });

  it('returns null on a corrupt log instead of a half-built state', () => {
    const corrupt: Action[] = [
      ...actions.slice(0, 5),
      // A card the seat cannot legally play at this point.
      { type: 'play_card', seat: 0, card: { suit: 'red', value: 7 } } as Action,
    ];
    expect(stateAt(SEED, corrupt, corrupt.length)).toBeNull();
  });
});

describe('rewinding to the top of a trick', () => {
  const { actions } = playOut(SEED);

  it('lands on a state with an empty trick', () => {
    // Whatever moment is shared, "check this play" must start the trick, not
    // drop you in halfway through someone else's.
    for (const index of [30, 40, 55, 70]) {
      if (index >= actions.length) continue;
      const start = trickStartIndex(SEED, actions, index);
      const state = stateAt(SEED, actions, start);
      expect(state, `index ${String(index)}`).not.toBeNull();
      if (state !== null && state.phase === 'playing') {
        expect(state.currentTrick.length, `index ${String(index)}`).toBe(0);
      }
    }
  });

  it('never moves forward', () => {
    for (let i = 0; i <= Math.min(actions.length, 80); i++) {
      expect(trickStartIndex(SEED, actions, i)).toBeLessThanOrEqual(i);
    }
  });

  it('leaves a bidding position alone', () => {
    // Nothing to rewind into before the first card is played.
    expect(trickStartIndex(SEED, actions, 2)).toBe(2);
  });
});
