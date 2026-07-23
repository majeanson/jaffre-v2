import { expect, test } from '@playwright/test';
import type { BrowserContext, Page } from '@playwright/test';

/**
 * Two REAL sessions at one table, identities checked at every layer. Unlike
 * the other multi-context specs, the names are typed through the actual UI
 * (Customize → Your name → blur) — no localStorage seeding — because "my name
 * became Player when I joined" is precisely a commit-timing bug this must
 * catch. Then: A hosts, B joins from the live lobby, 2 bots fill the table,
 * the game starts, and we assert who's who in the seat rows, the chat, the
 * felt, and the tokens themselves.
 */

/** The identity this page's localStorage currently holds. */
async function identityOf(page: Page): Promise<{ userId: string; name: string }> {
  return page.evaluate(() => {
    const raw = localStorage.getItem('jaffre-token');
    if (raw === null) throw new Error('no jaffre-token in localStorage');
    const t = JSON.parse(raw) as { userId: string; name: string };
    return { userId: t.userId, name: t.name };
  });
}

/** New page with reduced motion (config `use` doesn't reach hand-made contexts). */
async function newPage(context: BrowserContext): Promise<Page> {
  const page = await context.newPage();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  return page;
}

/** Rename through the real UI: type on the identity card itself, blur
 * commits. (A second "Your name" field lives in the Customize drawer — same
 * wiring; the card is the path players actually take.) */
async function renameVia(page: Page, name: string): Promise<void> {
  const field = page.getByRole('textbox', { name: 'Your name' }).first();
  await field.fill(name);
  await field.blur();
}

test('two sessions rename via the UI, share a table with 2 bots, and stay themselves everywhere', async ({
  browser,
}) => {
  const contextA = await browser.newContext();
  const contextB = await browser.newContext();
  const a = await newPage(contextA);
  const b = await newPage(contextB);

  // ── Names: typed in the UI, never seeded ─────────────────────────────────
  await a.goto('/');
  await renameVia(a, 'Broski-A');
  await b.goto('/');
  await renameVia(b, 'Ginette-B');

  // ── A hosts ──────────────────────────────────────────────────────────────
  await a.getByRole('button', { name: 'Play', exact: true }).click();
  await a.getByRole('button', { name: 'Create a room' }).click();
  await expect.poll(() => a.evaluate(() => location.hash)).toMatch(/^#room\//);
  const code = await a.evaluate(() => location.hash.replace('#room/', ''));
  await a.getByRole('button', { name: 'Sit here' }).first().click();

  // The reported bug, dead on: the seat must carry the TYPED name, not the
  // "Player" placeholder.
  await expect(a.getByTestId('seat-row-0')).toContainText('Broski-A');
  await expect(a.getByTestId('seat-row-0')).toContainText(/\(you\)/i);
  await expect(a.getByTestId('seat-row-0')).not.toContainText('Player');

  // ── B joins from the live lobby and sits ─────────────────────────────────
  await b.getByRole('button', { name: 'Play', exact: true }).click();
  await b.getByRole('button', { name: 'Join a public game' }).click();
  const card = b.getByRole('listitem').filter({ hasText: code });
  await expect(card).toContainText('Broski-A'); // host name on the card
  await card.getByRole('button', { name: 'Join' }).click();
  await expect.poll(() => b.evaluate(() => location.hash)).toBe(`#room/${code}`);
  await b.getByRole('button', { name: 'Sit here' }).first().click();

  // Both browsers agree on who sits where — and on who "you" is.
  await expect(b.getByTestId('seat-row-1')).toContainText('Ginette-B');
  await expect(b.getByTestId('seat-row-1')).toContainText(/\(you\)/i);
  await expect(b.getByTestId('seat-row-0')).toContainText('Broski-A');
  await expect(b.getByTestId('seat-row-0')).not.toContainText(/\(you\)/i);
  await expect(a.getByTestId('seat-row-1')).toContainText('Ginette-B');
  await expect(a.getByTestId('seat-row-1')).not.toContainText(/\(you\)/i);

  // Tokens: two distinct uids, each carrying its typed name.
  const idA = await identityOf(a);
  const idB = await identityOf(b);
  expect(idA.userId).not.toBe(idB.userId);
  expect(idA.name).toBe('Broski-A');
  expect(idB.name).toBe('Ginette-B');

  // ── Chat: messages land under the RIGHT author on the other side ─────────
  const inputA = a.getByTestId('chat-input');
  await inputA.fill('salut, ici A');
  await inputA.press('Enter');
  await expect(b.getByTestId('chat-messages')).toContainText('Broski-A');
  await expect(b.getByTestId('chat-messages')).toContainText('salut, ici A');
  const inputB = b.getByTestId('chat-input');
  await inputB.fill('allo, ici B');
  await inputB.press('Enter');
  await expect(a.getByTestId('chat-messages')).toContainText('Ginette-B');
  await expect(a.getByTestId('chat-messages')).toContainText('allo, ici B');
  // Neither side ever saw a "Player".
  await expect(a.getByTestId('chat-messages')).not.toContainText('Player');
  await expect(b.getByTestId('chat-messages')).not.toContainText('Player');

  // ── Fill with 2 bots and start ───────────────────────────────────────────
  await a.getByTestId('fill-bots').click();
  await a.getByRole('button', { name: 'Start the game' }).click();
  await expect(a.getByTestId('score-strip')).toBeVisible();
  await expect(b.getByTestId('score-strip')).toBeVisible();

  // On the felt each browser is anchored at the bottom as ITSELF, and sees
  // the other by name (seat chips render every player's name).
  await expect(a.locator('main')).toContainText('Broski-A');
  await expect(a.locator('main')).toContainText('Ginette-B');
  await expect(b.locator('main')).toContainText('Broski-A');
  await expect(b.locator('main')).toContainText('Ginette-B');
  await expect(a.locator('main')).not.toContainText(/\bPlayer\b/);
  await expect(b.locator('main')).not.toContainText(/\bPlayer\b/);

  await contextA.close();
  await contextB.close();
});
