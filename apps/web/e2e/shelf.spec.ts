import { expect, test, type Page } from '@playwright/test';

/**
 * The trophy shelf: the one part of the Awards screen the player OWNS. Every
 * other tile on that screen is the server's opinion of what you have earned;
 * the shelf order is a choice, and a choice that silently resets is worse than
 * no choice at all. So what is tested here is that a rearrangement takes, and
 * that it is still there after a reload.
 *
 * Driven through the staged scene: the arrangement logic is identical either
 * way (it reads the earned ids and writes the profile cache), and earning six
 * real awards would mean playing six real games.
 */

/** The shelf's trophies, in the order they are laid out. */
async function shelfOrder(page: Page): Promise<string[]> {
  return page.getByRole('region', { name: 'Your shelf' }).locator('li').allInnerTexts();
}

test('a trophy can be moved along the shelf, and stays where it is put', async ({ page }) => {
  await page.goto('/#scenes/awards-arranging');
  const shelf = page.getByRole('region', { name: 'Your shelf' });
  await expect(shelf).toBeVisible();

  const before = await shelfOrder(page);
  expect(before.length).toBeGreaterThan(1);

  // The ends are stated, not hidden: the first trophy cannot go further left.
  const firstName = (before[0] ?? '').split('\n')[0] ?? '';
  await expect(shelf.getByRole('button', { name: /^Move .* left$/ }).first()).toBeDisabled();

  // Move the first trophy right; it and its neighbour swap.
  await shelf
    .getByRole('button', { name: /^Move .* right$/ })
    .first()
    .click();
  const after = await shelfOrder(page);
  expect(after).not.toEqual(before);
  expect(after[1]).toBe(before[0]);
  expect(after[0]).toBe(before[1]);
  expect(firstName.length).toBeGreaterThan(0);

  // The order is a possession, not a session state.
  await page.reload();
  await expect(shelf).toBeVisible();
  expect(await shelfOrder(page)).toEqual(after);

  // And it can be given back: "Reset order" returns the catalog order.
  await page.getByRole('button', { name: 'Reset order' }).click();
  expect(await shelfOrder(page)).toEqual(before);
});

test('an empty shelf says what to do about it, and offers nothing to arrange', async ({ page }) => {
  await page.goto('/#scenes/awards-fresh');
  await expect(page.getByRole('region', { name: 'Your shelf' })).toContainText(
    'Nothing on the shelf yet',
  );
  // Arranging one trophy is not a thing you can want, so the button is absent
  // rather than present-and-useless.
  await expect(page.getByRole('button', { name: 'Arrange' })).toHaveCount(0);
  // The case below still shows the whole catalog to aim at.
  await expect(page.getByRole('region', { name: 'Still in the case' })).toBeVisible();
});

test('a brand-new player reaches a real, empty Awards screen', async ({ browser }) => {
  // The staged scenes above prove the mechanics; this proves the real route
  // renders for someone with no history and no network awards at all.
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto('/#awards');
  await expect(page.getByRole('heading', { name: 'Awards' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Your shelf' })).toContainText(
    'Nothing on the shelf yet',
  );
  await context.close();
});
