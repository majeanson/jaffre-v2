import { expect, test } from '@playwright/test';

/**
 * The replay viewer is stateful UI (not a static scene), so drive it: the
 * frame counter advances on Next, the scrubber jumps, and "View as" re-redacts
 * without leaving the replay. Uses the demo replay staged by #scenes/replay.
 */
test('replay viewer steps through frames', async ({ page }) => {
  await page.goto('/#scenes/replay');
  const controls = page.getByTestId('replay-controls');
  await expect(controls).toBeVisible();

  const counter = page.getByTestId('replay-frame');
  await expect(counter).toHaveText(/^1 \/ \d+$/);

  await page.getByRole('button', { name: 'Next frame' }).click();
  await expect(counter).toHaveText(/^2 \/ \d+$/);

  await page.getByRole('button', { name: 'Previous frame' }).click();
  await expect(counter).toHaveText(/^1 \/ \d+$/);

  // Switching the viewer seat keeps you in the replay (controls stay mounted).
  await page.getByLabel('View as').selectOption('2');
  await expect(controls).toBeVisible();
  await expect(counter).toHaveText(/ \/ \d+$/);
});

/**
 * Wave 2c: the compact header (E1), the per-frame label (E2), round jump
 * (E2), keyboard stepping/play-pause (E2), the speed toggle (E2) and the
 * surfaced Coach toggle (E4). DEMO_REPLAY (dev/scenes.ts) now carries
 * roomCode/finishedAt/winnerTeam/scores from the SAME seeded game
 * replay.spec.ts already exercises above.
 */
test('replay header, per-frame label, round jump, keyboard and speed controls', async ({
  page,
}) => {
  await page.goto('/#scenes/replay');
  await expect(page.getByTestId('replay-controls')).toBeVisible();

  // E1: "Room X · date · 41–33" — same D1 row /api/history lists from.
  await expect(page.getByTestId('replay-header')).toContainText('Room salon');
  await expect(page.getByTestId('replay-header')).toHaveText(/\d+–\d+$/);

  // E2: the label sits near the counter — frame 0 is always buildFrames.ts's "Deal".
  await expect(page.getByTestId('replay-label')).toHaveText('Deal');

  // Round jump: next lands on the next "New round" frame, previous returns to the deal.
  await page.getByRole('button', { name: 'Next round' }).click();
  await expect(page.getByTestId('replay-label')).toHaveText('New round');
  await page.getByRole('button', { name: 'Previous round' }).click();
  await expect(page.getByTestId('replay-label')).toHaveText('Deal');

  // Keyboard: → / ← step a frame; space plays/pauses.
  await page.keyboard.press('ArrowRight');
  await expect(page.getByTestId('replay-frame')).toHaveText(/^2 \/ \d+$/);
  await page.keyboard.press('ArrowLeft');
  await expect(page.getByTestId('replay-frame')).toHaveText(/^1 \/ \d+$/);
  await page.keyboard.press(' ');
  await expect(page.getByRole('button', { name: 'Pause' })).toBeVisible();
  await page.keyboard.press(' ');
  // exact: the bar also holds "How to play", "Playback speed…" and "Coach —
  // …plays" — a bare substring match resolves to all four.
  await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeVisible();

  // Speed: 1× → 2× → 1×, through paced() (see Replay.tsx's STEP_MS comment).
  const speedBtn = page.getByRole('button', { name: /Playback speed/ });
  await expect(speedBtn).toHaveText('1×');
  await speedBtn.click();
  await expect(speedBtn).toHaveText('2×');
  await speedBtn.click();
  await expect(speedBtn).toHaveText('1×');
});

test('the Coach toggle is reachable straight from the replay control bar', async ({ page }) => {
  await page.goto('/#scenes/replay');
  // Reachable without opening the felt's Options drawer first — that's the
  // whole point of E4 (the Coach used to work here but was two taps deep).
  const coachBtn = page.getByRole('button', { name: /Coach —/ });
  await expect(coachBtn).toBeVisible();
  const before = await coachBtn.getAttribute('aria-pressed');
  await coachBtn.click();
  await expect(coachBtn).toHaveAttribute('aria-pressed', before === 'true' ? 'false' : 'true');
});

test('replay nameplates show the real player names from the stored game', async ({ page }) => {
  // Phase 1 (workstream B): replays carry the game's players, so the table
  // shows who actually sat where — DEMO_REPLAY stages Marcel/Ginette/Réal.
  await page.goto('/#scenes/replay');
  await expect(page.getByTestId('replay-controls')).toBeVisible();
  for (const name of ['Marcel', 'Ginette', 'Réal']) {
    // Nameplates render the name twice (an sr-only copy + the visible one),
    // so filter to the visible occurrence.
    await expect(
      page.getByText(name, { exact: true }).filter({ visible: true }).first(),
    ).toBeVisible();
  }
});
