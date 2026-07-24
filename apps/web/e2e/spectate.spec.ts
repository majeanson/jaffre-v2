import { expect, test } from '@playwright/test';
import type { BrowserContext, Page } from '@playwright/test';

/**
 * Spectating a public game from the lobby, and the two mid-game/waiting-room
 * "who gets the bot seat" races: a spectator taking over a bot seat once a
 * game is underway, and two players racing the same bot seat while a room is
 * still in the lobby.
 */

/** A page from a hand-made context: config `use.reducedMotion` doesn't reach
 * these, and without it the attract-mode takeover can swallow an idle page. */
async function newPage(context: BrowserContext): Promise<Page> {
  const page = await context.newPage();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  return page;
}

/** Create a room from Home via Play → Create → Public table (the real path —
 * this is what flags it public) and take seat 0. Resolves to the room code. */
async function createRoomAndSit(page: Page): Promise<string> {
  await page.goto('/');
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await page.getByRole('button', { name: 'Create', exact: true }).click();
  await page.getByRole('button', { name: 'Public table' }).click();
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

test('a started public game is watchable from the lobby, and a spectator can take over a bot seat', async ({
  browser,
}) => {
  const contextA = await browser.newContext();
  const contextB = await browser.newContext();
  await contextA.addInitScript(() => localStorage.setItem('jaffre-name', 'Alice'));
  await contextB.addInitScript(() => localStorage.setItem('jaffre-name', 'Bruno'));
  const a = await newPage(contextA);
  const b = await newPage(contextB);

  // A hosts, fills every other seat with bots, and starts the game.
  const code = await createRoomAndSit(a);
  await fillWithBots(a);
  await a.getByRole('button', { name: 'Start the game' }).click();
  await expect(a.getByTestId('score-strip')).toBeVisible();

  // B walks the real "join a public game" path and finds THIS code's card,
  // scoped by code (stale rooms from earlier local runs may linger in
  // wrangler's persisted DO state).
  await b.goto('/');
  await b.getByRole('button', { name: 'Play', exact: true }).click();
  await b.getByRole('button', { name: 'Join', exact: true }).click();
  await b.getByRole('button', { name: 'Join a public game' }).click();
  const card = b.getByRole('listitem').filter({ hasText: code });
  await expect(card).toBeVisible();
  await expect(card).toContainText('LIVE');

  // The card's action button reads "Watch" for a game in progress. NOTE: its
  // *accessible name* is actually the longer aria-label
  // ("Game in progress — join as a spectator") — PublicLobby.tsx sets
  // aria-label on the Cta only when playing, which overrides the visible
  // "Watch" text for a11y tooling. Asserting the rendered text (not the a11y
  // name) is the honest, non-brittle check here.
  const watchBtn = card.getByRole('button');
  await expect(watchBtn).toHaveText('Watch');
  await watchBtn.click();

  // B lands on the room hash. Because B never sat and the game is already
  // started, App.tsx's routing shows the Visitor landing screen FIRST — its
  // "take over a bot seat / just watch" choice IS the spectator's mid-game
  // takeover affordance (there is no such control on the felt itself; it
  // lives only on this pre-watch landing page, keyed off local `watching`
  // state that resets on a fresh mount). Its bot-seat buttons carry a stable
  // testid: `take-seat-{seat}`.
  await expect.poll(() => b.evaluate(() => location.hash)).toBe(`#room/${code}`);
  const takeSeatButtons = b.locator('[data-testid^="take-seat-"]');
  await expect(takeSeatButtons.first()).toBeVisible();
  await expect(b.getByRole('button', { name: 'Just watch' })).toBeVisible();

  // Choosing "Just watch" carries B onto the felt as a pure spectator: the
  // score strip renders, and there is nothing resembling a "Sit here" pick
  // (the pre-game seat picker isn't shown once the game has started).
  await b.getByRole('button', { name: 'Just watch' }).click();
  await expect(b.getByTestId('score-strip')).toBeVisible();
  await expect(b.getByRole('button', { name: 'Sit here' })).toHaveCount(0);
  await expect(b.locator('[data-testid^="take-seat-"]')).toHaveCount(0);

  // Reloading re-mounts the app: B is still an unseated spectator at a
  // started game, so the Visitor landing (and its takeover affordance)
  // reappears — this is how a spectator gets back to it mid-game.
  await b.reload();
  await b.emulateMedia({ reducedMotion: 'reduce' });
  const takeoverBtn = b.locator('[data-testid^="take-seat-"]').first();
  await expect(takeoverBtn).toBeVisible();
  const seatTestId = await takeoverBtn.getAttribute('data-testid');
  expect(seatTestId).not.toBeNull();

  // Take over that bot's seat. B should land directly on the felt (no
  // intermediate landing screen once seated) and see a real hand of cards —
  // the ListBox has an accessible name of "Your hand", only rendered for a
  // seated player.
  await takeoverBtn.click();
  await expect(b.getByTestId('score-strip')).toBeVisible();
  await expect(b.getByRole('listbox', { name: 'Your hand' })).toBeVisible();

  await contextA.close();
  await contextB.close();
});

test('a stale Join on an already-taken seat surfaces the seat-taken toast', async ({ browser }) => {
  // A true three-page click race proved unpinnable on CI (welcome/roster
  // ordering differs run to run — the "loser" could connect late enough to
  // never even see the button). This stages the SAME product moment
  // deterministically: C's page goes offline holding a stale "Join", B takes
  // the seat meanwhile, and C's queued click flushes on reconnect into the
  // server's SEAT_TAKEN rejection — exactly the phone-with-a-stale-screen
  // case the toast exists for. It also pins the offline intent queue.
  const contextA = await browser.newContext();
  const contextB = await browser.newContext();
  const contextC = await browser.newContext();
  await contextA.addInitScript(() => localStorage.setItem('jaffre-name', 'Alice'));
  await contextB.addInitScript(() => localStorage.setItem('jaffre-name', 'Bruno'));
  await contextC.addInitScript(() => {
    localStorage.setItem('jaffre-name', 'Carla');
    // Track live sockets so the test can sever them: setOffline() blocks NEW
    // connections but does NOT terminate an established localhost WebSocket,
    // so a "network drop" needs both the block and an explicit close.
    const sockets: WebSocket[] = [];
    (window as unknown as { __sockets: WebSocket[] }).__sockets = sockets;
    const Original = window.WebSocket;
    window.WebSocket = class extends Original {
      constructor(url: string | URL, protocols?: string | string[]) {
        super(url, protocols);
        sockets.push(this);
      }
    } as typeof WebSocket;
  });
  const a = await newPage(contextA);
  const b = await newPage(contextB);
  const c = await newPage(contextC);

  // A hosts and fills the rest of the table with bots (3 bot seats).
  const code = await createRoomAndSit(a);
  await fillWithBots(a);
  await expect(a.getByTestId('seat-row-1')).toBeVisible();

  // B and C both land on the (still-waiting) room; both see the bot's JOIN.
  await b.goto(`/#room/${code}`);
  await c.goto(`/#room/${code}`);
  await expect(b.getByTestId('join-1')).toBeVisible();
  await expect(c.getByTestId('join-1')).toBeVisible();

  // C's network drops: block new connections FIRST (reconnects must fail
  // while she's dark), then sever the live socket. The store keeps the last
  // roster, so her screen still shows the bot's JOIN — a stale button. The
  // connection line acknowledging the drop proves the click lands in the gap.
  await contextC.setOffline(true);
  await c.evaluate(() =>
    (window as unknown as { __sockets: WebSocket[] }).__sockets.forEach((s) => s.close()),
  );
  await expect(c.getByText(/Reconnecting|Reconnexion/)).toBeVisible();

  // B takes the seat while C is dark.
  await b.getByTestId('join-1').click();
  await expect(b.getByTestId('seat-row-1')).toContainText(/\(you\)/i);
  await expect(b.getByTestId('seat-row-1')).toContainText('Bruno');

  // C clicks her stale JOIN — the intent queues (socket is down, not open).
  await c.getByTestId('join-1').click();

  // Back online: the queued sit flushes on reconnect, the server answers
  // SEAT_TAKEN, and the toast tells C what happened.
  await contextC.setOffline(false);
  await expect(c.getByRole('status').filter({ hasText: /taken/i })).toBeVisible({
    timeout: 20_000,
  });
  // And her roster caught up: the seat belongs to Bruno, not her.
  await expect(c.getByTestId('seat-row-1')).toContainText('Bruno');
  await expect(c.getByTestId('seat-row-1')).not.toContainText(/\(you\)/i);

  await contextA.close();
  await contextB.close();
  await contextC.close();
});
