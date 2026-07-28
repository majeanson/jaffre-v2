import { SUITS, type Suit } from '@jaffre/engine';
import { SUIT_STYLES, suitLabel, type Lang } from '@jaffre/ui';
import type { MasteryLane, Stats } from './net/history.js';

/**
 * Suit mastery — a THIRD progression axis, beside the level track (playtime)
 * and the challenge cosmetics (skill). Where those both measure "how much" and
 * "how well" in aggregate, mastery measures WHERE: five lanes, one per thing
 * you can name when you take a contract.
 *
 * Like every other unlock it is derived entirely from `/api/stats` — the
 * server counts `round_summaries.trump` on the contracts you declared, a field
 * that has been persisted all along, so every lane is retroactive to a
 * player's first game.
 *
 * Five lanes, four counters: a sans-atout contract has no trump, so its lane
 * reads the long-standing `stats.sansAtout` rather than a duplicate.
 */

/** Contracts MADE in a lane before it pays out its skin. */
export const MASTERY_UNLOCK = 5;

export type MasteryLaneId = Suit | 'sansAtout';

/** Lane order = the order the panel shows, suits first then sans-atout. */
export const MASTERY_LANE_IDS: readonly MasteryLaneId[] = [...SUITS, 'sansAtout'];

const EMPTY_LANE: MasteryLane = { attempted: 0, made: 0 };

/**
 * One lane's counters. Tolerates a `stats` from a server that predates the
 * mastery field (or a cached response), reading as an untouched lane rather
 * than throwing — the same defensive posture as the optional `startingHands`
 * and `trickCounts` on RoundSummary.
 */
export function masteryOf(stats: Stats, lane: MasteryLaneId): MasteryLane {
  if (lane === 'sansAtout') return stats.sansAtout;
  return stats.mastery?.[lane] ?? EMPTY_LANE;
}

/** A lane's display name, in the player's language. */
export function masteryLabel(lane: MasteryLaneId, lang: Lang): string {
  if (lane === 'sansAtout') return lang === 'fr' ? 'Sans atout' : 'Sans Atout';
  return suitLabel(lane, lang);
}

/** A lane's colour + glyph, for the panel's bars and the locked-tile chips.
 * Sans-atout has no suit colour of its own — it borrows the ivory foreground,
 * which is exactly how the felt renders a no-trump contract. */
export function masteryStyle(lane: MasteryLaneId): { color: string; glyph: string } {
  if (lane === 'sansAtout') return { color: 'var(--color-ivory)', glyph: '∅' };
  const style = SUIT_STYLES[lane];
  return { color: style.color, glyph: style.glyph };
}

/** True once the lane's skin is earned. */
export function masteryUnlocked(stats: Stats, lane: MasteryLaneId): boolean {
  return masteryOf(stats, lane).made >= MASTERY_UNLOCK;
}

/**
 * Requirement line for a mastery-gated cosmetic (Collection's locked tiles),
 * matching the shape `levelRequirement` returns.
 */
export function masteryRequirement(
  lane: MasteryLaneId,
  stats: Stats,
  lang: Lang,
): { text: string; have: number; need: number } {
  const name = masteryLabel(lane, lang);
  return {
    text:
      lang === 'fr'
        ? `Réussis ${String(MASTERY_UNLOCK)} contrats en ${name.toLowerCase()}`
        : `Make ${String(MASTERY_UNLOCK)} contracts in ${name}`,
    have: masteryOf(stats, lane).made,
    need: MASTERY_UNLOCK,
  };
}

/**
 * How lopsided the five lanes are, 0 (perfectly even) → 1 (everything in one
 * lane). Drives the panel's one line of copy: mastery is meant to read as a
 * mirror of how you bid, not just another grind bar.
 */
export function masterySpread(stats: Stats): number {
  const made = MASTERY_LANE_IDS.map((lane) => masteryOf(stats, lane).made);
  const total = made.reduce((a, b) => a + b, 0);
  if (total === 0) return 0;
  return Math.max(...made) / total;
}

/** The lane you've made the most contracts in, or null before you've made any. */
export function favouriteLane(stats: Stats): MasteryLaneId | null {
  let bestLane: MasteryLaneId | null = null;
  let bestMade = 0;
  for (const lane of MASTERY_LANE_IDS) {
    const { made } = masteryOf(stats, lane);
    if (made > bestMade) {
      bestMade = made;
      bestLane = lane;
    }
  }
  return bestLane;
}
