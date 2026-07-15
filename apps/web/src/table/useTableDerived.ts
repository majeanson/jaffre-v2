import type { Card, SeatView, Suit } from '@jaffre/engine';
import { legalBidChoices, legalCards } from '@jaffre/engine';
import type { Roster } from '@jaffre/protocol';
import type { BidOption, TrickPlayView } from '@jaffre/ui';
import { toPosition, useGameStore } from '../state/gameStore.js';

/** Everything a seat chip needs to render, already resolved from game state. */
export interface SeatChipInfo {
  readonly name: string;
  readonly team: 0 | 1;
  readonly isTurn: boolean;
  readonly isDealer: boolean;
  readonly isBot: boolean;
  readonly connected: boolean;
  readonly cardCount: number;
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

/** The "X takes the trick" banner while a finished trick is held. */
export interface HeldBanner {
  readonly text: string;
  readonly special: boolean;
}

/** The previous trick, ready for the peek popover. */
export interface LastTrickInfo {
  readonly cards: readonly Card[];
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
  readonly bidOptions: readonly BidOption[];
  readonly contractDisplay: ContractDisplay | null;
  readonly trickCounts: readonly [number, number];
  readonly lastTrick: LastTrickInfo | null;
  /** Resolve the seat occupying a table-relative position (0 = you/bottom). */
  readonly seatInfo: (position: 0 | 1 | 2 | 3) => SeatChipInfo | null;
}

/**
 * The single place game state is turned into display data. Components under
 * src/table/ are thin renderers of what this hook returns — they never
 * compute game logic themselves. Returns null until the first view arrives.
 */
export function useTableDerived(): TableDerived | null {
  const { view, viewer, roster, sweepTo, heldTrick } = useGameStore();
  if (view === null || roster === null) return null;

  const me = viewer === 'spectator' || viewer === null ? null : viewer;
  const myTurn = me !== null && view.turn === me && view.phase !== 'game_over';
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

  const specialTags =
    heldTrick?.specials.map((s) => (s === 'red_zero' ? 'RED 0 +5!' : 'BROWN 0 −2!')).join(' ') ??
    '';
  const heldBanner: HeldBanner | null =
    heldTrick !== null
      ? {
          text: `${
            heldTrick.winner === (me ?? -1)
              ? 'You take'
              : `${roster.seats[heldTrick.winner]?.name ?? 'Player'} takes`
          } the trick — ${heldTrick.points > 0 ? '+' : ''}${heldTrick.points} to Team ${heldTrick.winner % 2 === 0 ? 'A' : 'B'}${specialTags ? ` · ${specialTags}` : ''}`,
          special: specialTags !== '',
        }
      : null;

  /** A seat's auction declaration, shown as a bubble until the round ends. */
  const bidTextFor = (seat: number): string | null => {
    const entry = view.bids.find((b) => b.seat === seat);
    if (entry === undefined) return null;
    if (entry.choice.kind === 'pass') return 'Pass';
    return `${entry.choice.value}${entry.choice.sansAtout ? ' SA' : ''}`;
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
          cards: last.cards,
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
      cardCount: view.handCounts[seat],
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
    bidOptions,
    contractDisplay,
    trickCounts,
    lastTrick,
    seatInfo,
  };
}
