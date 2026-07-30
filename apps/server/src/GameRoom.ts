/**
 * One Durable Object per game room. Uses the WebSocket hibernation API:
 * per-socket identity lives in the socket attachment, all room state lives in
 * durable storage, and in-memory caches are lazily re-hydrated on every wake.
 * Bots (and round_over auto-continue) advance the game via storage alarms.
 *
 * This class is the shell: storage load/save, the fetch/WebSocket/alarm
 * entry points, message dispatch, and the engine-action pipeline shared by
 * humans and bot alarms. The hardened presence/alarm/claim invariants
 * (disconnect clocks, bot takeover, botSwapAt/botPlaying, recap
 * ready-timeouts, all-bots unfreeze) live in ./room/presence.ts and
 * ./room/bots.ts — see their header comments before touching either.
 */
import { applyAction, deserialize, redactEvent, serialize, viewFor } from '@jaffre/engine';
import type { Action, GameState, Seat } from '@jaffre/engine';
import { parseClientMessage } from '@jaffre/protocol';
import type { ChatEntry, ClientAction, ClientMessage, ServerMessage } from '@jaffre/protocol';
import type { Env } from './env.js';
import { lobbyStub } from './Lobby.js';
import { displayName } from './publicId.js';
import { emptyMeta, SEATS, type Attachment, type LogEntry, type Meta } from './room/types.js';
import { emptyMusic, extractVideoId, type StoredMusic } from './room/music.js';
import {
  broadcastMusic,
  maybeAdvanceBySkip,
  musicFor,
  onMusicAdd,
  onMusicEnded,
  onMusicError,
  onMusicRemove,
  onMusicSkipVote,
} from './room/music.js';
import { persistHistory } from './room/persistence.js';
import {
  broadcastRoster,
  markDropped,
  notifyTurnIfAbsent,
  onImHere,
  onReady,
  onSetAutoPlay,
  pruneMeta,
  roster,
  scheduleNextWake,
  unseatUser,
  BOT_SWAP_MS,
  PREGAME_VACATE_MS,
  TRICK_HOLD_MS,
  TURN_TIMER_MS,
} from './room/presence.js';
import { runAlarm } from './room/bots.js';
import {
  armReaper,
  clearEmptyStamp,
  reapIfDue,
  ABANDONED_REAP_MS,
  EMPTY_REAP_MS,
} from './room/reaper.js';
import {
  onAddBot,
  onJoin,
  onKick,
  onLeave,
  onRemoveBot,
  onSetPublic,
  onSetRules,
  onSit,
  onStart,
  onSwapSeats,
} from './room/seats.js';

// Re-exported so `../src/GameRoom.js` remains the one import path tests and
// index.ts use, even though the constants and helper now live in room/*.ts.
export {
  ABANDONED_REAP_MS,
  BOT_SWAP_MS,
  EMPTY_REAP_MS,
  PREGAME_VACATE_MS,
  TRICK_HOLD_MS,
  TURN_TIMER_MS,
  extractVideoId,
};

const CHAT_CAP = 100;
/** Sliding-window chat rate limit: at most this many messages per uid within
 * CHAT_RATE_WINDOW_MS. */
const CHAT_RATE_LIMIT = 5;
const CHAT_RATE_WINDOW_MS = 10_000;

/** Plain-language EN fallback for a system chat entry's `from`/`text` — read
 * only by a client too old to understand `system`, so it renders something
 * sane instead of an empty bubble. The code+name pair is the real payload;
 * see ChatEntry.system and ChatPanel's localization for what ships today. */
function systemChatFallback(system: NonNullable<ChatEntry['system']>): {
  from: string;
  text: string;
} {
  const who = system.name ?? 'Someone';
  const from = 'Table';
  switch (system.code) {
    case 'sat':
      return { from, text: `${who} sat down.` };
    case 'left':
      return { from, text: `${who} left.` };
    case 'dropped':
      return { from, text: `${who} dropped.` };
    case 'botPlaying':
      return { from, text: `A bot is playing ${who}'s hand.` };
    case 'back':
      return { from, text: `${who} is back.` };
    case 'started':
      return { from, text: 'Game on.' };
  }
}

export class GameRoom implements DurableObject {
  meta: Meta = emptyMeta();
  game: GameState | null = null;
  seq = 0;
  chat: ChatEntry[] = [];
  music: StoredMusic = emptyMusic();
  private loaded = false;
  /** uid → recent chat send timestamps, for the sliding-window rate limit.
   * Deliberately IN-MEMORY, not persisted: hibernation resetting a spammer's
   * window is a non-issue (worst case they get a few extra messages right
   * after a wake), and it's far cheaper than a storage write per chat. */
  private readonly chatTimestamps = new Map<string, number[]>();
  /** uid (the sitter who joined) → Date.now() of their last "joined your
   * table" push to the host, for the JOIN_PUSH_THROTTLE_MS throttle. Same
   * IN-MEMORY tradeoff as chatTimestamps: a hibernation wake resetting this
   * just risks one extra ping right after a wake, far cheaper than a storage
   * write on every seat change. */
  readonly joinPushTimestamps = new Map<string, number>();
  /** uids of seated humans who voted to skip the CURRENT track. IN-MEMORY like
   * chatTimestamps: a hibernation wake resetting votes mid-track is cosmetic. */
  readonly skipVoters = new Set<string>();
  /** uids that reported the current track unplayable — same tradeoff. */
  readonly errorReporters = new Set<string>();
  /** uid → recent music_add timestamps, same sliding window as chat's. */
  readonly musicAddTimestamps = new Map<string, number[]>();
  /** uids currently announced (system chat "A bot is playing…") as bot-
   * covered — the dedupe for presence.ts's broadcastRoster takeover edge
   * detection: `botPlaying` is DERIVED (a deadline vs Date.now()) and
   * recomputed on every roster build, so without this a seat that stays
   * bot-covered for many turns would repeat the line on every broadcast.
   * Cleared by markBack (reconnect) and clearUserState (permanent leave).
   * IN-MEMORY like chatTimestamps above: a rare isolate eviction re-firing
   * the line once is the same cheap tradeoff already accepted there. */
  readonly botPlayingAnnounced = new Set<string>();

  constructor(
    readonly ctx: DurableObjectState,
    readonly env: Env,
  ) {}

  /** Re-hydrate the in-memory cache from storage. Never trusted across wakes. */
  private async load(): Promise<void> {
    if (this.loaded) return;
    const [meta, game, seq, chat, music] = await Promise.all([
      this.ctx.storage.get<Meta>('meta'),
      this.ctx.storage.get<string>('game'),
      this.ctx.storage.get<number>('seq'),
      this.ctx.storage.get<ChatEntry[]>('chat'),
      this.ctx.storage.get<StoredMusic>('music'),
    ]);
    // Spread over emptyMeta() so legacy persisted metas (pre-seriesWins) still
    // satisfy the current shape without a migration.
    this.meta = { ...emptyMeta(), ...meta };
    this.game = game !== undefined ? deserialize(game) : null;
    this.seq = seq ?? 0;
    this.chat = chat ?? [];
    this.music = music ?? emptyMusic();
    this.loaded = true;
  }

  /** Drop the in-memory mirror of storage that no longer exists — called by
   * the reaper right after deleteAll(). Without it a woken instance would
   * keep serving the deleted room's meta/game from memory (`loaded` short-
   * circuits load()), so a reaped code would answer with a ghost table until
   * the instance happened to evict. */
  forgetCache(): void {
    this.loaded = false;
    this.meta = emptyMeta();
    this.game = null;
    this.seq = 0;
    this.chat = [];
    this.music = emptyMusic();
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
      const left = await unseatUser(this, uid);
      await this.syncLobby(); // a freed seat may re-open the table for matchmaking
      // This path can run with zero sockets attached (that's its point), and
      // scheduleNextWake won't arm without a connected human — so make sure the
      // self-destruct clock is ticking. No-op if anyone is still connected.
      await armReaper(this);
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
    let dirty = roomCode !== undefined && this.meta.roomCode !== roomCode;
    if (roomCode !== undefined) this.meta.roomCode = roomCode;
    // Someone is here again: stop the storage self-destruct clock, so the
    // grace is always measured from the LAST socket to leave (room/reaper.ts).
    if (clearEmptyStamp(this)) dirty = true;
    if (dirty) await this.ctx.storage.put('meta', this.meta);
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
        return onJoin(this, ws, att, msg.paint, msg.felt, msg.sweep);
      case 'sit':
        return onSit(this, ws, att, msg.seat);
      case 'add_bot':
        return onAddBot(this, ws, att, msg.seat, msg.difficulty);
      case 'remove_bot':
        return onRemoveBot(this, ws, att, msg.seat);
      case 'kick':
        return onKick(this, ws, att, msg.seat);
      case 'start':
        return onStart(this, ws, att);
      case 'set_rules':
        return onSetRules(this, ws, att, msg.hailMary12, msg.turnTimer, msg.tableStyle);
      case 'swap_seats':
        return onSwapSeats(this, ws, att);
      case 'leave':
        return onLeave(this, ws, att);
      case 'set_autoplay':
        return onSetAutoPlay(this, ws, att, msg.on);
      case 'im_here':
        return onImHere(this, att);
      case 'set_public':
        return onSetPublic(this, ws, att, msg.on);
      case 'ready':
        return onReady(this, ws, att);
      case 'action':
        return this.onAction(ws, att, msg.action);
      case 'chat':
        return this.onChat(ws, att, msg.text);
      case 'music_add':
        return onMusicAdd(this, ws, att, msg.url);
      case 'music_remove':
        return onMusicRemove(this, att, msg.id);
      case 'music_skip_vote':
        return onMusicSkipVote(this, ws, att);
      case 'music_ended':
        return onMusicEnded(this, att, msg.id);
      case 'music_error':
        return onMusicError(this, att, msg.id);
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
        // Stamps the clock AND drops a "so-and-so dropped" chat line — see
        // presence.ts's header comment for why this whole invariant set lives
        // there rather than inline here.
        markDropped(this, att.userId);
        await this.ctx.storage.put('meta', this.meta);
        // Exclude the socket closing now: if it was the last human, this leaves
        // the table paused instead of arming a doomed bot-swap alarm.
        await scheduleNextWake(this, ws);
        // If they left during their own turn, the table is now waiting on
        // someone who can't see it — ping their installed app.
        notifyTurnIfAbsent(this, ws);
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
    // A departing seated human can LOWER the skip threshold below an
    // already-cast vote count — resolve that now, and refresh everyone's
    // skipNeeded either way.
    if (this.music.current !== null) {
      await maybeAdvanceBySkip(this, ws);
      if (this.music.current !== null) broadcastMusic(this, ws);
    }
    // Recompute roster with this socket excluded so its seat shows
    // connected=false (plus botSwapAt when the clock was just started).
    broadcastRoster(this, { exclude: ws });
    // A disconnect can empty the room or free a seat — reconcile the lobby.
    await this.syncLobby();
    // Last one out starts the storage self-destruct clock. AFTER the branches
    // above, which arm real wakes (bot-swap, pre-game vacate) — armReaper
    // only lowers the alarm, never pushes one out.
    await armReaper(this, ws);
  }

  async webSocketError(ws: WebSocket): Promise<void> {
    try {
      ws.close(1011, 'error');
    } catch {
      // Socket already gone.
    }
    // An abnormally-terminated socket gets webSocketError INSTEAD of
    // webSocketClose, so the self-destruct clock has to start here too or a
    // room emptied by a dropped connection would never be reaped.
    await this.load();
    await armReaper(this, ws);
  }

  /** Bot turns, round_over auto-continue, and disconnected-human bot-swaps
   * all run here, never inline — the actual policy lives in room/bots.ts. */
  async alarm(): Promise<void> {
    this.loaded = false; // always re-read after a wake — memory is not trusted
    await this.load();
    // The storage self-destruct is checked FIRST and re-armed LAST, which is
    // what lets room/bots.ts stay ignorant of it: nothing else in the alarm
    // path can run against deleted storage, and every early return in
    // runAlarm (game_over, no human present) still leaves the reap wake armed.
    if (await reapIfDue(this)) return;
    await runAlarm(this);
    await armReaper(this);
  }

  /* ── Message handlers kept here (small, or tightly bound to applyEngineAction) ── */

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
      await onReady(this, ws, att);
      return;
    }
    // A manual bid/play is the player taking control back — flip auto-play
    // off first so the alarm loop can't race their own moves. (The stock
    // client goes quiet while auto-piloted, so this only fires for stale or
    // modified clients — but it makes the auto-play contract true serverside.)
    if (this.meta.autoPlay?.[att.userId] === true) {
      this.meta.autoPlay = Object.fromEntries(
        Object.entries(this.meta.autoPlay ?? {}).filter(([id]) => id !== att.userId),
      );
      await this.ctx.storage.put('meta', this.meta);
      broadcastRoster(this, {});
    }
    // Stamp the seat from the authenticated attachment — never from the wire.
    const action: Action =
      client.type === 'place_bid'
        ? { type: 'place_bid', seat, choice: client.choice }
        : { type: 'play_card', seat, card: client.card };
    await this.applyEngineAction(action, ws);
  }

  private async onChat(ws: WebSocket, att: Attachment, text: string): Promise<void> {
    if (!att.joined) {
      this.send(ws, { t: 'error', code: 'BAD_MESSAGE', message: 'Join the room first' });
      return;
    }
    // Sliding-window rate limit: drop timestamps older than the window, then
    // check the cap. IN-MEMORY (see chatTimestamps) — a spammer surviving a
    // hibernation wake with a clean slate is cheap insurance, not a hole worth
    // a storage write per message to close.
    const now = Date.now();
    const recent = (this.chatTimestamps.get(att.userId) ?? []).filter(
      (t) => now - t < CHAT_RATE_WINDOW_MS,
    );
    if (recent.length >= CHAT_RATE_LIMIT) {
      this.chatTimestamps.set(att.userId, recent);
      this.send(ws, {
        t: 'error',
        code: 'CHAT_RATE',
        message: 'Easy — a few messages per moment.',
      });
      return;
    }
    recent.push(now);
    this.chatTimestamps.set(att.userId, recent);
    // Chat timestamps are presentation, not game logic — Date.now() is fine here.
    const seat = this.seatOf(att.userId);
    const entry: ChatEntry = {
      // Spectators can chat without ever sitting — and without ever meeting the
      // lobby's name card — so this is the one place an unnamed visitor's name
      // reaches the whole table. Disambiguate it like every other surface.
      from: displayName(att.name, att.userId),
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

  /**
   * Append a table-moment notice (sat/left/dropped/botPlaying/back/started) —
   * code + name only; ChatPanel localizes it. Reuses onChat's exact append/
   * cap/persist/broadcast path (CHAT_CAP truncation included) so a burst of
   * system lines can't grow the chat log past what human messages already
   * respect, and no rate limit — these are server-authored, not player input.
   * Callers in room/seats.ts and room/presence.ts own WHEN each code fires;
   * this is only the plumbing.
   */
  async pushSystemChat(system: NonNullable<ChatEntry['system']>): Promise<void> {
    const { from, text } = systemChatFallback(system);
    const entry: ChatEntry = { from, text, at: Date.now(), system };
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

  async applyEngineAction(action: Action, errorTarget?: WebSocket): Promise<void> {
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
    // Every successful action hands control to whoever is next to act (or
    // ends the round) — that's a fresh decision point, so restart the
    // decision clock for it. round_over gets a stamp too: it anchors the
    // recap's ready-timeout (a connected human idling on the recap must not
    // stall the table forever — see room/presence.ts's alarm() usage). Cleared
    // at game_over so a stale timestamp can't leak into the next game.
    if (game.phase === 'game_over') {
      delete this.meta.turnStartedAt;
    } else {
      this.meta.turnStartedAt = Date.now();
    }
    await this.ctx.storage.put({
      meta: this.meta,
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
    // The roster is the only carrier of the per-seat clocks (turnTimerAt, a
    // disconnected seat's botSwapAt → botPlaying flip) and, on round_over
    // entry, the recap's readyTimeoutAt — without a roster per action those
    // would only surface after an unrelated join/close/ready refresh. Every
    // table gets it, not just turn-timer ones: rule-opt-out rooms still show
    // the away countdown and its bot-playing steady state. (game_over has its
    // own broadcast below, after the series tallies are updated.)
    if (game.phase !== 'game_over') {
      broadcastRoster(this, {});
    }
    if (game.phase === 'game_over') {
      if (game.winner !== null) {
        const wins: [number, number] = [...this.meta.seriesWins] as [number, number];
        wins[game.winner] += 1;
        this.meta.seriesWins = wins;
        // Record this game's final scores for the between-games scorepad.
        this.meta.seriesGames = [...this.meta.seriesGames, [game.scores[0], game.scores[1]]];
        // And its per-seat trick totals for the individual tricks scorecard.
        // Rounds scored before trickCounts existed contribute nothing; if the
        // whole game predates it, record null so rows stay aligned to games.
        const tricks: [number, number, number, number] = [0, 0, 0, 0];
        let hasTricks = false;
        for (const summary of game.roundSummaries) {
          if (summary.trickCounts === undefined) continue;
          hasTricks = true;
          for (const seat of [0, 1, 2, 3] as const) tricks[seat] += summary.trickCounts[seat];
        }
        this.meta.seriesTricks = [...(this.meta.seriesTricks ?? []), hasTricks ? tricks : null];
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
        await persistHistory(this, game);
      } catch (err) {
        console.error('[history] game history write failed', {
          room: this.meta.roomCode,
          err,
        });
      }
      // AFTER history, which reads names for the seats it records: forget
      // everyone who no longer holds a seat. A long-lived room otherwise
      // carried an entry for every player ever displaced by a swap, takeover
      // or between-games reshuffle — re-serialised on every single action.
      if (pruneMeta(this)) await this.ctx.storage.put('meta', this.meta);
      // Broadcast so every client's GameRecap picks up the freshly-incremented
      // standing-table tally without waiting for the next roster-triggering event.
      broadcastRoster(this, {});
    }
    await scheduleNextWake(this);
    notifyTurnIfAbsent(this);
  }

  /* ── Matchmaking (Lobby DO) sync ─────────────────────────────────────
   * Kept here rather than in a room/* module: lobbyEntry/syncLobby are
   * called from webSocketMessage, fetch's /leave route, and both
   * room/presence.ts (vacateAbsentPreGame) and room/bots.ts (runAlarm) — a
   * small (~80 line), single-purpose pair with call sites in nearly every
   * module isn't made simpler by moving it, only harder to find. */

  /** The lobby entry this room should advertise, or null when it shouldn't be
   * listed. Pre-game OR between games: public, waiting, at least one (but not
   * all four) human seated. Mid-game: public, started, the game not yet over,
   * and at least one human still seated — a game that's run entirely down to
   * bots (every human left for good) has nobody to watch play, so it drops off
   * too. A finished game (game_over) with a full human table returns null so
   * syncLobby deregisters the table and it falls off the "watch live" list —
   * but a finished game with room for a joiner is treated the same as
   * pre-game: `meta.started` is a one-way flag (flips true at the first
   * `start` and never resets, even across a rematch's `isRematch` restart), so
   * "waiting" cannot be gated on `!started` alone or a public table with open
   * seats would never re-list between games. Bots never block a joiner — one
   * can always displace a bot seat before the next `start` — so seats held
   * only by bots still count as open here, same as pre-game. */
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
    const betweenGames = this.meta.started && this.game?.phase === 'game_over';
    if (!this.meta.started || betweenGames) {
      const open = humans.length >= 1 && humans.length < 4;
      if (!open) return null;
      return {
        code,
        host: displayName(this.meta.names[humans[0] as string], humans[0] as string),
        players: humans.length,
        capacity: 4,
        phase: 'waiting',
      };
    }
    const gameLive = this.game !== null && this.game.phase !== 'game_over';
    if (!gameLive || humans.length === 0) return null;
    return {
      code,
      host: displayName(this.meta.names[humans[0] as string], humans[0] as string),
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
  async syncLobby(): Promise<void> {
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
    } catch (err) {
      // Leave the persisted flag as-is so the next message retries the sync.
      // But SAY so: a silently-failing lobby sync is a matchmaking registry
      // that quietly stops listing open tables, and "the lobby shows nothing"
      // is exactly the report you cannot act on without this line.
      console.error('[lobby] sync failed', { room: this.meta.roomCode, err });
    }
  }

  /* ── Helpers ───────────────────────────────────────────────────────── */

  attachment(ws: WebSocket): Attachment {
    return ws.deserializeAttachment() as Attachment;
  }

  seatOf(userId: string): Seat | null {
    for (const s of SEATS) {
      if (this.meta.seats[s] === userId) return s;
    }
    return null;
  }

  /** Snapshot of everything a client needs to (re)adopt its identity. Kept as
   * a GameRoom method (not a room/seats.ts export) because it's called from
   * both room/seats.ts and room/presence.ts's unseatUser — a module in
   * either direction would create a needless import cycle between the two. */
  sendWelcome(ws: WebSocket, att: Attachment): void {
    this.send(ws, {
      t: 'welcome',
      viewer: att.viewer,
      view: this.game !== null ? viewFor(this.game, att.viewer) : null,
      seq: this.seq,
      roster: roster(this),
      chatTail: this.chat,
      music: musicFor(this, att),
    });
  }

  send(ws: WebSocket, msg: ServerMessage): void {
    try {
      ws.send(JSON.stringify(msg));
    } catch {
      // Socket closed under us — the close handler will refresh the roster.
    }
  }
}
