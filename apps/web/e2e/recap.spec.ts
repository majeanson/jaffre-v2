import { expect, test } from '@playwright/test';

/**
 * Standing-table series tally (Phase 1, workstream C): after game_over the
 * recap shows tonight's wins per team under the final score. Checked on the
 * staged game-over scene (its roster carries seriesWins: [2, 1]) — a real
 * game_over takes minutes of bot alarms; the server-side seriesWins bump is
 * covered by the room unit tests.
 */

test('the game recap shows the series tally for a standing table', async ({ page }) => {
  await page.goto('/#scenes/game-over');
  await expect(page.getByRole('button', { name: 'Rematch' })).toBeVisible();

  const tally = page.locator('p', { hasText: 'Tonight:' });
  await expect(tally).toBeVisible();
  await expect(tally).toContainText('Sun 2');
  await expect(tally).toContainText('Moon 1');
});
