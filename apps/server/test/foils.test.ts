import { describe, expect, it } from 'vitest';
import { FOIL_ODDS, foilAwardId, foilSkinOf, rollFoil } from '../src/foils.js';

/**
 * The foil roll. Two things must hold or the feature is either exploitable or
 * broken: it must be un-re-rollable, and it must be rare without being dead.
 */

const OWNS_NOTHING = new Set<string>();

describe('foil ids', () => {
  it('round-trips a skin id', () => {
    expect(foilSkinOf(foilAwardId('noir'))).toBe('noir');
  });

  it('does not mistake a real award for a foil', () => {
    for (const id of ['ten-wins', 'tutorial-complete', 'first-win']) {
      expect(foilSkinOf(id), id).toBeNull();
    }
  });
});

describe('rolling a foil', () => {
  it('is deterministic for a given (game, player) — no re-rolling', () => {
    // THE property that stops a client resubmitting a finished game until it
    // gets a drop: the same inputs always decide the same way.
    for (let i = 0; i < 50; i++) {
      const a = rollFoil(`game-${String(i)}`, 'alice', 'noir', OWNS_NOTHING);
      const b = rollFoil(`game-${String(i)}`, 'alice', 'noir', OWNS_NOTHING);
      expect(a).toBe(b);
    }
  });

  it('decides independently per player at the same table', () => {
    // Not a table-wide coin flip: four people finishing one game must not all
    // win or all lose together.
    const outcomes = new Set(
      ['alice', 'bob', 'carol', 'dave'].flatMap((who) =>
        Array.from({ length: 40 }, (_u, i) => rollFoil(`g${String(i)}`, who, 'noir', OWNS_NOTHING)),
      ),
    );
    expect(outcomes.size).toBeGreaterThan(1);
  });

  it('never drops a foil the player already owns', () => {
    const owns = new Set([foilAwardId('noir')]);
    for (let i = 0; i < 500; i++) {
      expect(rollFoil(`g${String(i)}`, 'alice', 'noir', owns)).toBeNull();
    }
  });

  it('drops nothing when no skin is equipped', () => {
    for (let i = 0; i < 200; i++) {
      expect(rollFoil(`g${String(i)}`, 'alice', null, OWNS_NOTHING)).toBeNull();
    }
  });

  it('refuses a skin id that is not a plain slug', () => {
    // The id becomes an award row and, on the client, an attribute value.
    for (const bad of ['../etc', 'DROP TABLE', 'a'.repeat(40), 'Noir', '']) {
      expect(rollFoil('g1', 'alice', bad, OWNS_NOTHING), bad).toBeNull();
    }
  });

  it('only ever grants the equipped skin’s foil', () => {
    for (let i = 0; i < 500; i++) {
      const got = rollFoil(`g${String(i)}`, 'alice', 'gilded', OWNS_NOTHING);
      if (got !== null) expect(got).toBe(foilAwardId('gilded'));
    }
  });

  it('is rare, but not so rare it never happens', () => {
    // Not asserting the exact rate (that would just restate the constant) —
    // asserting the feature is alive and is not handing one out every game.
    const trials = 4000;
    let hits = 0;
    for (let i = 0; i < trials; i++) {
      if (rollFoil(`game-${String(i)}`, 'alice', 'noir', OWNS_NOTHING) !== null) hits++;
    }
    const rate = hits / trials;
    expect(hits).toBeGreaterThan(0);
    // Within 2x either side of the intended 1-in-FOIL_ODDS.
    expect(rate).toBeGreaterThan(1 / (FOIL_ODDS * 2));
    expect(rate).toBeLessThan(2 / FOIL_ODDS);
  });
});
