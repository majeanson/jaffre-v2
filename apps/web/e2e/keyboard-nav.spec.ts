import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

/**
 * The gameboy d-pad: arrows move focus across whatever is on screen, Enter
 * activates it, and no screen had to be taught any of that. These tests care
 * about the engine's contract rather than any one layout — which element the
 * arrows reach is geometry, so they assert "focus moved to a sibling in the
 * row I pressed toward", not a pixel.
 */

/** Accessible-ish description of what has focus, for readable assertions. */
async function focused(page: Page): Promise<string> {
  return page.evaluate(() => {
    const el = document.activeElement;
    if (el === null || el === document.body) return 'BODY';
    return (el.getAttribute('aria-label') ?? el.textContent ?? el.tagName).trim();
  });
}

test('arrows walk the meta-nav strip and Enter follows the tab', async ({ page }) => {
  await page.goto('/#journey');

  // The current tab is a link, not a span: the strip must not have a hole in
  // the middle that arrows fall through.
  const current = page.getByRole('link', { name: 'Journey', exact: true });
  await expect(current).toHaveAttribute('aria-current', 'page');

  await current.focus();
  await page.keyboard.press('ArrowRight');
  expect(await focused(page)).toBe('Collection');

  // ...and back again: the walk is symmetric.
  await page.keyboard.press('ArrowLeft');
  expect(await focused(page)).toBe('Journey');

  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/#collection$/);
});

test('the cursor shows itself for the keyboard and hides from the mouse', async ({ page }) => {
  await page.goto('/#journey');
  const html = page.locator('html');

  // Nothing until the keyboard is actually driving.
  await expect(html).not.toHaveAttribute('data-kb-nav', /.*/);

  await page.getByRole('link', { name: 'Journey', exact: true }).focus();
  await page.keyboard.press('ArrowRight');
  await expect(html).toHaveAttribute('data-kb-nav', '1');

  // One mouse press and the loud ring is gone again.
  await page.mouse.click(5, 5);
  await expect(html).not.toHaveAttribute('data-kb-nav', /.*/);
});

test('an open sheet keeps the arrows to itself', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Settings' }).click();
  const sheet = page.getByRole('dialog');
  await expect(sheet).toBeVisible();

  // Whatever the arrows reach, it is inside the sheet — the page behind it is
  // out of scope for as long as the sheet is up.
  for (const key of ['ArrowDown', 'ArrowDown', 'ArrowRight', 'ArrowUp']) {
    await page.keyboard.press(key);
    const inside = await page.evaluate(() => {
      const dialog = document.querySelector('[role="dialog"][aria-modal="true"]');
      return dialog !== null && document.activeElement !== null
        ? dialog.contains(document.activeElement)
        : false;
    });
    expect(inside, `focus escaped the sheet after ${key}`).toBe(true);
  }
});

test('the hand keeps its own arrows on the felt', async ({ page }) => {
  await page.goto('/#practice');
  const hand = page.getByRole('listbox', { name: 'Your hand' });
  await expect(hand).toBeVisible();
  // Wait for the whole fan: focus taken mid-deal would be dropped by the
  // remount, and the test would be measuring the deal rather than the keys.
  const options = hand.locator('[role="option"]');
  await expect(options).toHaveCount(8);

  const first = options.first();
  await first.focus();
  await expect(first).toBeFocused();

  // react-aria roves the fan itself and marks the key handled; the engine
  // stands down when it sees that. ArrowRight must reach the next CARD, not
  // whatever button happens to sit to the right of the hand.
  await page.keyboard.press('ArrowRight');
  const landed = await page.evaluate(() => {
    const el = document.activeElement;
    if (el === null) return { role: 'none', label: '' };
    return {
      role: el.getAttribute('role') ?? el.tagName,
      label: (el.getAttribute('aria-label') ?? el.textContent ?? '').trim().slice(0, 40),
    };
  });
  expect(landed.role, `focus left the hand and landed on ${JSON.stringify(landed)}`).toBe('option');
});
