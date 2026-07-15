export const SUITS = ['red', 'brown', 'green', 'blue'] as const;
export type Suit = (typeof SUITS)[number];

export const VALUES = [0, 1, 2, 3, 4, 5, 6, 7] as const;
export type Value = (typeof VALUES)[number];

export interface Card {
  readonly suit: Suit;
  readonly value: Value;
}

/** Teams: seats 0 & 2 vs seats 1 & 3 (team = seat % 2). */
export type Seat = 0 | 1 | 2 | 3;
export type Team = 0 | 1;

export const BID_VALUES = [7, 8, 9, 10, 11, 12] as const;
export type BidValue = (typeof BID_VALUES)[number];

export type BidChoice = { kind: 'pass' } | { kind: 'bid'; value: BidValue; sansAtout: boolean };

export interface BidEntry {
  readonly seat: Seat;
  readonly choice: BidChoice;
}

export interface Contract {
  readonly seat: Seat;
  readonly value: BidValue;
  readonly sansAtout: boolean;
  /** True when everyone passed and the dealer was forced to 7. */
  readonly forced: boolean;
}

export type Phase = 'bidding' | 'playing' | 'round_over' | 'game_over';

export interface TrickPlay {
  readonly seat: Seat;
  readonly card: Card;
}

export interface CapturedTrick {
  readonly winner: Seat;
  readonly cards: readonly Card[];
  readonly points: number;
}

export interface RoundSummary {
  readonly roundIndex: number;
  readonly contract: Contract;
  readonly contractMade: boolean;
  readonly trickPoints: readonly [number, number];
  readonly deltas: readonly [number, number];
  readonly scores: readonly [number, number];
}

export interface GameState {
  readonly schemaVersion: 1;
  readonly seed: number;
  readonly phase: Phase;
  readonly roundIndex: number;
  readonly dealer: Seat;
  readonly turn: Seat;
  readonly hands: readonly (readonly Card[])[];
  readonly bids: readonly BidEntry[];
  readonly contract: Contract | null;
  /** null while undecided (before contract holder's first lead) or sans atout. */
  readonly trump: Suit | null;
  readonly trumpDecided: boolean;
  readonly currentTrick: readonly TrickPlay[];
  readonly trickLeader: Seat;
  readonly capturedTricks: readonly CapturedTrick[];
  readonly roundPoints: readonly [number, number];
  readonly scores: readonly [number, number];
  readonly lastRoundSummary: RoundSummary | null;
  readonly winner: Team | null;
}

export type Action =
  | { type: 'place_bid'; seat: Seat; choice: BidChoice }
  | { type: 'play_card'; seat: Seat; card: Card }
  | { type: 'continue' };

export type GameEvent =
  | { type: 'round_started'; roundIndex: number; dealer: Seat; hands: readonly (readonly Card[])[] }
  | { type: 'bid_placed'; seat: Seat; choice: BidChoice }
  | { type: 'bidding_won'; contract: Contract }
  | { type: 'card_played'; seat: Seat; card: Card }
  | { type: 'trump_set'; trump: Suit | null }
  | {
      type: 'trick_won';
      winner: Seat;
      points: number;
      specials: readonly ('red_zero' | 'brown_zero')[];
    }
  | { type: 'round_scored'; summary: RoundSummary }
  | { type: 'game_over'; winner: Team };

export type EngineErrorCode =
  'WRONG_PHASE' | 'NOT_YOUR_TURN' | 'ILLEGAL_BID' | 'CARD_NOT_IN_HAND' | 'MUST_FOLLOW_SUIT';

export interface EngineError {
  readonly code: EngineErrorCode;
  readonly message: string;
}

export type Result =
  { ok: true; state: GameState; events: readonly GameEvent[] } | { ok: false; error: EngineError };

export function teamOf(seat: Seat): Team {
  return (seat % 2) as Team;
}

export function nextSeat(seat: Seat): Seat {
  return ((seat + 1) % 4) as Seat;
}

export function cardId(card: Card): string {
  return `${card.suit}-${card.value}`;
}

export function sameCard(a: Card, b: Card): boolean {
  return a.suit === b.suit && a.value === b.value;
}
