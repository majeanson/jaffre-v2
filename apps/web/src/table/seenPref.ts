const STORAGE_KEY = 'jaffre:seenCards';

/**
 * Whether the "cards seen" tracker is shown in the expanded score strip.
 * Off by default: it's an aid for improvers, and purists should never have
 * the bookkeeping done for them without asking.
 */
export function loadSeenPref(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'on';
  } catch {
    return false;
  }
}

export function saveSeenPref(on: boolean): void {
  try {
    localStorage.setItem(STORAGE_KEY, on ? 'on' : 'off');
  } catch {
    // Storage unavailable — the tracker resets to off next visit.
  }
}
