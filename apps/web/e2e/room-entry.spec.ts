import { expect, test } from '@playwright/test';

/**
 * A room always opens on the seat picker — never on the game you were just in.
 *
 * Practice, the daily deal and the replay viewer all publish through the same
 * game store as an online room, and their roster says `started: true`. Entering
 * a room straight afterwards used to render one frame from that leftover state:
 * the felt table flashed up ("game in progress") until the socket's welcome
 * arrived a beat later and the seat picker replaced it.
 *
 * The room socket here is intercepted and left silent — no welcome ever lands —
 * so what the room screen shows is exactly what it renders from local state.
 * Before the fix that was the practice table, forever.
 */
test('a room entered right after a practice game opens on the seat picker', async ({ page }) => {
  // Mocked and never connected upstream: the client sees an open socket that
  // says nothing. (The lobby feed at /api/rooms/ws has no trailing segment, so
  // this pattern leaves it alone.)
  await page.routeWebSocket(/\/ws\/[^/]+/, () => {
    /* silence */
  });

  await page.goto('/#practice');
  await expect(page.getByRole('listbox', { name: 'Your hand' })).toBeVisible();

  // The same navigation Quick Play performs once it has a code.
  await page.evaluate(() => {
    location.hash = '#room/flash-guard';
  });

  await expect(page.getByTestId('visibility-pill')).toBeVisible();
  await expect(page.getByRole('listbox', { name: 'Your hand' })).toHaveCount(0);
});
