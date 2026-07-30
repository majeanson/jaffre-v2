/**
 * The global skill ladder, read from the Elo rating the Lobby DO maintains.
 *
 * Public by design, which is exactly why every row leaves as an OPAQUE
 * `publicId` rather than the raw uid.
 */
import { monthlyChampionMonthAwardId, MONTHLY_CHAMPION_AWARD_ID } from '../awards.js';
import type { Env } from '../env.js';
import { displayName, publicId } from '../publicId.js';
import { noDb, resolveUserId } from './http.js';

const LEADERBOARD_MIN_GAMES = 10;
const LEADERBOARD_LIMIT = 100;

/** First instant of the UTC month containing `nowMs`. UTC for the same reason
 * the daily challenge uses it: a ladder that rolls over per timezone isn't a
 * shared ladder. */
export function monthStart(nowMs: number): number {
  const d = new Date(nowMs);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1);
}

/**
 * First instant of the month AFTER the one containing `nowMs` — the pure
 * exclusive upper bound a monthly query needs once it can be asked about an
 * ARCHIVED month (`?month=`), where "nothing after this point" can no longer
 * be assumed from "nothing is in the future".
 */
export function monthEnd(nowMs: number): number {
  const d = new Date(nowMs);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1);
}

/** 'YYYY-MM' for the UTC month containing `ms` — the monthly-champion award's
 * per-month key (see MONTHLY_CHAMPION_PREFIX in ../awards.ts), the same
 * "period key" idea the daily challenge uses for its own ids. */
export function monthKeyOf(ms: number): string {
  const d = new Date(ms);
  return `${String(d.getUTCFullYear())}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

const MONTH_PARAM_RE = /^(\d{4})-(\d{2})$/;

/** Parse a `?month=yyyy-mm` param into an instant inside that UTC month, or
 * null when it isn't that shape (including an out-of-range month number) —
 * the caller 400s rather than silently falling back to "this month". */
function parseMonthParam(value: string): number | null {
  const m = MONTH_PARAM_RE.exec(value);
  if (m === null) return null;
  const month = Number(m[2]);
  if (month < 1 || month > 12) return null;
  return Date.UTC(Number(m[1]), month - 1, 1);
}

/**
 * GET /api/leaderboard?period=month — this month's race.
 *
 * Ranked by WINS this month (tie-break: net points), NOT by a monthly Elo.
 * There is no per-game rating delta stored anywhere — only the running
 * `users.rating` — so a monthly Elo would need a new table and a write on
 * every game_over. Wins and margins are already in `games` + `game_players`,
 * so this is derived like everything else here, needs no migration, and is
 * retroactive for every game ever played.
 *
 * Deliberately NOT an Elo reset: with a small pool a reset punishes everyone
 * and destroys the all-time record. A derived monthly view gives veterans a
 * fresh race every month while the all-time ladder keeps standing.
 *
 * Also: no min-games gate. The all-time board asks for 10 rated games, which
 * is a board a newcomer cannot appear on for a week — this one they join with
 * their first finished game.
 */
interface MonthRow {
  readonly id: string;
  readonly name: string;
  readonly color: string | null;
  readonly paint: string | null;
  readonly games: number;
  readonly wins: number;
  readonly net: number;
  readonly rank: number;
}

async function monthlyBoard(db: D1Database, monthMs: number): Promise<MonthRow[]> {
  const rows = await db
    .prepare(
      `SELECT gp.user_id AS id, u.name AS name, u.color AS color, u.paint AS paint,
              COUNT(*) AS games,
              SUM(CASE WHEN g.winner_team = (gp.seat % 2) THEN 1 ELSE 0 END) AS wins,
              SUM(CASE WHEN gp.seat % 2 = 0 THEN g.score_0 - g.score_1
                       ELSE g.score_1 - g.score_0 END) AS net
         FROM games g
         JOIN game_players gp ON gp.game_id = g.id
         LEFT JOIN users u ON u.id = gp.user_id
        WHERE g.finished_at >= ?1 AND g.finished_at < ?2
          AND g.winner_team IS NOT NULL
          AND gp.user_id IS NOT NULL
          AND gp.is_bot = 0
        GROUP BY gp.user_id
        ORDER BY wins DESC, net DESC
        LIMIT ?3`,
    )
    .bind(monthStart(monthMs), monthEnd(monthMs), LEADERBOARD_LIMIT)
    .all<{
      id: string;
      name: string | null;
      color: string | null;
      paint: string | null;
      games: number;
      wins: number;
      net: number;
    }>();
  return rows.results.map((r, i) => ({
    // Same two identity rules as the all-time board: an OPAQUE public id (the
    // raw uid is credential-shaped, see publicId.ts) and a disambiguated name
    // so unnamed guests don't all read alike on a public ladder.
    id: publicId(r.id),
    name: displayName(r.name, r.id),
    color: r.color,
    paint: r.paint,
    games: r.games,
    wins: r.wins,
    net: r.net,
    rank: i + 1,
  }));
}

/** The RAW uid (never publicId'd — this feeds a grant, not a response) of
 * whoever ranks #1 for the UTC month bounded by [startMs, endMs) — same
 * ordering (wins desc, net desc) as `monthlyBoard`, so "the champion" always
 * agrees with what rank 1 shows on the board itself. Null when nobody has a
 * decided, human-won game in that window. */
async function monthChampionUserId(
  db: D1Database,
  startMs: number,
  endMs: number,
): Promise<string | null> {
  const row = await db
    .prepare(
      `SELECT gp.user_id AS id
         FROM games g
         JOIN game_players gp ON gp.game_id = g.id
        WHERE g.finished_at >= ?1 AND g.finished_at < ?2
          AND g.winner_team IS NOT NULL
          AND gp.user_id IS NOT NULL
          AND gp.is_bot = 0
        GROUP BY gp.user_id
        ORDER BY SUM(CASE WHEN g.winner_team = (gp.seat % 2) THEN 1 ELSE 0 END) DESC,
                 SUM(CASE WHEN gp.seat % 2 = 0 THEN g.score_0 - g.score_1
                          ELSE g.score_1 - g.score_0 END) DESC
        LIMIT 1`,
    )
    .bind(startMs, endMs)
    .first<{ id: string }>();
  return row?.id ?? null;
}

/**
 * Lazily crown last month's champion, the first time anyone reads ANY monthly
 * board after that month ended — no cron, same self-healing shape the stat
 * awards use. Scoped to the single most-recently-completed month regardless
 * of which month the caller actually asked for (current or archived): an
 * old, already-decided month doesn't need re-checking on every visit, and
 * "the month that just ended" is the only one that can still be missing its
 * crown.
 *
 * Cheap on the hot path: a caller reading THIS month's board (the common
 * case) pays one indexed existence check once last month's crown has already
 * been granted, and the more expensive winner computation only runs the one
 * time it's actually needed. Best-effort — never fails the public read.
 */
async function grantMonthlyChampionIfDue(db: D1Database, nowMs: number): Promise<void> {
  try {
    // One ms before this month's start is always inside the PREVIOUS month,
    // regardless of what day of the month `nowMs` is.
    const lastMonthMs = monthStart(nowMs) - 1;
    const key = monthKeyOf(lastMonthMs);
    const monthAwardId = monthlyChampionMonthAwardId(key);
    const already = await db
      .prepare('SELECT 1 FROM user_awards WHERE award_id = ?1 LIMIT 1')
      .bind(monthAwardId)
      .first();
    if (already !== null) return; // this month's crown is already out
    const champion = await monthChampionUserId(db, monthStart(lastMonthMs), monthEnd(lastMonthMs));
    if (champion === null) return; // last month had no decided, human-won game
    const grantedAt = Date.now();
    await db.batch([
      // The keyed row: what makes this idempotent PER MONTH (see the comment
      // on MONTHLY_CHAMPION_PREFIX in ../awards.ts).
      db
        .prepare(
          'INSERT OR IGNORE INTO user_awards (user_id, award_id, granted_at) VALUES (?1, ?2, ?3)',
        )
        .bind(champion, monthAwardId, grantedAt),
      // The canonical row: what the existing exact-id award machinery (the
      // Awards showcase, grantedRewardIds, the grant toast) recognises.
      db
        .prepare(
          'INSERT OR IGNORE INTO user_awards (user_id, award_id, granted_at) VALUES (?1, ?2, ?3)',
        )
        .bind(champion, MONTHLY_CHAMPION_AWARD_ID, grantedAt),
    ]);
  } catch (err) {
    console.error('[leaderboard] monthly champion grant failed', err);
  }
}

/**
 * GET /api/leaderboard → the global skill ladder: the top-rated users with at
 * least LEADERBOARD_MIN_GAMES rated games. Unauthenticated (it's public), but
 * if a caller identity is present its own row + rank is included so a player
 * outside the top can still see where they stand. Response:
 * { top: [{ id, name, color, rating, ratingGames }], you: {…, rank} | null }.
 */
export async function handleLeaderboard(request: Request, env: Env, url: URL): Promise<Response> {
  const db = env.DB;
  if (db === undefined) return noDb();

  // This month's race, for the players who will never crack an all-time
  // top-100. Its own shape (wins/net, no rating) because it is a different
  // question — see monthlyBoard.
  if (url.searchParams.get('period') === 'month') {
    const now = Date.now();
    // Lazy-grant runs on the real clock, independent of `?month=` — see
    // grantMonthlyChampionIfDue's own comment for why.
    await grantMonthlyChampionIfDue(db, now);

    // `?month=yyyy-mm` — the "Last month →" archived view. Absent (the
    // common case) means the CURRENT month, on the real clock.
    const monthParam = url.searchParams.get('month');
    let monthMs = now;
    if (monthParam !== null) {
      const parsed = parseMonthParam(monthParam);
      if (parsed === null) {
        return Response.json({ error: 'month must be yyyy-mm' }, { status: 400 });
      }
      monthMs = parsed;
    }

    const month = await monthlyBoard(db, monthMs);
    let you: MonthRow | null = null;
    const uid = await resolveUserId(request, env, url);
    if (typeof uid === 'string' && uid !== '') {
      // Found within the returned page only. The all-time board runs a second
      // query for an off-page caller because its gate (10 rated games) means
      // most callers ARE off-page; here there is no gate, the pool is small,
      // and a caller outside the top 100 of a single month is rare enough that
      // a per-request COUNT would cost more than it tells anyone.
      const mine = publicId(uid);
      you = month.find((r) => r.id === mine) ?? null;
    }
    return Response.json({ top: month, you });
  }

  const top = await db
    .prepare(
      `SELECT id, name, color, paint, rating, rating_games FROM users
       WHERE rating_games >= ?1 ORDER BY rating DESC, rating_games DESC LIMIT ?2`,
    )
    .bind(LEADERBOARD_MIN_GAMES, LEADERBOARD_LIMIT)
    .all<{
      id: string;
      name: string;
      color: string | null;
      paint: string | null;
      rating: number;
      rating_games: number;
    }>();

  const rowOut = (r: {
    id: string;
    name: string;
    color: string | null;
    paint: string | null;
    rating: number;
    rating_games: number;
  }) => ({
    // OPAQUE public id, never the raw uid: the `?u=` / X-User-Id fallbacks
    // trust a bare uid, so exposing users.id here let anyone on the ladder be
    // read (and worse) by strangers. The same hash rides on roster seats, so
    // PlayerPeek matches seat↔row by id instead of by display name.
    id: publicId(r.id),
    // A ladder needs to name who beat whom; two unnamed guests reading
    // identically is the same failure the opaque id above exists to prevent.
    name: displayName(r.name, r.id),
    color: r.color,
    paint: r.paint,
    rating: r.rating,
    ratingGames: r.rating_games,
  });

  // The caller's own standing (best-effort — never fails the public board).
  let you: (ReturnType<typeof rowOut> & { rank: number }) | null = null;
  const userId = await resolveUserId(request, env, url);
  if (typeof userId === 'string' && userId !== '') {
    const me = await db
      .prepare('SELECT id, name, color, paint, rating, rating_games FROM users WHERE id = ?1')
      .bind(userId)
      .first<{
        id: string;
        name: string;
        color: string | null;
        paint: string | null;
        rating: number;
        rating_games: number;
      }>();
    if (me !== null && me.rating_games >= LEADERBOARD_MIN_GAMES) {
      const ahead = await db
        .prepare('SELECT COUNT(*) AS n FROM users WHERE rating_games >= ?1 AND rating > ?2')
        .bind(LEADERBOARD_MIN_GAMES, me.rating)
        .first<{ n: number }>();
      you = { ...rowOut(me), rank: (ahead?.n ?? 0) + 1 };
    }
  }

  return Response.json({ top: top.results.map(rowOut), you });
}
