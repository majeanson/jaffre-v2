/**
 * The global skill ladder, read from the Elo rating the Lobby DO maintains.
 *
 * Public by design, which is exactly why every row leaves as an OPAQUE
 * `publicId` rather than the raw uid.
 */
import type { Env } from '../env.js';
import { publicId } from '../publicId.js';
import { noDb, resolveUserId } from './http.js';

const LEADERBOARD_MIN_GAMES = 10;
const LEADERBOARD_LIMIT = 100;

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

  const top = await db
    .prepare(
      `SELECT id, name, color, rating, rating_games FROM users
       WHERE rating_games >= ?1 ORDER BY rating DESC, rating_games DESC LIMIT ?2`,
    )
    .bind(LEADERBOARD_MIN_GAMES, LEADERBOARD_LIMIT)
    .all<{
      id: string;
      name: string;
      color: string | null;
      rating: number;
      rating_games: number;
    }>();

  const rowOut = (r: {
    id: string;
    name: string;
    color: string | null;
    rating: number;
    rating_games: number;
  }) => ({
    // OPAQUE public id, never the raw uid: the `?u=` / X-User-Id fallbacks
    // trust a bare uid, so exposing users.id here let anyone on the ladder be
    // read (and worse) by strangers. The same hash rides on roster seats, so
    // PlayerPeek matches seat↔row by id instead of by display name.
    id: publicId(r.id),
    name: r.name,
    color: r.color,
    rating: r.rating,
    ratingGames: r.rating_games,
  });

  // The caller's own standing (best-effort — never fails the public board).
  let you: (ReturnType<typeof rowOut> & { rank: number }) | null = null;
  const userId = await resolveUserId(request, env, url);
  if (typeof userId === 'string' && userId !== '') {
    const me = await db
      .prepare('SELECT id, name, color, rating, rating_games FROM users WHERE id = ?1')
      .bind(userId)
      .first<{
        id: string;
        name: string;
        color: string | null;
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
