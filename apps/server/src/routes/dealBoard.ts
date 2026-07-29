/**
 * The Deal Board: submitting a run at a daily/weekly challenge, and reading
 * the standings for one.
 *
 * The score is never taken from the client — a submitted action log is folded
 * back through the engine and every bot move recomputed (see
 * `src/challenge.ts`), so a doctored client can fail verification but cannot
 * claim a score it didn't earn.
 */
import { challengeById, challengeIsOpen, dailyChallenge, utcDayKey } from '@jaffre/engine';
import { parseActions, verifyChallengeRun } from '../challenge.js';
import type { Env } from '../env.js';
import { displayName, publicId } from '../publicId.js';
import { noDb, resolveUserId } from './http.js';

/** How many rows a Deal Board shows. */
const BOARD_LIMIT = 20;

const DAY_MS = 86_400_000;

/**
 * Consecutive days ending today (or yesterday) on which this player posted a
 * daily score.
 *
 * Derived from the rows already in `challenge_scores` — no counter, no new
 * column, nothing to migrate or repair, and it is retroactive for everyone
 * who ever played. Same house rule as XP and every cosmetic unlock: the games
 * table is the single source.
 *
 * A streak counts as alive when TODAY is unplayed but yesterday was — today's
 * hand is still ahead of you, and reading "0" before you have had the chance
 * to play would be both wrong and discouraging. It only breaks once a whole
 * day has gone by unplayed.
 */
export function dailyStreak(playedDayKeys: ReadonlySet<string>, nowMs: number): number {
  const start = playedDayKeys.has(utcDayKey(nowMs)) ? 0 : 1;
  if (start === 1 && !playedDayKeys.has(utcDayKey(nowMs - DAY_MS))) return 0;
  let n = 0;
  for (let i = start; playedDayKeys.has(utcDayKey(nowMs - i * DAY_MS)); i++) n++;
  return n;
}

/** The day keys this player has a DAILY score for. Weeklies share the table
 * but have their own id prefix, so they can't inflate a daily streak. */
async function playedDailyKeys(db: D1Database, userId: string): Promise<Set<string>> {
  try {
    const rows = await db
      .prepare(
        "SELECT challenge_id FROM challenge_scores WHERE user_id = ?1 AND challenge_id LIKE 'd-%'",
      )
      .bind(userId)
      .all<{ challenge_id: string }>();
    // 'd-2026-07-28' → '2026-07-28'.
    return new Set(rows.results.map((r) => r.challenge_id.slice(2)));
  } catch (err) {
    // Best-effort: a streak is a flourish, never a reason to fail the board.
    console.error('[challenge] streak read failed', err);
    return new Set();
  }
}

/**
 * How many run VERIFICATIONS one user may ask for in a UTC day.
 *
 * Verification is the expensive endpoint: it folds a whole action log through
 * the engine and recomputes every bot move to prove none were tampered with.
 * The challenge_scores PRIMARY KEY already refuses a second SCORE, so honest
 * play needs one call per open challenge (a daily plus three weeklies, times a
 * retry or two after a dropped response). Rejected runs record nothing, which
 * is exactly why they could otherwise be repeated without limit — so the
 * counter sits on the attempt, not on the result.
 *
 * Set well above any honest day and well below "free CPU".
 */
const CHALLENGE_VERIFY_PER_DAY = 40;

/**
 * Count this attempt and say whether it is over the cap.
 *
 * The upsert both increments and reports in one statement, so two tabs racing
 * cannot each read "under the cap" and both proceed. Degrades OPEN on a DB
 * error: a counter that is unavailable must not become an outage for people
 * trying to play today's hand.
 */
async function overVerifyCap(db: D1Database, userId: string): Promise<boolean> {
  try {
    const row = await db
      .prepare(
        `INSERT INTO challenge_attempts (user_id, day_key, n) VALUES (?1, ?2, 1)
           ON CONFLICT (user_id, day_key) DO UPDATE SET n = n + 1
         RETURNING n`,
      )
      .bind(userId, utcDayKey(Date.now()))
      .first<{ n: number }>();
    return (row?.n ?? 0) > CHALLENGE_VERIFY_PER_DAY;
  } catch (err) {
    console.error('[challenge] attempt counter failed', err);
    return false;
  }
}

/**
 * POST /api/challenge/submit { challengeId, actions } → { score, tricks, rank }.
 *
 * The score is NOT taken from the client. The action log is re-played against
 * the challenge's own derived deal, every bot move is recomputed and compared,
 * and the score is read out of the resulting round summary (see
 * src/challenge.ts). A doctored client can therefore submit a log that fails
 * verification, but not a score it didn't earn.
 *
 * One attempt per challenge: the table's PRIMARY KEY refuses a second, so
 * "best of many tries" can't quietly become the game.
 */
export async function handleChallengeSubmit(
  request: Request,
  env: Env,
  url: URL,
): Promise<Response> {
  const db = env.DB;
  if (db === undefined) return noDb();
  const userId = await resolveUserId(request, env, url);
  if (userId === undefined) return Response.json({ error: 'Invalid token' }, { status: 401 });
  if (userId === null || userId === '') {
    return Response.json({ error: 'Missing user (Bearer token or ?u=)' }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Expected a JSON body' }, { status: 400 });
  }
  if (typeof body !== 'object' || body === null) {
    return Response.json({ error: 'Expected a JSON object' }, { status: 400 });
  }
  const b = body as Record<string, unknown>;
  if (typeof b.challengeId !== 'string') {
    return Response.json({ error: 'challengeId is required' }, { status: 400 });
  }
  // Parsed, not cast: the engine's applyAction switches on `action.type` with
  // no guard, so a malformed element would throw inside the worker instead of
  // being refused. Validate the shape before anything touches the engine.
  const actions = parseActions(b.actions);
  if (actions === null) {
    return Response.json({ error: 'actions must be an array of game actions' }, { status: 400 });
  }

  const deal = challengeById(b.challengeId);
  if (deal === null) return Response.json({ error: 'Unknown challenge' }, { status: 400 });
  // A challenge is re-derivable from its id, so a caller could name yesterday's
  // (or next year's). Only the open period takes scores.
  if (!challengeIsOpen(deal, Date.now())) {
    return Response.json({ error: 'That challenge is closed' }, { status: 409 });
  }

  // Counted here and nowhere earlier: everything above is a cheap shape check,
  // and a player whose id or challenge is malformed should not be spending a
  // quota meant for the fold below.
  if (await overVerifyCap(db, userId)) {
    return Response.json(
      { error: 'Too many runs submitted today — try again tomorrow' },
      {
        status: 429,
      },
    );
  }

  const verdict = verifyChallengeRun(deal, actions);
  if (!verdict.ok) {
    return Response.json({ error: 'Run rejected', reason: verdict.reason }, { status: 422 });
  }

  try {
    const inserted = await db
      .prepare(
        `INSERT OR IGNORE INTO challenge_scores
           (challenge_id, user_id, score, tricks, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5)`,
      )
      .bind(deal.id, userId, verdict.score, verdict.tricks, Date.now())
      .run();
    // OR IGNORE + meta.changes tells us whether this was the first attempt,
    // without a separate SELECT that could race another tab.
    const first = (inserted.meta.changes ?? 0) > 0;
    const stored = await db
      .prepare(
        'SELECT score, tricks FROM challenge_scores WHERE challenge_id = ?1 AND user_id = ?2',
      )
      .bind(deal.id, userId)
      .first<{ score: number; tricks: number }>();
    return Response.json({
      accepted: first,
      score: stored?.score ?? verdict.score,
      tricks: stored?.tricks ?? verdict.tricks,
    });
  } catch (err) {
    console.error('[challenge] submit failed', err);
    return Response.json({ error: 'Could not record that run' }, { status: 500 });
  }
}

/**
 * GET /api/challenge?id=<challengeId> → { challenge, board, you }.
 *
 * Omit `id` for today's daily. Public, like the leaderboard; a caller identity
 * just adds their own row so someone off the top of the board can still see
 * where they landed.
 */
export async function handleChallengeBoard(
  request: Request,
  env: Env,
  url: URL,
): Promise<Response> {
  const db = env.DB;
  if (db === undefined) return noDb();
  const now = Date.now();
  const requested = url.searchParams.get('id');
  const deal = requested === null ? dailyChallenge(now) : challengeById(requested);
  if (deal === null) return Response.json({ error: 'Unknown challenge' }, { status: 400 });

  const rows = await db
    .prepare(
      `SELECT s.user_id, s.score, s.tricks, u.name, u.color
         FROM challenge_scores s LEFT JOIN users u ON u.id = s.user_id
        WHERE s.challenge_id = ?1
        ORDER BY s.score DESC, s.tricks DESC, s.created_at ASC
        LIMIT ?2`,
    )
    .bind(deal.id, BOARD_LIMIT)
    .all<{
      user_id: string;
      score: number;
      tricks: number;
      name: string | null;
      color: string | null;
    }>();

  const board = rows.results.map((r, i) => ({
    // Opaque public id, never the raw uid — same rule as the leaderboard.
    id: publicId(r.user_id),
    // The daily board is reachable from home without ever entering a room, so
    // it is the surface most likely to fill with never-renamed guests.
    name: displayName(r.name, r.user_id),
    color: r.color,
    score: r.score,
    tricks: r.tricks,
    rank: i + 1,
  }));

  let you: { score: number; tricks: number; rank: number } | null = null;
  // Total entries on this board, so a share line can say "#3 of 47" rather
  // than a rank with nothing to measure it against.
  let entries = board.length;
  let streak = 0;
  const userId = await resolveUserId(request, env, url);
  if (typeof userId === 'string' && userId !== '') {
    const mine = await db
      .prepare(
        'SELECT score, tricks FROM challenge_scores WHERE challenge_id = ?1 AND user_id = ?2',
      )
      .bind(deal.id, userId)
      .first<{ score: number; tricks: number }>();
    if (mine !== null) {
      const ahead = await db
        .prepare(
          `SELECT COUNT(*) AS n FROM challenge_scores
            WHERE challenge_id = ?1 AND (score > ?2 OR (score = ?2 AND tricks > ?3))`,
        )
        .bind(deal.id, mine.score, mine.tricks)
        .first<{ n: number }>();
      you = { score: mine.score, tricks: mine.tricks, rank: (ahead?.n ?? 0) + 1 };
    }
    streak = dailyStreak(await playedDailyKeys(db, userId), now);
  }
  // Only worth a query when the board is capped — otherwise we already have
  // the true count in hand.
  if (board.length >= BOARD_LIMIT) {
    const total = await db
      .prepare('SELECT COUNT(*) AS n FROM challenge_scores WHERE challenge_id = ?1')
      .bind(deal.id)
      .first<{ n: number }>();
    entries = total?.n ?? board.length;
  }

  return Response.json({
    challenge: { id: deal.id, cadence: deal.cadence, periodKey: deal.periodKey, seed: deal.seed },
    board,
    you,
    entries,
    streak,
  });
}
