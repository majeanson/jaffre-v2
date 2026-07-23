import type { GameEvent, Seat } from '@jaffre/engine';
import type { SeatView, Viewer } from '@jaffre/engine';
import { z } from 'zod';

/* ── Client → server ───────────────────────────────────────────────────── */

const seatSchema = z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)]);

export const botDifficultySchema = z.enum(['easy', 'normal', 'hard']);
export type BotDifficulty = z.infer<typeof botDifficultySchema>;

const cardSchema = z.object({
  suit: z.enum(['red', 'brown', 'green', 'blue']),
  value: z.union([
    z.literal(0),
    z.literal(1),
    z.literal(2),
    z.literal(3),
    z.literal(4),
    z.literal(5),
    z.literal(6),
    z.literal(7),
  ]),
});

const bidChoiceSchema = z.union([
  z.object({ kind: z.literal('pass') }),
  z.object({
    kind: z.literal('bid'),
    value: z.union([
      z.literal(7),
      z.literal(8),
      z.literal(9),
      z.literal(10),
      z.literal(11),
      z.literal(12),
    ]),
    sansAtout: z.boolean(),
  }),
]);

/** Engine actions as sent by clients — seat is NEVER accepted from the wire;
 * the room stamps it from the socket's authenticated attachment. */
const clientActionSchema = z.union([
  z.object({ type: z.literal('place_bid'), choice: bidChoiceSchema }),
  z.object({ type: z.literal('play_card'), card: cardSchema }),
  z.object({ type: z.literal('continue') }),
]);

export const clientMessageSchema = z.union([
  z.object({ t: z.literal('join'), resumeSeq: z.number().int().nonnegative().optional() }),
  z.object({ t: z.literal('sit'), seat: seatSchema }),
  z.object({
    t: z.literal('add_bot'),
    seat: seatSchema,
    difficulty: botDifficultySchema.optional(),
  }),
  // Pre-game only: empty a bot seat back to vacant.
  z.object({ t: z.literal('remove_bot'), seat: seatSchema }),
  z.object({ t: z.literal('start') }),
  // Pre-game only: toggle house rules for the room. `turnTimer` is optional so
  // older clients that only ever sent hailMary12 keep parsing; the server
  // echoes back whatever was last set (see Roster.rules) so a client toggling
  // one rule should send its own current value for the other alongside it.
  z.object({
    t: z.literal('set_rules'),
    hailMary12: z.boolean(),
    turnTimer: z.boolean().optional(),
  }),
  // Between games only: re-pair the table (swap seats 1 & 2) before a rematch.
  z.object({ t: z.literal('swap_seats') }),
  // Give up your seat for good: mid-game a bot takes over, otherwise the seat
  // frees up. The socket may close right after — order doesn't matter.
  z.object({ t: z.literal('leave') }),
  // Voluntary AFK: while on, the server plays your turns at 'hard'. The seat
  // stays yours; turning it off returns control. Seat is inferred from the
  // sender — never from the wire.
  z.object({ t: z.literal('set_autoplay'), on: z.boolean() }),
  // Host toggles whether this pre-game table is listed in the public lobby /
  // eligible for Quick Play. Only meaningful before the game starts.
  z.object({ t: z.literal('set_public'), on: z.boolean() }),
  // Host-only, pre-game: vacate another human's seat and ban them from the
  // table for the room's life (kickedIds). Seat is validated shape-wise here;
  // the room enforces who may send it and against whom.
  z.object({ t: z.literal('kick'), seat: seatSchema }),
  z.object({ t: z.literal('action'), action: clientActionSchema }),
  z.object({ t: z.literal('ready') }),
  z.object({ t: z.literal('chat'), text: z.string().min(1).max(500) }),
  z.object({ t: z.literal('rtc'), to: seatSchema, payload: z.unknown() }),
  z.object({ t: z.literal('ping') }),
]);

export type ClientMessage = z.infer<typeof clientMessageSchema>;
export type ClientAction = z.infer<typeof clientActionSchema>;

/* ── Server → client ───────────────────────────────────────────────────── */

export interface RosterSeat {
  readonly name: string;
  readonly isBot: boolean;
  readonly connected: boolean;
  /** Ready for the next round (round_over phase only; bots are always ready). */
  readonly ready?: boolean;
  /** Present only for bot seats — the difficulty this bot plays at. */
  readonly difficulty?: BotDifficulty;
  /**
   * Epoch ms when this seat's human turn gets handed to a bot. Present while a
   * seated human is disconnected mid-game (the bot-swap clock), OR — when the
   * table's `turnTimer` house rule is on — while it's this CONNECTED human's
   * turn to bid/play and their per-turn clock is running. Absolute (not
   * remaining) so the client can tick it down locally between rosters.
   */
  readonly botSwapAt?: number;
  /** True when this seated human has voluntary auto-play on — the server is
   * playing their turns at 'hard' until they turn it off. */
  readonly autoPlay?: boolean;
}

export interface Roster {
  readonly seats: readonly (RosterSeat | null)[];
  readonly spectators: number;
  readonly started: boolean;
  /** Seat of the table's host (first to sit, or whoever inherited it after
   * the previous host left), when that seat is occupied. Only the host may
   * kick. Absent when nobody has ever sat (or the host's seat somehow isn't
   * currently seated — shouldn't happen, but keeps this optional rather than
   * lying). */
  readonly hostSeat?: number;
  /** Standing-table tally across games at this room: [Sun wins, Moon wins],
   * reset only when the room empties for good. */
  readonly seriesWins?: readonly [number, number];
  /** Final [Sun, Moon] scores of each finished game this sitting, oldest
   * first — powers the between-games scorepad. Reset with the room. */
  readonly seriesGames?: readonly (readonly [number, number])[];
  /** House rules chosen in the lobby, echoed so every seat sees the toggle. */
  readonly rules?: {
    readonly hailMary12: boolean;
    /** Idle-player turn timer (off unless a table opts in) — see
     * RosterSeat.botSwapAt for the per-seat countdown it drives. */
    readonly turnTimer?: boolean;
  };
  /** Whether this table is listed for matchmaking (public lobby / Quick Play). */
  readonly public?: boolean;
  /** Last finished game's rating movement, one entry per SEATED human who was
   * rated (a bot on either team makes the whole game unrated, so this is
   * absent then). Cleared as soon as a rematch starts. */
  readonly ratings?: readonly {
    readonly seat: number;
    readonly rating: number;
    readonly delta: number;
  }[];
}

export interface ChatEntry {
  readonly from: string;
  readonly text: string;
  readonly at: number;
  /** Sender's seat (0-3), so the UI can colour the name like the felt does.
   * Absent for spectators and for entries persisted before this field existed. */
  readonly seat?: number;
}

export type ServerMessage =
  | {
      readonly t: 'welcome';
      readonly viewer: Viewer;
      readonly view: SeatView | null;
      readonly seq: number;
      readonly roster: Roster;
      readonly chatTail: readonly ChatEntry[];
    }
  | { readonly t: 'events'; readonly seq: number; readonly events: readonly GameEvent[] }
  | { readonly t: 'view'; readonly seq: number; readonly view: SeatView }
  | { readonly t: 'roster'; readonly roster: Roster }
  | { readonly t: 'chat'; readonly entry: ChatEntry }
  | { readonly t: 'rtc'; readonly from: Seat; readonly payload: unknown }
  | { readonly t: 'pong' }
  | {
      readonly t: 'error';
      readonly code:
        | 'BAD_MESSAGE'
        | 'SEAT_TAKEN'
        | 'NOT_SEATED'
        | 'NOT_STARTED'
        | 'ALREADY_STARTED'
        | 'ROOM_FULL'
        | 'WRONG_PHASE'
        | 'NOT_YOUR_TURN'
        | 'ILLEGAL_BID'
        | 'CARD_NOT_IN_HAND'
        | 'MUST_FOLLOW_SUIT'
        | 'CHAT_RATE'
        | 'NOT_HOST'
        | 'KICKED';
      readonly message: string;
    };

export function parseClientMessage(raw: unknown): ClientMessage | null {
  if (typeof raw !== 'string') return null;
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return null;
  }
  const result = clientMessageSchema.safeParse(json);
  return result.success ? result.data : null;
}
