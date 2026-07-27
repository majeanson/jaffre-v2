import { SELF, env, fetchMock, runDurableObjectAlarm, runInDurableObject } from 'cloudflare:test';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { chooseAction } from '@jaffre/bots';
import { deserialize, mulberry32 } from '@jaffre/engine';
import type { Action, GameEvent, GameState, SeatView } from '@jaffre/engine';
import type { ClientMessage, Roster, ServerMessage } from '@jaffre/protocol';
import {
  BOT_SWAP_MS,
  PREGAME_VACATE_MS,
  TRICK_HOLD_MS,
  TURN_TIMER_MS,
  extractVideoId,
} from '../src/GameRoom.js';

declare module 'cloudflare:test' {
  interface ProvidedEnv {
    GAME_ROOM: DurableObjectNamespace;
    LOBBY: DurableObjectNamespace;
  }
}

/** Thin WebSocket test client: buffers server messages, records all events. */
class Client {
  readonly allEvents: GameEvent[] = [];
  /** Most recent `view` message ever received (never consumed from the buffer). */
  lastView: { readonly seq: number; readonly view: SeatView } | null = null;
  private readonly buffer: ServerMessage[] = [];
  private notify: (() => void) | null = null;

  private constructor(readonly ws: WebSocket) {
    ws.addEventListener('message', (event) => {
      if (typeof event.data !== 'string') return;
      const msg = JSON.parse(event.data) as ServerMessage;
      if (msg.t === 'events') this.allEvents.push(...msg.events);
      if (msg.t === 'view') this.lastView = { seq: msg.seq, view: msg.view };
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

  /** Drain every buffered `roster` message and return the newest, if any. */
  latestRoster(): Roster | null {
    let latest: Roster | null = null;
    for (let i = this.buffer.length - 1; i >= 0; i--) {
      const msg = this.buffer[i];
      if (msg !== undefined && msg.t === 'roster') {
        latest ??= msg.roster;
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

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Authoritative room state read straight from DO storage — never lags the
 * WebSocket the way client-observed views do. */
interface RoomSnap {
  readonly phase: GameState['phase'] | null;
  readonly turn: number | null;
  readonly seq: number;
  readonly alarm: number | null;
  readonly now: number;
}

async function snapshot(stub: DurableObjectStub): Promise<RoomSnap> {
  return runInDurableObject(stub, async (_instance, state) => {
    const [game, seq, alarm] = await Promise.all([
      state.storage.get<string>('game'),
      state.storage.get<number>('seq'),
      state.storage.getAlarm(),
    ]);
    const g = game !== undefined ? deserialize(game) : null;
    return {
      phase: g?.phase ?? null,
      turn: g?.turn ?? null,
      seq: seq ?? 0,
      alarm,
      now: Date.now(),
    };
  });
}

/**
 * Fast-forward alarms until the room is quiescent at the connected human's
 * turn: phase bidding/playing, turn 0, and NO pending alarm — i.e. no
 * wall-clock 700ms/2600ms alarm can race whatever the test does next.
 * Rounds only advance by readiness, so at round_over the human's `ready`
 * is sent on their behalf (idempotent — bots are always ready).
 */
async function driveToQuiescentHumanTurn(
  stub: DurableObjectStub,
  client: Client,
  ms = 20_000,
): Promise<RoomSnap> {
  const deadline = Date.now() + ms;
  for (;;) {
    const snap = await snapshot(stub);
    if (
      (snap.phase === 'bidding' || snap.phase === 'playing') &&
      snap.turn === 0 &&
      snap.alarm === null
    ) {
      return snap;
    }
    if (snap.phase === 'game_over') throw new Error('game ended before the human turn');
    if (Date.now() > deadline) throw new Error('never reached a quiescent human turn');
    if (snap.phase === 'round_over') {
      client.send({ t: 'ready' });
      await sleep(25);
      continue;
    }
    const ran = await runDurableObjectAlarm(stub);
    if (!ran) await sleep(25);
  }
}

/**
 * Like driveToQuiescentHumanTurn, but for a room with the `turnTimer` house
 * rule ON: a connected human's turn now always carries an armed alarm (their
 * ~60s turn-timer deadline), so "alarm === null" can never hold — this only
 * waits for phase bidding/playing at turn 0. Safe: the armed deadline is far
 * enough out (TURN_TIMER_MS) that it cannot fire during the rest of the test.
 */
async function driveToHumanTurnWithTimer(
  stub: DurableObjectStub,
  client: Client,
  ms = 20_000,
): Promise<RoomSnap> {
  const deadline = Date.now() + ms;
  for (;;) {
    const snap = await snapshot(stub);
    if ((snap.phase === 'bidding' || snap.phase === 'playing') && snap.turn === 0) return snap;
    if (snap.phase === 'game_over') throw new Error('game ended before the human turn');
    if (Date.now() > deadline) throw new Error('never reached the human turn');
    if (snap.phase === 'round_over') {
      client.send({ t: 'ready' });
      await sleep(25);
      continue;
    }
    const ran = await runDurableObjectAlarm(stub);
    if (!ran) await sleep(25);
  }
}

/** Wait for a `welcome` whose viewer matches, draining any stale ones buffered
 * from earlier sits (each sit emits a welcome the caller may not have read). */
async function welcomeViewer(client: Client, viewer: number | 'spectator'): Promise<void> {
  const deadline = Date.now() + 5000;
  for (;;) {
    const w = await client.next('welcome');
    if (w.viewer === viewer) return;
    if (Date.now() > deadline) throw new Error(`no welcome with viewer ${String(viewer)}`);
  }
}

/** Poll `read` until it returns non-undefined, with a generous deadline. */
async function pollUntil<T>(read: () => Promise<T | undefined>, what: string): Promise<T> {
  const deadline = Date.now() + 10_000;
  for (;;) {
    const value = await read();
    if (value !== undefined) return value;
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${what}`);
    await sleep(20);
  }
}

/**
 * Leave the room fully quiescent at the end of a test: close every socket and
 * clear the alarm (repeatedly — closing a seated human mid-game arms the
 * bot-swap alarm, and an in-flight alarm chain re-arms itself). A DO with a
 * live alarm or socket at teardown races vitest-pool-workers' per-test
 * isolated-storage swap and crashes the run on Windows (EBUSY).
 */
async function endQuiet(room: string, ...clients: Client[]): Promise<void> {
  for (const client of clients) {
    try {
      client.ws.close(1000, 'test done');
    } catch {
      // Already closed.
    }
  }
  const stub = env.GAME_ROOM.get(env.GAME_ROOM.idFromName(room));
  const deadline = Date.now() + 5000;
  for (;;) {
    await runInDurableObject(stub, (_instance, state) => state.storage.deleteAlarm());
    await sleep(30);
    const alarm = await runInDurableObject(stub, (_instance, state) => state.storage.getAlarm());
    if (alarm === null || Date.now() > deadline) return;
  }
}

/** join → sit seat 0 → opt OUT of the (default-on) `turnTimer` house rule →
 * add 3 bots → start; returns the initial seat-0 view. The opt-out keeps a
 * connected human's idle turn deadline-free, which most tests here rely on
 * (alarm === null at a quiescent human turn). */
async function setupStartedGame(client: Client): Promise<SeatView> {
  client.send({ t: 'join' });
  await client.next('welcome');
  client.send({ t: 'sit', seat: 0 });
  await client.next('roster');
  client.send({ t: 'set_rules', hailMary12: true, turnTimer: false });
  await client.next('roster');
  for (const seat of [1, 2, 3] as const) {
    client.send({ t: 'add_bot', seat });
    await client.next('roster');
  }
  client.send({ t: 'start' });
  const view = await client.next('view');
  return view.view;
}

/** join → sit seat 0 → set the `turnTimer` house rule explicitly ON (it's the
 * default anyway, but the tests that use this helper are ABOUT the timer, so
 * they don't lean on the default; must be set pre-game, like hailMary12) →
 * add 3 bots → start; returns the initial seat-0 view. Mirrors
 * setupStartedGame, which opts OUT instead. */
async function setupStartedGameWithTurnTimer(client: Client): Promise<SeatView> {
  client.send({ t: 'join' });
  await client.next('welcome');
  client.send({ t: 'sit', seat: 0 });
  await client.next('roster');
  client.send({ t: 'set_rules', hailMary12: true, turnTimer: true });
  await client.next('roster');
  for (const seat of [1, 2, 3] as const) {
    client.send({ t: 'add_bot', seat });
    await client.next('roster');
  }
  client.send({ t: 'start' });
  const view = await client.next('view');
  return view.view;
}

/** Drive a started game (seat 0 human via `rng`, seats 1-3 via alarms) to
 * game_over, mirroring the full-game test's loop. Returns the final view. */
async function playToGameOver(
  client: Client,
  stub: DurableObjectStub,
  rngSeed: number,
  startView: SeatView,
): Promise<SeatView> {
  const rng = mulberry32(rngSeed);
  let view = startView;
  for (let i = 0; i < 5000 && view.phase !== 'game_over'; i++) {
    view = client.latestView() ?? view;
    if (view.phase === 'game_over') break;
    if (view.phase === 'round_over') {
      client.send({ t: 'ready' });
      view = (await client.next('view')).view;
      continue;
    }
    const humanTurn = (view.phase === 'bidding' || view.phase === 'playing') && view.turn === 0;
    if (humanTurn) {
      const action = chooseAction(view, rng);
      if (action === null) break;
      client.send({ t: 'action', action: toWire(action) });
      const reply = await client.nextAny(['view', 'error']);
      if (reply.t === 'view') view = reply.view;
    } else {
      const ran = await runDurableObjectAlarm(stub);
      if (ran) {
        view = (await client.next('view')).view;
      } else {
        await sleep(20);
      }
    }
  }
  return view;
}

/** Poll buffered roster messages until `seriesWins` reflects `totalGames`
 * finished games (i.e. the post-game_over broadcast has landed). Returns the
 * whole matching roster — `latestRoster()` drains the buffer, so the caller
 * must read seriesWins/seriesGames off this rather than polling again. */
async function waitForSeriesWins(client: Client, totalGames: number): Promise<Roster> {
  const deadline = Date.now() + 10_000;
  for (;;) {
    const roster = client.latestRoster();
    const sw = roster?.seriesWins;
    if (roster !== null && sw !== undefined && sw[0] + sw[1] === totalGames) return roster;
    if (Date.now() > deadline) throw new Error('timed out waiting for seriesWins');
    await sleep(20);
  }
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

  it('returns 503 from auth endpoints while SESSION_SECRET is unset', async () => {
    // The test env deliberately has no SESSION_SECRET, so the WS path runs in
    // plain ?u=&n= mode (everything above) and auth is unavailable.
    const guest = await SELF.fetch('https://example.com/api/auth/guest', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Alice' }),
    });
    expect(guest.status).toBe(503);
    const me = await SELF.fetch('https://example.com/api/auth/me', {
      headers: { Authorization: 'Bearer whatever' },
    });
    expect(me.status).toBe(503);
  });

  it('404s a replay of an unknown game and 400s a userless history request', async () => {
    const replay = await SELF.fetch('https://example.com/api/replay/nope');
    expect(replay.status).toBe(404);
    const history = await SELF.fetch('https://example.com/api/history');
    expect(history.status).toBe(400);
    const empty = await SELF.fetch('https://example.com/api/history?u=nobody');
    expect(empty.status).toBe(200);
    expect(await empty.json()).toEqual({ games: [] });
  });

  it('echoes a joiner’s pixel avatar on their roster seat, and clears it on a paintless rejoin', async () => {
    const paint = 'data:image/svg+xml,%3Csvg%3E%3C/svg%3E';
    const alice = await Client.connect('room-paint', 'alice', 'Alice');
    alice.send({ t: 'join', paint });
    await alice.next('welcome');
    alice.send({ t: 'sit', seat: 0 });
    const seated = await alice.next('roster');
    expect(seated.roster.seats[0]).toMatchObject({ name: 'Alice', paint });

    // Rejoining without paint (the player erased their painting) clears it.
    // Watched from a second client: the rejoin's roster broadcast skips the
    // rejoiner's own socket.
    const bob = await Client.connect('room-paint', 'bob', 'Bob');
    bob.send({ t: 'join' });
    await bob.next('welcome');
    alice.send({ t: 'join' });
    const cleared = await bob.next('roster');
    expect(cleared.roster.seats[0]?.paint).toBeUndefined();
    await endQuiet('room-paint', alice, bob);
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
    await endQuiet('room-start', client);
  });

  it('carries per-seat bot difficulty and updates it in place', async () => {
    const client = await Client.connect('room-difficulty', 'alice', 'Alice');
    client.send({ t: 'join' });
    await client.next('welcome');
    client.send({ t: 'sit', seat: 0 });
    await client.next('roster');

    // No difficulty specified → defaults to normal.
    client.send({ t: 'add_bot', seat: 1 });
    let roster = await client.next('roster');
    expect(roster.roster.seats[1]).toMatchObject({ isBot: true, difficulty: 'normal' });

    // Explicit difficulty is carried through to the roster.
    client.send({ t: 'add_bot', seat: 2, difficulty: 'hard' });
    roster = await client.next('roster');
    expect(roster.roster.seats[2]).toMatchObject({ isBot: true, difficulty: 'hard' });

    // Re-sending add_bot on an existing bot seat updates its difficulty in place.
    client.send({ t: 'add_bot', seat: 2, difficulty: 'easy' });
    roster = await client.next('roster');
    expect(roster.roster.seats[2]).toMatchObject({ isBot: true, difficulty: 'easy' });

    await endQuiet('room-difficulty', client);
  });

  it('removes a bot pre-game and rejects removing a non-bot seat', async () => {
    const room = 'room-removebot';
    const client = await Client.connect(room, 'alice', 'Alice');
    client.send({ t: 'join' });
    await client.next('welcome');
    client.send({ t: 'sit', seat: 0 });
    await client.next('roster');
    client.send({ t: 'add_bot', seat: 1, difficulty: 'hard' });
    let roster = await client.next('roster');
    expect(roster.roster.seats[1]).toMatchObject({ isBot: true });

    // Remove the bot → the seat goes vacant.
    client.send({ t: 'remove_bot', seat: 1 });
    roster = await client.next('roster');
    expect(roster.roster.seats[1]).toBeNull();

    // Removing from a human seat (no bot) is a BAD_MESSAGE.
    client.send({ t: 'remove_bot', seat: 0 });
    const err = await client.next('error');
    expect(err.code).toBe('BAD_MESSAGE');

    await endQuiet(room, client);
  });

  it('pre-game: a seated player swaps with a bot, swaps with a human, and a spectator cannot bump a human', async () => {
    const room = 'room-preswap';
    const alice = await Client.connect(room, 'alice', 'Alice');
    alice.send({ t: 'join' });
    await alice.next('welcome');
    alice.send({ t: 'sit', seat: 0 });
    await alice.next('roster');
    alice.send({ t: 'add_bot', seat: 1, difficulty: 'hard' });
    await alice.next('roster');

    // Alice (seat 0) moves onto the bot at seat 1 → they trade places.
    alice.send({ t: 'sit', seat: 1 });
    await welcomeViewer(alice, 1);
    const r1 = await pollUntil(async () => {
      const r = alice.latestRoster();
      return r?.seats[1]?.isBot === false && r.seats[0]?.isBot === true ? r : undefined;
    }, 'the alice↔bot swap roster');
    expect(r1.seats[0]).toMatchObject({ isBot: true, difficulty: 'hard' }); // bot swapped back

    // Bob takes seat 2, then swaps onto alice's seat 1 → the two humans trade.
    const bob = await Client.connect(room, 'bob', 'Bob');
    bob.send({ t: 'join' });
    await bob.next('welcome');
    bob.send({ t: 'sit', seat: 2 });
    await welcomeViewer(bob, 2);
    bob.send({ t: 'sit', seat: 1 });
    await welcomeViewer(bob, 1);
    // Alice's client is re-homed to bob's old seat (2) with a fresh welcome.
    await welcomeViewer(alice, 2);

    // Carol spectates: she may not bump a seated human…
    const carol = await Client.connect(room, 'carol', 'Carol');
    carol.send({ t: 'join' });
    await carol.next('welcome');
    carol.send({ t: 'sit', seat: 1 }); // bob is there
    const err = await carol.next('error');
    expect(err.code).toBe('SEAT_TAKEN');
    // …but she may take a bot seat (seat 0), which drops the bot.
    carol.send({ t: 'sit', seat: 0 });
    await welcomeViewer(carol, 0);
    const r2 = await pollUntil(async () => {
      const r = carol.latestRoster();
      return r?.seats[0]?.isBot === false ? r : undefined;
    }, 'carol taking the bot seat');
    expect(r2.seats[0]).toMatchObject({ isBot: false });

    await endQuiet(room, alice, bob, carol);
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
        if (view.phase === 'round_over') {
          // Rounds wait for every human's readiness — the sole human here.
          // The next view is the freshly dealt round.
          client.send({ t: 'ready' });
          view = (await client.next('view')).view;
          continue;
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

      // M8: game_over persisted the game to D1 (games + game_players rows).
      // The broadcast races the async persist — poll briefly instead of
      // reading once (this was a rare CI flake, not a product bug).
      type GameRow = {
        id: string;
        room_code: string;
        seed: number;
        finished_at: number;
        winner_team: number;
        score_0: number;
        score_1: number;
        action_log: string;
      };
      let game: GameRow | null = null;
      for (let i = 0; i < 50 && game === null; i++) {
        game = await env.DB.prepare(
          'SELECT id, room_code, seed, finished_at, winner_team, score_0, score_1, action_log FROM games WHERE room_code = ?1',
        )
          .bind(room)
          .first<GameRow>();
        if (game === null) await new Promise((resolve) => setTimeout(resolve, 50));
      }
      expect(game).not.toBeNull();
      if (game === null) throw new Error('unreachable');
      expect(game.winner_team).toBe(view.winner);
      expect([game.score_0, game.score_1]).toEqual(view.scores);
      expect(game.finished_at).toBeGreaterThan(0);
      const actions = JSON.parse(game.action_log) as unknown[];
      expect(actions.length).toBeGreaterThan(0);

      const players = await env.DB.prepare(
        'SELECT seat, user_id, is_bot, name FROM game_players WHERE game_id = ?1 ORDER BY seat',
      )
        .bind(game.id)
        .all<{ seat: number; user_id: string | null; is_bot: number; name: string }>();
      expect(players.results).toEqual([
        { seat: 0, user_id: 'alice', is_bot: 0, name: 'Alice' },
        { seat: 1, user_id: null, is_bot: 1, name: 'Bot 2' },
        { seat: 2, user_id: null, is_bot: 1, name: 'Bot 3' },
        { seat: 3, user_id: null, is_bot: 1, name: 'Bot 4' },
      ]);

      // The engine scores at least one round in any completed game — the
      // history row carries its round summaries as JSON.
      const gameRow = await env.DB.prepare('SELECT round_summaries FROM games WHERE id = ?1')
        .bind(game.id)
        .first<{ round_summaries: string | null }>();
      expect(gameRow?.round_summaries).not.toBeNull();
      const summaries = JSON.parse(gameRow?.round_summaries ?? '[]') as unknown[];
      expect(summaries.length).toBeGreaterThan(0);

      // /api/history surfaces the finished game for the human player, with names.
      const historyResp = await SELF.fetch('https://example.com/api/history?u=alice');
      expect(historyResp.status).toBe(200);
      const history = (await historyResp.json()) as {
        games: {
          id: string;
          roomCode: string;
          winnerTeam: number;
          yourSeat: number;
          players: { seat: number; name: string; isBot: boolean }[];
        }[];
      };
      const entry = history.games.find((g) => g.id === game.id);
      expect(entry).toMatchObject({ roomCode: room, winnerTeam: view.winner, yourSeat: 0 });
      expect(entry?.players).toEqual([
        { seat: 0, name: 'Alice', isBot: false },
        { seat: 1, name: 'Bot 2', isBot: true },
        { seat: 2, name: 'Bot 3', isBot: true },
        { seat: 3, name: 'Bot 4', isBot: true },
      ]);

      // /api/replay returns the seed + ordered action log + the same players.
      const replayResp = await SELF.fetch(`https://example.com/api/replay/${game.id}`);
      expect(replayResp.status).toBe(200);
      const replay = (await replayResp.json()) as {
        seed: number;
        actions: unknown[];
        players: { seat: number; name: string; isBot: boolean }[];
      };
      expect(replay.seed).toBe(game.seed);
      expect(replay.actions).toEqual(actions);
      expect(replay.players).toEqual(entry?.players);

      // Unrated game (1 human + 3 bots — rated games need a human on both
      // teams): no lastRatings in meta, and roster.ratings absent.
      const metaAfter = await runInDurableObject(stub, async (_instance, state) => {
        return state.storage.get('meta');
      });
      expect((metaAfter as { lastRatings?: unknown }).lastRatings).toBeUndefined();
      const rosterAfter = client.latestRoster();
      expect(rosterAfter?.ratings).toBeUndefined();

      // BETWEEN GAMES (game_over reached, no rematch yet): a public room with
      // room for a joiner must re-list in the lobby as 'waiting' — meta.started
      // stays true (it only flips true→false never), so the fix has to treat
      // game_over as "open" too, same as pre-game. onSetPublic has no
      // started-gate, so flipping public here (post game_over) is itself a
      // legitimate between-games action.
      interface StoredLobbyEntry {
        readonly code: string;
        readonly phase: string;
        readonly players: number;
      }
      client.send({ t: 'set_public', on: true });
      const publicRoster = await pollUntil(async () => {
        const r = client.latestRoster();
        return r?.public === true ? r : undefined;
      }, 'the public roster echo (post game_over)');
      expect(publicRoster.public).toBe(true);

      const lobbyStub = env.LOBBY.get(env.LOBBY.idFromName('lobby'));
      const listed = await pollUntil(
        () =>
          runInDurableObject(lobbyStub, async (_instance, state) => {
            const rooms = await state.storage.get<Record<string, StoredLobbyEntry>>('rooms');
            return rooms?.[room];
          }),
        'the between-games room to re-list as waiting',
      );
      expect(listed.phase).toBe('waiting');
      expect(listed.players).toBe(1); // Alice only — the 3 bot seats don't count

      await endQuiet(room, client);
      // Guard the Lobby DO's own pending TTL alarm the same way the
      // pre-game-vacate test does, so it doesn't trip vitest's
      // isolated-storage teardown.
      const lobbyDeadline = Date.now() + 5000;
      for (;;) {
        await runInDurableObject(lobbyStub, (_instance, state) => state.storage.deleteAlarm());
        await sleep(30);
        const alarm = await runInDurableObject(lobbyStub, (_instance, state) =>
          state.storage.getAlarm(),
        );
        if (alarm === null || Date.now() > lobbyDeadline) break;
      }
    },
  );

  it(
    'tallies seriesWins at game_over and increments again after a rematch',
    { timeout: 240_000 },
    async () => {
      const room = 'room-series';
      const client = await Client.connect(room, 'alice', 'Alice');
      const stub = env.GAME_ROOM.get(env.GAME_ROOM.idFromName(room));
      let view = await setupStartedGame(client);

      view = await playToGameOver(client, stub, 1234, view);
      expect(view.phase).toBe('game_over');
      const firstWinner = view.winner;
      expect(firstWinner === 0 || firstWinner === 1).toBe(true);
      const firstScores = view.scores;

      const afterFirst = await waitForSeriesWins(client, 1);
      const firstWins = afterFirst.seriesWins ?? [0, 0];
      expect(firstWins).toEqual(firstWinner === 0 ? [1, 0] : [0, 1]);
      // The scorepad records this game's final scores, oldest first.
      expect(afterFirst.seriesGames).toEqual([firstScores]);

      // Rematch, same table (isRematch — meta.started stays true, the DO's
      // action log resets) — the next game_over must increment the same tally.
      client.send({ t: 'start' });
      view = (await client.next('view')).view;
      view = await playToGameOver(client, stub, 5678, view);
      expect(view.phase).toBe('game_over');
      const secondWinner = view.winner;
      expect(secondWinner === 0 || secondWinner === 1).toBe(true);

      const afterSecond = await waitForSeriesWins(client, 2);
      const expected: [number, number] = [firstWins[0], firstWins[1]];
      if (secondWinner === 0 || secondWinner === 1) expected[secondWinner] += 1;
      expect(afterSecond.seriesWins).toEqual(expected);
      // Both games are now on the scorepad, in play order.
      expect(afterSecond.seriesGames).toEqual([firstScores, view.scores]);

      await endQuiet(room, client);
    },
  );

  it('exposes a room status peek for the home Your-tables row', async () => {
    const room = 'room-status';
    const client = await Client.connect(room, 'alice', 'Alice');
    await setupStartedGame(client);

    const res = await SELF.fetch(`https://example.com/api/room/${room}/status`);
    expect(res.status).toBe(200);
    const status = (await res.json()) as {
      started: boolean;
      phase: string | null;
      turn: number | null;
      seriesWins: [number, number];
    };
    expect(status.started).toBe(true);
    expect(typeof status.phase).toBe('string'); // a started game has a phase
    expect(status.seriesWins).toEqual([0, 0]);

    // An unknown room reads as not-started (a fresh, empty DO).
    const fresh = await SELF.fetch('https://example.com/api/room/never-seen/status');
    expect(fresh.status).toBe(200);
    expect(((await fresh.json()) as { started: boolean }).started).toBe(false);

    await endQuiet(room, client);
  });

  it(
    'swaps seats 1 and 2 between games, and rejects the swap mid-game',
    { timeout: 120_000 },
    async () => {
      const room = 'room-swap';
      const client = await Client.connect(room, 'alice', 'Alice');
      const stub = env.GAME_ROOM.get(env.GAME_ROOM.idFromName(room));

      // alice at seat 0; bots 1/2/3 get distinct difficulties so a swap shows.
      client.send({ t: 'join' });
      await client.next('welcome');
      client.send({ t: 'sit', seat: 0 });
      await client.next('roster');
      client.send({ t: 'add_bot', seat: 1, difficulty: 'easy' });
      await client.next('roster');
      client.send({ t: 'add_bot', seat: 2, difficulty: 'hard' });
      await client.next('roster');
      client.send({ t: 'add_bot', seat: 3, difficulty: 'normal' });
      await client.next('roster');
      client.send({ t: 'start' });
      let view = (await client.next('view')).view;

      // Mid-game the swap is refused — seats are locked until game_over.
      client.send({ t: 'swap_seats' });
      const err = await client.next('error');
      expect(err.code).toBe('BAD_MESSAGE');

      view = await playToGameOver(client, stub, 1234, view);
      expect(view.phase).toBe('game_over');

      // Between games the swap exchanges seats 1 and 2 (difficulty proves it).
      client.latestRoster(); // drop any stale rosters buffered during play
      client.send({ t: 'swap_seats' });
      // Poll for the post-swap roster (a late game_over broadcast may still be
      // in flight; the swap moves the 'hard' bot from seat 2 to seat 1).
      let roster: Roster | null = null;
      const deadline = Date.now() + 5000;
      for (;;) {
        const r = client.latestRoster();
        if (r !== null && r.seats[1]?.difficulty === 'hard') {
          roster = r;
          break;
        }
        if (Date.now() > deadline) throw new Error('timed out waiting for the swapped roster');
        await sleep(20);
      }
      expect(roster.seats[0]).toMatchObject({ isBot: false, name: 'Alice' });
      expect(roster.seats[1]).toMatchObject({ isBot: true, difficulty: 'hard' });
      expect(roster.seats[2]).toMatchObject({ isBot: true, difficulty: 'easy' });
      expect(roster.seats[3]).toMatchObject({ isBot: true, difficulty: 'normal' });

      await endQuiet(room, client);
    },
  );

  it(
    'between games, a joiner may claim a bot seat or an empty seat',
    { timeout: 120_000 },
    async () => {
      const room = 'room-between-sit';
      const client = await Client.connect(room, 'alice', 'Alice');
      let view = await setupStartedGame(client);
      const stub = env.GAME_ROOM.get(env.GAME_ROOM.idFromName(room));
      view = await playToGameOver(client, stub, 4321, view);
      expect(view.phase).toBe('game_over');

      // The lobby lists a public between-games table as 'waiting' — so a
      // newcomer landing here must actually be able to sit. Taking over a bot
      // seat used to bounce with ALREADY_STARTED.
      const bob = await Client.connect(room, 'bob', 'Bob');
      bob.send({ t: 'join' });
      await bob.next('welcome');
      bob.send({ t: 'sit', seat: 1 });
      const bobSeated = await bob.next('welcome'); // fresh welcome adopts the seat
      expect(bobSeated.viewer).toBe(1);

      // Bob leaves for good — at game_over the seat frees to null (no bot
      // swap-in) — and the EMPTY seat must be claimable too.
      bob.send({ t: 'leave' });
      await pollUntil(async () => {
        const r = client.latestRoster();
        return r !== null && r.seats[1] === null ? true : undefined;
      }, "bob's freed seat");
      const carol = await Client.connect(room, 'carol', 'Carol');
      carol.send({ t: 'join' });
      await carol.next('welcome');
      carol.send({ t: 'sit', seat: 1 });
      const carolSeated = await carol.next('welcome');
      expect(carolSeated.viewer).toBe(1);

      await endQuiet(room, client, bob, carol);
    },
  );

  it('a manual action takes control back from auto-play', { timeout: 30_000 }, async () => {
    const room = 'room-autoplay-manual';
    const client = await Client.connect(room, 'alice', 'Alice');
    await setupStartedGame(client);
    const stub = env.GAME_ROOM.get(env.GAME_ROOM.idFromName(room));

    client.send({ t: 'set_autoplay', on: true });
    await pollUntil(async () => {
      const r = client.latestRoster();
      return r?.seats[0]?.autoPlay === true ? true : undefined;
    }, 'the auto-play roster flag');

    // ANY manual bid/play — even one the engine rejects as out-of-turn or
    // wrong-phase — is Alice taking control back: onAction clears the flag
    // before applying, so the alarm loop stops covering her either way.
    client.send({ t: 'action', action: { type: 'play_card', card: { suit: 'red', value: 0 } } });
    await pollUntil(async () => {
      const r = client.latestRoster();
      return r !== null && r.seats[0]?.autoPlay === undefined ? true : undefined;
    }, 'the auto-play flag to clear');
    const stored = await runInDurableObject(stub, async (_instance, state) => {
      const meta = await state.storage.get<{ autoPlay?: Record<string, boolean> }>('meta');
      return meta?.autoPlay ?? {};
    });
    expect(stored['alice']).toBeUndefined();

    await endQuiet(room, client);
  });

  it(
    'holds round_over until a connected human sends ready — alarms never auto-advance it',
    { timeout: 60_000 },
    async () => {
      const room = 'room-readygate';
      const client = await Client.connect(room, 'alice', 'Alice');
      let view = await setupStartedGame(client);
      const stub = env.GAME_ROOM.get(env.GAME_ROOM.idFromName(room));
      const rng = mulberry32(9);

      // Play the round out (same drive as the full-game test), stopping the
      // moment the room reaches round_over.
      const deadline = Date.now() + 50_000;
      while ((await snapshot(stub)).phase !== 'round_over') {
        expect(Date.now()).toBeLessThan(deadline);
        view = client.latestView() ?? view;
        const humanTurn = (view.phase === 'bidding' || view.phase === 'playing') && view.turn === 0;
        if (humanTurn) {
          const action = chooseAction(view, rng);
          expect(action).not.toBeNull();
          if (action === null) break;
          client.send({ t: 'action', action: toWire(action) });
          const reply = await client.nextAny(['view', 'error']);
          if (reply.t === 'view') view = reply.view;
        } else {
          const ran = await runDurableObjectAlarm(stub);
          if (ran) view = (await client.next('view')).view;
          else await sleep(20);
        }
      }

      // Alice is CONNECTED: no amount of alarm wakes may deal the next round.
      const before = await snapshot(stub);
      for (let i = 0; i < 5; i++) {
        await runDurableObjectAlarm(stub);
        await sleep(20);
      }
      const held = await snapshot(stub);
      expect(held.phase).toBe('round_over');
      expect(held.seq).toBe(before.seq);

      // Her ready is the one thing that advances it.
      client.send({ t: 'ready' });
      const next = await pollUntil(async () => {
        const snap = await snapshot(stub);
        return snap.phase !== 'round_over' ? snap : undefined;
      }, 'the next round to deal');
      expect(next.phase === 'bidding' || next.phase === 'playing').toBe(true);
      await endQuiet(room, client);
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
    await endQuiet(room, client, again);
  });

  it(
    'delays the next bot wake after a completed trick (trick-hold pacing)',
    { timeout: 60_000 },
    async () => {
      const room = 'room-trickhold';
      const client = await Client.connect(room, 'alice', 'Alice');
      await setupStartedGame(client);
      const stub = env.GAME_ROOM.get(env.GAME_ROOM.idFromName(room));
      const rng = mulberry32(77);

      // Strategy: reach a QUIESCENT human turn (no pending alarm, so nothing
      // can race us), and when the human's card is the 4th of a trick, apply
      // it ourselves and read the alarm the server scheduled in response.
      const deadline = Date.now() + 50_000;
      for (;;) {
        expect(Date.now()).toBeLessThan(deadline);
        const before = await driveToQuiescentHumanTurn(stub, client);

        // Wait for the client's view stream to catch up with storage truth.
        const view = await pollUntil(async () => {
          const last = client.lastView;
          return last !== null && last.seq >= before.seq ? last.view : undefined;
        }, 'the view to catch up to storage');

        const completesTrick = view.phase === 'playing' && view.currentTrick.length === 3;
        const action = chooseAction(view, rng);
        expect(action).not.toBeNull();
        if (action === null) {
          await endQuiet(room, client);
          return;
        }
        client.send({ t: 'action', action: toWire(action) });
        // Only our own action can advance the room here — await its view.
        await pollUntil(async () => {
          const last = client.lastView;
          return last !== null && last.seq >= before.seq + 1 ? last : undefined;
        }, 'our action to apply');
        if (!completesTrick) continue;

        const after = await snapshot(stub);
        if (after.phase === 'playing' && after.turn === 0) continue; // human won the trick — no alarm due
        // Round-ending trick: no alarm — the room waits for readiness. The
        // drive helper sends `ready` on the next lap; keep looking for a
        // mid-round trick.
        if (after.phase === 'round_over') continue;
        // Trick completed and a bot (or round_over) is next: the wake is held
        // back for the client's trick animation, well beyond the 700ms tick.
        expect(after.alarm).not.toBeNull();
        expect((after.alarm ?? 0) - after.now).toBeGreaterThan(TRICK_HOLD_MS - 1000);
        await endQuiet(room, client);
        return;
      }
    },
  );

  it(
    'bot-swaps a disconnected human after the deadline, and rejoin clears it',
    { timeout: 45_000 },
    async () => {
      interface StoredMeta {
        disconnectedSince?: Record<string, number>;
      }
      interface StoredLog {
        action: Action;
      }
      const room = 'room-botswap';
      const client = await Client.connect(room, 'alice', 'Alice');
      await setupStartedGame(client);
      const stub = env.GAME_ROOM.get(env.GAME_ROOM.idFromName(room));

      // A spectator stays connected throughout: the bot-swap covers ONE absent
      // human while the table is still live. With no human present at all the
      // room pauses instead (covered by the next test).
      const carol = await Client.connect(room, 'carol', 'Carol');
      carol.send({ t: 'join' });
      await carol.next('welcome');

      // Reach the human's turn with NO pending alarm: from here, only the
      // test itself can make the room move.
      const before = await driveToQuiescentHumanTurn(stub, client);
      const seqBefore = before.seq;

      // The human's last socket closes during their turn. Poll storage until
      // the close handler has recorded the disconnect clock.
      client.ws.close(1000, 'bye');
      const since = await pollUntil(
        () =>
          runInDurableObject(stub, async (_instance, state) => {
            const meta = await state.storage.get<StoredMeta>('meta');
            return meta?.disconnectedSince?.['alice'];
          }),
        'the disconnect clock',
      );
      expect(since).toBeTypeOf('number');

      // The close handler armed the single alarm slot for the ~45s bot-swap
      // deadline — far enough out that it cannot fire on its own mid-test.
      const armed = await runInDurableObject(stub, (_instance, state) => state.storage.getAlarm());
      expect(armed).not.toBeNull();
      expect((armed ?? 0) - Date.now()).toBeGreaterThan(TRICK_HOLD_MS);

      // Rewind the stored disconnect timestamp past the deadline — the alarm
      // re-reads storage on every wake, so this is all a test needs.
      await runInDurableObject(stub, async (_instance, state) => {
        const meta = await state.storage.get<StoredMeta>('meta');
        if (meta === undefined) throw new Error('meta missing');
        meta.disconnectedSince = { alice: Date.now() - BOT_SWAP_MS - 1000 };
        await state.storage.put('meta', meta);
      });

      // Force the deadline alarm: the bot policy plays FOR the human. The
      // very next log entry must be a seat-0 action (the swap may unblock
      // further wall-clock bot turns afterwards, so only seq+1 is asserted).
      expect(await runDurableObjectAlarm(stub)).toBe(true);
      const applied = await runInDurableObject(stub, (_instance, state) =>
        state.storage.get<StoredLog>(`log:${seqBefore + 1}`),
      );
      expect(applied).toBeDefined();
      const action = applied?.action;
      expect(action?.type === 'place_bid' || action?.type === 'play_card').toBe(true);
      if (action?.type === 'place_bid' || action?.type === 'play_card') {
        expect(action.seat).toBe(0);
      }

      // Rejoining restores the seat, sees the advanced game, and clears the
      // clock (onJoin persists meta before sending the welcome).
      const again = await Client.connect(room, 'alice', 'Alice');
      again.send({ t: 'join' });
      const welcome = await again.next('welcome');
      expect(welcome.viewer).toBe(0);
      expect(welcome.seq).toBeGreaterThanOrEqual(seqBefore + 1);
      expect(welcome.view).not.toBeNull();
      const cleared = await runInDurableObject(stub, async (_instance, state) => {
        const meta = await state.storage.get<StoredMeta>('meta');
        return meta?.disconnectedSince?.['alice'];
      });
      expect(cleared).toBeUndefined();
      await endQuiet(room, client, carol, again);
    },
  );

  it(
    'plays a connected but idle human turn after the turn-timer deadline (rule ON)',
    { timeout: 45_000 },
    async () => {
      interface StoredMeta {
        turnStartedAt?: number;
        autoPlay?: Record<string, boolean>;
      }
      interface StoredLog {
        action: Action;
      }
      const room = 'room-turntimer-on';
      const client = await Client.connect(room, 'alice', 'Alice');
      await setupStartedGameWithTurnTimer(client);
      const stub = env.GAME_ROOM.get(env.GAME_ROOM.idFromName(room));

      // Reach the human's turn. Alice stays CONNECTED throughout this test —
      // the whole point is idle-but-present, unlike the disconnect bot-swap
      // test above (and unlike that case, the alarm here is ALWAYS armed,
      // for the far-future turn-timer deadline — see the helper's doc).
      const before = await driveToHumanTurnWithTimer(stub, client);
      const seqBefore = before.seq;

      // The single alarm slot is armed for the ~60s turn-timer deadline — far
      // enough out that it cannot fire on its own mid-test.
      const armed = await runInDurableObject(stub, (_instance, state) => state.storage.getAlarm());
      expect(armed).not.toBeNull();
      expect((armed ?? 0) - Date.now()).toBeGreaterThan(TRICK_HOLD_MS);

      // Rewind the stored turn-start timestamp past the deadline — the alarm
      // re-reads storage on every wake, so this is all a test needs.
      await runInDurableObject(stub, async (_instance, state) => {
        const meta = await state.storage.get<StoredMeta>('meta');
        if (meta === undefined) throw new Error('meta missing');
        meta.turnStartedAt = Date.now() - TURN_TIMER_MS - 1000;
        await state.storage.put('meta', meta);
      });

      // Force the deadline alarm: the bot policy plays FOR the still-connected,
      // idle human. The very next log entry must be a seat-0 action.
      expect(await runDurableObjectAlarm(stub)).toBe(true);
      const applied = await runInDurableObject(stub, (_instance, state) =>
        state.storage.get<StoredLog>(`log:${seqBefore + 1}`),
      );
      expect(applied).toBeDefined();
      const action = applied?.action;
      expect(action?.type === 'place_bid' || action?.type === 'play_card').toBe(true);
      if (action?.type === 'place_bid' || action?.type === 'play_card') {
        expect(action.seat).toBe(0);
      }

      // The FIRST timer expiry flips the idler's auto-play ON, so later turns
      // play on the bot cadence instead of costing the table 60s each. It
      // clears when they act or toggle it off, like the voluntary flag.
      const flipped = await runInDurableObject(stub, async (_instance, state) => {
        const meta = await state.storage.get<StoredMeta>('meta');
        return meta?.autoPlay?.['alice'];
      });
      expect(flipped).toBe(true);

      await endQuiet(room, client);
    },
  );

  it(
    'exposes turnTimerAt (never botSwapAt) for a connected human on turn with the rule ON',
    { timeout: 30_000 },
    async () => {
      const room = 'room-turntimer-roster';
      const alice = await Client.connect(room, 'alice', 'Alice');
      await setupStartedGameWithTurnTimer(alice);
      const stub = env.GAME_ROOM.get(env.GAME_ROOM.idFromName(room));
      await driveToHumanTurnWithTimer(stub, alice);

      // A fresh spectator's welcome snapshots the roster as it stands now:
      // Alice is CONNECTED and on turn — her per-turn clock must ride the
      // dedicated turnTimerAt field, never the disconnect botSwapAt (the
      // client labels that one "Away").
      const carol = await Client.connect(room, 'carol', 'Carol');
      carol.send({ t: 'join' });
      const w = await carol.next('welcome');
      const seat0 = w.roster.seats[0];
      expect(seat0?.connected).toBe(true);
      expect(seat0?.botSwapAt).toBeUndefined();
      expect(seat0?.turnTimerAt).toBeTypeOf('number');
      const remaining = (seat0?.turnTimerAt ?? 0) - Date.now();
      expect(remaining).toBeGreaterThan(0);
      expect(remaining).toBeLessThanOrEqual(TURN_TIMER_MS + 1000);
      // The stamp rides along for client clock-skew correction.
      expect(w.roster.now).toBeTypeOf('number');

      await endQuiet(room, alice, carol);
    },
  );

  it(
    "im_here restarts the on-turn clock — and ignores anyone who isn't on turn",
    { timeout: 30_000 },
    async () => {
      interface StoredMeta {
        turnStartedAt?: number;
      }
      const room = 'room-imhere';
      const alice = await Client.connect(room, 'alice', 'Alice');
      await setupStartedGameWithTurnTimer(alice);
      const stub = env.GAME_ROOM.get(env.GAME_ROOM.idFromName(room));
      await driveToHumanTurnWithTimer(stub, alice);

      const readTurnStart = () =>
        runInDurableObject(stub, async (_instance, state) => {
          const meta = await state.storage.get<StoredMeta>('meta');
          return meta?.turnStartedAt;
        });
      const before = await readTurnStart();
      expect(before).toBeTypeOf('number');

      // Someone NOT on turn (an unseated joiner) taps "I'm here": no-op.
      const carol = await Client.connect(room, 'carol', 'Carol');
      carol.send({ t: 'join' });
      await carol.next('welcome');
      carol.send({ t: 'im_here' });
      await sleep(100);
      expect(await readTurnStart()).toBe(before);

      // The on-turn human taps it: the clock restarts (strictly later stamp).
      // Poll storage rather than the broadcast stream — alice's queue holds
      // stale rosters from setup, so "the next roster" isn't the im_here one.
      await sleep(30); // Date.now() must be able to exceed `before`
      alice.send({ t: 'im_here' });
      const after = await pollUntil(async () => {
        const v = await readTurnStart();
        return v !== undefined && v > (before ?? 0) ? v : undefined;
      }, 'turnStartedAt reset by im_here');

      // A fresh joiner's welcome snapshots the roster as it stands now: the
      // seat-0 deadline rides the RESET stamp (a full timer from `after`).
      const dave = await Client.connect(room, 'dave', 'Dave');
      dave.send({ t: 'join' });
      const w = await dave.next('welcome');
      expect(w.roster.seats[0]?.turnTimerAt).toBe(after + TURN_TIMER_MS);

      await endQuiet(room, alice, carol, dave);
    },
  );

  it(
    'leaves a connected, idle human turn alone with the turn-timer rule OFF',
    { timeout: 20_000 },
    async () => {
      const room = 'room-turntimer-off';
      const client = await Client.connect(room, 'alice', 'Alice');
      await setupStartedGame(client); // helper opts out of the (default-on) rule
      const stub = env.GAME_ROOM.get(env.GAME_ROOM.idFromName(room));

      // Quiescent at the human's turn implies NO alarm is armed for it — with
      // the rule off, an idle-but-connected human never gets a deadline.
      const before = await driveToQuiescentHumanTurn(stub, client);
      const armed = await runInDurableObject(stub, (_instance, state) => state.storage.getAlarm());
      expect(armed).toBeNull();

      // Forcing a wake anyway finds nothing due and must not act for them —
      // the existing pause-for-a-connected-human behavior stays intact.
      expect(await runDurableObjectAlarm(stub)).toBe(false);
      const after = await snapshot(stub);
      expect(after.seq).toBe(before.seq);
      expect(after.turn).toBe(0);

      await endQuiet(room, client);
    },
  );

  it(
    'frees a PRE-game seat whose human vanished past the grace — no ghost seats',
    { timeout: 20_000 },
    async () => {
      interface StoredMeta {
        seats?: unknown[];
        disconnectedSince?: Record<string, number>;
      }
      const room = 'room-pregame-vacate';
      const alice = await Client.connect(room, 'alice', 'Alice');
      alice.send({ t: 'join' });
      await alice.next('welcome');
      alice.send({ t: 'sit', seat: 0 });
      await alice.next('roster');
      // Bob spectates so the freed seat's roster broadcast has a witness.
      const bob = await Client.connect(room, 'bob', 'Bob');
      bob.send({ t: 'join' });
      await bob.next('welcome');

      const stub = env.GAME_ROOM.get(env.GAME_ROOM.idFromName(room));
      alice.ws.close(1000, 'tab closed');
      await pollUntil(
        () =>
          runInDurableObject(stub, async (_instance, state) => {
            const meta = await state.storage.get<StoredMeta>('meta');
            return meta?.disconnectedSince?.['alice'];
          }),
        'the pre-game disconnect clock',
      );

      // Inside the grace: the alarm keeps the seat and re-arms for later.
      expect(await runDurableObjectAlarm(stub)).toBe(true);
      const kept = await runInDurableObject(stub, async (_instance, state) => {
        const meta = await state.storage.get<StoredMeta>('meta');
        return { seat: meta?.seats?.[0], alarm: await state.storage.getAlarm() };
      });
      expect(kept.seat).toBe('alice');
      expect(kept.alarm).not.toBeNull();

      // Past the grace: the seat frees and the clock entry clears.
      await runInDurableObject(stub, async (_instance, state) => {
        const meta = await state.storage.get<StoredMeta>('meta');
        if (meta === undefined) throw new Error('meta missing');
        meta.disconnectedSince = { alice: Date.now() - PREGAME_VACATE_MS - 1000 };
        await state.storage.put('meta', meta);
      });
      expect(await runDurableObjectAlarm(stub)).toBe(true);
      const after = await runInDurableObject(stub, async (_instance, state) => {
        const meta = await state.storage.get<StoredMeta>('meta');
        return { seat: meta?.seats?.[0], since: meta?.disconnectedSince?.['alice'] };
      });
      expect(after.seat).toBeNull();
      expect(after.since).toBeUndefined();

      // The room told everyone: bob's roster now shows the open seat.
      const deadline = Date.now() + 5000;
      let freed = false;
      while (!freed && Date.now() < deadline) {
        const r = await bob.next('roster');
        if (r.roster.seats[0] === null) freed = true;
      }
      expect(freed).toBe(true);
      await endQuiet(room, alice, bob);
    },
  );

  it(
    "stops advertising a public room once the pre-game vacate frees the last human's seat",
    { timeout: 20_000 },
    async () => {
      interface StoredMeta {
        seats?: unknown[];
        disconnectedSince?: Record<string, number>;
        lobbyListed?: boolean;
      }
      interface StoredLobbyEntry {
        readonly code: string;
      }
      const room = 'room-pregame-vacate-delists';
      const alice = await Client.connect(room, 'alice', 'Alice');
      alice.send({ t: 'join' });
      await alice.next('welcome');
      alice.send({ t: 'sit', seat: 0 });
      await alice.next('roster');
      alice.send({ t: 'set_public', on: true });
      const publicRoster = await pollUntil(async () => {
        const r = alice.latestRoster();
        return r?.public === true ? r : undefined;
      }, 'the public roster echo');
      expect(publicRoster.public).toBe(true);

      const stub = env.GAME_ROOM.get(env.GAME_ROOM.idFromName(room));
      const lobbyStub = env.LOBBY.get(env.LOBBY.idFromName('lobby'));

      // Registration landed: the room persisted lobbyListed and the Lobby DO's
      // own storage now carries this room's code.
      await pollUntil(
        () =>
          runInDurableObject(stub, async (_instance, state) => {
            const meta = await state.storage.get<StoredMeta>('meta');
            return meta?.lobbyListed === true ? true : undefined;
          }),
        'the room to record itself as lobby-listed',
      );
      const registered = await runInDurableObject(lobbyStub, async (_instance, state) => {
        const rooms = await state.storage.get<Record<string, StoredLobbyEntry>>('rooms');
        return rooms?.[room];
      });
      expect(registered).toBeDefined();

      // Alice — the room's only human — vanishes past the pre-game grace,
      // same as the ghost-seat test above.
      alice.ws.close(1000, 'tab closed');
      await pollUntil(
        () =>
          runInDurableObject(stub, async (_instance, state) => {
            const meta = await state.storage.get<StoredMeta>('meta');
            return meta?.disconnectedSince?.['alice'];
          }),
        'the pre-game disconnect clock',
      );
      await runInDurableObject(stub, async (_instance, state) => {
        const meta = await state.storage.get<StoredMeta>('meta');
        if (meta === undefined) throw new Error('meta missing');
        meta.disconnectedSince = { alice: Date.now() - PREGAME_VACATE_MS - 1000 };
        await state.storage.put('meta', meta);
      });
      expect(await runDurableObjectAlarm(stub)).toBe(true);

      // The freed seat drops humans to zero — lobbyEntry() now returns null,
      // and the alarm's trailing syncLobby deregisters the table.
      const after = await runInDurableObject(stub, async (_instance, state) => {
        const meta = await state.storage.get<StoredMeta>('meta');
        return { seat: meta?.seats?.[0], lobbyListed: meta?.lobbyListed };
      });
      expect(after.seat).toBeNull();
      expect(after.lobbyListed).not.toBe(true);

      const deregistered = await pollUntil(
        () =>
          runInDurableObject(lobbyStub, async (_instance, state) => {
            const rooms = await state.storage.get<Record<string, StoredLobbyEntry>>('rooms');
            return rooms === undefined || !(room in rooms) ? true : undefined;
          }),
        'the Lobby DO to drop the deregistered room',
      );
      expect(deregistered).toBe(true);

      await endQuiet(room, alice);
      // Guard the Lobby DO's own pending TTL alarm the same way endQuiet()
      // guards the room's, so it doesn't trip vitest's isolated-storage
      // teardown.
      const lobbyDeadline = Date.now() + 5000;
      for (;;) {
        await runInDurableObject(lobbyStub, (_instance, state) => state.storage.deleteAlarm());
        await sleep(30);
        const alarm = await runInDurableObject(lobbyStub, (_instance, state) =>
          state.storage.getAlarm(),
        );
        if (alarm === null || Date.now() > lobbyDeadline) break;
      }
    },
  );

  it(
    'pauses the table when the last human leaves, and resumes when one returns',
    { timeout: 20_000 },
    async () => {
      interface StoredMeta {
        disconnectedSince?: Record<string, number>;
      }
      const room = 'room-pause-empty';
      const alice = await Client.connect(room, 'alice', 'Alice');
      await setupStartedGame(alice); // seat 0 human + 3 bots
      const stub = env.GAME_ROOM.get(env.GAME_ROOM.idFromName(room));

      // Reach alice's turn with no pending alarm, then drop her last socket:
      // she is the only human, so the table must freeze rather than let bots
      // play on to game_over in an empty room.
      const before = await driveToQuiescentHumanTurn(stub, alice);
      const seqBefore = before.seq;
      alice.ws.close(1000, 'bye');
      await pollUntil(
        () =>
          runInDurableObject(stub, async (_instance, state) => {
            const meta = await state.storage.get<StoredMeta>('meta');
            return meta?.disconnectedSince?.['alice'];
          }),
        'the disconnect clock',
      );

      // No human present → the close handler armed no alarm. The table is paused.
      const armed = await runInDurableObject(stub, (_instance, state) => state.storage.getAlarm());
      expect(armed).toBeNull();

      // Even after the bot-swap deadline passes, nothing is scheduled to advance
      // the game — bots don't play into an empty room. (runDurableObjectAlarm
      // returns false when no alarm is on the slot to fire.)
      await runInDurableObject(stub, async (_instance, state) => {
        const meta = await state.storage.get<StoredMeta>('meta');
        if (meta === undefined) throw new Error('meta missing');
        meta.disconnectedSince = { alice: Date.now() - BOT_SWAP_MS - 1000 };
        await state.storage.put('meta', meta);
      });
      expect(await runDurableObjectAlarm(stub)).toBe(false);
      const afterPause = await snapshot(stub);
      expect(afterPause.seq).toBe(seqBefore);
      expect(afterPause.phase).toBe(before.phase);

      // Reset the disconnect clock to the present so the resume re-arm lands ~45s
      // out (not immediately) and can't fire a self-perpetuating bot chain into
      // teardown — the isolated-storage swap races a live alarm on Windows.
      await runInDurableObject(stub, async (_instance, state) => {
        const meta = await state.storage.get<StoredMeta>('meta');
        if (meta === undefined) throw new Error('meta missing');
        meta.disconnectedSince = { alice: Date.now() };
        await state.storage.put('meta', meta);
      });

      // A human returns — a spectator is enough. onJoin re-arms the wake so the
      // table is live again (from here the deadline alarm would bot-swap the
      // still-absent alice; we assert the re-arm rather than run the chain).
      const carol = await Client.connect(room, 'carol', 'Carol');
      carol.send({ t: 'join' });
      await carol.next('welcome');
      const resumed = await runInDurableObject(stub, (_instance, state) =>
        state.storage.getAlarm(),
      );
      expect(resumed).not.toBeNull();

      await endQuiet(room, alice, carol);
    },
  );

  it(
    'exposes botSwapAt on a disconnected human seat and clears it on rejoin',
    { timeout: 20_000 },
    async () => {
      const room = 'room-botswapat';
      const alice = await Client.connect(room, 'alice', 'Alice');
      await setupStartedGame(alice); // seat 0 human + 3 bots, phase bidding

      // A spectator stays connected to observe roster broadcasts (alice's own
      // socket won't receive them once it closes).
      const carol = await Client.connect(room, 'carol', 'Carol');
      carol.send({ t: 'join' });
      await carol.next('welcome');

      // Alice drops mid-game — the disconnect roster must carry her deadline.
      const closeAt = Date.now();
      alice.ws.close(1000, 'bye');
      let botSwapAt: number | undefined;
      const deadline = Date.now() + 5000;
      while (Date.now() < deadline && botSwapAt === undefined) {
        const r = await carol.next('roster');
        botSwapAt = r.roster.seats[0]?.botSwapAt;
      }
      expect(botSwapAt).toBeTypeOf('number');
      // Absolute epoch ms ≈ closeAt + BOT_SWAP_MS.
      expect((botSwapAt ?? 0) - closeAt).toBeGreaterThan(BOT_SWAP_MS - 5000);
      expect((botSwapAt ?? 0) - closeAt).toBeLessThan(BOT_SWAP_MS + 5000);

      // Rejoining clears the deadline in the next roster the spectator sees.
      const again = await Client.connect(room, 'alice', 'Alice');
      again.send({ t: 'join' });
      await again.next('welcome');
      let cleared = false;
      const deadline2 = Date.now() + 5000;
      while (Date.now() < deadline2 && !cleared) {
        const r = await carol.next('roster');
        const seat0 = r.roster.seats[0];
        cleared = seat0?.connected === true && seat0.botSwapAt === undefined;
      }
      expect(cleared).toBe(true);
      await endQuiet(room, alice, carol, again);
    },
  );

  it(
    'flips a past-deadline away seat to botPlaying — never a countdown pinned at zero',
    { timeout: 45_000 },
    async () => {
      interface StoredMeta {
        disconnectedSince?: Record<string, number>;
      }
      const room = 'room-botplaying';
      const alice = await Client.connect(room, 'alice', 'Alice');
      await setupStartedGame(alice);
      const stub = env.GAME_ROOM.get(env.GAME_ROOM.idFromName(room));

      // A spectator observes the rosters; alice's socket is about to close.
      const carol = await Client.connect(room, 'carol', 'Carol');
      carol.send({ t: 'join' });
      await carol.next('welcome');

      await driveToQuiescentHumanTurn(stub, alice);
      alice.ws.close(1000, 'bye');
      await pollUntil(
        () =>
          runInDurableObject(stub, async (_instance, state) => {
            const meta = await state.storage.get<StoredMeta>('meta');
            return meta?.disconnectedSince?.['alice'];
          }),
        'the disconnect clock',
      );

      // Rewind past the deadline and let the alarm cover her turn. The roster
      // that rides that action must advertise the STEADY state: botPlaying,
      // with the (now expired) botSwapAt gone — a client left ticking a past
      // deadline showed "Bot taking over…" forever, which is the bug.
      await runInDurableObject(stub, async (_instance, state) => {
        const meta = await state.storage.get<StoredMeta>('meta');
        if (meta === undefined) throw new Error('meta missing');
        meta.disconnectedSince = { alice: Date.now() - BOT_SWAP_MS - 1000 };
        await state.storage.put('meta', meta);
      });
      expect(await runDurableObjectAlarm(stub)).toBe(true);

      let seat0: Roster['seats'][number] | undefined;
      const deadline = Date.now() + 5000;
      while (Date.now() < deadline && seat0?.botPlaying !== true) {
        const r = await carol.next('roster');
        seat0 = r.roster.seats[0];
        // No roster may ever carry a deadline that is already in the past.
        if (seat0?.botSwapAt !== undefined) {
          expect(seat0.botSwapAt).toBeGreaterThan(Date.now() - 1000);
        }
      }
      expect(seat0?.botPlaying).toBe(true);
      expect(seat0?.botSwapAt).toBeUndefined();
      expect(seat0?.isBot).toBe(false); // still her seat — covered, not replaced

      // A fresh joiner's welcome snapshot says the same thing.
      const dave = await Client.connect(room, 'dave', 'Dave');
      dave.send({ t: 'join' });
      const w = await dave.next('welcome');
      expect(w.roster.seats[0]?.botPlaying).toBe(true);
      expect(w.roster.seats[0]?.botSwapAt).toBeUndefined();

      await endQuiet(room, alice, carol, dave);
    },
  );

  it(
    'a game start restarts a lingering disconnect clock — no instant bot coverage',
    { timeout: 30_000 },
    async () => {
      interface StoredMeta {
        disconnectedSince?: Record<string, number>;
      }
      const room = 'room-start-restamp';
      const alice = await Client.connect(room, 'alice', 'Alice');
      alice.send({ t: 'join' });
      await alice.next('welcome');
      alice.send({ t: 'sit', seat: 0 });
      await alice.next('roster');
      const bob = await Client.connect(room, 'bob', 'Bob');
      bob.send({ t: 'join' });
      await bob.next('welcome');
      bob.send({ t: 'sit', seat: 1 });
      await bob.next('roster');
      for (const seat of [2, 3] as const) {
        alice.send({ t: 'add_bot', seat });
        await alice.next('roster');
      }

      // Bob vanishes pre-game; age his stamp PAST the mid-game swap deadline
      // (but inside the pre-game vacate grace, so his seat is still his).
      const stub = env.GAME_ROOM.get(env.GAME_ROOM.idFromName(room));
      bob.ws.close(1000, 'tab closed');
      await pollUntil(
        () =>
          runInDurableObject(stub, async (_instance, state) => {
            const meta = await state.storage.get<StoredMeta>('meta');
            return meta?.disconnectedSince?.['bob'];
          }),
        'the pre-game disconnect clock',
      );
      const aged = Date.now() - BOT_SWAP_MS - 5000;
      await runInDurableObject(stub, async (_instance, state) => {
        const meta = await state.storage.get<StoredMeta>('meta');
        if (meta === undefined) throw new Error('meta missing');
        meta.disconnectedSince = { bob: aged };
        await state.storage.put('meta', meta);
      });

      // Starting the game must hand bob a FULL fresh grace — not bot-cover him
      // from the very first bid because his stamp predates the game.
      const startBefore = Date.now();
      alice.send({ t: 'start' });
      await alice.next('view');
      const since = await runInDurableObject(stub, async (_instance, state) => {
        const meta = await state.storage.get<StoredMeta>('meta');
        return meta?.disconnectedSince?.['bob'];
      });
      expect(since).toBeTypeOf('number');
      expect(since ?? 0).toBeGreaterThanOrEqual(startBefore);

      // And the roster shows a future countdown, never the covered state.
      let seat1: Roster['seats'][number] | undefined;
      const deadline = Date.now() + 5000;
      while (Date.now() < deadline && seat1?.botSwapAt === undefined) {
        const r = await alice.next('roster');
        seat1 = r.roster.seats[1];
        expect(seat1?.botPlaying).toBeUndefined();
      }
      expect((seat1?.botSwapAt ?? 0) - Date.now()).toBeGreaterThan(BOT_SWAP_MS - 5000);

      await endQuiet(room, alice, bob);
    },
  );

  it(
    'an all-bots table advances past round_over on its own (spectators keep watching)',
    { timeout: 120_000 },
    async () => {
      const room = 'room-allbots-recap';
      const alice = await Client.connect(room, 'alice', 'Alice');
      await setupStartedGame(alice); // rule OFF — the fix must not depend on it
      const stub = env.GAME_ROOM.get(env.GAME_ROOM.idFromName(room));

      // Alice gives up her seat for good: all four seats are now bots, and her
      // socket stays connected as a spectator (a "Watch live games" viewer).
      alice.send({ t: 'leave' });
      await welcomeViewer(alice, 'spectator');

      // Drive the alarms: the bots must play through round_over WITHOUT any
      // human ever sending `ready` — the recap-beat wake + the alarm's
      // unconditional continueIfAllReady carry it into the next round.
      let sawRoundOver = false;
      let advanced = false;
      const deadline = Date.now() + 90_000;
      while (!advanced && Date.now() < deadline) {
        const g = await runInDurableObject(stub, async (_instance, state) => {
          const stored = await state.storage.get<string>('game');
          return stored !== undefined ? deserialize(stored) : null;
        });
        if (g?.phase === 'round_over') sawRoundOver = true;
        if (sawRoundOver && g !== null && g.phase !== 'round_over') {
          advanced = true;
          break;
        }
        const ran = await runDurableObjectAlarm(stub);
        if (!ran) await sleep(25);
      }
      expect(sawRoundOver).toBe(true);
      expect(advanced).toBe(true);

      await endQuiet(room, alice);
    },
  );

  it(
    'with the turn-timer rule ON, an idle connected human is auto-readied after the recap timeout',
    { timeout: 60_000 },
    async () => {
      interface StoredMeta {
        turnStartedAt?: number;
        autoPlay?: Record<string, boolean>;
      }
      const room = 'room-recap-timeout';
      const alice = await Client.connect(room, 'alice', 'Alice');
      const startView = await setupStartedGameWithTurnTimer(alice);
      const stub = env.GAME_ROOM.get(env.GAME_ROOM.idFromName(room));

      // Play the first round out (alice via the bot policy, bots via alarms),
      // stopping the moment the recap appears — alice never sends `ready`.
      const rng = mulberry32(7);
      let view = startView;
      const driveDeadline = Date.now() + 45_000;
      while (view.phase !== 'round_over') {
        if (Date.now() > driveDeadline) throw new Error('never reached round_over');
        view = alice.latestView() ?? view;
        if (view.phase === 'round_over') break;
        if ((view.phase === 'bidding' || view.phase === 'playing') && view.turn === 0) {
          const action = chooseAction(view, rng);
          if (action === null) throw new Error('bot policy returned no action');
          alice.send({ t: 'action', action: toWire(action) });
          const reply = await alice.nextAny(['view', 'error']);
          if (reply.t === 'view') view = reply.view;
        } else {
          const ran = await runDurableObjectAlarm(stub);
          if (ran) view = (await alice.next('view')).view;
          else await sleep(20);
        }
      }

      // The recap stamped its start and armed the ready-timeout alarm.
      const stamped = await runInDurableObject(stub, async (_instance, state) => {
        const meta = await state.storage.get<StoredMeta>('meta');
        return { turnStartedAt: meta?.turnStartedAt, alarm: await state.storage.getAlarm() };
      });
      expect(stamped.turnStartedAt).toBeTypeOf('number');
      expect(stamped.alarm).not.toBeNull();

      // The roster advertises the recap deadline room-wide (readyTimeoutAt) —
      // that's what the client's "Auto-ready in 0:12" line under the Ready
      // button ticks against. A fresh joiner's welcome snapshot carries it.
      const bob = await Client.connect(room, 'bob', 'Bob');
      bob.send({ t: 'join' });
      const w = await bob.next('welcome');
      expect(w.roster.readyTimeoutAt).toBe((stamped.turnStartedAt ?? 0) + TURN_TIMER_MS);

      // BEFORE the deadline a forced wake must leave her un-readied.
      expect(await runDurableObjectAlarm(stub)).toBe(true);
      const still = await snapshot(stub);
      expect(still.phase).toBe('round_over');

      // Rewind the recap start past the timer: the wake readies her (everyone
      // else is a bot), which deals the next round — WITHOUT flipping her
      // auto-play (idling a recap isn't playing badly).
      await runInDurableObject(stub, async (_instance, state) => {
        const meta = await state.storage.get<StoredMeta>('meta');
        if (meta === undefined) throw new Error('meta missing');
        meta.turnStartedAt = Date.now() - TURN_TIMER_MS - 1000;
        await state.storage.put('meta', meta);
      });
      expect(await runDurableObjectAlarm(stub)).toBe(true);
      const after = await snapshot(stub);
      expect(after.phase === 'bidding' || after.phase === 'playing').toBe(true);
      const flipped = await runInDurableObject(stub, async (_instance, state) => {
        const meta = await state.storage.get<StoredMeta>('meta');
        return meta?.autoPlay?.['alice'];
      });
      expect(flipped).toBeUndefined();

      await endQuiet(room, alice, bob);
    },
  );

  it(
    'voluntary auto-play plays the seat while on, carries the roster flag, and toggling off returns control',
    { timeout: 30_000 },
    async () => {
      interface StoredMeta {
        autoPlay?: Record<string, boolean>;
      }
      interface StoredLog {
        action: Action;
      }
      const room = 'room-autoplay';
      const client = await Client.connect(room, 'alice', 'Alice');
      await setupStartedGame(client); // seat 0 human + 3 bots
      const stub = env.GAME_ROOM.get(env.GAME_ROOM.idFromName(room));

      // Reach alice's own turn with no pending alarm: from here only the test
      // (or her auto-play) can move the room.
      const before = await driveToQuiescentHumanTurn(stub, client);
      const seqBefore = before.seq;

      // Turn auto-play ON. The seat stays alice's; the roster must advertise it,
      // and the handler arms the alarm so her held turn is played on bot cadence.
      client.send({ t: 'set_autoplay', on: true });
      let onFlag: boolean | undefined;
      const onDeadline = Date.now() + 5000;
      while (Date.now() < onDeadline && onFlag !== true) {
        const r = await client.next('roster');
        const seat0 = r.roster.seats[0];
        onFlag = seat0?.autoPlay;
        expect(seat0?.isBot).toBe(false); // still a human seat, just auto-played
      }
      expect(onFlag).toBe(true);
      const stored = await runInDurableObject(stub, async (_instance, state) => {
        const meta = await state.storage.get<StoredMeta>('meta');
        return meta?.autoPlay?.['alice'];
      });
      expect(stored).toBe(true);

      // The alarm now plays FOR alice: the next log entry is a seat-0 action.
      expect(await runDurableObjectAlarm(stub)).toBe(true);
      const applied = await runInDurableObject(stub, (_instance, state) =>
        state.storage.get<StoredLog>(`log:${seqBefore + 1}`),
      );
      expect(applied).toBeDefined();
      const action = applied?.action;
      expect(action?.type === 'place_bid' || action?.type === 'play_card').toBe(true);
      if (action?.type === 'place_bid' || action?.type === 'play_card') {
        expect(action.seat).toBe(0);
      }

      // Turn auto-play OFF: the flag clears and control returns to alice. Reach
      // her turn again with no alarm armed, then prove an alarm wake does NOT
      // auto-advance her seat (a connected human's turn is hers to play).
      client.send({ t: 'set_autoplay', on: false });
      const offCleared = await pollUntil(
        () =>
          runInDurableObject(stub, async (_instance, state) => {
            const meta = await state.storage.get<StoredMeta>('meta');
            return meta?.autoPlay?.['alice'] === undefined ? true : undefined;
          }),
        'auto-play cleared',
      );
      expect(offCleared).toBe(true);

      const quiet = await driveToQuiescentHumanTurn(stub, client);
      // No alarm is armed for a connected human whose auto-play is off, and
      // forcing a wake leaves the sequence untouched — the turn waits for her.
      await runDurableObjectAlarm(stub);
      const after = await snapshot(stub);
      expect(after.seq).toBe(quiet.seq);
      expect(after.turn).toBe(0);

      await endQuiet(room, client);
    },
  );

  it(
    'auto-play readies the round recap and bids the next round unattended',
    { timeout: 30_000 },
    async () => {
      const room = 'room-autoplay-ready';
      const client = await Client.connect(room, 'alice', 'Alice');
      await setupStartedGame(client); // seat 0 human + 3 bots
      const stub = env.GAME_ROOM.get(env.GAME_ROOM.idFromName(room));

      // Auto-play ON from the first bid; alice never sends another message.
      // The alarm chain must carry the table through the whole round, ready
      // the recap FOR her (autoPlay counts at round_over), and open the next
      // round's bidding — all without a single 'ready' or action from her.
      client.send({ t: 'set_autoplay', on: true });
      let sawRoundOver = false;
      const deadline = Date.now() + 25_000;
      for (;;) {
        const snap = await snapshot(stub);
        if (snap.phase === 'round_over') sawRoundOver = true;
        if (sawRoundOver && (snap.phase === 'bidding' || snap.phase === 'playing')) break;
        if (snap.phase === 'game_over') throw new Error('game ended before a round boundary');
        if (Date.now() > deadline) {
          throw new Error(`stalled at ${String(snap.phase)} — auto-play did not ready the round`);
        }
        const ran = await runDurableObjectAlarm(stub);
        if (!ran) await sleep(25);
      }
      expect(sawRoundOver).toBe(true);

      await endQuiet(room, client);
    },
  );

  /** Skip past buffered seat welcomes (sit/onJoin each send one) to the
   * demotion welcome a leave produces. */
  async function nextSpectatorWelcome(client: Client) {
    const deadline = Date.now() + 5000;
    for (;;) {
      const w = await client.next('welcome');
      if (w.viewer === 'spectator') return w;
      if (Date.now() > deadline) throw new Error('no spectator welcome arrived');
    }
  }

  it('frees a seat on leave — pre-game vacates, and the HTTP route works without a socket', async () => {
    const room = 'room-leave';
    const alice = await Client.connect(room, 'alice', 'Alice');
    alice.send({ t: 'join' });
    await alice.next('welcome');
    alice.send({ t: 'sit', seat: 0 });
    await alice.next('roster');

    const bob = await Client.connect(room, 'bob', 'Bob');
    bob.send({ t: 'join' });
    await bob.next('welcome');
    bob.send({ t: 'sit', seat: 1 });
    await bob.next('roster');

    // Alice leaves over the socket: she drops to spectator (fresh welcome) and
    // her pre-game seat frees up entirely.
    alice.send({ t: 'leave' });
    const demoted = await nextSpectatorWelcome(alice);
    expect(demoted.viewer).toBe('spectator');
    const afterLeave = await pollUntil(async () => {
      const r = bob.latestRoster();
      return r !== null && r.seats[0] === null ? r : undefined;
    }, "alice's seat to free up");
    expect(afterLeave.seats[1]).toMatchObject({ name: 'Bob', isBot: false });

    // Bob leaves over HTTP (the home "Your tables" row) — no socket needed.
    const res = await SELF.fetch(`https://example.com/api/room/${room}/leave?u=bob`, {
      method: 'POST',
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ left: true });
    const emptied = await pollUntil(async () => {
      const r = alice.latestRoster();
      return r !== null && r.seats[1] === null ? r : undefined;
    }, "bob's seat to free up");
    expect(emptied.seats).toEqual([null, null, null, null]);

    // Leaving without a seat is a harmless no-op.
    const again = await SELF.fetch(`https://example.com/api/room/${room}/leave?u=bob`, {
      method: 'POST',
    });
    expect(await again.json()).toEqual({ left: false });
    await endQuiet(room, alice, bob);
  });

  it('hands a mid-game leaver’s seat to a bot so the table stays playable', async () => {
    const room = 'room-leave-midgame';
    const alice = await Client.connect(room, 'alice', 'Alice');
    await setupStartedGame(alice); // seat 0 human + 3 bots, phase bidding

    // A spectator observes the roster (alice's socket also stays open, as a
    // spectator, after she gives the seat up).
    const carol = await Client.connect(room, 'carol', 'Carol');
    carol.send({ t: 'join' });
    await carol.next('welcome');

    alice.send({ t: 'leave' });
    const demoted = await nextSpectatorWelcome(alice);
    expect(demoted.viewer).toBe('spectator');
    expect(demoted.view?.hand).toEqual([]); // no hand for a spectator
    const swapped = await pollUntil(async () => {
      const r = carol.latestRoster();
      return r?.seats[0]?.isBot === true ? r : undefined;
    }, 'the seat to hand to a bot');
    expect(swapped.seats[0]).toMatchObject({ isBot: true, connected: true });

    await endQuiet(room, alice, carol);
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
    await endQuiet(room, alice, bob);
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
    await endQuiet(room, alice, carol);
  });

  it('lets a spectator take over a bot seat mid-game, but not a taken human seat', async () => {
    const room = 'room-takeover';
    const alice = await Client.connect(room, 'alice', 'Alice');
    await setupStartedGame(alice); // seat 0 human + 3 bots, phase bidding

    const bob = await Client.connect(room, 'bob', 'Bob');
    bob.send({ t: 'join' });
    const bobWelcome = await bob.next('welcome');
    expect(bobWelcome.viewer).toBe('spectator');

    // Take over seat 1, a bot seat.
    bob.send({ t: 'sit', seat: 1 });
    const welcome = await bob.next('welcome');
    expect(welcome.viewer).toBe(1);
    expect(welcome.view).not.toBeNull();
    expect(welcome.view?.hand.length).toBeGreaterThan(0);

    const roster = await bob.next('roster');
    expect(roster.roster.seats[1]).toMatchObject({ isBot: false, name: 'Bob', connected: true });

    // Alice's own seat is a connected human — not takeable.
    bob.send({ t: 'sit', seat: 0 });
    const taken = await bob.next('error');
    expect(taken.code).toBe('SEAT_TAKEN');

    await endQuiet(room, alice, bob);
  });

  it('rate-limits chat to 5 per 10s, broadcasting the first 5 and erroring the 6th', async () => {
    const room = 'room-chatrate';
    const alice = await Client.connect(room, 'alice', 'Alice');
    alice.send({ t: 'join' });
    await alice.next('welcome');

    for (let i = 0; i < 6; i++) {
      alice.send({ t: 'chat', text: `msg ${i}` });
    }
    const chats: string[] = [];
    let errorCode: string | null = null;
    for (let i = 0; i < 6; i++) {
      const msg = await alice.nextAny(['chat', 'error']);
      if (msg.t === 'chat') chats.push(msg.entry.text);
      else errorCode = msg.code;
    }
    expect(chats).toHaveLength(5);
    expect(errorCode).toBe('CHAT_RATE');

    await endQuiet(room, alice);
  });

  it(
    'host kicks a seated human pre-game; the kicked user cannot re-sit, ' +
      'another may take the seat, and a non-host kick attempt is rejected',
    async () => {
      const room = 'room-kick';
      const alice = await Client.connect(room, 'alice', 'Alice');
      alice.send({ t: 'join' });
      await alice.next('welcome');
      alice.send({ t: 'sit', seat: 0 });
      const hostRoster = await alice.next('roster');
      expect(hostRoster.roster.hostSeat).toBe(0); // first sitter is the host

      const bob = await Client.connect(room, 'bob', 'Bob');
      bob.send({ t: 'join' });
      await bob.next('welcome');
      bob.send({ t: 'sit', seat: 1 });
      await welcomeViewer(bob, 1);

      // Bob (not the host) tries to kick alice — rejected, and (proven below)
      // nothing changes: alice still succeeds at kicking bob's still-occupied
      // seat right after.
      bob.send({ t: 'kick', seat: 0 });
      const notHost = await bob.next('error');
      expect(notHost.code).toBe('NOT_HOST');

      // Alice (the host) kicks bob's seat.
      alice.send({ t: 'kick', seat: 1 });
      const afterKick = await pollUntil(async () => {
        const r = alice.latestRoster();
        return r !== null && r.seats[1] === null ? r : undefined;
      }, "bob's seat to free after the kick");
      expect(afterKick.seats[1]).toBeNull();

      // Bob's attempt to re-sit anywhere is rejected — he's banned from this room.
      bob.send({ t: 'sit', seat: 1 });
      const kicked = await bob.next('error');
      expect(kicked.code).toBe('KICKED');

      // Carol can still take the freed seat.
      const carol = await Client.connect(room, 'carol', 'Carol');
      carol.send({ t: 'join' });
      await carol.next('welcome');
      carol.send({ t: 'sit', seat: 1 });
      await welcomeViewer(carol, 1);

      await endQuiet(room, alice, bob, carol);
    },
  );
});

/* ── Shared music queue ──────────────────────────────────────────────────── */

/** The exact oEmbed path the DO requests for a video id (query included), so
 * each test registers precise one-shot interceptors — no persist shadowing. */
const oembedPath = (videoId: string) =>
  `/oembed?url=${encodeURIComponent(`https://www.youtube.com/watch?v=${videoId}`)}&format=json`;

function mockOEmbedOk(videoId: string, title = 'Test Song', times = 1): void {
  fetchMock
    .get('https://www.youtube.com')
    .intercept({ path: oembedPath(videoId) })
    .reply(200, {
      title,
      author_name: 'Test Artist',
      thumbnail_url: 'https://i.ytimg.com/vi/x/hqdefault.jpg',
    })
    .times(times);
}

function mockOEmbedMissing(videoId: string): void {
  fetchMock
    .get('https://www.youtube.com')
    .intercept({ path: oembedPath(videoId) })
    .reply(404, 'Not Found');
}

/** Authoritative music state straight from DO storage. */
interface StoredMusicSnap {
  readonly queue: readonly { readonly id: string; readonly videoId: string }[];
  readonly current: {
    readonly id: string;
    readonly videoId: string;
    readonly startedAt: number;
  } | null;
  readonly nextId: number;
}

async function musicSnapshot(room: string): Promise<StoredMusicSnap | undefined> {
  const stub = env.GAME_ROOM.get(env.GAME_ROOM.idFromName(room));
  return runInDurableObject(stub, (_instance, state) =>
    state.storage.get<StoredMusicSnap>('music'),
  );
}

/** join a fresh client and swallow the welcome. */
async function joined(room: string, u: string, n: string): Promise<Client> {
  const client = await Client.connect(room, u, n);
  client.send({ t: 'join' });
  await client.next('welcome');
  return client;
}

const VID_A = 'dQw4w9WgXcQ';
const VID_B = 'abcdefghijk';
const VID_C = 'AAAAAAAAAAA';

describe('music queue', () => {
  beforeAll(() => {
    fetchMock.activate();
    fetchMock.disableNetConnect();
  });
  afterAll(() => {
    // singleWorker shares one runtime across files — let later suites reach
    // the network again rather than dying on this block's lockdown.
    fetchMock.enableNetConnect();
  });

  it('extracts video ids from the URL shapes people actually paste', () => {
    expect(extractVideoId(`https://www.youtube.com/watch?v=${VID_A}`)).toBe(VID_A);
    expect(extractVideoId(`https://youtube.com/watch?v=${VID_A}&t=42s`)).toBe(VID_A);
    expect(extractVideoId(`https://youtu.be/${VID_A}?si=xyz`)).toBe(VID_A);
    expect(extractVideoId(`https://m.youtube.com/watch?v=${VID_A}`)).toBe(VID_A);
    expect(extractVideoId(`https://music.youtube.com/watch?v=${VID_A}`)).toBe(VID_A);
    expect(extractVideoId(`https://www.youtube.com/shorts/${VID_A}`)).toBe(VID_A);
    expect(extractVideoId(`https://www.youtube.com/embed/${VID_A}`)).toBe(VID_A);
    expect(extractVideoId(`https://www.youtube.com/live/${VID_A}`)).toBe(VID_A);
    expect(extractVideoId('https://www.youtube.com/watch?v=short')).toBeNull();
    expect(extractVideoId('https://vimeo.com/12345')).toBeNull();
    expect(extractVideoId('not a url')).toBeNull();
    expect(extractVideoId(`javascript:alert(1)//${VID_A}`)).toBeNull();
    expect(extractVideoId(`https://evilyoutube.com/watch?v=${VID_A}`)).toBeNull();
  });

  it('adds a track (playing immediately), queues the next, and marks mine per-recipient', async () => {
    const room = 'room-music-add';
    const alice = await joined(room, 'alice', 'Alice');
    const bob = await joined(room, 'bob', 'Bob');

    mockOEmbedOk(VID_A, 'First Song');
    const before = Date.now();
    alice.send({ t: 'music_add', url: `https://youtu.be/${VID_A}` });
    const aliceState = (await alice.next('music')).state;
    const bobState = (await bob.next('music')).state;
    expect(aliceState.current).toMatchObject({
      videoId: VID_A,
      title: 'First Song',
      author: 'Test Artist',
      addedBy: 'Alice',
      mine: true,
    });
    expect(aliceState.current?.startedAt).toBeGreaterThanOrEqual(before);
    expect(aliceState.current?.startedAt).toBeLessThanOrEqual(Date.now());
    expect(bobState.current?.mine).toBeUndefined();
    expect(bobState.current?.videoId).toBe(VID_A);

    // Bob queues a second track — playing track untouched, entry mine-to-Bob only.
    mockOEmbedOk(VID_B, 'Second Song');
    bob.send({ t: 'music_add', url: `https://www.youtube.com/watch?v=${VID_B}` });
    const aliceState2 = (await alice.next('music')).state;
    const bobState2 = (await bob.next('music')).state;
    expect(aliceState2.current?.videoId).toBe(VID_A);
    expect(aliceState2.queue).toHaveLength(1);
    expect(aliceState2.queue[0]?.mine).toBeUndefined();
    expect(bobState2.queue[0]).toMatchObject({ videoId: VID_B, addedBy: 'Bob', mine: true });

    // A fresh joiner's welcome carries the same music state.
    const carol = await Client.connect(room, 'carol', 'Carol');
    carol.send({ t: 'join' });
    const welcome = await carol.next('welcome');
    expect(welcome.music?.current?.videoId).toBe(VID_A);
    expect(welcome.music?.queue).toHaveLength(1);

    // And it survived to storage (hibernation-safe).
    const stored = await musicSnapshot(room);
    expect(stored?.current?.videoId).toBe(VID_A);
    expect(stored?.queue).toHaveLength(1);

    await endQuiet(room, alice, bob, carol);
  });

  it('rejects bad URLs and unavailable videos without touching the queue', async () => {
    const room = 'room-music-bad';
    const alice = await joined(room, 'alice', 'Alice');

    alice.send({ t: 'music_add', url: 'https://vimeo.com/notyoutube' });
    expect((await alice.next('error')).code).toBe('MUSIC_BAD_URL');

    mockOEmbedMissing(VID_C);
    alice.send({ t: 'music_add', url: `https://youtu.be/${VID_C}` });
    expect((await alice.next('error')).code).toBe('MUSIC_UNAVAILABLE');

    expect(await musicSnapshot(room)).toBeUndefined();
    await endQuiet(room, alice);
  });

  it('rate-limits adds to 5 per window', async () => {
    const room = 'room-music-rate';
    const alice = await joined(room, 'alice', 'Alice');
    mockOEmbedOk(VID_A, 'Spam', 5);
    for (let i = 0; i < 6; i++) {
      alice.send({ t: 'music_add', url: `https://youtu.be/${VID_A}` });
    }
    let musics = 0;
    let errorCode: string | null = null;
    for (let i = 0; i < 6; i++) {
      const msg = await alice.nextAny(['music', 'error']);
      if (msg.t === 'music') musics++;
      else errorCode = msg.code;
    }
    expect(musics).toBe(5);
    expect(errorCode).toBe('MUSIC_RATE');
    await endQuiet(room, alice);
  });

  it('removes your own queued entry; someone else’s and the playing one stay', async () => {
    const room = 'room-music-remove';
    const alice = await joined(room, 'alice', 'Alice');
    const bob = await joined(room, 'bob', 'Bob');
    mockOEmbedOk(VID_A);
    mockOEmbedOk(VID_B);
    alice.send({ t: 'music_add', url: `https://youtu.be/${VID_A}` });
    await alice.next('music');
    alice.send({ t: 'music_add', url: `https://youtu.be/${VID_B}` });
    const withQueue = (await alice.next('music')).state;
    const queuedId = withQueue.queue[0]?.id;
    expect(queuedId).toBeDefined();
    if (queuedId === undefined) throw new Error('no queued id');

    // Bob can't remove Alice's entry — silent no-op.
    bob.send({ t: 'music_remove', id: queuedId });
    // Alice removing the PLAYING entry's id is also a no-op (only queue entries).
    const playingId = withQueue.current?.id;
    if (playingId !== undefined) alice.send({ t: 'music_remove', id: playingId });
    // Alice removes her queued entry for real.
    alice.send({ t: 'music_remove', id: queuedId });
    const after = (await alice.next('music')).state;
    expect(after.queue).toHaveLength(0);
    expect(after.current?.videoId).toBe(VID_A);
    const stored = await musicSnapshot(room);
    expect(stored?.queue).toHaveLength(0);
    expect(stored?.current?.videoId).toBe(VID_A);
    await endQuiet(room, alice, bob);
  });

  it('advances on majority skip vote of seated humans; spectators cannot vote', async () => {
    const room = 'room-music-skip';
    const alice = await joined(room, 'alice', 'Alice');
    const bob = await joined(room, 'bob', 'Bob');
    const carol = await joined(room, 'carol', 'Carol');
    const dave = await joined(room, 'dave', 'Dave'); // stays a spectator
    alice.send({ t: 'sit', seat: 0 });
    await welcomeViewer(alice, 0);
    bob.send({ t: 'sit', seat: 1 });
    await welcomeViewer(bob, 1);
    carol.send({ t: 'sit', seat: 2 });
    await welcomeViewer(carol, 2);

    mockOEmbedOk(VID_A, 'Skippable');
    mockOEmbedOk(VID_B, 'Next Up');
    alice.send({ t: 'music_add', url: `https://youtu.be/${VID_A}` });
    await alice.next('music');
    await bob.next('music');
    alice.send({ t: 'music_add', url: `https://youtu.be/${VID_B}` });
    await alice.next('music');
    await bob.next('music');

    // Spectators may listen and add, but not steer the skip.
    dave.send({ t: 'music_skip_vote' });
    expect((await dave.next('error')).code).toBe('NOT_SEATED');

    // 3 seated humans → majority is 2. First vote: count moves, no advance.
    alice.send({ t: 'music_skip_vote' });
    const oneVote = (await alice.next('music')).state;
    expect(oneVote.current?.videoId).toBe(VID_A);
    expect(oneVote).toMatchObject({ skipVotes: 1, skipNeeded: 2, youVotedSkip: true });
    const bobSees = (await bob.next('music')).state;
    expect(bobSees.youVotedSkip).toBeUndefined();

    // Second vote: threshold met → next track plays, votes reset.
    bob.send({ t: 'music_skip_vote' });
    const advanced = (await bob.next('music')).state;
    expect(advanced.current?.videoId).toBe(VID_B);
    expect(advanced.queue).toHaveLength(0);
    expect(advanced.skipVotes).toBe(0);
    expect(advanced.youVotedSkip).toBeUndefined();

    await endQuiet(room, alice, bob, carol, dave);
  });

  it('music_ended advances exactly once, ignoring duplicates and stale ids', async () => {
    const room = 'room-music-ended';
    const alice = await joined(room, 'alice', 'Alice');
    const bob = await joined(room, 'bob', 'Bob');
    mockOEmbedOk(VID_A, 'Now');
    mockOEmbedOk(VID_B, 'Later');
    alice.send({ t: 'music_add', url: `https://youtu.be/${VID_A}` });
    const first = (await alice.next('music')).state;
    await bob.next('music');
    alice.send({ t: 'music_add', url: `https://youtu.be/${VID_B}` });
    await alice.next('music');
    await bob.next('music');
    const playingId = first.current?.id;
    if (playingId === undefined) throw new Error('nothing playing');

    // A stale/unknown id does nothing.
    alice.send({ t: 'music_ended', id: 'm999' });
    // Both listeners report the real end — the second report finds a new
    // current and no-ops, so exactly one advance happens.
    alice.send({ t: 'music_ended', id: playingId });
    bob.send({ t: 'music_ended', id: playingId });
    const after = (await alice.next('music')).state;
    expect(after.current?.videoId).toBe(VID_B);
    expect(after.queue).toHaveLength(0);
    const stored = await pollUntil(async () => {
      const s = await musicSnapshot(room);
      return s?.current?.videoId === VID_B && s.queue.length === 0 ? s : undefined;
    }, 'exactly one ended-advance to settle');
    expect(stored.current?.videoId).toBe(VID_B);
    await endQuiet(room, alice, bob);
  });

  it("the adder's own error report advances immediately (broken link unsticks solo)", async () => {
    const room = 'room-music-error';
    const alice = await joined(room, 'alice', 'Alice');
    mockOEmbedOk(VID_A, 'Broken');
    alice.send({ t: 'music_add', url: `https://youtu.be/${VID_A}` });
    const state = (await alice.next('music')).state;
    const id = state.current?.id;
    if (id === undefined) throw new Error('nothing playing');
    alice.send({ t: 'music_error', id });
    const after = (await alice.next('music')).state;
    expect(after.current).toBeNull();
    await endQuiet(room, alice);
  });
});
