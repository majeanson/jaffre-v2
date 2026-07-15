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
import { parseClientMessage } from '@jaffre/protocol';
import type { ChatEntry, ClientAction, Roster, RosterSeat, ServerMessage } from '@jaffre/protocol';

const BOT_DELAY_MS = 700;
const CHAT_CAP = 100;
const SEATS: readonly Seat[] = [0, 1, 2, 3];

/** A seat is owned by a user (userId), a bot, or nobody. */
type SeatOwner = string | { readonly bot: true } | null;

interface Meta {
  seats: [SeatOwner, SeatOwner, SeatOwner, SeatOwner];
  names: Record<string, string>;
  started: boolean;
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

function isBotOwner(owner: SeatOwner): owner is { readonly bot: true } {
  return typeof owner === 'object' && owner !== null;
}

export class GameRoom implements DurableObject {
  private meta: Meta = emptyMeta();
  private game: GameState | null = null;
  private seq = 0;
  private chat: ChatEntry[] = [];
  private loaded = false;

  constructor(private readonly ctx: DurableObjectState) {}

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
    const userId = url.searchParams.get('u');
    const name = url.searchParams.get('n');
    if (userId === null || userId === '' || name === null || name === '') {
      return new Response('Missing u/n query params', { status: 400 });
    }
    await this.load();
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
        await this.onAddBot(ws, att, msg.seat);
        return;
      case 'start':
        await this.onStart(ws, att);
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
    // Recompute roster with this socket excluded so its seat shows connected=false.
    this.broadcastRoster({ exclude: ws });
  }

  webSocketError(ws: WebSocket): void {
    try {
      ws.close(1011, 'error');
    } catch {
      // Socket already gone.
    }
  }

  /** Bot turns and round_over auto-continue run here, never inline. */
  async alarm(): Promise<void> {
    this.loaded = false; // always re-read after a wake — memory is not trusted
    await this.load();
    const game = this.game;
    if (game === null || game.phase === 'game_over') return;
    if (game.phase === 'round_over') {
      await this.applyEngineAction({ type: 'continue' });
      return;
    }
    const turnSeat = game.turn;
    if (!isBotOwner(this.meta.seats[turnSeat])) return; // human's turn — do nothing
    const rng = mulberry32((game.seed ^ this.seq) >>> 0);
    const action = chooseAction(viewFor(game, turnSeat), rng);
    if (action !== null) await this.applyEngineAction(action);
  }

  /* ── Message handlers ──────────────────────────────────────────────── */

  private async onJoin(ws: WebSocket, att: Attachment): Promise<void> {
    const seat = this.seatOf(att.userId);
    att.viewer = seat ?? 'spectator';
    att.joined = true;
    ws.serializeAttachment(att);
    if (this.meta.names[att.userId] !== att.name) {
      this.meta.names[att.userId] = att.name;
      await this.ctx.storage.put('meta', this.meta);
    }
    this.send(ws, {
      t: 'welcome',
      viewer: att.viewer,
      view: this.game !== null ? viewFor(this.game, att.viewer) : null,
      seq: this.seq,
      roster: this.roster(),
      chatTail: this.chat,
    });
    this.broadcastRoster({ skip: ws });
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
    this.broadcastRoster({});
  }

  private async onAddBot(ws: WebSocket, att: Attachment, seat: Seat): Promise<void> {
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
    if (this.meta.seats[seat] !== null) {
      this.send(ws, { t: 'error', code: 'SEAT_TAKEN', message: `Seat ${seat} is taken` });
      return;
    }
    this.meta.seats[seat] = { bot: true };
    await this.ctx.storage.put('meta', this.meta);
    this.broadcastRoster({});
  }

  private async onStart(ws: WebSocket, att: Attachment): Promise<void> {
    if (this.meta.started) {
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
    const buf = new Uint32Array(1);
    crypto.getRandomValues(buf);
    const seed = buf[0] ?? 0;
    const game = createGame(seed);
    this.game = game;
    this.meta.started = true;
    this.seq = 0;
    await this.ctx.storage.put({ meta: this.meta, game: serialize(game), seq: this.seq });
    for (const socket of this.ctx.getWebSockets()) {
      const a = this.attachment(socket);
      if (!a.joined) continue;
      this.send(socket, { t: 'view', seq: this.seq, view: viewFor(game, a.viewer) });
    }
    this.broadcastRoster({});
    await this.maybeScheduleBot();
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
    // Stamp the seat from the authenticated attachment — never from the wire.
    const action: Action =
      client.type === 'place_bid'
        ? { type: 'place_bid', seat, choice: client.choice }
        : client.type === 'play_card'
          ? { type: 'play_card', seat, card: client.card }
          : { type: 'continue' };
    await this.applyEngineAction(action, ws);
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
    await this.maybeScheduleBot();
  }

  private async maybeScheduleBot(): Promise<void> {
    const game = this.game;
    if (game === null || game.phase === 'game_over') return;
    const due = game.phase === 'round_over' || isBotOwner(this.meta.seats[game.turn]);
    // Date.now() for scheduling only — the engine itself never sees time.
    if (due) await this.ctx.storage.setAlarm(Date.now() + BOT_DELAY_MS);
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
      if (isBotOwner(owner)) return { name: `Bot ${String(i + 1)}`, isBot: true, connected: true };
      return {
        name: this.meta.names[owner] ?? 'Player',
        isBot: false,
        connected: attachments.some((a) => a.joined && a.viewer === i),
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
