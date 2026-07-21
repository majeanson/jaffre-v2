const STORAGE_KEY = 'jaffre:practiceTutorial';

/**
 * The first-practice tutorial's progress: which steps a player has already been
 * shown. Each id fires at most once ever. `intro` is the welcome overlay; the
 * rest are the in-play coach-marks, listed in the order they naturally occur.
 * Mirrors the localStorage pattern of home/PracticeNudge.
 */
export const TUTORIAL_STEPS = [
  'intro',
  'bidding',
  'firstBet',
  'trump',
  'redZero',
  'brownZero',
  'firstTrick',
  'roundOver',
] as const;

export type TutorialStep = (typeof TUTORIAL_STEPS)[number];

interface Stored {
  readonly steps: readonly string[];
}

/** The set of step ids already shown. Empty when nothing has run yet. */
export function loadTutorialSeen(): Set<string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === null) return new Set();
    const parsed = JSON.parse(raw) as Partial<Stored>;
    return new Set(Array.isArray(parsed.steps) ? parsed.steps : []);
  } catch {
    return new Set();
  }
}

function persist(seen: Iterable<string>): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ steps: [...seen] }));
  } catch {
    // Storage unavailable — the tutorial may simply show again next session.
  }
}

/** Record that a step has been shown so it never fires again. */
export function markTutorialStep(id: string): void {
  const seen = loadTutorialSeen();
  seen.add(id);
  persist(seen);
}

/** True once the intro has been shown or the tutorial skipped — the flow's gate. */
export function hasSeenTutorial(): boolean {
  return loadTutorialSeen().has('intro');
}

/** Mark every step seen so nothing more fires (the "Skip tutorial" action). */
export function skipTutorial(): void {
  persist(TUTORIAL_STEPS);
}

/** Clear all progress so the tutorial runs again from the intro (replay). */
export function resetTutorial(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Storage unavailable — nothing to clear.
  }
}
