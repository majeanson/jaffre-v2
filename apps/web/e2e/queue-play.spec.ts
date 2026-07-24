import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';

/**
 * Practice mode: while a bot is playing, queue a card (tap while not your
 * turn), toggle it off and on again, then verify it auto-plays when the turn
 * comes around — the hand shrinks with no further input.
 *
 * Queueing is only attempted mid-trick (1-3 cards down, no held-trick banner):
 * the led suit is then fixed, so a queued card is guaranteed to still be legal
 * when the turn arrives and the auto-play must fire.
 */

// Focus + Enter instead of a click: fan cards overlap, so a pointer click on
// an option's centre can land on its neighbour.
async function pressCard(page: Page, option: Locator): Promise<void> {
  await option.focus();
  await page.keyboard.press('Enter');
}

test('queues a card while waiting and it auto-plays on your turn', async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto('/#practice/11');

  const hand = page.getByRole('listbox', { name: 'Your hand' });
  await expect(hand).toBeVisible();
  const options = hand.locator('[role="option"]');
  const playable = hand.locator('[role="option"][data-playable="true"]');
  const queueable = hand.locator('[role="option"][data-queueable="true"]');
  const queued = hand.locator('[role="option"][data-queued="true"]');
  const trickCards = page.getByTestId('trick-card');
  const trickBanner = page.getByTestId('trick-banner');
  const pass = page.getByRole('button', { name: 'Pass' });

  const deadline = Date.now() + 100_000;
  while (Date.now() < deadline) {
    // Auction: pass on our turns until play starts. The panel stays visible
    // for the whole auction — Pass is only enabled on our turn.
    if (await pass.isVisible()) {
      if (await pass.isEnabled()) await pass.click();
      await page.waitForTimeout(150);
      continue;
    }

    // Waiting mid-trick with queueable cards: run the whole scenario.
    const trickCount = await trickCards.count();
    if (
      trickCount >= 1 &&
      trickCount <= 3 &&
      !(await trickBanner.isVisible()) &&
      (await playable.count()) === 0 &&
      (await queueable.count()) > 0
    ) {
      const handSize = await options.count();

      // Queue.
      await pressCard(page, queueable.first());
      await expect(queued).toHaveCount(1);

      // Tap again: unqueued.
      await pressCard(page, queued.first());
      await expect(queued).toHaveCount(0);

      // Queue a different card when there is one, else the same again.
      const idx = (await queueable.count()) > 1 ? 1 : 0;
      await pressCard(page, queueable.nth(idx));
      await expect(queued).toHaveCount(1);

      // No further input: the queued card fires on our turn and the hand
      // shrinks by one. Generous timeout — three bot plays plus a possible
      // trick hold can precede our turn.
      await expect(options).toHaveCount(handSize - 1, { timeout: 30_000 });
      await expect(queued).toHaveCount(0);
      return;
    }

    // Our turn without a queue (e.g. we lead): play any legal card manually
    // so the game advances to a queueing opportunity.
    if ((await playable.count()) > 0) {
      await pressCard(page, playable.first());
      await page.waitForTimeout(150);
      continue;
    }

    await page.waitForTimeout(200);
  }
  throw new Error('never reached a mid-trick waiting state to queue a card');
});
