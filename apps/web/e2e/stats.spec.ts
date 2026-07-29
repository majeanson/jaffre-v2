import { expect, test } from '@playwright/test';

/**
 * "Your record" (Phase 1, workstream B): the #stats route works against the
 * real server (a fresh identity sees the empty state), Home links to it, and
 * the populated rendering is checked via the deterministic staged scene —
 * driving a full game to game_over in e2e is minutes of bot alarms, so the
 * data-in aggregation is covered by the server unit tests instead. The
 * standalone History screen is gone — its games list now lives inside Your
 * record behind a Recent | All toggle, and #history soft-redirects here.
 */

test('#stats renders Your record with the fresh-identity empty state', async ({ browser }) => {
  const context = await browser.newContext(); // fresh localStorage → fresh uid
  const page = await context.newPage();
  await page.goto('/#stats');
  await expect(page.getByRole('heading', { name: 'Your record' })).toBeVisible();
  // A brand-new identity has no finished games: loading resolves to empty.
  await expect(page.getByText('No games yet')).toBeVisible();
  await context.close();
});

test('home links to Your record via the Journey door', async ({ page }) => {
  await page.goto('/');
  // The LevelBadge is the Journey door on Home; the meta-nav strip there links
  // on to every other corner screen, including the record.
  await page.getByTestId('level-badge').click();
  await page.getByRole('link', { name: 'Your record' }).click();
  await expect(page.getByRole('heading', { name: 'Your record' })).toBeVisible();
  expect(new URL(page.url()).hash).toBe('#stats');
});

test('staged stats scene shows the full aggregate record', async ({ page }) => {
  // DEMO_STATS in src/dev/scenes.ts: 9 wins / 14 games (64%), net +180, best
  // streak 5, 4-of-6 contracts (67%) / 1-of-2 sans atout, best partner Ginette
  // (4 wins in 6), nemesis Marcel (beats you 5 of 8).
  await page.goto('/#scenes/stats');
  await expect(page.getByRole('heading', { name: 'Your record' })).toBeVisible();
  // Hero: win rate + "N won" badge.
  await expect(page.getByText('64%')).toBeVisible();
  await expect(page.getByText('9 won')).toBeVisible();
  // Headline numbers: net points + best streak.
  await expect(page.getByText('+180')).toBeVisible();
  await expect(page.getByText('net points')).toBeVisible();
  await expect(page.getByText('best streak')).toBeVisible();
  // Bid accuracy — one headline % over the striped bar.
  await expect(page.getByText('Bid accuracy')).toBeVisible();
  await expect(page.getByText(/You make the contract 4 of 6/)).toBeVisible();
  // Social facts: best partner + nemesis. AvatarChip carries an sr-only copy of
  // the name, so scope the name check to the visible label (strict-mode safe).
  await expect(page.getByTestId('best-partner-name')).toHaveText('Ginette');
  await expect(page.getByText('4 wins in 6 games')).toBeVisible();
  await expect(page.getByTestId('nemesis-name')).toHaveText('Marcel');
  await expect(page.getByText('beats you 5 of 8')).toBeVisible();
});

test('the games section toggles Recent | All', async ({ page }) => {
  await page.goto('/#scenes/stats');
  await expect(page.getByText('Your games')).toBeVisible();
  // Recent is the default view — a ruled scorepad table.
  await expect(page.locator('table')).toBeVisible();
  await page.getByRole('button', { name: 'All' }).click();
  await expect(page.locator('a[href="#replay/demo-1"]')).toContainText('Won');
  await page.getByRole('button', { name: 'Recent' }).click();
  await expect(page.locator('table')).toBeVisible();
});

test('#history redirects into Your record', async ({ page }) => {
  await page.goto('/#history');
  await expect(page.getByRole('heading', { name: 'Your record' })).toBeVisible();
});

/**
 * Suit mastery: five lanes, always all five, whether or not you have ever
 * called them. The panel is the only place the game says what it thinks your
 * game LOOKS like, so the shape is the assertion — a panel that quietly
 * dropped a lane, or filled one that was never bid, would still be a
 * plausible-looking panel.
 */
test('the mastery panel shows all five lanes, and says so when none are called', async ({
  page,
}) => {
  // stats-new: a real record (2 games) with no contract ever taken — the state
  // the empty copy exists for.
  await page.goto('/#scenes/stats-new');
  const panel = page.getByTestId('mastery-panel');
  await expect(panel).toBeVisible();
  // Four suits and sans-atout.
  await expect(panel.locator('li')).toHaveCount(5);
  await expect(panel).toContainText("You haven't taken a contract yet");
  // Nothing claimed: every lane reads as never called.
  await expect(panel.getByText('never called')).toHaveCount(5);
});

test('a played record fills the mastery lanes it earned', async ({ page }) => {
  await page.goto('/#scenes/stats');
  const panel = page.getByTestId('mastery-panel');
  await expect(panel).toBeVisible();
  await expect(panel.locator('li')).toHaveCount(5);
  // Some lane has been called, so the empty-state line is gone.
  await expect(panel).not.toContainText("You haven't taken a contract yet");
});

test('a player with no games at all sees no mastery panel', async ({ browser }) => {
  // The panel lives inside the "you have a record" branch: five empty bars is
  // not a welcome, it is a report on nothing.
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto('/#stats');
  await expect(page.getByText('No games yet')).toBeVisible();
  await expect(page.getByTestId('mastery-panel')).toHaveCount(0);
  await context.close();
});
