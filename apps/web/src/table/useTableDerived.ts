import type { Card, Phase, SeatView, Suit } from '@jaffre/engine';
import { legalBidChoices, legalCards, TARGET_SCORE } from '@jaffre/engine';
import type { BotDifficulty, Roster } from '@jaffre/protocol';
import type {
  AuctionTurn,
  BidOption,
  ScoreboardRound,
  TeamSpecials,
  TrickPlayView,
} from '@jaffre/ui';
import { useLang, type Lang } from '@jaffre/ui';
import { type Advice, suggest } from '@jaffre/bots';
import { useShallow } from 'zustand/react/shallow';
import { toPosition, useGameStore } from '../state/gameStore.js';
import { botAvatar } from '../paint/botAvatars.js';
import { queueableCards } from './queue.js';
import { teamSpecialsFrom } from './specials.js';

const T: Record<
  Lang,
  {
    you: string;
    player: string;
    pass: string;
    sa: string;
    yourBid: string;
    bidding: (name: string) => string;
    yourTurn: string;
    toPlay: (name: string) => string;
    roundOver: string;
    gameOver: string;
  }
> = {
  en: {
    you: 'You',
    player: 'Player',
    pass: 'Pass',
    sa: 'SA',
    yourBid: 'Your bid',
    bidding: (name) => `${name} bidding`,
    yourTurn: 'Your turn',
    toPlay: (name) => `${name} to play`,
    roundOver: 'Round over',
    gameOver: 'Game over',
  },
  fr: {
    you: 'Toi',
    player: 'Joueur',
    pass: 'Passe',
    sa: 'SA',
    yourBid: 'Ta mise',
    bidding: (name) => `${name} mise`,
    yourTurn: 'À ton tour',
    toPlay: (name) => `À ${name} de jouer`,
    roundOver: 'Fin de la ronde',
    gameOver: 'Partie terminée',
  },
};

/**
 * The shared "state of the game right now" shown in the peek's game section —
 * identical for every seat, so one object is attached to all seat chips. Lets
 * the avatar peek surface the full match context (score, bet, trump, tricks)
 * next to the player it's about.
 */
export interface GamePeekInfo {
  readonly phase: Phase;
  /** 1-based round number in progress. */
  readonly round: number;
  /** "Marcel to play" / "Round over" — the same headline the score strip shows. */
  readonly action: string;
  /** Running game totals [Sun, Moon]. */
  readonly scores: readonly [number, number];
  /** Points needed to win the game. */
  readonly target: number;
  /** The viewer's own team (seat parity), highlighted; null when spectating. */
  readonly myTeam: 0 | 1 | null;
  readonly trump: Suit | null;
  readonly trumpDecided: boolean;
  /** Tricks captured this round per team [Sun, Moon]. */
  readonly trickCounts: readonly [number, number];
  /** Trick points taken this round per team [Sun, Moon]. */
  readonly roundPoints: readonly [number, number];
  /** The winning bet and how it's progressing, once decided. */
  readonly contract: {
    readonly bidderName: string;
    readonly team: 0 | 1;
    readonly value: number;
    readonly sansAtout: boolean;
    readonly progress: number;
  } | null;
}

/** Everything a seat chip needs to render, already resolved from game state. */
export interface SeatChipInfo {
  readonly name: string;
  /** Opaque public id from the roster (humans only) — matches the id on the
   * leaderboard rows, so the peek can find this player's ladder row without
   * guessing by display name. Null for bots / older servers. */
  readonly pid: string | null;
  /** This is the viewer's own seat — the chip marks it "(toi)" without hiding
   * the real name. */
  readonly isYou: boolean;
  readonly team: 0 | 1;
  readonly isTurn: boolean;
  readonly isDealer: boolean;
  readonly isBot: boolean;
  /** For a bot seat, the difficulty it plays at (peek shows it); null for humans. */
  readonly difficulty: BotDifficulty | null;
  /** A pixel avatar to render in place of the initial token (bot sprites; the
   * viewer's own paint is applied separately). Null → fall back to the initial. */
  readonly avatar: string | null;
  readonly connected: boolean;
  /** Epoch ms when a disconnected human's seat becomes a bot, else null. */
  readonly botSwapAt: number | null;
  /** Epoch ms when the turn-timer house rule plays this CONNECTED human's
   * current turn for them, else null. Shown as a late-turn nudge — never as
   * the "Away" disconnect countdown. */
  readonly turnTimerAt: number | null;
  /** True when this human seat has voluntary auto-play on (a bot plays for them). */
  readonly autoPlay: boolean;
  /** The seat's auction declaration ("8 SA", "Pass"), null before it bids. */
  readonly bidText: string | null;
  /** True when this seat holds the contract (highlights the bid bubble). */
  readonly isContract: boolean;
  /** Cards left in this seat's hand — the table draws them as a face-down fan
   * (the one place another player's card BACK is seen all game). */
  readonly cards: number;
  /** The shared match context — the peek's "This game" section. Same object
   * across every seat. */
  readonly game: GamePeekInfo;
}

/** Contract line for the score strip. */
export interface ContractDisplay {
  readonly playerName: string;
  readonly value: number;
  readonly sansAtout: boolean;
  readonly progress: number;
  /** Bidder's team — colors the bet on the written scoreboard. */
  readonly team: 0 | 1;
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
  /** The card queued to auto-play on your next turn, if any. */
  readonly queued: Card | null;
  /** Cards you may queue right now (empty unless waiting during play). */
  readonly queueable: readonly Card[];
  /** True while YOUR seat is on voluntary auto-play — the hand goes quiet. */
  readonly autoPiloted: boolean;
  /** The trick to show (a held finished trick wins over the live one). */
  readonly trickPlays: readonly TrickPlayView[];
  /** Table-relative position the trick is sweeping toward, if any. */
  readonly sweepTo: 0 | 1 | 2 | 3 | null;
  readonly heldBanner: HeldBanner | null;
  /** Table-relative position of the held trick's winning card, for highlight. */
  readonly winnerPosition: 0 | 1 | 2 | 3 | null;
  readonly bidOptions: readonly BidOption[];
  /** The four seats in bidding order with their declarations (bidding only). */
  readonly auctionOrder: readonly AuctionTurn[];
  readonly contractDisplay: ContractDisplay | null;
  /** Finished rounds for the written scoreboard, oldest first. */
  readonly scoreboardRounds: readonly ScoreboardRound[];
  readonly trickCounts: readonly [number, number];
  /** Specials each team has captured this round (header chips). */
  readonly teamSpecials: readonly [TeamSpecials, TeamSpecials];
  /** The current turn/phase for the score-strip center, e.g. "Marcel to play". */
  readonly headerAction: string;
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
  const lang = useLang();
  const t = T[lang];
  const { view, viewer, roster, sweepTo, heldTrick, queued } = useGameStore(
    useShallow((s) => ({
      view: s.view,
      viewer: s.viewer,
      roster: s.roster,
      sweepTo: s.sweepTo,
      heldTrick: s.heldTrick,
      queued: s.queued,
    })),
  );
  if (view === null || roster === null) return null;

  const me = viewer === 'spectator' || viewer === null ? null : viewer;
  const myTurn = me !== null && view.turn === me && view.phase !== 'game_over';
  // The Coach reads only the redacted view — exactly what the human can see.
  const coach = coachOn && myTurn ? suggest(view, lang) : null;
  const ledSuit = view.currentTrick[0]?.card.suit ?? null;
  // While a finished trick is held on the table, your lead can't hard-play —
  // an instant lead lets the bots finish the NEXT trick before the hold+sweep
  // ends, yanking the held cards off screen. Taps queue instead (below), and
  // the queue fires 400ms after the sweep clears (useQueuedPlay).
  const holding = heldTrick !== null;
  // Your seat on voluntary auto-play: the server is playing your turns, so
  // manual taps and queues would only race its alarm and bounce with a
  // NOT_YOUR_TURN toast — the hand goes quiet until you toggle it back off.
  const autoPiloted = me !== null && (roster.seats[me]?.autoPlay ?? false);
  const legal =
    me !== null && view.phase === 'playing' && myTurn && !holding && !autoPiloted
      ? legalCards(view.hand, ledSuit)
      : [];
  const queueable = autoPiloted
    ? []
    : holding && myTurn && view.phase === 'playing'
      ? legalCards(view.hand, ledSuit)
      : queueableCards(view, me, myTurn);

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
          winnerName: roster.seats[heldTrick.winner]?.name ?? t.player,
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
      if (entry.choice.kind === 'pass') return t.pass;
      return `${entry.choice.value}${entry.choice.sansAtout ? ` ${t.sa}` : ''}`;
    }
    if (view.contract !== null && view.contract.seat === seat) {
      return `${view.contract.value}${view.contract.sansAtout ? ` ${t.sa}` : ''}`;
    }
    return null;
  };

  const bidOptions: BidOption[] =
    view.phase === 'bidding'
      ? legalBidChoices(view.bids).flatMap((c) =>
          c.kind === 'bid' ? [{ value: c.value, sansAtout: c.sansAtout }] : [],
        )
      : [];

  // The auction as it progresses around the table, left of the dealer first.
  const auctionOrder: AuctionTurn[] =
    view.phase === 'bidding'
      ? [0, 1, 2, 3].map((i) => {
          const seat = (view.dealer + 1 + i) % 4;
          const entry = view.bids.find((b) => b.seat === seat);
          return {
            // Your real name, not "Toi" — the `you` flag bolds your slot.
            name: roster.seats[seat]?.name ?? (seat === me ? t.you : t.player),
            you: seat === me,
            bid:
              entry === undefined
                ? null
                : entry.choice.kind === 'pass'
                  ? t.pass
                  : `${String(entry.choice.value)}${entry.choice.sansAtout ? ` ${t.sa}` : ''}`,
            current: view.turn === seat,
          };
        })
      : [];

  const contractDisplay: ContractDisplay | null =
    view.contract !== null
      ? {
          playerName: roster.seats[view.contract.seat]?.name ?? t.player,
          value: view.contract.value,
          sansAtout: view.contract.sansAtout,
          progress: view.roundPoints[view.contract.seat % 2] ?? 0,
          team: (view.contract.seat % 2) as 0 | 1,
        }
      : null;

  const scoreboardRounds: ScoreboardRound[] = view.roundSummaries.map((r) => ({
    round: r.roundIndex + 1,
    bidderName: roster.seats[r.contract.seat]?.name ?? t.player,
    bidderTeam: (r.contract.seat % 2) as 0 | 1,
    bid: r.contract.value,
    sansAtout: r.contract.sansAtout,
    trump: r.trump,
    made: r.contractMade,
    deltas: r.deltas,
  }));

  const trickCounts: readonly [number, number] = [
    view.capturedTricks.filter((t) => t.winner % 2 === 0).length,
    view.capturedTricks.filter((t) => t.winner % 2 === 1).length,
  ];

  // Which team holds each scoring special this round — the header calls them out.
  const specialFlags = teamSpecialsFrom(view.capturedTricks);

  // A one-line "what's happening now" for the score-strip center.
  const turnName = view.turn === me ? t.you : (roster.seats[view.turn]?.name ?? t.player);
  const youTurn = view.turn === me;
  const headerAction =
    view.phase === 'bidding'
      ? youTurn
        ? t.yourBid
        : t.bidding(turnName)
      : view.phase === 'playing'
        ? youTurn
          ? t.yourTurn
          : t.toPlay(turnName)
        : view.phase === 'round_over'
          ? t.roundOver
          : t.gameOver;

  const last = view.capturedTricks[view.capturedTricks.length - 1];
  const lastTrick: LastTrickInfo | null =
    last !== undefined && view.phase === 'playing'
      ? {
          plays: last.plays.map((p) => ({ position: toPosition(p.seat, viewer), card: p.card })),
          winnerPosition: toPosition(last.winner, viewer),
          winnerName: roster.seats[last.winner]?.name ?? t.player,
          points: last.points,
        }
      : null;

  // One snapshot of the match, shared by every seat's peek game section.
  const gamePeek: GamePeekInfo = {
    phase: view.phase,
    round: view.roundIndex + 1,
    action: headerAction,
    scores: view.scores,
    target: TARGET_SCORE,
    myTeam: me === null ? null : ((me % 2) as 0 | 1),
    trump: view.trump,
    trumpDecided: view.trumpDecided,
    trickCounts,
    roundPoints: view.roundPoints,
    contract:
      contractDisplay === null
        ? null
        : {
            bidderName: contractDisplay.playerName,
            team: contractDisplay.team,
            value: contractDisplay.value,
            sansAtout: contractDisplay.sansAtout,
            progress: contractDisplay.progress,
          },
  };

  const seatInfo = (position: 0 | 1 | 2 | 3): SeatChipInfo | null => {
    const seat = me === null ? position : (((position + me) % 4) as 0 | 1 | 2 | 3);
    const info = roster.seats[seat];
    if (info == null) return null;
    return {
      name: info.name,
      pid: info.pid ?? null,
      isYou: seat === me,
      team: (seat % 2) as 0 | 1,
      isTurn: view.turn === seat && view.phase !== 'game_over',
      isDealer: view.dealer === seat,
      isBot: info.isBot,
      difficulty: info.difficulty ?? null,
      avatar: info.isBot ? botAvatar(seat) : (info.paint ?? null),
      connected: info.connected,
      botSwapAt: info.botSwapAt ?? null,
      // Rosters can outlive the turn they described — only surface the
      // per-turn clock while this seat is actually still on turn.
      turnTimerAt: view.turn === seat ? (info.turnTimerAt ?? null) : null,
      autoPlay: info.autoPlay ?? false,
      bidText: bidTextFor(seat),
      isContract: view.contract?.seat === seat,
      cards: view.handCounts[seat] ?? 0,
      game: gamePeek,
    };
  };

  return {
    view,
    roster,
    me,
    myTurn,
    ledSuit,
    legal,
    queued,
    queueable,
    autoPiloted,
    trickPlays,
    sweepTo,
    heldBanner,
    winnerPosition: heldTrick !== null ? toPosition(heldTrick.winner, viewer) : null,
    bidOptions,
    auctionOrder,
    contractDisplay,
    scoreboardRounds,
    trickCounts,
    teamSpecials: specialFlags,
    headerAction,
    lastTrick,
    seatInfo,
    coach,
  };
}
