// WCAG contrast audit across every theme and card skin in tokens.css — the CI
// gate that keeps "no black-on-black" true as the catalog grows. Pairs mirror
// real component usage (score sheet, bet cards, CTAs, table, playing cards).
// FAIL (exit 1) = below the hard floor; warn = readable-but-tight (3–4.5),
// acceptable for large numerals/glyphs that always pair with a shape.
// TEAM_INK below must stay in sync with ScoreStrip.tsx.
//
//   npm run audit:contrast            (VERBOSE=1 to list warnings)
import { readFileSync } from 'node:fs';

const css = readFileSync(process.argv[2] ?? 'packages/ui/src/tokens.css', 'utf8');

function parseBlock(src) {
  const map = {};
  for (const m of src.matchAll(/(--[a-z0-9-]+):\s*([^;]+);/g)) map[m[1]] = m[2].trim();
  return map;
}

const themeBlocks = {};
const skinBlocks = {};
const base = parseBlock(/@theme\s*{([\s\S]*?)\n}/.exec(css)[1]);
for (const m of css.matchAll(/\[data-theme='([a-z0-9-]+)'\][^{]*{([\s\S]*?)\n}/g))
  themeBlocks[m[1]] = parseBlock(m[2]);
for (const m of css.matchAll(/\[data-card-skin='([a-z0-9-]+)'\][^{]*{([\s\S]*?)\n}/g))
  skinBlocks[m[1]] = parseBlock(m[2]);

const THEMES = ['dark', ...Object.keys(themeBlocks)];
const SKINS = ['arcade', ...Object.keys(skinBlocks)];

function hexToRgb(hex) {
  const h = hex.replace('#', '');
  const f =
    h.length === 3
      ? h
          .split('')
          .map((c) => c + c)
          .join('')
      : h;
  return [0, 2, 4].map((i) => parseInt(f.slice(i, i + 2), 16) / 255);
}
function lum(hex) {
  const [r, g, b] = hexToRgb(hex).map((c) =>
    c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4),
  );
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function ratio(a, b) {
  const [l1, l2] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
}

function resolve(tokens, name) {
  let v = tokens[name];
  if (v === undefined) return null;
  if (!v.startsWith('#')) return null; // gradients etc.
  return v;
}

const failures = [];
const warns = [];
function check(scope, fgName, fg, bgName, bg, floor, good) {
  if (fg === null || bg === null) return;
  const r = ratio(fg, bg);
  const line = `${scope}: ${fgName} ${fg} on ${bgName} ${bg} = ${r.toFixed(2)} (floor ${floor})`;
  if (r < floor) failures.push(line);
  else if (good !== undefined && r < good) warns.push(line);
}

const TEAM_INK = ['#6e4a00', '#1c5f78']; // ScoreStrip pencil inks (constant)

for (const theme of THEMES) {
  const t = { ...base, ...(theme === 'dark' ? {} : themeBlocks[theme]) };
  const g = (n) => resolve(t, `--color-${n}`);
  const S = `theme:${theme}`;
  // Paper surfaces (score sheet, bet cards, badges, hero card)
  check(S, 'ap-ink', g('ap-ink'), 'ap-paper', g('ap-paper'), 4.5);
  check(S, 'ap-ink', g('ap-ink'), 'ap-paper-shade', g('ap-paper-shade'), 4.5);
  check(S, 'ink', g('ink'), 'ap-paper', g('ap-paper'), 4.5);
  check(S, 'team-ink-a', TEAM_INK[0], 'ap-paper', g('ap-paper'), 4.5);
  check(S, 'team-ink-b', TEAM_INK[1], 'ap-paper', g('ap-paper'), 4.5);
  check(S, 'team-ink-a', TEAM_INK[0], 'ap-paper-shade', g('ap-paper-shade'), 4.5);
  check(S, 'team-ink-b', TEAM_INK[1], 'ap-paper-shade', g('ap-paper-shade'), 4.5);
  check(S, 'ap-gold-deep', g('ap-gold-deep'), 'ap-paper', g('ap-paper'), 3);
  // Arcade shell
  check(S, 'ap-text', g('ap-text'), 'ap-panel', g('ap-panel'), 4.5);
  check(S, 'ap-text', g('ap-text'), 'ap-ground', g('ap-ground'), 4.5);
  check(S, 'ap-muted', g('ap-muted'), 'ap-panel', g('ap-panel'), 4.5);
  check(S, 'ap-danger-text', g('ap-danger-text'), 'ap-panel', g('ap-panel'), 4.5);
  check(S, 'ap-violet-soft', g('ap-violet-soft'), 'ap-panel', g('ap-panel'), 3);
  check(S, 'ap-gold', g('ap-gold'), 'ap-ground', g('ap-ground'), 3);
  check(S, 'ap-ink', g('ap-ink'), 'ap-violet (CTA)', g('ap-violet'), 4.5);
  // Table
  check(S, 'ivory', g('ivory'), 'felt-800', g('felt-800'), 4.5);
  check(S, 'ivory', g('ivory'), 'felt-700', g('felt-700'), 4.5);
  check(S, 'lamplight', g('lamplight'), 'felt-800', g('felt-800'), 3, 4.5);
  check(S, 'team-a', g('team-a'), 'felt-800', g('felt-800'), 3);
  check(S, 'team-b', g('team-b'), 'felt-800', g('felt-800'), 3);
  check(S, 'accent', g('accent'), 'felt-800', g('felt-800'), 3);
  // ap-ok is small status text on panels; also the +5 chip bg under ap-ink.
  check(S, 'ap-ok', g('ap-ok'), 'ap-panel', g('ap-panel'), 3, 4.5);
  check(S, 'ap-ink', g('ap-ink'), 'ap-ok (chip)', g('ap-ok'), 3, 4.5);
}

// Cards: suits on card-face. Non-arcade skins define the full card set, so they
// are theme-independent; arcade inherits the theme's card tokens.
for (const skin of SKINS) {
  if (skin === 'arcade') {
    for (const theme of THEMES) {
      const t = { ...base, ...(theme === 'dark' ? {} : themeBlocks[theme]) };
      for (const s of ['red', 'brown', 'green', 'blue'])
        check(
          `skin:arcade+theme:${theme}`,
          `suit-${s}`,
          resolve(t, `--color-suit-${s}`),
          'card-face',
          resolve(t, '--color-card-face'),
          3,
          4.5,
        );
    }
    continue;
  }
  const t = { ...base, ...skinBlocks[skin] };
  for (const s of ['red', 'brown', 'green', 'blue'])
    check(
      `skin:${skin}`,
      `suit-${s}`,
      resolve(t, `--color-suit-${s}`),
      'card-face',
      resolve(t, '--color-card-face'),
      3,
      4.5,
    );
}

console.log(`themes: ${THEMES.length}, skins: ${SKINS.length}`);
console.log(`\n=== FAILURES (${failures.length}) ===`);
for (const f of failures) console.log('  ✘ ' + f);
if (process.env.VERBOSE !== undefined) {
  console.log(`\n=== warnings (${warns.length}) ===`);
  for (const w of warns) console.log('  ⚠ ' + w);
} else {
  console.log(`(${warns.length} warnings in the 3–4.5 glyph band — VERBOSE=1 to list)`);
}
if (failures.length > 0) process.exit(1);
console.log('✔ every theme × skin passes the contrast floors');
