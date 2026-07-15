import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { SHOTS_DIR, STATE_ORDER } from './shots-shared.js';

/**
 * Build the contact sheet from whatever PNGs the run produced. Filenames are
 * `<viewport>-<skin>-<state>.png`; the sheet is states (rows) x combos
 * (columns) so a mis-layout in one skin/viewport jumps out of its row.
 */
export default function globalTeardown(): void {
  if (!existsSync(SHOTS_DIR)) return;
  const pngs = readdirSync(SHOTS_DIR).filter((f) => f.endsWith('.png'));

  interface Shot {
    file: string;
    combo: string;
    state: string;
  }
  const shots: Shot[] = [];
  for (const file of pngs) {
    const m = /^(desktop|phone)-([a-z]+)-(.+)\.png$/.exec(file);
    if (m === null) continue;
    shots.push({ file, combo: `${m[1]}-${m[2]}`, state: m[3] as string });
  }

  const combos = [...new Set(shots.map((s) => s.combo))].sort((a, b) => {
    // Desktop columns first, then phone; skins in a fixed order inside each.
    const key = (c: string) =>
      `${c.startsWith('desktop') ? 0 : 1}-${['dark', 'light', 'juicy'].findIndex((s) => c.endsWith(s))}`;
    return key(a).localeCompare(key(b));
  });
  const states = [...new Set(shots.map((s) => s.state))].sort((a, b) => {
    const ia = STATE_ORDER.indexOf(a as (typeof STATE_ORDER)[number]);
    const ib = STATE_ORDER.indexOf(b as (typeof STATE_ORDER)[number]);
    return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
  });

  const cell = (state: string, combo: string): string => {
    const shot = shots.find((s) => s.state === state && s.combo === combo);
    if (shot === undefined) {
      return '<div class="cell missing">not captured</div>';
    }
    return (
      `<figure class="cell"><a href="${shot.file}" target="_blank">` +
      `<img src="${shot.file}" loading="lazy" alt="${shot.file}"></a>` +
      `<figcaption>${shot.file}</figcaption></figure>`
    );
  };

  const rows = states
    .map(
      (state) =>
        `<section><h2>${state}</h2><div class="row">` +
        combos.map((combo) => cell(state, combo)).join('') +
        `</div></section>`,
    )
    .join('\n');

  const reportPath = join(SHOTS_DIR, 'report.txt');
  const report = existsSync(reportPath) ? readFileSync(reportPath, 'utf8') : '';

  const html = `<!doctype html>
<meta charset="utf-8">
<title>Jaffre screenshot gallery</title>
<style>
  body { margin: 0; padding: 1.5rem; background: #14181c; color: #e8e4d8;
         font: 14px/1.4 system-ui, sans-serif; }
  h1 { font-size: 1.3rem; margin: 0 0 0.25rem; }
  .meta { color: #9a958a; margin-bottom: 1.5rem; }
  h2 { font-size: 1rem; margin: 1.75rem 0 0.5rem; color: #f2c66d;
       text-transform: uppercase; letter-spacing: 0.06em; }
  .row { display: flex; gap: 12px; overflow-x: auto; padding-bottom: 6px; }
  .cell { flex: 0 0 auto; width: 300px; margin: 0; }
  .cell img { width: 100%; height: auto; display: block; border-radius: 6px;
              border: 1px solid #333a41; background: #000; }
  .cell.missing { display: grid; place-items: center; height: 120px;
                  border: 1px dashed #444; border-radius: 6px; color: #666; }
  figcaption { margin-top: 4px; font-size: 11px; color: #9a958a;
               word-break: break-all; }
  pre { background: #0d1013; border: 1px solid #333a41; border-radius: 6px;
        padding: 1rem; white-space: pre-wrap; color: #d6cfc0; }
</style>
<h1>Jaffre screenshot gallery</h1>
<p class="meta">${shots.length} shots · combos: ${combos.join(', ') || 'none'} · generated ${new Date().toISOString()}</p>
${rows}
<h2>layout warnings (report.txt)</h2>
<pre>${report.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</pre>
`;
  writeFileSync(join(SHOTS_DIR, 'index.html'), html);
}
