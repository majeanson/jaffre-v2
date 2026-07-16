/**
 * One Durable Object per game room. Uses the WebSocket hibernation API:
 * per-socket identity lives in the socket attachment, all room state lives in
 * durable storage, and in-memory caches are lazily re-hydrated on every wake.
 * Bots (and round_over auto-continue) advance the game via storage alarms.
 */
import {
  applyAction,
  createGame,
  deserialize,
  mulberry32,
  redactEvent,
  serialize,
  viewFor,
} from '@jaffre/engine';
import type { Action, GameState, Seat, Viewer } from '@jaffre/engine';
import { chooseAction } from '@jaffre/bots';
import type { BotDifficulty } from '@jaffre/bots';
import { parseClientMessage } from '@jaffre/protocol';
import type { ChatEntry, ClientAction, Roster, RosterSeat, ServerMessage } from '@jaffre/protocol';
import type { Env } from './env.js';
import { gameRecordFrom } from './history.js';

const BOT_DELAY_MS = 700;
/** After a completed trick the client holds the 4 cards on the table
 * (~2.2s hold + sweep) — bots must not play into that window. */
export const TRICK_HOLD_MS = 2600;
/** How long a seated human may be fully disconnected mid-game before a bot
 * plays their turns. Tests can override per-room via `meta.botSwapMs`. */
export const BOT_SWAP_MS = 45_000;
const CHAT_CAP = 100;
const SEATS: readonly Seat[] = [0, 1, 2, 3];

/** A seat is owned by a user (userId), a bot (at a difficulty), or nobody.
 * Older persisted metas store `{ bot: true }` without a difficulty — those
 * read back as 'normal' via botDifficulty(). */
type BotOwner = { readonly bot: true; readonly difficulty?: BotDifficulty };
type SeatOwner = string | BotOwner | null;

interface Meta {
  seats: [SeatOwner, SeatOwner, SeatOwner, SeatOwner];
  names: Record<string, string>;
  started: boolean;
  /** Room code (the /ws/:roomCode path segment), captured on first connect —
   * a DO cannot recover its idFromName input, and the history rows need it. */
  roomCode?: string;
  /** Date.now() when the game started (history bookkeeping only). */
  startedAt?: number;
  /** userId → Date.now() of when their last socket closed mid-game. */
  disconnectedSince?: Record<string, number>;
  /** Optional per-room override of BOT_SWAP_MS (used by tests). */
  botSwapMs?: number;
  /** Per-seat readiness for the next round (round_over phase only). */
  readyNextRound?: [boolean, boolean, boolean, boolean];
}

/** Per-socket identity, survives hibernation via serializeAttachment. */
interface Attachment {
  userId: string;
  name: string;
  viewer: Viewer;
  joined: boolean;
}

interface LogEntry {
  seq: number;
  action: Action;
  ts?: number;
}

function emptyMeta(): Meta {
  return { seats: [null, null, null, null], names: {}, started: false };
}

function isBotOwner(owner: SeatOwner): owner is BotOwner {
  return typeof owner === 'object' && owner !== null;
}

/** A bot seat's difficulty, defaulting to 'normal' for legacy `{ bot: true }`. */
function botDifficulty(owner: SeatOwner): BotDifficulty {
  return isBotOwner(owner) ? (owner.difficulty ?? 'normal') : 'normal';
}

export class GameRoom implements DurableObject {
  private meta: Meta = emptyMeta();
  private game: GameState | null = null;
  private seq = 0;
  private chat: ChatEntry[] = [];
  private loaded = false;

  constructor(
    private readonly ctx: DurableObjectState,
    private readonly env: Env,
  ) {}

  /** Re-hydrate the in-memory cache from storage. Never trusted across wakes. */
  private async load(): Promise<void> {
    if (this.loaded) return;
    const [meta, game, seq, chat] = await Promise.all([
      this.ctx.storage.get<Meta>('meta'),
      this.ctx.storage.get<string>('game'),
      this.ctx.storage.get<number>('seq'),
      this.ctx.storage.get<ChatEntry[]>('chat'),
    ]);
    this.meta = meta ?? emptyMeta();
    this.game = game !== undefined ? deserialize(game) : null;
    this.seq = seq ?? 0;
    this.chat = chat ?? [];
    this.loaded = true;
  }

  async fetch(request: Request): Promise<Response> {
    if (request.headers.get('Upgrade') !== 'websocket') {
      return new Response('Expected WebSocket upgrade', { status: 426 });
    }
    const url = new URL(request.url);
    // Identity: the worker verifies the session token and forwards the result
    // as headers (token mode). Query params are the no-secret fallback only —
    // in token mode the worker never dispatches without the headers set.
    const headerId = request.headers.get('X-User-Id');
    const headerName = request.headers.get('X-User-Name');
    const userId = headerId !== null && headerId !== '' ? headerId : url.searchParams.get('u');
    const name =
      headerName !== null && headerName !== ''
        ? decodeURIComponent(headerName)
        : url.searchParams.get('n');
    if (userId === null || userId === '' || name === null || name === '') {
      return new Response('Missing identity', { status: 400 });
    }
    await this.load();
    // Remember the room code for game-history rows (idFromName is one-way).
    const roomCode = /^\/ws\/([A-Za-z0-9-]{1,32})$/.exec(url.pathname)?.[1];
    if (roomCode !== undefined && this.meta.roomCode !== roomCode) {
      this.meta.roomCode = roomCode;
      await this.ctx.storage.put('meta', this.meta);
    }
    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];
    this.ctx.acceptWebSocket(server);
    const attachment: Attachment = { userId, name, viewer: 'spectator', joined: false };
    server.serializeAttachment(attachment);
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws: WebSocket, message: ArrayBuffer | string): Promise<void> {
    await this.load();
    const msg = parseClientMessage(message);
    if (msg === null) {
      this.send(ws, { t: 'error', code: 'BAD_MESSAGE', message: 'Unrecognized message' });
      return;
    }
    const att = this.attachment(ws);
    switch (msg.t) {
      case 'join':
        await this.onJoin(ws, att);
        return;
      case 'sit':
        await this.onSit(ws, att, msg.seat);
        return;
      case 'add_bot':
        await this.onAddBot(ws, att, msg.seat, msg.difficulty);
        return;
      case 'start':
        await this.onStart(ws, att);
        return;
      case 'ready':
        await this.onReady(ws, att);
        return;
      case 'action':
        await this.onAction(ws, att, msg.action);
        return;
      case 'chat':
        await this.onChat(ws, att, msg.text);
        return;
      case 'rtc':
        this.onRtc(ws, att, msg.to, msg.payload);
        return;
      case 'ping':
        this.send(ws, { t: 'pong' });
        return;
    }
  }

  async webSocketClose(ws: WebSocket): Promise<void> {
    await this.load();
    const att = this.attachment(ws);
    // If a seated human's LAST socket just closed mid-game, start their
    // disconnect clock BEFORE broadcasting, so the roster we send carries
    // their bot-swap deadline (botSwapAt) in the same update as connected=false.
    const seatedHuman =
      typeof att.viewer === 'number' &&
      this.meta.started &&
      this.game !== null &&
      this.game.phase !== 'game_over';
    if (seatedHuman) {
      const stillConnected = this.ctx.getWebSockets().some((s) => {
        if (s === ws) return false;
        const a = this.attachment(s);
        return a.joined && a.userId === att.userId;
      });
      if (!stillConnected) {
        this.meta.disconnectedSince = {
          ...this.meta.disconnectedSince,
          [att.userId]: Date.now(),
        };
        await this.ctx.storage.put('meta', this.meta);
        await this.scheduleNextWake();
      }
    }
    // Recompute roster with this socket excluded so its seat shows
    // connected=false (plus botSwapAt when the clock was just started).
    this.broadcastRoster({ exclude: ws });
  }

  webSocketError(ws: WebSocket): void {
    try {
      ws.close(1011, 'error');
    } catch {
      // Socket already gone.
    }
  }

  /** Bot turns, round_over auto-continue, and disconnected-human bot-swaps
   * all run here, never inline. */
  async alarm(): Promise<void> {
    this.loaded = false; // always re-read after a wake — memory is not trusted
    await this.load();
    const game = this.game;
    if (game === null || game.phase === 'game_over') return;
    if (game.phase === 'round_over') {
      // Rounds wait for readiness; the alarm only auto-readies humans whose
      // disconnect deadline has passed so an absent player can't stall the
      // table forever.
      const ready = this.readyState();
      let changed = false;
      for (const s of SEATS) {
        const owner = this.meta.seats[s];
        if (
          !ready[s] &&
          typeof owner === 'string' &&
          this.disconnectDeadline(owner) <= Date.now()
        ) {
          ready[s] = true;
          changed = true;
        }
      }
      if (changed) {
        this.meta.readyNextRound = ready;
        await this.ctx.storage.put('meta', this.meta);
        this.broadcastRoster({});
        await this.continueIfAllReady();
      }
      if (this.game?.phase === 'round_over') await this.scheduleNextWake();
      return;
    }
    const turnSeat = game.turn;
    const owner = this.meta.seats[turnSeat];
    const botActs =
      isBotOwner(owner) ||
      (typeof owner === 'string' && this.disconnectDeadline(owner) <= Date.now());
    if (!botActs) {
      // A connected human's turn (or their deadline has not passed yet):
      // re-arm the alarm for whatever the next wake actually is.
      await this.scheduleNextWake();
      return;
    }
    const rng = mulberry32((game.seed ^ this.seq) >>> 0);
    // Disconnected humans are covered at 'normal' — fair to both teams.
    const difficulty = isBotOwner(owner) ? botDifficulty(owner) : 'normal';
    const action = chooseAction(viewFor(game, turnSeat), rng, difficulty);
    if (action !== null) await this.applyEngineAction(action);
  }

  /* ── Message handlers ──────────────────────────────────────────────── */

  private async onJoin(ws: WebSocket, att: Attachment): Promise<void> {
    const seat = this.seatOf(att.userId);
    att.viewer = seat ?? 'spectator';
    att.joined = true;
    ws.serializeAttachment(att);
    let metaDirty = false;
    if (this.meta.names[att.userId] !== att.name) {
      this.meta.names[att.userId] = att.name;
      metaDirty = true;
    }
    // Rejoining stops the disconnect clock — the human resumes control.
    if (this.meta.disconnectedSince?.[att.userId] !== undefined) {
      this.meta.disconnectedSince = Object.fromEntries(
        Object.entries(this.meta.disconnectedSince).filter(([id]) => id !== att.userId),
      );
      metaDirty = true;
    }
    if (metaDirty) await this.ctx.storage.put('meta', this.meta);
    this.sendWelcome(ws, att);
    this.broadcastRoster({ skip: ws });
  }

  /** Snapshot of everything a client needs to (re)adopt its identity. */
  private sendWelcome(ws: WebSocket, att: Attachment): void {
    this.send(ws, {
      t: 'welcome',
      viewer: att.viewer,
      view: this.game !== null ? viewFor(this.game, att.viewer) : null,
      seq: this.seq,
      roster: this.roster(),
      chatTail: this.chat,
    });
  }

  private async onSit(ws: WebSocket, att: Attachment, seat: Seat): Promise<void> {
    if (!att.joined) {
      this.send(ws, { t: 'error', code: 'BAD_MESSAGE', message: 'Join the room first' });
      return;
    }
    const occupant = this.meta.seats[seat];
    if (occupant === att.userId) {
      // Already own this seat — idempotent.
      att.viewer = seat;
      ws.serializeAttachment(att);
      this.sendWelcome(ws, att);
      this.broadcastRoster({});
      return;
    }
    if (occupant !== null) {
      this.send(ws, { t: 'error', code: 'SEAT_TAKEN', message: `Seat ${seat} is taken` });
      return;
    }
    if (this.meta.started) {
      this.send(ws, {
        t: 'error',
        code: 'ALREADY_STARTED',
        message: 'Cannot change seats after the game has started',
      });
      return;
    }
    for (const s of SEATS) {
      if (this.meta.seats[s] === att.userId) this.meta.seats[s] = null;
    }
    this.meta.seats[seat] = att.userId;
    this.meta.names[att.userId] = att.name;
    att.viewer = seat;
    ws.serializeAttachment(att);
    await this.ctx.storage.put('meta', this.meta);
    // Fresh welcome so the sitter's client adopts its new viewer identity —
    // the store only learns `viewer` from welcome snapshots.
    this.sendWelcome(ws, att);
    this.broadcastRoster({});
  }

  private async onAddBot(
    ws: WebSocket,
    att: Attachment,
    seat: Seat,
    difficulty: BotDifficulty = 'normal',
  ): Promise<void> {
    if (!att.joined) {
      this.send(ws, { t: 'error', code: 'BAD_MESSAGE', message: 'Join the room first' });
      return;
    }
    if (this.meta.started) {
      this.send(ws, {
        t: 'error',
        code: 'ALREADY_STARTED',
        message: 'Cannot add bots after the game has started',
      });
      return;
    }
    const occupant = this.meta.seats[seat];
    // A human occupies the seat — cannot be replaced by a bot.
    if (occupant !== null && !isBotOwner(occupant)) {
      this.send(ws, { t: 'error', code: 'SEAT_TAKEN', message: `Seat ${seat} is taken` });
      return;
    }
    // Empty seat → add a bot; existing bot seat → change its difficulty in place.
    this.meta.seats[seat] = { bot: true, difficulty };
    await this.ctx.storage.put('meta', this.meta);
    this.broadcastRoster({});
  }

  private async onStart(ws: WebSocket, att: Attachment): Promise<void> {
    // A finished game may be restarted in place (rematch, same table).
    const isRematch = this.meta.started && this.game?.phase === 'game_over';
    if (this.meta.started && !isRematch) {
      this.send(ws, { t: 'error', code: 'ALREADY_STARTED', message: 'Game already started' });
      return;
    }
    if (!att.joined || typeof att.viewer !== 'number') {
      this.send(ws, { t: 'error', code: 'NOT_SEATED', message: 'Only seated players can start' });
      return;
    }
    if (this.meta.seats.some((s) => s === null)) {
      this.send(ws, {
        t: 'error',
        code: 'BAD_MESSAGE',
        message: 'All four seats must be filled to start',
      });
      return;
    }
    if (isRematch) {
      // Clear the previous game's action log so the next history record and
      // any replay contain only the new game.
      const oldLog = await this.ctx.storage.list({ prefix: 'log:' });
      if (oldLog.size > 0) await this.ctx.storage.delete([...oldLog.keys()]);
    }
    const buf = new Uint32Array(1);
    crypto.getRandomValues(buf);
    const seed = buf[0] ?? 0;
    const game = createGame(seed);
    this.game = game;
    this.meta.started = true;
    this.meta.startedAt = Date.now();
    this.seq = 0;
    await this.ctx.storage.put({ meta: this.meta, game: serialize(game), seq: this.seq });
    for (const socket of this.ctx.getWebSockets()) {
      const a = this.attachment(socket);
      if (!a.joined) continue;
      this.send(socket, { t: 'view', seq: this.seq, view: viewFor(game, a.viewer) });
    }
    this.broadcastRoster({});
    await this.scheduleNextWake();
  }

  private async onAction(ws: WebSocket, att: Attachment, client: ClientAction): Promise<void> {
    if (!att.joined || typeof att.viewer !== 'number') {
      this.send(ws, { t: 'error', code: 'NOT_SEATED', message: 'Take a seat to play' });
      return;
    }
    if (this.game === null) {
      this.send(ws, { t: 'error', code: 'NOT_STARTED', message: 'Game has not started' });
      return;
    }
    const seat = att.viewer;
    if (client.type === 'continue') {
      // Rounds advance by readiness, never by a raw continue from one client.
      await this.onReady(ws, att);
      return;
    }
    // Stamp the seat from the authenticated attachment — never from the wire.
    const action: Action =
      client.type === 'place_bid'
        ? { type: 'place_bid', seat, choice: client.choice }
        : { type: 'play_card', seat, card: client.card };
    await this.applyEngineAction(action, ws);
  }

  /** A seated player is ready for the next round; all ready → deal it. */
  private async onReady(ws: WebSocket, att: Attachment): Promise<void> {
    if (!att.joined || typeof att.viewer !== 'number') {
      this.send(ws, { t: 'error', code: 'NOT_SEATED', message: 'Take a seat first' });
      return;
    }
    if (this.game?.phase !== 'round_over') {
      this.send(ws, { t: 'error', code: 'WRONG_PHASE', message: 'No round to be ready for' });
      return;
    }
    const ready = this.readyState();
    if (ready[att.viewer]) return; // idempotent
    ready[att.viewer] = true;
    this.meta.readyNextRound = ready;
    await this.ctx.storage.put('meta', this.meta);
    this.broadcastRoster({});
    await this.continueIfAllReady();
  }

  /** Current readiness, bots always ready. */
  private readyState(): [boolean, boolean, boolean, boolean] {
    const base = this.meta.readyNextRound ?? [false, false, false, false];
    return SEATS.map((i) => isBotOwner(this.meta.seats[i]) || base[i]) as [
      boolean,
      boolean,
      boolean,
      boolean,
    ];
  }

  private async continueIfAllReady(): Promise<void> {
    if (this.game?.phase !== 'round_over') return;
    if (!this.readyState().every(Boolean)) return;
    delete this.meta.readyNextRound;
    await this.ctx.storage.put('meta', this.meta);
    await this.applyEngineAction({ type: 'continue' });
    this.broadcastRoster({});
  }

  private async onChat(ws: WebSocket, att: Attachment, text: string): Promise<void> {
    if (!att.joined) {
      this.send(ws, { t: 'error', code: 'BAD_MESSAGE', message: 'Join the room first' });
      return;
    }
    // Chat timestamps are presentation, not game logic — Date.now() is fine here.
    const entry: ChatEntry = { from: att.name, text, at: Date.now() };
    this.chat.push(entry);
    if (this.chat.length > CHAT_CAP) this.chat = this.chat.slice(-CHAT_CAP);
    await this.ctx.storage.put('chat', this.chat);
    for (const socket of this.ctx.getWebSockets()) {
      if (this.attachment(socket).joined) this.send(socket, { t: 'chat', entry });
    }
  }

  private onRtc(ws: WebSocket, att: Attachment, to: Seat, payload: unknown): void {
    if (!att.joined || typeof att.viewer !== 'number') {
      this.send(ws, { t: 'error', code: 'NOT_SEATED', message: 'Only seated players can use RTC' });
      return;
    }
    for (const socket of this.ctx.getWebSockets()) {
      const a = this.attachment(socket);
      if (a.joined && a.viewer === to) {
        this.send(socket, { t: 'rtc', from: att.viewer, payload });
      }
    }
  }

  /* ── Engine pipeline (shared by humans and bot alarms) ─────────────── */

  private async applyEngineAction(action: Action, errorTarget?: WebSocket): Promise<void> {
    if (this.game === null) return;
    const result = applyAction(this.game, action);
    if (!result.ok) {
      if (errorTarget !== undefined) {
        this.send(errorTarget, {
          t: 'error',
          code: result.error.code,
          message: result.error.message,
        });
      }
      return;
    }
    const game = result.state;
    this.game = game;
    this.seq += 1;
    const log: LogEntry = { seq: this.seq, action };
    await this.ctx.storage.put({
      game: serialize(game),
      seq: this.seq,
      [`log:${this.seq}`]: log,
    });
    for (const socket of this.ctx.getWebSockets()) {
      const a = this.attachment(socket);
      if (!a.joined) continue;
      this.send(socket, {
        t: 'events',
        seq: this.seq,
        events: result.events.map((e) => redactEvent(e, a.viewer)),
      });
      this.send(socket, { t: 'view', seq: this.seq, view: viewFor(game, a.viewer) });
    }
    if (game.phase === 'game_over') {
      // History write is strictly best-effort: awaited (so tests observe it)
      // but fully guarded — D1 being absent or failing never breaks the room.
      try {
        await this.persistHistory(game);
      } catch (err) {
        console.error('game history write failed', err);
      }
    }
    await this.scheduleNextWake(result.events.some((e) => e.type === 'trick_won'));
  }

  /** Write games + game_players rows to D1 once, at game_over. */
  private async persistHistory(game: GameState): Promise<void> {
    const db = this.env.DB;
    if (db === undefined) return; // no-DB env (local dev / tests) — skip
    const stored = await this.ctx.storage.list<LogEntry>({ prefix: 'log:' });
    const record = gameRecordFrom(
      {
        roomCode: this.meta.roomCode ?? 'unknown',
        startedAt: this.meta.startedAt ?? null,
        seats: this.meta.seats,
      },
      game,
      [...stored.values()],
      { id: crypto.randomUUID(), finishedAt: Date.now() },
    );
    await db.batch([
      db
        .prepare(
          `INSERT INTO games (id, room_code, seed, started_at, finished_at, winner_team, score_0, score_1, action_log)
           VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)`,
        )
        .bind(
          record.id,
          record.room_code,
          record.seed,
          record.started_at,
          record.finished_at,
          record.winner_team,
          record.score_0,
          record.score_1,
          record.action_log,
        ),
      ...record.players.map((p) =>
        db
          .prepare(
            'INSERT INTO game_players (game_id, seat, user_id, is_bot) VALUES (?1, ?2, ?3, ?4)',
          )
          .bind(record.id, p.seat, p.user_id, p.is_bot),
      ),
    ]);
  }

  /** When `userId`'s bot-swap kicks in; +Infinity while they are connected. */
  private disconnectDeadline(userId: string): number {
    const since = this.meta.disconnectedSince?.[userId];
    if (since === undefined) return Number.POSITIVE_INFINITY;
    return since + (this.meta.botSwapMs ?? BOT_SWAP_MS);
  }

  /**
   * The single alarm slot is shared by bot turns, round_over auto-continue,
   * and disconnected-human bot-swaps: compute the earliest wake we need and
   * set one alarm. Date.now() for scheduling only — the engine never sees time.
   */
  private async scheduleNextWake(afterTrick = false): Promise<void> {
    const game = this.game;
    if (game === null || game.phase === 'game_over') return;
    const now = Date.now();
    let wake: number | null = null;
    if (game.phase === 'round_over') {
      // Waiting on readiness: wake only for disconnected humans' deadlines.
      const ready = this.readyState();
      for (const s of SEATS) {
        const owner = this.meta.seats[s];
        if (ready[s] || typeof owner !== 'string') continue;
        const deadline = this.disconnectDeadline(owner);
        if (Number.isFinite(deadline)) {
          wake = wake === null ? Math.max(now + 1, deadline) : Math.min(wake, deadline);
        }
      }
    } else {
      const owner = this.meta.seats[game.turn];
      if (isBotOwner(owner)) {
        // A trick just completed: the clients hold + sweep the 4 cards for
        // ~2.2s, so the next bot must wait out that animation window.
        wake = now + (afterTrick ? TRICK_HOLD_MS : BOT_DELAY_MS);
      } else if (typeof owner === 'string') {
        const deadline = this.disconnectDeadline(owner);
        if (Number.isFinite(deadline)) wake = Math.max(now + 1, deadline);
      }
    }
    if (wake !== null) await this.ctx.storage.setAlarm(wake);
  }

  /* ── Helpers ───────────────────────────────────────────────────────── */

  private attachment(ws: WebSocket): Attachment {
    return ws.deserializeAttachment() as Attachment;
  }

  private seatOf(userId: string): Seat | null {
    for (const s of SEATS) {
      if (this.meta.seats[s] === userId) return s;
    }
    return null;
  }

  private roster(exclude?: WebSocket): Roster {
    const attachments = this.ctx
      .getWebSockets()
      .filter((s) => s !== exclude)
      .map((s) => this.attachment(s));
    const seats = SEATS.map((i): RosterSeat | null => {
      const owner = this.meta.seats[i];
      if (owner === null) return null;
      const ready = this.game?.phase === 'round_over' ? this.readyState()[i] : undefined;
      if (isBotOwner(owner)) {
        return {
          name: `Bot ${String(i + 1)}`,
          isBot: true,
          connected: true,
          difficulty: botDifficulty(owner),
          ...(ready !== undefined ? { ready } : {}),
        };
      }
      const connected = attachments.some((a) => a.joined && a.viewer === i);
      // A disconnected human mid-game is on the bot-swap clock — expose the
      // absolute deadline so the client can show a countdown.
      const swapActive = !connected && this.game !== null && this.game.phase !== 'game_over';
      const botSwapAt = swapActive ? this.disconnectDeadline(owner) : Number.POSITIVE_INFINITY;
      return {
        name: this.meta.names[owner] ?? 'Player',
        isBot: false,
        connected,
        ...(ready !== undefined ? { ready } : {}),
        ...(Number.isFinite(botSwapAt) ? { botSwapAt } : {}),
      };
    });
    const spectators = attachments.filter((a) => a.joined && a.viewer === 'spectator').length;
    return { seats, spectators, started: this.meta.started };
  }

  private broadcastRoster(opts: { skip?: WebSocket; exclude?: WebSocket }): void {
    const roster = this.roster(opts.exclude);
    for (const socket of this.ctx.getWebSockets()) {
      if (socket === opts.skip || socket === opts.exclude) continue;
      if (this.attachment(socket).joined) this.send(socket, { t: 'roster', roster });
    }
  }

  private send(ws: WebSocket, msg: ServerMessage): void {
    try {
      ws.send(JSON.stringify(msg));
    } catch {
      // Socket closed under us — the close handler will refresh the roster.
    }
  }
}
