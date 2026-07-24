import type { BotDifficulty } from '@jaffre/protocol';

/** Difficulty for each of the three practice bots (seats 1–3). */
export type PracticeBots = readonly [BotDifficulty, BotDifficulty, BotDifficulty];

export const PRACTICE_BOT_NAMES = ['Marcel', 'Ginette', 'Réal'] as const;

const STORAGE_KEY = 'jaffre:practiceBots';
const DEFAULT: PracticeBots = ['normal', 'normal', 'normal'];

function isDifficulty(x: unknown): x is BotDifficulty {
  return x === 'easy' || x === 'normal' || x === 'hard';
}

/** The saved practice line-up, or three Normal bots when unset/unavailable. */
export function loadPracticeBots(): PracticeBots {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === null) return DEFAULT;
    const parsed = JSON.parse(raw) as unknown;
    if (Array.isArray(parsed) && parsed.length === 3 && parsed.every(isDifficulty)) {
      return parsed as unknown as PracticeBots;
    }
  } catch {
    // Corrupt or unavailable storage — fall back to the default line-up.
  }
  return DEFAULT;
}

export function savePracticeBots(bots: PracticeBots): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(bots));
  } catch {
    // Storage unavailable (private mode / SSR) — practice still runs on defaults.
  }
}

/** The single-cycler setting: one shared difficulty, or 'mixed' for easy/normal/hard. */
export type PracticeSetting = BotDifficulty | 'mixed';

/** All three bots share a difficulty → that value; anything else → 'mixed'. */
export function settingFromBots(bots: PracticeBots): PracticeSetting {
  return bots[0] === bots[1] && bots[1] === bots[2] ? bots[0] : 'mixed';
}

export function botsFromSetting(s: PracticeSetting): PracticeBots {
  return s === 'mixed' ? ['easy', 'normal', 'hard'] : [s, s, s];
}

export const SETTING_ORDER: readonly PracticeSetting[] = ['easy', 'normal', 'hard', 'mixed'];
