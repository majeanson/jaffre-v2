/**
 * The game archive: the list of finished games a player was in, and the
 * seed + action log that replays any one of them.
 *
 * `playersByGame` is the shared roster read — history and replay drop
 * `userId` before answering (it never reaches the client), while stats keeps
 * it for the partner/nemesis lookup.
 */
import type { RoundSummary } from '@jaffre/engine';
import type { Env } from '../env.js';
import { displayName } from '../publicId.js';
import { memorableFlags } from '../history.js';
import { noDb, resolveUserId } from './http.js';

export interface GamePlayer {
  readonly seat: number;
  readonly name: string;
  readonly isBot: boolean;
  readonly userId: string | null;
}

/** {seat, name, isBot, userId}[] per game_id, ordered by seat — shared by
 * history, replay and stats (userId is dropped before it reaches the client
 * in the history/replay responses; stats needs it for the partner lookup). */
/**
 * D1 refuses a query with more than 100 bound parameters, and this builds one
 * per game id. History asks for 20, but `computeStats` asks for EVERY finished
 * game a player has — so the un-chunked version broke on a player's 101st game
 * and stayed broken, taking `/api/awards` down with it (same computeStats), and
 * silently stopping progression for the most invested players. Chunked well
 * under the ceiling; the id list is the only thing that grows.
 */
const ID_CHUNK = 80;

export async function playersByGame(
  env: Env,
  gameIds: readonly string[],
): Promise<Map<string, GamePlayer[]>> {
  const map = new Map<string, GamePlayer[]>();
  const db = env.DB;
  if (gameIds.length === 0 || db === undefined) return map;

  for (let start = 0; start < gameIds.length; start += ID_CHUNK) {
    const chunk = gameIds.slice(start, start + ID_CHUNK);
    const placeholders = chunk.map((_, i) => `?${String(i + 1)}`).join(', ');
    const rows = await db
      .prepare(
        `SELECT game_id, seat, name, is_bot, user_id FROM game_players WHERE game_id IN (${placeholders}) ORDER BY seat`,
      )
      .bind(...chunk)
      .all<{
        game_id: string;
        seat: number;
        name: string | null;
        is_bot: number;
        user_id: string | null;
      }>();
    for (const r of rows.results) {
      const list = map.get(r.game_id) ?? [];
      // Disambiguated at READ, not at write: the game_players row is a snapshot
      // taken when the game ended, and rewriting history is not this layer's job.
      list.push({
        seat: r.seat,
        name: r.is_bot === 1 ? (r.name ?? 'Player') : displayName(r.name, r.user_id),
        isBot: r.is_bot === 1,
        userId: r.user_id,
      });
      map.set(r.game_id, list);
    }
  }
  return map;
}

/** Rows per page — kept in one place since both the SQL LIMIT and the
 * client's "was that a full page" (net/history.ts) guess have to agree. */
const HISTORY_PAGE_SIZE = 20;

/**
 * GET /api/history?u=<userId> (or Bearer token)[&before=<finishedAt>] → up to
 * HISTORY_PAGE_SIZE finished games, newest first. `before` pages backward
 * (strictly older than that finishedAt) — the client's cursor is always the
 * OLDEST row of the page it already has, since finishedAt is monotonic with
 * the ORDER BY. Omitted, it's page one.
 */
export async function handleHistory(request: Request, env: Env, url: URL): Promise<Response> {
  if (env.DB === undefined) return noDb();
  const userId = await resolveUserId(request, env, url);
  if (userId === undefined) return Response.json({ error: 'Invalid token' }, { status: 401 });
  if (userId === null || userId === '') {
    return Response.json({ error: 'Missing user (Bearer token or ?u=)' }, { status: 400 });
  }
  const beforeParam = url.searchParams.get('before');
  const before = beforeParam !== null && beforeParam !== '' ? Number(beforeParam) : null;
  const rows = await env.DB.prepare(
    `SELECT g.id, g.room_code, g.finished_at, g.winner_team, g.score_0, g.score_1, g.round_summaries, gp.seat
     FROM games g JOIN game_players gp ON gp.game_id = g.id
     WHERE gp.user_id = ?1 AND (?2 IS NULL OR g.finished_at < ?2)
     ORDER BY g.finished_at DESC
     LIMIT ${String(HISTORY_PAGE_SIZE)}`,
  )
    .bind(userId, before)
    .all<{
      id: string;
      room_code: string;
      finished_at: number | null;
      winner_team: number | null;
      score_0: number | null;
      score_1: number | null;
      round_summaries: string | null;
      seat: number;
    }>();
  const players = await playersByGame(
    env,
    rows.results.map((r) => r.id),
  );
  return Response.json({
    games: rows.results.map((r) => {
      // A missing/corrupt log must never sink the row it's attached to — just
      // the flags that would have come from it.
      let summaries: readonly RoundSummary[] = [];
      if (r.round_summaries !== null) {
        try {
          summaries = JSON.parse(r.round_summaries) as readonly RoundSummary[];
        } catch {
          summaries = [];
        }
      }
      const flags = memorableFlags(
        summaries,
        r.winner_team === 0 || r.winner_team === 1 ? r.winner_team : null,
      );
      return {
        id: r.id,
        roomCode: r.room_code,
        finishedAt: r.finished_at,
        winnerTeam: r.winner_team,
        scores: [r.score_0, r.score_1],
        yourSeat: r.seat,
        players: (players.get(r.id) ?? []).map((p) => ({
          seat: p.seat,
          name: p.name,
          isBot: p.isBot,
        })),
        ...flags,
      };
    }),
  });
}

/**
 * GET /api/replay/:gameId → {seed, actions, players}. Deliberately
 * unauthenticated — this is the one place the redaction story ends. A
 * finished game is over: no hand is secret from anyone anymore once the last
 * card's played, so a replay link is a shareable public record, same idea as
 * a chess.com game link. The gameId is the only credential and it's
 * unguessable-enough (server-minted, not a room code), which is the same bar
 * `handleHistory` accepts for its own game ids. If that ever needs tightening,
 * it's a product decision (do we want replays to be private?), not a gap.
 */
export async function handleReplay(env: Env, gameId: string): Promise<Response> {
  if (env.DB === undefined) return noDb();
  const row = await env.DB.prepare(
    `SELECT seed, action_log, room_code, finished_at, winner_team, score_0, score_1
     FROM games WHERE id = ?1`,
  )
    .bind(gameId)
    .first<{
      seed: number;
      action_log: string | null;
      room_code: string;
      finished_at: number | null;
      winner_team: number | null;
      score_0: number;
      score_1: number;
    }>();
  if (row === null) return Response.json({ error: 'Unknown game' }, { status: 404 });
  const players = await playersByGame(env, [gameId]);
  return Response.json({
    seed: row.seed,
    actions: row.action_log !== null ? (JSON.parse(row.action_log) as unknown) : [],
    players: (players.get(gameId) ?? []).map((p) => ({
      seat: p.seat,
      name: p.name,
      isBot: p.isBot,
    })),
    // Same D1 row as the /api/history list carries — lets the replay header
    // (Replay.tsx) show "Room X · date · 41–33" without a second fetch.
    roomCode: row.room_code,
    finishedAt: row.finished_at,
    winnerTeam: row.winner_team,
    scores: [row.score_0, row.score_1],
  });
}
