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
  const pass = page.getByRole('button', { name: 'Pass' });
  if (await pass.isVisible()) {
    const seven = page.getByRole('button', { name: 'Bid 7', exact: true });
    if (await seven.isEnabled().catch(() => false)) {
      await seven.click();
    } else {
      await pass.click();
    }
    return;
  }
  const legal = page.locator('[role="option"][data-playable="true"]');
  if ((await legal.count()) > 0) await legal.first().click();
}

test('two clients share a room, play starts, and a disconnect is shown', async ({ browser }) => {
  test.setTimeout(120_000);
  const room = `e2e-${Math.random().toString(36).slice(2, 10)}`;

  const contextA = await browser.newContext();
  const contextB = await browser.newContext();
  const a = await contextA.newPage();
  const b = await contextB.newPage();

  // A sits seat 0 and fills seats 2 and 3 with bots.
  await a.goto(`/#room/${room}`);
  await a.getByTestId('seat-row-0').getByRole('button', { name: 'Sit here' }).click();
  await a.getByTestId('seat-row-2').getByRole('button', { name: 'Add bot' }).click();
  await a.getByTestId('seat-row-3').getByRole('button', { name: 'Add bot' }).click();

  // B joins the same room and sits seat 1.
  await b.goto(`/#room/${room}`);
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
  // VIEWER's own team with a "YOU" chip, so strip that viewer-relative marker
  // before comparing — the game state (scores, bet, tricks) must match.
  const stripA = a.getByTestId('score-strip');
  const stripB = b.getByTestId('score-strip');
  const norm = (s: string) =>
    s
      .replace(/\bYOU\b/g, '')
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
