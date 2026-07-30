/**
 * Head-to-head: your record WITH and AGAINST one other player, plus every
 * game the two of you shared.
 *
 * Derived, like every social fact here — `game_players` rows are the only
 * social graph this codebase has, and this endpoint deliberately doesn't add
 * one. It is the same read `/api/stats` already does for the partner/nemesis
 * picks (your finished games + their rosters), narrowed to one person.
 *
 * The other player is addressed by their PUBLIC id: `pid` is already the
 * shared key the roster and the ladder use, it is one-way (see publicId.ts),
 * and unlike a display name it can't collide. A uid never enters or leaves
 * this endpoint.
 */
import type { Env } from '../env.js';
import { publicId } from '../publicId.js';
import { playersByGame, type GamePlayer } from './games.js';
import { noDb, resolveUserId } from './http.js';

interface Row {
  readonly id: string;
  readonly room_code: string;
  readonly finished_at: number | null;
  readonly winner_team: number | null;
  readonly score_0: number;
  readonly score_1: number;
  readonly seat: number;
}

/** GET /api/head2head?vs=<pid> (+ Bearer token or ?u=) → the shared record. */
export async function handleHeadToHead(request: Request, env: Env, url: URL): Promise<Response> {
  const db = env.DB;
  if (db === undefined) return noDb();
  const userId = await resolveUserId(request, env, url);
  if (userId === undefined) return Response.json({ error: 'Invalid token' }, { status: 401 });
  if (userId === null || userId === '') {
    return Response.json({ error: 'Missing user (Bearer token or ?u=)' }, { status: 400 });
  }
  const pid = url.searchParams.get('vs');
  // 16 hex chars — publicId's own output. Rejected rather than searched for:
  // anything else cannot match a player, so it is a broken link, not a miss.
  if (pid === null || !/^[0-9a-f]{16}$/.test(pid)) {
    return Response.json({ error: 'Missing or malformed vs=<pid>' }, { status: 400 });
  }

  // Newest first: the games list reads like the history list, and the counters
  // below are order-independent.
  const rows = await db
    .prepare(
      `SELECT g.id, g.room_code, g.finished_at, g.winner_team, g.score_0, g.score_1, gp.seat
       FROM games g JOIN game_players gp ON gp.game_id = g.id
       WHERE gp.user_id = ?1 AND g.finished_at IS NOT NULL
       ORDER BY g.finished_at DESC`,
    )
    .bind(userId)
    .all<Row>();
  const games = rows.results;
  const rosters = await playersByGame(
    env,
    games.map((g) => g.id),
  );

  let name: string | null = null;
  // Their uid, captured off the same first shared game as `name` — needed to
  // look up their cosmetics below, but it must never itself leave this
  // function (see the response at the bottom: color/paint/award only).
  let theirUid: string | null = null;
  const together = { games: 0, wins: 0 };
  const against = { games: 0, wins: 0 };
  const shared: {
    id: string;
    roomCode: string;
    finishedAt: number | null;
    winnerTeam: number | null;
    scores: [number, number];
    yourSeat: number;
    side: 'with' | 'vs';
    players: { seat: number; name: string; isBot: boolean }[];
  }[] = [];

  for (const g of games) {
    const roster = rosters.get(g.id) ?? [];
    const them = roster.find(
      (p: GamePlayer) => !p.isBot && p.userId !== null && publicId(p.userId) === pid,
    );
    if (them === undefined) continue;
    // Their name comes off the most RECENT shared game (rows are newest-first,
    // and playersByGame already applied the displayName rule), so a rename
    // shows up here the same way it does everywhere else.
    name ??= them.name;
    theirUid ??= them.userId;
    const yourTeam = g.seat % 2;
    const side = them.seat % 2 === yourTeam ? 'with' : 'vs';
    const won = g.winner_team !== null && g.winner_team === yourTeam;
    const tally = side === 'with' ? together : against;
    tally.games++;
    if (won) tally.wins++;
    shared.push({
      id: g.id,
      roomCode: g.room_code,
      finishedAt: g.finished_at,
      winnerTeam: g.winner_team,
      scores: [g.score_0, g.score_1],
      yourSeat: g.seat,
      side,
      // Same shape (and same userId-dropping) as /api/history, so the client
      // renders these rows with the very same component.
      players: roster.map((p) => ({ seat: p.seat, name: p.name, isBot: p.isBot })),
    });
  }

  // Their cosmetics, same read as the leaderboard/stats tiles — color, paint,
  // and whichever award they've put first on their trophy shelf. One extra
  // query, only when there IS a shared game (theirUid is null otherwise).
  let color: string | null = null;
  let paint: string | null = null;
  let award: string | null = null;
  if (theirUid !== null) {
    const row = await db
      .prepare('SELECT color, paint, award_order FROM users WHERE id = ?1')
      .bind(theirUid)
      .first<{ color: string | null; paint: string | null; award_order: string | null }>();
    if (row !== null) {
      color = row.color;
      paint = row.paint;
      // Best-effort parse: a malformed award_order must not cost the whole
      // response, just the trophy chip.
      if (row.award_order !== null) {
        try {
          const ids: unknown = JSON.parse(row.award_order);
          if (Array.isArray(ids) && typeof ids[0] === 'string') award = ids[0];
        } catch {
          // leave award null
        }
      }
    }
  }

  // A pid with no shared game answers 200 with a null name rather than 404:
  // "you have never sat with this player" is a true, showable answer, and the
  // pid may simply belong to someone you only ever spectated.
  return Response.json({ pid, name, color, paint, award, together, against, games: shared });
}
