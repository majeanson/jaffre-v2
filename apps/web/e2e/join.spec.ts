import { expect, test } from '@playwright/test';

/**
 * The /join/<code> share link, end to end against the real wrangler stack:
 * the Worker serves the SPA shell with live OG tags plus a replaceState boot
 * script (apps/server/src/routes/join.ts), and the browser lands in the room
 * at /#room/<code> — including from mixed-case links, which the hash route
 * also tolerates directly.
 */

test('the worker serves /join/<code> with live tags and the boot script', async ({ request }) => {
  const room = `e2e-jn-${Math.random().toString(36).slice(2, 10)}`;
  const res = await request.get(`/join/${room}`);
  expect(res.status()).toBe(200);
  expect(res.headers()['cache-control']).toBe('public, max-age=60');
  const body = await res.text();
  // A virgin room: generic title, truthful zero-count description.
  expect(body).toContain('<title>Join my Jaffre table</title>');
  expect(body).toContain('property="og:title" content="Join my Jaffre table"');
  expect(body).toContain('0 of 4 seats taken');
  expect(body).toContain(`history.replaceState(null,"","/#room/${room}")`);
});

test('a mixed-case /join link lands seated-picker-ready in the room', async ({ page }) => {
  const tail = Math.random().toString(36).slice(2, 8);
  await page.goto(`/join/E2E-Mixed-${tail}`);
  // The injected script rewrote the address before the app booted.
  await expect(page).toHaveURL(new RegExp(`/#room/e2e-mixed-${tail}$`));
  await expect(page.getByRole('heading', { name: `Room e2e-mixed-${tail}` })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Sit here' }).first()).toBeVisible();
});

test('a mixed-case #room hash no longer dead-ends on the bad-link notice', async ({ page }) => {
  const tail = Math.random().toString(36).slice(2, 8);
  await page.goto(`/#room/E2E-CAPS-${tail}`);
  await expect(page.getByRole('heading', { name: `Room e2e-caps-${tail}` })).toBeVisible();
});

test('the unfurl tells the truth once someone sits', async ({ page, request }) => {
  const room = `e2e-jt-${Math.random().toString(36).slice(2, 8)}`;
  await page.goto(`/#room/${room}`);
  await page.getByRole('button', { name: 'Sit here' }).first().click();
  // The seat echo renders the occupied seat before the peek can see it.
  await expect(page.getByTestId('seat-row-0')).not.toContainText('Sit here');

  const res = await request.get(`/join/${room}`);
  const body = await res.text();
  expect(body).toContain('1 of 4 seats taken');
  expect(body).toContain('1 siège sur 4');
});
