import { expect } from 'vitest';
import type { Action, BidChoice, Card, GameState, Rng } from '../../src/index.js';
import {
  applyAction,
  createGame,
  legalBidChoices,
  legalCards,
  mulberry32,
} from '../../src/index.js';

export function randomAction(state: GameState, rng: Rng): Action {
  if (state.phase === 'bidding') {
    // Realistic auction: mostly pass, and prefer low bids. Uniformly random
    // bidding overbids (12s) so heavily that scores drift negative and games
    // never reach 41 — real players pass most of the time.
    //
    // The rate is calibrated to the scoring, not decorative: a missed contract
    // costs the bidders `stake` while the defenders bank what they took, so
    // when the pool shrank from 11 points to 10 (brown 0 went −2 → −3), 0.8
    // tipped past the convergence threshold — 11 of 1000 seeds then blew past
    // MAX_ACTIONS. At 0.85 the model settles at ~26 rounds/game and a worst
    // case of ~9.6k actions, comfortably inside the cap. Measured, not guessed.
    //
    // The dealer flag is the matching privilege: bidding last, the dealer may
    // take the contract by equalling the standing bid instead of climbing it.
    const choices = legalBidChoices(state.bids, state.turn === state.dealer);
    const bidsOnly = choices.filter((c) => c.kind === 'bid');
    const choice: BidChoice =
      rng() < 0.85 || bidsOnly.length === 0
        ? { kind: 'pass' }
        : (bidsOnly[Math.floor(rng() ** 2 * bidsOnly.length)] as BidChoice);
    return { type: 'place_bid', seat: state.turn, choice };
  }
  if (state.phase === 'playing') {
    const hand = state.hands[state.turn] as readonly Card[];
    const led = state.currentTrick[0]?.card.suit ?? null;
    const legal = legalCards(hand, led);
    const card = legal[Math.floor(rng() * legal.length)] as Card;
    return { type: 'play_card', seat: state.turn, card };
  }
  return { type: 'continue' };
}

export interface PlayedGame {
  readonly seed: number;
  readonly actions: Action[];
  readonly states: GameState[];
  readonly final: GameState;
}

const MAX_ACTIONS = 40_000; // safety cap far above any real game

/** Play random legal actions until game_over; asserts every action is accepted. */
export function playFullGame(
  seed: number,
  onStep?: (state: GameState, action: Action, next: GameState) => void,
): PlayedGame {
  const rng = mulberry32(seed ^ 0x5eed);
  let state = createGame(seed);
  const actions: Action[] = [];
  const states: GameState[] = [state];
  while (state.phase !== 'game_over') {
    expect(actions.length).toBeLessThan(MAX_ACTIONS);
    const action = randomAction(state, rng);
    const result = applyAction(state, action);
    expect(result.ok, `${action.type} rejected: ${JSON.stringify(result)}`).toBe(true);
    if (!result.ok) break;
    onStep?.(state, action, result.state);
    state = result.state;
    actions.push(action);
    states.push(state);
  }
  return { seed, actions, states, final: state };
}

/** Drive a fresh game through bidding with the given choices (in turn order). */
export function bidPhase(seed: number, choices: BidChoice[]): GameState {
  let state = createGame(seed);
  for (const choice of choices) {
    const result = applyAction(state, { type: 'place_bid', seat: state.turn, choice });
    expect(result.ok).toBe(true);
    if (result.ok) state = result.state;
  }
  return state;
}

export const PASS: BidChoice = { kind: 'pass' };
export function bid(value: 7 | 8 | 9 | 10 | 11 | 12, sansAtout = false): BidChoice {
  return { kind: 'bid', value, sansAtout };
}
