import type { Action, BidChoice, Card, Rng, SeatView } from '@jaffre/engine';
import { legalBidChoices, legalCards } from '@jaffre/engine';

/**
 * Bot policies operate on a REDACTED SeatView — a bot structurally cannot
 * see hidden cards, so every bot game doubles as a redaction test.
 * Returns null when it is not the bot's turn or nothing is actionable.
 */
export function chooseAction(view: SeatView, rng: Rng): Action | null {
  if (view.viewer === 'spectator' || view.turn !== view.viewer) return null;

  if (view.phase === 'bidding') {
    // Bid on hand strength: high cards and long suits; otherwise pass.
    const strength = handStrength(view.hand);
    const bidsOnly = legalBidChoices(view.bids).filter(
      (c): c is Extract<BidChoice, { kind: 'bid' }> => c.kind === 'bid',
    );
    const wanted = bidsOnly.filter((b) => !b.sansAtout && b.value <= strength);
    const choice: BidChoice =
      wanted.length > 0 && rng() < 0.75
        ? (wanted[wanted.length - 1] as BidChoice)
        : { kind: 'pass' };
    return { type: 'place_bid', seat: view.viewer, choice };
  }

  if (view.phase === 'playing') {
    const led = view.currentTrick[0]?.card.suit ?? null;
    const legal = legalCards(view.hand, led);
    const card = pickCard(legal, view, rng);
    return { type: 'play_card', seat: view.viewer, card };
  }

  if (view.phase === 'round_over') return { type: 'continue' };
  return null;
}

/** Rough contract estimate: 7 baseline, +1 per 7/6 held, +1 for a 4+ suit. */
function handStrength(hand: readonly Card[]): number {
  let s = 6;
  for (const card of hand) if (card.value >= 6) s += 0.5;
  const bySuit = new Map<string, number>();
  for (const card of hand) bySuit.set(card.suit, (bySuit.get(card.suit) ?? 0) + 1);
  for (const n of bySuit.values()) if (n >= 4) s += 1;
  return Math.min(12, Math.floor(s));
}

function pickCard(legal: readonly Card[], view: SeatView, rng: Rng): Card {
  const sorted = [...legal].sort((a, b) => a.value - b.value);
  const winningNow = view.currentTrick.length === 3;
  // Dump the brown 0 on opponents' tricks when possible; protect the red 0.
  const brown = sorted.find((c) => c.suit === 'brown' && c.value === 0);
  if (brown !== undefined && view.currentTrick.length > 0 && rng() < 0.8) return brown;
  const nonRedZero = sorted.filter((c) => !(c.suit === 'red' && c.value === 0));
  const pool = nonRedZero.length > 0 ? nonRedZero : sorted;
  // Last to play: try cheapest winner; otherwise mid-range.
  return (winningNow ? pool[pool.length - 1] : pool[Math.floor(rng() * pool.length)]) as Card;
}
