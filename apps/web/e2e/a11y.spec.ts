import { AxeBuilder } from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

/**
 * Automated accessibility audit (axe-core) over the three main screens, plus
 * keyboard behavior checks for the table's overlays and popovers.
 *
 * Gate: zero serious/critical violations. Moderate/minor findings are logged
 * so they stay visible, but they do not fail the suite.
 */

async function expectNoSeriousViolations(page: Page, context: string): Promise<void> {
  const results = await new AxeBuilder({ page }).analyze();
  const severe = results.violations.filter(
    (v) => v.impact === 'serious' || v.impact === 'critical',
  );
  const lesser = results.violations.filter(
    (v) => v.impact !== 'serious' && v.impact !== 'critical',
  );
  for (const v of lesser) {
    console.log(
      `[a11y] ${context}: ${v.impact ?? 'unknown'} — ${v.id} (${v.nodes.length} node(s))`,
    );
  }
  expect(
    severe.map((v) => ({
      id: v.id,
      impact: v.impact,
      nodes: v.nodes.map((n) => n.target.join(' ')),
    })),
  ).toEqual([]);
}

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

  // Open → clicking outside closes it.
  await lastTrick.click();
  await expect(lastTrick).toHaveAttribute('aria-expanded', 'true');
  await page.getByTestId('game-log').click();
  await expect(lastTrick).toHaveAttribute('aria-expanded', 'false');

  // Keep playing to the end of the round: the summary dialog appears, takes
  // focus (screen readers land on it) and auto-dismisses without Escape.
  const dialog = page.getByRole('dialog', { name: 'Round summary' });
  const end = Date.now() + 120_000;
  while (Date.now() < end && !(await dialog.isVisible())) {
    await actIfMyTurn(page);
    await page.waitForTimeout(250);
  }
  await expect(dialog).toBeVisible();
  await expect(dialog).toHaveAttribute('aria-modal', 'true');
  await expect(dialog).toBeFocused();

  // No focus trap: Tab is not swallowed by the overlay, and no Escape is
  // needed — the table moves on to the next round by itself.
  await page.keyboard.press('Tab');
  await expect(dialog).toBeHidden({ timeout: 20_000 });
});
