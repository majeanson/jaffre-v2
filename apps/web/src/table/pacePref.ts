const STORAGE_KEY = 'jaffre:pace';

/**
 * Same-tab signal that the pacing preference changed, so a live table picks
 * up the new speed without a reload (the `storage` event never fires in the
 * tab that wrote it — same convention as TUTORIAL_RESET_EVENT).
 */
export const PACE_EVENT = 'jaffre:pace-change';

/** How much faster "snappy" runs than the default cinematic pacing. Every
 * table duration is a base constant multiplied by this. */
const SNAPPY_SCALE = 0.45;

/** True when the player has asked for snappy animations. Off by default —
 * the deal fly-out and the held trick are how a first-timer follows what
 * happened; experts opt out of the wait. */
export function snappyPace(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'snappy';
  } catch {
    return false;
  }
}

export function setSnappyPace(on: boolean): void {
  try {
    localStorage.setItem(STORAGE_KEY, on ? 'snappy' : 'normal');
  } catch {
    // Storage unavailable — pacing simply resets to normal next visit.
  }
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(PACE_EVENT));
}

/** The multiplier to apply to a base duration, read fresh at call time. */
export function paceScale(): number {
  return snappyPace() ? SNAPPY_SCALE : 1;
}

/** A base duration in ms, scaled by the current pacing preference. */
export function paced(ms: number): number {
  return Math.round(ms * paceScale());
}
