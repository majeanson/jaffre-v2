import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { applyAction, createGame } from '../src/reducer.js';
import { deserialize, serialize } from '../src/serialize.js';
import { ROUND_TOTAL_POINTS } from '../src/rules.js';
import type { Action, Card, GameState } from '../src/types.js';
import { cardId, SUITS, VALUES } from '../src/types.js';
import { playFullGame } from './helpers/driver.js';

/** All 32 cards must exist exactly once across hands, the live trick, and captured tricks. */
function assertCardConservation(state: GameState): void {
  const all: Card[] = [
    ...state.hands.flat(),
    ...state.currentTrick.map((p) => p.card),
    ...state.capturedTricks.flatMap((t) => [...t.cards]),
  ];
  expect(all).toHaveLength(32);
  expect(new Set(all.map(cardId)).size).toBe(32);
}

const arbSeed = fc.integer({ min: 0, max: 2 ** 31 - 1 });

const arbCard: fc.Arbitrary<Card> = fc.record({
  suit: fc.constantFrom(...SUITS),
  value: fc.constantFrom(...VALUES),
});

const arbAction: fc.Arbitrary<Action> = fc.oneof(
  fc.record({
    type: fc.constant('place_bid' as const),
    seat: fc.constantFrom(0 as const, 1 as const, 2 as const, 3 as const),
    choice: fc.oneof(
      fc.constant({ kind: 'pass' as const }),
      fc.record({
        kind: fc.constant('bid' as const),
        value: fc.constantFrom(
          7 as const,
          8 as const,
          9 as const,
          10 as const,
          11 as const,
          12 as const,
        ),
        sansAtout: fc.boolean(),
      }),
    ),
  }),
  fc.record({
    type: fc.constant('play_card' as const),
    seat: fc.constantFrom(0 as const, 1 as const, 2 as const, 3 as const),
    card: arbCard,
  }),
  fc.constant({ type: 'continue' as const }),
);

describe('engine invariants (property-based)', () => {
  it('random legal games: cards conserved, turns honored, rounds sum to 11, game terminates', () => {
    fc.assert(
      fc.property(arbSeed, (seed) => {
        const { final } = playFullGame(seed, (state, action, next) => {
          assertCardConservation(state);
          if (action.type !== 'continue') {
            expect(action.seat).toBe(state.turn);
          }
          for (const event of ['round_scored' as const]) void event;
          if (next.phase === 'round_over' || next.phase === 'game_over') {
            if (next.lastRoundSummary && next.lastRoundSummary.roundIndex === next.roundIndex) {
              const tp = next.lastRoundSummary.trickPoints;
              expect(tp[0] + tp[1]).toBe(ROUND_TOTAL_POINTS);
            }
          }
        });
        expect(final.phase).toBe('game_over');
      }),
      { numRuns: 25 },
    );
  });

  it('every reachable state serializes losslessly', () => {
    fc.assert(
      fc.property(arbSeed, (seed) => {
        const { states } = playFullGame(seed);
        // Sample states evenly rather than all (perf).
        const step = Math.max(1, Math.floor(states.length / 20));
        for (let i = 0; i < states.length; i += step) {
          const state = states[i] as GameState;
          expect(deserialize(serialize(state))).toEqual(state);
        }
      }),
      { numRuns: 10 },
    );
  });

  it('arbitrary (mostly illegal) actions never mutate state and never throw', () => {
    fc.assert(
      fc.property(arbSeed, fc.array(arbAction, { maxLength: 60 }), (seed, actions) => {
        let state = createGame(seed);
        for (const action of actions) {
          const before = structuredClone(state);
          const result = applyAction(state, action);
          if (result.ok) {
            state = result.state;
          } else {
            expect(state).toEqual(before);
            expect(result.error.code).toBeTruthy();
          }
        }
        assertCardConservation(state);
      }),
      { numRuns: 200 },
    );
  });
});
