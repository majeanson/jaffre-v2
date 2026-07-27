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

const ONLINE_INTRO_KEY = 'jaffre:onlineIntro';

/** Whether the one-shot first-online-game intro card has been shown. Separate
 * from the practice tutorial: seeing the lite online card must not eat the
 * full practice flow, and vice versa (the practice gate is `hasSeenTutorial`,
 * checked alongside this one at the online table). */
export function hasSeenOnlineIntro(): boolean {
  try {
    return localStorage.getItem(ONLINE_INTRO_KEY) === '1';
  } catch {
    return false;
  }
}

/** Record that the online intro card has been shown so it never fires again. */
export function markOnlineIntroSeen(): void {
  try {
    localStorage.setItem(ONLINE_INTRO_KEY, '1');
  } catch {
    // Storage unavailable — the card may simply show again next session.
  }
}

const REWARD_KEY = 'jaffre:tutorialReward';

/** Whether the tutorial-completion reward has already been granted on this
 * device — latches the one-shot grant so it fires once even before the server
 * round-trip (the server grant is itself idempotent). */
export function tutorialRewardGranted(): boolean {
  try {
    return localStorage.getItem(REWARD_KEY) === '1';
  } catch {
    return false;
  }
}

/** Record that the completion reward has been granted. */
export function markTutorialRewardGranted(): void {
  try {
    localStorage.setItem(REWARD_KEY, '1');
  } catch {
    // Storage unavailable — worst case the grant re-fires (idempotent server-side).
  }
}

/**
 * Same-tab signal that progress was cleared. An already-mounted TutorialCoach
 * listens for this so "Replay tutorial" re-arms the intro + marks live, rather
 * than only on the next practice entry. (The `storage` event never fires in the
 * tab that wrote it, so we dispatch our own.)
 */
export const TUTORIAL_RESET_EVENT = 'jaffre:tutorial-reset';

/** Clear all progress so the tutorial runs again from the intro (replay). */
export function resetTutorial(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Storage unavailable — nothing to clear.
  }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(TUTORIAL_RESET_EVENT));
  }
}
