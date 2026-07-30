import { expect, test } from '@playwright/test';
import type { BrowserContext, Page } from '@playwright/test';

/**
 * I1 — "Table style: host's" house rule. The host equips a non-default felt
 * (Tavern Wood, a free unlock — same tile cosmetics.spec.ts already pins),
 * turns the rule on, and a SECOND client at that table — not even seated,
 * because ownership gates equipping a cosmetic, never seeing one someone
 * else equipped — picks up the host's felt as a pure VIEW override
 * (`<html data-felt>`), then loses it again the instant they leave the room.
 * The guest's OWN equipped felt (still the default) is never touched: this
 * is the whole point of felt.ts's `overrideFelt` never persisting.
 */

/** A page from a hand-made context: config `use.reducedMotion` doesn't reach
 * these, and without it the attract-mode takeover can swallow an idle page. */
async function newPage(context: BrowserContext): Promise<Page> {
  const page = await context.newPage();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  return page;
}

test("the host's table-style rule shows a second client the host's felt, and restores their own on leaving", async ({
  browser,
}) => {
  const contextA = await browser.newContext();
  const contextB = await browser.newContext();
  await contextA.addInitScript(() => localStorage.setItem('jaffre-name', 'Host-A'));
  await contextB.addInitScript(() => localStorage.setItem('jaffre-name', 'Guest-B'));
  const a = await newPage(contextA);
  const b = await newPage(contextB);

  // A equips a non-default felt BEFORE hosting — currentFelt() at socket-open
  // time is what rides the join message (see net/socket.ts).
  await a.goto('/#collection');
  await expect(a.getByRole('heading', { name: 'Collection' })).toBeVisible();
  await a.getByTestId('cosmetic-tile-tavern').click();
  await expect(a.locator('html')).toHaveAttribute('data-felt', 'tavern');

  // A hosts a public table and sits.
  await a.goto('/');
  await a.getByRole('button', { name: 'Play', exact: true }).click();
  await a.getByRole('button', { name: 'Host a public table' }).click();
  await expect.poll(() => a.evaluate(() => location.hash)).toMatch(/^#room\//);
  const code = await a.evaluate(() => location.hash.replace('#room/', ''));
  await a.getByRole('button', { name: 'Sit here' }).first().click();
  await expect(a.getByTestId('seat-row-0')).toContainText(/\(you\)/i);
  // Still A's own equip, now at the table too — the felt axis is independent
  // of being seated or not.
  await expect(a.locator('html')).toHaveAttribute('data-felt', 'tavern');

  // A (the host) turns the table-style rule on, in the rules disclosure.
  await a.getByText('House rules', { exact: true }).click();
  const hostToggle = a.getByTestId('table-style-toggle');
  await expect(hostToggle).toBeEnabled();
  // click(), not check(): every rule switch is CONTROLLED by the roster echo,
  // so it flips a server round-trip after the click. check() asserts the new
  // state the instant it clicks and fails on anything that isn't local.
  await hostToggle.click();
  await expect(hostToggle).toBeChecked();

  // B arrives at the SAME table — not seated, just present (a spectator on
  // the pre-game lobby is still "at the table" for I1's purposes). B's own
  // felt is the default (no attribute) before joining.
  const htmlB = b.locator('html');
  await expect(htmlB).not.toHaveAttribute('data-felt', /.*/);
  await b.goto(`/#room/${code}`);

  // B's view picks up the HOST's felt — a pure override, B never equipped
  // Tavern Wood themselves.
  await expect(htmlB).toHaveAttribute('data-felt', 'tavern');

  // B's rules disclosure auto-opens (a non-default rule is never invisible) —
  // no click needed, unlike A's above (whose room had nothing non-default to
  // auto-open FOR until she flipped it). The toggle is visible but disabled:
  // only the host may flip it.
  await expect(b.getByTestId('table-style-toggle')).toBeChecked();
  await expect(b.getByTestId('table-style-toggle')).toBeDisabled();

  // B leaves the room (Home). Their own felt — never persisted over by the
  // override — is restored the instant the room's roster is gone.
  await b.getByRole('button', { name: '← Home' }).click();
  await expect.poll(() => b.evaluate(() => location.hash)).toBe('');
  await expect(htmlB).not.toHaveAttribute('data-felt', /.*/);

  await contextA.close();
  await contextB.close();
});
