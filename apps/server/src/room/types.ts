/**
 * Shared per-room domain vocabulary: seat ownership, the persisted room
 * config (`Meta`), per-socket identity (`Attachment`), and the tiny
 * bot-owner helpers. No Durable Object state and no invariants of its own —
 * every other room/* module (and GameRoom.ts itself) imports these rather
 * than redeclaring them, so a bot seat or a persisted field has exactly one
 * definition.
 */
import type { Action, Seat, Viewer } from '@jaffre/engine';
import type { BotDifficulty } from '@jaffre/bots';

export const SEATS: readonly Seat[] = [0, 1, 2, 3];

/** A seat is owned by a user (userId), a bot (at a difficulty), or nobody.
 * Older persisted metas store `{ bot: true }` without a difficulty — those
 * read back as 'normal' via botDifficulty(). */
export type BotOwner = { readonly bot: true; readonly difficulty?: BotDifficulty };
export type SeatOwner = string | BotOwner | null;

export interface Meta {
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
   * server plays their turns at 'hard' until control returns: the toggle
   * flips off, or they simply bid/play manually (onAction clears it).
   * Persists across disconnect/reconnect; cleared on leave and game_over. */
  autoPlay?: Record<string, boolean>;
  /** Optional per-room override of BOT_SWAP_MS (used by tests). */
  botSwapMs?: number;
  /** Optional per-room override of PREGAME_VACATE_MS (used by tests). */
  preGameVacateMs?: number;
  /** Optional per-room override of TURN_TIMER_MS (used by tests). */
  turnTimerMs?: number;
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
  /** Each user's pixel avatar (pixel-SVG data URL) as sent on their latest
   * join — echoed on their RosterSeat so other players see it. Optional:
   * legacy persisted metas predate it. */
  paints?: Record<string, string>;
  /** Per-seat trick totals of each finished game, parallel to seriesGames
   * (null for games scored before the engine recorded trickCounts). Optional:
   * legacy persisted metas predate it. */
  seriesTricks?: ([number, number, number, number] | null)[];
  /** House rules chosen in the lobby before the game starts. */
  rules?: { hailMary12: boolean; turnTimer?: boolean };
  /** Epoch ms when the seat currently on turn (game.turn) became active —
   * i.e. when it became THEIR bid/play to make. Set at game start and
   * refreshed in applyEngineAction every time the acting turn advances; only
   * consulted when `rules.turnTimer` is on. Absent outside bidding/playing. */
  turnStartedAt?: number;
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
  /** uid of the table's host: the first human to sit, or whoever inherits the
   * role when the previous host's seat opens up (leaves/is kicked) — set in
   * onSit, passed in unseatUser. Only the host may kick. */
  hostId?: string;
  /** userIds ever kicked from this room — a lightweight per-room ban list. Set
   * in onKick, checked in onSit. PERSISTED and never cleared: a kicked player
   * reaching this exact table again requires a fresh room, which is fine for a
   * moderation tool aimed at one bad actor on one public table. */
  kickedIds?: string[];
}

/** Per-socket identity, survives hibernation via serializeAttachment. */
export interface Attachment {
  userId: string;
  name: string;
  viewer: Viewer;
  joined: boolean;
}

export interface LogEntry {
  seq: number;
  action: Action;
  ts?: number;
}

export function emptyMeta(): Meta {
  return {
    seats: [null, null, null, null],
    names: {},
    started: false,
    seriesWins: [0, 0],
    seriesGames: [],
  };
}

export function isBotOwner(owner: SeatOwner): owner is BotOwner {
  return typeof owner === 'object' && owner !== null;
}

/** A bot seat's difficulty, defaulting to 'normal' for legacy `{ bot: true }`. */
export function botDifficulty(owner: SeatOwner): BotDifficulty {
  return isBotOwner(owner) ? (owner.difficulty ?? 'normal') : 'normal';
}
