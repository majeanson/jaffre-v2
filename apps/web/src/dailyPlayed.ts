import { dailyChallenge } from '@jaffre/engine';

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

/** Today's deal, still unplayed in this browser — the one truth behind every
 * door that points at the Hand of the Day (Home's DailyDoor, the recap line).
 *
 * Compared by CHALLENGE ID, not by date: the deal rolls at UTC midnight while
 * a player's "today" is local, so a date check would disagree with the board
 * for a few hours every night, somewhere in the world, always. */
export function dailyDue(): boolean {
  try {
    return dailyPlayedId() !== dailyChallenge(Date.now()).id;
  } catch {
    return false;
  }
}
