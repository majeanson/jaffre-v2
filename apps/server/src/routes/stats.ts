/**
 * A player's aggregate record, and the awards derived from it.
 *
 * `computeStats` is the single source of truth for both: the awards endpoint
 * evaluates stat-based awards against the very same numbers the Stats screen
 * shows, so an award can never disagree with the record that earned it.
 */
import { SUITS, type RoundSummary, type Suit } from '@jaffre/engine';
import { EVENT_AWARD_IDS, earnedStatAwardIds } from '../awards.js';
import type { Env } from '../env.js';
import { noDb, resolveUserId } from './http.js';
import { playersByGame } from './games.js';

/** Narrows a persisted `RoundSummary.trump` to a real suit. */
function isSuit(value: unknown): value is Suit {
  return typeof value === 'string' && (SUITS as readonly string[]).includes(value);
}

interface StatsRow {
  readonly id: string;
  readonly finished_at: number | null;
  readonly winner_team: number | null;
  readonly round_summaries: string | null;
  readonly score_0: number;
  readonly score_1: number;
  readonly seat: number;
}

interface StatsPayload {
  readonly games: number;
  readonly wins: number;
  readonly winRate: number;
  readonly netPoints: number;
  readonly bids: { readonly attempted: number; readonly made: number };
  readonly sansAtout: { readonly attempted: number; readonly made: number };
  /**
   * Contracts you declared, split by the trump you named — the "five lanes"
   * mastery view. Only the four SUITS live here: a sans-atout contract has no
   * trump, and its lane is the existing top-level `sansAtout` field rather
   * than a duplicate counter.
   *
   * Derived from `round_summaries.trump`, which has been persisted since the
   * field existed, so this is fully retroactive for every past game.
   */
  readonly mastery: Readonly<Record<Suit, { readonly attempted: number; readonly made: number }>>;
  readonly bestPartner: {
    readonly name: string;
    readonly games: number;
    readonly wins: number;
  } | null;
  readonly nemesis: {
    readonly name: string;
    readonly games: number;
    readonly losses: number;
  } | null;
  readonly streak: { readonly current: number; readonly best: number };
  /** Games watched through to the end as a spectator. Its own counter, NOT an
   * XP source — see the note in apps/server/src/awards.ts. */
  readonly spectated: number;
}

/** A zeroed mastery table. A function, not a shared const: computeStats
 * increments these counters in place, so each call needs its own. */
function emptyMastery(): Record<Suit, { attempted: number; made: number }> {
  return {
    red: { attempted: 0, made: 0 },
    brown: { attempted: 0, made: 0 },
    green: { attempted: 0, made: 0 },
    blue: { attempted: 0, made: 0 },
  };
}

const EMPTY_STATS: StatsPayload = {
  games: 0,
  wins: 0,
  winRate: 0,
  netPoints: 0,
  bids: { attempted: 0, made: 0 },
  sansAtout: { attempted: 0, made: 0 },
  mastery: emptyMastery(),
  bestPartner: null,
  nemesis: null,
  streak: { current: 0, best: 0 },
  spectated: 0,
};

/**
 * GET /api/stats?u=<userId> (or Bearer token) → aggregate record for that
 * player, computed in JS from their finished games (kept out of SQL since
 * bid/sans-atout stats require parsing each game's round_summaries JSON).
 */
export async function handleStats(request: Request, env: Env, url: URL): Promise<Response> {
  if (env.DB === undefined) return noDb();
  const userId = await resolveUserId(request, env, url);
  if (userId === undefined) return Response.json({ error: 'Invalid token' }, { status: 401 });
  if (userId === null || userId === '') {
    return Response.json({ error: 'Missing user (Bearer token or ?u=)' }, { status: 400 });
  }
  return Response.json(await computeStats(env, userId));
}

/** The aggregate-stats computation, factored out of handleStats so /api/awards
 * can reuse it (evaluate stat-based awards against the same numbers). */
async function computeStats(env: Env, userId: string): Promise<StatsPayload> {
  const db = env.DB;
  if (db === undefined) return EMPTY_STATS;
  // Ascending by finished_at: the streak walk needs oldest-first so the
  // running count at the end of the loop IS the current (trailing) streak.
  const rows = await db
    .prepare(
      `SELECT g.id, g.finished_at, g.winner_team, g.round_summaries, g.score_0, g.score_1, gp.seat
     FROM games g JOIN game_players gp ON gp.game_id = g.id
     WHERE gp.user_id = ?1 AND g.finished_at IS NOT NULL
     ORDER BY g.finished_at ASC`,
    )
    .bind(userId)
    .all<StatsRow>();
  // Read BEFORE the no-games early return: someone who has only ever watched
  // has zero games, and is exactly the person the spectating awards are for.
  const spectated = await countSpectated(db, userId);

  const games = rows.results;
  if (games.length === 0) return { ...EMPTY_STATS, spectated };

  const players = await playersByGame(
    env,
    games.map((g) => g.id),
  );

  let wins = 0;
  let netPoints = 0;
  let bidsAttempted = 0;
  let bidsMade = 0;
  let saAttempted = 0;
  let saMade = 0;
  const mastery = emptyMastery();
  let running = 0;
  let best = 0;
  const partners = new Map<string, { name: string; games: number; wins: number }>();
  // Opponents you've faced: "losses" counts games they beat you → your nemesis.
  const opponents = new Map<string, { name: string; games: number; losses: number }>();

  for (const g of games) {
    const yourTeam = g.seat % 2;
    const won = g.winner_team !== null && g.winner_team === yourTeam;
    if (won) wins++;
    // Net points: your team's final margin summed across every finished game.
    netPoints += yourTeam === 0 ? g.score_0 - g.score_1 : g.score_1 - g.score_0;
    running = won ? running + 1 : 0;
    best = Math.max(best, running);

    if (g.round_summaries !== null) {
      const summaries = JSON.parse(g.round_summaries) as readonly RoundSummary[];
      for (const s of summaries) {
        if (s.contract.seat !== g.seat) continue;
        bidsAttempted++;
        if (s.contractMade) bidsMade++;
        if (s.contract.sansAtout) {
          saAttempted++;
          if (s.contractMade) saMade++;
        } else if (isSuit(s.trump)) {
          // Guarded rather than indexed directly: `trump` comes from JSON
          // persisted by older builds, so treat anything unrecognised as a
          // contract with no lane instead of creating a junk key.
          const lane = mastery[s.trump];
          lane.attempted++;
          if (s.contractMade) lane.made++;
        }
      }
    }

    const roster = players.get(g.id) ?? [];
    const teammate = roster.find(
      (p) => p.seat % 2 === yourTeam && p.seat !== g.seat && !p.isBot && p.userId !== null,
    );
    if (teammate?.userId !== null && teammate !== undefined) {
      const entry = partners.get(teammate.userId) ?? { name: teammate.name, games: 0, wins: 0 };
      entry.games++;
      if (won) entry.wins++;
      partners.set(teammate.userId, entry);
    }

    // Both opponents (the other team's humans) get credit for beating you.
    const decided = g.winner_team !== null;
    for (const p of roster) {
      if (p.seat % 2 === yourTeam || p.isBot || p.userId === null) continue;
      const entry = opponents.get(p.userId) ?? { name: p.name, games: 0, losses: 0 };
      entry.games++;
      if (decided && !won) entry.losses++;
      opponents.set(p.userId, entry);
    }
  }

  let bestPartner: { name: string; games: number; wins: number } | null = null;
  for (const entry of partners.values()) {
    if (entry.games < 2) continue;
    if (bestPartner === null || entry.wins > bestPartner.wins) bestPartner = entry;
  }

  // Nemesis: the opponent (min 2 games faced) who has beaten you the most.
  let nemesis: { name: string; games: number; losses: number } | null = null;
  for (const entry of opponents.values()) {
    if (entry.games < 2 || entry.losses === 0) continue;
    if (nemesis === null || entry.losses > nemesis.losses) nemesis = entry;
  }

  return {
    games: games.length,
    wins,
    winRate: wins / games.length,
    netPoints,
    bids: { attempted: bidsAttempted, made: bidsMade },
    sansAtout: { attempted: saAttempted, made: saMade },
    mastery,
    bestPartner,
    nemesis,
    streak: { current: running, best },
    spectated,
  };
}

/** Games this user watched to the end. Degrades to 0 rather than failing the
 * whole stats read — a missing spectate count must not cost someone their
 * record. */
async function countSpectated(db: D1Database, userId: string): Promise<number> {
  try {
    const row = await db
      .prepare('SELECT COUNT(*) AS n FROM spectated_games WHERE user_id = ?1')
      .bind(userId)
      .first<{ n: number }>();
    return row?.n ?? 0;
  } catch (err) {
    console.error('[spectate] count failed', err);
    return 0;
  }
}

/**
 * GET /api/awards → the user's earned awards. Stat-based awards are evaluated
 * from their live aggregate and self-heal (INSERT OR IGNORE) so they can't be
 * forged; previously-stored event awards (e.g. tutorial-complete) are returned
 * as-is. Response: { awards: [{ id, grantedAt }] }.
 */
export async function handleAwards(request: Request, env: Env, url: URL): Promise<Response> {
  const db = env.DB;
  if (db === undefined) return noDb();
  const userId = await resolveUserId(request, env, url);
  if (userId === undefined) return Response.json({ error: 'Invalid token' }, { status: 401 });
  if (userId === null || userId === '') {
    return Response.json({ error: 'Missing user (Bearer token or ?u=)' }, { status: 400 });
  }

  // Auto-grant any freshly-earned stat awards, then read the full set back.
  const now = Date.now();
  const earned = earnedStatAwardIds(await computeStats(env, userId));
  if (earned.length > 0) {
    await db.batch(
      earned.map((id) =>
        db
          .prepare(
            'INSERT OR IGNORE INTO user_awards (user_id, award_id, granted_at) VALUES (?1, ?2, ?3)',
          )
          .bind(userId, id, now),
      ),
    );
  }
  const rows = await db
    .prepare('SELECT award_id, granted_at FROM user_awards WHERE user_id = ?1')
    .bind(userId)
    .all<{ award_id: string; granted_at: number }>();
  return Response.json({
    awards: rows.results.map((r) => ({ id: r.award_id, grantedAt: r.granted_at })),
  });
}

/**
 * POST /api/awards/grant { awardId } → grant a client-attested EVENT award
 * (allowlisted by EVENT_AWARD_IDS). Idempotent (INSERT OR IGNORE). Low stakes
 * — the reward is a cosmetic — so the allowlist is the guard, not attestation.
 */
export async function handleAwardGrant(request: Request, env: Env, url: URL): Promise<Response> {
  const db = env.DB;
  if (db === undefined) return noDb();
  const userId = await resolveUserId(request, env, url);
  if (userId === undefined) return Response.json({ error: 'Invalid token' }, { status: 401 });
  if (userId === null || userId === '') {
    return Response.json({ error: 'Missing user (Bearer token or ?u=)' }, { status: 400 });
  }
  let awardId: unknown;
  try {
    awardId = ((await request.json()) as { awardId?: unknown }).awardId;
  } catch {
    return Response.json({ error: 'Bad JSON' }, { status: 400 });
  }
  if (typeof awardId !== 'string' || !EVENT_AWARD_IDS.has(awardId)) {
    return Response.json({ error: 'Unknown or non-grantable award' }, { status: 400 });
  }
  await db
    .prepare(
      'INSERT OR IGNORE INTO user_awards (user_id, award_id, granted_at) VALUES (?1, ?2, ?3)',
    )
    .bind(userId, awardId, Date.now())
    .run();
  return Response.json({ ok: true });
}
