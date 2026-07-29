/**
 * Presence and the single alarm clock. This module owns the hardened
 * invariant set that took dedicated work to get right: pre-game disconnect
 * vacate, mid-game bot-swap (botSwapAt/botPlaying), voluntary auto-play, the
 * optional per-turn/recap turn timer, the one scheduleNextWake() call that
 * arbitrates all of them into a single storage alarm, the roster snapshot
 * that carries their deadlines to clients, and round-readiness (including
 * the all-bots-unfreeze path). Touching the order or thresholds here is how
 * a disconnect clock or a bot takeover silently breaks — see GameRoom.ts's
 * header comment.
 */
import type { Roster, RosterSeat } from '@jaffre/protocol';
import type { GameRoom } from '../GameRoom.js';
import { notifyUser } from '../push.js';
import { displayName, publicId } from '../publicId.js';
import { botDifficulty, isBotOwner, SEATS, type Attachment } from './types.js';

const BOT_DELAY_MS = 300;
/** How long an auto-play seat lingers on the round recap before the server
 * readies it. Long enough to glimpse the scores; short enough that a table
 * of auto-players keeps rolling. */
const AUTOPLAY_READY_MS = 1500;
/** After a completed trick the client holds the 4 cards on the table
 * (~2.9s hold + sweep — TRICK_HOLD_MS + SWEEP_MS in web useTrickHold.ts) —
 * bots must not play into that window. Raised alongside that client retune;
 * these two must be revisited together. */
export const TRICK_HOLD_MS = 3300;
/** How long a seated human may be fully disconnected mid-game before a bot
 * plays their turns. Tests can override per-room via `meta.botSwapMs`. */
export const BOT_SWAP_MS = 45_000;
/** How long a PRE-GAME seat survives its human's disconnect before it frees.
 * Long enough for a refresh or a dropped connection to come back; short
 * enough that a closed tab doesn't squat a lobby seat as a ghost forever. */
export const PREGAME_VACATE_MS = 60_000;
/** Optional house rule (meta.rules.turnTimer): how long a CONNECTED human may
 * sit idle on their own bid/play before a bot covers that one turn for them.
 * ON by default (see turnTimerRuleOn) — unchecking it in the lobby is the
 * deliberate opt-out. Tests can override per-room via `meta.turnTimerMs`,
 * same pattern as BOT_SWAP_MS/botSwapMs. */
export const TURN_TIMER_MS = 60_000;
/** "Someone joined your public table" push to an absent host: at most one per
 * sitter uid per room within this window. */
const JOIN_PUSH_THROTTLE_MS = 5 * 60_000;

/** When `userId`'s bot-swap kicks in; +Infinity while they are connected. */
export function disconnectDeadline(room: GameRoom, userId: string): number {
  const since = room.meta.disconnectedSince?.[userId];
  if (since === undefined) return Number.POSITIVE_INFINITY;
  return since + (room.meta.botSwapMs ?? BOT_SWAP_MS);
}

/** Whether this user has voluntary auto-play on (server plays their turns). */
export function autoPlayOn(room: GameRoom, userId: string): boolean {
  return room.meta.autoPlay?.[userId] === true;
}

/** Is this user joined on any currently-open socket? */
export function isConnected(room: GameRoom, userId: string): boolean {
  return room.ctx.getWebSockets().some((s) => {
    const a = room.attachment(s);
    return a.joined && a.userId === userId;
  });
}

/** The turn-timer house rule ships ON: it applies unless a host explicitly
 * unchecked it in the lobby (stored `turnTimer: false`). A persisted
 * meta.rules without the key (pre-flip room, or set_rules from an old
 * client) gets the default too — rooms are short-lived, so no migration. */
export function turnTimerRuleOn(room: GameRoom): boolean {
  return room.meta.rules?.turnTimer ?? true;
}

/**
 * When the optional `turnTimer` house rule kicks in for the seat currently
 * on turn; +Infinity unless ALL of: the rule is on, the phase is
 * bidding/playing, the seat is a CONNECTED human, and they're not on
 * voluntary auto-play or the (separate) disconnect clock — those already
 * have their own bot-covering machinery.
 */
export function turnTimerDeadline(room: GameRoom): number {
  if (!turnTimerRuleOn(room)) return Number.POSITIVE_INFINITY;
  const game = room.game;
  if (game === null || (game.phase !== 'bidding' && game.phase !== 'playing')) {
    return Number.POSITIVE_INFINITY;
  }
  const owner = room.meta.seats[game.turn];
  if (typeof owner !== 'string' || autoPlayOn(room, owner) || !isConnected(room, owner)) {
    return Number.POSITIVE_INFINITY;
  }
  // No stamp (a game persisted before the rule shipped): no deadline. A
  // Date.now() fallback here would recede forever — every re-evaluation
  // would push the deadline another full timer out, so the client counts
  // to zero while the alarm never finds it due.
  const startedAt = room.meta.turnStartedAt;
  if (startedAt === undefined) return Number.POSITIVE_INFINITY;
  return startedAt + (room.meta.turnTimerMs ?? TURN_TIMER_MS);
}

/**
 * When the round_over recap auto-readies this CONNECTED human (turnTimer
 * rule): recap start (turnStartedAt — stamped when the round ended) + the
 * same timer as a turn. +Infinity when the rule is off, the phase isn't
 * round_over, they're disconnected (the shorter disconnect clock covers
 * that), or the recap predates the stamp. Ready-only — unlike the per-turn
 * timer this never flips auto-play; idling a recap isn't playing badly.
 */
export function recapReadyDeadline(room: GameRoom, userId: string): number {
  if (!turnTimerRuleOn(room)) return Number.POSITIVE_INFINITY;
  if (room.game?.phase !== 'round_over') return Number.POSITIVE_INFINITY;
  if (!isConnected(room, userId)) return Number.POSITIVE_INFINITY;
  const startedAt = room.meta.turnStartedAt;
  if (startedAt === undefined) return Number.POSITIVE_INFINITY;
  return startedAt + (room.meta.turnTimerMs ?? TURN_TIMER_MS);
}

/** Is any human currently connected (seated or spectating)? Bots hold no
 * socket, so any joined socket is a human. `exclude` skips a socket that is
 * closing right now (its close hasn't yet removed it from getWebSockets). */
export function hasConnectedHuman(room: GameRoom, exclude?: WebSocket): boolean {
  return room.ctx.getWebSockets().some((s) => s !== exclude && room.attachment(s).joined);
}

/** Current readiness, bots always ready. */
export function readyState(room: GameRoom): [boolean, boolean, boolean, boolean] {
  const base = room.meta.readyNextRound ?? [false, false, false, false];
  return SEATS.map((i) => isBotOwner(room.meta.seats[i]) || base[i]) as [
    boolean,
    boolean,
    boolean,
    boolean,
  ];
}

export async function continueIfAllReady(room: GameRoom): Promise<void> {
  if (room.game?.phase !== 'round_over') return;
  if (!readyState(room).every(Boolean)) return;
  delete room.meta.readyNextRound;
  await room.ctx.storage.put('meta', room.meta);
  await room.applyEngineAction({ type: 'continue' });
  broadcastRoster(room, {});
}

/** A seated player is ready for the next round; all ready → deal it. */
export async function onReady(room: GameRoom, ws: WebSocket, att: Attachment): Promise<void> {
  if (!att.joined || typeof att.viewer !== 'number') {
    room.send(ws, { t: 'error', code: 'NOT_SEATED', message: 'Take a seat first' });
    return;
  }
  if (room.game?.phase !== 'round_over') {
    room.send(ws, { t: 'error', code: 'WRONG_PHASE', message: 'No round to be ready for' });
    return;
  }
  const ready = readyState(room);
  if (ready[att.viewer]) return; // idempotent
  ready[att.viewer] = true;
  room.meta.readyNextRound = ready;
  await room.ctx.storage.put('meta', room.meta);
  broadcastRoster(room, {});
  await continueIfAllReady(room);
}

export function roster(room: GameRoom, exclude?: WebSocket): Roster {
  const attachments = room.ctx
    .getWebSockets()
    .filter((s) => s !== exclude)
    .map((s) => room.attachment(s));
  const phase = room.game?.phase;
  const seats = SEATS.map((i): RosterSeat | null => {
    const owner = room.meta.seats[i];
    if (owner === null) return null;
    // round_over: readiness for the next round (the Ready button).
    // game_over: "still at the table" for the recap — bots always are, a
    // human is while their socket is up. Sent explicitly so the recap can
    // read one field instead of guessing from connected/isBot.
    if (isBotOwner(owner)) {
      const ready = phase === 'round_over' ? readyState(room)[i] : phase === 'game_over';
      return {
        name: `Bot ${String(i + 1)}`,
        isBot: true,
        connected: true,
        difficulty: botDifficulty(owner),
        ...(phase === 'round_over' || phase === 'game_over' ? { ready } : {}),
      };
    }
    const connected = attachments.some((a) => a.joined && a.viewer === i);
    const ready = phase === 'round_over' ? readyState(room)[i] : connected;
    // A disconnected human mid-game is on the bot-swap clock (botSwapAt); a
    // connected human on turn, with the turnTimer house rule on, is on their
    // per-turn clock (turnTimerAt). Distinct fields — the client labels the
    // first "Away" and the second as a late-turn nudge, so they must never
    // be conflated. At most one is finite per seat (turnTimerDeadline
    // requires connected, the swap clock requires the opposite).
    // An auto-play seat never shows the swap clock: the bot is already
    // playing their turns, so "Away — bot in 0:12" would promise a change
    // that the deadline doesn't bring (the gold auto-play badge shows instead).
    const swapActive =
      !connected &&
      !autoPlayOn(room, owner) &&
      room.game !== null &&
      room.game.phase !== 'game_over';
    const swapDeadline = swapActive ? disconnectDeadline(room, owner) : Number.POSITIVE_INFINITY;
    // The countdown is only worth sending while it's still counting; once the
    // deadline passes, the state is steady ("a bot is playing their turns")
    // and rides botPlaying instead — a client pinning a countdown at zero
    // ("Bot taking over…" forever) was exactly the bug this split fixes.
    const swapAt = swapDeadline > Date.now() ? swapDeadline : Number.POSITIVE_INFINITY;
    const botPlaying = Number.isFinite(swapDeadline) && !Number.isFinite(swapAt);
    const turnAt =
      room.game !== null && room.game.turn === i
        ? turnTimerDeadline(room)
        : Number.POSITIVE_INFINITY;
    const paint = room.meta.paints?.[owner];
    return {
      // Unnamed guests are disambiguated by their own public id — two fresh
      // browsers at one table were otherwise both just "Player".
      name: displayName(room.meta.names[owner], owner),
      isBot: false,
      connected,
      pid: publicId(owner),
      ...(paint !== undefined ? { paint } : {}),
      ...(phase === 'round_over' || phase === 'game_over' ? { ready } : {}),
      ...(Number.isFinite(swapAt) ? { botSwapAt: swapAt } : {}),
      ...(botPlaying ? { botPlaying: true } : {}),
      ...(Number.isFinite(turnAt) ? { turnTimerAt: turnAt } : {}),
      ...(autoPlayOn(room, owner) ? { autoPlay: true } : {}),
    };
  });
  const spectators = attachments.filter((a) => a.joined && a.viewer === 'spectator').length;
  const hostSeat = room.meta.hostId !== undefined ? room.seatOf(room.meta.hostId) : null;
  // Room-level recap deadline (turnTimer rule): when connected idle humans
  // get auto-readied. Mirrors recapReadyDeadline minus the per-user
  // connectivity gate — the client shows it under the Ready button.
  const readyTimeoutAt =
    room.game?.phase === 'round_over' &&
    turnTimerRuleOn(room) &&
    room.meta.turnStartedAt !== undefined
      ? room.meta.turnStartedAt + (room.meta.turnTimerMs ?? TURN_TIMER_MS)
      : Number.POSITIVE_INFINITY;
  return {
    now: Date.now(),
    seats,
    spectators,
    started: room.meta.started,
    seriesWins: room.meta.seriesWins,
    seriesGames: room.meta.seriesGames,
    ...(room.meta.seriesTricks !== undefined ? { seriesTricks: room.meta.seriesTricks } : {}),
    // Both defaults made explicit so every client sees the same effective
    // rules the room will play by (turnTimer ships ON — turnTimerRuleOn).
    rules: {
      hailMary12: room.meta.rules?.hailMary12 ?? true,
      turnTimer: turnTimerRuleOn(room),
    },
    public: room.meta.public ?? false,
    ...(Number.isFinite(readyTimeoutAt) ? { readyTimeoutAt } : {}),
    ...(hostSeat !== null ? { hostSeat } : {}),
    ...(room.meta.lastRatings !== undefined ? { ratings: room.meta.lastRatings } : {}),
  };
}

export function broadcastRoster(
  room: GameRoom,
  opts: { skip?: WebSocket; exclude?: WebSocket },
): void {
  // One payload for every recipient — stringify once, send the shared string
  // (same pattern as Lobby's broadcast).
  const wire = JSON.stringify({ t: 'roster', roster: roster(room, opts.exclude) });
  for (const socket of room.ctx.getWebSockets()) {
    if (socket === opts.skip || socket === opts.exclude) continue;
    if (!room.attachment(socket).joined) continue;
    try {
      socket.send(wire);
    } catch {
      // Socket closed under us — the close handler will refresh the roster.
    }
  }
}

/**
 * The single alarm slot is shared by bot turns, round_over auto-continue,
 * and disconnected-human bot-swaps: compute the earliest wake we need and
 * set one alarm. Date.now() for scheduling only — the engine never sees time.
 */
export async function scheduleNextWake(room: GameRoom, exclude?: WebSocket): Promise<void> {
  const game = room.game;
  if (game === null || game.phase === 'game_over') return;
  // No human present → don't arm an alarm; the table is paused until someone
  // reconnects. (The alarm() guard is the real safety net; this just avoids a
  // pointless wake. `exclude` is the socket closing right now, in webSocketClose.)
  if (!hasConnectedHuman(room, exclude)) return;
  const now = Date.now();
  let wake: number | null = null;
  if (game.phase === 'round_over') {
    // Waiting on readiness: wake for disconnected humans' deadlines, the
    // recap ready-timeout of connected-but-idle humans (turnTimer rule),
    // and soon for auto-play seats — the alarm readies those (see alarm()),
    // but only after a beat so the recap is on screen before it advances.
    const ready = readyState(room);
    if (ready.every(Boolean)) {
      // Everyone is already ready yet the phase is still round_over — an
      // all-bots table (every human left mid-game, spectators watching).
      // Nothing else will ever call continueIfAllReady for it, so arm a
      // recap-beat wake; the alarm's round_over branch advances it.
      wake = now + AUTOPLAY_READY_MS;
    }
    for (const s of SEATS) {
      const owner = room.meta.seats[s];
      if (ready[s] || typeof owner !== 'string') continue;
      const deadline = autoPlayOn(room, owner)
        ? now + AUTOPLAY_READY_MS
        : Math.min(disconnectDeadline(room, owner), recapReadyDeadline(room, owner));
      if (Number.isFinite(deadline)) {
        const clamped = Math.max(now + 1, deadline);
        wake = wake === null ? clamped : Math.min(wake, clamped);
      }
    }
  } else {
    // Pacing floor for ANY server-played move: the plain bot beat, or — when
    // leading a fresh trick — the clients' ~2.2s hold+sweep window. Derived
    // from game state and anchored on turnStartedAt, NOT a caller flag, so
    // any re-arm mid-pause (a join, close, or ready/auto-play toggle) can
    // never clobber the trick-hold pause down to the plain bot delay.
    const afterTrick = game.currentTrick.length === 0 && game.capturedTricks.length > 0;
    const turnStart = room.meta.turnStartedAt ?? now;
    const paced = turnStart + (afterTrick ? TRICK_HOLD_MS : BOT_DELAY_MS);
    const owner = room.meta.seats[game.turn];
    if (isBotOwner(owner) || (typeof owner === 'string' && autoPlayOn(room, owner))) {
      // A bot seat, or a human on voluntary auto-play — either way the
      // server plays this turn on the paced cadence.
      wake = Math.max(now + BOT_DELAY_MS, paced);
    } else if (typeof owner === 'string') {
      // A connected human can only be covered by ONE of these at a time
      // (turnTimerDeadline requires connected, disconnectDeadline requires
      // not) — take whichever is finite, or the earlier if somehow both are.
      // The pacing floor applies here too: a disconnect deadline that has
      // long passed would otherwise fire every covered turn back-to-back
      // (and straight into the trick hold) instead of on the bot cadence.
      const deadline = Math.min(disconnectDeadline(room, owner), turnTimerDeadline(room));
      if (Number.isFinite(deadline)) wake = Math.max(now + 1, deadline, paced);
    }
  }
  if (wake !== null) await room.ctx.storage.setAlarm(wake);
}

/** Free every pre-game seat whose human has been gone past the grace; keep
 * the alarm armed while anyone's clock is still running. Rejoining clears
 * the clock in onJoin, so a refresh never loses its seat. */
export async function vacateAbsentPreGame(room: GameRoom): Promise<void> {
  const now = Date.now();
  const grace = room.meta.preGameVacateMs ?? PREGAME_VACATE_MS;
  const since = room.meta.disconnectedSince ?? {};
  const kept: Record<string, number> = {};
  let changed = false;
  let nextWake: number | null = null;
  for (const [uid, at] of Object.entries(since)) {
    const seat = room.seatOf(uid);
    if (seat === null) {
      changed = true; // stale entry (already left/stood up) — just drop it
      continue;
    }
    if (at + grace <= now) {
      room.meta.seats[seat] = null;
      changed = true;
    } else {
      kept[uid] = at;
      nextWake = nextWake === null ? at + grace : Math.min(nextWake, at + grace);
    }
  }
  if (changed) {
    room.meta.disconnectedSince = kept;
    await room.ctx.storage.put('meta', room.meta);
    broadcastRoster(room, {});
    await room.syncLobby(); // a freed seat re-opens the table for matchmaking
  }
  if (nextWake !== null) await room.ctx.storage.setAlarm(nextWake);
}

/** Drop a user's disconnect-clock and auto-play bookkeeping — shared by a
 * voluntary leave (unseatUser) and a host's kick (onKick), both of which
 * vacate a seat that may carry either. Mutates meta in place; caller persists. */
export function clearUserState(room: GameRoom, userId: string): void {
  if (room.meta.disconnectedSince?.[userId] !== undefined) {
    room.meta.disconnectedSince = Object.fromEntries(
      Object.entries(room.meta.disconnectedSince).filter(([id]) => id !== userId),
    );
  }
  if (room.meta.autoPlay?.[userId] !== undefined) {
    room.meta.autoPlay = Object.fromEntries(
      Object.entries(room.meta.autoPlay).filter(([id]) => id !== userId),
    );
  }
  // Paints are the meta's only bulky per-user entries — drop a leaver's so a
  // long-lived room doesn't accumulate avatars of everyone who ever sat.
  if (room.meta.paints?.[userId] !== undefined) {
    room.meta.paints = Object.fromEntries(
      Object.entries(room.meta.paints).filter(([id]) => id !== userId),
    );
  }
}

/**
 * Vacate a user's seat permanently. Mid-game the seat goes to a bot (the
 * game must stay playable for the other three); otherwise it simply frees
 * up. Their sockets, if any, drop to spectator. False if they had no seat.
 */
export async function unseatUser(room: GameRoom, userId: string): Promise<boolean> {
  const seat = room.seatOf(userId);
  if (seat === null) return false;
  const midGame = room.meta.started && room.game !== null && room.game.phase !== 'game_over';
  room.meta.seats[seat] = midGame ? { bot: true, difficulty: 'normal' } : null;
  clearUserState(room, userId);
  // The host's seat just opened up — pass the role to the first remaining
  // seated human, or drop it if nobody's left to inherit it.
  if (room.meta.hostId === userId) {
    const nextHost = room.meta.seats.find((s): s is string => typeof s === 'string');
    if (nextHost !== undefined) room.meta.hostId = nextHost;
    else delete room.meta.hostId;
  }
  await room.ctx.storage.put('meta', room.meta);
  for (const socket of room.ctx.getWebSockets()) {
    const a = room.attachment(socket);
    if (a.userId !== userId || typeof a.viewer !== 'number') continue;
    a.viewer = 'spectator';
    socket.serializeAttachment(a);
    if (a.joined) room.sendWelcome(socket, a);
  }
  broadcastRoster(room, {});
  // The replacing bot may be the round_over holdout or the seat on turn.
  await continueIfAllReady(room);
  await scheduleNextWake(room);
  return true;
}

/**
 * Toggle voluntary auto-play for the sender's own seat. While on, the alarm
 * loop plays their turns at 'hard' (see alarm()); the seat stays theirs. Only
 * a spectator can't toggle it. Turning it on during their turn wakes the alarm
 * so the bot move fires on the normal bot cadence.
 */
export async function onSetAutoPlay(
  room: GameRoom,
  ws: WebSocket,
  att: Attachment,
  on: boolean,
): Promise<void> {
  if (!att.joined || room.seatOf(att.userId) === null) {
    room.send(ws, { t: 'error', code: 'NOT_SEATED', message: 'Take a seat first' });
    return;
  }
  const current = autoPlayOn(room, att.userId);
  if (current === on) return; // no-op — don't churn storage or rosters
  room.meta.autoPlay = on
    ? { ...room.meta.autoPlay, [att.userId]: true }
    : Object.fromEntries(
        Object.entries(room.meta.autoPlay ?? {}).filter(([id]) => id !== att.userId),
      );
  await room.ctx.storage.put('meta', room.meta);
  broadcastRoster(room, {});
  // If it's their turn right now, arm the alarm so the auto-move plays promptly.
  if (on) await scheduleNextWake(room);
}

/** "I'm here" — the on-turn human tapped their own turn-timer nudge:
 * restart the current turn's clock so they get a fresh full timer. Every
 * guard is a QUIET no-op, not an error: the tap can race the turn advancing
 * (or the round ending) and a late arrival simply no longer applies. */
export async function onImHere(room: GameRoom, att: Attachment): Promise<void> {
  const game = room.game;
  if (
    !att.joined ||
    game === null ||
    (game.phase !== 'bidding' && game.phase !== 'playing') ||
    !turnTimerRuleOn(room) ||
    room.meta.seats[game.turn] !== att.userId ||
    autoPlayOn(room, att.userId) ||
    room.meta.turnStartedAt === undefined
  ) {
    return;
  }
  room.meta.turnStartedAt = Date.now();
  await room.ctx.storage.put('meta', room.meta);
  // The roster's turnTimerAt moves out with the reset, hiding the nudge;
  // re-arm the alarm so the (earlier) armed wake is followed by the real one.
  broadcastRoster(room, {});
  await scheduleNextWake(room);
}

/**
 * Web Push "it's your turn" to the seat-holder when none of their sockets is
 * connected — the installed-app path back to a table that's waiting on them.
 * Connected players (even hidden tabs) are covered by the app badge instead.
 */
export function notifyTurnIfAbsent(room: GameRoom, exclude?: WebSocket): void {
  const game = room.game;
  if (game === null || (game.phase !== 'bidding' && game.phase !== 'playing')) return;
  const owner = room.meta.seats[game.turn];
  if (typeof owner !== 'string') return; // bot or empty seat
  if (autoPlayOn(room, owner)) return; // a bot is covering this turn — no nag
  // Once the disconnect deadline has passed, a bot plays every turn of theirs
  // moments after it starts — "It's your turn" would be false by the time it
  // was read, and re-sent on each of their turns. The pushes that arm before
  // the deadline are the real come-back nudges.
  if (disconnectDeadline(room, owner) <= Date.now()) return;
  const connected = room.ctx.getWebSockets().some((s) => {
    if (s === exclude) return false;
    const a = room.attachment(s);
    return a.joined && a.userId === owner;
  });
  if (connected) return;
  const code = room.meta.roomCode;
  room.ctx.waitUntil(
    notifyUser(room.env, owner, {
      title: 'Jaffre',
      body: "À ton tour · It's your turn",
      url: code === undefined ? '/' : `/#room/${code}`,
      ...(code !== undefined ? { tag: `turn-${code}` } : {}),
    }),
  );
}

/**
 * Web Push "someone joined your table" to the host when they're not
 * connected — mirrors notifyTurnIfAbsent's fire-and-forget shape
 * (ctx.waitUntil, single-language body: this codebase's one existing push
 * payload IS bilingual in its body, but title/body content here is
 * spec'd verbatim, so kept single-language). Throttled per sitter uid.
 */
export function notifyHostOfJoin(room: GameRoom, sitterUid: string, sitterName: string): void {
  const hostId = room.meta.hostId;
  if (hostId === undefined) return;
  const now = Date.now();
  const last = room.joinPushTimestamps.get(sitterUid);
  if (last !== undefined && now - last < JOIN_PUSH_THROTTLE_MS) return;
  room.joinPushTimestamps.set(sitterUid, now);
  const code = room.meta.roomCode;
  const humans = room.meta.seats.filter((o): o is string => typeof o === 'string').length;
  const full = room.meta.seats.every((s) => s !== null) && humans >= 2;
  const { title, body } = full
    ? {
        title: 'Your table is full',
        body: `${sitterName} joined — come start the game`,
      }
    : {
        title: `${sitterName} joined your table`,
        body: code === undefined ? `${humans}/4 seated` : `Room ${code} — ${humans}/4 seated`,
      };
  room.ctx.waitUntil(
    notifyUser(room.env, hostId, {
      title,
      body,
      url: code === undefined ? '/' : `/#room/${code}`,
      ...(code !== undefined ? { tag: `join-${code}` } : {}),
    }),
  );
}
