import { expect, test } from '@playwright/test';

/**
 * Cosmetics (Collection gallery): Home links to it, equipping a free card skin
 * applies it instantly (a `data-card-skin` on <html>) and persists across a
 * reload, and a locked skin shows its unlock requirement and cannot be equipped.
 * The unlock aggregation itself is derived from /api/stats and covered by the
 * server unit tests; here we drive the UI with the dev "Show all" toggle so no
 * seeded game history is needed.
 */

test('home links to the Collection gallery via the cards-icon chrome button', async ({ page }) => {
  await page.goto('/');
  // ONE entry point now: the chrome's cards icon (same symbol as in-game).
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

test('the OG deck renders real painted card-face images', async ({ page }) => {
  await page.goto('/#scenes/og-deck');
  await expect(page.locator('[role="option"][data-playable="true"]').first()).toBeVisible();
  // The face is a real PNG from the old deck — assert one actually decoded
  // (naturalWidth > 0 catches a broken path / missing asset).
  const img = page.locator('img[src*="/og-cards/"]').first();
  await expect(img).toBeVisible();
  const loaded = await img.evaluate(
    (el) => (el as HTMLImageElement).complete && (el as HTMLImageElement).naturalWidth > 0,
  );
  expect(loaded).toBe(true);
});

test('equipping a felt applies it independently of the theme, and persists', async ({ page }) => {
  await page.goto('/#collection');
  await expect(page.getByRole('heading', { name: 'Collection' })).toBeVisible();
  const html = page.locator('html');
  // Default = the `house` felt: no attribute at all, so the theme keeps the
  // table (same "default declares nothing" rule as arcade / dark).
  await expect(html).not.toHaveAttribute('data-felt', /.*/);

  await page.getByTestId('cosmetic-tile-tavern').click();
  await expect(html).toHaveAttribute('data-felt', 'tavern');
  // The whole point of the axis: the table changed, the cards did not.
  await expect(html).not.toHaveAttribute('data-card-skin', /.*/);

  await page.reload();
  await expect(html).toHaveAttribute('data-felt', 'tavern');

  await page.getByTestId('cosmetic-tile-house').click();
  await expect(html).not.toHaveAttribute('data-felt', /.*/);
});

test('the "How it looks" panel wears the equipped felt, and lets go of it', async ({ page }) => {
  await page.goto('/#collection');
  await expect(page.getByRole('heading', { name: 'Collection' })).toBeVisible();
  const oval = page.getByTestId('live-preview').locator('.felt-oval');

  // A real surface, not the 4px sliver the felt TILES shipped as.
  const box = await oval.boundingBox();
  expect(box?.width ?? 0).toBeGreaterThan(150);
  expect(box?.height ?? 0).toBeGreaterThan(80);

  // Read the felt through its own tokens rather than a pixel: `--color-felt-800`
  // is what both the oval and the real table paint with.
  const surface = () =>
    oval.evaluate((el) => ({
      base: getComputedStyle(el).getPropertyValue('--color-felt-800').trim(),
      texture: getComputedStyle(el).getPropertyValue('--felt-texture').trim(),
    }));

  const house = await surface();
  expect(house.texture).toBe('none'); // the default felt has no grain of its own

  await page.getByTestId('cosmetic-tile-tavern').click();
  const tavern = await surface();
  expect(tavern.base).not.toBe(house.base);
  expect(tavern.texture).not.toBe('none');

  // The bug this pins: with no attribute of its own, a "default" surface
  // inherits whatever is equipped on <html> — so going back to House Green
  // left the panel (and the felt tiles, twice) still showing tavern wood.
  await page.getByTestId('cosmetic-tile-house').click();
  expect(await surface()).toEqual(house);
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
