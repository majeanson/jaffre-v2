import type { BidChoice, BidEntry, Contract, Seat } from './types.js';

export interface HighBid {
  readonly seat: Seat;
  readonly value: Contract['value'];
  readonly sansAtout: boolean;
}

/** A candidate outbids the current best if higher, or equal value with sans-atout over plain. */
export function outbids(
  candidate: { value: number; sansAtout: boolean },
  current: HighBid | null,
): boolean {
  if (current === null) return true;
  if (candidate.value !== current.value) return candidate.value > current.value;
  return candidate.sansAtout && !current.sansAtout;
}

export function highestBid(bids: readonly BidEntry[]): HighBid | null {
  let best: HighBid | null = null;
  for (const { seat, choice } of bids) {
    if (choice.kind === 'bid' && outbids(choice, best)) {
      best = { seat, value: choice.value, sansAtout: choice.sansAtout };
    }
  }
  return best;
}

/**
 * Resolve a completed auction (all 4 seats have acted). If everyone passed,
 * the dealer — who bids last — is forced to a plain 7.
 */
export function resolveContract(bids: readonly BidEntry[], dealer: Seat): Contract {
  const best = highestBid(bids);
  if (best === null) {
    return { seat: dealer, value: 7, sansAtout: false, forced: true };
  }
  return { seat: best.seat, value: best.value, sansAtout: best.sansAtout, forced: false };
}

/** All choices a seat may legally make given the current auction. */
export function legalBidChoices(bids: readonly BidEntry[]): BidChoice[] {
  const best = highestBid(bids);
  const choices: BidChoice[] = [{ kind: 'pass' }];
  for (const value of [7, 8, 9, 10, 11, 12] as const) {
    for (const sansAtout of [false, true]) {
      if (outbids({ value, sansAtout }, best)) choices.push({ kind: 'bid', value, sansAtout });
    }
  }
  return choices;
}
