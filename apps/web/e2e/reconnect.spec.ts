import { expect, test } from '@playwright/test';

/**
 * Reconnect: one human + three bots. After the game starts, a full page
 * reload (same localStorage uid) must restore the table from the welcome
 * snapshot: same room, same seat (you at the bottom), non-empty hand.
 */

test('a page reload restores the room, seat, and hand', async ({ page }) => {
  test.setTimeout(120_000);
  const room = `e2e-r-${Math.random().toString(36).slice(2, 10)}`;

  await page.goto(`/#room/${room}`);
  await page.getByTestId('seat-row-0').getByRole('button', { name: 'Sit here' }).click();
  for (const seat of [1, 2, 3]) {
    await page.getByTestId(`seat-row-${seat}`).getByRole('button', { name: 'Add bot' }).click();
  }
  await page.getByRole('button', { name: 'Start the game' }).click();

  const hand = page.getByRole('listbox', { name: 'Your hand' });
  await expect(hand).toBeVisible();
  await expect(hand.locator('[role="option"]')).toHaveCount(8);

  await page.reload();

  // Same room, back on the table with the welcome snapshot applied.
  await expect(page).toHaveURL(new RegExp(`#room/${room}$`));
  await expect(page.getByTestId('score-strip')).toBeVisible();
  // Seat 0 again: the viewer's own nameplate renders as "You".
  await expect(page.getByText('You', { exact: true })).toBeVisible();
  // Non-empty hand from the snapshot.
  await expect(hand.locator('[role="option"]').first()).toBeVisible();
  expect(await hand.locator('[role="option"]').count()).toBeGreaterThan(0);
});
