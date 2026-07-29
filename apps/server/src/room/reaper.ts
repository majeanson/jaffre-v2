/**
 * Storage self-destruct: the one thing that ever deletes a GameRoom's storage.
 *
 * Merely CONNECTING to a room code persists a `meta` write (the roomCode
 * capture in GameRoom.fetch), so before this existed every mistyped code,
 * expired invite and finished game minted permanent, billed DO storage —
 * nothing in the codebase called `deleteAll()`. A finished game's rows are the
 * heavy end of it: `game`, `meta` and one `log:<seq>` key per action, kept
 * forever for a table nobody will ever open again.
 *
 * The rule is one sentence: while a room has NO open sockets it carries a
 * `meta.emptySince` stamp, and once that stamp is older than the grace, the
 * next alarm deletes everything the room ever wrote. Reconnecting to a reaped
 * code is indistinguishable from a fresh one — you get an empty lobby, which
 * is exactly what a day-old abandoned table should be.
 *
 * Arbitration with the game alarm (the hard part — there is only ONE alarm
 * slot, and presence.ts's scheduleNextWake owns it):
 *   - The reaper only ever arms while the room is socket-empty, and every
 *     game wake in scheduleNextWake requires a connected human, so the two
 *     cannot both want the slot at the same moment.
 *   - It still arms with `armAt` (min-with-current), never a bare setAlarm:
 *     the pre-game vacate wake in webSocketClose is armed for a room that has
 *     just gone empty, and must not be pushed a day out.
 *   - Conversely a nearer game wake DOES overwrite the reaper's alarm — which
 *     is why `alarm()` re-arms at the end of every run, and why the deadline
 *     lives in persisted `emptySince` rather than in the alarm time itself. A
 *     re-arm can therefore never restart the clock (that would be a room that
 *     wakes every day forever and never dies).
 */
import type { GameRoom } from '../GameRoom.js';

/** How long a room with no game to lose — never started, or already at
 * game_over — survives its last socket closing. Long enough that a refresh,
 * a rejoin from the "Your tables" row, or a recap read the next morning all
 * still find the table; short enough that a mistyped room code is billed for
 * a day rather than for good. */
export const EMPTY_REAP_MS = 24 * 60 * 60 * 1000;
/** How long a room whose game is still MID-hand survives. Longer, because
 * reaping this one destroys a resumable game: the table froze rather than
 * finished (see runAlarm's no-human freeze), so its players could in
 * principle come back to it. A week without a single socket says they won't. */
export const ABANDONED_REAP_MS = 7 * 24 * 60 * 60 * 1000;

/** Is anyone at all still attached? Counts EVERY socket, joined or not: an
 * open connection means a live client on the page, and storage must never be
 * deleted out from under one. `exclude` is the socket closing right now (its
 * close hasn't yet removed it from getWebSockets), same convention as
 * presence.ts's hasConnectedHuman. */
export function hasAnySocket(room: GameRoom, exclude?: WebSocket): boolean {
  return room.ctx.getWebSockets().some((s) => s !== exclude);
}

/** The grace this room gets, by how much there is to lose. Tests override it
 * per-room via `meta.reapMs`, same pattern as botSwapMs/turnTimerMs. */
export function reapGraceMs(room: GameRoom): number {
  if (room.meta.reapMs !== undefined) return room.meta.reapMs;
  const live = room.game !== null && room.game.phase !== 'game_over';
  return live ? ABANDONED_REAP_MS : EMPTY_REAP_MS;
}

/** When this room's storage self-destructs; +Infinity while anyone is
 * attached, or before the room has ever been empty. */
export function reapDeadline(room: GameRoom, exclude?: WebSocket): number {
  if (hasAnySocket(room, exclude)) return Number.POSITIVE_INFINITY;
  const since = room.meta.emptySince;
  if (since === undefined) return Number.POSITIVE_INFINITY;
  return since + reapGraceMs(room);
}

/** Set the alarm only if it would fire SOONER than whatever is already armed.
 * scheduleNextWake deliberately clobbers the slot (onImHere pushes a turn
 * deadline OUT, for one) — the reaper must not, or it would swallow a wake
 * the game is waiting on. */
async function armAt(room: GameRoom, at: number): Promise<void> {
  const current = await room.ctx.storage.getAlarm();
  if (current === null || current > at) await room.ctx.storage.setAlarm(at);
}

/**
 * Stamp the room as empty (first time only) and make sure an alarm is armed
 * no later than its reap deadline. Called wherever the room can become
 * socket-empty (webSocketClose/webSocketError) and at the end of every alarm
 * run, so the invariant "a socket-empty room always has its reap wake armed"
 * holds across hibernation.
 *
 * A no-op while anyone is attached: the stamp is cleared on connect
 * (clearEmptyStamp), so a room that idled for 23 hours and was then played
 * for one is not reaped the instant its last socket closes.
 */
export async function armReaper(room: GameRoom, exclude?: WebSocket): Promise<void> {
  if (hasAnySocket(room, exclude)) return;
  if (room.meta.emptySince === undefined) {
    room.meta.emptySince = Date.now();
    await room.ctx.storage.put('meta', room.meta);
  }
  await armAt(room, room.meta.emptySince + reapGraceMs(room));
}

/** Forget the empty stamp because someone just connected. Mutates meta in
 * place and reports whether the caller needs to persist. */
export function clearEmptyStamp(room: GameRoom): boolean {
  if (room.meta.emptySince === undefined) return false;
  delete room.meta.emptySince;
  return true;
}

/**
 * Delete everything if the room is past its deadline. Returns true when the
 * storage is gone, in which case the caller MUST return immediately — the
 * in-memory cache has been dropped and there is no longer a room to advance.
 *
 * The Lobby DO needs no deregister call: its entries expire on a 90s TTL and
 * are re-registered only by syncLobby's heartbeat, so a room that has been
 * silent for a day is long gone from matchmaking. D1 game history is
 * untouched — that is the permanent record, this is only the live table.
 */
export async function reapIfDue(room: GameRoom): Promise<boolean> {
  if (reapDeadline(room) > Date.now()) return false;
  console.log('[reaper] deleting abandoned room storage', {
    room: room.meta.roomCode,
    started: room.meta.started,
    phase: room.game?.phase ?? null,
    emptyForMs: Date.now() - (room.meta.emptySince ?? Date.now()),
  });
  // deleteAlarm first: deleteAll's effect on a pending alarm differs between
  // the KV- and SQLite-backed storage backends, and a surviving alarm would
  // wake a now-empty room for nothing.
  await room.ctx.storage.deleteAlarm();
  await room.ctx.storage.deleteAll();
  room.forgetCache();
  return true;
}
