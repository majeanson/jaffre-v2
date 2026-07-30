import { SELF, env, runDurableObjectAlarm, runInDurableObject } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import { ABANDONED_REAP_MS, EMPTY_REAP_MS } from '../src/room/reaper.js';

/**
 * The storage self-destruct (src/room/reaper.ts). These tests are about the
 * two things that make it safe: it deletes EVERYTHING a room ever wrote (not
 * just `meta` — the `log:<seq>` rows are the heavy end), and it never fires
 * while anyone is attached or before the grace has actually elapsed.
 *
 * They also pin the alarm arbitration, which is the part that can silently
 * break the game: the single alarm slot is shared with presence.ts's game
 * wakes, so the reaper must arm without pushing a nearer wake out, and must
 * come back after an unrelated wake WITHOUT restarting its clock.
 */

declare module 'cloudflare:test' {
  interface ProvidedEnv {
    GAME_ROOM: DurableObjectNamespace;
    LOBBY: DurableObjectNamespace;
  }
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

interface StoredMeta {
  emptySince?: number;
  reapMs?: number;
  roomCode?: string;
  started?: boolean;
}

function roomStub(room: string): DurableObjectStub {
  return env.GAME_ROOM.get(env.GAME_ROOM.idFromName(room));
}

/** Open a socket to a room the way the client does (no-secret query params). */
async function connect(room: string, u = 'alice', n = 'Alice'): Promise<WebSocket> {
  const resp = await SELF.fetch(`https://example.com/ws/${room}?u=${u}&n=${n}`, {
    headers: { Upgrade: 'websocket' },
  });
  expect(resp.status).toBe(101);
  const ws = resp.webSocket;
  if (!ws) throw new Error('Upgrade did not return a WebSocket');
  ws.accept();
  return ws;
}

async function readMeta(stub: DurableObjectStub): Promise<StoredMeta | undefined> {
  return runInDurableObject(stub, (_instance, state) => state.storage.get<StoredMeta>('meta'));
}

async function putMeta(stub: DurableObjectStub, patch: Partial<StoredMeta>): Promise<void> {
  await runInDurableObject(stub, async (_instance, state) => {
    const meta = await state.storage.get<StoredMeta>('meta');
    if (meta === undefined) throw new Error('meta missing');
    await state.storage.put('meta', { ...meta, ...patch });
  });
}

async function armedAlarm(stub: DurableObjectStub): Promise<number | null> {
  return runInDurableObject(stub, (_instance, state) => state.storage.getAlarm());
}

async function storedKeys(stub: DurableObjectStub): Promise<string[]> {
  return runInDurableObject(stub, async (_instance, state) => [
    ...(await state.storage.list()).keys(),
  ]);
}

/** Wait for the close handler to have stamped the room empty. */
async function waitForEmptyStamp(stub: DurableObjectStub): Promise<number> {
  const deadline = Date.now() + 5000;
  for (;;) {
    const since = (await readMeta(stub))?.emptySince;
    if (typeof since === 'number') return since;
    if (Date.now() > deadline) throw new Error('room never stamped itself empty');
    await sleep(20);
  }
}

/** Leave no alarm armed: a live alarm at teardown races the per-test isolated
 * storage swap (EBUSY on Windows) — same reason as room.test.ts's endQuiet. */
async function endQuiet(stub: DurableObjectStub, ...sockets: WebSocket[]): Promise<void> {
  for (const ws of sockets) {
    try {
      ws.close(1000, 'test done');
    } catch {
      // Already closed.
    }
  }
  const deadline = Date.now() + 5000;
  for (;;) {
    await runInDurableObject(stub, (_instance, state) => state.storage.deleteAlarm());
    await sleep(30);
    if ((await armedAlarm(stub)) === null || Date.now() > deadline) return;
  }
}

describe('room storage self-destruct', () => {
  it('stamps the room empty and arms the reap wake when the last socket closes', async () => {
    const room = 'reap-arms';
    const stub = roomStub(room);
    const ws = await connect(room);
    // Connected: nothing armed, nothing stamped — a live room is never on the
    // clock (and the game's own wakes own the alarm slot while it is).
    expect((await readMeta(stub))?.emptySince).toBeUndefined();

    ws.close(1000, 'tab closed');
    const since = await waitForEmptyStamp(stub);
    expect(await armedAlarm(stub)).toBe(since + EMPTY_REAP_MS);

    await endQuiet(stub);
  });

  it('deletes every key the room ever wrote, not just meta', async () => {
    const room = 'reap-deletes-all';
    const stub = roomStub(room);
    const ws = await connect(room);
    ws.close(1000, 'tab closed');
    await waitForEmptyStamp(stub);
    // Stand in for a played-out room: the per-action log rows are what make an
    // abandoned finished game expensive, and nothing else ever removes them.
    await runInDurableObject(stub, (_instance, state) =>
      state.storage.put({ seq: 3, chat: [], 'log:1': {}, 'log:2': {}, 'log:3': {} }),
    );
    expect((await storedKeys(stub)).length).toBeGreaterThan(1);

    await putMeta(stub, { emptySince: Date.now() - EMPTY_REAP_MS - 1000 });
    expect(await runDurableObjectAlarm(stub)).toBe(true);

    expect(await storedKeys(stub)).toEqual([]);
    // And no alarm survives to wake a room that no longer exists.
    expect(await armedAlarm(stub)).toBeNull();
  });

  it('re-arms at the SAME deadline after an unrelated wake — the clock never restarts', async () => {
    const room = 'reap-rearms';
    const stub = roomStub(room);
    const ws = await connect(room);
    ws.close(1000, 'tab closed');
    const since = await waitForEmptyStamp(stub);

    // Inside the grace: the wake runs, finds nothing due, and leaves the room
    // intact with its reap wake armed for the ORIGINAL deadline. (A re-arm
    // that restarted from `now` would be a room that wakes every day forever.)
    expect(await runDurableObjectAlarm(stub)).toBe(true);
    expect((await readMeta(stub))?.emptySince).toBe(since);
    expect(await armedAlarm(stub)).toBe(since + EMPTY_REAP_MS);

    await endQuiet(stub);
  });

  it('never reaps while a socket is attached, however old the stamp', async () => {
    const room = 'reap-attached';
    const stub = roomStub(room);
    const ws = await connect(room);
    // Forge a long-expired stamp under a live connection: the deadline is
    // +Infinity while anyone holds a socket, so the alarm must not touch it.
    await putMeta(stub, { emptySince: Date.now() - EMPTY_REAP_MS - 60_000 });
    await runDurableObjectAlarm(stub);

    expect(await storedKeys(stub)).toContain('meta');

    await endQuiet(stub, ws);
  });

  it('restarts the clock on reconnect: the grace measures from the LAST socket out', async () => {
    const room = 'reap-reconnect';
    const stub = roomStub(room);
    const first = await connect(room);
    first.close(1000, 'tab closed');
    const since = await waitForEmptyStamp(stub);

    // Coming back must clear the stamp, or a room that idled for nearly a full
    // grace and was then played would be reaped seconds after that session.
    const second = await connect(room);
    expect((await readMeta(stub))?.emptySince).toBeUndefined();

    second.close(1000, 'tab closed');
    const again = await waitForEmptyStamp(stub);
    expect(again).toBeGreaterThanOrEqual(since);

    await endQuiet(stub);
  });

  it(
    'gives a frozen MID-GAME room the longer grace, then reaps it too',
    { timeout: 20_000 },
    async () => {
      const room = 'reap-midgame';
      const stub = roomStub(room);
      const ws = await connect(room);
      const seen: string[] = [];
      ws.addEventListener('message', (event) => {
        if (typeof event.data === 'string') seen.push(event.data);
      });
      ws.send(JSON.stringify({ t: 'join' }));
      ws.send(JSON.stringify({ t: 'sit', seat: 0 }));
      for (const seat of [1, 2, 3]) ws.send(JSON.stringify({ t: 'add_bot', seat }));
      ws.send(JSON.stringify({ t: 'start' }));
      const deadline = Date.now() + 10_000;
      for (;;) {
        if ((await readMeta(stub))?.started === true) break;
        if (Date.now() > deadline) throw new Error('game never started');
        await sleep(30);
      }

      ws.close(1000, 'tab closed');
      await waitForEmptyStamp(stub);
      // A day of silence does NOT take a resumable game away — that room froze
      // (runAlarm's no-human guard) rather than finished.
      await putMeta(stub, { emptySince: Date.now() - EMPTY_REAP_MS - 60_000 });
      await runDurableObjectAlarm(stub);
      expect(await storedKeys(stub)).toContain('meta');

      // A week of it does.
      await putMeta(stub, { emptySince: Date.now() - ABANDONED_REAP_MS - 60_000 });
      expect(await runDurableObjectAlarm(stub)).toBe(true);
      expect(await storedKeys(stub)).toEqual([]);
      expect(seen.length).toBeGreaterThan(0); // the room really did play, not error out
    },
  );

  it('the socket-less /leave path puts an unstamped room on the clock', async () => {
    const room = 'reap-leave';
    const stub = roomStub(room);
    const ws = await connect(room);
    ws.send(JSON.stringify({ t: 'join' }));
    ws.send(JSON.stringify({ t: 'sit', seat: 0 }));
    await sleep(100);
    ws.close(1000, 'tab closed');
    await waitForEmptyStamp(stub);

    // Forge the pre-reaper world: a room whose last socket closed before the
    // stamp shipped carries neither emptySince nor an armed alarm. Memory AND
    // storage — `loaded` short-circuits load(), so storage alone isn't enough.
    await runInDurableObject(stub, async (instance, state) => {
      const cached = (instance as unknown as { meta: StoredMeta }).meta;
      delete cached.emptySince;
      await state.storage.put('meta', cached);
      await state.storage.deleteAlarm();
    });

    // Quitting from the home "Your tables" row is the one write such a room
    // can still receive without a socket — it must arm the self-destruct, not
    // refresh the storage for free.
    const resp = await SELF.fetch(`https://example.com/api/room/${room}/leave?u=alice`, {
      method: 'POST',
    });
    expect(resp.status).toBe(200);
    expect(await resp.json()).toEqual({ left: true });

    const since = (await readMeta(stub))?.emptySince;
    if (typeof since !== 'number') throw new Error('leave did not stamp the room empty');
    expect(await armedAlarm(stub)).toBe(since + EMPTY_REAP_MS);

    await endQuiet(stub);
  });

  it('arms without pushing out a nearer game wake (pre-game vacate wins the slot)', async () => {
    const room = 'reap-arbitration';
    const stub = roomStub(room);
    const alice = await connect(room, 'alice', 'Alice');
    // A spectator keeps the room populated, so the close below arms the
    // pre-game vacate wake and NOT the reaper.
    const bob = await connect(room, 'bob', 'Bob');
    bob.send(JSON.stringify({ t: 'join' }));
    alice.send(JSON.stringify({ t: 'join' }));
    alice.send(JSON.stringify({ t: 'sit', seat: 0 }));
    await sleep(100);
    // Shorten the vacate grace so the nearer wake is unmistakably not a reap.
    await putMeta(stub, { reapMs: EMPTY_REAP_MS });

    alice.close(1000, 'tab closed');
    const deadline = Date.now() + 5000;
    for (;;) {
      const armed = await armedAlarm(stub);
      if (armed !== null) {
        // The vacate deadline (~60s), not a day out: armReaper only ever
        // LOWERS the armed alarm.
        expect(armed - Date.now()).toBeLessThan(EMPTY_REAP_MS / 2);
        // …and with bob still attached, the room isn't on the reap clock at all.
        expect((await readMeta(stub))?.emptySince).toBeUndefined();
        break;
      }
      if (Date.now() > deadline) throw new Error('no wake armed for the vanished pre-game seat');
      await sleep(20);
    }

    await endQuiet(stub, alice, bob);
  });
});
