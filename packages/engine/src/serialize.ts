import type { GameState } from './types.js';

export function serialize(state: GameState): string {
  return JSON.stringify(state);
}

/**
 * Parse and structurally validate a serialized state. Returns null on any
 * malformed input — never throws. Future schema versions migrate here.
 */
export function deserialize(json: string): GameState | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null) return null;
  const s = parsed as Record<string, unknown>;
  if (s['schemaVersion'] !== 1) return null;
  if (typeof s['seed'] !== 'number') return null;
  if (!Array.isArray(s['hands']) || s['hands'].length !== 4) return null;
  if (!Array.isArray(s['scores']) || s['scores'].length !== 2) return null;
  if (
    s['phase'] !== 'bidding' &&
    s['phase'] !== 'playing' &&
    s['phase'] !== 'round_over' &&
    s['phase'] !== 'game_over'
  ) {
    return null;
  }
  return parsed as GameState;
}
