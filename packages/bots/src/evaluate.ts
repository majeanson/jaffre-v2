import type { BidChoice, Card, Seat, SeatView, Suit } from '@jaffre/engine';
import { SUITS, highestBid, legalBidChoices, teamOf } from '@jaffre/engine';
import { isRedZero } from './analysis.js';

/**
 * Hand evaluation for bidding. Because trump is whatever suit the declarer
 * leads first, a hand's strength is computed once *per candidate trump suit* —
 * your longest strong suit is your real playing strength.
 */

/** Tunable weights — the benchmark harness (scripts/botbench.ts) is the tuning loop. */
const W = {
  trump7: 1.0,
  trump6: 0.85,
  trump5: 0.6,
  trumpOther: 0.4,
  trumpLength: 0.5, // per trump beyond the third
  side7: 0.9,
  side6Guarded: 0.5, // a 6 with a second card of the suit to protect it
  side6Bare: 0.25,
  ruffVoid: 0.5, // needs 3+ trumps to exploit
  ruffSingleton: 0.3,
  partner: 1.1, // expected help from partner's tricks
  brownPenalty: 0.5, // expected drag from the brown 0
  ltcSlack: 0.5, // how far past the losing-trick count the optimist may reach
  saRunBonus: 0.5, // per running-suit card beyond the top two (sans-atout tempo)
} as const;

export interface TrumpEval {
  readonly suit: Suit;
  readonly expectedTricks: number;
  readonly expectedPoints: number;
}

function valuesBySuit(hand: readonly Card[]): Map<Suit, number[]> {
  const m = new Map<Suit, number[]>();
  for (const s of SUITS) m.set(s, []);
  for (const c of hand) (m.get(c.suit) as number[]).push(c.value);
  for (const s of SUITS) (m.get(s) as number[]).sort((a, b) => b - a);
  return m;
}

/** Rough chance the contract team captures the red-0 trick (its +5). */
function redZeroProb(hand: readonly Card[], trump: Suit | null, tricks: number): number {
  const hasRed0 = hand.some(isRedZero);
  const hasRed7 = hand.some((c) => c.suit === 'red' && c.value === 7);
  if (hasRed0) return trump === 'red' || tricks >= 4 ? 0.75 : 0.55;
  if (hasRed7) return 0.6;
  return 0.3;
}

/**
 * Losing-trick count adapted to 8-rank suits: in each suit only the top
 * min(3, length) ranks matter — count how many of 7/6/5 (restricted to that
 * window) the hand is missing. A second, pessimistic lens on hand strength;
 * `evalTrump` never bids past it by more than `W.ltcSlack`.
 */
export function losingTrickCount(hand: readonly Card[]): number {
  const bySuit = valuesBySuit(hand);
  let losers = 0;
  for (const s of SUITS) {
    const vals = bySuit.get(s) as number[];
    const window = Math.min(3, vals.length);
    for (const top of [7, 6, 5].slice(0, window)) {
      if (!vals.includes(top)) losers += 1;
    }
  }
  return losers;
}

export function evalTrump(hand: readonly Card[], trump: Suit): TrumpEval {
  const bySuit = valuesBySuit(hand);
  const trumps = bySuit.get(trump) as number[];

  let tricks = 0;
  for (const v of trumps) {
    tricks += v === 7 ? W.trump7 : v === 6 ? W.trump6 : v === 5 ? W.trump5 : W.trumpOther;
  }
  tricks += Math.max(0, trumps.length - 3) * W.trumpLength;

  for (const s of SUITS) {
    if (s === trump) continue;
    const cards = bySuit.get(s) as number[];
    if (cards.includes(7)) tricks += W.side7;
    if (cards.includes(6)) tricks += cards.length >= 2 ? W.side6Guarded : W.side6Bare;
    if (trumps.length >= 3) {
      if (cards.length === 0) tricks += W.ruffVoid;
      else if (cards.length === 1) tricks += W.ruffSingleton;
    }
  }

  const ltcTricks = 8 - losingTrickCount(hand);
  const expectedTricks = Math.min(8, tricks, ltcTricks + W.ltcSlack);
  const pRed = redZeroProb(hand, trump, expectedTricks);
  const expectedPoints = expectedTricks + W.partner + 5 * pRed - W.brownPenalty;
  return { suit: trump, expectedTricks, expectedPoints };
}

export function bestTrump(hand: readonly Card[]): TrumpEval {
  let best = evalTrump(hand, SUITS[0]);
  for (const s of SUITS.slice(1)) {
    const e = evalTrump(hand, s);
    if (e.expectedPoints > best.expectedPoints) best = e;
  }
  return best;
}

export interface SansAtoutEval {
  readonly expectedPoints: number;
  readonly bosses: number;
  readonly suitsWithBoss: number;
  /** Suits headed by 7-6 — they can be run from the top without losing the lead. */
  readonly runningSuits: number;
  /** Suits holding cards but no stopper (no 7, no guarded 6) — fatal sans atout. */
  readonly unstopped: number;
}

/** Sans-atout needs top cards spread across suits — one long weak suit is fatal. */
export function evalSansAtout(hand: readonly Card[]): SansAtoutEval {
  const bySuit = valuesBySuit(hand);
  let bosses = 0;
  let suitsWithBoss = 0;
  let runningSuits = 0;
  let runBonus = 0;
  let unstopped = 0;
  for (const s of SUITS) {
    const vals = bySuit.get(s) as number[];
    let suitBoss = 0;
    if (vals.includes(7)) suitBoss += 1;
    if (vals.includes(6) && vals.includes(7)) suitBoss += 1;
    if (suitBoss > 0) suitsWithBoss += 1;
    bosses += suitBoss;
    if (vals.includes(7) && vals.includes(6)) {
      runningSuits += 1;
      // Consecutive top cards past 7-6 keep the run going: 7-6-5(-4…) never
      // surrenders the lead — the sans-atout tempo edge (declarer leads first).
      let next = 5;
      while (vals.includes(next)) {
        runBonus += W.saRunBonus;
        next -= 1;
      }
    }
    const stopped = vals.includes(7) || (vals.includes(6) && vals.length >= 2);
    if (vals.length > 0 && !stopped) unstopped += 1;
  }
  const pRed = Math.min(0.5, redZeroProb(hand, null, bosses));
  const expectedPoints = bosses * 1.05 + 1.0 + 5 * pRed + runBonus;
  return { expectedPoints, bosses, suitsWithBoss, runningSuits, unstopped };
}

export interface BidOpts {
  readonly margin: number;
  readonly allowSansAtout: boolean;
  readonly scoreAware: boolean;
  /** Extra value beyond partner's bid required to override it (Infinity = never). */
  readonly partnerOutbidMargin: number;
}

type PlainBid = Extract<BidChoice, { kind: 'bid' }>;

/**
 * Pick a bid: bid the *minimum* value that still wins the auction and stays
 * within the hand's ceiling — overbidding buys nothing given binary stakes.
 */
export function pickBid(view: SeatView, opts: BidOpts): BidChoice {
  const seat = view.viewer as Seat;
  const best = bestTrump(view.hand);
  const high = highestBid(view.bids);

  // Don't outbid our own partner unless the hand is clearly stronger.
  if (high !== null && teamOf(high.seat) === teamOf(seat)) {
    if (best.expectedPoints - opts.margin < high.value + opts.partnerOutbidMargin) {
      return { kind: 'pass' };
    }
  }

  let ceil = Math.floor(best.expectedPoints - opts.margin);
  if (opts.scoreAware) {
    const myTeam = teamOf(seat);
    const foeScore = view.scores[myTeam === 0 ? 1 : 0];
    if (foeScore >= 35) ceil += 1; // defenders keep points — fight for the contract
  }
  ceil = Math.min(12, ceil);
  if (ceil < 7) return { kind: 'pass' };

  const legal = legalBidChoices(view.bids).filter((c): c is PlainBid => c.kind === 'bid');
  const plain = legal
    .filter((c) => !c.sansAtout && c.value <= ceil)
    .sort((a, b) => a.value - b.value)[0];

  if (opts.allowSansAtout) {
    const sa = evalSansAtout(view.hand);
    const saCeil = Math.min(12, Math.floor(sa.expectedPoints - opts.margin));
    // An unstopped suit is an open runway for the defenders — never sans atout.
    // Spread bosses OR two running suits both qualify as control.
    const saShape = sa.unstopped === 0 && (sa.suitsWithBoss >= 3 || sa.runningSuits >= 2);
    if (saShape && saCeil >= 7) {
      const sans = legal
        // Never a 12 sans atout: it's the human "hail-mary" gamble that wins or
        // loses the whole game outright — a bot must not stumble into it.
        .filter((c) => c.sansAtout && c.value <= saCeil && c.value < 12)
        .sort((a, b) => a.value - b.value)[0];
      // Equal value sans-atout still doubles the stake, so prefer it.
      if (sans !== undefined && (plain === undefined || sans.value >= plain.value)) return sans;
    }
  }

  return plain ?? { kind: 'pass' };
}
