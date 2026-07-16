import type { Card, Seat, SeatView, Suit, TrickPlay } from '@jaffre/engine';
import { SUITS, VALUES, sameCard, teamOf, trickWinner } from '@jaffre/engine';

/**
 * Pure inference over a redacted SeatView — everything a bot may legally deduce
 * from public information: which cards are still out, who is void where, whether
 * a card is unbeatable ("boss"), and whether a play is certain to win its trick.
 * No hidden state; safe to recompute from scratch on every decision.
 */

const ALL_SEATS: readonly Seat[] = [0, 1, 2, 3];

export function partnerOf(seat: Seat): Seat {
  return ((seat + 2) % 4) as Seat;
}

export function opponents(seat: Seat): Seat[] {
  return ALL_SEATS.filter((s) => teamOf(s) !== teamOf(seat));
}

export function isRedZero(c: Card): boolean {
  return c.suit === 'red' && c.value === 0;
}

export function isBrownZero(c: Card): boolean {
  return c.suit === 'brown' && c.value === 0;
}

function viewerSeat(view: SeatView): Seat {
  return view.viewer as Seat;
}

function voidKey(seat: Seat, suit: Suit): string {
  return `${seat}:${suit}`;
}

export interface TrickCtx {
  readonly ledSuit: Suit | null;
  readonly winning: TrickPlay | null;
  readonly partnerWinning: boolean;
  /** Cards already on the table (0..3). */
  readonly position: number;
}

export function trickCtx(view: SeatView): TrickCtx {
  const trick = view.currentTrick;
  const position = trick.length;
  if (position === 0) {
    return { ledSuit: null, winning: null, partnerWinning: false, position };
  }
  const ledSuit = (trick[0] as TrickPlay).card.suit;
  const winning = trickWinner(trick, view.trump);
  const partnerWinning = winning.seat === partnerOf(viewerSeat(view));
  return { ledSuit, winning, partnerWinning, position };
}

/** Every card whose location this viewer knows: played cards plus own hand. */
export function seenCards(view: SeatView): Card[] {
  const seen: Card[] = [];
  for (const t of view.capturedTricks) for (const p of t.plays) seen.push(p.card);
  for (const p of view.currentTrick) seen.push(p.card);
  for (const c of view.hand) seen.push(c);
  return seen;
}

/** Cards still hidden in the other three hands (deck minus everything seen). */
export function outstanding(view: SeatView): Card[] {
  const seen = seenCards(view);
  const out: Card[] = [];
  for (const suit of SUITS) {
    for (const value of VALUES) {
      const card: Card = { suit, value };
      if (!seen.some((c) => sameCard(c, card))) out.push(card);
    }
  }
  return out;
}

/** Outstanding card values per suit, sorted high to low. */
export function outstandingBySuit(view: SeatView): Map<Suit, number[]> {
  const m = new Map<Suit, number[]>();
  for (const suit of SUITS) m.set(suit, []);
  for (const c of outstanding(view)) (m.get(c.suit) as number[]).push(c.value);
  for (const suit of SUITS) (m.get(suit) as number[]).sort((a, b) => b - a);
  return m;
}

/** Trumps still in the other three hands (0 when there is no trump). */
export function trumpsOutstanding(view: SeatView): number {
  if (view.trump === null) return 0;
  return outstanding(view).filter((c) => c.suit === view.trump).length;
}

/** Seats known to be void in a suit because they failed to follow it. */
export function inferredVoids(view: SeatView): Set<string> {
  const voids = new Set<string>();
  const scan = (plays: readonly TrickPlay[]): void => {
    if (plays.length === 0) return;
    const led = (plays[0] as TrickPlay).card.suit;
    for (const p of plays) if (p.card.suit !== led) voids.add(voidKey(p.seat, led));
  };
  for (const t of view.capturedTricks) scan(t.plays);
  scan(view.currentTrick);
  return voids;
}

/**
 * Is this card unbeatable in its suit? With `trumpAware`, a non-trump card is
 * only boss when no foe who could ruff it (void in the suit, trump still out)
 * remains — the difference between Normal and Hard boss reasoning.
 */
export function isBoss(card: Card, view: SeatView, trumpAware = false): boolean {
  const higher = (outstandingBySuit(view).get(card.suit) ?? []).some((v) => v > card.value);
  if (higher) return false;
  if (!trumpAware || view.trump === null || card.suit === view.trump) return true;
  if (trumpsOutstanding(view) === 0) return true;
  const voids = inferredVoids(view);
  const foeCanRuff = opponents(viewerSeat(view)).some((s) => voids.has(voidKey(s, card.suit)));
  return !foeCanRuff;
}

export function redZeroCaptured(view: SeatView): boolean {
  return view.capturedTricks.some((t) => t.cards.some(isRedZero));
}

/** The red 0 is still unplayed this round (its +5 is still up for grabs). */
export function redZeroLive(view: SeatView): boolean {
  return !redZeroCaptured(view) && !view.currentTrick.some((p) => isRedZero(p.card));
}

/** Would playing `card` make me the current winner of the trick in progress? */
export function wouldWin(card: Card, view: SeatView): boolean {
  if (view.currentTrick.length === 0) return true;
  const seat = viewerSeat(view);
  const trick: TrickPlay[] = [...view.currentTrick, { seat, card }];
  return trickWinner(trick, view.trump).seat === seat;
}

function cardCost(c: Card): number {
  if (isRedZero(c)) return 100; // never spend the +5 casually
  return c.value;
}

/** The cheapest legal card that wins the trick right now, or null if none does. */
export function cheapestWinner(legal: readonly Card[], view: SeatView): Card | null {
  const winners = legal.filter((c) => wouldWin(c, view)).sort((a, b) => cardCost(a) - cardCost(b));
  return winners[0] ?? null;
}

function beats(a: Card, b: Card, trump: Suit | null): boolean {
  const aT = trump !== null && a.suit === trump;
  const bT = trump !== null && b.suit === trump;
  if (aT && bT) return a.value > b.value;
  if (aT) return true;
  if (bT) return false;
  return a.suit === b.suit && a.value > b.value;
}

/**
 * Is `play` guaranteed to win its trick no matter what the not-yet-played seats
 * do? Conservative: only true when no outstanding card could beat it, or every
 * seat that could hold a beater is a partner (or void in the needed suit).
 */
export function certainWinner(play: TrickPlay, view: SeatView): boolean {
  const played = new Set(view.currentTrick.map((p) => p.seat));
  const foes = ALL_SEATS.filter((s) => !played.has(s) && teamOf(s) !== teamOf(play.seat));
  if (foes.length === 0) return true;

  const trump = view.trump;
  const beaters = outstanding(view).filter((c) => beats(c, play.card, trump));
  if (beaters.length === 0) return true;

  const voids = inferredVoids(view);
  const ledSuit = view.currentTrick[0]?.card.suit ?? null;
  const suitThreat = beaters.some((c) => c.suit !== trump && c.suit === ledSuit);
  const trumpThreat = trump !== null && beaters.some((c) => c.suit === trump);

  for (const foe of foes) {
    const voidInLed = ledSuit !== null && voids.has(voidKey(foe, ledSuit));
    // A higher card of the led suit beats us unless the foe cannot hold the suit.
    if (suitThreat && !voidInLed) return false;
    // A trump ruff only happens when the foe is off the led suit (or trump led).
    if (trumpThreat) {
      const canRuff = voidInLed || ledSuit === trump;
      const couldHoldTrump = !voids.has(voidKey(foe, trump as Suit));
      if (canRuff && couldHoldTrump) return false;
    }
  }
  return true;
}
