import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Violet pairs with ink in this app — never with white.
 *
 * Named by the 2026-07-28 visual audit after the same contrast slip shipped
 * three times in two days on three different surfaces (two CTAs, the Deal
 * Board's active tab — and a fourth, the ProgressToast action chip, found the
 * day this test was written): a `bg-(--color-ap-violet)` plate that inherited
 * or declared light text lands at ~2.6:1. Every correct violet surface says
 * `text-(--color-ap-ink)` (5.1:1). axe only catches the mistake once a scene
 * exists for the screen; this catches it at write-time, repo-wide.
 *
 * Scope: solid violet fills in className strings. Tint variants
 * (`bg-(--color-ap-violet)/12`) are washes over the panel and keep the page's
 * text colour by design. Inline `style={{ background: 'var(--color-ap-violet)' }}`
 * (the AvatarChip fallback) is out of scope — its ink text is a className on
 * the same element and already covered by e2e contrast runs.
 */

const ROOTS = ['apps/web/src', 'packages/ui/src'].map((p) =>
  fileURLToPath(new URL(`../../../${p}`, import.meta.url)),
);

/** Files whose violet is a bar/track FILL with no text content of its own. */
const NO_TEXT_FILLS = [
  'ProgressBar.tsx', // level-bar fill
  'XpStrip.tsx', // XP bar fill
  'CosmeticPicker.tsx', // unlock-progress fill inside the tile
];

const SOLID_VIOLET = /bg-\(--color-ap-violet\)(?!\/)/;
/** A text COLOUR utility (not size): text-(--color-…), text-white/black, text-[#…]. */
const TEXT_COLOUR = /text-\(--color-[a-z-]+\)|text-white|text-black|text-\[#/;
const INK = 'text-(--color-ap-ink)';

function* tsxFiles(dir: string): Generator<string> {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) yield* tsxFiles(full);
    else if (entry.name.endsWith('.tsx')) yield full;
  }
}

describe('violet surfaces carry ink text', () => {
  it('every solid bg-(--color-ap-violet) line names ink (or is a known text-free fill)', () => {
    const offences: string[] = [];
    for (const root of ROOTS) {
      for (const file of tsxFiles(root)) {
        const lines = readFileSync(file, 'utf8').split('\n');
        lines.forEach((line, i) => {
          if (!SOLID_VIOLET.test(line)) return;
          if (line.includes(INK)) return;
          // No colour utility at all: fine only for the fills listed above —
          // anything else inherits the page's light text over violet.
          if (!TEXT_COLOUR.test(line) && NO_TEXT_FILLS.some((f) => file.endsWith(f))) return;
          offences.push(`${file}:${String(i + 1)} — ${line.trim().slice(0, 120)}`);
        });
      }
    }
    expect(offences, `violet without ink:\n${offences.join('\n')}`).toEqual([]);
  });
});
