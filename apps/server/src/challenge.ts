import {
  CHALLENGE_BOT_DIFFICULTY,
  CHALLENGE_SEAT,
  applyAction,
  challengeBotSeed,
  createGame,
  mulberry32,
  viewFor,
  type Action,
  type ChallengeDeal,
  type GameState,
} from '@jaffre/engine';
import { chooseAction } from '@jaffre/bots';

/**
 * Deal Board verification — the server-authoritative half.
 *
 * The challenge is played entirely in the player's browser (practice mode), so
 * a submitted SCORE is just a claim. What is not a claim is the ACTION LOG:
 * the engine is a pure fold of (seed, actions), so re-running the log here
 * reproduces the game exactly and the score falls out of it.
 *
 * That alone would still leave a hole — a modified client could keep every one
 * of its own moves legal while making the BOTS throw the round. So this also
 * recomputes each bot move from the same policy and the same seeded rng, and
 * rejects the submission if a bot seat did anything other than what the bot
 * would have done. After that the only free choices in the log are the
 * player's own, which is exactly the game they were supposed to be playing.
 *
 * Kept pure (no DB, no env) so it is unit-testable like history.ts / awards.ts.
 */

/** A submission can't be longer than one round of legal play, with margin. */
const MAX_ACTIONS = 200;

const SEATS = [0, 1, 2, 3];
const BID_VALUES = [7, 8, 9, 10, 11, 12];
const CARD_SUITS = ['red', 'brown', 'green', 'blue'];
const CARD_VALUES = [0, 1, 2, 3, 4, 5, 6, 7];

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null;
}

/**
 * Parse an untrusted array into engine Actions, or null if ANY element is not
 * one.
 *
 * This exists because `applyAction` switches on `action.type` with no guard of
 * its own — a submitted `[null]` or `["hello"]` would throw a TypeError inside
 * the worker rather than being refused. The engine is entitled to assume
 * well-formed input; the wire boundary is where that gets established.
 */
export function parseActions(raw: unknown): Action[] | null {
  if (!Array.isArray(raw) || raw.length > MAX_ACTIONS) return null;
  const actions: Action[] = [];
  for (const item of raw) {
    if (!isRecord(item)) return null;
    if (item.type === 'continue') {
      actions.push({ type: 'continue' } as Action);
      continue;
    }
    if (typeof item.seat !== 'number' || !SEATS.includes(item.seat)) return null;
    if (item.type === 'place_bid') {
      const choice = item.choice;
      if (!isRecord(choice)) return null;
      if (choice.kind === 'pass') {
        actions.push({ type: 'place_bid', seat: item.seat, choice: { kind: 'pass' } } as Action);
        continue;
      }
      if (
        choice.kind !== 'bid' ||
        typeof choice.value !== 'number' ||
        !BID_VALUES.includes(choice.value) ||
        typeof choice.sansAtout !== 'boolean'
      ) {
        return null;
      }
      actions.push({
        type: 'place_bid',
        seat: item.seat,
        choice: { kind: 'bid', value: choice.value, sansAtout: choice.sansAtout },
      } as Action);
      continue;
    }
    if (item.type === 'play_card') {
      const card = item.card;
      if (
        !isRecord(card) ||
        typeof card.suit !== 'string' ||
        !CARD_SUITS.includes(card.suit) ||
        typeof card.value !== 'number' ||
        !CARD_VALUES.includes(card.value)
      ) {
        return null;
      }
      actions.push({
        type: 'play_card',
        seat: item.seat,
        card: { suit: card.suit, value: card.value },
      } as Action);
      continue;
    }
    return null;
  }
  return actions;
}

export type VerifyResult =
  | { readonly ok: true; readonly score: number; readonly tricks: number }
  | { readonly ok: false; readonly reason: VerifyFailure };

export type VerifyFailure =
  'too-long' | 'illegal-action' | 'wrong-seat' | 'bot-tampered' | 'unfinished';

/**
 * Re-play a submitted action log against the challenge's own deal.
 *
 * Returns the round's score for the player's team, or why the log was refused.
 * `score` is the team's point delta for the round — the same number the recap
 * shows, so what the board ranks is what the player saw.
 */
export function verifyChallengeRun(deal: ChallengeDeal, actions: readonly Action[]): VerifyResult {
  if (actions.length > MAX_ACTIONS) return { ok: false, reason: 'too-long' };

  let state: GameState = createGame(deal.seed);
  // The same stream, seeded the same way, consumed in the same order as the
  // client's — see challengeBotSeed. Only bot seats draw from it.
  const rng = mulberry32(challengeBotSeed(deal.seed));

  for (const action of actions) {
    // 'continue' would start a SECOND round; a challenge is one deal.
    if (action.type === 'continue') return { ok: false, reason: 'unfinished' };

    if (action.seat !== state.turn) return { ok: false, reason: 'wrong-seat' };

    if (action.seat !== CHALLENGE_SEAT) {
      // A bot seat: the move is not the player's to choose. Recompute it and
      // require an exact match, which is what stops a doctored client from
      // handing itself an easy round.
      const expected = chooseAction(viewFor(state, state.turn), rng, CHALLENGE_BOT_DIFFICULTY);
      if (expected === null) return { ok: false, reason: 'bot-tampered' };
      if (!sameAction(expected, action)) return { ok: false, reason: 'bot-tampered' };
    }

    const result = applyAction(state, action);
    if (!result.ok) return { ok: false, reason: 'illegal-action' };
    state = result.state;

    if (state.phase === 'round_over' || state.phase === 'game_over') break;
  }

  if (state.phase !== 'round_over' && state.phase !== 'game_over') {
    return { ok: false, reason: 'unfinished' };
  }

  const summary = state.roundSummaries[0];
  if (summary === undefined) return { ok: false, reason: 'unfinished' };
  const team = CHALLENGE_SEAT % 2;
  return {
    ok: true,
    score: summary.deltas[team] as number,
    tricks: summary.trickCounts?.[CHALLENGE_SEAT] ?? 0,
  };
}

/** Structural equality for the two action shapes a round can contain. */
function sameAction(a: Action, b: Action): boolean {
  if (a.type !== b.type) return false;
  if (a.type === 'place_bid' && b.type === 'place_bid') {
    if (a.choice.kind !== b.choice.kind) return false;
    if (a.choice.kind === 'pass' || b.choice.kind === 'pass') return true;
    return a.choice.value === b.choice.value && a.choice.sansAtout === b.choice.sansAtout;
  }
  if (a.type === 'play_card' && b.type === 'play_card') {
    return a.card.suit === b.card.suit && a.card.value === b.card.value;
  }
  return false;
}
