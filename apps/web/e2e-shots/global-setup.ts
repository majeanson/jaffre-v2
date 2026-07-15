import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { SHOTS_DIR } from './shots-shared.js';

/** Start each run from a clean shots-output/ so the sheet never shows stale PNGs. */
export default function globalSetup(): void {
  rmSync(SHOTS_DIR, { recursive: true, force: true });
  mkdirSync(SHOTS_DIR, { recursive: true });
  writeFileSync(
    join(SHOTS_DIR, 'report.txt'),
    `Jaffre screenshot gallery — layout warnings (not failures)\nRun: ${new Date().toISOString()}\n\n`,
  );
}
