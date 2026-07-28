import { describe, expect, it } from 'vitest';
import {
  MASTERY_LANE_IDS,
  MASTERY_UNLOCK,
  favouriteLane,
  masteryLabel,
  masteryOf,
  masteryRequirement,
  masterySpread,
  masteryUnlocked,
} from '../src/mastery.js';
import { CARD_SKINS, MASTERY_CRESTS, owned } from '../src/cosmetics.js';
import type { MasteryLane, Stats } from '../src/net/history.js';

function lane(made: number, attempted = made): MasteryLane {
  return { attempted, made };
}

function stats(over: Partial<Stats> = {}): Stats {
  return {
    games: 0,
    wins: 0,
    winRate: 0,
    netPoints: 0,
    bids: { attempted: 0, made: 0 },
    sansAtout: { attempted: 0, made: 0 },
    mastery: {
      red: lane(0),
      brown: lane(0),
      green: lane(0),
      blue: lane(0),
    },
    bestPartner: null,
    nemesis: null,
    streak: { current: 0, best: 0 },
    ...over,
  };
}

describe('mastery lanes', () => {
  it('has five lanes: the four suits plus sans-atout', () => {
    expect(MASTERY_LANE_IDS).toEqual(['red', 'brown', 'green', 'blue', 'sansAtout']);
  });

  it('reads the sans-atout lane from the long-standing top-level counter', () => {
    // Deliberately NOT a duplicate field — sans-atout contracts have no trump,
    // so `stats.sansAtout` IS that lane.
    const s = stats({ sansAtout: { attempted: 4, made: 3 } });
    expect(masteryOf(s, 'sansAtout')).toEqual({ attempted: 4, made: 3 });
  });

  it('reads a suit lane from the mastery table', () => {
    const s = stats({
      mastery: { red: lane(3, 5), brown: lane(0), green: lane(0), blue: lane(0) },
    });
    expect(masteryOf(s, 'red')).toEqual({ attempted: 5, made: 3 });
  });

  it('treats a server that predates the mastery field as untouched lanes', () => {
    // A client can outrun its worker, or read a cached pre-mastery response.
    // That must degrade to zeroes, not throw.
    const withoutMastery: Partial<Stats> = { ...stats() };
    delete withoutMastery.mastery;
    const s = withoutMastery as Stats;
    expect(masteryOf(s, 'green')).toEqual({ attempted: 0, made: 0 });
    expect(masteryUnlocked(s, 'green')).toBe(false);
    expect(favouriteLane(s)).toBeNull();
  });
});

describe('mastery unlocks', () => {
  it('unlocks a lane at exactly the threshold, not one short', () => {
    const short = stats({
      mastery: { red: lane(MASTERY_UNLOCK - 1), brown: lane(0), green: lane(0), blue: lane(0) },
    });
    const exact = stats({
      mastery: { red: lane(MASTERY_UNLOCK), brown: lane(0), green: lane(0), blue: lane(0) },
    });
    expect(masteryUnlocked(short, 'red')).toBe(false);
    expect(masteryUnlocked(exact, 'red')).toBe(true);
  });

  it('counts only contracts that STOOD, not those attempted', () => {
    const s = stats({
      mastery: { red: lane(1, 20), brown: lane(0), green: lane(0), blue: lane(0) },
    });
    expect(masteryUnlocked(s, 'red')).toBe(false);
  });

  it('ships one crest per suit, each gated on its own lane', () => {
    expect(MASTERY_CRESTS.map((c) => c.id)).toEqual([
      'crest-red',
      'crest-brown',
      'crest-green',
      'crest-blue',
    ]);
    const greenOnly = stats({
      mastery: { red: lane(0), brown: lane(0), green: lane(MASTERY_UNLOCK), blue: lane(0) },
    });
    const ids = owned(CARD_SKINS, greenOnly, false);
    expect(ids.has('crest-green')).toBe(true);
    expect(ids.has('crest-red')).toBe(false);
    expect(ids.has('crest-blue')).toBe(false);
  });

  it('every crest is in the shipped card-skin catalog', () => {
    for (const crest of MASTERY_CRESTS) {
      expect(CARD_SKINS.some((c) => c.id === crest.id)).toBe(true);
    }
  });

  it('reports lane progress for a locked tile', () => {
    const s = stats({
      mastery: { red: lane(2, 6), brown: lane(0), green: lane(0), blue: lane(0) },
    });
    expect(masteryRequirement('red', s, 'en')).toEqual({
      text: `Make ${String(MASTERY_UNLOCK)} contracts in Red`,
      have: 2,
      need: MASTERY_UNLOCK,
    });
    expect(masteryRequirement('red', s, 'fr').have).toBe(2);
  });

  it('does not re-lock the grandfathered sans-atout skin', () => {
    // The sans-atout lane pays the long-standing `sans-atout` skin at its
    // ORIGINAL threshold of 3. Raising it to MASTERY_UNLOCK would take the
    // deck back off anyone sitting on 3 or 4 — the one thing that can't be
    // undone once players have seen it.
    const s = stats({ sansAtout: { attempted: 5, made: 3 } });
    expect(owned(CARD_SKINS, s, false).has('sans-atout')).toBe(true);
  });
});

describe('mastery shape', () => {
  it('reads an even spread as even and a lopsided one as narrow', () => {
    const even = stats({
      mastery: { red: lane(2), brown: lane(2), green: lane(2), blue: lane(2) },
      sansAtout: { attempted: 2, made: 2 },
    });
    const narrow = stats({
      mastery: { red: lane(9), brown: lane(0), green: lane(1), blue: lane(0) },
    });
    expect(masterySpread(even)).toBeCloseTo(0.2);
    expect(masterySpread(narrow)).toBeCloseTo(0.9);
    expect(favouriteLane(narrow)).toBe('red');
  });

  it('is 0 and has no favourite before any contract stands', () => {
    expect(masterySpread(stats())).toBe(0);
    expect(favouriteLane(stats())).toBeNull();
  });

  it('can name sans-atout as the favourite lane', () => {
    const s = stats({ sansAtout: { attempted: 4, made: 4 } });
    expect(favouriteLane(s)).toBe('sansAtout');
    expect(masteryLabel('sansAtout', 'fr')).toBe('Sans atout');
  });
});
