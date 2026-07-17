import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { appendFileSync } from 'node:fs';
import { join } from 'node:path';
import { SCENE_METAS } from '../src/dev/sceneManifest.js';
import { SHOTS_DIR } from './shots-shared.js';

/**
 * Screenshot gallery — capture every notable UI state across viewports and
 * skins so a human can eyeball layout problems (overflow, misplaced chips,
 * clipped panels). Nothing here asserts pixels: expects only guard that the
 * app actually reached each state. Layout smells go to shots-output/report.txt
 * as warnings.
 *
 * States come from the scene catalog (#scenes/<id>): staged engine states,
 * no bot timers, so the whole matrix runs in seconds per combo instead of
 * playing real games. One combo still boots a REAL practice game and grabs
 * a single shot, keeping end-to-end wiring (timers, animations, the local
 * game loop) in the gallery.
 */
const SEED_MAIN = 27; // red 0 in the round-1 hand — same seed the scenes use

const VIEWPORTS = [
  { name: 'desktop', viewport: { width: 1600, height: 900 }, isMobile: false, hasTouch: false },
  { name: 'phone', viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true },
] as const;

const SKINS = ['dark', 'light', 'juicy', 'sepia', 'midnight'] as const;

/** The one combo that also boots a real practice game. */
const LIVE_COMBO = 'desktop-dark';

function warn(line: string): void {
  appendFileSync(join(SHOTS_DIR, 'report.txt'), `${line}\n`);
}

/**
 * Two cheap layout smells, reported (never asserted):
 *  1. horizontal page overflow;
 *  2. anything poking into the top bar's box from below (top-chip regression).
 */
async function sanityChecks(page: Page, label: string): Promise<void> {
  const findings = await page.evaluate(() => {
    const out: string[] = [];
    const scroller = document.scrollingElement;
    if (scroller !== null && scroller.scrollWidth > window.innerWidth) {
      out.push(
        `horizontal overflow: scrollWidth ${scroller.scrollWidth} > innerWidth ${window.innerWidth}`,
      );
    }
    const bar = document.querySelector('[data-testid="score-strip"]')?.parentElement ?? null;
    if (bar !== null) {
      const barBox = bar.getBoundingClientRect();
      let reported = 0;
      for (const el of Array.from(document.querySelectorAll('body *'))) {
        if (reported >= 5) break;
        if (bar.contains(el) || el.contains(bar)) continue;
        if (el.closest('[role="dialog"]') !== null) continue;
        if (el.closest('[data-testid="scene-picker"]') !== null) continue;
        if (el.closest('[data-testid="replay-controls"]') !== null) continue;
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) continue;
        const intrudesFromBelow =
          r.top > barBox.top + 1 &&
          r.top < barBox.bottom - 2 &&
          r.left < barBox.right &&
          r.right > barBox.left;
        if (intrudesFromBelow) {
          const cls = (el.getAttribute('class') ?? '').slice(0, 60);
          out.push(
            `overlaps top bar from below: <${el.tagName.toLowerCase()} class="${cls}"> ` +
              `top=${Math.round(r.top)} vs bar bottom=${Math.round(barBox.bottom)}`,
          );
          reported++;
        }
      }
    }
    return out;
  });
  for (const finding of findings) warn(`[${label}] ${finding}`);
}

async function snap(page: Page, combo: string, state: string): Promise<void> {
  await page.screenshot({ path: join(SHOTS_DIR, `${combo}-${state}.png`) });
  await sanityChecks(page, `${combo}-${state}`);
}

for (const vp of VIEWPORTS) {
  for (const skin of SKINS) {
    const combo = `${vp.name}-${skin}`;

    test.describe(combo, () => {
      test.use({ viewport: vp.viewport, isMobile: vp.isMobile, hasTouch: vp.hasTouch });

      test(`gallery ${combo}`, async ({ page }) => {
        test.setTimeout(180_000);
        // The app reads the skin from localStorage at boot (initTheme).
        await page.addInitScript((theme) => localStorage.setItem('jaffre-theme', theme), skin);

        // Every catalog scene, by deep link. The picker pill is dev chrome —
        // hidden so it never pollutes a screenshot.
        await page.goto(`/#scenes/${SCENE_METAS[0]?.id ?? ''}`);
        await page.addStyleTag({ content: '[data-testid="scene-picker"]{display:none}' });
        for (const scene of SCENE_METAS) {
          await page.goto(`/#scenes/${scene.id}`);
          await expect(page.locator(scene.probe).first()).toBeVisible({ timeout: 15_000 });
          // Let entrance animations (deal-in, card fly-in) settle.
          await page.waitForTimeout(700);
          await snap(page, combo, scene.id);
        }

        // One REAL practice game per run: boots the local game loop, bots on
        // their timers, and grabs the live bidding table.
        if (combo !== LIVE_COMBO) return;
        await page.goto('/');
        await page.goto(`/#practice/${SEED_MAIN}`);
        await expect(page.getByRole('listbox', { name: 'Your hand' })).toBeVisible();
        // Seat 0 bids last in round 1: the bid panel opening proves the bot
        // timers actually ran.
        await expect(page.getByRole('button', { name: 'Pass' })).toBeVisible({ timeout: 30_000 });
        await snap(page, combo, 'practice-live');
      });
    });
  }
}
