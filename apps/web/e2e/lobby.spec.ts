import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

/**
 * Public lobby + who's-who: two REAL browser contexts (own localStorage, own
 * minted identity — the "one normal + one private window" setup) prove that
 *  - a created room is public by default and appears in #lobby LIVE (pushed
 *    over the lobby WebSocket, no reload, no polling),
 *  - a second player joins from the browser card as THEMSELVES (distinct uid,
 *    their own name on the seat),
 *  - and, separately, that opening the SAME account in a second browser is
 *    one player, not two — the room recognizes the uid and resumes its seat.
 * Requires the e2e server's SESSION_SECRET (see playwright.config.ts).
 */

/** The canonical uid of the identity this page currently holds. */
async function uidOf(page: Page): Promise<string> {
  return page.evaluate(() => {
    const raw = localStorage.getItem('jaffre-token');
    if (raw === null) throw new Error('no jaffre-token in localStorage');
    return (JSON.parse(raw) as { userId: string }).userId;
  });
}

/** A page from a hand-made context: config `use.reducedMotion` doesn't reach
 * these, and without it the attract-mode takeover can swallow an idle page. */
async function newPage(context: import('@playwright/test').BrowserContext): Promise<Page> {
  const page = await context.newPage();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  return page;
}

/** Create a room from Home (the real button — this is what flags it public)
 * and take seat 1. Resolves to the room code. */
async function createRoomAndSit(page: Page): Promise<string> {
  await page.goto('/');
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await page.getByRole('button', { name: 'Create a room' }).click();
  await expect.poll(() => page.evaluate(() => location.hash)).toMatch(/^#room\//);
  const code = await page.evaluate(() => location.hash.replace('#room/', ''));
  await page.getByRole('button', { name: 'Sit here' }).first().click();
  return code;
}

test('a created room is public by default, appears in #lobby live, and a second player joins as themselves', async ({
  browser,
}) => {
  const contextA = await browser.newContext();
  const contextB = await browser.newContext();
  await contextA.addInitScript(() => localStorage.setItem('jaffre-name', 'Alice'));
  await contextB.addInitScript(() => localStorage.setItem('jaffre-name', 'Bruno'));
  const a = await newPage(contextA);
  const b = await newPage(contextB);

  // B parks on the lobby FIRST, while no table is open — the card must arrive
  // by server push, not because the page loaded after the fact.
  await b.goto('/#lobby');
  await expect(b.getByText('No open tables right now', { exact: false })).toBeVisible();

  // A creates a room and sits. Sitting is the moment the default-public flag
  // applies and the room registers with the lobby.
  const code = await createRoomAndSit(a);
  await expect(a.getByTestId('public-toggle')).toBeChecked();

  // ...and B's OPEN lobby page grows the card, unprompted: host Alice, 1/4.
  await expect(b.getByText('Alice')).toBeVisible();
  await expect(b.getByText('1/4 seated')).toBeVisible();

  // B joins from the card and takes a seat — as Bruno, not as a second Alice.
  await b.getByRole('button', { name: 'Join' }).click();
  await expect.poll(() => b.evaluate(() => location.hash)).toBe(`#room/${code}`);
  await b.getByRole('button', { name: 'Sit here' }).first().click();

  // Who's-who: A sees Bruno arrive; the two browsers are distinct identities.
  await expect(a.getByText('Bruno')).toBeVisible();
  expect(await uidOf(a)).not.toBe(await uidOf(b));

  // A fills the empty seats with bots and starts. Both players land on the
  // felt, and the started room drops off the public lobby.
  await a.getByTestId('fill-bots').click();
  await a.getByRole('button', { name: 'Start the game' }).click();
  await expect(a.getByTestId('score-strip')).toBeVisible();
  await expect(b.getByTestId('score-strip')).toBeVisible();
  await expect
    .poll(async () => {
      const res = await b.request.get('/api/rooms');
      const { rooms } = (await res.json()) as { rooms: { code: string }[] };
      return rooms.some((r) => r.code === code);
    })
    .toBe(false);

  await contextA.close();
  await contextB.close();
});

test('the same account in a second browser is ONE player — the room resumes its seat, not a new one', async ({
  browser,
}) => {
  // Browser A: mint an identity, create a room, sit.
  const contextA = await browser.newContext();
  await contextA.addInitScript(() => localStorage.setItem('jaffre-name', 'Solo-e2e'));
  const a = await newPage(contextA);
  const code = await createRoomAndSit(a);
  await expect(a.getByTestId('seat-row-0')).toContainText(/\(you\)/i);
  const token = await a.evaluate(() => localStorage.getItem('jaffre-token'));
  expect(token).not.toBeNull();

  // Browser C: a fresh context CARRYING A'S ACCOUNT (what logging into the
  // same Google/email account in a private window amounts to).
  const contextC = await browser.newContext();
  await contextC.addInitScript(
    ([t]) => {
      localStorage.setItem('jaffre-token', t as string);
      localStorage.setItem('jaffre-name', 'Solo-e2e');
    },
    [token],
  );
  const c = await newPage(contextC);
  await c.goto(`/#room/${code}`);

  // No seat click: the room recognizes the uid and hands back the SAME seat.
  // This is by design — one account is one player, however many windows.
  await expect(c.getByTestId('seat-row-0')).toContainText(/\(you\)/i);
  await expect(c.getByTestId('seat-row-0')).toContainText('Solo-e2e');
  expect(await uidOf(c)).toBe(await uidOf(a));

  await contextA.close();
  await contextC.close();
});
