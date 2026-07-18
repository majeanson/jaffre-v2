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
  z.object({ t: z.literal('start') }),
  // Pre-game only: toggle the "Hail-Mary 12 sans atout" house rule for the room.
  z.object({ t: z.literal('set_rules'), hailMary12: z.boolean() }),
  // Between games only: re-pair the table (swap seats 1 & 2) before a rematch.
  z.object({ t: z.literal('swap_seats') }),
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
   * Epoch ms when this disconnected human's seat gets handed to a bot.
   * Present only while a seated human is disconnected mid-game; absolute
   * (not remaining) so the client can tick it down locally between rosters.
   */
  readonly botSwapAt?: number;
}

export interface Roster {
  readonly seats: readonly (RosterSeat | null)[];
  readonly spectators: number;
  readonly started: boolean;
  /** Standing-table tally across games at this room: [Sun wins, Moon wins],
   * reset only when the room empties for good. */
  readonly seriesWins?: readonly [number, number];
  /** Final [Sun, Moon] scores of each finished game this sitting, oldest
   * first — powers the between-games scorepad. Reset with the room. */
  readonly seriesGames?: readonly (readonly [number, number])[];
  /** House rules chosen in the lobby, echoed so every seat sees the toggle. */
  readonly rules?: { readonly hailMary12: boolean };
}

export interface ChatEntry {
  readonly from: string;
  readonly text: string;
  readonly at: number;
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
        | 'MUST_FOLLOW_SUIT';
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
