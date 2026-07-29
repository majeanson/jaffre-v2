/**
 * Best-effort D1 write-behind fired once at game_over: the games/game_players
 * history rows, each seated human's Elo-like rating movement (optimistically
 * guarded, retried once on a cross-room race), a foil roll for seated
 * humans, and spectator credit for anyone who watched the game out. A
 * failure in any later step (rating, foils, spectator credit) must never
 * lose the history row — each is independently try/catch-guarded.
 */
import type { GameState } from '@jaffre/engine';
import type { GameRoom } from '../GameRoom.js';
import { gameRecordFrom } from '../history.js';
import { rollFoil } from '../foils.js';
import { DEFAULT_RATING, ratingUpdates, type CurrentRating } from '../rating.js';
import type { LogEntry } from './types.js';

/** Everything needed to (re)apply one user's rating move: the guarded UPDATE's
 * bound values plus `delta`, kept separately so a cross-room-race retry can
 * re-apply the same move on top of a freshly re-read `oldRating`. */
interface RatingWriteInfo {
  readonly userId: string;
  readonly name: string;
  readonly oldRating: number;
  readonly newRating: number;
  readonly newRatingGames: number;
  readonly delta: number;
}

/** Write games + game_players rows to D1 once, at game_over. */
export async function persistHistory(room: GameRoom, game: GameState): Promise<void> {
  const db = room.env.DB;
  if (db === undefined) return; // no-DB env (local dev / tests) — skip
  const stored = await room.ctx.storage.list<LogEntry>({ prefix: 'log:' });
  const record = gameRecordFrom(
    {
      roomCode: room.meta.roomCode ?? 'unknown',
      startedAt: room.meta.startedAt ?? null,
      seats: room.meta.seats,
      names: room.meta.names,
    },
    game,
    [...stored.values()],
    { id: crypto.randomUUID(), finishedAt: Date.now() },
  );
  // Elo-like rating: bump each human's rating from this game's outcome. Read
  // their current ratings first, then fold the writes into the same batch so
  // history + rating land atomically. A rating-read failure must NOT lose the
  // history row, so it degrades to "history without rating".
  let ratingInfo: RatingWriteInfo[] = [];
  try {
    ratingInfo = await ratingWriteInfo(db, record.players, record.winner_team);
  } catch {
    ratingInfo = [];
  }

  // Stash for the recap: map each rated human's userId back to their seat
  // (via meta.seats, still the just-finished game's seating) so the roster
  // can carry rating movement without a client-side round-trip.
  if (ratingInfo.length > 0) {
    const lastRatings: { seat: number; rating: number; delta: number }[] = [];
    for (const info of ratingInfo) {
      const seat = room.meta.seats.findIndex((s) => s === info.userId);
      if (seat === -1) continue;
      lastRatings.push({ seat, rating: info.newRating, delta: info.delta });
    }
    room.meta.lastRatings = lastRatings;
    await room.ctx.storage.put('meta', room.meta);
  }

  const results = await db.batch([
    db
      .prepare(
        `INSERT INTO games (id, room_code, seed, started_at, finished_at, winner_team, score_0, score_1, action_log, round_summaries)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)`,
      )
      .bind(
        record.id,
        record.room_code,
        record.seed,
        record.started_at,
        record.finished_at,
        record.winner_team,
        record.score_0,
        record.score_1,
        record.action_log,
        record.round_summaries,
      ),
    ...record.players.map((p) =>
      db
        .prepare(
          'INSERT INTO game_players (game_id, seat, user_id, is_bot, name) VALUES (?1, ?2, ?3, ?4, ?5)',
        )
        .bind(record.id, p.seat, p.user_id, p.is_bot, p.name),
    ),
    ...ratingInfo.map((info) => ratingStatement(db, info)),
  ]);

  // The rating writes are optimistically guarded (WHERE rating = <old value read
  // above>) to close a cross-room race: two rooms finishing simultaneously with
  // a shared player can both read the same starting rating, and without a guard
  // whichever write lands second would silently clobber the first. A guard miss
  // means another room won that race first — re-read the now-current rating and
  // re-apply this game's delta on top of it (one retry; ratings are best-effort,
  // never worth failing history over).
  const ratingResults = results.slice(1 + record.players.length);
  for (const [i, info] of ratingInfo.entries()) {
    if ((ratingResults[i]?.meta.changes ?? 0) > 0) continue;
    try {
      await retryRatingWrite(db, info);
    } catch (err) {
      console.error('[rating] retry failed, leaving rating unchanged', err);
    }
  }

  // Foil chase — a rare drop for each human who finished with a card skin
  // equipped. Best-effort and last: a foil is the smallest stake in this
  // method, and it must never be the reason a history row is lost.
  try {
    await grantFoils(db, record.id, record.players);
  } catch (err) {
    console.error('[foil] grant failed, no drop this game', err);
  }

  // Credit anyone who WATCHED this game to the end. Same best-effort rule.
  try {
    await creditSpectators(room, db, record.id);
  } catch (err) {
    console.error('[spectate] credit failed', err);
  }
}

/**
 * Record everyone still watching as the game finished.
 *
 * "Still attached at game_over" is the deliberate definition: opening a tab
 * on a live game costs nothing, so counting that would make the reward
 * meaningless. Sitting through the end is the thing worth recognising.
 *
 * Seated players are excluded — they already get history, stats and rating
 * from this game; this is specifically for the people who have nothing else
 * to show for the time.
 */
async function creditSpectators(room: GameRoom, db: D1Database, gameId: string): Promise<void> {
  const watchers = new Set<string>();
  for (const att of room.ctx.getWebSockets().map((s) => room.attachment(s))) {
    if (!att.joined || att.viewer !== 'spectator') continue;
    if (att.userId === '') continue;
    watchers.add(att.userId);
  }
  if (watchers.size === 0) return;
  const now = Date.now();
  await db.batch(
    [...watchers].map((userId) =>
      db
        .prepare(
          'INSERT OR IGNORE INTO spectated_games (user_id, game_id, watched_at) VALUES (?1, ?2, ?3)',
        )
        .bind(userId, gameId, now),
    ),
  );
}

/**
 * Roll a foil for every seated human and grant the winners.
 *
 * The roll is server-side and keyed on (gameId, userId), so it cannot be
 * re-rolled or attested by a client — see src/foils.ts. Reads each player's
 * equipped skin from their profile row, which is already the record of what
 * they were playing with.
 */
async function grantFoils(
  db: D1Database,
  gameId: string,
  players: readonly { readonly user_id: string | null }[],
): Promise<void> {
  const userIds = players
    .map((p) => p.user_id)
    .filter((id): id is string => id !== null && id !== '');
  if (userIds.length === 0) return;

  const placeholders = userIds.map((_id, i) => `?${String(i + 1)}`).join(', ');
  const [skins, owned] = await Promise.all([
    db
      .prepare(`SELECT id, card_skin FROM users WHERE id IN (${placeholders})`)
      .bind(...userIds)
      .all<{ id: string; card_skin: string | null }>(),
    db
      .prepare(
        `SELECT user_id, award_id FROM user_awards
          WHERE user_id IN (${placeholders}) AND award_id LIKE 'foil:%'`,
      )
      .bind(...userIds)
      .all<{ user_id: string; award_id: string }>(),
  ]);

  const equipped = new Map(skins.results.map((r) => [r.id, r.card_skin]));
  const ownedByUser = new Map<string, Set<string>>();
  for (const row of owned.results) {
    const set = ownedByUser.get(row.user_id) ?? new Set<string>();
    set.add(row.award_id);
    ownedByUser.set(row.user_id, set);
  }

  const now = Date.now();
  const grants = userIds
    .map((userId) => ({
      userId,
      awardId: rollFoil(
        gameId,
        userId,
        equipped.get(userId) ?? null,
        ownedByUser.get(userId) ?? new Set<string>(),
      ),
    }))
    .filter((g): g is { userId: string; awardId: string } => g.awardId !== null);
  if (grants.length === 0) return;

  await db.batch(
    grants.map((g) =>
      db
        .prepare(
          'INSERT OR IGNORE INTO user_awards (user_id, award_id, granted_at) VALUES (?1, ?2, ?3)',
        )
        .bind(g.userId, g.awardId, now),
    ),
  );
}

/** Re-reads one user's now-current rating and re-applies this game's delta on
 * top of it, with the same optimistic guard. Logs and gives up (does not throw)
 * if the guarded write misses a second time — a rating that briefly lags one
 * game behind is fine; failing history is not. */
async function retryRatingWrite(db: D1Database, info: RatingWriteInfo): Promise<void> {
  const fresh = await db
    .prepare('SELECT rating, rating_games FROM users WHERE id = ?1')
    .bind(info.userId)
    .first<{ rating: number; rating_games: number }>();
  if (fresh === null) {
    console.error('[rating] retry found no user row', info.userId);
    return;
  }
  const retryInfo: RatingWriteInfo = {
    ...info,
    oldRating: fresh.rating,
    newRating: fresh.rating + info.delta,
    newRatingGames: fresh.rating_games + 1,
  };
  const result = await ratingStatement(db, retryInfo).run();
  if (result.meta.changes === 0) {
    console.error('[rating] retry lost the race a second time', info.userId);
  }
}

/** The single optimistically-guarded rating UPDATE, shared by the initial
 * batch attempt and the one-shot retry. */
function ratingStatement(db: D1Database, info: RatingWriteInfo): D1PreparedStatement {
  // Uses an UPSERT, not a bare UPDATE: a seated, token-verified human can lack a
  // `users` row (D1 was down at guest signup, or the no-secret `?u=` mode never
  // hits an auth handler). A plain UPDATE would silently match 0 rows and drop
  // their rating forever; ON CONFLICT materializes the row on their first rated
  // game instead. The `WHERE rating = ?6` on the conflict path is the optimistic
  // guard: it only takes effect (and only updates) when the row still has the
  // rating this write was computed against.
  return db
    .prepare(
      `INSERT INTO users (id, name, created_at, rating, rating_games)
       VALUES (?1, ?2, ?3, ?4, ?5)
       ON CONFLICT(id) DO UPDATE SET rating = ?4, rating_games = ?5 WHERE rating = ?6`,
    )
    .bind(info.userId, info.name, Date.now(), info.newRating, info.newRatingGames, info.oldRating);
}

/** Build the rating-write inputs for a finished game — reads the human
 * players' current ratings, then applies the Elo delta. Returns [] when the
 * game isn't rated (undecided, or a bot on either team). */
async function ratingWriteInfo(
  db: D1Database,
  players: readonly {
    readonly seat: number;
    readonly user_id: string | null;
    readonly is_bot: 0 | 1;
    readonly name: string;
  }[],
  winnerTeam: number | null,
): Promise<RatingWriteInfo[]> {
  const humans = players.filter((p) => p.is_bot === 0 && p.user_id !== null);
  if (humans.length === 0) return [];
  const humanIds = humans.map((p) => p.user_id as string);
  const nameOf = new Map(humans.map((p) => [p.user_id as string, p.name]));

  const placeholders = humanIds.map((_, i) => `?${String(i + 1)}`).join(', ');
  const rows = await db
    .prepare(`SELECT id, rating, rating_games FROM users WHERE id IN (${placeholders})`)
    .bind(...humanIds)
    .all<{ id: string; rating: number; rating_games: number }>();
  const current: Record<string, CurrentRating> = {};
  for (const r of rows.results) current[r.id] = { rating: r.rating, ratingGames: r.rating_games };

  const updates = ratingUpdates(
    players.map((p) => ({ seat: p.seat, userId: p.user_id, isBot: p.is_bot })),
    winnerTeam,
    current,
  );
  return updates.map((u) => ({
    userId: u.userId,
    name: nameOf.get(u.userId) ?? 'Player',
    oldRating: current[u.userId]?.rating ?? DEFAULT_RATING,
    newRating: u.rating,
    newRatingGames: u.ratingGames,
    delta: u.delta,
  }));
}
