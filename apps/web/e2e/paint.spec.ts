import { expect, test, type Locator } from '@playwright/test';

/**
 * The Paint Studio (#paint): the pixel-grid avatar editor. Drawing on the grid,
 * filling, undoing, and picking a template all mutate one grid that saves to a
 * `data:image/svg+xml` string; after saving, that pixel avatar shows on Home.
 * A legacy (non-pixel) paint offers an import-or-start-fresh choice.
 */

/** Click the centre of grid cell (cx, cy) on the 16×16 pixel grid. */
async function paintCell(grid: Locator, cx: number, cy: number): Promise<void> {
  const box = await grid.boundingBox();
  if (box === null) throw new Error('pixel grid has no box');
  const cell = box.width / 16;
  await grid.click({ position: { x: cx * cell + cell / 2, y: cy * cell + cell / 2 } });
}

test('draw a pixel, save, and see it on Home', async ({ page }) => {
  await page.goto('/#paint');
  const grid = page.getByTestId('pixel-grid');
  await expect(grid).toBeVisible();

  // Pencil is the default tool — paint a couple of cells.
  await paintCell(grid, 8, 8);
  await paintCell(grid, 9, 8);

  await page.getByTestId('paint-save').click();

  // Back on Home, the profile holds a pixel-SVG paint...
  await expect(page.getByRole('heading', { name: 'Jaffre' })).toBeVisible();
  const paint = await page.evaluate(
    () => (JSON.parse(localStorage.getItem('jaffre-profile') ?? '{}') as { paint?: string }).paint,
  );
  expect(paint).toMatch(/^data:image\/svg\+xml,/);
  expect(paint).toContain('%3Crect'); // at least one painted run

  // ...and that avatar renders as an <img> somewhere on the page.
  await expect(page.locator('img[src^="data:image/svg+xml"]').first()).toBeVisible();
});

test('fill, undo, and templates are undoable edits', async ({ page }) => {
  await page.goto('/#paint');
  const grid = page.getByTestId('pixel-grid');
  await expect(grid).toBeVisible();

  // Undo starts disabled (nothing to undo yet).
  await expect(page.getByTestId('tool-undo')).toBeDisabled();

  // A template load is one undoable edit.
  await page.getByTestId('template-heart').click();
  await expect(page.getByTestId('tool-undo')).toBeEnabled();

  // Fill the canvas, then undo back to the template.
  await page.getByTestId('tool-fill').click();
  await paintCell(grid, 0, 0);
  await page.getByTestId('tool-undo').click();
  await page.getByTestId('tool-undo').click();
  await expect(page.getByTestId('tool-undo')).toBeDisabled();
  await expect(page.getByTestId('tool-redo')).toBeEnabled();
});

test('leaving with unsaved changes asks before discarding', async ({ page }) => {
  await page.goto('/#paint');
  const grid = page.getByTestId('pixel-grid');
  await expect(grid).toBeVisible();
  await paintCell(grid, 4, 4);

  await page.getByRole('button', { name: 'Back' }).click();
  // A confirm appears instead of leaving immediately.
  await expect(page.getByRole('button', { name: 'Keep editing' })).toBeVisible();
  await page.getByRole('button', { name: 'Keep editing' }).click();
  await expect(grid).toBeVisible();
});

test('a legacy (non-pixel) paint offers to import or start fresh', async ({ page }) => {
  // Seed a legacy PNG paint before the app boots.
  await page.addInitScript(() => {
    localStorage.setItem(
      'jaffre-profile',
      JSON.stringify({
        color: '#7a6ff0',
        paint:
          'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
        cardSkin: null,
        theme: null,
      }),
    );
  });
  await page.goto('/#paint');
  await expect(page.getByTestId('pixel-grid')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Start fresh' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Import it' })).toBeVisible();

  // Dismissing leaves a usable blank editor.
  await page.getByRole('button', { name: 'Start fresh' }).click();
  await expect(page.getByRole('button', { name: 'Import it' })).toBeHidden();
});
