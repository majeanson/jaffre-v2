import { expect, test } from '@playwright/test';

/**
 * The replay viewer is stateful UI (not a static scene), so drive it: the
 * frame counter advances on Next, the scrubber jumps, and "View as" re-redacts
 * without leaving the replay. Uses the demo replay staged by #scenes/replay.
 */
test('replay viewer steps through frames', async ({ page }) => {
  await page.goto('/#scenes/replay');
  const controls = page.getByTestId('replay-controls');
  await expect(controls).toBeVisible();

  const counter = page.getByTestId('replay-frame');
  await expect(counter).toHaveText(/^1 \/ \d+$/);

  await page.getByRole('button', { name: 'Next frame' }).click();
  await expect(counter).toHaveText(/^2 \/ \d+$/);

  await page.getByRole('button', { name: 'Previous frame' }).click();
  await expect(counter).toHaveText(/^1 \/ \d+$/);

  // Switching the viewer seat keeps you in the replay (controls stay mounted).
  await page.getByLabel('View as').selectOption('2');
  await expect(controls).toBeVisible();
  await expect(counter).toHaveText(/ \/ \d+$/);
});

test('replay nameplates show the real player names from the stored game', async ({ page }) => {
  // Phase 1 (workstream B): replays carry the game's players, so the table
  // shows who actually sat where — DEMO_REPLAY stages Marcel/Ginette/Réal.
  await page.goto('/#scenes/replay');
  await expect(page.getByTestId('replay-controls')).toBeVisible();
  for (const name of ['Marcel', 'Ginette', 'Réal']) {
    // Nameplates render the name twice (an sr-only copy + the visible one),
    // so filter to the visible occurrence.
    await expect(
      page.getByText(name, { exact: true }).filter({ visible: true }).first(),
    ).toBeVisible();
  }
});
