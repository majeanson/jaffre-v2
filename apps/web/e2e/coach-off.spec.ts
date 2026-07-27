import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

/**
 * Switching the Coach off must silence it completely. It advises through four
 * surfaces — the tip pill (bottom-anchored while playing, above the bet panel
 * while bidding), the violet ring on its suggested bid, and the violet ring on
 * its suggested card — and every one of them has to disappear, not just the
 * loudest. They all derive from one gate (`useTableDerived`'s `coach`), so this
 * pins the gate rather than each call site.
 */

/** Every Coach-authored element currently on screen. */
async function adviceOnScreen(page: Page): Promise<number> {
  const [tips, bets, cards] = await Promise.all([
    page.getByTestId('coach-tip').count(),
    page.locator('button[data-recommended]').count(),
    page.locator('[role="option"][data-recommended]').count(),
  ]);
  return tips + bets + cards;
}

test('with the Coach ON, it actually advises (guards the test itself)', async ({ page }) => {
  test.setTimeout(90_000);
  await page.addInitScript(() => localStorage.setItem('jaffre:coach', 'on'));
  await page.goto('/#practice');
  await expect(page.getByRole('button', { name: 'Pass' })).toBeEnabled({ timeout: 45_000 });
  // On our bidding turn the Coach names a bid and explains it.
  await expect.poll(() => adviceOnScreen(page), { timeout: 15_000 }).toBeGreaterThan(0);
});

test('with the Coach OFF, no hint is visible anywhere — bidding or playing', async ({ page }) => {
  test.setTimeout(120_000);
  await page.addInitScript(() => localStorage.setItem('jaffre:coach', 'off'));
  await page.goto('/#practice');

  // ── Bidding turn ────────────────────────────────────────────────────────
  const pass = page.getByRole('button', { name: 'Pass' });
  await expect(pass).toBeEnabled({ timeout: 45_000 });
  expect(await adviceOnScreen(page)).toBe(0);
  await pass.click();

  // ── Playing turn: hold the assertion across the whole trick, since the
  //    tip and the ring appear only when it is actually our turn ───────────
  const hand = page.getByRole('listbox', { name: 'Your hand' });
  await expect
    .poll(() => hand.locator('[role="option"][data-playable="true"]').count(), { timeout: 60_000 })
    .toBeGreaterThan(0);

  for (let i = 0; i < 12; i++) {
    expect(await adviceOnScreen(page)).toBe(0);
    await page.waitForTimeout(250);
  }

  // Playing a card must not summon advice either.
  const playable = hand.locator('[role="option"][data-playable="true"]');
  if ((await playable.count()) > 0) await playable.first().click();
  await page.waitForTimeout(1000);
  expect(await adviceOnScreen(page)).toBe(0);
});
