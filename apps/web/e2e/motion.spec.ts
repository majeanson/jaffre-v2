import { expect, test, type Page } from '@playwright/test';

/**
 * MOTION — the only spec that runs with animations switched on.
 *
 * The rest of the suite runs under `reducedMotion: 'reduce'`, which makes
 * JaffreMotionConfig zero every framer-motion transition. That is what keeps
 * axe and the screenshot sweep deterministic, but it also meant nothing had
 * ever watched the app MOVE: a sweep preview that rendered no cards, a felt
 * swatch collapsed to a 4px sliver, and a cosmetic that animated exactly like
 * the default one all looked identical to working code. Every one of those
 * shipped. Unit tests can check the numbers a variant returns; only a real
 * browser with motion enabled can check that the pixels follow them.
 *
 * So this file asserts on OBSERVED motion — sampled transforms and opacities
 * over time — and lives in its own Playwright project (`chromium-motion` in
 * playwright.config.ts), scoped by testMatch to this file alone.
 */

/** One rAF sample of one animated card. */
interface CardSample {
  readonly opacity: number;
  readonly transform: string;
}

/** All cards of one tile at one instant, timestamped from the sample start. */
interface Frame {
  readonly t: number;
  readonly cards: readonly CardSample[];
}

/**
 * Watch a set of Collection tiles for `ms`, sampling every animation frame.
 * All tiles mount together and loop on the same 1400ms interval, so sampling
 * them in one pass keeps them comparable AND keeps the spec short.
 */
async function watchTiles(
  page: Page,
  tileIds: readonly string[],
  ms: number,
): Promise<Record<string, Frame[]>> {
  return page.evaluate(
    ({ ids, duration }: { ids: string[]; duration: number }) =>
      new Promise<Record<string, Frame[]>>((resolve) => {
        const roots = ids.map((id) =>
          document.querySelector(`[data-testid="cosmetic-tile-${id}"]`),
        );
        const out: Record<string, Frame[]> = {};
        for (const id of ids) out[id] = [];
        const start = performance.now();
        const tick = () => {
          const t = performance.now() - start;
          ids.forEach((id, i) => {
            const root = roots[i];
            const cards =
              root === null || root === undefined
                ? []
                : [...root.querySelectorAll('[data-testid="trick-card"]')].map((el) => {
                    const cs = getComputedStyle(el);
                    return { opacity: Number.parseFloat(cs.opacity), transform: cs.transform };
                  });
            out[id]?.push({ t, cards });
          });
          if (t >= duration) resolve(out);
          else requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      }),
    { ids: [...tileIds], duration: ms },
  );
}

/**
 * When each card of a trick STARTED leaving, in ms from the sample start.
 *
 * Opacity is the honest signal: every variant fades its cards out on the way
 * to the winner, and a card still waiting its turn sits at exactly 1. Position
 * is not — Tailwind's seat classes contribute to the same computed transform
 * matrix, so "the transform changed" is noisier than "this card began to go".
 *
 * Returns null when the window caught no complete departure (i.e. it started
 * mid-sweep and never saw a fresh one), so a flaky window fails loudly rather
 * than silently comparing garbage.
 */
function departureTimes(frames: readonly Frame[]): readonly number[] | null {
  const settled = (f: Frame) => f.cards.length === 4 && f.cards.every((c) => c.opacity > 0.95);
  const going = (f: Frame) => f.cards.some((c) => c.opacity < 0.9);
  let onset = -1;
  for (let i = 1; i < frames.length; i++) {
    if (settled(frames[i - 1] as Frame) && going(frames[i] as Frame)) {
      onset = i;
      break;
    }
  }
  if (onset < 0) return null;
  const times: number[] = [];
  for (let card = 0; card < 4; card++) {
    const hit = frames.slice(onset - 1).find((f) => (f.cards[card]?.opacity ?? 1) < 0.9)?.t;
    if (hit === undefined) return null;
    times.push(hit);
  }
  return times;
}

/** Spread between the first and last card leaving — the shape of the gesture. */
function stagger(times: readonly number[]): number {
  return Math.max(...times) - Math.min(...times);
}

test.describe('animations actually run', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/#collection');
    await expect(page.getByRole('heading', { name: 'Collection' })).toBeVisible();
    // The sweeps grid is the last section on the page; bring it into view so
    // nothing depends on where the viewport happened to land.
    await page.getByTestId('cosmetic-tile-riffle').scrollIntoViewIfNeeded();
    await expect(
      page.getByTestId('cosmetic-tile-sweep').getByTestId('trick-card').first(),
    ).toBeVisible();
  });

  test('sweep previews render four cards and move them', async ({ page }) => {
    // The first bug this catches is the dumbest one: a preview that renders no
    // cards at all. It shipped, and every unit test stayed green.
    for (const id of ['sweep', 'fold', 'snow-drift', 'riffle']) {
      await expect(page.getByTestId(`cosmetic-tile-${id}`).getByTestId('trick-card')).toHaveCount(
        4,
      );
    }

    const seen = await watchTiles(page, ['sweep'], 3200);
    const frames = seen['sweep'] as Frame[];
    expect(frames.length).toBeGreaterThan(30); // rAF really ran

    // Cards MOVED: more than a couple of distinct transforms for card 0, and
    // its opacity both fell (leaving) and came back (dealt again).
    const transforms = new Set(frames.map((f) => f.cards[0]?.transform ?? ''));
    expect(transforms.size).toBeGreaterThan(3);
    const opacities = frames.map((f) => f.cards[0]?.opacity ?? 1);
    expect(Math.min(...opacities)).toBeLessThan(0.5);
    expect(Math.max(...opacities)).toBeGreaterThan(0.95);
  });

  test('Riffle departs card by card where Classic Sweep departs as one', async ({ page }) => {
    // Riffle's whole identity is the SEQUENCE (delay = index * 0.24 of a 900ms
    // budget ≈ 650ms end to end) against Classic's near-simultaneous shove
    // (index * 0.045 ≈ 120ms). Both return the same kind of object from the
    // same code path, so a copy-paste that left Riffle animating like Classic
    // would pass every unit test. Only the clock can tell them apart.
    const seen = await watchTiles(page, ['sweep', 'riffle'], 4200);

    const classic = departureTimes(seen['sweep'] as Frame[]);
    const riffle = departureTimes(seen['riffle'] as Frame[]);
    expect(classic, 'no complete Classic sweep observed').not.toBeNull();
    expect(riffle, 'no complete Riffle sweep observed').not.toBeNull();

    const classicSpread = stagger(classic as readonly number[]);
    const riffleSpread = stagger(riffle as readonly number[]);
    expect(classicSpread, `classic spread ${String(classicSpread)}ms`).toBeLessThan(280);
    expect(riffleSpread, `riffle spread ${String(riffleSpread)}ms`).toBeGreaterThan(320);
    expect(riffleSpread).toBeGreaterThan(classicSpread + 200);

    // And within Riffle the order is the play order, not a scramble.
    const r = riffle as readonly number[];
    expect(r[0]).toBeLessThanOrEqual(r[3] as number);
  });

  test('every felt and sweep preview has a real felt surface, not a sliver', async ({ page }) => {
    // The 4px bug: `w-full` inside a shrink-wrapping picker slot resolved
    // against a collapsed parent. Nothing in a unit test can see it; a width
    // assertion can.
    const ovals = page.locator('.felt-oval');
    const count = await ovals.count();
    expect(count).toBeGreaterThanOrEqual(12); // 8 felt tiles + 4 sweep tiles
    for (let i = 0; i < count; i++) {
      const box = await ovals.nth(i).boundingBox();
      expect(box, `felt oval ${String(i)} has no box`).not.toBeNull();
      expect(box?.width ?? 0, `felt oval ${String(i)} width`).toBeGreaterThan(40);
      expect(box?.height ?? 0, `felt oval ${String(i)} height`).toBeGreaterThan(20);
    }
  });

  test('the "How it looks" panel plays the EQUIPPED sweep', async ({ page }) => {
    // The hero panel is the only place all five axes are shown as one table,
    // and the sweep is the one axis a still image cannot state at all. So the
    // panel has to actually run it — and run the one you picked, not the
    // default. Riffle is locked on a fresh identity; the dev toggle owns that.
    await page.getByRole('checkbox', { name: 'Show all (dev)' }).check();
    await page.getByTestId('cosmetic-tile-riffle').click();

    const panel = page.getByTestId('live-preview');
    await expect(panel.getByTestId('trick-card')).toHaveCount(4);

    // The panel's cycle is deliberately slow (3.4s on the felt, 1.2s gone), so
    // watch a full one plus a margin.
    const frames = await page.evaluate(
      (ms: number) =>
        new Promise<{ t: number; op: number[] }[]>((resolve) => {
          const root = document.querySelector('[data-testid="live-preview"]');
          const out: { t: number; op: number[] }[] = [];
          const start = performance.now();
          const tick = () => {
            const t = performance.now() - start;
            out.push({
              t,
              op: [...(root?.querySelectorAll('[data-testid="trick-card"]') ?? [])].map((el) =>
                Number.parseFloat(getComputedStyle(el).opacity),
              ),
            });
            if (t >= ms) resolve(out);
            else requestAnimationFrame(tick);
          };
          requestAnimationFrame(tick);
        }),
      5200,
    );

    const asFrames: Frame[] = frames.map((f) => ({
      t: f.t,
      cards: f.op.map((opacity) => ({ opacity, transform: '' })),
    }));
    const times = departureTimes(asFrames);
    expect(times, 'the hero panel never swept').not.toBeNull();
    // Riffle's signature, in the panel as on the table: one card at a time.
    expect(stagger(times as readonly number[])).toBeGreaterThan(320);

    await page.getByTestId('cosmetic-tile-sweep').click();
  });

  test('the foil sheen animates', async ({ page }) => {
    // Foils are server-granted, so there is no client-side way to equip one in
    // a test. The thing worth proving is the CSS itself: that a `[data-foil]`
    // subtree paints a running `jaffre-foil` sheen on a card face, and that it
    // is a real animation rather than a static gradient that only LOOKS foil.
    const probe = await page.evaluateHandle(() => {
      const wrap = document.createElement('div');
      wrap.dataset['foil'] = 'arcade';
      wrap.innerHTML =
        '<div class="card-face" style="position:relative;width:60px;height:90px"></div>';
      document.body.append(wrap);
      return wrap.firstElementChild as HTMLElement;
    });
    const sheen = await probe.evaluate((el) => {
      const cs = getComputedStyle(el, '::after');
      return { name: cs.animationName, state: cs.animationPlayState, content: cs.content };
    });
    expect(sheen.name).toBe('jaffre-foil');
    expect(sheen.state).toBe('running');
    await probe.evaluate((el) => el.parentElement?.remove());
  });
});

test.describe('the round-start deal', () => {
  test('blocks the auction until the fan is dealt, then hands off', async ({ page }) => {
    // The two halves of the deal (dealPace's fly-out and PlayerHand's fan)
    // and the auction's own gate (Table.tsx: `!deal.dealing`) all read the
    // same schedule now — this is the seam where a drift between them would
    // show up as either an early "Marcel PASS" or a fan stuck short of 8.
    test.setTimeout(60_000);
    await page.goto('/#practice');

    const dealIntro = page.getByTestId('deal-intro');
    // role="group" aria-label="Bid cards" wraps the auction's own bet cards
    // regardless of whose turn it is (waiting or not) — a stable probe for
    // "the panel is up" that doesn't depend on the first bidder being seat 0.
    const bidPanel = page.getByRole('group', { name: 'Bid cards' });

    await expect(dealIntro).toBeVisible();
    await expect(bidPanel).toBeHidden();

    await expect.poll(() => page.getByRole('option').count(), { timeout: 15_000 }).toBe(8);

    await expect(bidPanel).toBeVisible();
  });

  test('a staged auction scene never deals', async ({ page }) => {
    // Scenes freeze an arbitrary GameState straight into the store — there is
    // no "fresh round" and no observed roundIndex change, so useDealRun's
    // both triggers stay silent. A staged table must show the auction READY,
    // not mid-deal.
    await page.goto('/#scenes/auction-you');
    await expect(page.getByRole('group', { name: 'Bid cards' })).toBeVisible();
    await expect(page.getByTestId('deal-intro')).toBeHidden();
  });
});

test.describe('the scoreboard-delivery flights', () => {
  // See PLAN-scoreboard-delivery.md and apps/web/src/table/flight.tsx: every
  // change to the top bar's numbers arrives as a chip flying from the felt
  // event that caused it, and the bar's DISPLAYED value waits for the chip to
  // land before it moves. Both specs here drive a real practice game — pass
  // through the auction, play whatever's playable — and sample the DOM by
  // rAF from inside the page, the same technique the rest of this file uses,
  // because the ordering claim ("not yet — not yet — NOW") is exactly what a
  // single before/after screenshot can't tell apart from a bug.

  test("a trick's points chip flies to the bar before its tally updates", async ({ page }) => {
    test.setTimeout(90_000);
    await page.goto('/#practice');

    // Sample every animation frame from page load: a flight-chip's presence,
    // and each team pill's trick-tally aria-label (the TrickPile span — the
    // LAST direct child of the pill root, regardless of which side is
    // mirrored — see ScoreStrip's TeamSide). Stops 2.5s after the first trick
    // banner appears, which comfortably outlasts the single points flight
    // (paced(600)) launched the instant that banner mounts.
    const samplesPromise = page.evaluate(
      () =>
        new Promise<{ t: number; chip: boolean; label0: string | null; label1: string | null }[]>(
          (resolve) => {
            const samples: {
              t: number;
              chip: boolean;
              label0: string | null;
              label1: string | null;
            }[] = [];
            const start = performance.now();
            let stop = false;
            const label = (team: 0 | 1): string | null =>
              document
                .querySelector(`[data-flight-target="score-${String(team)}"] > span:last-child`)
                ?.getAttribute('aria-label') ?? null;
            const tick = () => {
              samples.push({
                t: performance.now() - start,
                chip: document.querySelector('[data-testid="flight-chip"]') !== null,
                label0: label(0),
                label1: label(1),
              });
              if (stop) resolve(samples);
              else requestAnimationFrame(tick);
            };
            const observer = new MutationObserver(() => {
              if (document.querySelector('[data-testid="trick-banner"]') === null) return;
              observer.disconnect();
              window.setTimeout(() => {
                stop = true;
              }, 2500);
            });
            observer.observe(document.body, { childList: true, subtree: true });
            requestAnimationFrame(tick);
            // Safety cap: no trick ever completed.
            window.setTimeout(() => {
              stop = true;
            }, 60_000);
          },
        ),
    );

    const pass = page.getByRole('button', { name: 'Pass' });
    const playable = page.locator('[role="option"][data-playable="true"]');
    const trickBanner = page.getByTestId('trick-banner');
    const deadline = Date.now() + 55_000;
    while (Date.now() < deadline && !(await trickBanner.isVisible())) {
      if (await pass.isVisible()) {
        if (await pass.isEnabled()) await pass.click();
      } else if ((await playable.count()) > 0) {
        await playable.first().click();
      }
      await page.waitForTimeout(120);
    }
    // Let the sampling window (banner + 2.5s) actually finish before reading it.
    await page.waitForTimeout(3_000);

    const samples = await samplesPromise;
    expect(samples.length, 'rAF sampling never ran').toBeGreaterThan(10);

    const chipIdx = samples.findIndex((s) => s.chip);
    expect(chipIdx, 'no flight-chip ever appeared').toBeGreaterThanOrEqual(0);
    const chipGoneIdx = samples.findIndex((s, i) => i > chipIdx && !s.chip);
    expect(chipGoneIdx, 'flight-chip never disappeared').toBeGreaterThan(chipIdx);

    // Exactly one side's tally is the one this trick moved — the other team's
    // never budges (only the winning team's points/trick-count are held).
    const first = samples[0] as { label0: string | null; label1: string | null };
    const last = samples[samples.length - 1] as { label0: string | null; label1: string | null };
    const movedTeam: 'label0' | 'label1' = first.label0 !== last.label0 ? 'label0' : 'label1';
    expect(first[movedTeam], 'the tally never changed at all').not.toBe(last[movedTeam]);

    // While the chip was airborne, that side's tally still read its OLD
    // value — it only moves to the new one once the chip is gone.
    for (let i = chipIdx; i < chipGoneIdx; i++) {
      expect(samples[i]?.[movedTeam], `sample ${String(i)} moved before landing`).toBe(
        first[movedTeam],
      );
    }
  });

  test('the trump badge appears only after its flight lands', async ({ page }) => {
    test.setTimeout(90_000);
    await page.goto('/#practice');

    // Trump is set the instant the contract holder leads their first card —
    // sample from page load until the strip's trump slot actually gets a
    // child (see ScoreStrip's TrumpBadge: the slot itself always exists, but
    // stays empty while trumpDecided is masked false).
    const samplesPromise = page.evaluate(
      () =>
        new Promise<{ t: number; chip: boolean; trumpShown: boolean }[]>((resolve) => {
          const samples: { t: number; chip: boolean; trumpShown: boolean }[] = [];
          const start = performance.now();
          const tick = () => {
            const slot = document.querySelector('[data-flight-target="trump"]');
            const trumpShown = slot !== null && slot.children.length > 0;
            samples.push({
              t: performance.now() - start,
              chip: document.querySelector('[data-testid="flight-chip"]') !== null,
              trumpShown,
            });
            if (trumpShown || samples.length > 4000) resolve(samples);
            else requestAnimationFrame(tick);
          };
          requestAnimationFrame(tick);
        }),
    );

    const pass = page.getByRole('button', { name: 'Pass' });
    const playable = page.locator('[role="option"][data-playable="true"]');
    const deadline = Date.now() + 60_000;
    while (Date.now() < deadline) {
      const trumpShown = await page
        .locator('[data-flight-target="trump"]')
        .evaluate((el) => el.children.length > 0)
        .catch(() => false);
      if (trumpShown) break;
      if (await pass.isVisible()) {
        if (await pass.isEnabled()) await pass.click();
      } else if ((await playable.count()) > 0) {
        await playable.first().click();
      }
      await page.waitForTimeout(120);
    }

    const samples = await samplesPromise;
    expect(samples.length, 'rAF sampling never ran').toBeGreaterThan(5);
    const shownIdx = samples.findIndex((s) => s.trumpShown);
    // Sans-atout contracts skip the callout (and the flight) entirely by
    // design — the badge still shows, just never masked in the first place —
    // so only assert the ordering when a chip was actually seen airborne.
    const chipIdx = samples.findIndex((s) => s.chip);
    expect(shownIdx, 'trump badge never appeared').toBeGreaterThanOrEqual(0);
    if (chipIdx >= 0) {
      expect(samples[chipIdx]?.trumpShown, 'badge showed before its flight landed').toBe(false);
    }
  });
});
