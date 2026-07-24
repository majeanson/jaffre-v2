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

test('tapping your card in the hero fan opens the Paint Studio', async ({ page }) => {
  await page.goto('/#scenes/home');
  await page.getByRole('button', { name: 'Your card — tap to paint it' }).click();
  // The card tap now routes to #paint — the pixel-grid editor is the studio's probe.
  await expect(page.locator('[data-testid="pixel-grid"]')).toBeVisible();
});

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

test('advanced strategy: five themed sections inside the disclosure', async ({ page }) => {
  await page.goto('/#scenes/home-help');
  const dialog = page.getByRole('dialog', { name: 'How to play' });
  await expect(dialog).toBeVisible();

  await dialog.getByText('Advanced strategy').click();
  for (const section of [
    'Bidding & hand reading',
    'The two bonhommes (red 0 & brown 0)',
    'Declarer play',
    'Defense & inference',
    'Playing to 41',
  ]) {
    await expect(dialog.getByText(section, { exact: true })).toBeVisible();
  }

  // Tips live inside their section's own disclosure.
  await dialog.getByText('Declarer play', { exact: true }).click();
  await expect(dialog.getByText('Win with the lowest of equals.')).toBeVisible();

  await expectNoSeriousViolations(page, 'advanced strategy open');
});

test('glossary: color-family entries with wiki cross-links', async ({ page }) => {
  await page.goto('/#scenes/home-help');
  const dialog = page.getByRole('dialog', { name: 'How to play' });
  await expect(dialog).toBeVisible();

  // Inline wiki term: clicking a colored term pops the mini card in place —
  // the reader keeps their spot; nothing scrolls away.
  await dialog.getByRole('button', { name: 'trump suit' }).click();
  const pop = dialog.locator('#gloss-pop');
  await expect(pop.getByText('Trump (atout)')).toBeVisible();

  // See-also inside the popup hops wiki-style without moving the anchor.
  await pop.getByRole('button', { name: 'Ruff (coupe)' }).click();
  await expect(pop.getByText('Ruff (coupe)', { exact: true })).toBeVisible();

  // First Escape dismisses only the popup; the sheet stays open.
  await page.keyboard.press('Escape');
  await expect(pop).toBeHidden();
  await expect(dialog).toBeVisible();

  // The full glossary section still lists every entry with its definition.
  await dialog.getByText('Glossary', { exact: true }).click();
  await expect(dialog.locator('#gloss-red0').getByText('The red 0 (joffre)')).toBeVisible();
  await expect(dialog.getByText(/The \+5 bonhomme/)).toBeVisible();

  // A see-also link inside a section entry opens the popup too.
  await dialog.locator('#gloss-red0').getByRole('button', { name: 'Boss card (maître)' }).click();
  await expect(pop.getByText('Boss card (maître)')).toBeVisible();

  await expectNoSeriousViolations(page, 'glossary open');
});

test('avatar peek opens two sections: the player and the current game', async ({ page }) => {
  // A mid-trick table has a decided contract and trump, so the game section
  // shows real values (not the "no bet / undecided" auction placeholders).
  await page.goto('/#scenes/mid-trick');
  await page
    .getByRole('button', { name: /Show .*info/ })
    .first()
    .click();

  const peek = page.getByRole('dialog');
  await expect(peek).toBeVisible();

  // Section 1 — the player: identity, a live-role badge, connection.
  await expect(peek.getByText('Player', { exact: true })).toBeVisible();
  await expect(peek.getByText('Connected')).toBeVisible();

  // Section 2 — the current game: round, score race, bet, trump, tricks.
  await expect(peek.getByText('This game', { exact: true })).toBeVisible();
  await expect(peek.getByText(/^Round \d+$/)).toBeVisible();
  await expect(peek.getByText('Score', { exact: true })).toBeVisible();
  await expect(peek.getByText(/first to \d+/)).toBeVisible();
  await expect(peek.getByText('Bet', { exact: true })).toBeVisible();
  await expect(peek.getByText('Trump', { exact: true })).toBeVisible();
  await expect(peek.getByText('Tricks', { exact: true })).toBeVisible();

  await expectNoSeriousViolations(page, 'avatar peek open');
});

/**
 * Overflow guard across every media width: phone → large phone → tablet → the
 * `lg` two-column breakpoint → wide desktop. The title screen's `main` clips
 * horizontal overflow (`overflow-x-clip`), so a runaway control is hidden with
 * NO scrollbar — a document scrollWidth check can't see it. We assert the real
 * controls fit their container instead. Widths straddle every Tailwind
 * breakpoint the home layout responds to (sm 640, lg 1024).
 */
const MEDIA_WIDTHS = [360, 390, 414, 768, 820, 1024, 1280, 1440] as const;

const fitsWithin = (
  child: { x: number; width: number } | null,
  right: number,
  left: number,
  what: string,
  width: number,
) => {
  if (child === null) throw new Error(`missing ${what} @${String(width)}px`);
  expect(child.x, `${what} left edge @${String(width)}px`).toBeGreaterThanOrEqual(left - 0.5);
  expect(child.x + child.width, `${what} right edge @${String(width)}px`).toBeLessThanOrEqual(
    right + 0.5,
  );
};

for (const width of MEDIA_WIDTHS) {
  test(`home play controls fit the viewport at ${String(width)}px`, async ({ page }) => {
    // Regression: the play grid had no base grid-cols-1, so below `sm` its
    // single implicit column sized to its content and grew past `w-full`,
    // clipping "Join room" off the right edge. Also the French "Joindre le
    // salon" label used to squish the code input to a sliver in a side-by-side
    // row (now stacked).
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/#scenes/home');
    await expect(page.getByRole('heading', { name: 'Jaffre' })).toBeVisible();

    await fitsWithin(
      await page.getByRole('region', { name: 'Play', exact: true }).boundingBox(),
      width,
      0,
      'Play panel',
      width,
    );

    // The bots/friends split hides behind the single PLAY door, split further
    // into the create and join steps — check each via its own staged scene.
    await page.goto('/#scenes/home-create');
    for (const [name, what] of [
      ['Public table', 'Public table'],
      ['Play now', 'Play now'],
    ] as const) {
      await fitsWithin(
        await page.getByRole('button', { name }).boundingBox(),
        width,
        0,
        what,
        width,
      );
    }

    await page.goto('/#scenes/home-join');
    await fitsWithin(
      await page.getByRole('button', { name: 'Join room' }).boundingBox(),
      width,
      0,
      'Join room',
      width,
    );
    await fitsWithin(
      await page.getByRole('textbox', { name: 'Room code' }).boundingBox(),
      width,
      0,
      'Room code input',
      width,
    );
  });

  test(`your-tables card controls stay inside their card at ${String(width)}px`, async ({
    page,
  }) => {
    // Regression: at the `lg` breakpoint the two-column console shrinks each
    // table card to ~200px, and a Resume + ✕ button row (Resume already at its
    // text min-width, ✕ shrink-0) spilled the ✕ past the card edge. The ✕ now
    // lives in the card header corner and Resume is full-width.
    await page.setViewportSize({ width, height: 1200 });
    await page.goto('/#scenes/your-tables');
    await expect(page.getByTestId('table-card').first()).toBeVisible();

    const overflows = await page.evaluate(() => {
      const TOL = 0.5;
      const out: string[] = [];
      for (const card of document.querySelectorAll('[data-testid="table-card"]')) {
        const cb = card.getBoundingClientRect();
        for (const control of card.querySelectorAll('button, input, a')) {
          const r = control.getBoundingClientRect();
          if (r.width === 0 || r.height === 0) continue;
          if (r.left < cb.left - TOL || r.right > cb.right + TOL) {
            const label = (control.getAttribute('aria-label') ?? control.textContent ?? '')
              .trim()
              .slice(0, 24);
            out.push(
              `"${label}" [${String(Math.round(r.left))}→${String(Math.round(r.right))}] ` +
                `escapes card [${String(Math.round(cb.left))}→${String(Math.round(cb.right))}]`,
            );
          }
        }
      }
      return out;
    });
    expect(overflows, `controls overflowing their card at ${String(width)}px`).toEqual([]);
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
