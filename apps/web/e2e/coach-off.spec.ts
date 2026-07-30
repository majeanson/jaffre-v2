import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

/**
 * The help dial, end to end. Three levels, and each one has to mean exactly
 * what it says on the felt:
 *
 *   learning — the Coach advises AND the bid panel carries its beginner strip
 *   coach    — the Coach advises, the strip is gone
 *   off      — silence
 *
 * The Coach advises through three surfaces (the tip pill, the violet ring on
 * its suggested bid, the violet ring on its suggested card) and every one has
 * to go, not just the loudest. They all derive from one gate
 * (`useTableDerived`'s `coach`), so this pins the gate rather than each call
 * site; the strip is gated separately (`BetCards`' `teaching`), which is why
 * the middle row exists at all.
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

/** Seed the dial before the app boots — resolveHelpLevel runs at first paint. */
async function seedLevel(page: Page, level: 'learning' | 'coach' | 'off'): Promise<void> {
  await page.addInitScript((l) => localStorage.setItem('jaffre:help', l as string), level);
}

test('Learning: the Coach advises and the bid panel teaches', async ({ page }) => {
  test.setTimeout(90_000);
  await seedLevel(page, 'learning');
  await page.goto('/#practice');
  await expect(page.getByRole('button', { name: 'Pass' })).toBeEnabled({ timeout: 45_000 });
  // On our bidding turn the Coach names a bid and explains it...
  await expect.poll(() => adviceOnScreen(page), { timeout: 15_000 }).toBeGreaterThan(0);
  // ...and the strip that used to be unconditional is here, with its way out.
  await expect(page.getByTestId('points-hint')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Hide tips' })).toBeVisible();
});

test('Coach: advice stays, the beginner strip goes', async ({ page }) => {
  test.setTimeout(90_000);
  await seedLevel(page, 'coach');
  await page.goto('/#practice');
  await expect(page.getByRole('button', { name: 'Pass' })).toBeEnabled({ timeout: 45_000 });
  await expect.poll(() => adviceOnScreen(page), { timeout: 15_000 }).toBeGreaterThan(0);
  await expect(page.getByTestId('points-hint')).toHaveCount(0);
});

test('"Hide tips" drops Learning to Coach, and it sticks across a reload', async ({ page }) => {
  test.setTimeout(90_000);
  await seedLevel(page, 'learning');
  await page.goto('/#practice');
  await expect(page.getByRole('button', { name: 'Pass' })).toBeEnabled({ timeout: 45_000 });
  await page.getByRole('button', { name: 'Hide tips' }).click();
  // Gone here and now — one tap, no confirm, no sheet.
  await expect(page.getByTestId('points-hint')).toHaveCount(0);
  // ...and the Coach survives it: "I don't need the primer" is not "be quiet".
  await expect.poll(() => adviceOnScreen(page), { timeout: 15_000 }).toBeGreaterThan(0);

  await page.goto('/#practice');
  await expect(page.getByRole('button', { name: 'Pass' })).toBeEnabled({ timeout: 45_000 });
  await expect(page.getByTestId('points-hint')).toHaveCount(0);
});

test('Off: no hint is visible anywhere — bidding or playing', async ({ page }) => {
  test.setTimeout(120_000);
  await seedLevel(page, 'off');
  await page.goto('/#practice');

  // ── Bidding turn ────────────────────────────────────────────────────────
  const pass = page.getByRole('button', { name: 'Pass' });
  await expect(pass).toBeEnabled({ timeout: 45_000 });
  expect(await adviceOnScreen(page)).toBe(0);
  await expect(page.getByTestId('points-hint')).toHaveCount(0);
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
