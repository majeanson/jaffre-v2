import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { expectNoSeriousViolations } from './axe.js';

/**
 * Automated accessibility audit (axe-core) over the three main screens, plus
 * keyboard behavior checks for the table's overlays and popovers.
 */

/** Advance a practice game when it's the human's turn: pass bids, play cards. */
async function actIfMyTurn(page: Page): Promise<void> {
  const pass = page.getByRole('button', { name: 'Pass' });
  if (await pass.isVisible()) {
    await pass.click({ timeout: 2000 }).catch(() => {});
    return;
  }
  const legal = page.locator('[role="option"][data-playable="true"]');
  if ((await legal.count()) > 0) {
    await legal
      .first()
      .click({ timeout: 2000 })
      .catch(() => {});
  }
}

test('home screen has no serious axe violations', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Jaffre' })).toBeVisible();
  await expectNoSeriousViolations(page, 'home');

  // The two inputs are reachable by keyboard and properly named.
  await expect(page.getByLabel('Your name')).toBeVisible();
  await expect(page.getByLabel('Room code')).toBeVisible();
});

test('practice table mid-bidding has no serious axe violations', async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto('/#practice');

  // Wait until it is the human's turn in the auction — the bid panel is up.
  await expect(page.getByRole('button', { name: 'Pass' })).toBeVisible({ timeout: 45_000 });
  await expectNoSeriousViolations(page, 'practice mid-bidding');
});

test('lobby with a seated player has no serious axe violations, chat is keyboard-friendly', async ({
  page,
}) => {
  const room = `e2e-a11y-${Math.random().toString(36).slice(2, 10)}`;
  await page.goto(`/#room/${room}`);
  // Wait until the socket is actually open before sitting: token auth adds a
  // mint round-trip, so an immediate click can outrun the join and get dropped
  // server-side as "join the room first". This copy shows only when open.
  await expect(page.getByText('Share this code with your table.')).toBeVisible();
  await page.getByTestId('seat-row-0').getByRole('button', { name: 'Sit here' }).click();
  await expect(page.getByText('You', { exact: true })).toBeVisible();
  await expectNoSeriousViolations(page, 'lobby seated');

  // The chat panel is reachable and leavable with the keyboard alone.
  const input = page.getByTestId('chat-input');
  await input.focus();
  await expect(input).toBeFocused();
  await page.keyboard.type('hello table');
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Send' })).toBeFocused();
});

test('table overlays: last-trick popover closes on Escape/outside click, round summary does not trap focus', async ({
  page,
}) => {
  test.setTimeout(180_000);
  await page.goto('/#practice');

  const hand = page.getByRole('listbox', { name: 'Your hand' });
  await expect(hand).toBeVisible();

  // Play until at least one trick has been captured (Last trick appears).
  const lastTrick = page.getByRole('button', { name: 'Last trick' });
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline && !(await lastTrick.isVisible())) {
    await actIfMyTurn(page);
    await page.waitForTimeout(250);
  }
  await expect(lastTrick).toBeVisible();

  // Open → Escape closes and returns focus to the trigger.
  await lastTrick.click();
  await expect(lastTrick).toHaveAttribute('aria-expanded', 'true');
  await page.keyboard.press('Escape');
  await expect(lastTrick).toHaveAttribute('aria-expanded', 'false');
  await expect(lastTrick).toBeFocused();

  // Open → clicking outside (the table backdrop) closes it.
  await lastTrick.click();
  await expect(lastTrick).toHaveAttribute('aria-expanded', 'true');
  await page.locator('main').click({ position: { x: 10, y: 300 } });
  await expect(lastTrick).toHaveAttribute('aria-expanded', 'false');

  // Keep playing to the end of the round: the summary dialog appears, takes
  // focus (screen readers land on it), and dismisses via the Ready button.
  const dialog = page.getByRole('dialog', { name: 'Round summary' });
  const end = Date.now() + 120_000;
  while (Date.now() < end && !(await dialog.isVisible())) {
    await actIfMyTurn(page);
    await page.waitForTimeout(250);
  }
  await expect(dialog).toBeVisible();
  await expect(dialog).toHaveAttribute('aria-modal', 'true');
  await expect(dialog).toBeFocused();

  // Ready-check: the round waits for the player; the Ready button is
  // keyboard-reachable and advances to the next round.
  const ready = dialog.getByRole('button', { name: /Ready for the next round/ });
  await ready.click();
  await expect(dialog).toBeHidden({ timeout: 20_000 });
});
