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
import { notifyUser } from './push.js';
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
  /** userId → true while that seated human has voluntary auto-play on. The
   * server plays their turns at 'hard'; only turning it off returns control.
   * Persists across disconnect/reconnect; cleared on leave and game_over. */
  autoPlay?: Record<string, boolean>;
  /** Optional per-room override of BOT_SWAP_MS (used by tests). */
  botSwapMs?: number;
  /** Per-seat readiness for the next round (round_over phase only). */
  readyNextRound?: [boolean, boolean, boolean, boolean];
  /** Standing-table tally across games at this room: [Sun wins, Moon wins],
   * incremented at each game_over. Reset only when the room empties for
   * good (a fresh DO, never in place). */
  seriesWins: [number, number];
  /** Final [Sun, Moon] scores of each finished game this sitting, oldest
   * first — the between-games scorepad. Appended at each game_over,
   * alongside seriesWins; reset only with the DO. */
  seriesGames: [number, number][];
  /** House rules chosen in the lobby before the game starts. */
  rules?: { hailMary12: boolean };
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
  return {
    seats: [null, null, null, null],
    names: {},
    started: false,
    seriesWins: [0, 0],
    seriesGames: [],
  };
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
    // Spread over emptyMeta() so legacy persisted metas (pre-seriesWins) still
    // satisfy the current shape without a migration.
    this.meta = { ...emptyMeta(), ...meta };
    this.game = game !== undefined ? deserialize(game) : null;
    this.seq = seq ?? 0;
    this.chat = chat ?? [];
    this.loaded = true;
  }

  async fetch(request: Request): Promise<Response> {
    // Lightweight status peek (no socket) — powers the home "Your tables" row's
    // live turn/waiting badge without opening a full connection to every room.
    if (new URL(request.url).pathname === '/status') {
      await this.load();
      return Response.json({
        started: this.meta.started,
        phase: this.game?.phase ?? null,
        turn: this.game?.turn ?? null,
        seriesWins: this.meta.seriesWins,
      });
    }
    // Permanent leave without a socket — the home "Your tables" row lets you
    // quit a room you're not connected to. The worker authenticates and
    // forwards the identity, same as the WS path.
    if (new URL(request.url).pathname === '/leave' && request.method === 'POST') {
      await this.load();
      const uid = request.headers.get('X-User-Id');
      if (uid === null || uid === '') return new Response('Missing identity', { status: 400 });
      const left = await this.unseatUser(uid);
      return Response.json({ left });
    }
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
      case 'remove_bot':
        await this.onRemoveBot(ws, att, msg.seat);
        return;
      case 'start':
        await this.onStart(ws, att);
        return;
      case 'set_rules':
        await this.onSetRules(ws, att, msg.hailMary12);
        return;
      case 'swap_seats':
        await this.onSwapSeats(ws, att);
        return;
      case 'leave':
        await this.onLeave(ws, att);
        return;
      case 'set_autoplay':
        await this.onSetAutoPlay(ws, att, msg.on);
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
        // Exclude the socket closing now: if it was the last human, this leaves
        // the table paused instead of arming a doomed bot-swap alarm.
        await this.scheduleNextWake(false, ws);
        // If they left during their own turn, the table is now waiting on
        // someone who can't see it — ping their installed app.
        this.notifyTurnIfAbsent(ws);
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
    // Freeze the table while no human is present: bots don't play into an empty
    // room, no disconnected human is auto-swapped or auto-readied, and no alarm
    // is re-armed. The game resumes when someone reconnects (onJoin re-wakes it).
    if (!this.hasConnectedHuman()) return;
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
      (typeof owner === 'string' &&
        (this.autoPlayOn(owner) || this.disconnectDeadline(owner) <= Date.now()));
    if (!botActs) {
      // A connected human's turn (or their deadline has not passed yet):
      // re-arm the alarm for whatever the next wake actually is.
      await this.scheduleNextWake();
      return;
    }
    const rng = mulberry32((game.seed ^ this.seq) >>> 0);
    // Bot seats play at their own level; a voluntary-AFK human is covered at
    // 'hard' (their choice); a disconnected human is covered at 'normal' — fair
    // to both teams.
    const difficulty = isBotOwner(owner)
      ? botDifficulty(owner)
      : typeof owner === 'string' && this.autoPlayOn(owner)
        ? 'hard'
        : 'normal';
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
    // A human is present again — resume a table that paused when the room
    // emptied (bot turns, disconnect deadlines, round_over auto-continue).
    await this.scheduleNextWake();
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
    // A spectator may take over a bot seat mid-game — the seat's hand/tricks/turn
    // carry over untouched, and the alarm's isBotOwner check means it will no
    // longer bot-play this (now human-owned) seat.
    const midGameTakeover =
      isBotOwner(occupant) &&
      this.meta.started &&
      this.game !== null &&
      this.game.phase !== 'game_over';
    // The sitter's current seat, if any — a seated player who moves onto an
    // occupied seat swaps with its owner; a spectator has none to swap back.
    const oldSeat = this.seatOf(att.userId);

    // Once the game is live, the ONLY allowed seat change is a mid-game bot
    // takeover. Everything else is fixed.
    if (this.meta.started && !midGameTakeover) {
      this.send(
        ws,
        occupant !== null
          ? { t: 'error', code: 'SEAT_TAKEN', message: `Seat ${seat} is taken` }
          : {
              t: 'error',
              code: 'ALREADY_STARTED',
              message: 'Cannot change seats after the game has started',
            },
      );
      return;
    }

    // Decide what goes back into the sitter's old seat. Pre-game, moving onto an
    // occupied seat is a swap (bot ↔ you, or human ↔ you); a spectator taking a
    // bot seat just displaces the bot (nothing to swap back), but may never bump
    // a seated human.
    let displaced: SeatOwner = null;
    if (occupant !== null && !midGameTakeover) {
      if (typeof occupant === 'string') {
        if (oldSeat === null) {
          this.send(ws, { t: 'error', code: 'SEAT_TAKEN', message: `Seat ${seat} is taken` });
          return;
        }
        displaced = occupant; // the other human moves to the sitter's old seat
      } else {
        displaced = oldSeat !== null ? occupant : null; // swap the bot back, or drop it
      }
    }

    for (const s of SEATS) {
      if (this.meta.seats[s] === att.userId) this.meta.seats[s] = null;
    }
    this.meta.seats[seat] = att.userId;
    if (oldSeat !== null && displaced !== null) this.meta.seats[oldSeat] = displaced;
    this.meta.names[att.userId] = att.name;
    if (this.meta.disconnectedSince?.[att.userId] !== undefined) {
      this.meta.disconnectedSince = Object.fromEntries(
        Object.entries(this.meta.disconnectedSince).filter(([id]) => id !== att.userId),
      );
    }
    att.viewer = seat;
    ws.serializeAttachment(att);
    await this.ctx.storage.put('meta', this.meta);
    // Fresh welcome so the sitter's client adopts its new viewer identity —
    // the store only learns `viewer` from welcome snapshots.
    this.sendWelcome(ws, att);
    // A swapped-out human moved seats too — refresh their clients' viewer.
    if (typeof displaced === 'string' && oldSeat !== null) {
      for (const socket of this.ctx.getWebSockets()) {
        const a = this.attachment(socket);
        if (a.userId !== displaced || typeof a.viewer !== 'number') continue;
        a.viewer = oldSeat;
        socket.serializeAttachment(a);
        if (a.joined) this.sendWelcome(socket, a);
      }
    }
    this.broadcastRoster({});
  }

  /** Empty a bot seat back to vacant (pre-game only). */
  private async onRemoveBot(ws: WebSocket, att: Attachment, seat: Seat): Promise<void> {
    if (!att.joined) {
      this.send(ws, { t: 'error', code: 'BAD_MESSAGE', message: 'Join the room first' });
      return;
    }
    if (this.meta.started) {
      this.send(ws, {
        t: 'error',
        code: 'ALREADY_STARTED',
        message: 'Cannot remove bots after the game has started',
      });
      return;
    }
    if (!isBotOwner(this.meta.seats[seat])) {
      this.send(ws, { t: 'error', code: 'BAD_MESSAGE', message: `Seat ${seat} has no bot` });
      return;
    }
    this.meta.seats[seat] = null;
    await this.ctx.storage.put('meta', this.meta);
    this.broadcastRoster({});
  }

  /**
   * Between games (game_over only): re-pair the table by swapping seats 1 and
   * 2, so both teams get new partners before the rematch. Seat ownership moves,
   * so every affected client gets a fresh welcome to adopt its new viewer seat;
   * the next `start` deals with the new seating.
   */
  private async onSwapSeats(ws: WebSocket, att: Attachment): Promise<void> {
    if (!att.joined) {
      this.send(ws, { t: 'error', code: 'BAD_MESSAGE', message: 'Join the room first' });
      return;
    }
    if (typeof att.viewer !== 'number') {
      this.send(ws, { t: 'error', code: 'BAD_MESSAGE', message: 'Only a seated player can swap' });
      return;
    }
    if (this.game === null || this.game.phase !== 'game_over') {
      this.send(ws, {
        t: 'error',
        code: 'BAD_MESSAGE',
        message: 'Seats can only be swapped between games',
      });
      return;
    }
    // Swap seats 1 ↔ 2 — re-pairs both teams (0&2 vs 1&3 → everyone new partner).
    const tmp = this.meta.seats[1];
    this.meta.seats[1] = this.meta.seats[2];
    this.meta.seats[2] = tmp;
    await this.ctx.storage.put('meta', this.meta);
    // Seat ownership moved — refresh each connected client's viewer identity.
    for (const socket of this.ctx.getWebSockets()) {
      const a = this.attachment(socket);
      if (!a.joined) continue;
      const viewer: Viewer = this.seatOf(a.userId) ?? 'spectator';
      if (viewer !== a.viewer) {
        a.viewer = viewer;
        socket.serializeAttachment(a);
        this.sendWelcome(socket, a);
      }
    }
    this.broadcastRoster({});
  }

  /** A seated player gives up their seat for good (recap "Leave" / home row). */
  private async onLeave(ws: WebSocket, att: Attachment): Promise<void> {
    if (!att.joined) {
      this.send(ws, { t: 'error', code: 'BAD_MESSAGE', message: 'Join the room first' });
      return;
    }
    await this.unseatUser(att.userId);
  }

  /**
   * Toggle voluntary auto-play for the sender's own seat. While on, the alarm
   * loop plays their turns at 'hard' (see alarm()); the seat stays theirs. Only
   * a spectator can't toggle it. Turning it on during their turn wakes the alarm
   * so the bot move fires on the normal bot cadence.
   */
  private async onSetAutoPlay(ws: WebSocket, att: Attachment, on: boolean): Promise<void> {
    if (!att.joined || this.seatOf(att.userId) === null) {
      this.send(ws, { t: 'error', code: 'NOT_SEATED', message: 'Take a seat first' });
      return;
    }
    const current = this.autoPlayOn(att.userId);
    if (current === on) return; // no-op — don't churn storage or rosters
    this.meta.autoPlay = on
      ? { ...this.meta.autoPlay, [att.userId]: true }
      : Object.fromEntries(
          Object.entries(this.meta.autoPlay ?? {}).filter(([id]) => id !== att.userId),
        );
    await this.ctx.storage.put('meta', this.meta);
    this.broadcastRoster({});
    // If it's their turn right now, arm the alarm so the auto-move plays promptly.
    if (on) await this.scheduleNextWake();
  }

  /**
   * Vacate a user's seat permanently. Mid-game the seat goes to a bot (the
   * game must stay playable for the other three); otherwise it simply frees
   * up. Their sockets, if any, drop to spectator. False if they had no seat.
   */
  private async unseatUser(userId: string): Promise<boolean> {
    const seat = this.seatOf(userId);
    if (seat === null) return false;
    const midGame = this.meta.started && this.game !== null && this.game.phase !== 'game_over';
    this.meta.seats[seat] = midGame ? { bot: true, difficulty: 'normal' } : null;
    if (this.meta.disconnectedSince?.[userId] !== undefined) {
      this.meta.disconnectedSince = Object.fromEntries(
        Object.entries(this.meta.disconnectedSince).filter(([id]) => id !== userId),
      );
    }
    if (this.meta.autoPlay?.[userId] !== undefined) {
      this.meta.autoPlay = Object.fromEntries(
        Object.entries(this.meta.autoPlay).filter(([id]) => id !== userId),
      );
    }
    await this.ctx.storage.put('meta', this.meta);
    for (const socket of this.ctx.getWebSockets()) {
      const a = this.attachment(socket);
      if (a.userId !== userId || typeof a.viewer !== 'number') continue;
      a.viewer = 'spectator';
      socket.serializeAttachment(a);
      if (a.joined) this.sendWelcome(socket, a);
    }
    this.broadcastRoster({});
    // The replacing bot may be the round_over holdout or the seat on turn.
    await this.continueIfAllReady();
    await this.scheduleNextWake();
    return true;
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

  private async onSetRules(ws: WebSocket, att: Attachment, hailMary12: boolean): Promise<void> {
    // Only seated players may set house rules, and only before a live game —
    // the rule is fixed for the game the moment it starts.
    const gameInProgress = this.meta.started && this.game?.phase !== 'game_over';
    if (gameInProgress) {
      this.send(ws, { t: 'error', code: 'ALREADY_STARTED', message: 'Game already started' });
      return;
    }
    if (!att.joined || typeof att.viewer !== 'number') {
      this.send(ws, {
        t: 'error',
        code: 'NOT_SEATED',
        message: 'Only seated players can set rules',
      });
      return;
    }
    this.meta.rules = { hailMary12 };
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
    const game = createGame(seed, this.meta.rules ?? { hailMary12: true });
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
      if (game.winner !== null) {
        const wins: [number, number] = [...this.meta.seriesWins] as [number, number];
        wins[game.winner] += 1;
        this.meta.seriesWins = wins;
        // Record this game's final scores for the between-games scorepad.
        this.meta.seriesGames = [...this.meta.seriesGames, [game.scores[0], game.scores[1]]];
      }
      // Auto-play is a mid-game convenience; clear it so the next game starts
      // with everyone in manual control.
      if (this.meta.autoPlay !== undefined && Object.keys(this.meta.autoPlay).length > 0) {
        this.meta.autoPlay = {};
      }
      await this.ctx.storage.put('meta', this.meta);
      // History write is strictly best-effort: awaited (so tests observe it)
      // but fully guarded — D1 being absent or failing never breaks the room.
      try {
        await this.persistHistory(game);
      } catch (err) {
        console.error('[history] game history write failed', err);
      }
      // Broadcast so every client's GameRecap picks up the freshly-incremented
      // standing-table tally without waiting for the next roster-triggering event.
      this.broadcastRoster({});
    }
    await this.scheduleNextWake(result.events.some((e) => e.type === 'trick_won'));
    this.notifyTurnIfAbsent();
  }

  /**
   * Web Push "it's your turn" to the seat-holder when none of their sockets is
   * connected — the installed-app path back to a table that's waiting on them.
   * Connected players (even hidden tabs) are covered by the app badge instead.
   */
  private notifyTurnIfAbsent(exclude?: WebSocket): void {
    const game = this.game;
    if (game === null || (game.phase !== 'bidding' && game.phase !== 'playing')) return;
    const owner = this.meta.seats[game.turn];
    if (typeof owner !== 'string') return; // bot or empty seat
    if (this.autoPlayOn(owner)) return; // a bot is covering this turn — no nag
    const connected = this.ctx.getWebSockets().some((s) => {
      if (s === exclude) return false;
      const a = this.attachment(s);
      return a.joined && a.userId === owner;
    });
    if (connected) return;
    const code = this.meta.roomCode;
    this.ctx.waitUntil(
      notifyUser(this.env, owner, {
        title: 'Jaffre',
        body: "À ton tour · It's your turn",
        url: code === undefined ? '/' : `/#room/${code}`,
        ...(code !== undefined ? { tag: `turn-${code}` } : {}),
      }),
    );
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
        names: this.meta.names,
      },
      game,
      [...stored.values()],
      { id: crypto.randomUUID(), finishedAt: Date.now() },
    );
    await db.batch([
      db
        .prepare(
          `INSERT INTO games (id, room_code, seed, started_at, finished_at, winner_team, score_0, score_1, action_log, round_summaries)
           VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)`,
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
          record.round_summaries,
        ),
      ...record.players.map((p) =>
        db
          .prepare(
            'INSERT INTO game_players (game_id, seat, user_id, is_bot, name) VALUES (?1, ?2, ?3, ?4, ?5)',
          )
          .bind(record.id, p.seat, p.user_id, p.is_bot, p.name),
      ),
    ]);
  }

  /** When `userId`'s bot-swap kicks in; +Infinity while they are connected. */
  private disconnectDeadline(userId: string): number {
    const since = this.meta.disconnectedSince?.[userId];
    if (since === undefined) return Number.POSITIVE_INFINITY;
    return since + (this.meta.botSwapMs ?? BOT_SWAP_MS);
  }

  /** Whether this user has voluntary auto-play on (server plays their turns). */
  private autoPlayOn(userId: string): boolean {
    return this.meta.autoPlay?.[userId] === true;
  }

  /**
   * The single alarm slot is shared by bot turns, round_over auto-continue,
   * and disconnected-human bot-swaps: compute the earliest wake we need and
   * set one alarm. Date.now() for scheduling only — the engine never sees time.
   */
  private async scheduleNextWake(afterTrick = false, exclude?: WebSocket): Promise<void> {
    const game = this.game;
    if (game === null || game.phase === 'game_over') return;
    // No human present → don't arm an alarm; the table is paused until someone
    // reconnects. (The alarm() guard is the real safety net; this just avoids a
    // pointless wake. `exclude` is the socket closing right now, in webSocketClose.)
    if (!this.hasConnectedHuman(exclude)) return;
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
      if (isBotOwner(owner) || (typeof owner === 'string' && this.autoPlayOn(owner))) {
        // A bot seat, or a human on voluntary auto-play — either way the server
        // plays this turn. A trick just completed: the clients hold + sweep the
        // 4 cards for ~2.2s, so we must wait out that animation window.
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

  /** Is any human currently connected (seated or spectating)? Bots hold no
   * socket, so any joined socket is a human. `exclude` skips a socket that is
   * closing right now (its close hasn't yet removed it from getWebSockets). */
  private hasConnectedHuman(exclude?: WebSocket): boolean {
    return this.ctx.getWebSockets().some((s) => s !== exclude && this.attachment(s).joined);
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
        ...(this.autoPlayOn(owner) ? { autoPlay: true } : {}),
      };
    });
    const spectators = attachments.filter((a) => a.joined && a.viewer === 'spectator').length;
    return {
      seats,
      spectators,
      started: this.meta.started,
      seriesWins: this.meta.seriesWins,
      seriesGames: this.meta.seriesGames,
      rules: this.meta.rules ?? { hailMary12: true },
    };
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
