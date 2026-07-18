import type { Card, GameState, Rng, Seat, SeatView, Suit } from '@jaffre/engine';
import { applyAction, legalCards, sameCard, teamOf, viewFor } from '@jaffre/engine';
import { equivalenceRuns, inferredVoids, outstanding } from './analysis.js';
import { heuristicCard } from './heuristics.js';

/**
 * Hard's search: when several genuinely different moves survive the heuristic
 * filter, weigh them with bounded determinized rollouts — deal the hidden cards
 * consistently with what we've deduced, play the round out with the Normal
 * policy, and keep the move with the best average outcome.
 */

const ROLLOUTS_PER_MOVE = 20;
const MAX_CANDIDATES = 4;
const DEAL_ATTEMPTS = 50;
/** Rollouts only earn their keep once the hidden hands are small enough to
 * sample meaningfully — the endgame. Earlier, the Hard heuristic leads and
 * search would be both slow and near-random over ~24 unknown cards. */
const ROLLOUT_MAX_UNSEEN = 12;
const ZERO_RNG: Rng = () => 0; // deterministic playouts; variety comes from the deals

export function hardCard(view: SeatView, rng: Rng): Card {
  const led = view.currentTrick[0]?.card.suit ?? null;
  const legal = legalCards(view.hand, led);
  if (legal.length === 1) return legal[0] as Card;

  if (outstanding(view).length > ROLLOUT_MAX_UNSEEN) return heuristicCard(view, rng, 'hard');

  const candidates = candidateMoves(view, legal);
  if (candidates.length === 1) return candidates[0] as Card;

  return rolloutBest(view, candidates, rng);
}

/** Distinct moves worth simulating: collapse cards that are strategically equal
 * (adjacent ranks with no outstanding card between them), anchor on the Hard
 * heuristic's pick, and cap the fan-out. */
function candidateMoves(view: SeatView, legal: readonly Card[]): Card[] {
  // cheapest of each equivalence run
  const reps: Card[] = equivalenceRuns(legal, view).map((run) => run[0] as Card);

  const anchor = heuristicCard(view, ZERO_RNG, 'hard');
  const ordered = [anchor, ...reps.filter((c) => !sameCard(c, anchor))];
  const uniq: Card[] = [];
  for (const c of ordered) if (!uniq.some((u) => sameCard(u, c))) uniq.push(c);
  return uniq.slice(0, MAX_CANDIDATES);
}

function rolloutBest(view: SeatView, candidates: readonly Card[], rng: Rng): Card {
  const mySeat = view.viewer as Seat;
  let best = candidates[0] as Card;
  let bestScore = -Infinity;

  for (const cand of candidates) {
    let sum = 0;
    let n = 0;
    for (let k = 0; k < ROLLOUTS_PER_MOVE; k++) {
      const hands = determinize(view, rng);
      const start = applyAction(reconstruct(view, hands), {
        type: 'play_card',
        seat: mySeat,
        card: cand,
      });
      if (!start.ok) continue;
      const score = playout(start.state, mySeat);
      if (!Number.isNaN(score)) {
        sum += score;
        n += 1;
      }
    }
    const avg = n > 0 ? sum / n : -Infinity;
    if (avg > bestScore) {
      bestScore = avg;
      best = cand;
    }
  }
  return best;
}

/** Deal the outstanding cards to the three hidden hands, respecting hand sizes
 * and every inferred void; fall back to void-blind dealing if constraints jam. */
function determinize(view: SeatView, rng: Rng): Card[][] {
  const seat = view.viewer as Seat;
  const others = ([0, 1, 2, 3] as Seat[]).filter((s) => s !== seat);
  const voids = inferredVoids(view);
  const pool = outstanding(view);
  const eligibleSeats = (suit: Suit): Seat[] => others.filter((s) => !voids.has(`${s}:${suit}`));

  for (let attempt = 0; attempt < DEAL_ATTEMPTS; attempt++) {
    const need: Record<number, number> = {};
    const assign: Record<number, Card[]> = {};
    for (const s of others) {
      need[s] = view.handCounts[s];
      assign[s] = [];
    }
    // Most-constrained cards first (fewest seats that can legally hold them).
    const cards = shuffle(pool, rng).sort(
      (a, b) => eligibleSeats(a.suit).length - eligibleSeats(b.suit).length,
    );

    let ok = true;
    for (const c of cards) {
      const elig = others.filter((s) => (need[s] as number) > 0 && !voids.has(`${s}:${c.suit}`));
      if (elig.length === 0) {
        ok = false;
        break;
      }
      const pick = elig[Math.floor(rng() * elig.length)] as Seat;
      (assign[pick] as Card[]).push(c);
      need[pick] = (need[pick] as number) - 1;
    }
    if (ok) return assembleHands(view, seat, others, assign);
  }

  // Fallback: partition by hand size only.
  const cards = shuffle(pool, rng);
  const assign: Record<number, Card[]> = {};
  let k = 0;
  for (const s of others) {
    assign[s] = cards.slice(k, k + view.handCounts[s]);
    k += view.handCounts[s];
  }
  return assembleHands(view, seat, others, assign);
}

function assembleHands(
  view: SeatView,
  seat: Seat,
  others: readonly Seat[],
  assign: Record<number, Card[]>,
): Card[][] {
  const hands: Card[][] = [[], [], [], []];
  hands[seat] = [...view.hand];
  for (const s of others) hands[s] = assign[s] as Card[];
  return hands;
}

function shuffle(cards: readonly Card[], rng: Rng): Card[] {
  const a = [...cards];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const t = a[i] as Card;
    a[i] = a[j] as Card;
    a[j] = t;
  }
  return a;
}

function reconstruct(view: SeatView, hands: Card[][]): GameState {
  return {
    schemaVersion: 1,
    seed: 0,
    phase: 'playing',
    roundIndex: view.roundIndex,
    dealer: view.dealer,
    turn: view.viewer as Seat,
    hands,
    bids: view.bids,
    contract: view.contract,
    trump: view.trump,
    trumpDecided: view.trumpDecided,
    currentTrick: view.currentTrick,
    trickLeader: view.trickLeader,
    capturedTricks: view.capturedTricks,
    roundPoints: view.roundPoints,
    scores: view.scores,
    lastRoundSummary: null,
    roundSummaries: [],
    winner: null,
    rules: view.rules,
  };
}

/** Play the round to its end with the Normal policy for all seats. */
function playout(state: GameState, mySeat: Seat): number {
  let st = state;
  let guard = 0;
  while (st.phase === 'playing' && guard++ < 40) {
    const v = viewFor(st, st.turn);
    const card = heuristicCard(v, ZERO_RNG, 'normal');
    const r = applyAction(st, { type: 'play_card', seat: st.turn, card });
    if (!r.ok) return NaN;
    st = r.state;
  }
  return scoreOutcome(st, mySeat);
}

/** Declarers care only about making the contract (binary); defenders maximize
 * the points they keep and love setting the contract. */
function scoreOutcome(state: GameState, mySeat: Seat): number {
  if (state.contract === null) return 0;
  const decTeam = teamOf(state.contract.seat);
  const myTeam = teamOf(mySeat);
  const made = state.roundPoints[decTeam] >= state.contract.value;
  if (myTeam === decTeam) return made ? 1 : -1;
  return state.roundPoints[myTeam] / 11 + (made ? 0 : 1);
}
