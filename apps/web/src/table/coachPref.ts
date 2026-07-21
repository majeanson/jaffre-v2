const STORAGE_KEY = 'jaffre:coach';

/** Whether the in-game Coach is switched on. An explicit choice (either way)
 * always wins; `defaultOn` decides only when the player has never touched the
 * toggle — practice passes true so a first-timer's bot game teaches, rooms
 * pass false so nobody coaches uninvited. */
export function loadCoachPref(defaultOn = false): boolean {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored === null ? defaultOn : stored === 'on';
  } catch {
    return defaultOn;
  }
}

export function saveCoachPref(on: boolean): void {
  try {
    localStorage.setItem(STORAGE_KEY, on ? 'on' : 'off');
  } catch {
    // Storage unavailable — the Coach simply resets to off next visit.
  }
}
