import { describe, expect, it } from 'vitest';
import { EMPTY_SEEN, detectMoments, momentHref, type ProgressSeen } from '../src/progress.js';
import { LEVEL_TRACK } from '../src/progression.js';
import { AWARDS } from '../src/awards.js';

/**
 * Progress moments. The interesting behaviour is all in what is NOT announced:
 * a first run, a re-run with no change, and — the one worth a test — a single
 * event that would otherwise be reported two or three times.
 */

const seen = (over: Partial<ProgressSeen> = {}): ProgressSeen => ({
  level: 1,
  awards: [],
  cosmetics: [],
  ...over,
});

/** A level that actually hands out a cosmetic, taken from the real track. */
const REWARD_LEVEL = LEVEL_TRACK[0] as (typeof LEVEL_TRACK)[number];
/** A real award that carries a cosmetic reward. */
const REWARD_AWARD = AWARDS.find((a) => a.reward !== undefined) as (typeof AWARDS)[number];

describe('first run', () => {
  it('says nothing at all', () => {
    // A player arriving with a whole career behind them must not have it
    // replayed as news.
    const moments = detectMoments(
      { level: 12, awards: AWARDS.map((a) => a.id), cosmetics: ['noir', 'tavern'] },
      EMPTY_SEEN,
      'en',
      true,
    );
    expect(moments).toEqual([]);
  });
});

describe('level 1', () => {
  it('is never announced — it is where everyone starts', () => {
    // A snapshot written before this shipped can read as level 0. Without a
    // floor, the next visit would congratulate the player on existing.
    const moments = detectMoments(
      { level: 1, awards: [], cosmetics: [] },
      seen({ level: 0 }),
      'en',
      false,
    );
    expect(moments).toEqual([]);
  });

  it('still announces the real levels above it', () => {
    const moments = detectMoments(
      { level: 3, awards: [], cosmetics: [] },
      seen({ level: 0 }),
      'en',
      false,
    );
    expect(moments.map((m) => (m.kind === 'level' ? m.level : 0))).toEqual([2, 3]);
  });
});

describe('nothing changed', () => {
  it('produces no moments', () => {
    const state = { level: 4, awards: ['first-win'], cosmetics: [] };
    expect(detectMoments(state, seen({ level: 4, awards: ['first-win'] }), 'en', false)).toEqual(
      [],
    );
  });
});

describe('levels', () => {
  it('announces one moment per level crossed', () => {
    const moments = detectMoments(
      { level: 4, awards: [], cosmetics: [] },
      seen({ level: 1 }),
      'en',
      false,
    );
    expect(moments.map((m) => m.kind)).toEqual(['level', 'level', 'level']);
    expect(moments.map((m) => (m.kind === 'level' ? m.level : 0))).toEqual([2, 3, 4]);
  });

  it('carries the cosmetic that level handed out', () => {
    const moments = detectMoments(
      { level: REWARD_LEVEL.level, awards: [], cosmetics: [REWARD_LEVEL.cosmeticId] },
      seen({ level: REWARD_LEVEL.level - 1 }),
      'en',
      false,
    );
    const level = moments.find((m) => m.kind === 'level');
    expect(level?.kind === 'level' && level.reward?.id).toBe(REWARD_LEVEL.cosmeticId);
  });

  it('does NOT also announce that cosmetic separately', () => {
    // The whole point: levelling to N and unlocking N's reward is ONE thing
    // that happened, and must read as one line.
    const moments = detectMoments(
      { level: REWARD_LEVEL.level, awards: [], cosmetics: [REWARD_LEVEL.cosmeticId] },
      seen({ level: REWARD_LEVEL.level - 1 }),
      'en',
      false,
    );
    expect(moments.filter((m) => m.kind === 'cosmetic')).toHaveLength(0);
    expect(moments).toHaveLength(1);
  });
});

describe('awards', () => {
  it('announces a newly earned award and absorbs its reward', () => {
    const moments = detectMoments(
      { level: 1, awards: [REWARD_AWARD.id], cosmetics: [REWARD_AWARD.reward as string] },
      seen(),
      'en',
      false,
    );
    expect(moments).toHaveLength(1);
    const award = moments[0];
    expect(award?.kind).toBe('award');
    expect(award?.kind === 'award' && award.reward?.id).toBe(REWARD_AWARD.reward);
  });

  it('ignores a foil grant, which is not an award', () => {
    // Foils ride in on the same list but have no catalog entry — announcing
    // "foil:noir" would be gibberish.
    const moments = detectMoments(
      { level: 1, awards: ['foil:noir'], cosmetics: [] },
      seen(),
      'en',
      false,
    );
    expect(moments).toEqual([]);
  });
});

describe('cosmetics with no parent event', () => {
  it('are announced on their own', () => {
    // A challenge unlock (win rate, streak…) belongs to no level and no award.
    const moments = detectMoments(
      { level: 1, awards: [], cosmetics: ['pixel-parlor'] },
      seen(),
      'en',
      false,
    );
    expect(moments).toHaveLength(1);
    expect(moments[0]?.kind).toBe('cosmetic');
  });
});

describe('where a moment leads', () => {
  it('sends a cosmetic to its own tile', () => {
    expect(momentHref({ kind: 'cosmetic', key: 'k', id: 'tavern', label: 'Tavern Wood' })).toBe(
      '#collection/tavern',
    );
  });

  it('sends a rewarded level to the reward tile, and a bare one to the Journey', () => {
    expect(
      momentHref({
        kind: 'level',
        key: 'k',
        level: 3,
        reward: { id: 'noir', label: 'Noir' },
      }),
    ).toBe('#collection/noir');
    expect(momentHref({ kind: 'level', key: 'k', level: 14, reward: null })).toBe('#journey');
  });

  it('sends a bare award to the Awards shelf', () => {
    expect(
      momentHref({
        kind: 'award',
        key: 'k',
        id: 'veteran',
        icon: '🎖️',
        name: 'Veteran',
        reward: null,
      }),
    ).toBe('#awards');
  });
});
