import { useSyncExternalStore } from 'react';
import { hasSeenTutorial } from '../table/tutorialPref.js';

/**
 * How much the game explains itself — ONE dial for every teaching surface.
 *
 * Before this there were six: the Coach's on/off pref, the practice tutorial's
 * step set, the online intro latch, the home nudge latch, and — reachable by
 * nothing at all — the bid panel's "Bids are points, not tricks" strip. "Coach
 * off" silenced the tip pill and the rings while the coach-marks kept firing
 * and the strip kept preaching, so there was no state that meant *I know this
 * game*. Now there is exactly one, and it is the same value in practice, in a
 * room and in a replay.
 */
export type HelpLevel = 'learning' | 'coach' | 'off';

/** In dial order, loudest first — the picker renders this array. */
export const HELP_LEVELS = ['learning', 'coach', 'off'] as const;

const KEY = 'jaffre:help';

/** The pref the Coach used to live in. Read ONCE, by the migration below, and
 * never written again. */
const LEGACY_COACH_KEY = 'jaffre:coach';

/**
 * Same-tab signal that the dial moved. Every surface that shows a hint
 * subscribes, which is what makes the three toggles (Settings, the table's
 * Options drawer, the replay bar) one control instead of three copies of a
 * boolean that had to be manually kept in sync. The `storage` event never
 * fires in the tab that wrote it — same convention as PACE_EVENT.
 */
export const HELP_LEVEL_EVENT = 'jaffre:help-level';

const listeners = new Set<() => void>();

function isLevel(v: unknown): v is HelpLevel {
  return v === 'learning' || v === 'coach' || v === 'off';
}

/** Scene-viewer-only ephemeral override — see overrideHelpLevel. */
let override: HelpLevel | null = null;

/** Read once at boot by resolveHelpLevel, then served from here: currentHelpLevel
 * is called on every render of every hint, and localStorage is not free. */
let cached: HelpLevel | null = null;

/**
 * Resolve the dial's starting position, once, and write it down — from then on
 * there is one plain value with no derivation left in it.
 *
 * An explicit choice always wins, and that includes the OLD Coach pref: a
 * player who switched the Coach off was telling us to leave them alone, so
 * they land on `off`, not on a "learning" default that would start teaching
 * them again. Everyone else is placed by whether they have taken the tutorial —
 * the one signal we hold locally for "has met this game before".
 */
export function resolveHelpLevel(): HelpLevel {
  let level: HelpLevel;
  try {
    const stored = localStorage.getItem(KEY);
    if (isLevel(stored)) {
      cached = stored;
      return stored;
    }
    const legacy = localStorage.getItem(LEGACY_COACH_KEY);
    level = legacy === 'off' ? 'off' : hasSeenTutorial() ? 'coach' : 'learning';
    localStorage.setItem(KEY, level);
  } catch {
    // Storage unavailable — teach, and re-decide next visit. A first-timer who
    // gets the tips is merely over-helped; an expert who loses them is not.
    level = 'learning';
  }
  cached = level;
  return level;
}

export function currentHelpLevel(): HelpLevel {
  if (override !== null) return override;
  return cached ?? resolveHelpLevel();
}

export function setHelpLevel(next: HelpLevel): void {
  cached = next;
  try {
    localStorage.setItem(KEY, next);
  } catch {
    // Storage unavailable — the dial holds for this visit only.
  }
  for (const notify of listeners) notify();
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(HELP_LEVEL_EVENT));
}

/** Force a level WITHOUT touching the stored preference (null clears). For the
 * scene viewer, which stages the bid panel at two levels in one sweep — same
 * reasoning as overrideLang: persisting would leak past a full navigation. */
export function overrideHelpLevel(level: HelpLevel | null): void {
  override = level;
  for (const notify of listeners) notify();
}

function subscribe(notify: () => void): () => void {
  listeners.add(notify);
  return () => listeners.delete(notify);
}

/** The dial as reactive state. Every hint-bearing surface reads this. */
export function useHelpLevel(): HelpLevel {
  return useSyncExternalStore(subscribe, currentHelpLevel, currentHelpLevel);
}

/**
 * Advice: the Coach's tip pill, the violet ring on its suggested bid and card,
 * and the recap's "one thing to work on". Everything but `off`.
 */
export function showsCoach(level: HelpLevel): boolean {
  return level !== 'off';
}

/**
 * Teaching: the tutorial's intro cards, coach-marks and progress pip, the bid
 * panel's beginner strip, and the home nudge. `learning` only.
 *
 * The line this draws is teaching vs. state. "You must follow green" and "All
 * or nothing — make 12 sans atout to win" are NOT teaching: the first says why
 * your tap did nothing and the second warns about a move you can commit right
 * now. An expert needs both, so neither is ever gated.
 */
export function showsTeaching(level: HelpLevel): boolean {
  return level === 'learning';
}
