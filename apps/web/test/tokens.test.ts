import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * The `[data-theme='dark']` block is a necessary duplicate.
 *
 * `dark` is the default theme, so the @theme values ARE its values and the live
 * app carries no `data-theme` for it. But a preview tile has to be able to
 * scope a subtree back to "the theme" while something else is equipped on
 * <html>, and the only way to escape an inherited override is to match a rule
 * of your own. A custom property cannot reference a value that has been
 * overridden on the same element, so the values must be restated.
 *
 * Restated values drift. This test is the thing that stops them.
 *
 * Lives in apps/web rather than packages/ui because that package has no test
 * runner — a guard that never executes guards nothing.
 */

const css = readFileSync(
  fileURLToPath(new URL('../../../packages/ui/src/tokens.css', import.meta.url)),
  'utf8',
);

function blockOf(header: string): Map<string, string> {
  const start = css.indexOf(header);
  expect(start, `missing block: ${header}`).toBeGreaterThan(-1);
  const body = css.slice(start + header.length, css.indexOf('\n}\n', start));
  const out = new Map<string, string>();
  for (const m of body.matchAll(/^\s*(--[a-z0-9-]+):\s*([^;]+);/gm)) {
    out.set(m[1] as string, (m[2] as string).trim());
  }
  return out;
}

/** Every token any [data-theme] block overrides — what "being a theme" means. */
function themeOverriddenKeys(): Set<string> {
  const keys = new Set<string>();
  let inBlock = false;
  for (const line of css.split('\n')) {
    if (/^\[data-theme=/.test(line)) inBlock = true;
    else if (/^}/.test(line)) inBlock = false;
    else if (inBlock) {
      const m = /^\s*(--[a-z0-9-]+):/.exec(line);
      if (m !== null) keys.add(m[1] as string);
    }
  }
  return keys;
}

describe("[data-theme='dark']", () => {
  const defaults = blockOf('@theme {');
  const dark = blockOf("[data-theme='dark']:is(:root, :root *) {");

  it('restates every token a theme can override', () => {
    // A token missing here is a token that leaks through: scope a tile to
    // `dark` while Sepia is equipped and that one value stays sepia.
    const missing = [...themeOverriddenKeys()].filter((k) => !dark.has(k));
    expect(missing, `not reset by the dark block: ${missing.join(', ')}`).toEqual([]);
  });

  it('matches the @theme defaults exactly', () => {
    // The whole point of the duplicate is that it IS the default. If these
    // drift, the dark tile stops showing what the app actually looks like.
    for (const [key, value] of dark) {
      expect(value, `dark block disagrees with the @theme default for ${key}`).toBe(
        defaults.get(key),
      );
    }
  });

  it('declares nothing the defaults do not have', () => {
    const unknown = [...dark.keys()].filter((k) => !defaults.has(k));
    expect(unknown, `no @theme default for: ${unknown.join(', ')}`).toEqual([]);
  });
});
