import { expect, test } from '@playwright/test';

/**
 * The one "start here" slot above the PLAY door. A fresh browser used to stack
 * the practice nudge AND the Hand-of-the-Day row — two competing "start here"s
 * that taught neither. Now the nudge holds the slot until it is resolved (tap
 * or ✕), and only then does the daily door take it (see Home.tsx).
 */
test('the practice nudge holds the slot, then hands it to the daily door', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('practice-nudge')).toBeVisible();
  await expect(page.getByTestId('daily-door')).toBeHidden();

  await page.getByTestId('practice-nudge').getByRole('button', { name: 'Dismiss' }).click();
  await expect(page.getByTestId('practice-nudge')).toBeHidden();
  await expect(page.getByTestId('daily-door')).toBeVisible();

  // Resolved for good: after a reload the daily door still owns the slot.
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Jaffre' })).toBeVisible();
  await expect(page.getByTestId('practice-nudge')).toBeHidden();
  await expect(page.getByTestId('daily-door')).toBeVisible();
});
