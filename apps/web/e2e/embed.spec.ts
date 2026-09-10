import { expect, test } from '@playwright/test';

/**
 * The contract with an embedder (dads), against the real app.
 *
 * The postMessage half is unit-tested (apps/web/test/embed.test.ts) because
 * its interesting cases are refusals — a stranger framing us, a missing
 * referrer — that a browser test cannot stage. What only the real app can
 * show is the visible half: a player arriving from dads is already named, and
 * is offered the way back.
 */

test('a player arriving from dads is already named', async ({ browser }) => {
  const context = await browser.newContext();
  const page = await context.newPage();

  await page.goto('/?name=Marc&from=dads');
  // .first(): PLAY matches by substring and the home screen has more than one.
  await expect(page.getByRole('button', { name: 'PLAY' }).first()).toBeVisible();

  // Seeded before anything mounted, so the guest token was minted for Marc
  // rather than for 'Player'.
  expect(await page.evaluate(() => localStorage.getItem('jaffre-name'))).toBe('Marc');

  await context.close();
});

test('and is offered the way back', async ({ browser }) => {
  const context = await browser.newContext();
  const page = await context.newPage();

  await page.goto('/?name=Marc&from=dads');
  const back = page.getByRole('link', { name: /the dads/ });
  await expect(back).toBeVisible();
  await expect(back).toHaveAttribute('href', 'https://dads.marcportal.com');

  // It survives moving around the app: the flag lives in the URL, not in a
  // one-shot at boot.
  await page.reload();
  await expect(page.getByRole('link', { name: /the dads/ })).toBeVisible();

  await context.close();
});

test('an ordinary visitor sees no back link and keeps their own name', async ({ browser }) => {
  const context = await browser.newContext();
  const page = await context.newPage();

  await page.goto('/');
  // .first(): PLAY matches by substring and the home screen has more than one.
  await expect(page.getByRole('button', { name: 'PLAY' }).first()).toBeVisible();
  await expect(page.getByRole('link', { name: /the dads/ })).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem('jaffre-name'))).toBeNull();

  await context.close();
});
