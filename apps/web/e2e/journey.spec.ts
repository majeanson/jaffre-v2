import { expect, test } from '@playwright/test';

/**
 * Journey (level track): Home links to it, the screen shows the level + XP
 * hero and the full track with a reward on its rungs, and a level-gated skin
 * reads "Reach level N" in the Collection. XP/level math itself is covered by
 * the progression unit tests; this drives the real screens over live (empty)
 * stats — a fresh identity is level 1 with everything ahead of it.
 */

test('home links to the Journey and the track renders every rung', async ({ page }) => {
  await page.goto('/');
  // The LevelBadge (level + XP bar) IS the Journey door on Home.
  await page.getByTestId('level-badge').click();
  await expect(page.getByRole('heading', { name: 'Journey' })).toBeVisible();
  expect(new URL(page.url()).hash).toBe('#journey');

  // Fresh identity: level 1, nothing earned.
  await expect(page.getByTestId('journey-level')).toHaveText(/Level 1/);
  // The first rung pays out the Juicy theme; the capstone is the Royal skin.
  await expect(page.getByTestId('journey-rung-2')).toContainText('Juicy');
  await expect(page.getByTestId('journey-rung-20')).toContainText('Royal');
});

test('a level-gated skin shows its level requirement in the Collection', async ({ browser }) => {
  const context = await browser.newContext(); // fresh identity → level 1
  const page = await context.newPage();
  await page.goto('/#collection');
  await expect(page.getByRole('heading', { name: 'Collection' })).toBeVisible();
  await page.getByRole('checkbox', { name: 'Show all (dev)' }).uncheck();

  const noir = page.getByTestId('cosmetic-tile-noir');
  await expect(noir).toHaveAttribute('aria-disabled', 'true');
  await expect(noir.getByText('Reach level 3')).toBeVisible();

  await context.close();
});

test('awards showcase surfaces cosmetic rewards on their badges', async ({ page }) => {
  await page.goto('/#awards');
  await expect(page.getByRole('heading', { name: 'Awards' })).toBeVisible();
  // The nemesis award pays out the Blood Moon deck — the chip says so.
  await expect(page.getByText('Unlocks: Blood Moon')).toBeVisible();
});
