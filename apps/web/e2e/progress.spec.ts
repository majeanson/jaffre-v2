import { expect, test } from '@playwright/test';

/**
 * "You unlocked something" → the thing itself.
 *
 * The announcement is only worth making if it can take you to what it is
 * announcing, so the toast's action link is the whole feature: it lands on the
 * Collection, scrolled to that exact tile, with the found-ring on it. The
 * detection itself (what counts as news) is unit-tested in progress.test.ts;
 * what needs a browser is the trip from the toast to the tile.
 *
 * Seeding: a toast only fires when there is a STORED snapshot to differ from —
 * a genuinely first run seeds silently on purpose, so a fresh identity never
 * toasts. So both keys are planted before boot with a snapshot that makes the
 * player's free starter cosmetics read as new, and the level set high enough
 * that no level moment competes for the slot.
 */

test('an unlock announces itself, and the announcement goes to the thing', async ({ browser }) => {
  const context = await browser.newContext();
  await context.addInitScript(() => {
    localStorage.setItem(
      'jaffre-progress-seen',
      JSON.stringify({ level: 99, awards: [], cosmetics: [] }),
    );
    // A non-empty seen set: empty would read as the very first run (silent),
    // and a set containing no felt or sweep id at all deliberately silences
    // those two axes as "a new axis shipped", leaving the card skins and
    // themes to announce themselves.
    localStorage.setItem('jaffre-cosmetics-seen', JSON.stringify(['__nothing__']));
  });
  const page = await context.newPage();

  await page.goto('/');
  const toast = page.getByTestId('progress-toast');
  await expect(toast).toBeVisible({ timeout: 20_000 });
  await expect(toast).toContainText('Unlocked');

  // The action is a real cross-link to a real tile, not a dismiss button.
  const action = toast.getByRole('link', { name: 'Equip' });
  const href = await action.getAttribute('href');
  expect(href).toMatch(/^#collection\/[a-z0-9-]+$/);
  const id = (href ?? '').replace('#collection/', '');

  await action.click();
  await expect(page.getByRole('heading', { name: 'Collection' })).toBeVisible();
  expect(new URL(page.url()).hash).toBe(`#collection/${id}`);

  // Landed ON it: the named tile exists, is in view, and is wearing the ring
  // that says "here it is".
  const tile = page.getByTestId(`cosmetic-tile-${id}`);
  await expect(tile).toBeVisible();
  await expect(tile).toHaveClass(/cosmetic-found/);
  await expect(tile).toBeInViewport();

  await context.close();
});

test('a genuinely new player is not greeted by a wall of toasts', async ({ browser }) => {
  // The other half of the rule, and the one that would be embarrassing to get
  // wrong: with nothing stored there is nothing to compare against, so the
  // starter set is absorbed in silence.
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto('/');
  await page.waitForTimeout(4000); // well past the idle reconcile
  await expect(page.getByTestId('progress-toast')).toHaveCount(0);
  await context.close();
});
