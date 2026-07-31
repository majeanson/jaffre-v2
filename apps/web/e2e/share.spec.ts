import { expect, test } from '@playwright/test';

/**
 * One-tap table invites (Phase 1, workstream C): headless desktop Chromium
 * has no navigator.share, so the Share button must take the clipboard
 * fallback — the room link lands on the clipboard and the "Link copied"
 * toast confirms it.
 */

test('the lobby share button copies the room link and shows the toast', async ({ browser }) => {
  const context = await browser.newContext({
    permissions: ['clipboard-read', 'clipboard-write'],
  });
  const page = await context.newPage();
  const room = `e2e-sh-${Math.random().toString(36).slice(2, 10)}`;
  await page.goto(`/#room/${room}`);
  await expect(page.getByRole('heading', { name: `Room ${room}` })).toBeVisible();

  // This test is about the clipboard FALLBACK — if the runner ever grows an
  // OS share sheet, fail loudly rather than silently skipping the assert.
  expect(await page.evaluate(() => typeof navigator.share)).toBe('undefined');

  await page.getByRole('button', { name: 'Share this table' }).click();
  await expect(page.getByRole('status')).toHaveText('Link copied');

  const copied = await page.evaluate(() => navigator.clipboard.readText());
  // The /join path form — the one the Worker can unfurl (routes/join.ts).
  expect(copied).toBe(`${new URL(page.url()).origin}/join/${room}`);

  await context.close();
});
