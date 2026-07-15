import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { appendFileSync } from 'node:fs';
import { join } from 'node:path';
import { SHOTS_DIR } from './shots-shared.js';

/**
 * Screenshot gallery — capture every notable UI state across viewports and
 * skins so a human can eyeball layout problems (overflow, misplaced chips,
 * clipped panels). Nothing here asserts pixels: expects only guard that the
 * app actually reached each state. Layout smells go to shots-output/report.txt
 * as warnings.
 *
 * Determinism: '#practice/<seed>' pins the deal and the bot rng, and this spec
 * always plays the same human policy (pass every bid, play the first legal
 * card), so a given seed replays the exact same game every run.
 *
 * Seeds were verified by simulating localGame.ts + this human policy offline:
 *  - SEED_MAIN = 27 — the human's round-1 hand contains a red 0 (special
 *    card), and the game ends after 5 rounds (~3.5 min) — shortest in 1..400.
 *  - SEED_ALT  = 2  — also a red/brown 0 in the round-1 hand, 6 rounds.
 * SEED_ALT is a verified spare in case a rules change makes SEED_MAIN dull.
 */
const SEED_MAIN = 27;
export const SEED_ALT = 2;

const VIEWPORTS = [
  { name: 'desktop', viewport: { width: 1600, height: 900 }, isMobile: false, hasTouch: false },
  { name: 'phone', viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true },
] as const;

const SKINS = ['dark', 'light', 'juicy'] as const;

/** The one combo that plays its game to the end for round-summary + recap. */
const FULL_GAME_COMBO = 'desktop-dark';

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

/** One human turn, same policy as the seed simulation: Pass bids, first legal card. */
async function actIfMyTurn(page: Page): Promise<void> {
  const pass = page.getByRole('button', { name: 'Pass' });
  if (await pass.isVisible().catch(() => false)) {
    await pass.click({ timeout: 1500 }).catch(() => {});
    return;
  }
  const playable = page
    .getByRole('listbox', { name: 'Your hand' })
    .locator('[role="option"][data-playable="true"]');
  if ((await playable.count()) > 0) {
    // Click the exposed left strip — later cards in the fan overlap the right.
    await playable
      .first()
      .click({ position: { x: 15, y: 30 }, timeout: 1500 })
      .catch(() => {});
  }
}

/** Keep the game moving (bots run on their own timers) until `ready` holds. */
async function driveUntil(
  page: Page,
  ready: () => Promise<boolean>,
  what: string,
  timeoutMs: number,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await ready()) return;
    await actIfMyTurn(page);
    await page.waitForTimeout(120);
  }
  throw new Error(`Timed out driving the game toward: ${what}`);
}

for (const vp of VIEWPORTS) {
  for (const skin of SKINS) {
    const combo = `${vp.name}-${skin}`;

    test.describe(combo, () => {
      test.use({ viewport: vp.viewport, isMobile: vp.isMobile, hasTouch: vp.hasTouch });

      test(`gallery ${combo}`, async ({ page }) => {
        const fullGame = combo === FULL_GAME_COMBO;
        test.setTimeout(fullGame ? 480_000 : 180_000);
        // The app reads the skin from localStorage at boot (initTheme).
        await page.addInitScript((theme) => localStorage.setItem('jaffre-theme', theme), skin);

        // (a) Home screen.
        await page.goto('/');
        await expect(page.getByRole('button', { name: 'Practice vs bots' })).toBeVisible();
        await snap(page, combo, 'home');

        // Lobby: an online room that never starts; the code content is noise.
        await page.goto(`/#room/shots-${combo}`);
        await expect(page.getByText('Share this code with your table.')).toBeVisible();
        await snap(page, combo, 'lobby');

        // Deterministic practice game.
        await page.goto(`/#practice/${SEED_MAIN}`);
        const hand = page.getByRole('listbox', { name: 'Your hand' });
        await expect(hand).toBeVisible();

        // (b) Bidding, our turn: seat 0 bids last in round 1, so the three
        // bots declare first (~750ms apiece) and then the panel opens.
        const pass = page.getByRole('button', { name: 'Pass' });
        await expect(pass).toBeVisible({ timeout: 30_000 });
        await snap(page, combo, 'bidding');

        // (c) Mid-play: 2-3 cards on the table (a held trick shows all 4).
        const trickCards = page.getByRole('group', { name: 'Current trick' }).getByRole('img');
        await driveUntil(
          page,
          async () => {
            const n = await trickCards.count();
            return n >= 2 && n <= 3;
          },
          '2-3 cards in the trick',
          60_000,
        );
        await snap(page, combo, 'mid-play');

        // (d) Trick-hold banner ("X takes the trick — +N to Team …").
        const banner = page.getByText(/the trick —/).first();
        await driveUntil(page, () => banner.isVisible(), 'trick-hold banner', 60_000);
        await snap(page, combo, 'trick-hold');

        // (e) Log panel open (game keeps running behind it — that's fine).
        const logToggle = page.getByRole('button', { name: 'Log', exact: true });
        await logToggle.click();
        await expect(page.getByTestId('game-log')).toBeVisible();
        await snap(page, combo, 'log-open');
        await logToggle.click();

        // (f) Score-strip details expanded.
        const details = page.getByRole('button', { name: 'Score details' });
        await details.click();
        await expect(details).toHaveAttribute('aria-expanded', 'true');
        await snap(page, combo, 'score-details');
        await details.click();

        // (g)+(h) need a full round / a full game (~40s per round in real
        // time, bot timers are fixed), so only FULL_GAME_COMBO plays on.
        if (!fullGame) return;

        // (g) Round summary overlay at the end of round 1.
        const summary = page.getByRole('dialog', { name: 'Round summary' });
        await driveUntil(page, () => summary.isVisible(), 'round summary overlay', 120_000);
        await snap(page, combo, 'round-summary');

        // (h) Game recap: seed 27 ends after 5 rounds with this policy.
        const recap = page.getByRole('dialog', { name: 'Game over' });
        await driveUntil(page, () => recap.isVisible(), 'game recap', 360_000);
        await snap(page, combo, 'game-recap');
      });
    });
  }
}
