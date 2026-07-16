import { expect, test } from '@playwright/test';
import { SCENE_METAS } from '../src/dev/sceneManifest.js';
import { expectNoSeriousViolations } from './axe.js';

/**
 * The whole visual surface, without playing a single card: every scene in the
 * catalog is deep-linked (#scenes/<id>), its declared probe element must be
 * visible (and its `absent` locator hidden), and axe must find no serious
 * violations. Purely client-side — staged engine states, no bot timers.
 */

for (const scene of SCENE_METAS) {
  test(`scene: ${scene.id} (${scene.label})`, async ({ page }) => {
    await page.goto(`/#scenes/${scene.id}`);
    await expect(page.locator(scene.probe).first()).toBeVisible();
    if (scene.absent !== undefined) {
      await expect(page.locator(scene.absent)).toBeHidden();
    }
    await expectNoSeriousViolations(page, `scene ${scene.id}`);
  });
}

test('help sheet overlays the viewport (fixed positioning not captured by animations)', async ({
  page,
}) => {
  // Regression: rise-in/pop-in used to retain a transform after finishing,
  // turning the animated wrapper into the containing block for the fixed
  // help sheet — it rendered mid-page and stretched the document.
  await page.goto('/#scenes/home-help');
  const dialog = page.getByRole('dialog', { name: 'How to play' });
  await expect(dialog).toBeVisible();
  const overlay = await dialog.evaluate((el) => {
    const scrim = el.parentElement;
    if (scrim === null) return null;
    const r = scrim.getBoundingClientRect();
    return { top: r.top, left: r.left, width: r.width, height: r.height };
  });
  const viewport = page.viewportSize();
  if (overlay === null || viewport === null) throw new Error('missing overlay or viewport');
  expect(overlay.top).toBe(0);
  expect(overlay.left).toBe(0);
  expect(overlay.width).toBe(viewport.width);
  expect(overlay.height).toBe(viewport.height);
});

test('home fits a phone viewport — no primary control clipped', async ({ page }) => {
  // Regression: the play grid had no base grid-cols-1, so below `sm` its single
  // implicit column sized to its content and grew past `w-full`. main's
  // overflow-x-clip then hid the overflow with no scrollbar — silently cutting
  // the "Join room" button off the right edge. A document scrollWidth check
  // can't see this (clip == no scroll); assert the controls fit instead.
  const width = 390;
  await page.setViewportSize({ width, height: 844 });
  await page.goto('/#scenes/home');
  await expect(page.getByRole('heading', { name: 'Jaffre' })).toBeVisible();

  const fits = async (box: { x: number; width: number } | null, what: string) => {
    if (box === null) throw new Error(`missing ${what}`);
    expect(box.x, `${what} left edge`).toBeGreaterThanOrEqual(-0.5);
    expect(box.x + box.width, `${what} right edge`).toBeLessThanOrEqual(width + 0.5);
  };

  await fits(await page.getByRole('region', { name: 'Play' }).boundingBox(), 'Play panel');
  await fits(await page.getByRole('button', { name: 'Create a room' }).boundingBox(), 'Create a room');
  await fits(await page.getByRole('button', { name: 'Join room' }).boundingBox(), 'Join room');
});

test('scene picker: hash is the source of truth, unknown ids fall back', async ({ page }) => {
  const last = SCENE_METAS[SCENE_METAS.length - 1];
  const first = SCENE_METAS[0];
  if (last === undefined || first === undefined) throw new Error('empty scene catalog');

  await page.goto(`/#scenes/${last.id}`);
  const picker = page.getByLabel('Scene', { exact: true });
  await expect(picker).toHaveValue(last.id);

  // Next wraps around to the first scene — and writes it to the hash.
  await page.getByRole('button', { name: 'Next scene' }).click();
  await expect(picker).toHaveValue(first.id);
  expect(new URL(page.url()).hash).toBe(`#scenes/${first.id}`);

  // Unknown id falls back to the first scene instead of a blank screen.
  await page.goto('/#scenes/not-a-scene');
  await expect(page.locator(first.probe).first()).toBeVisible();
});
