import { expect, test } from '@playwright/test';
import type { BrowserContext, Page } from '@playwright/test';

/**
 * Shared music queue smoke (@network: the room's Durable Object makes ONE
 * real YouTube oEmbed call per add; run online). The YouTube IFrame player
 * itself is stubbed via addInitScript — `loadIframeApi` sees `window.YT`
 * already present and never injects the real script — so nothing actually
 * plays and the test can fire ENDED deterministically.
 *
 * Covers: paste-a-link add propagating to both clients, the listen opt-in
 * creating exactly one player, the App-level dock SURVIVING the lobby→table
 * transition (same player instance, never destroyed), and a player ENDED
 * report advancing the whole room off the track.
 */

/** Shape of the stub bookkeeping the init script leaves on window. */
interface YtStubPlayer {
  readonly loads: readonly { videoId: string; startSeconds?: number }[];
  readonly destroyed: boolean;
}

const YT_STUB = () => {
  interface StubEvents {
    onReady?: () => void;
    onStateChange?: (e: { data: number }) => void;
    onError?: (e: { data: number }) => void;
  }
  const players: object[] = [];
  class Player {
    loads: { videoId: string; startSeconds?: number }[] = [];
    destroyed = false;
    volume = 100;
    private readonly events: StubEvents;
    constructor(_el: HTMLElement, opts: { events: StubEvents }) {
      this.events = opts.events;
      players.push(this);
      setTimeout(() => this.events.onReady?.(), 0);
    }
    loadVideoById(o: { videoId: string; startSeconds?: number }) {
      this.loads.push(o);
    }
    playVideo() {}
    pauseVideo() {}
    seekTo() {}
    getCurrentTime() {
      return 0;
    }
    setVolume(v: number) {
      this.volume = v;
    }
    destroy() {
      this.destroyed = true;
    }
    fireEnded() {
      this.events.onStateChange?.({ data: 0 });
    }
  }
  (window as unknown as { __ytStub: { players: object[] } }).__ytStub = { players };
  (window as unknown as { YT: object }).YT = {
    Player,
    PlayerState: { ENDED: 0, PLAYING: 1 },
  };
};

async function stubbedPage(context: BrowserContext, name: string): Promise<Page> {
  await context.addInitScript((n: string) => localStorage.setItem('jaffre-name', n), name);
  await context.addInitScript(YT_STUB);
  const page = await context.newPage();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  return page;
}

/** The stub's players, read back for assertions. */
async function stubPlayers(page: Page): Promise<YtStubPlayer[]> {
  return page.evaluate(() =>
    (
      window as unknown as {
        __ytStub: { players: { loads: unknown[]; destroyed: boolean }[] };
      }
    ).__ytStub.players.map((p) => ({
      loads: p.loads as { videoId: string; startSeconds?: number }[],
      destroyed: p.destroyed,
    })),
  );
}

// A stable, ancient, never-going-away video (oEmbed title asserted below).
const VIDEO = 'dQw4w9WgXcQ';
const TITLE = /Never Gonna Give You Up/i;

test('music: add propagates, listening survives lobby→table, ENDED advances the room @network', async ({
  browser,
}) => {
  const room = `e2e-music-${Math.random().toString(36).slice(2, 10)}`;
  const contextA = await browser.newContext();
  const contextB = await browser.newContext();
  const a = await stubbedPage(contextA, 'Alice');
  const b = await stubbedPage(contextB, 'Bruno');

  await a.goto(`/#room/${room}`);
  await b.goto(`/#room/${room}`);

  // ── A pastes a link into the music tab; the whole room sees the track ────
  await a.getByTestId('comms-tab-music').click();
  await a.getByTestId('music-input').fill(`https://www.youtube.com/watch?v=${VIDEO}`);
  await a.getByTestId('music-add').click();
  await expect(a.getByTestId('music-current')).toContainText(TITLE);

  await b.getByTestId('comms-tab-music').click();
  await expect(b.getByTestId('music-current')).toContainText(TITLE);
  await expect(b.getByTestId('music-current')).toContainText('Alice');
  // The collapsed dock pill advertises the track to the not-yet-listening.
  await expect(b.getByTestId('music-pill')).toContainText(TITLE);

  // ── B opts in: exactly one stubbed player, loaded at the shared position ─
  await b.getByTestId('music-listen').click();
  await expect(b.getByTestId('music-dock')).toBeVisible();
  await expect.poll(async () => (await stubPlayers(b))[0]?.loads.length ?? 0).toBeGreaterThan(0);
  const loaded = (await stubPlayers(b))[0]?.loads[0];
  expect(loaded?.videoId).toBe(VIDEO);
  expect(loaded?.startSeconds).toBeGreaterThanOrEqual(0);

  // ── Both sit, bots fill, the game starts: the dock must survive ──────────
  await a.getByRole('button', { name: 'Sit here' }).first().click();
  await b.getByRole('button', { name: 'Sit here' }).first().click();
  await a.getByTestId('fill-bots').click();
  await a.getByRole('button', { name: 'Start the game' }).click();
  await expect(a.getByTestId('score-strip')).toBeVisible();
  await expect(b.getByTestId('score-strip')).toBeVisible();

  // Same single player instance across the screen swap — never re-created,
  // never destroyed. This is the App-level mount doing its job.
  await expect(b.getByTestId('music-dock')).toBeVisible();
  const playersAfter = await stubPlayers(b);
  expect(playersAfter).toHaveLength(1);
  expect(playersAfter[0]?.destroyed).toBe(false);
  // A never opted in: on the table their collapsed pill still advertises it.
  await expect(a.getByTestId('music-pill')).toContainText(TITLE);

  // ── B's player reaches the end: one report advances the whole room ───────
  await b.evaluate(() => {
    (
      window as unknown as { __ytStub: { players: { fireEnded(): void }[] } }
    ).__ytStub.players[0]?.fireEnded();
  });
  // Queue was empty, so the room falls silent everywhere: B's dock empties
  // and A's pill (nothing playing, not listening) disappears entirely.
  await expect(b.getByTestId('music-dock')).not.toContainText(TITLE);
  await expect(a.getByTestId('music-pill')).toHaveCount(0);

  await contextA.close();
  await contextB.close();
});
