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

test('Escape steps back out of a meta screen, one level at a time', async ({ page }) => {
  await page.goto('/#journey');
  await page.keyboard.press('Escape');
  await expect(page).toHaveURL(/#corner$/);

  await page.keyboard.press('Escape');
  await expect(page).toHaveURL(/(\/|#)$/);
  // Home really is home: nothing further to back out to.
  await page.keyboard.press('Escape');
  await expect(page).toHaveURL(/(\/|#)$/);
});

test('Escape does not walk you out of a live table', async ({ page }) => {
  await page.goto('/#practice');
  await expect(page.getByRole('listbox', { name: 'Your hand' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page).toHaveURL(/#practice$/);
});

test('an open sheet gets the Escape, and the screen stays put', async ({ page }) => {
  await page.goto('/#journey');
  await page.getByRole('button', { name: 'Home' }).click();
  await page.getByRole('button', { name: 'Settings' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();

  // The sheet closes and that is ALL that happens — the same keystroke must
  // not also count as backing out of the screen behind it.
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toBeHidden();
  await expect(page).toHaveURL(/(\/|#)$/);
});

test('a sheet keeps Tab inside it and hands focus back on the way out', async ({ page }) => {
  // Customize, because it is on the shared layer stack. The sheets still
  // carrying their own Escape handler have no trap yet — that is what makes
  // this worth pinning as they migrate across.
  await page.goto('/');
  const trigger = page.getByRole('button', { name: 'Customize' });
  await trigger.click();
  await expect(page.getByRole('dialog')).toBeVisible();

  // Tab far enough to run off the end of the sheet several times over: it must
  // wrap back to the top rather than walking onto the page behind.
  for (let i = 0; i < 14; i++) {
    await page.keyboard.press('Tab');
    const inside = await page.evaluate(() => {
      const dialog = document.querySelector('[role="dialog"][aria-modal="true"]');
      return dialog !== null && document.activeElement !== null
        ? dialog.contains(document.activeElement)
        : false;
    });
    expect(inside, `Tab #${String(i + 1)} escaped the sheet`).toBe(true);
  }

  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toBeHidden();
  await expect(trigger).toBeFocused();
});

test('sheets that never had an Escape have one now', async ({ page }) => {
  // The login sheet was a modal you could only leave by aiming at the backdrop
  // or the button — no keyboard way out at all.
  await page.goto('/');
  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toBeHidden();
});

test('a sheet opens with focus on its own way out', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Customize' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  // The ✕ first, so the exit is the first thing a screen reader announces.
  await expect(page.getByRole('button', { name: 'Close customize' })).toBeFocused();
});

test('every control on Home can be reached with nothing but arrows', async ({ page }) => {
  // The whole promise, as a graph. Tag each focusable, ask the d-pad where it
  // goes from every one of them, then flood from wherever ArrowDown drops you
  // and check nothing is left over. A geometry-driven engine has no list of
  // destinations, so the failure mode is a control marooned in a corner —
  // this is the only kind of test that would notice.
  await page.goto('/');
  await expect(page.getByTestId('chrome-bar')).toBeVisible();

  const ids = await page.evaluate(() => {
    const SEL = 'a[href], button:not(:disabled), input:not(:disabled), [tabindex="0"]';
    const found: string[] = [];
    let i = 0;
    for (const el of document.querySelectorAll(SEL)) {
      if (el.closest('[data-nav="skip"]') !== null) continue;
      if (el.closest('[aria-hidden="true"]') !== null) continue;
      if (!(el instanceof HTMLElement) || el.getClientRects().length === 0) continue;
      const id = `n${String(i++)}`;
      el.dataset['reach'] = id;
      found.push(id);
    }
    return found;
  });
  expect(ids.length).toBeGreaterThan(6);

  await page.evaluate(() => {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
  });
  await page.keyboard.press('ArrowDown');
  const entry = await page.evaluate(
    () => document.activeElement?.getAttribute('data-reach') ?? null,
  );
  expect(entry, 'the d-pad found nowhere to start').not.toBeNull();

  const edges: Record<string, string[]> = {};
  for (const id of ids) {
    edges[id] = [];
    for (const key of ['ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight']) {
      await page.evaluate((from) => {
        document.querySelector<HTMLElement>(`[data-reach="${from}"]`)?.focus();
      }, id);
      await page.keyboard.press(key);
      const to = await page.evaluate(
        () => document.activeElement?.getAttribute('data-reach') ?? null,
      );
      if (to !== null && to !== id) edges[id]?.push(to);
    }
  }

  const seen = new Set<string>();
  const queue = entry === null ? [] : [entry];
  while (queue.length > 0) {
    const id = queue.pop() as string;
    if (seen.has(id)) continue;
    seen.add(id);
    for (const next of edges[id] ?? []) if (!seen.has(next)) queue.push(next);
  }

  const stranded = ids.filter((id) => !seen.has(id));
  expect(stranded, `unreachable by keyboard: ${stranded.join(', ')}`).toEqual([]);
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
