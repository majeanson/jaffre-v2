const STORAGE_KEY = 'jaffre:coach';

/** Whether the in-game Coach is switched on (off by default). */
export function loadCoachPref(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'on';
  } catch {
    return false;
  }
}

export function saveCoachPref(on: boolean): void {
  try {
    localStorage.setItem(STORAGE_KEY, on ? 'on' : 'off');
  } catch {
    // Storage unavailable — the Coach simply resets to off next visit.
  }
}
