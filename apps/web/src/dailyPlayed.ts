const KEY = 'jaffre:dailyPlayed';

/**
 * Which Hand of the Day this browser has already run.
 *
 * Stores the CHALLENGE ID, not a date. The deal rolls over at UTC midnight
 * while "today" for a player is local, so any date comparison would disagree
 * with the board for a few hours every night — somewhere in the world,
 * always. The id is the thing that actually changes, so comparing ids is
 * exact everywhere and needs no timezone logic at all.
 */
export function markDailyPlayed(challengeId: string): void {
  try {
    localStorage.setItem(KEY, challengeId);
  } catch {
    // Storage unavailable — the chip simply keeps inviting them. Harmless.
  }
}

/** The challenge id last played here, or null. */
export function dailyPlayedId(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}
