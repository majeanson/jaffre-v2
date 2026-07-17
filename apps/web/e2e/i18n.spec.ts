import { expect, test } from '@playwright/test';

/**
 * i18n: the app is fully bilingual (en / fr-CA). The default language comes
 * from the browser (fr* → French, else English), overridable via the Language
 * picker (persisted as jaffre-lang). English strings are pinned by the rest of
 * the e2e suite (en-US browser) — these tests cover the French side.
 */

test('a French browser gets the French home screen by default', async ({ browser }) => {
  const context = await browser.newContext({ locale: 'fr-CA' });
  const page = await context.newPage();
  await page.goto('/');
  await expect(page.getByText('Pratique contre les bots')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Ton record' })).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('lang', 'fr-CA');
  await context.close();
});

test('the language picker switches to French and persists', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('Practice vs bots')).toBeVisible();
  await page.getByRole('combobox', { name: 'Language' }).selectOption('fr');
  await expect(page.getByText('Pratique contre les bots')).toBeVisible();
  await page.reload();
  await expect(page.getByText('Pratique contre les bots')).toBeVisible();
});

test('the staged stats scene renders in French', async ({ browser }) => {
  const context = await browser.newContext({ locale: 'fr-CA' });
  const page = await context.newPage();
  await page.goto('/#scenes/stats');
  await expect(page.getByRole('heading', { name: 'Ton record' })).toBeVisible();
  await expect(page.getByText('Précision des mises')).toBeVisible();
  await context.close();
});
