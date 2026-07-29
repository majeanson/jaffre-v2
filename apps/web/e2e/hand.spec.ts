import { expect, test } from '@playwright/test';

/**
 * "Check this play" — the receiving end of a shared hand.
 *
 * This is the one screen in the app a stranger can land on cold, from a link
 * someone pasted, with no account and no context. So the three things worth
 * proving are: a good link seats you, a link to a game that is gone says so
 * instead of hanging, and a link that is simply wrong takes you home rather
 * than nowhere.
 *
 * The valid case runs against the staged scene rather than a real finished
 * game: only game_over writes a `games` row, which is minutes of bot alarms
 * away, and none of what this screen does depends on where the replay data
 * came from — it folds an action log either way.
 */

test('a shared position introduces itself and seats you', async ({ page }) => {
  await page.goto('/#scenes/hand');

  await expect(page.getByRole('heading', { name: 'Check this play' })).toBeVisible();
  // It says which seat you are taking — the whole invitation depends on it.
  await expect(page.getByText(/You're in seat \d/)).toBeVisible();
  await expect(page.getByText(/rewound to the top of the trick/)).toBeVisible();

  // Playing it out drops you into a practice table at that seat, with a legal
  // move available. If the fold or the rewind were wrong, there would be no
  // playable card here.
  await page.getByRole('button', { name: 'Play it out' }).click();
  await expect(page.locator('[role="option"][data-playable="true"]').first()).toBeVisible();
  await expect(page.getByRole('listbox', { name: 'Your hand' })).toBeVisible();
});

test('a link to a game that is gone says so', async ({ page }) => {
  // Well-formed hash, no such game: the route is fine, so this is the SCREEN's
  // failure to handle, not the router's.
  await page.goto('/#hand/no-such-game-here/10/0');
  await expect(page.getByText(/could not be loaded/)).toBeVisible();
  // Still a way out.
  await expect(page.getByRole('button', { name: 'Home' })).toBeVisible();
});

test('a malformed link takes you home and says why', async ({ page }) => {
  // Seat 9 does not exist, so the hash never parses into a position at all.
  await page.goto('/#hand/some-game/10/9');
  await expect(page.getByRole('status')).toContainText("That link doesn't go anywhere");
  // And the dead hash is cleaned out of the address bar, so a reload or a
  // bookmark doesn't reproduce it.
  expect(new URL(page.url()).hash).toBe('');
});
