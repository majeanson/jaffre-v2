import type { Card, Rng, Seat, SeatView, Suit } from '@jaffre/engine';
import { legalCards, teamOf } from '@jaffre/engine';
import {
  type TrickCtx,
  certainWinner,
  cheapestWinner,
  isBoss,
  isBrownZero,
  isRedZero,
  redZeroLive,
  trickCtx,
  trumpsOutstanding,
} from './analysis.js';
import { bestTrump, evalTrump } from './evaluate.js';

export type Level = 'normal' | 'hard';

/**
 * The shared heuristic card policy. Normal uses it directly; Hard uses it as
 * the anchor for rollouts and passes `level: 'hard'` to unlock trump-aware boss
 * reasoning and defender contract-setting.
 */
export function heuristicCard(view: SeatView, rng: Rng, level: Level): Card {
  const seat = view.viewer as Seat;
  const led = view.currentTrick[0]?.card.suit ?? null;
  const legal = legalCards(view.hand, led);
  if (legal.length === 1) return legal[0] as Card;

  if (view.currentTrick.length === 0) {
    // The declarer's very first lead of the round *is* the trump declaration.
    if (view.contract !== null && view.contract.seat === seat && !view.trumpDecided) {
      return openingLead(view);
    }
    return leadCard(view, legal, level, rng);
  }

  const ctx = trickCtx(view);
  if (ctx.partnerWinning) return supportPartner(view, legal, ctx);
  return contestTrick(view, legal, ctx, level);
}

function byValue(cards: readonly Card[], dir: 'asc' | 'desc'): Card[] {
  const s = dir === 'asc' ? 1 : -1;
  return [...cards].sort((a, b) => s * (a.value - b.value));
}

/** Opening lead as declarer: name trump (your best suit) and lead it high to draw.
 * On a forced 7 the hand has no best suit worth the name — take the longest one:
 * trump length is the only strength a junk hand can still lean on. */
function openingLead(view: SeatView): Card {
  const suit = view.contract?.forced === true ? longestSuit(view.hand) : bestTrump(view.hand).suit;
  const inSuit = byValue(
    view.hand.filter((c) => c.suit === suit),
    'desc',
  );
  return inSuit[0] ?? (byValue(view.hand, 'desc')[0] as Card);
}

function longestSuit(hand: readonly Card[]): Suit {
  const counts = new Map<Suit, number>();
  for (const c of hand) counts.set(c.suit, (counts.get(c.suit) ?? 0) + 1);
  let best: Suit | null = null;
  let bestLen = -1;
  for (const [suit, n] of counts) {
    if (
      n > bestLen ||
      (n === bestLen &&
        best !== null &&
        evalTrump(hand, suit).expectedPoints > evalTrump(hand, best).expectedPoints)
    ) {
      best = suit;
      bestLen = n;
    }
  }
  return best as Suit;
}

function leadCard(view: SeatView, legal: readonly Card[], level: Level, rng: Rng): Card {
  const seat = view.viewer as Seat;
  const trump = view.trump;
  const declaring = view.contract !== null && teamOf(view.contract.seat) === teamOf(seat);
  const trumpAware = level === 'hard';

  // Declarer with trump control: keep drawing the defenders' trumps.
  if (declaring && trump !== null && trumpsOutstanding(view) > 0) {
    const myTrumps = byValue(
      legal.filter((c) => c.suit === trump),
      'desc',
    );
    const top = myTrumps[0];
    if (top !== undefined && (myTrumps.length >= 2 || isBoss(top, view))) return top;
  }

  // Cash a sure winner in a side suit (never the red 0 — it is not a boss).
  // Cash HIGH, not low: a visibly unbeatable winner is partner communication —
  // partner can prove the trick is safe and drop the red 0 on it. Winning with
  // the lowest of equals (cross-play: −6.5 pts) starves partner of that
  // certainty; concealment only pays against humans, so it stays a human tip.
  const bosses = legal.filter(
    (c) => !isRedZero(c) && (trump === null || c.suit !== trump) && isBoss(c, view, trumpAware),
  );
  if (bosses.length > 0) return byValue(bosses, 'desc')[0] as Card;

  return lowLead(legal, trump, rng);
}

/** A quiet exit: lowest card of the longest side suit, never bleeding the red 0. */
function lowLead(legal: readonly Card[], trump: Suit | null, rng: Rng): Card {
  const noRed = legal.filter((c) => !isRedZero(c));
  const pool = noRed.length > 0 ? noRed : legal;
  const nonTrump = pool.filter((c) => trump === null || c.suit !== trump);
  const from = nonTrump.length > 0 ? nonTrump : pool;

  const counts = new Map<Suit, number>();
  for (const c of from) counts.set(c.suit, (counts.get(c.suit) ?? 0) + 1);
  let bestSuit = from[0]?.suit as Suit;
  let bestLen = -1;
  for (const [suit, n] of counts) {
    if (n > bestLen || (n === bestLen && rng() < 0.5)) {
      bestLen = n;
      bestSuit = suit;
    }
  }
  const inSuit = byValue(
    from.filter((c) => c.suit === bestSuit),
    'asc',
  );
  const nonBrown = inSuit.filter((c) => !isBrownZero(c));
  return (nonBrown[0] ?? inSuit[0]) as Card;
}

/** Partner is winning: cash the red 0 on a sure trick, otherwise duck low and
 * never overtake or ruff our own side. */
function supportPartner(view: SeatView, legal: readonly Card[], ctx: TrickCtx): Card {
  const partnerCertain = ctx.winning !== null && certainWinner(ctx.winning, view);
  const redZero = legal.find(isRedZero);
  if (partnerCertain && redZero !== undefined) return redZero;

  return [...legal].sort(
    (a, b) => sheddingRank(view, a, 50) - sheddingRank(view, b, 50),
  )[0] as Card;
}

/**
 * How willingly we part with a card when not fighting for the trick — lower is
 * shed first. `brownHold` prices holding the brown 0 (higher when partner is
 * winning: never gift our own side the −2).
 */
function sheddingRank(view: SeatView, c: Card, brownHold: number): number {
  const trump = view.trump;
  let r = c.value;
  if (isRedZero(c)) r += 200; // never throw the +5
  if (trump !== null && c.suit === trump) r += 100; // keep trumps
  if (isBrownZero(c)) r += brownHold; // hold it for a cleaner dump
  // Deliberately NO slough-to-void or brown-exit bonuses here: both were
  // cross-play tested against the previous bot and lost (~−2.5 pts each) —
  // shedding plain low cards keeps more late-round trick potential than
  // engineering voids the bot rarely converts. They live on as human tips in
  // the HelpSheet, where reading opponents can actually cash them in.
  return r;
}

/** An opponent is winning: decide whether the trick is worth taking. */
function contestTrick(view: SeatView, legal: readonly Card[], ctx: TrickCtx, level: Level): Card {
  const winner = cheapestWinner(legal, view);
  const trickHasRed0 = view.currentTrick.some((p) => isRedZero(p.card));

  let take = false;
  if (winner !== null) {
    if (ctx.position === 3)
      take = true; // last to play: perfect information
    else if (trickHasRed0)
      take = true; // fight for the +5
    else if (isBoss(winner, view, level === 'hard')) take = true; // a sure winner

    // Hoard the last high trump for the red-0 trick if this one is cheap.
    if (take && !trickHasRed0 && redZeroLive(view) && isLastHighTrump(winner, view)) take = false;

    // Hard defenders spend anything when a trick is needed to set the contract.
    if (level === 'hard' && mustWinToSet(view)) take = true;
  }

  if (take && winner !== null) return winner;
  return discard(view, legal, ctx);
}

function isLastHighTrump(card: Card, view: SeatView): boolean {
  if (view.trump === null || card.suit !== view.trump) return false;
  const myTrumps = view.hand.filter((c) => c.suit === view.trump);
  return myTrumps.length <= 1 && isBoss(card, view);
}

/** A defender's rough test: is winning this trick necessary to deny the contract? */
function mustWinToSet(view: SeatView): boolean {
  const seat = view.viewer as Seat;
  if (view.contract === null) return false;
  const decTeam = teamOf(view.contract.seat);
  if (decTeam === teamOf(seat)) return false;
  const need = view.contract.value - view.roundPoints[decTeam];
  if (need <= 0) return false; // contract already made
  const trickPts =
    1 +
    (view.currentTrick.some((p) => isRedZero(p.card)) ? 5 : 0) -
    (view.currentTrick.some((p) => isBrownZero(p.card)) ? 2 : 0);
  const tricksLeft = 8 - view.capturedTricks.length;
  return trickPts >= need || tricksLeft <= need;
}

/** Cannot or will not win: dump the brown 0 on the opponents, else shed a low
 * card while keeping trumps and never discarding the red 0. */
function discard(view: SeatView, legal: readonly Card[], ctx: TrickCtx): Card {
  const brown = legal.find(isBrownZero);
  const opponentCertain = ctx.winning !== null && certainWinner(ctx.winning, view);
  if (brown !== undefined && (ctx.position === 3 || opponentCertain)) return brown;

  return [...legal].sort(
    (a, b) => sheddingRank(view, a, 30) - sheddingRank(view, b, 30),
  )[0] as Card;
}
