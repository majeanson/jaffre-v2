/**
 * /join/<code> — the share-link unfurl (routes/join.ts).
 *
 * The test env has no ASSETS binding (wrangler.test.toml drops it), so every
 * test here injects a fake ASSETS returning a baseline shell, spread over the
 * real env — GAME_ROOM stays real, so the seat-count test exercises the
 * actual DO /status peek end to end.
 */
import { SELF, env, runInDurableObject } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import type { ServerMessage } from '@jaffre/protocol';
import worker from '../src/index.js';
import { handleJoin } from '../src/routes/join.js';
import { publicId } from '../src/publicId.js';
import type { Env } from '../src/env.js';

// worker.fetch's declared type carries an ExecutionContext third parameter
// this router never reads; the same cast auth.test.ts uses.
const fetchAs = worker.fetch as unknown as (request: Request, env: Env) => Promise<Response>;

/** A faithful miniature of apps/web/index.html: every tag join.ts rewrites,
 * plus the module script whose parse-time deferral the injected inline
 * script relies on. */
const BASELINE_HTML = `<!doctype html>
<html lang="en">
  <head>
    <title>Jaffre</title>
    <meta name="description" content="baseline description" />
    <meta property="og:title" content="Jaffre" />
    <meta property="og:description" content="baseline og description" />
    <meta property="og:url" content="https://jaffre.marcportal.com/" />
    <meta property="og:image" content="https://jaffre.marcportal.com/social/og.png" />
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
`;

const fakeAssets = {
  fetch: async () =>
    new Response(BASELINE_HTML, { headers: { 'Content-Type': 'text/html; charset=utf-8' } }),
} as unknown as Fetcher;

function testEnv(overrides: Partial<Env> = {}): Env {
  return { ...(env as unknown as Env), ASSETS: fakeAssets, ...overrides };
}

function count(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1;
}

/** Minimal socket client: join → (optionally sit) → wait for the echo. */
async function connectAndSit(room: string, u: string, n: string, seat: number) {
  const resp = await SELF.fetch(`https://example.com/ws/${room}?u=${u}&n=${n}`, {
    headers: { Upgrade: 'websocket' },
  });
  expect(resp.status).toBe(101);
  const ws = resp.webSocket;
  if (!ws) throw new Error('Upgrade did not return a WebSocket');
  ws.accept();
  const messages: ServerMessage[] = [];
  let notify: (() => void) | null = null;
  ws.addEventListener('message', (event) => {
    if (typeof event.data !== 'string') return;
    messages.push(JSON.parse(event.data) as ServerMessage);
    notify?.();
    notify = null;
  });
  const waitFor = async (pred: (m: ServerMessage) => boolean): Promise<void> => {
    const deadline = Date.now() + 5000;
    for (;;) {
      if (messages.some(pred)) return;
      if (Date.now() > deadline) throw new Error('timed out waiting for message');
      await new Promise<void>((resolve) => {
        notify = resolve;
        setTimeout(resolve, 50);
      });
    }
  };
  ws.send(JSON.stringify({ t: 'join' }));
  await waitFor((m) => m.t === 'welcome');
  ws.send(JSON.stringify({ t: 'sit', seat }));
  await waitFor((m) => m.t === 'roster' && m.roster.seats[seat] !== null);
  return { ws, waitFor, send: (msg: object) => ws.send(JSON.stringify(msg)) };
}

/** Close sockets and clear the alarm so the DO is quiescent at teardown —
 * same EBUSY-avoidance dance as room.test.ts's endQuiet. */
async function endQuiet(room: string, ...sockets: WebSocket[]): Promise<void> {
  for (const ws of sockets) {
    try {
      ws.close(1000, 'test done');
    } catch {
      // Already closed.
    }
  }
  const stub = env.GAME_ROOM.get(env.GAME_ROOM.idFromName(room));
  const deadline = Date.now() + 5000;
  for (;;) {
    await runInDurableObject(stub, (_instance, state) => state.storage.deleteAlarm());
    await new Promise((r) => setTimeout(r, 30));
    const alarm = await runInDurableObject(stub, (_instance, state) => state.storage.getAlarm());
    if (alarm === null || Date.now() > deadline) return;
  }
}

describe('/join/<code>', () => {
  it('serves the shell with per-room tags and the boot script', async () => {
    const res = await handleJoin(
      new Request('https://example.com/join/fresh-newt-aa'),
      testEnv(),
      'fresh-newt-aa',
    );
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toContain('text/html');
    expect(res.headers.get('Cache-Control')).toBe('public, max-age=60');
    const body = await res.text();
    // A virgin room: nobody seated, no host yet — the generic title, a
    // truthful zero-count line.
    expect(body).toContain('<title>Join my Jaffre table</title>');
    expect(body).toContain('0 of 4 seats taken');
    expect(body).toContain('0 sièges sur 4');
    // Rewritten in place — the document still holds exactly one of each tag.
    expect(count(body, 'property="og:title"')).toBe(1);
    expect(body).toMatch(/property="og:title" content="Join my Jaffre table"/);
    expect(body).toMatch(
      /property="og:url" content="https:\/\/jaffre\.marcportal\.com\/join\/fresh-newt-aa"/,
    );
    expect(count(body, '0 of 4 seats taken')).toBe(2); // description + og:description
    // The boot script that lands the browser in the room.
    expect(body).toContain('history.replaceState(null,"","/#room/fresh-newt-aa")');
  });

  it('lowercases a mixed-case code through the router', async () => {
    const res = await fetchAs(new Request('https://example.com/join/BRISK-Otter-B2'), testEnv());
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toContain('history.replaceState(null,"","/#room/brisk-otter-b2")');
    expect(body).toContain('content="https://jaffre.marcportal.com/join/brisk-otter-b2"');
  });

  it('tells the truth about seats and the host', async () => {
    const room = 'join-truth-room';
    // A default-named host: the unfurl must show the disambiguated public
    // name, never a bare "Player" (same rule as every other public surface).
    const host = await connectAndSit(room, 'join-host-uid', 'Player', 0);
    const guest = await connectAndSit(room, 'join-guest-uid', 'Bobette', 2);
    host.send({ t: 'add_bot', seat: 1 });
    await host.waitFor((m) => m.t === 'roster' && m.roster.seats[1] !== null);

    // The raw status peek carries the new fields (additive — the four
    // original fields are pinned by room.test.ts).
    const status = await SELF.fetch(`https://example.com/api/room/${room}/status`);
    const peek = (await status.json()) as {
      players: number;
      filled: number;
      hostName?: string;
    };
    const expectedHost = `Player ${publicId('join-host-uid').slice(-4)}`;
    expect(peek.players).toBe(2); // humans only
    expect(peek.filled).toBe(3); // humans + the bot
    expect(peek.hostName).toBe(expectedHost);

    // And the unfurl renders them.
    const res = await handleJoin(new Request(`https://example.com/join/${room}`), testEnv(), room);
    const body = await res.text();
    expect(body).toContain(`<title>Join ${expectedHost}'s Jaffre table</title>`);
    expect(body).toContain('2 of 4 seats taken');

    await endQuiet(room, host.ws, guest.ws);
  });

  it('renders the generic copy when the status peek fails', async () => {
    const broken = {
      idFromName: () => ({}) as DurableObjectId,
      get: () =>
        ({
          fetch: () => {
            throw new Error('boom');
          },
        }) as unknown as DurableObjectStub,
    } as unknown as DurableObjectNamespace;
    const res = await handleJoin(
      new Request('https://example.com/join/any-code'),
      testEnv({ GAME_ROOM: broken }),
      'any-code',
    );
    expect(res.status).toBe(200); // an unfurl must never 500
    const body = await res.text();
    expect(body).toContain('<title>Join my Jaffre table</title>');
    expect(body).toContain('no account needed');
    expect(body).toContain('history.replaceState(null,"","/#room/any-code")');
  });

  it('renders the generic copy on a non-OK status response', async () => {
    const failing = {
      idFromName: () => ({}) as DurableObjectId,
      get: () =>
        ({
          fetch: async () => new Response('nope', { status: 500 }),
        }) as unknown as DurableObjectStub,
    } as unknown as DurableObjectNamespace;
    const res = await handleJoin(
      new Request('https://example.com/join/any-code'),
      testEnv({ GAME_ROOM: failing }),
      'any-code',
    );
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('no account needed');
  });

  it('lets bad shapes fall through to assets untouched', async () => {
    const bad = [
      'https://example.com/join/',
      'https://example.com/join/a/b',
      `https://example.com/join/${'a'.repeat(33)}`,
      'https://example.com/join/bad_code!',
    ];
    for (const url of bad) {
      const res = await fetchAs(new Request(url), testEnv());
      expect(await res.text()).toBe(BASELINE_HTML); // verbatim: no rewrite, no script
    }
    // Wrong method: same fall-through.
    const post = await fetchAs(
      new Request('https://example.com/join/abc-def', { method: 'POST' }),
      testEnv(),
    );
    expect(await post.text()).toBe(BASELINE_HTML);
  });

  it('answers HEAD with headers only and no DO wake', async () => {
    const broken = {
      idFromName: () => {
        throw new Error('HEAD must not touch the DO');
      },
    } as unknown as DurableObjectNamespace;
    const res = await fetchAs(
      new Request('https://example.com/join/abc-def', { method: 'HEAD' }),
      testEnv({ GAME_ROOM: broken }),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get('Cache-Control')).toBe('public, max-age=60');
    expect(await res.text()).toBe('');
  });
});
