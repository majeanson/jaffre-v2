import { SELF, env } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import { MONTHLY_CHAMPION_AWARD_ID, monthlyChampionMonthAwardId } from '../src/awards.js';
import { publicId } from '../src/publicId.js';
import { monthEnd, monthKeyOf, monthStart } from '../src/routes/leaderboard.js';

/**
 * /api/leaderboard ranks users by stored rating, gated at 10 rated games. Seed
 * users directly (room.test.ts covers the rating write path via persistHistory)
 * and assert ordering, the min-games gate, and the caller's own rank. Row ids
 * are OPAQUE public ids (a one-way hash of the uid) — the raw uid is
 * credential-shaped (`?u=` fallback) and must never appear in the payload.
 */

async function seedUser(
  id: string,
  name: string,
  rating: number,
  ratingGames: number,
): Promise<void> {
  await env.DB.prepare(
    'INSERT INTO users (id, name, created_at, rating, rating_games) VALUES (?1, ?2, 0, ?3, ?4)',
  )
    .bind(id, name, rating, ratingGames)
    .run();
}

describe('GET /api/leaderboard', () => {
  it('ranks by rating and hides users below the min-games gate', async () => {
    await seedUser('lb-top', 'Top', 1300, 20);
    await seedUser('lb-mid', 'Mid', 1100, 12);
    await seedUser('lb-new', 'New', 1500, 4); // highest rating but too few games

    const res = await SELF.fetch('https://example.com/api/leaderboard');
    expect(res.status).toBe(200);
    const data = (await res.json()) as { top: { id: string; rating: number }[]; you: unknown };
    const ids = data.top.map((r) => r.id);
    expect(ids).toContain(publicId('lb-top'));
    expect(ids).toContain(publicId('lb-mid'));
    expect(ids).not.toContain(publicId('lb-new')); // gated out (< 10 games)
    // The raw uid must never leak — it doubles as the ?u= credential.
    expect(ids).not.toContain('lb-top');
    // Ordered by rating desc: Top (1300) before Mid (1100).
    expect(ids.indexOf(publicId('lb-top'))).toBeLessThan(ids.indexOf(publicId('lb-mid')));
    expect(data.you).toBeNull(); // anonymous request
  });

  it('disambiguates never-renamed guests instead of listing two identical rows', async () => {
    await seedUser('lb-anon-a', 'Player', 1400, 30);
    await seedUser('lb-anon-b', 'Player', 1350, 30);

    const res = await SELF.fetch('https://example.com/api/leaderboard');
    const data = (await res.json()) as { top: { id: string; name: string }[] };
    const a = data.top.find((r) => r.id === publicId('lb-anon-a'));
    const b = data.top.find((r) => r.id === publicId('lb-anon-b'));

    // Both are still anonymous, but a reader can tell who beat whom.
    expect(a?.name).not.toBe('Player');
    expect(a?.name).not.toBe(b?.name);
    expect(a?.name).toMatch(/^Player [0-9a-f]{4}$/);
  });

  it("includes the caller's own rank when identified and ranked", async () => {
    await seedUser('lb-me', 'Me', 1200, 15);
    const res = await SELF.fetch('https://example.com/api/leaderboard?u=lb-me');
    const data = (await res.json()) as { you: { id: string; rank: number } | null };
    expect(data.you?.id).toBe(publicId('lb-me'));
    expect(typeof data.you?.rank).toBe('number');
  });
});

/**
 * This month's race. Derived from `games` + `game_players` rather than a
 * monthly Elo, because no per-game rating delta is stored anywhere — only the
 * running users.rating. Wins and margins are already there, so this needs no
 * migration and is retroactive for every game ever played.
 */
describe('monthStart', () => {
  it('is the first instant of the UTC month', () => {
    expect(monthStart(Date.UTC(2026, 6, 29, 18, 42))).toBe(Date.UTC(2026, 6, 1));
  });

  it('puts the very first and last instants of a month in the same month', () => {
    // UTC for the same reason the daily challenge uses it: a ladder that rolls
    // over per timezone is not a shared ladder.
    const first = Date.UTC(2026, 6, 1, 0, 0, 0, 0);
    const last = Date.UTC(2026, 6, 31, 23, 59, 59, 999);
    expect(monthStart(first)).toBe(monthStart(last));
  });

  it('does not bleed across a year boundary', () => {
    expect(monthStart(Date.UTC(2027, 0, 1, 0, 30))).toBe(Date.UTC(2027, 0, 1));
    expect(monthStart(Date.UTC(2026, 11, 31, 23, 30))).toBe(Date.UTC(2026, 11, 1));
  });
});

describe('GET /api/leaderboard?period=month', () => {
  /** One finished game with the given seat-0 user on the winning/losing side. */
  async function seedGame(id: string, uid: string, won: boolean, finishedAt: number) {
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO games (id, room_code, seed, started_at, finished_at, winner_team, score_0, score_1, action_log)
         VALUES (?1, 'month', 1, ?2, ?2, ?3, ?4, ?5, '[]')`,
      ).bind(id, finishedAt, won ? 0 : 1, won ? 41 : 20, won ? 20 : 41),
      env.DB.prepare(
        'INSERT INTO game_players (game_id, seat, user_id, is_bot, name) VALUES (?1, 0, ?2, 0, ?3)',
      ).bind(id, uid, 'Monthly'),
    ]);
  }

  it('ranks by wins this month and ignores games from before it', async () => {
    const now = Date.now();
    const thisMonth = monthStart(now) + 1000;
    const lastMonth = monthStart(now) - 86_400_000;

    await seedGame('m-win-1', 'month-a', true, thisMonth);
    await seedGame('m-win-2', 'month-a', true, thisMonth + 1);
    await seedGame('m-win-3', 'month-b', true, thisMonth + 2);
    // Plenty of wins, but last month — must not count toward this board.
    await seedGame('m-old-1', 'month-b', true, lastMonth);
    await seedGame('m-old-2', 'month-b', true, lastMonth - 1);

    const res = await SELF.fetch('https://example.com/api/leaderboard?period=month');
    expect(res.status).toBe(200);
    const data = (await res.json()) as {
      top: { id: string; wins: number; games: number; rank: number }[];
    };
    const a = data.top.find((r) => r.id === publicId('month-a'));
    const b = data.top.find((r) => r.id === publicId('month-b'));
    expect(a?.wins).toBe(2);
    expect(b?.wins).toBe(1); // the two old wins are out of scope
    // Ranked, and ordered by wins.
    expect((a?.rank ?? 99) < (b?.rank ?? 0)).toBe(true);
    // Never the raw uid — it doubles as the ?u= credential.
    expect(data.top.map((r) => r.id)).not.toContain('month-a');
  });

  it('has no min-games gate — one finished game puts you on it', async () => {
    // The all-time board asks for 10 rated games, which a newcomer cannot
    // reach for a week. This one they join immediately.
    await seedGame('m-rookie', 'month-rookie', false, monthStart(Date.now()) + 5);
    const res = await SELF.fetch('https://example.com/api/leaderboard?period=month&u=month-rookie');
    const data = (await res.json()) as { you: { games: number } | null };
    expect(data.you?.games).toBe(1);
  });
});

/**
 * `?month=yyyy-mm` — the "Last month →" archived view (D6). Once the monthly
 * query could be asked about a month that ISN'T the current one, it needs a
 * real upper bound: `monthStart` alone (the shape the current-month query
 * used before this) would happily count every game since, forever.
 */
describe('GET /api/leaderboard?period=month&month=', () => {
  async function seedGame(id: string, uid: string, won: boolean, finishedAt: number) {
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO games (id, room_code, seed, started_at, finished_at, winner_team, score_0, score_1, action_log)
         VALUES (?1, 'archive', 1, ?2, ?2, ?3, ?4, ?5, '[]')`,
      ).bind(id, finishedAt, won ? 0 : 1, won ? 41 : 20, won ? 20 : 41),
      env.DB.prepare(
        'INSERT INTO game_players (game_id, seat, user_id, is_bot, name) VALUES (?1, 0, ?2, 0, ?3)',
      ).bind(id, uid, 'Archived'),
    ]);
  }

  it('bounds a requested month on both ends — not just >= start', async () => {
    // A fixed month, comfortably in the past on any machine's clock, so the
    // test doesn't depend on what "this month" happens to be when it runs.
    const targetMs = Date.UTC(2025, 5, 15); // June 2025
    const before = monthStart(targetMs) - 1; // May, last instant
    const after = monthEnd(targetMs); // July, first instant

    await seedGame('arc-in', 'archive-a', true, targetMs);
    await seedGame('arc-before', 'archive-b', true, before);
    await seedGame('arc-after', 'archive-c', true, after);

    const res = await SELF.fetch('https://example.com/api/leaderboard?period=month&month=2025-06');
    expect(res.status).toBe(200);
    const data = (await res.json()) as { top: { id: string }[] };
    const ids = data.top.map((r) => r.id);
    expect(ids).toContain(publicId('archive-a'));
    expect(ids).not.toContain(publicId('archive-b'));
    expect(ids).not.toContain(publicId('archive-c'));
  });

  it('finds the caller inside the ARCHIVED month, not the current one', async () => {
    const targetMs = Date.UTC(2025, 5, 15);
    await seedGame('arc-you', 'archive-you', true, targetMs);
    // Same player, but in the current month — must not be what "you" resolves.
    await seedGame('arc-you-now', 'archive-you', false, monthStart(Date.now()) + 5);

    const res = await SELF.fetch(
      'https://example.com/api/leaderboard?period=month&month=2025-06&u=archive-you',
    );
    const data = (await res.json()) as { you: { games: number; wins: number } | null };
    expect(data.you?.games).toBe(1);
    expect(data.you?.wins).toBe(1);
  });

  it('400s a malformed month instead of silently falling back to this month', async () => {
    for (const bad of ['2025-13', '2025-00', 'not-a-month', '2025/06', '25-06']) {
      const res = await SELF.fetch(`https://example.com/api/leaderboard?period=month&month=${bad}`);
      expect(res.status, bad).toBe(400);
    }
  });
});

/**
 * The monthly-champion award (D6): lazily crowned the first time anyone reads
 * ANY monthly board after that month ended, keyed per month like a foil, plus
 * a canonical unkeyed row the existing catalog machinery already understands
 * (see grantMonthlyChampionIfDue in routes/leaderboard.ts).
 */
describe('monthly champion lazy grant', () => {
  async function seedLastMonthGame(id: string, uid: string, won: boolean) {
    // One ms before this month's start is always inside the PREVIOUS month,
    // regardless of what day of the month the test runs on.
    const lastMonthMs = monthStart(Date.now()) - 1;
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO games (id, room_code, seed, started_at, finished_at, winner_team, score_0, score_1, action_log)
         VALUES (?1, 'champ', 1, ?2, ?2, ?3, ?4, ?5, '[]')`,
      ).bind(id, lastMonthMs, won ? 0 : 1, won ? 41 : 20, won ? 20 : 41),
      env.DB.prepare(
        'INSERT INTO game_players (game_id, seat, user_id, is_bot, name) VALUES (?1, 0, ?2, 0, ?3)',
      ).bind(id, uid, 'Champ'),
    ]);
    return lastMonthMs;
  }

  it('crowns last month’s winner once, and does not double-grant on a second read', async () => {
    await seedLastMonthGame('champ-win-1', 'champ-alice', true);
    await seedLastMonthGame('champ-win-2', 'champ-alice', true);
    await seedLastMonthGame('champ-lose-1', 'champ-bob', false);

    const lastMonthKey = monthKeyOf(monthStart(Date.now()) - 1);
    const monthAwardId = monthlyChampionMonthAwardId(lastMonthKey);

    // Any monthly read triggers the lazy grant — this one asks for THIS
    // month's board, not last month's, which is the point: the grant is not
    // tied to what the caller happened to request.
    const first = await SELF.fetch('https://example.com/api/leaderboard?period=month');
    expect(first.status).toBe(200);

    const keyedRows = await env.DB.prepare('SELECT user_id FROM user_awards WHERE award_id = ?1')
      .bind(monthAwardId)
      .all<{ user_id: string }>();
    expect(keyedRows.results).toEqual([{ user_id: 'champ-alice' }]);

    const canonicalRows = await env.DB.prepare(
      'SELECT user_id FROM user_awards WHERE award_id = ?1',
    )
      .bind(MONTHLY_CHAMPION_AWARD_ID)
      .all<{ user_id: string }>();
    expect(canonicalRows.results).toEqual([{ user_id: 'champ-alice' }]);

    // A second read must not insert a second row for the same month — the
    // whole reason for the keyed existence check.
    const second = await SELF.fetch('https://example.com/api/leaderboard?period=month');
    expect(second.status).toBe(200);
    const keyedAgain = await env.DB.prepare(
      'SELECT COUNT(*) AS n FROM user_awards WHERE award_id = ?1',
    )
      .bind(monthAwardId)
      .first<{ n: number }>();
    expect(keyedAgain?.n).toBe(1);
  });

  it('grants nothing when last month had no decided, human-won game', async () => {
    const res = await SELF.fetch('https://example.com/api/leaderboard?period=month');
    expect(res.status).toBe(200);
    const rows = await env.DB.prepare(
      "SELECT COUNT(*) AS n FROM user_awards WHERE award_id LIKE 'monthly-champion%'",
    ).first<{ n: number }>();
    expect(rows?.n).toBe(0);
  });
});
