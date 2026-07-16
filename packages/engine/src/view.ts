import type {
  BidEntry,
  CapturedTrick,
  Card,
  Contract,
  GameEvent,
  GameState,
  Phase,
  RoundSummary,
  Seat,
  Suit,
  Team,
  TrickPlay,
} from './types.js';

export type Viewer = Seat | 'spectator';

/**
 * What one viewer is allowed to see. Never contains another seat's hand or the
 * seed — this is the anti-cheat boundary and the only shape clients receive.
 */
export interface SeatView {
  readonly viewer: Viewer;
  readonly phase: Phase;
  readonly roundIndex: number;
  readonly dealer: Seat;
  readonly turn: Seat;
  readonly hand: readonly Card[];
  readonly handCounts: readonly [number, number, number, number];
  readonly bids: readonly BidEntry[];
  readonly contract: Contract | null;
  readonly trump: Suit | null;
  readonly trumpDecided: boolean;
  readonly currentTrick: readonly TrickPlay[];
  readonly trickLeader: Seat;
  readonly capturedTricks: readonly CapturedTrick[];
  readonly roundPoints: readonly [number, number];
  readonly scores: readonly [number, number];
  readonly lastRoundSummary: RoundSummary | null;
  /** Every scored round this game, oldest first — survives reconnects. */
  readonly roundSummaries: readonly RoundSummary[];
  readonly winner: Team | null;
}

export function viewFor(state: GameState, viewer: Viewer): SeatView {
  return {
    viewer,
    phase: state.phase,
    roundIndex: state.roundIndex,
    dealer: state.dealer,
    turn: state.turn,
    hand: viewer === 'spectator' ? [] : (state.hands[viewer] as readonly Card[]),
    handCounts: state.hands.map((h) => h.length) as unknown as [number, number, number, number],
    bids: state.bids,
    contract: state.contract,
    trump: state.trump,
    trumpDecided: state.trumpDecided,
    currentTrick: state.currentTrick,
    trickLeader: state.trickLeader,
    capturedTricks: state.capturedTricks,
    roundPoints: state.roundPoints,
    scores: state.scores,
    lastRoundSummary: state.lastRoundSummary,
    roundSummaries: state.roundSummaries,
    winner: state.winner,
  };
}

/**
 * Redact an event for a viewer. Only `round_started` carries hidden
 * information (all four hands); every other event is already public.
 */
export function redactEvent(event: GameEvent, viewer: Viewer): GameEvent {
  if (event.type !== 'round_started') return event;
  return {
    ...event,
    hands: event.hands.map((hand, seat) => (viewer === seat ? hand : [])),
  };
}
