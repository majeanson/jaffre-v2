import { fileURLToPath } from 'node:url';
import { SCENE_METAS } from '../src/dev/sceneManifest.js';

/** Where every PNG, the report and the contact sheet land. Wiped per run. */
export const SHOTS_DIR = fileURLToPath(new URL('../shots-output', import.meta.url));

/** Row order of the contact sheet: the scene catalog, plus the one shot
 * still taken from a REAL practice game (wiring/animation coverage). */
export const STATE_ORDER = [...SCENE_METAS.map((m) => m.id), 'practice-live'] as const;
