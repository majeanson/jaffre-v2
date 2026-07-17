import type { Card, SeatView } from '@jaffre/engine';
import { legalCards, sameCard } from '@jaffre/engine';

/**
 * Cards you may queue for your next play while it isn't your turn.
 *
 * Once the current trick has started and you haven't played in it, the led
 * suit for your upcoming play is already fixed, so only legal cards are
 * queueable. If you'll lead (trick empty, or you already played in the
 * current trick so your next play opens the next one), any card is a legal
 * lead — the whole hand qualifies.
 */
export function queueableCards(
  view: SeatView,
  me: number | null,
  myTurn: boolean,
): readonly Card[] {
  if (me === null || myTurn || view.phase !== 'playing') return [];
  const trick = view.currentTrick;
  const playedInTrick = trick.some((p) => p.seat === me);
  if (trick.length > 0 && !playedInTrick) {
    return legalCards(view.hand, trick[0]?.card.suit ?? null);
  }
  return view.hand;
}

/**
 * Whether a queued card still makes sense against the latest view. False the
 * moment the card leaves the hand, play ends, or follow-suit rules it out —
 * the queue is then silently dropped (never auto-substituted).
 */
export function queueStillValid(
  queued: Card,
  view: SeatView,
  me: number,
  myTurn: boolean,
): boolean {
  if (view.phase !== 'playing') return false;
  if (!view.hand.some((c) => sameCard(c, queued))) return false;
  if (myTurn) {
    const ledSuit = view.currentTrick[0]?.card.suit ?? null;
    return legalCards(view.hand, ledSuit).some((c) => sameCard(c, queued));
  }
  return queueableCards(view, me, myTurn).some((c) => sameCard(c, queued));
}
