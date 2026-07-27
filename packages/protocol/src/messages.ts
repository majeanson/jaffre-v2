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
  z.object({
    t: z.literal('join'),
    resumeSeq: z.number().int().nonnegative().optional(),
    // The joiner's pixel avatar so other players see it (RosterSeat.paint).
    // Pixel-SVG data URLs only, size-capped — legacy freehand PNG paintings
    // (up to ~512 KB) must never ride every roster broadcast.
    paint: z.string().startsWith('data:image/svg+xml,').max(16384).optional(),
  }),
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
  // Tap-to-dismiss on your own turn-timer nudge: "I'm here" restarts the
  // current turn's clock (a fresh full timer). Seat inferred from the sender;
  // a stale tap racing the turn advancing is a quiet no-op.
  z.object({ t: z.literal('im_here') }),
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
  // Music: paste a YouTube link into the room's shared queue. The wire carries
  // only the raw string — videoId extraction and oEmbed metadata happen
  // server-side, and ids below are server-assigned queue-entry ids.
  z.object({ t: z.literal('music_add'), url: z.string().min(10).max(300) }),
  // Remove one of YOUR OWN not-yet-playing queue entries.
  z.object({ t: z.literal('music_remove'), id: z.string().min(1).max(24) }),
  // Vote to skip the current track — seated humans only, majority advances.
  z.object({ t: z.literal('music_skip_vote') }),
  // Your player reached ENDED for this entry — first matching report advances.
  z.object({ t: z.literal('music_ended'), id: z.string().min(1).max(24) }),
  // Your player errored on this entry (private/removed/embed-disabled).
  z.object({ t: z.literal('music_error'), id: z.string().min(1).max(24) }),
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
  /** This human's opaque PUBLIC id (a one-way hash of their uid, never the
   * uid itself) — the same value the leaderboard rows carry, so the client
   * can match a seat to its ladder row without guessing by display name. */
  readonly pid?: string;
  /** This human's pixel avatar (pixel-SVG data URL), as sent on their join —
   * lets every client render painted avatars for OTHER players too. */
  readonly paint?: string;
  /** Ready for the next round (round_over phase only; bots are always ready). */
  readonly ready?: boolean;
  /** Present only for bot seats — the difficulty this bot plays at. */
  readonly difficulty?: BotDifficulty;
  /**
   * Epoch ms when this DISCONNECTED seated human's turns get handed to a bot
   * (the mid-game disconnect clock). Absolute (not remaining) so the client
   * can tick it down locally between rosters — correct it with `Roster.now`
   * against local clock skew.
   * Present only while the deadline is still in the FUTURE — once it passes,
   * `botPlaying` replaces it (a countdown pinned at zero helps nobody).
   */
  readonly botSwapAt?: number;
  /** True once a DISCONNECTED human's swap deadline has passed: a bot is
   * playing their turns until they return. The steady-state successor of
   * botSwapAt — never present alongside it, and never for actual bot seats. */
  readonly botPlaying?: boolean;
  /**
   * Epoch ms when the `turnTimer` house rule plays this CONNECTED human's
   * current bid/play for them. Present only while it's their turn and the
   * rule is on. Separate from botSwapAt: this seat is present, just idle —
   * the client shows a late-turn nudge, never an "Away" label.
   */
  readonly turnTimerAt?: number;
  /** True when this seated human has voluntary auto-play on — the server is
   * playing their turns at 'hard' until they turn it off. */
  readonly autoPlay?: boolean;
}

export interface Roster {
  readonly seats: readonly (RosterSeat | null)[];
  readonly spectators: number;
  readonly started: boolean;
  /** Server clock (epoch ms) when this roster was built. Clients diff it
   * against their own Date.now() to skew-correct the absolute deadlines
   * above — a device clock minutes off must not fire countdowns early. */
  readonly now?: number;
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
  /** Per-SEAT tricks captured across each finished game this sitting, oldest
   * first (parallel to seriesGames) — powers the individual tricks scorecard.
   * A game may be absent trick data (played pre-upgrade): entry is null. */
  readonly seriesTricks?: readonly (readonly [number, number, number, number] | null)[];
  /** House rules chosen in the lobby, echoed so every seat sees the toggle. */
  readonly rules?: {
    readonly hailMary12: boolean;
    /** Idle-player turn timer (off unless a table opts in) — see
     * RosterSeat.turnTimerAt for the per-seat countdown it drives. */
    readonly turnTimer?: boolean;
  };
  /** Epoch ms when the round_over recap auto-readies connected idle humans
   * (turnTimer rule). Present only during round_over with the rule on — the
   * client shows a quiet countdown on the Ready button in the final stretch,
   * so the server's auto-ready never reads as a ghost click. Skew-correct
   * with `now`, like the per-seat deadlines. */
  readonly readyTimeoutAt?: number;
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

export interface MusicTrack {
  /** Server-assigned queue-entry id ("m17") — NOT the videoId: the same video
   * may be queued twice, and ended/remove reports must be unambiguous. */
  readonly id: string;
  /** 11-char YouTube video id. */
  readonly videoId: string;
  /** Title/author/thumbnail from YouTube oEmbed, capped server-side. */
  readonly title: string;
  readonly author: string;
  readonly thumb: string;
  /** Adder's display name (like ChatEntry.from — never a userId). */
  readonly addedBy: string;
  /** Adder's seat, so the UI can felt-colour the name; absent for spectators. */
  readonly addedBySeat?: number;
  /** Per-recipient: this entry is yours (shows the remove affordance). */
  readonly mine?: boolean;
}

export interface MusicState {
  /** Now playing, with the server-epoch ms it started. Clients seek to
   * (skew-corrected serverNow − startedAt)/1000. Null = silence. */
  readonly current: (MusicTrack & { readonly startedAt: number }) | null;
  readonly queue: readonly MusicTrack[];
  /** Skip-vote progress on the current track (votes reset on every advance). */
  readonly skipVotes: number;
  readonly skipNeeded: number;
  /** Per-recipient: you already voted to skip the current track. */
  readonly youVotedSkip?: boolean;
}

export type ServerMessage =
  | {
      readonly t: 'welcome';
      readonly viewer: Viewer;
      readonly view: SeatView | null;
      readonly seq: number;
      readonly roster: Roster;
      readonly chatTail: readonly ChatEntry[];
      /** Optional so older cached bundles keep parsing welcomes. */
      readonly music?: MusicState;
    }
  | { readonly t: 'events'; readonly seq: number; readonly events: readonly GameEvent[] }
  | { readonly t: 'view'; readonly seq: number; readonly view: SeatView }
  | { readonly t: 'roster'; readonly roster: Roster }
  | { readonly t: 'chat'; readonly entry: ChatEntry }
  | { readonly t: 'music'; readonly state: MusicState }
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
        | 'MUSIC_RATE'
        | 'MUSIC_BAD_URL'
        | 'MUSIC_UNAVAILABLE'
        | 'MUSIC_QUEUE_FULL'
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
