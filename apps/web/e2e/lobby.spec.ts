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

/** Create a room from Home via Play → Host a public table (the real path —
 * this is what flags it public) and take seat 1. Resolves to the code. */
async function createRoomAndSit(page: Page): Promise<string> {
  await page.goto('/');
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await page.getByRole('button', { name: 'Host a public table' }).click();
  await expect.poll(() => page.evaluate(() => location.hash)).toMatch(/^#room\//);
  const code = await page.evaluate(() => location.hash.replace('#room/', ''));
  await page.getByRole('button', { name: 'Sit here' }).first().click();
  return code;
}

/** Fill every empty seat via the per-seat "Add bot" buttons (the one-tap
 * fill-bots shortcut is gone — house style is one control per seat). */
async function fillWithBots(page: Page): Promise<void> {
  const addBot = page.getByRole('button', { name: 'Add bot' });
  while ((await addBot.count()) > 0) {
    const before = await addBot.count();
    await addBot.first().click();
    await expect.poll(() => addBot.count()).toBeLessThan(before);
  }
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

  // B walks the real path — Play → "Join a public game" — and parks on the
  // lobby FIRST, while no table is open: the card must arrive by server push,
  // not because the page loaded after the fact.
  await b.goto('/');
  await b.getByRole('button', { name: 'Play', exact: true }).click();
  await b.getByRole('button', { name: 'Join a public game' }).click();
  // The lobby is up BEFORE Alice's table exists (that's the push proof: her
  // card can only get here over the watcher socket). No emptiness assertion —
  // rooms from earlier local runs may linger in wrangler's persisted DO state.
  await expect(b.getByRole('heading', { name: 'Public tables' })).toBeVisible();

  // A creates a room and sits. Sitting is the moment the default-public flag
  // applies and the room registers with the lobby.
  const code = await createRoomAndSit(a);
  // House rules is a native <details>/<summary> disclosure — no button role.
  await a.getByText('House rules', { exact: true }).click();
  await expect(a.getByTestId('public-toggle')).toBeChecked();

  // ...and B's OPEN lobby page grows the card, unprompted: host Alice, 1/4.
  // Scoped by THIS run's room code — stale rooms from earlier local runs
  // (killed before deregistering) may share the list, even as other Alices.
  const aliceCard = b.getByRole('listitem').filter({ hasText: code });
  await expect(aliceCard).toBeVisible();
  await expect(aliceCard).toContainText('Alice');
  await expect(aliceCard).toContainText('1/4 seated');

  // B joins from the card and takes a seat — as Bruno, not as a second Alice.
  await aliceCard.getByRole('button', { name: 'Join' }).click();
  await expect.poll(() => b.evaluate(() => location.hash)).toBe(`#room/${code}`);
  // Wait for the roster before sitting: until it lands, every seat renders a
  // "Sit here" and the first one is ALICE's — a fast click gets SEAT_TAKEN on
  // slow CI. Alice's nameplate proves the roster arrived and .first() now
  // targets a genuinely empty seat.
  await expect(b.getByText('Alice')).toBeVisible();
  await b.getByRole('button', { name: 'Sit here' }).first().click();

  // Who's-who: A sees Bruno arrive; the two browsers are distinct identities.
  await expect(a.getByText('Bruno')).toBeVisible();
  expect(await uidOf(a)).not.toBe(await uidOf(b));

  // A fills the empty seats with bots and starts. Both players land on the
  // felt, and the started room flips from a joinable 'waiting' entry to a
  // watchable 'playing' one on the public lobby (spectators welcome).
  await fillWithBots(a);
  await a.getByRole('button', { name: 'Start the game' }).click();
  await expect(a.getByTestId('score-strip')).toBeVisible();
  await expect(b.getByTestId('score-strip')).toBeVisible();
  await expect
    .poll(async () => {
      const res = await b.request.get('/api/rooms');
      const { rooms } = (await res.json()) as { rooms: { code: string; phase: string }[] };
      return rooms.find((r) => r.code === code)?.phase ?? 'gone';
    })
    .toBe('playing');

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
