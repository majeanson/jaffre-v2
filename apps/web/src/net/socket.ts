import type { ClientMessage, ServerMessage } from '@jaffre/protocol';
import { useGameStore } from '../state/gameStore.js';

/**
 * Online transport: one WebSocket to the room's Durable Object. Feeds the
 * same store shape as practice mode. Reconnects with backoff and resumes via
 * the welcome snapshot.
 */

let ws: WebSocket | null = null;
let room: string | null = null;
let attempts = 0;
let closedByUs = false;

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

export function connect(roomCode: string): void {
  disconnect();
  closedByUs = false;
  room = roomCode;
  open();
}

function open(): void {
  if (room === null) return;
  const store = useGameStore.getState();
  store.setConnection(attempts === 0 ? 'connecting' : 'reconnecting');
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  ws = new WebSocket(
    `${proto}://${location.host}/ws/${room}?u=${encodeURIComponent(userId())}&n=${encodeURIComponent(playerName())}`,
  );
  ws.onopen = () => {
    attempts = 0;
    send({ t: 'join' });
  };
  ws.onmessage = (e) => {
    const msg = JSON.parse(e.data as string) as ServerMessage;
    handle(msg);
  };
  ws.onclose = () => {
    ws = null;
    if (closedByUs) return;
    attempts += 1;
    useGameStore.getState().setConnection('reconnecting');
    setTimeout(open, Math.min(8000, 400 * 2 ** attempts));
  };
}

export function disconnect(): void {
  closedByUs = true;
  ws?.close();
  ws = null;
  room = null;
  attempts = 0;
}

export function send(msg: ClientMessage): void {
  if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
}

function handle(msg: ServerMessage): void {
  const store = useGameStore.getState();
  switch (msg.t) {
    case 'welcome':
      store.welcome(msg.viewer, msg.view, msg.seq, msg.roster, msg.chatTail);
      break;
    case 'events':
      store.applyEvents(msg.events, msg.seq);
      break;
    case 'view':
      store.setView(msg.view, msg.seq);
      break;
    case 'roster':
      store.setRoster(msg.roster);
      break;
    case 'chat':
      store.addChat(msg.entry);
      break;
    case 'rtc':
    case 'pong':
    case 'error':
      break;
  }
}
