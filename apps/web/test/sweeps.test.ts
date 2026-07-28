import { describe, expect, it } from 'vitest';
import { TRICK_SWEEPS, DEFAULT_TRICK_SWEEP, trickSweepById } from '@jaffre/ui';
import { SWEEPS, DEFAULT_SWEEP, sweepCatalogIsSound } from '../src/sweeps.js';
import { CARD_SKINS, owned } from '../src/cosmetics.js';
import type { Stats } from '../src/net/history.js';

function stats(over: Partial<Stats> = {}): Stats {
  return {
    games: 0,
    wins: 0,
    winRate: 0,
    netPoints: 0,
    bids: { attempted: 0, made: 0 },
    sansAtout: { attempted: 0, made: 0 },
    bestPartner: null,
    nemesis: null,
    streak: { current: 0, best: 0 },
    ...over,
  };
}

const POSITIONS = [0, 1, 2, 3] as const;

describe('trick sweep variants', () => {
  /**
   * THE load-bearing invariant. A variant's motion must finish inside
   * SWEEP_DURATION_S, because useTrickHold clears the trick just after that
   * and both bot pacers are sized to cover hold + sweep. A variant that runs
   * long is either cut off mid-flight or still on screen when the next card
   * lands — and neither failure is visible in a unit test of anything else.
   */
  it('every variant finishes within the sweep budget, for every seat and index', () => {
    for (const variant of TRICK_SWEEPS) {
      for (const winner of POSITIONS) {
        for (const position of POSITIONS) {
          for (let index = 0; index < 4; index++) {
            const step = variant.step(position, winner, index);
            const total = step.delayFraction + step.durationFraction;
            expect(
              total,
              `${variant.id} overruns its budget at seat ${String(position)} → ${String(
                winner,
              )} index ${String(index)}: ${String(total)}`,
            ).toBeLessThanOrEqual(1);
            expect(step.delayFraction).toBeGreaterThanOrEqual(0);
            expect(step.durationFraction).toBeGreaterThan(0);
          }
        }
      }
    }
  });

  it('every variant actually removes the card from view', () => {
    // A sweep that forgot to fade would leave four cards frozen on the felt
    // after AnimatePresence stops tracking them.
    for (const variant of TRICK_SWEEPS) {
      for (const winner of POSITIONS) {
        const step = variant.step(0, winner, 0);
        expect(step.animate.opacity, `${variant.id} never fades out`).toBe(0);
      }
    }
  });

  it('every variant moves toward the winner, not away', () => {
    // Sanity on direction: sweeping to the top seat must end up above centre,
    // to the bottom seat below it. Catches a sign flip in a new variant.
    for (const variant of TRICK_SWEEPS) {
      const up = variant.step(0, 2, 0).animate;
      const down = variant.step(0, 0, 0).animate;
      expect((up.y ?? 0) < 0, `${variant.id} does not travel toward the top seat`).toBe(true);
      expect((down.y ?? 0) > 0, `${variant.id} does not travel toward the bottom seat`).toBe(true);
    }
  });

  it('has unique ids and resolves an unknown id to the default', () => {
    const ids = TRICK_SWEEPS.map((v) => v.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(trickSweepById('no-such-sweep').id).toBe(DEFAULT_TRICK_SWEEP);
    expect(trickSweepById(DEFAULT_TRICK_SWEEP).id).toBe(DEFAULT_TRICK_SWEEP);
  });
});

describe('sweep catalog', () => {
  it('only offers variants the devkit actually ships', () => {
    expect(sweepCatalogIsSound()).toBe(true);
  });

  it('ships every variant as an equippable cosmetic', () => {
    // The other direction: a variant with no catalog entry is unreachable.
    for (const variant of TRICK_SWEEPS) {
      expect(
        SWEEPS.some((c) => c.id === variant.id),
        `${variant.id} has no tile`,
      ).toBe(true);
    }
  });

  it('leaves the classic sweep free, so nobody opts in to keep what they had', () => {
    const brandNew = stats();
    expect(owned(SWEEPS, brandNew, false).has(DEFAULT_SWEEP)).toBe(true);
  });

  it('gates the rest behind real play', () => {
    const brandNew = owned(SWEEPS, stats(), false);
    expect(brandNew.size).toBe(1);
    const veteran = owned(
      SWEEPS,
      stats({ games: 200, wins: 120, streak: { current: 2, best: 9 } }),
      false,
    );
    expect(veteran.has('riffle')).toBe(true);
  });

  it('does not collide with a card-skin id', () => {
    // Both catalogs feed the same `seen` set in cosmeticsBoot, so a shared id
    // would make one axis's unlock silently mark the other's as seen.
    const skinIds = new Set(CARD_SKINS.map((c) => c.id));
    for (const s of SWEEPS)
      expect(skinIds.has(s.id), `${s.id} collides with a card skin`).toBe(false);
  });
});
