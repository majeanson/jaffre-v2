import { expect, test } from '@playwright/test';

/**
 * "Your record" (Phase 1, workstream B): the #stats route works against the
 * real server (a fresh identity sees the empty state), Home links to it, and
 * the populated rendering is checked via the deterministic staged scene —
 * driving a full game to game_over in e2e is minutes of bot alarms, so the
 * data-in aggregation is covered by the server unit tests instead.
 */

test('#stats renders Your record with the fresh-identity empty state', async ({ browser }) => {
  const context = await browser.newContext(); // fresh localStorage → fresh uid
  const page = await context.newPage();
  await page.goto('/#stats');
  await expect(page.getByRole('heading', { name: 'Your record' })).toBeVisible();
  // A brand-new identity has no finished games: loading resolves to empty.
  await expect(page.getByText('No games yet — play one!')).toBeVisible();
  await context.close();
});

test('home links to Your record', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: 'Your record' }).click();
  await expect(page.getByRole('heading', { name: 'Your record' })).toBeVisible();
  expect(new URL(page.url()).hash).toBe('#stats');
});

test('staged stats scene shows the full aggregate record', async ({ page }) => {
  // DEMO_STATS in src/dev/scenes.ts: 9 wins / 14 games, 4-of-6 contracts,
  // 1-of-2 sans atout, best partner Ginette (4 wins in 6), streaks 3/5.
  await page.goto('/#scenes/stats');
  await expect(page.getByRole('heading', { name: 'Your record' })).toBeVisible();
  await expect(page.getByText('64%')).toBeVisible();
  await expect(page.getByText('games won')).toBeVisible();
  await expect(page.getByText('Contracts: made 4 of 6')).toBeVisible();
  await expect(page.getByText('Sans atout: made 1 of 2')).toBeVisible();
  // AvatarChip carries an sr-only copy of the name, so scope the name check to
  // the visible label to avoid a strict-mode double match.
  await expect(page.getByTestId('best-partner-name')).toHaveText('Ginette');
  await expect(page.getByText('4 wins in 6 games')).toBeVisible();

  const current = page.locator('section', { hasText: 'current streak' });
  await expect(current.getByText('3', { exact: true })).toBeVisible();
  await expect(current.getByText('5', { exact: true })).toBeVisible();
});
