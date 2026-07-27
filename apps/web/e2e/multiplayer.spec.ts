import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

/**
 * Two humans + two bots in one room: both clients see the same table, the
 * auction completes (each human bids 7 when legal, otherwise passes), cards
 * reach the trick area, and when one player drops their seat shows the
 * disconnected dot on the other client.
 */

/**
 * Advance the game if it's this human's turn: bid 7 when legal (so a contract
 * always lands), otherwise pass; in the play phase, play the first legal card
 * (contract winner may be a human, who must lead the first trick).
 */
async function actIfMyTurn(page: Page): Promise<void> {
  // The bid panel stays up for the whole auction — an ENABLED Pass (not a
  // merely visible one) is what marks this human's turn.
  //
  // Every probe here is bounded and failure-tolerant ON PURPOSE. This polls a
  // live two-client game, so any element can vanish between two awaits: the
  // last bid ends the auction and unmounts the panel, and an unbounded
  // `isEnabled()` on the element we just saw would then auto-wait for a node
  // that is never coming back — blocking until the whole test times out. A
  // vanished control simply means "not my turn any more", so treat it as that.
  const pass = page.getByRole('button', { name: 'Pass' });
  const canBid = await pass.isEnabled({ timeout: 500 }).catch(() => false);
  if (canBid) {
    const seven = page.getByRole('button', { name: 'Bid 7', exact: true });
    const canSeven = await seven.isEnabled({ timeout: 500 }).catch(() => false);
    await (canSeven ? seven : pass).click({ timeout: 2000 }).catch(() => undefined);
    return;
  }
  const legal = page.locator('[role="option"][data-playable="true"]');
  if ((await legal.count()) > 0) {
    await legal
      .first()
      .click({ timeout: 2000 })
      .catch(() => undefined);
  }
}

test('two clients share a room, play starts, and a disconnect is shown', async ({ browser }) => {
  test.setTimeout(120_000);
  const room = `e2e-${Math.random().toString(36).slice(2, 10)}`;

  const contextA = await browser.newContext();
  const contextB = await browser.newContext();
  const a = await contextA.newPage();
  const b = await contextB.newPage();

  // A sits seat 0 and fills seats 2 and 3 with bots. Wait for the socket to
  // actually be open before sitting (this copy shows only once joined) — an
  // immediate click can outrun the token-auth join and get dropped server-side.
  await a.goto(`/#room/${room}`);
  await expect(a.getByText('Share this code with your table.')).toBeVisible();
  await a.getByTestId('seat-row-0').getByRole('button', { name: 'Sit here' }).click();
  await a.getByTestId('seat-row-2').getByRole('button', { name: 'Add bot' }).click();
  await a.getByTestId('seat-row-3').getByRole('button', { name: 'Add bot' }).click();

  // B joins the same room and sits seat 1 (same socket-open guard).
  await b.goto(`/#room/${room}`);
  await expect(b.getByText('Share this code with your table.')).toBeVisible();
  await b.getByTestId('seat-row-1').getByRole('button', { name: 'Sit here' }).click();

  // A starts; both clients land on the table.
  const start = a.getByRole('button', { name: 'Start the game' });
  await expect(start).toBeEnabled();
  await start.click();
  await expect(a.getByTestId('score-strip')).toBeVisible();
  await expect(b.getByTestId('score-strip')).toBeVisible();

  // Whoever's turn it is (their BidPanel appears) bids/passes until play
  // starts — i.e. until a card animates into the trick area.
  const trick = a.locator('[aria-label="Current trick"]');
  let sawCardInTrick = false;
  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    if ((await trick.locator('div').count()) > 0) {
      sawCardInTrick = true;
      break;
    }
    await actIfMyTurn(a);
    await actIfMyTurn(b);
    await a.waitForTimeout(250);
  }
  expect(sawCardInTrick).toBe(true);

  // Both clients converge on the same score strip. The strip highlights the
  // VIEWER's own team side (with a screen-reader-only "you" marker), so strip
  // that viewer-relative marker before comparing — the game state (scores,
  // bet, tricks) must match.
  const stripA = a.getByTestId('score-strip');
  const stripB = b.getByTestId('score-strip');
  const norm = (s: string) =>
    s
      .replace(/\(?\byou\b\)?/gi, '')
      .replace(/\s+/g, ' ')
      .trim();
  await expect
    .poll(
      async () => {
        const [textA, textB] = await Promise.all([stripA.innerText(), stripB.innerText()]);
        return norm(textA) === norm(textB) ? 'in sync' : `A: ${norm(textA)} | B: ${norm(textB)}`;
      },
      { timeout: 20_000 },
    )
    .toBe('in sync');

  // B drops; A sees B's seat marked disconnected (the red dot's title).
  await contextB.close();
  await expect(a.locator('[title="Disconnected"]')).toBeVisible({ timeout: 15_000 });

  await contextA.close();
});
