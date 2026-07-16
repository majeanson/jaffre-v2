import type { Action, BidChoice, Card, SeatView, Suit } from '@jaffre/engine';
import { legalCards, teamOf } from '@jaffre/engine';
import { cheapestWinner, isBoss, isBrownZero, isRedZero, trickCtx, wouldWin } from './analysis.js';
import { bestTrump, pickBid } from './evaluate.js';
import { heuristicCard } from './heuristics.js';

/**
 * The Coach: the bot brain turned inside-out. It recommends the strongest move
 * for whoever is on turn and, crucially, says *why* in one plain sentence —
 * the same reasoning the Hard bot uses, surfaced for a human learning the game.
 */
export interface Advice {
  /** The full engine action to suggest, or null when it isn't the viewer's turn. */
  readonly action: Action | null;
  /** The recommended card (playing phase) — the UI highlights it in hand. */
  readonly card: Card | null;
  /** The recommended bid (bidding phase). */
  readonly bid: BidChoice | null;
  /** A short, human explanation of the recommendation. */
  readonly tip: string;
}

const NONE: Advice = { action: null, card: null, bid: null, tip: '' };

const SUIT_NAME: Record<Suit, string> = {
  red: 'Red',
  brown: 'Brown',
  green: 'Green',
  blue: 'Blue',
};

function name(card: Card): string {
  return `${SUIT_NAME[card.suit]} ${card.value}`;
}

/** Coach always advises at the strongest level — the point is to teach good play. */
const NORNG = () => 0;

export function suggest(view: SeatView): Advice {
  if (view.viewer === 'spectator' || view.turn !== view.viewer) return NONE;
  const seat = view.viewer;

  if (view.phase === 'bidding') {
    const bid = pickBid(view, {
      margin: 0.5,
      allowSansAtout: true,
      scoreAware: true,
      partnerOutbidMargin: 2,
    });
    return {
      action: { type: 'place_bid', seat, choice: bid },
      card: null,
      bid,
      tip: bidTip(view, bid),
    };
  }

  if (view.phase === 'playing') {
    const card = heuristicCard(view, NORNG, 'hard');
    return {
      action: { type: 'play_card', seat, card },
      card,
      bid: null,
      tip: playTip(view, card),
    };
  }

  return NONE;
}

function bidTip(view: SeatView, bid: BidChoice): string {
  if (bid.kind === 'pass') return 'This hand is thin — pass and play defense.';
  const kind = bid.sansAtout
    ? `bid ${bid.value} sans atout — you have winners in every suit`
    : `${SUIT_NAME[bestTrump(view.hand).suit]} is your strongest suit, so bid ${bid.value}`;
  return `${kind}. Bid only what you need — overbidding never scores more.`;
}

function playTip(view: SeatView, card: Card): string {
  const seat = view.viewer as 0 | 1 | 2 | 3;
  const ctx = trickCtx(view);
  const declaring = view.contract !== null && teamOf(view.contract.seat) === teamOf(seat);

  // Opening lead as declarer — this card names trump.
  if (
    ctx.position === 0 &&
    view.contract !== null &&
    view.contract.seat === seat &&
    !view.trumpDecided
  ) {
    return `Lead ${SUIT_NAME[card.suit]} — your first card names it trump, and leading high starts drawing theirs.`;
  }

  if (ctx.position === 0) {
    if (view.trump !== null && card.suit === view.trump && declaring) {
      return `Lead trump (${name(card)}) to strip the defenders of theirs.`;
    }
    if (isBoss(card, view, true)) {
      return `Cash your ${name(card)} — nothing out can beat it.`;
    }
    return `Lead low with ${name(card)}; save your strong cards for later.`;
  }

  if (ctx.partnerWinning) {
    if (isRedZero(card)) return 'Your partner has this trick — cash the Red 0 for +5.';
    return `Your partner is winning — play ${name(card)} low and don't overtake your own side.`;
  }

  // An opponent currently leads the trick.
  if (wouldWin(card, view)) {
    if (view.currentTrick.some((p) => isRedZero(p.card))) {
      return `Win this one with ${name(card)} — the Red 0 in it is worth +5.`;
    }
    const cheap = cheapestWinner(legalCards(view.hand, ctx.ledSuit), view);
    if (cheap !== null && isBoss(cheap, view, true)) {
      return `Take the trick with your ${name(card)} — it can't be beaten.`;
    }
    if (view.trump !== null && card.suit === view.trump && card.suit !== ctx.ledSuit) {
      return `Ruff with ${name(card)} to take the trick — you're out of the led suit.`;
    }
    return `Take it with ${name(card)} — the cheapest card that still wins.`;
  }

  if (isBrownZero(card)) return "You can't win this — dump the Brown 0 on them for −2.";
  if (view.trump !== null && card.suit === view.trump) {
    return `Can't win cheaply — hold your trumps and throw ${name(card)} only if nothing else.`;
  }
  const keepingRedZero = view.hand.some(isRedZero) && !isRedZero(card);
  return keepingRedZero
    ? `You can't win — throw ${name(card)} and keep the Red 0 for later.`
    : `You can't win this trick — throw your weakest card, ${name(card)}.`;
}
