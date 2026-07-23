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
import type {
  ChatEntry,
  ClientAction,
  ClientMessage,
  Roster,
  RosterSeat,
  ServerMessage,
} from '@jaffre/protocol';
import type { Env } from './env.js';
import { notifyUser } from './push.js';
import { gameRecordFrom } from './history.js';
import { DEFAULT_RATING, ratingUpdates, type CurrentRating } from './rating.js';
import { lobbyStub } from './Lobby.js';

/** Everything needed to (re)apply one user's rating move: the guarded UPDATE's
 * bound values plus `delta`, kept separately so a cross-room-race retry can
 * re-apply the same move on top of a freshly re-read `oldRating`. */
interface RatingWriteInfo {
  readonly userId: string;
  readonly name: string;
  readonly oldRating: number;
  readonly newRating: number;
  readonly newRatingGames: number;
  readonly delta: number;
}

const BOT_DELAY_MS = 700;
/** After a completed trick the client holds the 4 cards on the table
 * (~2.2s hold + sweep) — bots must not play into that window. */
export const TRICK_HOLD_MS = 2600;
/** How long a seated human may be fully disconnected mid-game before a bot
 * plays their turns. Tests can override per-room via `meta.botSwapMs`. */
export const BOT_SWAP_MS = 45_000;
/** How long a PRE-GAME seat survives its human's disconnect before it frees.
 * Long enough for a refresh or a dropped connection to come back; short
 * enough that a closed tab doesn't squat a lobby seat as a ghost forever. */
export const PREGAME_VACATE_MS = 60_000;
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
  /** Optional per-room override of PREGAME_VACATE_MS (used by tests). */
  preGameVacateMs?: number;
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
  /** Host opted this table into the public lobby / Quick Play. Only matters
   * while waiting (pre-start); the room is registered when public + a seat is
   * free, and deregistered otherwise. */
  public?: boolean;
  /** Whether this room currently has a live registration in the Lobby DO.
   * PERSISTED (not an instance field) so the deregister decision survives DO
   * hibernation — otherwise a woken instance would forget it was listed and
   * never remove a started/full/private room from matchmaking. */
  lobbyListed?: boolean;
  /** Rating movement from the game that just ended, one entry per SEATED
   * human who was rated — powers the "1043 (+12)" line on the recap so it
   * survives reconnects/refresh. Absent for unrated games; cleared as soon
   * as a rematch starts. */
  lastRatings?: { seat: number; rating: number; delta: number }[];
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
      await this.syncLobby(); // a freed seat may re-open the table for matchmaking
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
    await this.dispatch(ws, this.attachment(ws), msg);
    // Reconcile the matchmaking registry once, after the message settled — any
    // seat/started/public change is now reflected. Awaited (not fire-and-forget)
    // so the cross-DO call finishes within this request; dirty-checked, so it's
    // a no-op when the advertised state is unchanged.
    await this.syncLobby();
  }

  private async dispatch(ws: WebSocket, att: Attachment, msg: ClientMessage): Promise<void> {
    switch (msg.t) {
      case 'join':
        return this.onJoin(ws, att);
      case 'sit':
        return this.onSit(ws, att, msg.seat);
      case 'add_bot':
        return this.onAddBot(ws, att, msg.seat, msg.difficulty);
      case 'remove_bot':
        return this.onRemoveBot(ws, att, msg.seat);
      case 'start':
        return this.onStart(ws, att);
      case 'set_rules':
        return this.onSetRules(ws, att, msg.hailMary12);
      case 'swap_seats':
        return this.onSwapSeats(ws, att);
      case 'leave':
        return this.onLeave(ws, att);
      case 'set_autoplay':
        return this.onSetAutoPlay(ws, att, msg.on);
      case 'set_public':
        return this.onSetPublic(ws, att, msg.on);
      case 'ready':
        return this.onReady(ws, att);
      case 'action':
        return this.onAction(ws, att, msg.action);
      case 'chat':
        return this.onChat(ws, att, msg.text);
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
    // PRE-game, a vanished human must not squat their seat forever (ghost
    // "Player" rows in the lobby): start the same clock and arm the vacate.
    const preGameSeated = typeof att.viewer === 'number' && !this.meta.started;
    if (preGameSeated) {
      const stillConnected = this.ctx.getWebSockets().some((s) => {
        if (s === ws) return false;
        const a = this.attachment(s);
        return a.joined && a.userId === att.userId;
      });
      if (!stillConnected) {
        const now = Date.now();
        this.meta.disconnectedSince = { ...this.meta.disconnectedSince, [att.userId]: now };
        await this.ctx.storage.put('meta', this.meta);
        // Wake at the EARLIEST pending vacate — a plain now+grace would push
        // an earlier disconnector's deadline back every time someone drops.
        const grace = this.meta.preGameVacateMs ?? PREGAME_VACATE_MS;
        const soonest = Math.min(
          ...Object.values(this.meta.disconnectedSince).map((at) => at + grace),
        );
        await this.ctx.storage.setAlarm(soonest);
      }
    }
    // Recompute roster with this socket excluded so its seat shows
    // connected=false (plus botSwapAt when the clock was just started).
    this.broadcastRoster({ exclude: ws });
    // A disconnect can empty the room or free a seat — reconcile the lobby.
    await this.syncLobby();
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
    // Pre-game the alarm has exactly one job: free the seats of humans whose
    // disconnect grace ran out, so the table never carries ghosts.
    if (!this.meta.started) {
      await this.vacateAbsentPreGame();
      return;
    }
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
        // continueIfAllReady can deal the final round of the game — unlike the
        // webSocketMessage path, alarm() has no trailing syncLobby of its own,
        // so a bots-driven game_over would otherwise linger listed forever.
        await this.syncLobby();
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
    // A bot's move can be the one that ends the game (game_over) or starts one
    // being watched — alarm() isn't followed by webSocketMessage's syncLobby,
    // so without this a bot-finished public game would never deregister.
    await this.syncLobby();
  }

  /** Free every pre-game seat whose human has been gone past the grace; keep
   * the alarm armed while anyone's clock is still running. Rejoining clears
   * the clock in onJoin, so a refresh never loses its seat. */
  private async vacateAbsentPreGame(): Promise<void> {
    const now = Date.now();
    const grace = this.meta.preGameVacateMs ?? PREGAME_VACATE_MS;
    const since = this.meta.disconnectedSince ?? {};
    const kept: Record<string, number> = {};
    let changed = false;
    let nextWake: number | null = null;
    for (const [uid, at] of Object.entries(since)) {
      const seat = this.seatOf(uid);
      if (seat === null) {
        changed = true; // stale entry (already left/stood up) — just drop it
        continue;
      }
      if (at + grace <= now) {
        this.meta.seats[seat] = null;
        changed = true;
      } else {
        kept[uid] = at;
        nextWake = nextWake === null ? at + grace : Math.min(nextWake, at + grace);
      }
    }
    if (changed) {
      this.meta.disconnectedSince = kept;
      await this.ctx.storage.put('meta', this.meta);
      this.broadcastRoster({});
      await this.syncLobby(); // a freed seat re-opens the table for matchmaking
    }
    if (nextWake !== null) await this.ctx.storage.setAlarm(nextWake);
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

  /** Host toggles whether this table is listed for matchmaking. Any seated
   * player may flip it (small, friendly tables); broadcastRoster then syncs the
   * lobby registry. */
  private async onSetPublic(ws: WebSocket, att: Attachment, on: boolean): Promise<void> {
    if (!att.joined || this.seatOf(att.userId) === null) {
      this.send(ws, { t: 'error', code: 'NOT_SEATED', message: 'Take a seat first' });
      return;
    }
    if ((this.meta.public ?? false) === on) return; // no-op
    this.meta.public = on;
    await this.ctx.storage.put('meta', this.meta);
    this.broadcastRoster({});
  }

  /** The lobby entry this room should advertise, or null when it shouldn't be
   * listed. Pre-game: public, waiting, at least one (but not all four) human
   * seated. Mid-game: public, started, the game not yet over, and at least one
   * human still seated — a game that's run entirely down to bots (every human
   * left for good) has nobody to watch play, so it drops off too. A finished
   * game (game_over) always returns null so syncLobby deregisters the table
   * and it falls off the "watch live" list. */
  private lobbyEntry(): {
    code: string;
    host: string;
    players: number;
    capacity: number;
    phase: 'waiting' | 'playing';
  } | null {
    const code = this.meta.roomCode;
    if (code === undefined) return null;
    if (this.meta.public !== true) return null;
    const humans = this.meta.seats.filter((o): o is string => typeof o === 'string');
    if (!this.meta.started) {
      const open = humans.length >= 1 && humans.length < 4;
      if (!open) return null;
      return {
        code,
        host: this.meta.names[humans[0] as string] ?? 'Player',
        players: humans.length,
        capacity: 4,
        phase: 'waiting',
      };
    }
    const gameLive = this.game !== null && this.game.phase !== 'game_over';
    if (!gameLive || humans.length === 0) return null;
    return {
      code,
      host: this.meta.names[humans[0] as string] ?? 'Player',
      players: humans.length,
      capacity: 4,
      phase: 'playing',
    };
  }

  /** Push this room's open/closed state to the matchmaking Lobby DO. Best-effort.
   * A room that was never listed (the common private/join-by-code case) makes NO
   * cross-DO call — the persisted `meta.lobbyListed` gates the deregister — so
   * only genuinely public tables ever touch the Lobby. For an open public room
   * this re-registers on every call; since syncLobby runs after each message
   * (incl. the client's 30s keepalive ping), that doubles as the heartbeat that
   * keeps the entry fresh against the Lobby's TTL. No-op when the LOBBY binding
   * is absent (tests / no-binding envs). */
  private async syncLobby(): Promise<void> {
    const code = this.meta.roomCode;
    if (code === undefined) return;
    const entry = this.lobbyEntry();
    const wasListed = this.meta.lobbyListed === true;
    // Nothing to advertise and nothing was ever advertised → no call needed.
    if (entry === null && !wasListed) return;
    const lobby = lobbyStub(this.env);
    if (lobby === null) {
      // No binding — just track intent so the state stays consistent.
      if (wasListed !== (entry !== null)) {
        this.meta.lobbyListed = entry !== null;
        await this.ctx.storage.put('meta', this.meta);
      }
      return;
    }
    try {
      if (entry === null) {
        await lobby.fetch('https://lobby/deregister', {
          method: 'POST',
          body: JSON.stringify({ code }),
        });
        this.meta.lobbyListed = false;
        await this.ctx.storage.put('meta', this.meta);
      } else {
        // Always re-register (refreshes updatedAt = heartbeat); persist the
        // listed flag only on the false→true transition to limit meta writes.
        await lobby.fetch('https://lobby/register', {
          method: 'POST',
          body: JSON.stringify(entry),
        });
        if (!wasListed) {
          this.meta.lobbyListed = true;
          await this.ctx.storage.put('meta', this.meta);
        }
      }
    } catch {
      // Leave the persisted flag as-is so the next message retries the sync.
    }
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
    // Rematch: the previous game's rating movement no longer applies to the
    // recap that hasn't happened yet.
    delete this.meta.lastRatings;
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
    const seat = this.seatOf(att.userId);
    const entry: ChatEntry = {
      from: att.name,
      text,
      at: Date.now(),
      ...(seat !== null ? { seat } : {}),
    };
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
    // Elo-like rating: bump each human's rating from this game's outcome. Read
    // their current ratings first, then fold the writes into the same batch so
    // history + rating land atomically. A rating-read failure must NOT lose the
    // history row, so it degrades to "history without rating".
    let ratingInfo: RatingWriteInfo[] = [];
    try {
      ratingInfo = await this.ratingWriteInfo(db, record.players, record.winner_team);
    } catch {
      ratingInfo = [];
    }

    // Stash for the recap: map each rated human's userId back to their seat
    // (via meta.seats, still the just-finished game's seating) so the roster
    // can carry rating movement without a client-side round-trip.
    if (ratingInfo.length > 0) {
      const lastRatings: { seat: number; rating: number; delta: number }[] = [];
      for (const info of ratingInfo) {
        const seat = this.meta.seats.findIndex((s) => s === info.userId);
        if (seat === -1) continue;
        lastRatings.push({ seat, rating: info.newRating, delta: info.delta });
      }
      this.meta.lastRatings = lastRatings;
      await this.ctx.storage.put('meta', this.meta);
    }

    const results = await db.batch([
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
      ...ratingInfo.map((info) => this.ratingStatement(db, info)),
    ]);

    // The rating writes are optimistically guarded (WHERE rating = <old value read
    // above>) to close a cross-room race: two rooms finishing simultaneously with
    // a shared player can both read the same starting rating, and without a guard
    // whichever write lands second would silently clobber the first. A guard miss
    // means another room won that race first — re-read the now-current rating and
    // re-apply this game's delta on top of it (one retry; ratings are best-effort,
    // never worth failing history over).
    const ratingResults = results.slice(1 + record.players.length);
    for (const [i, info] of ratingInfo.entries()) {
      if ((ratingResults[i]?.meta.changes ?? 0) > 0) continue;
      try {
        await this.retryRatingWrite(db, info);
      } catch (err) {
        console.error('[rating] retry failed, leaving rating unchanged', err);
      }
    }
  }

  /** Re-reads one user's now-current rating and re-applies this game's delta on
   * top of it, with the same optimistic guard. Logs and gives up (does not throw)
   * if the guarded write misses a second time — a rating that briefly lags one
   * game behind is fine; failing history is not. */
  private async retryRatingWrite(db: D1Database, info: RatingWriteInfo): Promise<void> {
    const fresh = await db
      .prepare('SELECT rating, rating_games FROM users WHERE id = ?1')
      .bind(info.userId)
      .first<{ rating: number; rating_games: number }>();
    if (fresh === null) {
      console.error('[rating] retry found no user row', info.userId);
      return;
    }
    const retryInfo: RatingWriteInfo = {
      ...info,
      oldRating: fresh.rating,
      newRating: fresh.rating + info.delta,
      newRatingGames: fresh.rating_games + 1,
    };
    const result = await this.ratingStatement(db, retryInfo).run();
    if (result.meta.changes === 0) {
      console.error('[rating] retry lost the race a second time', info.userId);
    }
  }

  /** The single optimistically-guarded rating UPDATE, shared by the initial
   * batch attempt and the one-shot retry. */
  private ratingStatement(db: D1Database, info: RatingWriteInfo): D1PreparedStatement {
    // Uses an UPSERT, not a bare UPDATE: a seated, token-verified human can lack a
    // `users` row (D1 was down at guest signup, or the no-secret `?u=` mode never
    // hits an auth handler). A plain UPDATE would silently match 0 rows and drop
    // their rating forever; ON CONFLICT materializes the row on their first rated
    // game instead. The `WHERE rating = ?6` on the conflict path is the optimistic
    // guard: it only takes effect (and only updates) when the row still has the
    // rating this write was computed against.
    return db
      .prepare(
        `INSERT INTO users (id, name, created_at, rating, rating_games)
         VALUES (?1, ?2, ?3, ?4, ?5)
         ON CONFLICT(id) DO UPDATE SET rating = ?4, rating_games = ?5 WHERE rating = ?6`,
      )
      .bind(
        info.userId,
        info.name,
        Date.now(),
        info.newRating,
        info.newRatingGames,
        info.oldRating,
      );
  }

  /** Build the rating-write inputs for a finished game — reads the human
   * players' current ratings, then applies the Elo delta. Returns [] when the
   * game isn't rated (undecided, or a bot on either team). */
  private async ratingWriteInfo(
    db: D1Database,
    players: readonly {
      readonly seat: number;
      readonly user_id: string | null;
      readonly is_bot: 0 | 1;
      readonly name: string;
    }[],
    winnerTeam: number | null,
  ): Promise<RatingWriteInfo[]> {
    const humans = players.filter((p) => p.is_bot === 0 && p.user_id !== null);
    if (humans.length === 0) return [];
    const humanIds = humans.map((p) => p.user_id as string);
    const nameOf = new Map(humans.map((p) => [p.user_id as string, p.name]));

    const placeholders = humanIds.map((_, i) => `?${String(i + 1)}`).join(', ');
    const rows = await db
      .prepare(`SELECT id, rating, rating_games FROM users WHERE id IN (${placeholders})`)
      .bind(...humanIds)
      .all<{ id: string; rating: number; rating_games: number }>();
    const current: Record<string, CurrentRating> = {};
    for (const r of rows.results) current[r.id] = { rating: r.rating, ratingGames: r.rating_games };

    const updates = ratingUpdates(
      players.map((p) => ({ seat: p.seat, userId: p.user_id, isBot: p.is_bot })),
      winnerTeam,
      current,
    );
    return updates.map((u) => ({
      userId: u.userId,
      name: nameOf.get(u.userId) ?? 'Player',
      oldRating: current[u.userId]?.rating ?? DEFAULT_RATING,
      newRating: u.rating,
      newRatingGames: u.ratingGames,
      delta: u.delta,
    }));
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
      public: this.meta.public ?? false,
      ...(this.meta.lastRatings !== undefined ? { ratings: this.meta.lastRatings } : {}),
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
