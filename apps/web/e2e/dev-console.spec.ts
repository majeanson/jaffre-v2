import { expect, test } from '@playwright/test';

/**
 * The dev console drives the running PRACTICE game into any state. Verifies the
 * two big jumps land on the right overlay, so the console stays a reliable
 * test harness. (Dev-only feature, gated by DEV_CONSOLE_ENABLED.)
 */

test('dev console jumps a practice game to game over', async ({ page }) => {
  await page.goto('/#practice/27');
  // The console trigger lives in the expanded score strip next to Options.
  await page.getByRole('button', { name: 'Score details' }).click();
  await page.getByRole('button', { name: 'Dev console' }).click();
  await page.getByRole('button', { name: /Skip to game over/ }).click();
  await expect(page.getByRole('dialog', { name: 'Game over' })).toBeVisible({ timeout: 15000 });
});

test('dev console jumps a practice game to round over', async ({ page }) => {
  await page.goto('/#practice/27');
  await page.getByRole('button', { name: 'Score details' }).click();
  await page.getByRole('button', { name: 'Dev console' }).click();
  await page.getByRole('button', { name: /Skip to round over/ }).click();
  await expect(page.getByRole('dialog', { name: 'Round summary' })).toBeVisible({ timeout: 15000 });
});
