import { expect, test } from '@playwright/test';

/**
 * Cosmetics (Collection gallery): Home links to it, equipping a free card skin
 * applies it instantly (a `data-card-skin` on <html>) and persists across a
 * reload, and a locked skin shows its unlock requirement and cannot be equipped.
 * The unlock aggregation itself is derived from /api/stats and covered by the
 * server unit tests; here we drive the UI with the dev "Show all" toggle so no
 * seeded game history is needed.
 */

test('home links to the Collection gallery', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: 'Collection' }).click();
  await expect(page.getByRole('heading', { name: 'Collection' })).toBeVisible();
  expect(new URL(page.url()).hash).toBe('#collection');
});

test('equipping a free card skin applies it and persists across reload', async ({ page }) => {
  await page.goto('/#collection');
  await expect(page.getByRole('heading', { name: 'Collection' })).toBeVisible();
  const html = page.locator('html');
  // Default = the arcade skin: no attribute at all.
  await expect(html).not.toHaveAttribute('data-card-skin', /.*/);

  // Equip Classic OG (a free skin) — the deck changes in place.
  await page.getByTestId('cosmetic-tile-classic-og').click();
  await expect(html).toHaveAttribute('data-card-skin', 'classic-og');

  // Persists across a reload (localStorage → initCardSkin at boot).
  await page.reload();
  await expect(html).toHaveAttribute('data-card-skin', 'classic-og');

  // Back to arcade so the stored choice doesn't leak into other assertions.
  await page.getByTestId('cosmetic-tile-arcade').click();
  await expect(html).not.toHaveAttribute('data-card-skin', /.*/);
});

test('a locked skin shows its requirement and cannot be equipped', async ({ browser }) => {
  const context = await browser.newContext(); // fresh identity → no games played
  const page = await context.newPage();
  await page.goto('/#collection');
  await expect(page.getByRole('heading', { name: 'Collection' })).toBeVisible();

  // Turn off the dev "Show all" so the real locked state shows.
  await page.getByRole('checkbox', { name: 'Show all (dev)' }).uncheck();

  const neon = page.getByTestId('cosmetic-tile-neon');
  await expect(neon).toHaveAttribute('aria-disabled', 'true');
  await expect(neon.getByText('Play 20 games')).toBeVisible();

  // A locked tile is aria-disabled (Playwright won't click it normally); force
  // a click to prove the handler's own guard keeps it a no-op — arcade stays on.
  await neon.click({ force: true });
  await expect(page.locator('html')).not.toHaveAttribute('data-card-skin', /.*/);

  await context.close();
});
