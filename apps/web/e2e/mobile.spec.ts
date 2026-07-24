import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';

/**
 * Small-screen layout: an iPhone 13-sized touch viewport must show the whole
 * practice table with no horizontal scroll, a tappable 8-card fan (>=40px
 * exposed strip per card), a bid panel that fits, and the score strip in the
 * initial viewport.
 */

test.use({
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
  deviceScaleFactor: 3,
});

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

async function boxOf(locator: Locator): Promise<Box> {
  const box = await locator.boundingBox();
  if (box === null) throw new Error(`No bounding box for ${String(locator)}`);
  return box;
}

async function expectNoHorizontalScroll(page: Page): Promise<void> {
  const overflow = await page.evaluate(() => ({
    scrollWidth: document.scrollingElement?.scrollWidth ?? 0,
    innerWidth: window.innerWidth,
  }));
  expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.innerWidth);
}

test('practice table is playable on a 390px phone', async ({ page }) => {
  test.setTimeout(150_000);
  await page.goto('/#practice');

  const hand = page.getByRole('listbox', { name: 'Your hand' });
  await expect(hand).toBeVisible();
  // The bid panel stays up for the whole auction; wait for OUR turn (Pass
  // enabled) so the tap below actually commits a pass.
  const pass = page.getByRole('button', { name: 'Pass' });
  await expect(pass).toBeEnabled({ timeout: 45_000 });

  // (a) No horizontal page scroll mid-bidding.
  await expectNoHorizontalScroll(page);

  // (d) Score strip fully inside the initial viewport, no scrolling needed.
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
  const strip = page.getByTestId('score-strip');
  await expect(strip).toBeVisible();
  const stripBox = await boxOf(strip);
  expect(stripBox.y).toBeGreaterThanOrEqual(0);
  expect(stripBox.y + stripBox.height).toBeLessThanOrEqual(844);
  expect(stripBox.x).toBeGreaterThanOrEqual(0);
  expect(stripBox.x + stripBox.width).toBeLessThanOrEqual(390);

  // (b) The 8-card fan fits and every card keeps a >=40px touch target:
  // full height, and at least 40px of exposed width before the next card.
  const options = hand.locator('[role="option"]');
  await expect(options).toHaveCount(8);
  const boxes: Box[] = [];
  for (let i = 0; i < 8; i++) {
    boxes.push(await boxOf(options.nth(i)));
  }
  for (const box of boxes) {
    expect(box.height).toBeGreaterThanOrEqual(40);
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(390);
  }
  for (let i = 0; i < boxes.length - 1; i++) {
    const current = boxes[i];
    const next = boxes[i + 1];
    if (current === undefined || next === undefined) throw new Error('missing card box');
    expect(next.x - current.x).toBeGreaterThanOrEqual(40);
  }

  // (c) The bid panel fits the viewport and Pass is tappable.
  const bidGroup = page.getByRole('group', { name: 'Bid cards' });
  const groupBox = await boxOf(bidGroup);
  expect(groupBox.x).toBeGreaterThanOrEqual(0);
  expect(groupBox.x + groupBox.width).toBeLessThanOrEqual(390);
  const passBox = await boxOf(pass);
  expect(passBox.height).toBeGreaterThanOrEqual(40);
  await pass.tap();
  // Our pass registered: the panel either locks (bots still bidding) or
  // unmounts (auction done) — either way Pass is no longer enabled.
  await expect.poll(async () => (await pass.isVisible()) && (await pass.isEnabled())).toBe(false);

  // (b, continued) When it's our turn to play, a card can be played by tap.
  // The auction may come back to us; keep tapping Pass until play begins.
  const playable = hand.locator('[role="option"][data-playable="true"]');
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline && (await playable.count()) === 0) {
    if ((await pass.isVisible()) && (await pass.isEnabled())) {
      await pass.tap({ timeout: 2000 }).catch(() => {});
    }
    await page.waitForTimeout(250);
  }
  // Tap inside the card's exposed left strip (later cards overlap the right).
  await expect(playable.first()).toBeVisible();
  const before = await options.count();
  await playable.first().tap({ position: { x: 18, y: 60 } });
  await expect(options).toHaveCount(before - 1);

  // Still no horizontal scroll while cards animate through the trick area.
  await expectNoHorizontalScroll(page);
});
