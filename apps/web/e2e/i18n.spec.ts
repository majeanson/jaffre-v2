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
  await expect(page.getByRole('button', { name: 'Jouer', exact: true })).toBeVisible();
  // The LevelBadge is the Journey door on Home; its meta-nav strip links on to
  // every other corner screen, including the relabelled "Ton coin" tab.
  await page.getByTestId('level-badge').click();
  await expect(page.getByRole('link', { name: 'Ton record' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Ton coin' })).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('lang', 'fr-CA');
  // Back to the title screen — the bots/friends split lives behind PLAY.
  await page.getByRole('button', { name: 'Accueil' }).click();
  await page.getByRole('button', { name: 'Jouer', exact: true }).click();
  await page.getByRole('button', { name: 'Créer', exact: true }).click();
  await expect(page.getByText('Pratique contre les bots')).toBeVisible();
  await context.close();
});

test('the language toggle switches to French and persists', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeVisible();
  // The EN/FR toggle flips to the other language in one tap.
  await page.getByRole('button', { name: 'Language · Français' }).click();
  await expect(page.getByRole('button', { name: 'Jouer', exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('button', { name: 'Jouer', exact: true })).toBeVisible();
});

test('the advanced strategy sections render in French', async ({ browser }) => {
  const context = await browser.newContext({ locale: 'fr-CA' });
  const page = await context.newPage();
  await page.goto('/#scenes/home-help');
  const dialog = page.getByRole('dialog', { name: 'Comment jouer' });
  await expect(dialog).toBeVisible();
  await dialog.getByText('Stratégie avancée').click();
  await expect(dialog.getByText('Les deux bonshommes (0 rouge et 0 brun)')).toBeVisible();
  await dialog.getByText('Les deux bonshommes (0 rouge et 0 brun)').click();
  await expect(dialog.getByText('Garde un petit brun comme porte de sortie.')).toBeVisible();
  await context.close();
});

test('the glossary renders in Québécois French', async ({ browser }) => {
  const context = await browser.newContext({ locale: 'fr-CA' });
  const page = await context.newPage();
  await page.goto('/#scenes/home-help');
  const dialog = page.getByRole('dialog', { name: 'Comment jouer' });
  await expect(dialog).toBeVisible();
  await dialog.getByText('Glossaire', { exact: true }).click();
  await expect(dialog.locator('#gloss-red0').getByText('Le 0 rouge (joffre)')).toBeVisible();
  await expect(dialog.getByText(/le plus gros lot de la ronde/)).toBeVisible();
  await context.close();
});

test('the staged stats scene renders in French', async ({ browser }) => {
  const context = await browser.newContext({ locale: 'fr-CA' });
  const page = await context.newPage();
  await page.goto('/#scenes/stats');
  await expect(page.getByRole('heading', { name: 'Ton record' })).toBeVisible();
  await expect(page.getByText('Précision des mises')).toBeVisible();
  await context.close();
});
