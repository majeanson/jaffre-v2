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
