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
  /** Cosmetic id in CARD_SKINS or THEMES. */
  readonly cosmeticId: string;
  readonly kind: 'skin' | 'theme';
}

/**
 * The level track — what each level hands out. Levels 6/8/9/10/11/12/13 carry
 * the cosmetics that used to be raw "play N games" unlocks, placed so the games
 * needed stay at or below the old thresholds (nobody levels DOWN — and the old
 * stat gate is kept as an OR-fallback in the catalogs regardless). 14+ are the
 * long-tail levels with the three track-exclusive skins.
 */
export const LEVEL_TRACK: readonly TrackReward[] = [
  { level: 2, cosmeticId: 'juicy', kind: 'theme' },
  { level: 3, cosmeticId: 'noir', kind: 'skin' },
  { level: 4, cosmeticId: 'sepia', kind: 'theme' },
  { level: 5, cosmeticId: 'newsprint', kind: 'skin' },
  { level: 6, cosmeticId: 'midnight', kind: 'theme' },
  { level: 7, cosmeticId: 'blueprint', kind: 'skin' },
  { level: 8, cosmeticId: 'og-deck', kind: 'skin' },
  { level: 9, cosmeticId: 'abyss', kind: 'theme' },
  { level: 10, cosmeticId: 'lamplight-foil', kind: 'skin' },
  { level: 11, cosmeticId: 'synthwave', kind: 'theme' },
  { level: 12, cosmeticId: 'stained-glass', kind: 'skin' },
  { level: 13, cosmeticId: 'vaporwave', kind: 'skin' },
  { level: 15, cosmeticId: 'circuit', kind: 'skin' },
  { level: 17, cosmeticId: 'starfield', kind: 'skin' },
  { level: 20, cosmeticId: 'royal', kind: 'skin' },
];

/** The track reward granted AT a level, if any. */
export function trackRewardAt(level: number): TrackReward | undefined {
  return LEVEL_TRACK.find((r) => r.level === level);
}

/** The track level a cosmetic sits at, or undefined if it isn't on the track. */
export function trackLevelOf(cosmeticId: string): number | undefined {
  return LEVEL_TRACK.find((r) => r.cosmeticId === cosmeticId)?.level;
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
