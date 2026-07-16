import type { Card, SeatView, Suit } from '@jaffre/engine';
import { legalBidChoices, legalCards } from '@jaffre/engine';
import type { Roster } from '@jaffre/protocol';
import type { BidOption, TrickPlayView } from '@jaffre/ui';
import { type Advice, suggest } from '@jaffre/bots';
import { toPosition, useGameStore } from '../state/gameStore.js';

/** Everything a seat chip needs to render, already resolved from game state. */
export interface SeatChipInfo {
  readonly name: string;
  readonly team: 0 | 1;
  readonly isTurn: boolean;
  readonly isDealer: boolean;
  readonly isBot: boolean;
  readonly connected: boolean;
  /** The seat's auction declaration ("8 SA", "Pass"), null before it bids. */
  readonly bidText: string | null;
  /** True when this seat holds the contract (highlights the bid bubble). */
  readonly isContract: boolean;
}

/** Contract line for the score strip. */
export interface ContractDisplay {
  readonly playerName: string;
  readonly value: number;
  readonly sansAtout: boolean;
  readonly progress: number;
}

/** The trick result shown while a finished trick is held on the table. */
export interface HeldBanner {
  readonly winnerName: string;
  readonly isYou: boolean;
  readonly points: number;
  readonly team: 0 | 1;
  readonly specials: readonly ('red_zero' | 'brown_zero')[];
}

/** The previous trick, ready for the peek popover — laid out like the table. */
export interface LastTrickInfo {
  /** Each play mapped to its table-relative position (0 = you/bottom). */
  readonly plays: readonly { readonly position: 0 | 1 | 2 | 3; readonly card: Card }[];
  readonly winnerPosition: 0 | 1 | 2 | 3;
  readonly winnerName: string;
  readonly points: number;
}

export interface TableDerived {
  readonly view: SeatView;
  readonly roster: Roster;
  /** Your absolute seat, or null when spectating. */
  readonly me: number | null;
  readonly myTurn: boolean;
  readonly ledSuit: Suit | null;
  /** Cards you may legally play right now (empty unless it's your play turn). */
  readonly legal: readonly Card[];
  /** The trick to show (a held finished trick wins over the live one). */
  readonly trickPlays: readonly TrickPlayView[];
  /** Table-relative position the trick is sweeping toward, if any. */
  readonly sweepTo: 0 | 1 | 2 | 3 | null;
  readonly heldBanner: HeldBanner | null;
  /** Table-relative position of the held trick's winning card, for highlight. */
  readonly winnerPosition: 0 | 1 | 2 | 3 | null;
  readonly bidOptions: readonly BidOption[];
  readonly contractDisplay: ContractDisplay | null;
  readonly trickCounts: readonly [number, number];
  readonly lastTrick: LastTrickInfo | null;
  /** Resolve the seat occupying a table-relative position (0 = you/bottom). */
  readonly seatInfo: (position: 0 | 1 | 2 | 3) => SeatChipInfo | null;
  /** The Coach's advice on your turn when it's switched on, else null. */
  readonly coach: Advice | null;
}

/**
 * The single place game state is turned into display data. Components under
 * src/table/ are thin renderers of what this hook returns — they never
 * compute game logic themselves. Returns null until the first view arrives.
 */
export function useTableDerived(coachOn = false): TableDerived | null {
  const { view, viewer, roster, sweepTo, heldTrick } = useGameStore();
  if (view === null || roster === null) return null;

  const me = viewer === 'spectator' || viewer === null ? null : viewer;
  const myTurn = me !== null && view.turn === me && view.phase !== 'game_over';
  // The Coach reads only the redacted view — exactly what the human can see.
  const coach = coachOn && myTurn ? suggest(view) : null;
  const ledSuit = view.currentTrick[0]?.card.suit ?? null;
  const legal =
    me !== null && view.phase === 'playing' && myTurn ? legalCards(view.hand, ledSuit) : [];

  // While a finished trick is held, show it instead of the (already empty)
  // live trick so players see all four cards and the points.
  const shownTrick = heldTrick?.plays ?? view.currentTrick;
  const trickPlays: TrickPlayView[] = shownTrick.map((p) => ({
    position: toPosition(p.seat, viewer),
    card: p.card,
  }));

  const heldBanner: HeldBanner | null =
    heldTrick !== null
      ? {
          winnerName: roster.seats[heldTrick.winner]?.name ?? 'Player',
          isYou: heldTrick.winner === (me ?? -1),
          points: heldTrick.points,
          team: (heldTrick.winner % 2) as 0 | 1,
          specials: heldTrick.specials,
        }
      : null;

  // During the auction every declaration matters (who passed, who leads);
  // once play starts only the winning bid stays, next to its seat.
  const bidTextFor = (seat: number): string | null => {
    if (view.phase === 'bidding') {
      const entry = view.bids.find((b) => b.seat === seat);
      if (entry === undefined) return null;
      if (entry.choice.kind === 'pass') return 'Pass';
      return `${entry.choice.value}${entry.choice.sansAtout ? ' SA' : ''}`;
    }
    if (view.contract !== null && view.contract.seat === seat) {
      return `${view.contract.value}${view.contract.sansAtout ? ' SA' : ''}`;
    }
    return null;
  };

  const bidOptions: BidOption[] =
    view.phase === 'bidding'
      ? legalBidChoices(view.bids).flatMap((c) =>
          c.kind === 'bid' ? [{ value: c.value, sansAtout: c.sansAtout }] : [],
        )
      : [];

  const contractDisplay: ContractDisplay | null =
    view.contract !== null
      ? {
          playerName: roster.seats[view.contract.seat]?.name ?? 'Player',
          value: view.contract.value,
          sansAtout: view.contract.sansAtout,
          progress: view.roundPoints[view.contract.seat % 2] ?? 0,
        }
      : null;

  const trickCounts: readonly [number, number] = [
    view.capturedTricks.filter((t) => t.winner % 2 === 0).length,
    view.capturedTricks.filter((t) => t.winner % 2 === 1).length,
  ];

  const last = view.capturedTricks[view.capturedTricks.length - 1];
  const lastTrick: LastTrickInfo | null =
    last !== undefined && view.phase === 'playing'
      ? {
          plays: last.plays.map((p) => ({ position: toPosition(p.seat, viewer), card: p.card })),
          winnerPosition: toPosition(last.winner, viewer),
          winnerName: roster.seats[last.winner]?.name ?? 'Player',
          points: last.points,
        }
      : null;

  const seatInfo = (position: 0 | 1 | 2 | 3): SeatChipInfo | null => {
    const seat = me === null ? position : (((position + me) % 4) as 0 | 1 | 2 | 3);
    const info = roster.seats[seat];
    if (info == null) return null;
    return {
      name: seat === me ? 'You' : info.name,
      team: (seat % 2) as 0 | 1,
      isTurn: view.turn === seat && view.phase !== 'game_over',
      isDealer: view.dealer === seat,
      isBot: info.isBot,
      connected: info.connected,
      bidText: bidTextFor(seat),
      isContract: view.contract?.seat === seat,
    };
  };

  return {
    view,
    roster,
    me,
    myTurn,
    ledSuit,
    legal,
    trickPlays,
    sweepTo,
    heldBanner,
    winnerPosition: heldTrick !== null ? toPosition(heldTrick.winner, viewer) : null,
    bidOptions,
    contractDisplay,
    trickCounts,
    lastTrick,
    seatInfo,
    coach,
  };
}
