import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

/**
 * Card art must never load on demand. The OG portraits/emblems are real JPGs,
 * so fetching one when its card lands means the first Red 0 of a game flips to
 * a blank face and pops in a beat later. These pin the preload: the art for
 * the EQUIPPED cosmetics is warmed before any card is drawn, and a player
 * whose skin has no art pays nothing.
 */

/** Every /og-cards request the page makes, by pathname. */
function watchCardArt(page: Page): string[] {
  const asked: string[] = [];
  page.on('request', (r) => {
    if (r.url().includes('/og-cards/')) asked.push(new URL(r.url()).pathname);
  });
  return asked;
}

test('the OG deck warms all eight faces on Home, before a game starts', async ({ page }) => {
  const asked = watchCardArt(page);
  await page.addInitScript(() => localStorage.setItem('jaffre-card-skin', 'og-deck'));
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Jaffre' })).toBeVisible();
  // 4 portraits (0-cards) + 4 emblems (1-7, and the face-down back).
  await expect.poll(() => new Set(asked).size, { timeout: 10_000 }).toBe(8);
  expect([...new Set(asked)].sort()).toContain('/og-cards/red_bon.jpg');
});

test('the OG bonhomme mode warms only the four portraits', async ({ page }) => {
  const asked = watchCardArt(page);
  await page.addInitScript(() => localStorage.setItem('jaffre-bonhomme-skin', 'og'));
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Jaffre' })).toBeVisible();
  await expect.poll(() => new Set(asked).size, { timeout: 10_000 }).toBe(4);
  // Portraits only: this mode never prints an emblem.
  expect([...new Set(asked)].every((p) => p.endsWith('_bon.jpg'))).toBe(true);
});

test('the default arcade skin fetches no card art at all', async ({ page }) => {
  const asked = watchCardArt(page);
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Jaffre' })).toBeVisible();
  // Nobody pays for art they can't see — give it a beat to prove it stays empty.
  await page.waitForTimeout(2500);
  expect(asked).toEqual([]);
});
