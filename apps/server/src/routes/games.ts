/**
 * The game archive: the list of finished games a player was in, and the
 * seed + action log that replays any one of them.
 *
 * `playersByGame` is the shared roster read — history and replay drop
 * `userId` before answering (it never reaches the client), while stats keeps
 * it for the partner/nemesis lookup.
 */
import type { Env } from '../env.js';
import { displayName } from '../publicId.js';
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
export async function playersByGame(
  env: Env,
  gameIds: readonly string[],
): Promise<Map<string, GamePlayer[]>> {
  const map = new Map<string, GamePlayer[]>();
  if (gameIds.length === 0 || env.DB === undefined) return map;
  const placeholders = gameIds.map((_, i) => `?${String(i + 1)}`).join(', ');
  const rows = await env.DB.prepare(
    `SELECT game_id, seat, name, is_bot, user_id FROM game_players WHERE game_id IN (${placeholders}) ORDER BY seat`,
  )
    .bind(...gameIds)
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
  return map;
}

/** GET /api/history?u=<userId> (or Bearer token) → last 20 finished games. */
export async function handleHistory(request: Request, env: Env, url: URL): Promise<Response> {
  if (env.DB === undefined) return noDb();
  const userId = await resolveUserId(request, env, url);
  if (userId === undefined) return Response.json({ error: 'Invalid token' }, { status: 401 });
  if (userId === null || userId === '') {
    return Response.json({ error: 'Missing user (Bearer token or ?u=)' }, { status: 400 });
  }
  const rows = await env.DB.prepare(
    `SELECT g.id, g.room_code, g.finished_at, g.winner_team, g.score_0, g.score_1, gp.seat
     FROM games g JOIN game_players gp ON gp.game_id = g.id
     WHERE gp.user_id = ?1
     ORDER BY g.finished_at DESC
     LIMIT 20`,
  )
    .bind(userId)
    .all<{
      id: string;
      room_code: string;
      finished_at: number | null;
      winner_team: number | null;
      score_0: number | null;
      score_1: number | null;
      seat: number;
    }>();
  const players = await playersByGame(
    env,
    rows.results.map((r) => r.id),
  );
  return Response.json({
    games: rows.results.map((r) => ({
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
    })),
  });
}

/** GET /api/replay/:gameId → {seed, actions, players}. */
export async function handleReplay(env: Env, gameId: string): Promise<Response> {
  if (env.DB === undefined) return noDb();
  const row = await env.DB.prepare('SELECT seed, action_log FROM games WHERE id = ?1')
    .bind(gameId)
    .first<{ seed: number; action_log: string | null }>();
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
  });
}
