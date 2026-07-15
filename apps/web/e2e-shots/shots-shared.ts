import { fileURLToPath } from 'node:url';

/** Where every PNG, the report and the contact sheet land. Wiped per run. */
export const SHOTS_DIR = fileURLToPath(new URL('../shots-output', import.meta.url));

/** Row order of the contact sheet — mirrors a game's chronology. */
export const STATE_ORDER = [
  'home',
  'lobby',
  'bidding',
  'mid-play',
  'trick-hold',
  'log-open',
  'score-details',
  'round-summary',
  'game-recap',
] as const;
