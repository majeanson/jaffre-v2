import type { ClientMessage, Roster, ServerMessage } from '@jaffre/protocol';
import type { Lang } from '@jaffre/ui';
import { currentLang } from '../lang.js';
import { currentCardSkin } from '../cosmetics.js';
import { currentFelt } from '../felt.js';
import { currentSweep } from '../sweeps.js';
import { emitTableEvent, scoreSummary } from '../embed.js';
import { useGameStore } from '../state/gameStore.js';
import { useMusicStore } from '../state/musicStore.js';
import { getGuestToken, getProfile } from './auth.js';
import { bustStatsCache } from './history.js';
import { localizeNotice } from './noticeCodes.js';
import { rememberTable } from './rooms.js';
import { reportError } from './telemetry.js';

/** Server error codes that are routine / expected — shown to the player as a
 * toast but not worth a telemetry beacon (e.g. a stale click racing a turn
 * change). Anything else is an unexpected rejection worth knowing about. */
const SILENT_ERROR_CODES = new Set(['NOT_YOUR_TURN', 'BAD_MESSAGE']);

/** H2 — the felt moment a bot takes over (or gives back) a disconnected
 * human's seat, as a NoticeToast. Same code+name→sentence split as the
 * server's system chat entries (H1), but this is a pure client-side roster
 * diff: nothing new rides the wire for it. */
const BOT_TAKEOVER_T: Record<
  Lang,
  { readonly takeover: (name: string) => string; readonly back: (name: string) => string }
> = {
  en: {
    takeover: (name) => `A bot is playing ${name}'s hand.`,
    back: (name) => `${name} is back.`,
  },
  fr: {
    takeover: (name) => `Un bot joue la main de ${name}.`,
    back: (name) => `${name} est de retour.`,
  },
};

/**
 * Diff two rosters for a seat's `botPlaying` flag flipping — the moment a
 * disconnected human's turns start (or stop) being covered by a bot — and
 * toast the one that changed. `prev` is the store's roster from BEFORE this
 * message, so a fresh connect (welcome sets the initial roster outside this
 * function) never runs through here: reconnecting into an already-covered
 * seat is the starting state, not a transition, and must not toast.
 */
function announceBotTakeover(prev: Roster | null, next: Roster): void {
  if (prev === null) return;
  const t = BOT_TAKEOVER_T[currentLang()];
  for (let seat = 0; seat < 4; seat++) {
    const before = prev.seats[seat];
    const after = next.seats[seat];
    if (before === undefined || before === null) continue;
    if (after === undefined || after === null || after.isBot) continue;
    if (after.botPlaying === true && before.botPlaying !== true) {
      useGameStore.getState().setNotice(t.takeover(after.name));
    } else if (before.botPlaying === true && after.botPlaying !== true) {
      useGameStore.getState().setNotice(t.back(after.name));
      emitTableEvent({ v: 1, t: 'back', name: after.name });
    }
  }
}

/**
 * Tell an embedder who sat down and who got up.
 *
 * Same prev/next discipline as announceBotTakeover above, and for the same
 * reason: `prev === null` is a fresh connect, so everyone already at the
 * table is the starting state rather than four people arriving at once.
 */
function announceSeatChanges(prev: Roster | null, next: Roster): void {
  if (prev === null) {
    emitTableEvent({ v: 1, t: 'ready' });
    return;
  }
  for (let seat = 0; seat < 4; seat++) {
    const before = prev.seats[seat] ?? null;
    const after = next.seats[seat] ?? null;
    if (before === null && after !== null && !after.isBot) {
      emitTableEvent({ v: 1, t: 'seated', name: after.name });
    } else if (before !== null && after === null && !before.isBot) {
      emitTableEvent({ v: 1, t: 'left', name: before.name });
    }
  }
  if (prev.started !== true && next.started === true) {
    emitTableEvent({ v: 1, t: 'game-started' });
  }
}

/** How long before the bot plays that a sitting player counts as idle — the
 * same threshold SeatChip badges the seat at, so the embedder hears about it
 * at the moment the table itself starts to say so. */
const IDLE_WARN_MS = 20_000;
let idleNudge: ReturnType<typeof setTimeout> | null = null;

/**
 * Tell an embedder about a seat going quiet — dropped, covered by a bot, or
 * simply not taking its turn — so it can say so beside the frame and nudge
 * the one person it concerns. None of it changes how the game plays.
 *
 * The idle nudge is a timer rather than a diff: `turnTimerAt` appears the
 * moment a turn starts, and a player thinking for five seconds is not idle.
 * It is armed at the deadline minus the warning and cancelled by the next
 * roster, so a card played in time never becomes a nudge.
 */
function announceQuietSeats(prev: Roster | null, next: Roster): void {
  const skew = next.now === undefined ? 0 : next.now - Date.now();
  const secondsLeft = (at: number) => Math.max(0, Math.ceil((at - (Date.now() + skew)) / 1000));

  if (idleNudge !== null) clearTimeout(idleNudge);
  idleNudge = null;
  for (let seat = 0; seat < 4; seat++) {
    const after = next.seats[seat] ?? null;
    if (after === null || after.isBot || after.turnTimerAt === undefined) continue;
    const fireIn = after.turnTimerAt - IDLE_WARN_MS - (Date.now() + skew);
    const name = after.name;
    idleNudge = setTimeout(
      () => emitTableEvent({ v: 1, t: 'turn', name, seconds: IDLE_WARN_MS / 1000 }),
      Math.max(0, fireIn),
    );
  }

  if (prev === null) return;
  for (let seat = 0; seat < 4; seat++) {
    const before = prev.seats[seat] ?? null;
    const after = next.seats[seat] ?? null;
    if (before === null || after === null || after.isBot) continue;
    if (after.botSwapAt !== undefined && before.botSwapAt === undefined) {
      emitTableEvent({ v: 1, t: 'away', name: after.name, seconds: secondsLeft(after.botSwapAt) });
    } else if (after.botPlaying === true && before.botPlaying !== true) {
      emitTableEvent({ v: 1, t: 'away', name: after.name, seconds: 0 });
    }
  }
}

/**
 * Online transport: one WebSocket to the room's Durable Object. Feeds the
 * same store shape as practice mode. Reconnects with backoff and resumes via
 * the welcome snapshot.
 */

/** Voice signaling hook: rtc payloads bypass the store (they are transient). */
type RtcHandler = (from: number, payload: unknown) => void;
let rtcHandler: RtcHandler | null = null;

export function setRtcHandler(handler: RtcHandler | null): void {
  rtcHandler = handler;
}

let ws: WebSocket | null = null;
let room: string | null = null;
let attempts = 0;
let closedByUs = false;
let pingTimer: ReturnType<typeof setInterval> | null = null;
/** Messages sent while the socket wasn't open yet — flushed on open. The room
 * screen renders before the connection settles, and a click landing in that
 * gap (e.g. "Sit here" during "Connecting…") must not silently vanish. */
let pending: ClientMessage[] = [];

/** Keepalive: nudge the server every 30s so idle proxies don't cull the
 * socket and a dead connection surfaces as a close sooner. */
function startPing(): void {
  stopPing();
  pingTimer = setInterval(() => send({ t: 'ping' }), 30_000);
}
function stopPing(): void {
  if (pingTimer !== null) clearInterval(pingTimer);
  pingTimer = null;
}

function userId(): string {
  const existing = localStorage.getItem('jaffre-uid');
  if (existing !== null) return existing;
  const uid = crypto.randomUUID();
  localStorage.setItem('jaffre-uid', uid);
  return uid;
}

// Moved to a leaf module so boot-time code can seed a name without pulling
// this file (and the store graph behind it) in. Re-exported so every existing
// import of playerName/setPlayerName from here keeps working.
export { playerName, setPlayerName } from './playerName.js';
import { playerName } from './playerName.js';

/** The most recent room this browser joined — lets Home offer a resume link. */
export function lastRoom(): string | null {
  return localStorage.getItem('jaffre-last-room');
}

/** Consecutive failed reconnect attempts since the last successful `open()` —
 * `ConnectionBanner` reads this to decide when "still retrying" has gone on
 * long enough to offer a way out, rather than trusting it forever. */
export function reconnectAttempts(): number {
  return attempts;
}

export function connect(roomCode: string): void {
  disconnect();
  closedByUs = false;
  pending = [];
  room = roomCode;
  localStorage.setItem('jaffre-last-room', roomCode);
  void open();
}

async function open(): Promise<void> {
  if (room === null) return;
  const store = useGameStore.getState();
  store.setConnection(attempts === 0 ? 'connecting' : 'reconnecting');
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  const auth = await getGuestToken(playerName());
  const identity =
    auth !== null
      ? `t=${encodeURIComponent(auth.token)}`
      : `u=${encodeURIComponent(userId())}&n=${encodeURIComponent(playerName())}`;
  if (room === null) return; // disconnected while fetching the token
  ws = new WebSocket(`${proto}://${location.host}/ws/${room}?${identity}`);
  ws.onopen = () => {
    if (attempts > 0) emitTableEvent({ v: 1, t: 'connection', state: 'ok' });
    attempts = 0;
    startPing();
    // Announce your pixel avatar so other players' tables show it. Pixel-SVG
    // only, size-capped — matches the server's join schema; a legacy freehand
    // PNG painting is simply not broadcast (it stays local-only).
    const paint = getProfile().paint;
    const sharablePaint =
      paint !== null && paint.startsWith('data:image/svg+xml,') && paint.length <= 16_384
        ? paint
        : undefined;
    // I1 — table style: also announce your EQUIPPED felt/sweep/card skin,
    // alongside paint, on the same join. Meaningless unless you end up this
    // table's host (see onJoin/onSit), but always sent — unlike paint there's
    // no format/size gate, since these are short catalog ids, not assets.
    // Your OWN equip, never the shown override: a guest at a host-styled
    // table who becomes host must broadcast their equip, not echo the old
    // host's back (currentCardSkin reads storage, which overrides never touch).
    send({
      t: 'join',
      ...(sharablePaint !== undefined ? { paint: sharablePaint } : {}),
      felt: currentFelt(),
      sweep: currentSweep(),
      skin: currentCardSkin(),
    });
    // Replay anything the player did while we were still connecting.
    const queued = pending;
    pending = [];
    for (const msg of queued) send(msg);
  };
  ws.onmessage = (e) => {
    const msg = JSON.parse(e.data as string) as ServerMessage;
    handle(msg);
  };
  // Captured so a LATE close from a socket we already replaced can't clobber
  // the live one: `connect()` re-arms `closedByUs = false` synchronously, so
  // without this identity check the old socket's close (arriving a tick later)
  // reads as an unexpected drop — spurious "Reconnecting…", a scheduled
  // reopen, and `ws = null` wiping the new socket's reference, leaving an
  // orphaned-but-joined connection the server still counts as present.
  const self = ws;
  ws.onclose = () => {
    if (ws !== self) return;
    ws = null;
    stopPing();
    if (closedByUs) return;
    attempts += 1;
    // Beacon once per reconnect streak — at 5 failed attempts this is no
    // longer a blip, it's a loop worth knowing about (not on every retry).
    if (attempts === 5)
      reportError(new Error('socket reconnect loop'), undefined, 'ws-reconnect-loop');
    useGameStore.getState().setConnection('reconnecting');
    emitTableEvent({ v: 1, t: 'connection', state: 'reconnecting' });
    setTimeout(() => void open(), Math.min(8000, 400 * 2 ** attempts));
  };
}

export function disconnect(): void {
  closedByUs = true;
  stopPing();
  // Detach before closing: the close event lands a tick later, by which time a
  // reconnect (e.g. the lobby's name prompt) may already have re-armed state.
  if (ws !== null) {
    ws.onclose = null;
    ws.onmessage = null;
    ws.onopen = null;
    ws.close();
  }
  ws = null;
  room = null;
  attempts = 0;
  pending = [];
}

export function send(msg: ClientMessage): void {
  if (ws?.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(msg));
    return;
  }
  // Queue real intents for the flush-on-open; keepalive pings just drop.
  if (room !== null && msg.t !== 'ping') pending.push(msg);
}

function handle(msg: ServerMessage): void {
  const store = useGameStore.getState();
  switch (msg.t) {
    case 'welcome':
      // The embedder's proof of life. welcome sets the first roster itself, so
      // the 'roster' case below never sees a null prev and never reached this
      // — an embedder waiting for ANY event heard nothing at all and told its
      // users the table was not answering, under a table that was working.
      announceSeatChanges(null, msg.roster);
      announceQuietSeats(null, msg.roster);
      store.welcome(msg.viewer, msg.view, msg.seq, msg.roster, msg.chatTail);
      if (room !== null)
        rememberTable(room, msg.roster, typeof msg.viewer === 'number' ? msg.viewer : null);
      if (msg.music !== undefined) useMusicStore.getState().setState(msg.music);
      break;
    case 'events':
      store.applyEvents(msg.events, msg.seq);
      break;
    case 'view':
      // A room game that just ENDED is the one event that makes every cached
      // aggregate wrong — and the recap reads one immediately (XpStrip's
      // fetchStats, through the same 30s cache), so a stale entry would show
      // "+0 XP" for the game you just played AND persist that stale total as
      // the baseline the NEXT recap measures its gain against. bustStatsCache
      // has existed for exactly this since the cache landed; nothing called it.
      // (The server writes the history row inside the same game_over action, so
      // the read that follows this is nearly always behind it — nearly, not
      // provably: there is no "history persisted" signal to wait on.)
      if (msg.view.phase === 'game_over' && store.view?.phase !== 'game_over') {
        bustStatsCache();
        // Same edge, and the only moment a final score exists to report.
        emitTableEvent({
          v: 1,
          t: 'game-over',
          summary: scoreSummary(msg.view.scores, msg.view.winner ?? null),
        });
      }
      store.setView(msg.view, msg.seq);
      break;
    case 'roster':
      announceBotTakeover(store.roster, msg.roster);
      announceSeatChanges(store.roster, msg.roster);
      announceQuietSeats(store.roster, msg.roster);
      store.setRoster(msg.roster);
      if (room !== null) rememberTable(room, msg.roster);
      break;
    case 'chat':
      store.addChat(msg.entry);
      break;
    case 'music':
      useMusicStore.getState().setState(msg.state);
      break;
    case 'rtc':
      rtcHandler?.(msg.from, msg.payload);
      break;
    case 'pong':
      break;
    case 'error':
      store.setNotice(localizeNotice(msg.code, msg.message));
      if (!SILENT_ERROR_CODES.has(msg.code))
        reportError(new Error(`${msg.code}: ${msg.message}`), undefined, 'ws-error');
      break;
  }
}
