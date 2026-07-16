import { SELF, env, runDurableObjectAlarm, runInDurableObject } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import { chooseAction } from '@jaffre/bots';
import { deserialize, mulberry32 } from '@jaffre/engine';
import type { Action, GameEvent, GameState, SeatView } from '@jaffre/engine';
import type { ClientMessage, ServerMessage } from '@jaffre/protocol';
import { BOT_SWAP_MS, TRICK_HOLD_MS } from '../src/GameRoom.js';

declare module 'cloudflare:test' {
  interface ProvidedEnv {
    GAME_ROOM: DurableObjectNamespace;
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
      const game = await env.DB.prepare(
        'SELECT id, room_code, seed, finished_at, winner_team, score_0, score_1, action_log FROM games WHERE room_code = ?1',
      )
        .bind(room)
        .first<{
          id: string;
          room_code: string;
          seed: number;
          finished_at: number;
          winner_team: number;
          score_0: number;
          score_1: number;
          action_log: string;
        }>();
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
      await endQuiet(room, client);
    },
  );

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
      await endQuiet(room, client, again);
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
});
