import { fileURLToPath } from 'node:url';
import { SCENE_METAS } from '../src/dev/sceneManifest.js';

/** Where every PNG, the report and the contact sheet land. Wiped per run. */
export const SHOTS_DIR = fileURLToPath(new URL('../shots-output', import.meta.url));

/** Row order of the contact sheet: the scene catalog, plus the one shot
 * still taken from a REAL practice game (wiring/animation coverage). */
export const STATE_ORDER = [...SCENE_METAS.map((m) => m.id), 'practice-live'] as const;

/**
 * Every viewport and skin the sweep shoots, in the order the contact sheet
 * should read them. Shared with the sheet builder ON PURPOSE: it derives a
 * shot's combo by parsing the filename, and when it only knew about
 * `desktop-` and `phone-` it silently dropped HALF the sweep — every tablet
 * and small-desktop column, the two widths where layout actually breaks first.
 * A viewport or skin added to gallery.spec.ts must be added here too.
 */
export const VIEWPORT_ORDER = ['desktop', 'small-desktop', 'tablet', 'phone'] as const;

export const SKIN_ORDER = [
  'dark',
  'light',
  'juicy',
  'sepia',
  'midnight',
  'crimson',
  'boreal',
  'sakura',
  'glacier',
  'abyss',
  'ember',
  'terminal',
  'synthwave',
  'goldleaf',
  'arcane',
] as const;
