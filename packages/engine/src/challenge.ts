import { hashSeed } from './rng.js';

/**
 * Deal Board — the shared definition of a seeded challenge deal.
 *
 * Lives in the engine because BOTH sides need to agree on it exactly: the
 * client to deal the hand, the server to re-derive the same hand when it
 * verifies a submitted score. Anything that drifted between the two would turn
 * an honest player's submission into a rejection.
 *
 * Two cadences, one machine:
 *  - DAILY  — one deal, the same for everyone, for one UTC day.
 *  - WEEKLY — a set of three curated deals, open for one UTC week.
 *
 * Daily seeds are DERIVED from the date rather than stored, so there is no
 * table of seeds to administer and no way for a seed to go missing; a client
 * can check the server's arithmetic. Weekly seeds are hand-picked constants,
 * because a curated set is the whole point of the weekly.
 */

export type Cadence = 'daily' | 'weekly';

export interface ChallengeDeal {
  /** Stable, self-describing id — the whole challenge is re-derivable from it. */
  readonly id: string;
  readonly cadence: Cadence;
  readonly seed: number;
  /** UTC period this belongs to: 'YYYY-MM-DD' daily, 'YYYY-Www' weekly. */
  readonly periodKey: string;
  /** Index within the period (always 0 for daily; 0-2 for the weekly set). */
  readonly index: number;
}

/** Everyone plays the challenge from the same chair, or the scores aren't
 * comparable. Seat 0, the seat practice mode already puts you in. */
export const CHALLENGE_SEAT = 0;

/** The bots a challenge is played against. Fixed, not a preference: the
 * opposition has to be identical for every player. */
export const CHALLENGE_BOT_DIFFICULTY = 'normal';

/** Two-digit zero pad, for the date keys. */
function pad(n: number): string {
  return n < 10 ? `0${String(n)}` : String(n);
}

/** 'YYYY-MM-DD' in UTC. UTC deliberately, not local time: a shared daily deal
 * that rolls over at different moments per timezone is not a shared deal. */
export function utcDayKey(ms: number): string {
  const d = new Date(ms);
  return `${String(d.getUTCFullYear())}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

/**
 * 'YYYY-Www' — ISO-8601 week date in UTC. Worth the arithmetic rather than
 * "day number / 7": ISO weeks start on Monday and belong to the year holding
 * their Thursday, which is what makes a week key stable across a year
 * boundary instead of producing two half-weeks.
 */
export function utcWeekKey(ms: number): string {
  const d = new Date(ms);
  const day = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  // Shift to the Thursday of this ISO week (getUTCDay: 0=Sun … 6=Sat).
  const dayNumber = (day.getUTCDay() + 6) % 7; // Monday = 0
  day.setUTCDate(day.getUTCDate() - dayNumber + 3);
  const isoYear = day.getUTCFullYear();
  const firstThursday = new Date(Date.UTC(isoYear, 0, 4));
  const firstDayNumber = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstDayNumber + 3);
  const week = 1 + Math.round((day.getTime() - firstThursday.getTime()) / (7 * 86_400_000));
  return `${String(isoYear)}-W${pad(week)}`;
}

/** Stable 32-bit hash of a string — turns a period key into a seed without a
 * lookup table. Small and deterministic on every JS engine. */
function hashKey(key: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

/** The seed for a period + index. Runs the key hash through the engine's own
 * `hashSeed` so challenge seeds are mixed exactly like round seeds are. */
export function challengeSeed(periodKey: string, index: number): number {
  return hashSeed(hashKey(periodKey), index);
}

export function dailyChallenge(nowMs: number): ChallengeDeal {
  const periodKey = utcDayKey(nowMs);
  return {
    id: `d-${periodKey}`,
    cadence: 'daily',
    seed: challengeSeed(periodKey, 0),
    periodKey,
    index: 0,
  };
}

/** How many deals a weekly set contains. */
export const WEEKLY_DEALS = 3;

export function weeklyChallenge(nowMs: number): readonly ChallengeDeal[] {
  const periodKey = utcWeekKey(nowMs);
  return Array.from({ length: WEEKLY_DEALS }, (_unused, index) => ({
    id: `w-${periodKey}-${String(index)}`,
    cadence: 'weekly' as const,
    seed: challengeSeed(periodKey, index + 1),
    periodKey,
    index,
  }));
}

const DAILY_ID_RE = /^d-(\d{4}-\d{2}-\d{2})$/;
const WEEKLY_ID_RE = /^w-(\d{4}-W\d{2})-([0-2])$/;

/**
 * Re-derive a challenge from its id alone. This is what lets the server trust
 * a submission's `challengeId` without storing anything: the id determines the
 * seed, so a forged id just describes a different (equally real) deal, and one
 * from another period is rejected by the caller comparing period keys.
 */
export function challengeById(id: string): ChallengeDeal | null {
  const daily = DAILY_ID_RE.exec(id);
  if (daily !== null) {
    const periodKey = daily[1] as string;
    return { id, cadence: 'daily', seed: challengeSeed(periodKey, 0), periodKey, index: 0 };
  }
  const weekly = WEEKLY_ID_RE.exec(id);
  if (weekly !== null) {
    const periodKey = weekly[1] as string;
    const index = Number(weekly[2]);
    return {
      id,
      cadence: 'weekly',
      seed: challengeSeed(periodKey, index + 1),
      periodKey,
      index,
    };
  }
  return null;
}

/** True when a challenge is still open at `nowMs` — i.e. it belongs to the
 * current period. Closed challenges stay readable, but stop taking scores. */
export function challengeIsOpen(deal: ChallengeDeal, nowMs: number): boolean {
  return deal.cadence === 'daily'
    ? deal.periodKey === utcDayKey(nowMs)
    : deal.periodKey === utcWeekKey(nowMs);
}

/**
 * The bot rng seed for a challenge. Both sides derive it the same way, so the
 * bots play IDENTICALLY for every player — which is what makes the scores
 * comparable, and what lets the server recompute every bot move when it
 * verifies a submission.
 */
export function challengeBotSeed(seed: number): number {
  return (seed ^ 0xb07) >>> 0;
}
