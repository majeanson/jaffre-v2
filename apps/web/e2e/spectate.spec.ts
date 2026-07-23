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

/** Create a room from Home (the real button — this is what flags it public)
 * and take seat 0. Resolves to the room code. */
async function createRoomAndSit(page: Page): Promise<string> {
  await page.goto('/');
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await page.getByRole('button', { name: 'Create a room' }).click();
  await expect.poll(() => page.evaluate(() => location.hash)).toMatch(/^#room\//);
  const code = await page.evaluate(() => location.hash.replace('#room/', ''));
  await page.getByRole('button', { name: 'Sit here' }).first().click();
  return code;
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
  await a.getByTestId('fill-bots').click();
  await a.getByRole('button', { name: 'Start the game' }).click();
  await expect(a.getByTestId('score-strip')).toBeVisible();

  // B walks the real "join a public game" path and finds THIS code's card,
  // scoped by code (stale rooms from earlier local runs may linger in
  // wrangler's persisted DO state).
  await b.goto('/');
  await b.getByRole('button', { name: 'Play', exact: true }).click();
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

test('two players racing one bot seat: the loser sees the seat-taken toast', async ({
  browser,
}) => {
  const contextA = await browser.newContext();
  const contextB = await browser.newContext();
  const contextC = await browser.newContext();
  await contextA.addInitScript(() => localStorage.setItem('jaffre-name', 'Alice'));
  await contextB.addInitScript(() => localStorage.setItem('jaffre-name', 'Bruno'));
  await contextC.addInitScript(() => localStorage.setItem('jaffre-name', 'Carla'));
  const a = await newPage(contextA);
  const b = await newPage(contextB);
  const c = await newPage(contextC);

  // A hosts and fills the rest of the table with bots (3 bot seats).
  const code = await createRoomAndSit(a);
  await a.getByTestId('fill-bots').click();
  await expect(a.getByTestId('seat-row-1')).toBeVisible();

  // B and C both land straight on the (still-waiting) room and both see the
  // JOIN action over the bot in seat 1.
  await b.goto(`/#room/${code}`);
  await c.goto(`/#room/${code}`);
  await expect(b.getByTestId('join-1')).toBeVisible();
  await expect(c.getByTestId('join-1')).toBeVisible();

  // Fire both clicks via in-page el.click() — NOT Playwright's actionability
  // pipeline. The loser's button detaches the instant the winner's roster
  // lands; a Playwright click caught mid-retry then aborts WITHOUT ever
  // dispatching, so no `sit` reaches the server and no toast can appear
  // (observed flake). $eval dispatches synchronously on the element it
  // resolved, so BOTH sit messages always go out and the loser is guaranteed
  // its SEAT_TAKEN rejection.
  await Promise.all([
    b.$eval('[data-testid="join-1"]', (el) => (el as HTMLElement).click()),
    c.$eval('[data-testid="join-1"]', (el) => (el as HTMLElement).click()),
  ]);

  // Exactly one of B/C ends up seated in row 1 as "(you)"; the other gets a
  // server rejection toast ("Seat 1 is taken"). Poll for the outcome rather
  // than assuming which page wins the race.
  await expect
    .poll(async () => {
      const bYou = await b
        .getByTestId('seat-row-1')
        .filter({ hasText: /\(you\)/i })
        .count();
      const cYou = await c
        .getByTestId('seat-row-1')
        .filter({ hasText: /\(you\)/i })
        .count();
      return bYou + cYou;
    })
    .toBeGreaterThan(0);

  const bWon =
    (await b
      .getByTestId('seat-row-1')
      .filter({ hasText: /\(you\)/i })
      .count()) > 0;
  const winner = bWon ? b : c;
  const loser = bWon ? c : b;

  await expect(winner.getByTestId('seat-row-1')).toContainText(/\(you\)/i);
  await expect(loser.getByRole('status').filter({ hasText: /taken/i })).toBeVisible();

  await contextA.close();
  await contextB.close();
  await contextC.close();
});
