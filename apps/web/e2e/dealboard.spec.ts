import { expect, test, type Page } from '@playwright/test';

/**
 * The Deal Board: today's hand, played for real, posted for real.
 *
 * Everything here goes through the actual stack — the challenge is derived
 * client-side from the UTC day, the hand is a genuine practice game against
 * the fixed 'normal' bots, and the action log is verified by the worker
 * against its own re-derivation of the same deal before a score exists. The
 * server unit tests cover what the verifier accepts and refuses; what only a
 * browser can show is that a player can actually get from "Play the hand" to a
 * row on the board, and that the board remembers them afterwards.
 */

/** Play whatever this turn allows, if it is ours. Returns false when it isn't.
 *
 * The auction comes first (pass — a challenge hand is playable from any
 * contract, and passing keeps the run short and deterministic in shape); then
 * cards, cheapest legal choice, since the SCORE is not what is under test. */
async function actIfOurTurn(page: Page): Promise<boolean> {
  const pass = page.getByRole('button', { name: 'Pass' });
  if (await pass.isVisible().catch(() => false)) {
    if (await pass.isEnabled()) {
      await pass.click();
      return true;
    }
    return false;
  }
  const playable = page.locator('[role="option"][data-playable="true"]').first();
  if (await playable.isVisible().catch(() => false)) {
    await playable.click();
    return true;
  }
  return false;
}

/** Drive one whole challenge round to its result screen.
 *
 * The run does not dump you back on the board any more: the last trick lands
 * on a result card that waits to be read. Returns with that card on screen —
 * callers assert on it, then dismiss it themselves. */
async function playTheHand(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Play the hand' }).click();
  const result = page.getByTestId('deal-result');
  const deadline = Date.now() + 150_000;
  while (Date.now() < deadline) {
    if (await result.isVisible().catch(() => false)) return;
    if (!(await actIfOurTurn(page))) await page.waitForTimeout(200);
  }
  throw new Error('the challenge round never reached its result screen');
}

test('plays the hand of the day, posts the score, and refuses a second run', async ({ page }) => {
  // A real round of bot alarms plus verification.
  test.setTimeout(240_000);

  await page.goto('/#daily');
  await expect(page.getByRole('heading', { name: 'Deal Board' })).toBeVisible();
  // Four deals share the screen: the daily plus the week's three.
  await expect(
    page.getByRole('navigation', { name: 'Deal Board' }).getByRole('button'),
  ).toHaveCount(4);
  // Nobody has played it yet on a fresh local D1.
  const play = page.getByRole('button', { name: 'Play the hand' });
  await expect(play).toBeEnabled();

  await playTheHand(page);

  // The hand ends on a result you get to READ — it used to tear the felt down
  // and drop you beside a greyed-out button before you saw anything.
  const result = page.getByTestId('deal-result');
  // Singular too: the day's deal decides the count, and a 1-trick day is real
  // (2026-07-31 was one — the plural-only pin turned the date into a flake).
  await expect(result).toContainText(/\d+ tricks? taken/);

  // The score came back from the server, not from the client: the outcome line
  // only ever says a number the verifier produced.
  const outcome = page.getByTestId('deal-outcome');
  await expect(outcome).toContainText('You scored');
  await expect(outcome).not.toContainText('could not be verified');

  // Nothing moves until the player says so.
  await page.getByRole('button', { name: 'Back to the board' }).click();
  await expect(result).toHaveCount(0);

  // Your row is on the board, and the board says where you landed.
  await expect(page.getByText(/You’re #\d+/)).toBeVisible();

  // One try. The button says so, and cannot be used.
  const replayed = page.getByRole('button', { name: 'You’ve already played this one.' });
  await expect(replayed).toBeVisible();
  await expect(replayed).toBeDisabled();

  // And it is the SERVER that remembers, not this tab: a reload re-reads the
  // board and finds the same row.
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Deal Board' })).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'You’ve already played this one.' }),
  ).toBeDisabled();
  await expect(page.getByText(/You’re #\d+/)).toBeVisible();
});

test('a brand-new player sees an open board they can still play', async ({ browser }) => {
  // A second identity must not inherit the first one's "already played": the
  // state lives per user in challenge_scores, not per browser or per deal.
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto('/#daily');
  await expect(page.getByRole('heading', { name: 'Deal Board' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Play the hand' })).toBeEnabled();
  await context.close();
});

/**
 * The name card before the first public post.
 *
 * This board is reachable from home without ever entering a room, so it was
 * the one place a never-renamed guest competed publicly having never been
 * asked their name — the lobby's card guards only a fresh pre-game seat pick.
 * The card hides itself under automation (navigator.webdriver) exactly so the
 * rest of this suite still finds "Play the hand" live, which is why every test
 * here opts in explicitly with ?nameprompt=1.
 */
test('asks a nameless player who they are, once, before their first hand', async ({ browser }) => {
  const context = await browser.newContext();
  const page = await context.newPage();

  await page.goto('/?nameprompt=1#daily');
  await page.getByRole('button', { name: 'Play the hand' }).click();

  // Play is gated, not started: the card stands between the tap and the deal.
  const card = page.getByTestId('name-prompt');
  await expect(card).toBeVisible();

  await card.getByRole('textbox').fill('Ginette');
  await card.getByRole('button', { name: 'Save' }).click();

  // Answering starts the hand — the tap is not wasted.
  await expect(page.getByTestId('name-prompt')).toHaveCount(0);

  // One-shot: the answer survives a reload, so nobody is asked twice.
  // reload(), not goto(): the URL including its hash is unchanged, so a goto
  // here is a same-document navigation that never remounts the app.
  await page.reload();
  await page.getByRole('button', { name: 'Play the hand' }).click();
  await expect(page.getByTestId('name-prompt')).toHaveCount(0);

  await context.close();
});

test('"maybe later" still lets a nameless player play', async ({ browser }) => {
  // Skipping must never be a trap — the server disambiguates unnamed guests on
  // its own, so declining costs nothing but the nicer label.
  const context = await browser.newContext();
  const page = await context.newPage();

  await page.goto('/?nameprompt=1#daily');
  await page.getByRole('button', { name: 'Play the hand' }).click();
  await page.getByTestId('name-prompt').getByRole('button', { name: 'Maybe later' }).click();

  await expect(page.getByTestId('name-prompt')).toHaveCount(0);
  // Skipping never touches the help dial: only a tapped chip writes it, and
  // none was tapped (resolveHelpLevel's boot placement is 'learning' on a
  // fresh browser — the inference must survive an unanswered card).
  expect(await page.evaluate(() => localStorage.getItem('jaffre:help'))).toBe('learning');
  await context.close();
});

test('the name card can place the help dial', async ({ browser }) => {
  // The one moment the app ASKS "new or not" instead of inferring it. Chips
  // apply on tap; the second tap wins; Save leaves the answer standing.
  const context = await browser.newContext();
  const page = await context.newPage();

  await page.goto('/?nameprompt=1#daily');
  await page.getByRole('button', { name: 'Play the hand' }).click();
  const card = page.getByTestId('name-prompt');

  await card.getByRole('button', { name: 'I’m new — guide me' }).click();
  expect(await page.evaluate(() => localStorage.getItem('jaffre:help'))).toBe('learning');

  // Changed their mind: the veteran chip wins, and the dial goes quiet.
  await card.getByRole('button', { name: 'I’ve played before' }).click();
  expect(await page.evaluate(() => localStorage.getItem('jaffre:help'))).toBe('off');

  await card.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByTestId('name-prompt')).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem('jaffre:help'))).toBe('off');
  await context.close();
});

test('the weekly deals are their own boards', async ({ page }) => {
  await page.goto('/#daily');
  const tabs = page.getByRole('navigation', { name: 'Deal Board' }).getByRole('button');
  await expect(tabs.first()).toHaveAttribute('aria-current', 'true');

  // Switching to a weekly changes which deal is current — the daily's state
  // (played or not) must not follow you onto a different deal.
  await tabs.nth(1).click();
  await expect(tabs.nth(1)).toHaveAttribute('aria-current', 'true');
  await expect(tabs.first()).not.toHaveAttribute('aria-current', 'true');
  await expect(page.getByRole('button', { name: 'Play the hand' })).toBeEnabled();
});
