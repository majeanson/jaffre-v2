import { SELF, env, runDurableObjectAlarm } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import { chooseAction } from '@jaffre/bots';
import { mulberry32 } from '@jaffre/engine';
import type { Action, GameEvent, SeatView } from '@jaffre/engine';
import type { ClientMessage, ServerMessage } from '@jaffre/protocol';

declare module 'cloudflare:test' {
  interface ProvidedEnv {
    GAME_ROOM: DurableObjectNamespace;
  }
}

/** Thin WebSocket test client: buffers server messages, records all events. */
class Client {
  readonly allEvents: GameEvent[] = [];
  private readonly buffer: ServerMessage[] = [];
  private notify: (() => void) | null = null;

  private constructor(readonly ws: WebSocket) {
    ws.addEventListener('message', (event) => {
      if (typeof event.data !== 'string') return;
      const msg = JSON.parse(event.data) as ServerMessage;
      if (msg.t === 'events') this.allEvents.push(...msg.events);
      this.buffer.push(msg);
      this.notify?.();
      this.notify = null;
    });
  }

  static async connect(room: string, u: string, n: string): Promise<Client> {
    const resp = await SELF.fetch(`https://example.com/ws/${room}?u=${u}&n=${n}`, {
      headers: { Upgrade: 'websocket' },
    });
    expect(resp.status).toBe(101);
    const ws = resp.webSocket;
    if (!ws) throw new Error('Upgrade did not return a WebSocket');
    ws.accept();
    return new Client(ws);
  }

  send(msg: ClientMessage): void {
    this.ws.send(JSON.stringify(msg));
  }

  /** Next buffered message whose tag is in `types` (FIFO), waiting if needed. */
  async nextAny<T extends ServerMessage['t']>(
    types: readonly T[],
    timeoutMs = 5000,
  ): Promise<Extract<ServerMessage, { t: T }>> {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      const i = this.buffer.findIndex((m) => (types as readonly string[]).includes(m.t));
      if (i >= 0) {
        const [msg] = this.buffer.splice(i, 1);
        return msg as Extract<ServerMessage, { t: T }>;
      }
      if (Date.now() > deadline) {
        throw new Error(`Timed out waiting for [${types.join(', ')}]`);
      }
      await new Promise<void>((resolve) => {
        this.notify = resolve;
        setTimeout(resolve, 50);
      });
    }
  }

  async next<T extends ServerMessage['t']>(
    type: T,
    timeoutMs = 5000,
  ): Promise<Extract<ServerMessage, { t: T }>> {
    return this.nextAny([type], timeoutMs);
  }

  /** Drain every buffered `view` message and return the newest, if any. */
  latestView(): SeatView | null {
    let latest: SeatView | null = null;
    for (let i = this.buffer.length - 1; i >= 0; i--) {
      const msg = this.buffer[i];
      if (msg !== undefined && msg.t === 'view') {
        latest ??= msg.view;
        this.buffer.splice(i, 1);
      }
    }
    return latest;
  }
}

/** Strip the engine-side seat: the wire format never carries a seat. */
function toWire(action: Action): Extract<ClientMessage, { t: 'action' }>['action'] {
  if (action.type === 'place_bid') return { type: 'place_bid', choice: action.choice };
  if (action.type === 'play_card') return { type: 'play_card', card: action.card };
  return { type: 'continue' };
}

/** join → sit seat 0 → add 3 bots → start; returns the initial seat-0 view. */
async function setupStartedGame(client: Client): Promise<SeatView> {
  client.send({ t: 'join' });
  await client.next('welcome');
  client.send({ t: 'sit', seat: 0 });
  await client.next('roster');
  for (const seat of [1, 2, 3] as const) {
    client.send({ t: 'add_bot', seat });
    await client.next('roster');
  }
  client.send({ t: 'start' });
  const view = await client.next('view');
  return view.view;
}

describe('GameRoom', () => {
  it('responds on the health endpoint', async () => {
    const resp = await SELF.fetch('https://example.com/api/health');
    expect(resp.status).toBe(200);
    expect(await resp.json()).toEqual({ ok: true, service: 'jaffre' });
  });

  it('rejects a websocket upgrade without identity params', async () => {
    const resp = await SELF.fetch('https://example.com/ws/lobby', {
      headers: { Upgrade: 'websocket' },
    });
    expect(resp.status).toBe(400);
  });

  it('joins, seats a human and three bots, and starts the game', async () => {
    const client = await Client.connect('room-start', 'alice', 'Alice');
    client.send({ t: 'join' });
    const welcome = await client.next('welcome');
    expect(welcome.viewer).toBe('spectator');
    expect(welcome.view).toBeNull();
    expect(welcome.seq).toBe(0);
    expect(welcome.roster.seats).toEqual([null, null, null, null]);
    expect(welcome.roster.started).toBe(false);

    client.send({ t: 'sit', seat: 0 });
    const afterSit = await client.next('roster');
    expect(afterSit.roster.seats[0]).toMatchObject({
      name: 'Alice',
      isBot: false,
      connected: true,
    });

    for (const seat of [1, 2, 3] as const) {
      client.send({ t: 'add_bot', seat });
      const roster = await client.next('roster');
      expect(roster.roster.seats[seat]).toMatchObject({ isBot: true, connected: true });
    }

    client.send({ t: 'start' });
    const view = await client.next('view');
    expect(view.seq).toBe(0);
    expect(view.view.viewer).toBe(0);
    expect(view.view.phase).toBe('bidding');
    expect(view.view.hand).toHaveLength(8);
    expect(view.view.handCounts).toEqual([8, 8, 8, 8]);

    // Starting twice is rejected.
    client.send({ t: 'start' });
    const err = await client.next('error');
    expect(err.code).toBe('ALREADY_STARTED');
  });

  it(
    'plays a full game to game_over (human via client-side bot, bots via alarms)',
    { timeout: 120_000 },
    async () => {
      const room = 'room-fullgame';
      const client = await Client.connect(room, 'alice', 'Alice');
      let view = await setupStartedGame(client);

      const stub = env.GAME_ROOM.get(env.GAME_ROOM.idFromName(room));
      const rng = mulberry32(1234);
      let gameOver = false;

      for (let i = 0; i < 5000 && !gameOver; i++) {
        view = client.latestView() ?? view;
        if (view.phase === 'game_over') {
          gameOver = true;
          break;
        }
        const humanTurn = (view.phase === 'bidding' || view.phase === 'playing') && view.turn === 0;
        if (humanTurn) {
          const action = chooseAction(view, rng);
          expect(action).not.toBeNull();
          if (action === null) break;
          client.send({ t: 'action', action: toWire(action) });
          // A pending bot alarm may have fired between our snapshot and this
          // send; the engine then answers with an error and we simply resync.
          const reply = await client.nextAny(['view', 'error']);
          if (reply.t === 'view') view = reply.view;
        } else {
          const ran = await runDurableObjectAlarm(stub);
          if (ran) {
            view = (await client.next('view')).view;
          } else {
            // Alarm not scheduled yet (or already fired) — let it settle.
            await new Promise((resolve) => setTimeout(resolve, 20));
          }
        }
      }

      expect(gameOver).toBe(true);
      expect(client.allEvents.some((e) => e.type === 'game_over')).toBe(true);
      expect(view.winner === 0 || view.winner === 1).toBe(true);
    },
  );

  it('reconnects to the same seat with a snapshot-first welcome', async () => {
    const room = 'room-reconnect';
    const client = await Client.connect(room, 'alice', 'Alice');
    await setupStartedGame(client);

    // Advance a few bot moves so seq > 0.
    const stub = env.GAME_ROOM.get(env.GAME_ROOM.idFromName(room));
    let advanced = 0;
    for (let i = 0; i < 20 && advanced < 2; i++) {
      const ran = await runDurableObjectAlarm(stub);
      if (ran) {
        await client.next('view');
        advanced++;
      } else {
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
    }
    expect(advanced).toBeGreaterThan(0);

    client.ws.close(1000, 'bye');

    const again = await Client.connect(room, 'alice', 'Alice');
    again.send({ t: 'join' });
    const welcome = await again.next('welcome');
    expect(welcome.viewer).toBe(0);
    // The 700ms wall-clock alarm may add moves beyond the ones we drove, so
    // the welcome seq is at least what we observed — never behind it.
    expect(welcome.seq).toBeGreaterThanOrEqual(advanced);
    expect(welcome.view).not.toBeNull();
    expect(welcome.view?.viewer).toBe(0);
    expect(welcome.roster.seats[0]).toMatchObject({ name: 'Alice', connected: true });
  });

  it('enforces seat security for a second user', async () => {
    const room = 'room-security';
    const alice = await Client.connect(room, 'alice', 'Alice');
    alice.send({ t: 'join' });
    await alice.next('welcome');
    alice.send({ t: 'sit', seat: 0 });
    await alice.next('roster');

    const bob = await Client.connect(room, 'bob', 'Bob');
    bob.send({ t: 'join' });
    await bob.next('welcome');

    bob.send({ t: 'action', action: { type: 'continue' } });
    const notSeated = await bob.next('error');
    expect(notSeated.code).toBe('NOT_SEATED');

    bob.send({ t: 'sit', seat: 0 });
    const taken = await bob.next('error');
    expect(taken.code).toBe('SEAT_TAKEN');
  });

  it('gives spectators redacted views and live events', async () => {
    const room = 'room-spectator';
    const alice = await Client.connect(room, 'alice', 'Alice');
    await setupStartedGame(alice);

    const carol = await Client.connect(room, 'carol', 'Carol');
    carol.send({ t: 'join' });
    const welcome = await carol.next('welcome');
    expect(welcome.viewer).toBe('spectator');
    expect(welcome.view).not.toBeNull();
    expect(welcome.view?.hand).toEqual([]);
    expect(welcome.roster.spectators).toBe(1);

    // A bot move reaches the spectator as events + view, still with no hand.
    const stub = env.GAME_ROOM.get(env.GAME_ROOM.idFromName(room));
    let ran = false;
    for (let i = 0; i < 20 && !ran; i++) {
      ran = await runDurableObjectAlarm(stub);
      if (!ran) await new Promise((resolve) => setTimeout(resolve, 20));
    }
    expect(ran).toBe(true);
    const events = await carol.next('events');
    expect(events.events.length).toBeGreaterThan(0);
    const view = await carol.next('view');
    expect(view.view.viewer).toBe('spectator');
    expect(view.view.hand).toEqual([]);
  });
});
