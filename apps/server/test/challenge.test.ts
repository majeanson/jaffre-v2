import { describe, expect, it } from 'vitest';
import {
  CHALLENGE_BOT_DIFFICULTY,
  CHALLENGE_SEAT,
  applyAction,
  challengeBotSeed,
  challengeById,
  challengeIsOpen,
  createGame,
  dailyChallenge,
  mulberry32,
  utcDayKey,
  utcWeekKey,
  viewFor,
  weeklyChallenge,
  type Action,
  type ChallengeDeal,
} from '@jaffre/engine';
import { chooseAction } from '@jaffre/bots';
import { parseActions, verifyChallengeRun } from '../src/challenge.js';

/**
 * Deal Board verification. The board is only worth having if a score cannot be
 * invented, so these tests are mostly about REJECTION: an honest run must pass,
 * and every way of faking one must not.
 */

/** Play an honest challenge run exactly as the client does. */
function honestRun(deal: ChallengeDeal): Action[] {
  const rng = mulberry32(challengeBotSeed(deal.seed));
  let state = createGame(deal.seed);
  const actions: Action[] = [];
  for (let guard = 0; guard < 200; guard++) {
    if (state.phase === 'round_over' || state.phase === 'game_over') break;
    // Every seat — including the player's — is driven by the bot policy here.
    // The player's own moves are free choices; using the bot for them just
    // makes the fixture a legal run.
    const action = chooseAction(viewFor(state, state.turn), rng, CHALLENGE_BOT_DIFFICULTY);
    if (action === null) break;
    const result = applyAction(state, action);
    if (!result.ok) break;
    actions.push(action);
    state = result.state;
  }
  return actions;
}

const DEAL = dailyChallenge(Date.UTC(2026, 6, 28));

describe('challenge derivation', () => {
  it('derives the same deal from an id as from the clock', () => {
    const again = challengeById(DEAL.id);
    expect(again).toEqual(DEAL);
  });

  it('gives every day its own deal', () => {
    const a = dailyChallenge(Date.UTC(2026, 6, 28));
    const b = dailyChallenge(Date.UTC(2026, 6, 29));
    expect(a.seed).not.toBe(b.seed);
    expect(a.id).not.toBe(b.id);
  });

  it('gives every player the same deal within a UTC day', () => {
    // Two very different local times inside one UTC day must agree — a daily
    // that rolls over per timezone is not a shared daily.
    const morning = dailyChallenge(Date.UTC(2026, 6, 28, 0, 5));
    const night = dailyChallenge(Date.UTC(2026, 6, 28, 23, 55));
    expect(morning.seed).toBe(night.seed);
  });

  it('ships three distinct weekly deals', () => {
    const week = weeklyChallenge(Date.UTC(2026, 6, 28));
    expect(week).toHaveLength(3);
    expect(new Set(week.map((d) => d.seed)).size).toBe(3);
    for (const d of week) expect(challengeById(d.id)).toEqual(d);
  });

  it('keeps ISO week keys stable across a year boundary', () => {
    // 2026-12-31 is a Thursday, so it belongs to ISO week 53 of 2026 along
    // with 2027-01-01 — the case a naive day/7 would split in two.
    expect(utcWeekKey(Date.UTC(2026, 11, 31))).toBe(utcWeekKey(Date.UTC(2027, 0, 1)));
  });

  it('rejects a malformed or unknown id', () => {
    for (const id of ['', 'x', 'd-2026-7-28', 'w-2026-W31-9', 'd-not-a-date']) {
      expect(challengeById(id), id).toBeNull();
    }
  });

  it('is open only during its own period', () => {
    const now = Date.UTC(2026, 6, 28, 12);
    expect(challengeIsOpen(DEAL, now)).toBe(true);
    expect(challengeIsOpen(DEAL, Date.UTC(2026, 6, 29, 12))).toBe(false);
    expect(utcDayKey(now)).toBe('2026-07-28');
  });
});

describe('verifying a submitted run', () => {
  it('accepts an honest run and scores it from the round summary', () => {
    const actions = honestRun(DEAL);
    const result = verifyChallengeRun(DEAL, actions);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(Number.isFinite(result.score)).toBe(true);
      expect(result.tricks).toBeGreaterThanOrEqual(0);
    }
  });

  it('is deterministic — the same run always scores the same', () => {
    const actions = honestRun(DEAL);
    expect(verifyChallengeRun(DEAL, actions)).toEqual(verifyChallengeRun(DEAL, actions));
  });

  it('rejects a run against a DIFFERENT deal', () => {
    // The log is only meaningful for the deal it was played on; replaying
    // someone else's good run against today's deal must not score.
    const other = dailyChallenge(Date.UTC(2026, 6, 29));
    const result = verifyChallengeRun(other, honestRun(DEAL));
    expect(result.ok).toBe(false);
  });

  it('rejects a truncated run', () => {
    const actions = honestRun(DEAL);
    const result = verifyChallengeRun(DEAL, actions.slice(0, actions.length - 3));
    expect(result).toEqual({ ok: false, reason: 'unfinished' });
  });

  it('rejects an out-of-turn action', () => {
    const actions = honestRun(DEAL);
    const tampered = [...actions];
    const first = tampered[0] as Action & { seat: number };
    tampered[0] = { ...first, seat: ((first.seat + 1) % 4) as 0 | 1 | 2 | 3 } as Action;
    const result = verifyChallengeRun(DEAL, tampered);
    expect(result.ok).toBe(false);
  });

  it('rejects a run where a BOT seat was made to play differently', () => {
    // THE attack this exists to stop: keep all your own moves legal, but make
    // the opposition throw the round. Every bot move is recomputed, so any
    // substitution is caught even when it is a perfectly legal card.
    const actions = honestRun(DEAL);
    const botIndex = actions.findIndex((a) => a.type === 'play_card' && a.seat !== CHALLENGE_SEAT);
    expect(botIndex).toBeGreaterThanOrEqual(0);

    // Find a DIFFERENT legal card for that bot seat by replaying to that point.
    let state = createGame(DEAL.seed);
    for (let i = 0; i < botIndex; i++) {
      const r = applyAction(state, actions[i] as Action);
      if (!r.ok) throw new Error('fixture broke');
      state = r.state;
    }
    const played = actions[botIndex] as Action & { card: { suit: string; value: number } };
    const hand = state.hands[state.turn] ?? [];
    const alternative = hand.find(
      (c) => !(c.suit === played.card.suit && c.value === played.card.value),
    );
    // Only meaningful if the bot actually had a choice at this point.
    if (alternative === undefined) return;

    const tampered = [...actions];
    tampered[botIndex] = { ...played, card: alternative } as Action;
    const result = verifyChallengeRun(DEAL, tampered);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      // Either the substitution was illegal outright, or it was legal but not
      // what the bot would have chosen — both are refusals, and the second is
      // the one that matters.
      expect(['bot-tampered', 'illegal-action']).toContain(result.reason);
    }
  });

  it('ignores anything padded on after the round ends', () => {
    // Verification stops at round_over, so a log with a second round bolted on
    // scores exactly the same as the honest run it starts with — the padding
    // is inert rather than a way to keep playing for a better number.
    const actions = honestRun(DEAL);
    const padded = verifyChallengeRun(DEAL, [
      ...actions,
      { type: 'continue' } as Action,
      ...actions,
    ]);
    expect(padded).toEqual(verifyChallengeRun(DEAL, actions));
  });

  it('refuses malformed input at the parse boundary, without reaching the engine', () => {
    // applyAction switches on `action.type` with no guard of its own, so
    // anything that isn't a real action has to be refused BEFORE it gets
    // there — otherwise this is a 500, not a 400.
    for (const bad of [
      null,
      'not-an-array',
      [null],
      ['play_card'],
      [{}],
      [{ type: 'nope', seat: 0 }],
      [{ type: 'play_card', seat: 9, card: { suit: 'red', value: 1 } }],
      [{ type: 'play_card', seat: 0, card: { suit: 'purple', value: 1 } }],
      [{ type: 'play_card', seat: 0, card: { suit: 'red', value: 99 } }],
      [{ type: 'play_card', seat: 0 }],
      [{ type: 'place_bid', seat: 0 }],
      [{ type: 'place_bid', seat: 0, choice: { kind: 'bid', value: 99, sansAtout: false } }],
      [{ type: 'place_bid', seat: 0, choice: { kind: 'bid', value: 8 } }],
    ]) {
      expect(parseActions(bad), JSON.stringify(bad)).toBeNull();
    }
  });

  it('accepts the shapes a real run contains', () => {
    const actions = honestRun(DEAL);
    const parsed = parseActions(JSON.parse(JSON.stringify(actions)));
    expect(parsed).not.toBeNull();
    // Round-trips through JSON exactly, so a parsed run scores like the original.
    expect(verifyChallengeRun(DEAL, parsed as Action[])).toEqual(verifyChallengeRun(DEAL, actions));
  });

  it('refuses an absurdly long log without replaying it', () => {
    const filler = Array.from({ length: 500 }, () => ({ type: 'continue' }) as Action);
    expect(verifyChallengeRun(DEAL, filler)).toEqual({ ok: false, reason: 'too-long' });
  });
});
