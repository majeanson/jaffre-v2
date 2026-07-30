import type { Lang } from '@jaffre/ui';
import type { Stats } from './net/history.js';

/**
 * Progression spine — XP and levels, DERIVED entirely from `/api/stats` like
 * every cosmetic unlock (no new server state, retroactive for every existing
 * player). XP only reads monotonic counters (games, wins, made bids), so it can
 * never go down; the level track (below) hands out a cosmetic at fixed levels,
 * turning the loose pile of stat unlocks into one ladder you can follow.
 *
 * Two progression paths, by design:
 *  - the LEVEL TRACK (here): playtime — every few games, a level, most levels
 *    a reward. Shown on the Journey screen (#journey).
 *  - CHALLENGES (cosmetics.ts / awards.ts): skill & style — win-rate, streaks,
 *    sans-atout, nemesis. Stat-gated as before, surfaced next to their awards.
 */

// One game ≈ 25–35 XP for an active player. Values are FROZEN once shipped:
// they define what a level means; retuning them re-levels everyone.
export const XP_PER_GAME = 10;
export const XP_PER_WIN = 15;
export const XP_PER_BID_MADE = 5;
export const XP_PER_SA_MADE = 25;

export const MAX_LEVEL = 20;

export interface XpBreakdown {
  readonly games: number;
  readonly wins: number;
  readonly bidsMade: number;
  readonly sansAtoutMade: number;
  readonly total: number;
}

/** Where the XP came from — the Journey screen's "how you earn XP" panel. */
export function xpBreakdown(s: Stats): XpBreakdown {
  const games = s.games * XP_PER_GAME;
  const wins = s.wins * XP_PER_WIN;
  const bidsMade = s.bids.made * XP_PER_BID_MADE;
  const sansAtoutMade = s.sansAtout.made * XP_PER_SA_MADE;
  return { games, wins, bidsMade, sansAtoutMade, total: games + wins + bidsMade + sansAtoutMade };
}

export function xpFromStats(s: Stats): number {
  return xpBreakdown(s).total;
}

/** Total XP required to REACH a level (level 1 = 0 XP). A hand-rounded ramp —
 * every threshold reads as a clean number on the Journey track. Retuned
 * 2026-07-24 from the old `30 + 12(n-1)`-step curve by rounding each threshold
 * DOWN only (frozen-constants rule: a retune must never level anyone down or
 * re-lock a track cosmetic — lower thresholds can only promote). */
const XP_THRESHOLDS: readonly number[] = [
  0, 25, 50, 100, 150, 250, 350, 450, 550, 650, 800, 950, 1100, 1300, 1500, 1700, 1900, 2100, 2350,
  2600,
];

export function xpToReach(level: number): number {
  const n = Math.min(MAX_LEVEL, Math.max(1, level)) - 1;
  return XP_THRESHOLDS[n] ?? 0;
}

export function levelFromXp(xp: number): number {
  let level = 1;
  while (level < MAX_LEVEL && xp >= xpToReach(level + 1)) level++;
  return level;
}

export function levelFromStats(s: Stats): number {
  return levelFromXp(xpFromStats(s));
}

export interface LevelProgress {
  readonly level: number;
  readonly xp: number;
  /** XP earned into the current level. */
  readonly into: number;
  /** XP span of the current level (0 at max level — the bar reads full). */
  readonly span: number;
}

export function levelProgress(xp: number): LevelProgress {
  const level = levelFromXp(xp);
  if (level >= MAX_LEVEL) return { level, xp, into: 0, span: 0 };
  const floor = xpToReach(level);
  return { level, xp, into: xp - floor, span: xpToReach(level + 1) - floor };
}

export interface TrackReward {
  readonly level: number;
  /** Cosmetic id in CARD_SKINS, THEMES, FELTS or SWEEPS, per `kind`. */
  readonly cosmeticId: string;
  readonly kind: 'skin' | 'theme' | 'felt' | 'sweep';
}

/**
 * The level track — what each level hands out. Levels 6/8/9/10/11/12/13 carry
 * the cosmetics that used to be raw "play N games" unlocks, placed so the games
 * needed stay at or below the old thresholds (nobody levels DOWN — and the old
 * stat gate is kept as an OR-fallback in the catalogs regardless). 14+ are the
 * long-tail levels with the three track-exclusive skins.
 *
 * Felt and sweep rungs (kind 'felt' / 'sweep') are NOT new gates — they mirror
 * the `atLevel(n)` calls that already ship in felt.ts (L3/6/12/16) and
 * sweeps.ts (L4/9). Those two axes were unlockable all along; they just had no
 * line on this ladder saying so, which is why level 16 used to read as a bare
 * "breather" even though Sugar Shack was waiting there the whole time. Because
 * they reuse EXISTING gates, several levels now carry two rewards (e.g. level
 * 3: Noir AND Kitchen Arborite) — see progress.ts's `detectMoments`, which
 * still announces that as ONE moment, not two.
 */
export const LEVEL_TRACK: readonly TrackReward[] = [
  { level: 2, cosmeticId: 'juicy', kind: 'theme' },
  { level: 3, cosmeticId: 'noir', kind: 'skin' },
  { level: 3, cosmeticId: 'arborite', kind: 'felt' },
  { level: 4, cosmeticId: 'sepia', kind: 'theme' },
  { level: 4, cosmeticId: 'fold', kind: 'sweep' },
  { level: 5, cosmeticId: 'newsprint', kind: 'skin' },
  { level: 6, cosmeticId: 'midnight', kind: 'theme' },
  { level: 6, cosmeticId: 'rink', kind: 'felt' },
  { level: 7, cosmeticId: 'blueprint', kind: 'skin' },
  { level: 8, cosmeticId: 'og-deck', kind: 'skin' },
  { level: 9, cosmeticId: 'abyss', kind: 'theme' },
  { level: 9, cosmeticId: 'snow-drift', kind: 'sweep' },
  { level: 10, cosmeticId: 'lamplight-foil', kind: 'skin' },
  { level: 11, cosmeticId: 'synthwave', kind: 'theme' },
  { level: 12, cosmeticId: 'stained-glass', kind: 'skin' },
  { level: 12, cosmeticId: 'velvet', kind: 'felt' },
  { level: 13, cosmeticId: 'vaporwave', kind: 'skin' },
  { level: 15, cosmeticId: 'circuit', kind: 'skin' },
  { level: 16, cosmeticId: 'sugarbush', kind: 'felt' },
  { level: 17, cosmeticId: 'starfield', kind: 'skin' },
  { level: 20, cosmeticId: 'royal', kind: 'skin' },
];

/** The track reward granted AT a level, if any — the FIRST one when a level
 * carries more than one (see `trackRewardsAt` for the full set). */
export function trackRewardAt(level: number): TrackReward | undefined {
  return LEVEL_TRACK.find((r) => r.level === level);
}

/** EVERY reward granted AT a level — usually one, but see the LEVEL_TRACK
 * comment above for why a level can carry two. */
export function trackRewardsAt(level: number): readonly TrackReward[] {
  return LEVEL_TRACK.filter((r) => r.level === level);
}

/** The next reward still ahead of `level`, or null past the last rung. The
 * "what am I playing towards" line — shared by the Journey screen and the
 * Corner tile that links to it, so the two can never name different prizes. */
export function nextTrackReward(level: number): TrackReward | null {
  return LEVEL_TRACK.find((r) => r.level > level) ?? null;
}

/** The track level a cosmetic sits at, or undefined if it isn't on the track. */
export function trackLevelOf(cosmeticId: string): number | undefined {
  return LEVEL_TRACK.find((r) => r.cosmeticId === cosmeticId)?.level;
}

/**
 * What the recap's XP strip should do with a freshly-read total.
 *
 * Pure so the ONE thing that can go wrong here is testable: the server writes a
 * finished game's history row inside the same game_over action that sends the
 * recap, with no "persisted" signal on the wire, so this read can arrive before
 * the row exists. Every recorded game is worth at least XP_PER_GAME, so a total
 * that has not moved by that much means the row hasn't landed — not that the
 * game was worth nothing.
 *
 * `'reread'` asks the caller to fetch once more. `advanceBaseline` is false
 * whenever the total is not above the baseline: storing a total that predates
 * this game would make it the floor the NEXT game's "+N XP" is measured from,
 * so the gain would appear a game late, on a hand that didn't earn it.
 */
export type XpMoment =
  | { readonly kind: 'hide' }
  | { readonly kind: 'reread' }
  | {
      readonly kind: 'show';
      readonly level: number;
      readonly pct: number;
      readonly gained: number;
      readonly levelUp: boolean;
      readonly advanceBaseline: boolean;
    };

export function xpMoment(xp: number, seen: number | null, rereading: boolean): XpMoment {
  if (xp <= 0) return { kind: 'hide' }; // nothing recorded yet
  const gained = seen === null ? 0 : Math.max(0, xp - seen);
  if (seen !== null && gained < XP_PER_GAME && !rereading) return { kind: 'reread' };
  const p = levelProgress(xp);
  return {
    kind: 'show',
    level: p.level,
    pct: p.span === 0 ? 100 : (p.into / p.span) * 100,
    gained,
    levelUp: seen !== null && p.level > levelFromXp(seen),
    advanceBaseline: seen === null || xp > seen,
  };
}

const t = (lang: Lang, en: string, fr: string): string => (lang === 'fr' ? fr : en);

/** Requirement line for a level-gated cosmetic (Collection locked tiles):
 * progress is measured in LEVELS so the bar reads "level 4/8", not raw XP. */
export function levelRequirement(
  need: number,
  s: Stats,
  lang: Lang,
): { text: string; have: number; need: number } {
  return {
    text: t(lang, `Reach level ${String(need)}`, `Atteins le niveau ${String(need)}`),
    have: levelFromStats(s),
    need,
  };
}
