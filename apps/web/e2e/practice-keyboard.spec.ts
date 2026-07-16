import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

/**
 * Practice mode, keyboard only: open /#practice and play a full round using
 * nothing but focus + ArrowRight/Enter on the human's turns. Bots act on
 * their own 750ms timers; a round is ~30-40 actions, so the loop is generous.
 */

// react-aria strips the aria-disabled prop from ListBoxItem, so the Hand
// component marks legal cards with data-playable instead.
async function focusedOptionIsLegal(page: Page): Promise<boolean> {
  return page.evaluate(() => document.activeElement?.getAttribute('data-playable') === 'true');
}

test('plays a full practice round with the keyboard only', async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto('/#practice');

  const hand = page.getByRole('listbox', { name: 'Your hand' });
  await expect(hand).toBeVisible();

  // The log toggle lives inside the expanded top bar's Options drawer.
  await page.getByRole('button', { name: 'Score details' }).click();
  await page.getByRole('button', { name: 'Options' }).click();
  await page.getByRole('button', { name: 'Game log' }).click();
  await page.getByRole('button', { name: 'Score details' }).click();
  const log = page.getByTestId('game-log');
  const roundScored = log.getByText(/Score: Team Sun -?\d+, Team Moon -?\d+\./).first();

  const deadline = Date.now() + 100_000;
  while (Date.now() < deadline) {
    if ((await roundScored.count()) > 0) break;

    // Bidding and it's our turn: the bid panel is up — Pass via keyboard.
    const pass = page.getByRole('button', { name: 'Pass' });
    if (await pass.isVisible()) {
      await pass.focus();
      await page.keyboard.press('Enter');
      await page.waitForTimeout(150);
      continue;
    }

    // Playing and it's our turn: at least one card is legal (data-playable).
    // Walk the listbox with ArrowRight until a legal card is focused, then Enter.
    if ((await hand.locator('[role="option"][data-playable="true"]').count()) > 0) {
      await hand.locator('[role="option"]').first().focus();
      for (let i = 0; i < 8; i++) {
        if (await focusedOptionIsLegal(page)) {
          await page.keyboard.press('Enter');
          break;
        }
        await page.keyboard.press('ArrowRight');
      }
      await page.waitForTimeout(150);
      continue;
    }

    await page.waitForTimeout(200);
  }

  // The round ended: the log has accumulated lines...
  await expect(roundScored).toBeVisible();
  expect(await log.locator('p').count()).toBeGreaterThan(10);

  // ...and the score strip shows the cumulative scores from the round summary.
  const summary = (await roundScored.textContent()) ?? '';
  const match = /Score: Team Sun (-?\d+), Team Moon (-?\d+)/.exec(summary);
  expect(match).not.toBeNull();
  const teamA = match?.[1] ?? '';
  const teamB = match?.[2] ?? '';
  // Each team's headline score on the strip shows the cumulative total.
  await expect(page.getByTestId('team-score-0')).toHaveText(teamA);
  await expect(page.getByTestId('team-score-1')).toHaveText(teamB);
});
