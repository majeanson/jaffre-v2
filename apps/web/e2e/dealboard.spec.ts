import { expect, test, type Page } from '@playwright/test';

/**
 * The Deal Board: today's hand, played for real, posted for real.
 *
 * Everything here goes through the actual stack — the challenge is derived
 * client-side from the UTC day, the hand is a genuine practice game against
 * the fixed 'normal' bots, and the action log is verified by the worker
 * against its own re-derivation of the same deal before a score exists. The
 * server unit tests cover what the verifier accepts and refuses; what only a
 * browser can show is that a player can actually get from "Play the hand" to a
 * row on the board, and that the board remembers them afterwards.
 */

/** Play whatever this turn allows, if it is ours. Returns false when it isn't.
 *
 * The auction comes first (pass — a challenge hand is playable from any
 * contract, and passing keeps the run short and deterministic in shape); then
 * cards, cheapest legal choice, since the SCORE is not what is under test. */
async function actIfOurTurn(page: Page): Promise<boolean> {
  const pass = page.getByRole('button', { name: 'Pass' });
  if (await pass.isVisible().catch(() => false)) {
    if (await pass.isEnabled()) {
      await pass.click();
      return true;
    }
    return false;
  }
  const playable = page.locator('[role="option"][data-playable="true"]').first();
  if (await playable.isVisible().catch(() => false)) {
    await playable.click();
    return true;
  }
  return false;
}

/** Drive one whole challenge round to its outcome banner. */
async function playTheHand(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Play the hand' }).click();
  const outcome = page.getByTestId('deal-outcome');
  const deadline = Date.now() + 150_000;
  while (Date.now() < deadline) {
    if (await outcome.isVisible().catch(() => false)) return;
    if (!(await actIfOurTurn(page))) await page.waitForTimeout(200);
  }
  throw new Error('the challenge round never reached an outcome');
}

test('plays the hand of the day, posts the score, and refuses a second run', async ({ page }) => {
  // A real round of bot alarms plus verification.
  test.setTimeout(240_000);

  await page.goto('/#daily');
  await expect(page.getByRole('heading', { name: 'Deal Board' })).toBeVisible();
  // Four deals share the screen: the daily plus the week's three.
  await expect(
    page.getByRole('navigation', { name: 'Deal Board' }).getByRole('button'),
  ).toHaveCount(4);
  // Nobody has played it yet on a fresh local D1.
  const play = page.getByRole('button', { name: 'Play the hand' });
  await expect(play).toBeEnabled();

  await playTheHand(page);

  // The score came back from the server, not from the client: the outcome line
  // only ever says a number the verifier produced.
  const outcome = page.getByTestId('deal-outcome');
  await expect(outcome).toContainText('You scored');
  await expect(outcome).not.toContainText('could not be verified');

  // Your row is on the board, and the board says where you landed.
  await expect(page.getByText(/You’re #\d+/)).toBeVisible();

  // One try. The button says so, and cannot be used.
  const replayed = page.getByRole('button', { name: 'You’ve already played this one.' });
  await expect(replayed).toBeVisible();
  await expect(replayed).toBeDisabled();

  // And it is the SERVER that remembers, not this tab: a reload re-reads the
  // board and finds the same row.
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Deal Board' })).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'You’ve already played this one.' }),
  ).toBeDisabled();
  await expect(page.getByText(/You’re #\d+/)).toBeVisible();
});

test('a brand-new player sees an open board they can still play', async ({ browser }) => {
  // A second identity must not inherit the first one's "already played": the
  // state lives per user in challenge_scores, not per browser or per deal.
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto('/#daily');
  await expect(page.getByRole('heading', { name: 'Deal Board' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Play the hand' })).toBeEnabled();
  await context.close();
});

test('the weekly deals are their own boards', async ({ page }) => {
  await page.goto('/#daily');
  const tabs = page.getByRole('navigation', { name: 'Deal Board' }).getByRole('button');
  await expect(tabs.first()).toHaveAttribute('aria-current', 'true');

  // Switching to a weekly changes which deal is current — the daily's state
  // (played or not) must not follow you onto a different deal.
  await tabs.nth(1).click();
  await expect(tabs.nth(1)).toHaveAttribute('aria-current', 'true');
  await expect(tabs.first()).not.toHaveAttribute('aria-current', 'true');
  await expect(page.getByRole('button', { name: 'Play the hand' })).toBeEnabled();
});
