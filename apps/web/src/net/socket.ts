import type { ClientMessage, ServerMessage } from '@jaffre/protocol';
import { useGameStore } from '../state/gameStore.js';
import { useMusicStore } from '../state/musicStore.js';
import { getGuestToken, getProfile } from './auth.js';
import { localizeNotice } from './noticeCodes.js';
import { rememberTable } from './rooms.js';
import { reportError } from './telemetry.js';

/** Server error codes that are routine / expected — shown to the player as a
 * toast but not worth a telemetry beacon (e.g. a stale click racing a turn
 * change). Anything else is an unexpected rejection worth knowing about. */
const SILENT_ERROR_CODES = new Set(['NOT_YOUR_TURN', 'BAD_MESSAGE']);

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

export function playerName(): string {
  return localStorage.getItem('jaffre-name') ?? 'Player';
}

export function setPlayerName(name: string): void {
  localStorage.setItem('jaffre-name', name);
}

/** The most recent room this browser joined — lets Home offer a resume link. */
export function lastRoom(): string | null {
  return localStorage.getItem('jaffre-last-room');
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
    send({ t: 'join', ...(sharablePaint !== undefined ? { paint: sharablePaint } : {}) });
    // Replay anything the player did while we were still connecting.
    const queued = pending;
    pending = [];
    for (const msg of queued) send(msg);
  };
  ws.onmessage = (e) => {
    const msg = JSON.parse(e.data as string) as ServerMessage;
    handle(msg);
  };
  ws.onclose = () => {
    ws = null;
    stopPing();
    if (closedByUs) return;
    attempts += 1;
    // Beacon once per reconnect streak — at 5 failed attempts this is no
    // longer a blip, it's a loop worth knowing about (not on every retry).
    if (attempts === 5)
      reportError(new Error('socket reconnect loop'), undefined, 'ws-reconnect-loop');
    useGameStore.getState().setConnection('reconnecting');
    setTimeout(() => void open(), Math.min(8000, 400 * 2 ** attempts));
  };
}

export function disconnect(): void {
  closedByUs = true;
  stopPing();
  ws?.close();
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
      store.welcome(msg.viewer, msg.view, msg.seq, msg.roster, msg.chatTail);
      if (room !== null)
        rememberTable(room, msg.roster, typeof msg.viewer === 'number' ? msg.viewer : null);
      if (msg.music !== undefined) useMusicStore.getState().setState(msg.music);
      break;
    case 'events':
      store.applyEvents(msg.events, msg.seq);
      break;
    case 'view':
      store.setView(msg.view, msg.seq);
      break;
    case 'roster':
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
