import { describe, expect, it } from 'vitest';
import {
  CHALLENGE_BOT_DIFFICULTY,
  CHALLENGE_SEAT,
  WEEKLY_DEALS,
  challengeBotSeed,
  challengeById,
  challengeIsOpen,
  challengeSeed,
  dailyChallenge,
  utcDayKey,
  utcWeekKey,
  weeklyChallenge,
} from '../src/challenge.js';
import { deal } from '../src/deck.js';

/**
 * The Deal Board's shared definition. Both the client and the server derive a
 * challenge from these functions independently, so anything that drifts here
 * turns an honest player's submission into a rejection — which makes this the
 * one module where "the two sides agree" is the property under test.
 */

describe('utcDayKey', () => {
  it('formats a UTC date, zero-padding month and day', () => {
    expect(utcDayKey(Date.UTC(2026, 6, 28))).toBe('2026-07-28');
    // The un-padded branch: a two-digit month and day.
    expect(utcDayKey(Date.UTC(2026, 10, 15))).toBe('2026-11-15');
    expect(utcDayKey(Date.UTC(2026, 0, 1))).toBe('2026-01-01');
  });

  it('is the same key across a whole UTC day', () => {
    // A daily deal that rolled over at different moments per timezone would
    // not be a shared deal at all.
    expect(utcDayKey(Date.UTC(2026, 6, 28, 0, 0, 0))).toBe(
      utcDayKey(Date.UTC(2026, 6, 28, 23, 59, 59)),
    );
  });

  it('rolls over exactly at UTC midnight', () => {
    expect(utcDayKey(Date.UTC(2026, 6, 28, 23, 59, 59))).not.toBe(
      utcDayKey(Date.UTC(2026, 6, 29, 0, 0, 0)),
    );
  });
});

describe('utcWeekKey', () => {
  it('gives every day of one ISO week the same key', () => {
    // 2026-07-27 is a Monday; the Sunday that closes that week is 2026-08-02.
    const monday = utcWeekKey(Date.UTC(2026, 6, 27));
    for (let i = 0; i < 7; i++) {
      expect(utcWeekKey(Date.UTC(2026, 6, 27 + i)), `day +${String(i)}`).toBe(monday);
    }
    // The next Monday must start a new week.
    expect(utcWeekKey(Date.UTC(2026, 7, 3))).not.toBe(monday);
  });

  it('keeps a week whole across a year boundary', () => {
    // 2026-12-31 is a Thursday, so it and 2027-01-01 share ISO week 2026-W53.
    // A naive day/7 would split this into two half-weeks.
    expect(utcWeekKey(Date.UTC(2026, 11, 31))).toBe(utcWeekKey(Date.UTC(2027, 0, 1)));
  });

  it('assigns early-January days to the previous ISO year when the week began there', () => {
    // 2027-01-01 is a Friday — ISO week 53 OF 2026, not week 1 of 2027.
    expect(utcWeekKey(Date.UTC(2027, 0, 1))).toBe('2026-W53');
  });

  it('zero-pads the week number', () => {
    // Early January exercises the padded branch; mid-year the unpadded one.
    expect(utcWeekKey(Date.UTC(2026, 0, 8))).toMatch(/^\d{4}-W0\d$/);
    expect(utcWeekKey(Date.UTC(2026, 6, 28))).toMatch(/^\d{4}-W\d{2}$/);
  });
});

describe('challengeSeed', () => {
  it('is stable for a key + index', () => {
    expect(challengeSeed('2026-07-28', 0)).toBe(challengeSeed('2026-07-28', 0));
  });

  it('differs by key and by index', () => {
    expect(challengeSeed('2026-07-28', 0)).not.toBe(challengeSeed('2026-07-29', 0));
    expect(challengeSeed('2026-07-28', 0)).not.toBe(challengeSeed('2026-07-28', 1));
  });

  it('is a usable 32-bit seed', () => {
    const seed = challengeSeed('2026-07-28', 0);
    expect(Number.isInteger(seed)).toBe(true);
    expect(seed).toBeGreaterThanOrEqual(0);
    expect(seed).toBeLessThan(2 ** 32);
  });

  it('produces a real, complete deal', () => {
    // The seed is only worth anything if it deals a legal hand.
    const hands = deal(challengeSeed('2026-07-28', 0), 0);
    expect(hands).toHaveLength(4);
    for (const hand of hands) expect(hand).toHaveLength(8);
  });

  it('handles an empty key without collapsing', () => {
    expect(Number.isInteger(challengeSeed('', 0))).toBe(true);
  });
});

describe('dailyChallenge', () => {
  it('describes today, and round-trips through its id', () => {
    const now = Date.UTC(2026, 6, 28, 12);
    const d = dailyChallenge(now);
    expect(d.cadence).toBe('daily');
    expect(d.index).toBe(0);
    expect(d.periodKey).toBe('2026-07-28');
    expect(d.id).toBe('d-2026-07-28');
    expect(challengeById(d.id)).toEqual(d);
  });

  it('gives consecutive days different deals', () => {
    const a = dailyChallenge(Date.UTC(2026, 6, 28));
    const b = dailyChallenge(Date.UTC(2026, 6, 29));
    expect(a.seed).not.toBe(b.seed);
  });
});

describe('weeklyChallenge', () => {
  it('ships a curated set of distinct deals that each round-trip', () => {
    const week = weeklyChallenge(Date.UTC(2026, 6, 28));
    expect(week).toHaveLength(WEEKLY_DEALS);
    expect(new Set(week.map((d) => d.seed)).size).toBe(WEEKLY_DEALS);
    week.forEach((d, i) => {
      expect(d.cadence).toBe('weekly');
      expect(d.index).toBe(i);
      expect(challengeById(d.id)).toEqual(d);
    });
  });

  it('never collides with the daily of the same period', () => {
    // The weekly set is offset by one index for exactly this reason.
    const day = dailyChallenge(Date.UTC(2026, 6, 28));
    for (const w of weeklyChallenge(Date.UTC(2026, 6, 28))) {
      expect(w.seed).not.toBe(day.seed);
    }
  });
});

describe('challengeById', () => {
  it('re-derives a daily and a weekly from the id alone', () => {
    // This is what lets the server trust a submitted challengeId without
    // storing anything: the id fully determines the deal.
    expect(challengeById('d-2026-07-28')?.seed).toBe(challengeSeed('2026-07-28', 0));
    expect(challengeById('w-2026-W31-2')?.seed).toBe(challengeSeed('2026-W31', 3));
  });

  it('returns null for anything malformed', () => {
    for (const id of [
      '',
      'x',
      'd-',
      'd-2026-7-28', // unpadded
      'd-2026-07-28-1', // trailing junk
      'w-2026-W31', // no index
      'w-2026-W31-3', // index out of range
      'w-2026-31-0', // missing W
      'e-2026-07-28', // unknown cadence
    ]) {
      expect(challengeById(id), id).toBeNull();
    }
  });
});

describe('challengeIsOpen', () => {
  it('opens a daily only on its own UTC day', () => {
    const d = dailyChallenge(Date.UTC(2026, 6, 28, 12));
    expect(challengeIsOpen(d, Date.UTC(2026, 6, 28, 0, 0, 0))).toBe(true);
    expect(challengeIsOpen(d, Date.UTC(2026, 6, 28, 23, 59, 59))).toBe(true);
    expect(challengeIsOpen(d, Date.UTC(2026, 6, 29, 0, 0, 1))).toBe(false);
    expect(challengeIsOpen(d, Date.UTC(2026, 6, 27, 12))).toBe(false);
  });

  it('opens a weekly for its whole ISO week', () => {
    const [w] = weeklyChallenge(Date.UTC(2026, 6, 28));
    expect(w).toBeDefined();
    if (w === undefined) return;
    expect(challengeIsOpen(w, Date.UTC(2026, 6, 27))).toBe(true); // Monday
    expect(challengeIsOpen(w, Date.UTC(2026, 7, 2))).toBe(true); // Sunday
    expect(challengeIsOpen(w, Date.UTC(2026, 7, 3))).toBe(false); // next Monday
  });
});

describe('challengeBotSeed', () => {
  it('is derived, stable, and a valid 32-bit seed', () => {
    // Both sides derive it identically — that is what makes every player meet
    // the same opposition, and what lets the server recompute every bot move.
    const seed = challengeSeed('2026-07-28', 0);
    expect(challengeBotSeed(seed)).toBe(challengeBotSeed(seed));
    expect(challengeBotSeed(seed)).toBeGreaterThanOrEqual(0);
    expect(challengeBotSeed(seed)).toBeLessThan(2 ** 32);
  });

  it('differs from the deal seed, so bots do not mirror the shuffle', () => {
    const seed = challengeSeed('2026-07-28', 0);
    expect(challengeBotSeed(seed)).not.toBe(seed);
  });
});

describe('challenge constants', () => {
  it('pins the seat and difficulty every player faces', () => {
    // Not preferences: a score is only comparable if everyone played the same
    // chair against the same opposition.
    expect(CHALLENGE_SEAT).toBe(0);
    expect(CHALLENGE_BOT_DIFFICULTY).toBe('normal');
  });
});
