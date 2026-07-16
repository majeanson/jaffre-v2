import { expect, test } from '@playwright/test';

/**
 * History with real names (Phase 1, workstream B): each row carries the
 * roster line ("with <teammate> · vs <opponents>") — checked on the staged
 * history scene (deterministic DEMO_HISTORY) — and against the real server a
 * fresh identity sees the empty state on #history.
 */

test('history rows show teammate and opponents by name', async ({ page }) => {
  await page.goto('/#scenes/history');
  await expect(page.getByRole('heading', { name: 'Your games' })).toBeVisible();

  // demo-1: you in seat 1 (index 0) → teammate Ginette, opponents Marcel & Réal.
  const first = page.locator('a[href="#replay/demo-1"]');
  await expect(first).toContainText('Won');
  await expect(first).toContainText('Room salon');
  await expect(first).toContainText('with Ginette · vs Marcel & Réal');

  // demo-2: same table, lost.
  const second = page.locator('a[href="#replay/demo-2"]');
  await expect(second).toContainText('Lost');
  await expect(second).toContainText('with Ginette · vs Marcel & Réal');

  // demo-3: you in seat 3 (index 2) → the roster line follows the seat.
  const third = page.locator('a[href="#replay/demo-3"]');
  await expect(third).toContainText('with Marcel · vs Réal & Ginette');
});

test('#history renders the fresh-identity empty state against the real server', async ({
  browser,
}) => {
  const context = await browser.newContext(); // fresh localStorage → fresh uid
  const page = await context.newPage();
  await page.goto('/#history');
  await expect(page.getByRole('heading', { name: 'Your games' })).toBeVisible();
  await expect(page.getByText('No finished games yet')).toBeVisible();
  await context.close();
});
