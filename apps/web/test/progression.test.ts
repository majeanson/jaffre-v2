import { describe, expect, it } from 'vitest';
import {
  LEVEL_TRACK,
  MAX_LEVEL,
  XP_PER_BID_MADE,
  XP_PER_GAME,
  XP_PER_SA_MADE,
  XP_PER_WIN,
  levelFromStats,
  levelFromXp,
  levelProgress,
  trackLevelOf,
  trackRewardAt,
  xpFromStats,
  xpMoment,
  xpToReach,
} from '../src/progression.js';
import { CARD_SKINS, owned } from '../src/cosmetics.js';
import { THEMES } from '../src/theme.js';
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

describe('xp', () => {
  it('sums the four monotonic counters', () => {
    const s = stats({
      games: 10,
      wins: 4,
      bids: { attempted: 12, made: 6 },
      sansAtout: { attempted: 2, made: 1 },
    });
    expect(xpFromStats(s)).toBe(
      10 * XP_PER_GAME + 4 * XP_PER_WIN + 6 * XP_PER_BID_MADE + 1 * XP_PER_SA_MADE,
    );
  });

  it('ignores non-monotonic stats (netPoints, streak) so XP never drops', () => {
    const base = stats({ games: 5, netPoints: 50, streak: { current: 3, best: 3 } });
    const worse = stats({ games: 5, netPoints: -80, streak: { current: 0, best: 3 } });
    expect(xpFromStats(worse)).toBe(xpFromStats(base));
  });
});

describe('level curve', () => {
  it('starts at level 1 with 0 XP and the second level lands after one game', () => {
    expect(xpToReach(1)).toBe(0);
    expect(levelFromXp(0)).toBe(1);
    // One won game with a made bid: 10 + 15 + 5 = 30 = the level-2 gate.
    expect(levelFromXp(30)).toBe(2);
  });

  it('is strictly increasing and exact at every boundary', () => {
    for (let level = 2; level <= MAX_LEVEL; level++) {
      expect(xpToReach(level)).toBeGreaterThan(xpToReach(level - 1));
      expect(levelFromXp(xpToReach(level))).toBe(level);
      expect(levelFromXp(xpToReach(level) - 1)).toBe(level - 1);
    }
  });

  it('caps at MAX_LEVEL with a full (span 0) bar', () => {
    const p = levelProgress(xpToReach(MAX_LEVEL) + 10_000);
    expect(p.level).toBe(MAX_LEVEL);
    expect(p.span).toBe(0);
  });

  it('reports progress within a level', () => {
    const p = levelProgress(xpToReach(3) + 5);
    expect(p.level).toBe(3);
    expect(p.into).toBe(5);
    expect(p.span).toBe(xpToReach(4) - xpToReach(3));
  });
});

describe('level track', () => {
  it('is sorted, within bounds, and rewards each cosmetic at most once', () => {
    const levels = LEVEL_TRACK.map((r) => r.level);
    expect([...levels].sort((a, b) => a - b)).toEqual(levels);
    expect(new Set(levels).size).toBe(levels.length);
    for (const l of levels) {
      expect(l).toBeGreaterThanOrEqual(2);
      expect(l).toBeLessThanOrEqual(MAX_LEVEL);
    }
    const ids = LEVEL_TRACK.map((r) => r.cosmeticId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every reward exists in its catalog with the declared kind, gated at that level', () => {
    for (const r of LEVEL_TRACK) {
      const catalog = r.kind === 'skin' ? CARD_SKINS : THEMES;
      const c = catalog.find((x) => x.id === r.cosmeticId);
      expect(c, `${r.cosmeticId} missing from ${r.kind} catalog`).toBeDefined();
      expect(c?.free, `${r.cosmeticId} should not be free`).toBe(false);
      // Owned once the track level is reached via XP alone, locked for a fresh
      // player. (The exact lower boundary can't be probed generically — the
      // legacy games-gate OR-fallback kicks in at high game counts by design.)
      const at = stats({ games: Math.ceil(xpToReach(r.level) / XP_PER_GAME) });
      expect(c?.unlock?.(at), `${r.cosmeticId} locked at level ${String(r.level)}`).toBe(true);
      expect(c?.unlock?.(stats())).toBe(false);
      expect(trackLevelOf(r.cosmeticId)).toBe(r.level);
    }
    expect(trackRewardAt(2)?.cosmeticId).toBe('juicy');
  });

  it('never re-locks a previously games-gated cosmetic (worst-case XP: all losses, no bids)', () => {
    const legacy: readonly (readonly [string, number])[] = [
      // og-deck deliberately absent: its games>=15 fallback (and the tutorial
      // award's grant) were removed 2026-07-24 to make it strictly level 8.
      ['lamplight-foil', 25],
      ['stained-glass', 30],
      ['vaporwave', 40],
      ['midnight', 10],
      ['abyss', 20],
      ['synthwave', 30],
    ];
    for (const [id, games] of legacy) {
      const c = [...CARD_SKINS, ...THEMES].find((x) => x.id === id);
      // Zero wins, zero made bids — the least XP those games could produce.
      expect(c?.unlock?.(stats({ games })), `${id} re-locked at ${String(games)} games`).toBe(true);
    }
  });

  it('owned() folds track unlocks in from stats alone', () => {
    const ownedIds = owned(CARD_SKINS, stats({ games: 3, wins: 3 }), false);
    expect(ownedIds.has('arcade')).toBe(true);
    expect(ownedIds.has('noir')).toBe(true); // level 3 at 75 XP (gate = 72)
    expect(ownedIds.has('royal')).toBe(false);
  });

  it('level from stats matches the curve', () => {
    expect(levelFromStats(stats())).toBe(1);
    expect(levelFromStats(stats({ games: 1, wins: 1, bids: { attempted: 1, made: 1 } }))).toBe(2);
  });
});

/**
 * The recap's XP beat, and the one race it has to survive: the server writes a
 * finished game's history row inside the same game_over action that sends the
 * recap, so the strip's read can arrive before the row exists. Believing that
 * read is what made "+N XP" land a game late.
 */
describe('xpMoment', () => {
  it('shows a real gain and moves the baseline', () => {
    const m = xpMoment(300, 275, false);
    expect(m.kind).toBe('show');
    if (m.kind !== 'show') return;
    expect(m.gained).toBe(25);
    expect(m.advanceBaseline).toBe(true);
  });

  it('asks for a re-read when the total has not moved by a whole game', () => {
    // A recorded game is worth at least XP_PER_GAME, so anything less than that
    // means the history row has not landed — not that the game earned nothing.
    expect(xpMoment(275, 275, false).kind).toBe('reread');
    expect(xpMoment(275 + XP_PER_GAME - 1, 275, false).kind).toBe('reread');
    expect(xpMoment(275 + XP_PER_GAME, 275, false).kind).toBe('show');
  });

  it('gives up after ONE re-read, and refuses to move the baseline backwards', () => {
    // Still nothing on the second read (a history write that genuinely failed):
    // show the bar, claim no gain, and leave the baseline alone — writing this
    // total would make it the floor the next game's gain is measured from.
    const m = xpMoment(275, 275, true);
    expect(m.kind).toBe('show');
    if (m.kind !== 'show') return;
    expect(m.gained).toBe(0);
    expect(m.advanceBaseline).toBe(false);
  });

  it('never re-reads for a first-ever record, and never reports a negative gain', () => {
    // No baseline yet (first game on this device): nothing to compare against,
    // so there is nothing to wait for either.
    const first = xpMoment(35, null, false);
    expect(first.kind).toBe('show');
    if (first.kind !== 'show') return;
    expect(first.gained).toBe(0);
    expect(first.advanceBaseline).toBe(true);
    // A baseline ahead of the server (a device that saw more than D1 reports)
    // reads as no gain, not as a negative one.
    const behind = xpMoment(100, 500, true);
    if (behind.kind !== 'show') throw new Error('expected show');
    expect(behind.gained).toBe(0);
    expect(behind.advanceBaseline).toBe(false);
  });

  it('hides itself when nothing is recorded at all', () => {
    expect(xpMoment(0, null, false).kind).toBe('hide');
  });

  it('flashes the level-up only when the level actually crossed', () => {
    // 250 XP is level 6, 350 is level 7 (XP_THRESHOLDS).
    const up = xpMoment(350, 250, false);
    if (up.kind !== 'show') throw new Error('expected show');
    expect(up.levelUp).toBe(true);
    const flat = xpMoment(300, 250, false);
    if (flat.kind !== 'show') throw new Error('expected show');
    expect(flat.levelUp).toBe(false);
  });
});
