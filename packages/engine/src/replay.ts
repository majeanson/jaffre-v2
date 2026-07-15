import { applyAction, createGame } from './reducer.js';
import type { Action, GameEvent, Result } from './types.js';

/**
 * Rebuild state by folding the action log over a fresh game. Because the
 * engine is deterministic, the result is bit-identical to the live state —
 * this powers reconnect snapshots, golden fixtures, and the replay viewer.
 * Returns the final state plus the events of the last applied action.
 */
export function replay(seed: number, actions: readonly Action[]): Result {
  let state = createGame(seed);
  let events: readonly GameEvent[] = [];
  for (const action of actions) {
    const result = applyAction(state, action);
    if (!result.ok) return result;
    state = result.state;
    events = result.events;
  }
  return { ok: true, state, events };
}
