import { SELF } from 'cloudflare:test';
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
import { bestDailyStreak, dailyStreak } from '../src/routes/dealBoard.js';
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

/**
 * The endpoints. Everything above proves the verifier is right; this proves the
 * route around it is — which is where a correct verifier can still be reached
 * with the wrong status code, or not reached at all.
 *
 * `dailyChallenge(Date.now())` rather than the frozen DEAL above: only the open
 * period takes scores, so the happy path has to use the challenge that is
 * actually open while the test runs.
 */
describe('POST /api/challenge/submit', () => {
  const submit = (userId: string, body: unknown) =>
    SELF.fetch(`https://example.com/api/challenge/submit?u=${userId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

  it('accepts an honest run, and takes only the first attempt', async () => {
    const today = dailyChallenge(Date.now());
    const actions = honestRun(today);
    const expected = verifyChallengeRun(today, actions);
    expect(expected.ok).toBe(true);

    const first = await submit('ch-alice', { challengeId: today.id, actions });
    expect(first.status).toBe(200);
    const got = (await first.json()) as { accepted: boolean; score: number; tricks: number };
    expect(got.accepted).toBe(true);
    // The score is the verifier's, never the client's — there is no score field
    // in the request at all.
    expect(got.score).toBe(expected.ok ? expected.score : NaN);

    // Second attempt: recorded once, and the stored score stands. "Best of many
    // tries" must not quietly become the game.
    const again = await submit('ch-alice', { challengeId: today.id, actions });
    expect(again.status).toBe(200);
    const twice = (await again.json()) as { accepted: boolean; score: number };
    expect(twice.accepted).toBe(false);
    expect(twice.score).toBe(got.score);
  });

  it('refuses a closed challenge with 409', async () => {
    const old = dailyChallenge(Date.UTC(2025, 0, 2));
    const res = await submit('ch-bob', { challengeId: old.id, actions: honestRun(old) });
    expect(res.status).toBe(409);
  });

  it('400s an unknown challenge id, a missing id and malformed actions', async () => {
    const today = dailyChallenge(Date.now());
    expect((await submit('ch-bob', { challengeId: 'd-not-a-date', actions: [] })).status).toBe(400);
    expect((await submit('ch-bob', { actions: [] })).status).toBe(400);
    expect((await submit('ch-bob', { challengeId: today.id, actions: [null] })).status).toBe(400);
    expect((await submit('ch-bob', { challengeId: today.id, actions: 'nope' })).status).toBe(400);
  });

  it('422s a run the verifier rejects, and records nothing', async () => {
    const today = dailyChallenge(Date.now());
    // A single legal-SHAPED action that is not what the game allows here.
    const res = await submit('ch-carol', {
      challengeId: today.id,
      actions: [{ type: 'play_card', seat: 0, card: { suit: 'red', value: 0 } }],
    });
    expect(res.status).toBe(422);
    expect((await res.json()) as { reason: string }).toHaveProperty('reason');

    const board = (await (
      await SELF.fetch(`https://example.com/api/challenge?id=${today.id}&u=ch-carol`)
    ).json()) as { you: unknown };
    expect(board.you).toBeNull();
  });

  it('400s a request with no user at all', async () => {
    const today = dailyChallenge(Date.now());
    const res = await SELF.fetch('https://example.com/api/challenge/submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ challengeId: today.id, actions: [] }),
    });
    expect(res.status).toBe(400);
  });
});

describe('GET /api/challenge', () => {
  it(`serves today's deal when no id is given`, async () => {
    const res = await SELF.fetch('https://example.com/api/challenge');
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      challenge: { id: string; cadence: string; seed: number };
      board: unknown[];
      you: unknown;
    };
    expect(body.challenge.id).toBe(dailyChallenge(Date.now()).id);
    expect(body.challenge.cadence).toBe('daily');
    expect(Array.isArray(body.board)).toBe(true);
    // Anonymous: a board, but no row of your own.
    expect(body.you).toBeNull();
  });

  it('400s an unknown id', async () => {
    const res = await SELF.fetch('https://example.com/api/challenge?id=d-not-a-date');
    expect(res.status).toBe(400);
  });

  it('gives a scored player their own row and rank', async () => {
    const today = dailyChallenge(Date.now());
    await SELF.fetch('https://example.com/api/challenge/submit?u=ch-dave', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ challengeId: today.id, actions: honestRun(today) }),
    });
    const res = await SELF.fetch(`https://example.com/api/challenge?id=${today.id}&u=ch-dave`);
    const body = (await res.json()) as {
      board: { id: string; score: number; rank: number }[];
      you: { id: string; score: number; rank: number } | null;
    };
    expect(body.you).not.toBeNull();
    expect(body.you?.rank).toBeGreaterThanOrEqual(1);
    expect(body.board.length).toBeGreaterThanOrEqual(1);
    // Never the raw uid on the wire — the board is public.
    for (const row of body.board) expect(row.id).not.toBe('ch-dave');
    expect(body.you?.id).not.toBe('ch-dave');
  });

  /**
   * `streak` on the board response — the server half of D2. Shape, not just
   * presence: `dailyStreak`/`bestDailyStreak` above prove the arithmetic, this
   * proves the route actually wires BOTH numbers onto the response instead of
   * just the live one.
   */
  it('reports the streak as { current, best }, not a bare number', async () => {
    const today = dailyChallenge(Date.now());
    await SELF.fetch('https://example.com/api/challenge/submit?u=ch-streak', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ challengeId: today.id, actions: honestRun(today) }),
    });
    const res = await SELF.fetch(`https://example.com/api/challenge?id=${today.id}&u=ch-streak`);
    const body = (await res.json()) as { streak?: { current: number; best: number } };
    expect(body.streak).toEqual({ current: 1, best: 1 });
  });

  it('reports 0 streak for an anonymous or unscored caller', async () => {
    const today = dailyChallenge(Date.now());
    const res = await SELF.fetch(`https://example.com/api/challenge?id=${today.id}`);
    const body = (await res.json()) as { streak?: { current: number; best: number } };
    expect(body.streak).toEqual({ current: 0, best: 0 });
  });
});

describe('submit rate limiting', () => {
  it('stops a user hammering the verifier, and says 429', async () => {
    // Rejected runs insert nothing, so the score PK does not slow them down at
    // all — this counter is the only thing that does. Drive one user past the
    // daily cap with runs the verifier refuses, and check the answer changes
    // from "no" to "not today".
    const today = dailyChallenge(Date.now());
    const junk = { challengeId: today.id, actions: [{ type: 'continue' }] };
    const post = () =>
      SELF.fetch('https://example.com/api/challenge/submit?u=ch-flood', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(junk),
      });

    const statuses: number[] = [];
    for (let i = 0; i < 42; i++) statuses.push((await post()).status);

    // The first ones are refused on their merits (the log is not a finished
    // round), not by the limiter.
    expect(statuses[0]).toBe(422);
    expect(statuses.at(-1)).toBe(429);
    expect(statuses.filter((s) => s === 429).length).toBeGreaterThan(0);
    // And the cap is not so tight that an honest handful of tries trips it.
    expect(statuses.slice(0, 10).every((s) => s === 422)).toBe(true);
  });

  it('does not spend another user quota', async () => {
    const today = dailyChallenge(Date.now());
    const res = await SELF.fetch('https://example.com/api/challenge/submit?u=ch-bystander', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ challengeId: today.id, actions: honestRun(today) }),
    });
    expect(res.status).toBe(200);
  });
});

/**
 * The daily streak is DERIVED from the rows already in challenge_scores — no
 * counter, no column, nothing to migrate or repair, and retroactive for
 * everyone who ever played. Same house rule as XP and cosmetic unlocks.
 */
describe('dailyStreak', () => {
  const DAY = 86_400_000;
  const NOW = Date.UTC(2026, 6, 29, 12);
  const keys = (...offsets: number[]) => new Set(offsets.map((d) => utcDayKey(NOW - d * DAY)));

  it('counts consecutive days ending today', () => {
    expect(dailyStreak(keys(0, 1, 2), NOW)).toBe(3);
  });

  it('stays alive when today is still unplayed but yesterday was', () => {
    // Today's hand is ahead of you, not missed. Reading "0" before you have
    // had the chance to play would be both wrong and discouraging.
    expect(dailyStreak(keys(1, 2, 3), NOW)).toBe(3);
  });

  it('breaks once a whole day has gone by unplayed', () => {
    // Nothing today and nothing yesterday — the run is over regardless of how
    // long it was before that.
    expect(dailyStreak(keys(2, 3, 4), NOW)).toBe(0);
  });

  it('stops at the first gap rather than counting every day ever played', () => {
    expect(dailyStreak(keys(0, 1, 3, 4, 5), NOW)).toBe(2);
  });

  it('is 0 for someone who has never posted a daily', () => {
    expect(dailyStreak(new Set(), NOW)).toBe(0);
  });

  it('counts a single day as a streak of 1', () => {
    expect(dailyStreak(keys(0), NOW)).toBe(1);
  });
});

/**
 * The longest run ever, independent of whether the LIVE streak (dailyStreak,
 * above) is still alive. Same derivation rule: no counter, computed straight
 * from the day keys already in challenge_scores.
 */
describe('bestDailyStreak', () => {
  const DAY = 86_400_000;
  const NOW = Date.UTC(2026, 6, 29, 12);
  const keys = (...offsets: number[]) => new Set(offsets.map((d) => utcDayKey(NOW - d * DAY)));

  it('is 0 for someone who has never posted a daily', () => {
    expect(bestDailyStreak(new Set())).toBe(0);
  });

  it('counts a single day as a best run of 1', () => {
    expect(bestDailyStreak(keys(0))).toBe(1);
  });

  it('finds the longest run even when it is not the most recent one', () => {
    // A 3-day run long ago, a gap, then today alone — the LIVE streak here is
    // 1, but the best-ever run is still 3.
    expect(bestDailyStreak(keys(0, 10, 11, 12))).toBe(3);
  });

  it('stays the longest run after it breaks — the whole point of "best"', () => {
    // Same shape as dailyStreak's "breaks once a whole day has gone by
    // unplayed" case: dailyStreak(keys(2, 3, 4), NOW) is 0, but the 3-day run
    // that happened must still read as the best one, not vanish with it.
    expect(dailyStreak(keys(2, 3, 4), NOW)).toBe(0);
    expect(bestDailyStreak(keys(2, 3, 4))).toBe(3);
  });

  it('is order-independent — the Set is unsorted going in', () => {
    expect(bestDailyStreak(keys(5, 0, 3, 1, 4, 2))).toBe(6);
  });
});
