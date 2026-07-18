import { describe, expect, it } from 'vitest';
import { deserialize, serialize } from '../src/serialize.js';
import { createGame } from '../src/reducer.js';
import { playFullGame } from './helpers/driver.js';

describe('serialize / deserialize', () => {
  it('round-trips a fresh game losslessly', () => {
    const state = createGame(42);
    expect(deserialize(serialize(state))).toEqual(state);
  });

  it('round-trips every state of a full game losslessly', () => {
    const { states } = playFullGame(13);
    for (const state of states) {
      expect(deserialize(serialize(state))).toEqual(state);
    }
  });

  it('migrates pre-roundSummaries states: recovers the last summary or an empty pad', () => {
    const { states } = playFullGame(13);
    const scored = states.find((s) => s.lastRoundSummary !== null);
    if (scored === undefined) throw new Error('expected a scored state');

    const legacy = (state: object): string => {
      const clone = { ...state } as Record<string, unknown>;
      delete clone['roundSummaries'];
      return JSON.stringify(clone);
    };
    expect(deserialize(legacy(scored))?.roundSummaries).toEqual([scored.lastRoundSummary]);
    expect(deserialize(legacy(createGame(42)))?.roundSummaries).toEqual([]);
  });

  it('migrates pre-house-rules states: rules default to all off', () => {
    const clone = { ...createGame(42) } as Record<string, unknown>;
    delete clone['rules'];
    expect(deserialize(JSON.stringify(clone))?.rules).toEqual({ hailMary12: false });
  });

  it('rejects malformed input without throwing', () => {
    expect(deserialize('not json')).toBeNull();
    expect(deserialize('null')).toBeNull();
    expect(deserialize('"string"')).toBeNull();
    expect(deserialize('{}')).toBeNull();
    expect(deserialize(JSON.stringify({ schemaVersion: 2 }))).toBeNull();
    expect(deserialize(JSON.stringify({ schemaVersion: 1, seed: 'x' }))).toBeNull();
    expect(deserialize(JSON.stringify({ schemaVersion: 1, seed: 1, hands: [] }))).toBeNull();
    expect(
      deserialize(
        JSON.stringify({ schemaVersion: 1, seed: 1, hands: [[], [], [], []], scores: [0] }),
      ),
    ).toBeNull();
    expect(
      deserialize(
        JSON.stringify({
          schemaVersion: 1,
          seed: 1,
          hands: [[], [], [], []],
          scores: [0, 0],
          phase: 'weird',
        }),
      ),
    ).toBeNull();
  });
});
