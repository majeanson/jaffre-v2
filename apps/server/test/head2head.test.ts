import { SELF, env } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import { publicId } from '../src/publicId.js';

/**
 * /api/head2head — your record with and against one player, addressed by their
 * PUBLIC id. Seeded straight into D1 like stats.test.ts: this is a read-side
 * derivation, and the write path (persistHistory) is covered in room.test.ts.
 */

interface SeedPlayer {
  readonly seat: number;
  readonly userId: string | null;
  readonly isBot?: 0 | 1;
  readonly name: string;
}

async function seedGame(
  id: string,
  finishedAt: number,
  winnerTeam: number,
  players: readonly SeedPlayer[],
): Promise<void> {
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO games (id, room_code, seed, started_at, finished_at, winner_team, score_0, score_1, action_log, round_summaries)
       VALUES (?1, ?2, 1, ?3, ?3, ?4, 90, 40, '[]', NULL)`,
    ).bind(id, `room-${id}`, finishedAt, winnerTeam),
    ...players.map((p) =>
      env.DB.prepare(
        'INSERT INTO game_players (game_id, seat, user_id, is_bot, name) VALUES (?1, ?2, ?3, ?4, ?5)',
      ).bind(id, p.seat, p.userId, p.isBot ?? 0, p.name),
    ),
  ]);
}

interface H2H {
  pid: string;
  name: string | null;
  together: { games: number; wins: number };
  against: { games: number; wins: number };
  games: {
    id: string;
    roomCode: string;
    side: 'with' | 'vs';
    yourSeat: number;
    players: { seat: number; name: string; isBot: boolean }[];
  }[];
}

async function read(uid: string, pid: string): Promise<H2H> {
  const res = await SELF.fetch(`https://example.com/api/head2head?u=${uid}&vs=${pid}`);
  expect(res.status).toBe(200);
  return (await res.json()) as H2H;
}

describe('GET /api/head2head', () => {
  it('400s a malformed or missing pid', async () => {
    expect((await SELF.fetch('https://example.com/api/head2head?u=me')).status).toBe(400);
    expect((await SELF.fetch('https://example.com/api/head2head?u=me&vs=Ginette')).status).toBe(
      400,
    );
  });

  it('400s a userless request', async () => {
    const res = await SELF.fetch(`https://example.com/api/head2head?vs=${publicId('x')}`);
    expect(res.status).toBe(400);
  });

  it('splits the shared games into with/against, counting YOUR wins in each', async () => {
    // Three shared games with Ginette: partnered (won), partnered (lost),
    // opposed (won) — so together 1/2 and against 1/1.
    await seedGame('h2h-1', 1000, 0, [
      { seat: 0, userId: 'h-me', name: 'Me' },
      { seat: 1, userId: 'h-other', name: 'Other' },
      { seat: 2, userId: 'h-gin', name: 'Ginette' },
      { seat: 3, userId: null, isBot: 1, name: 'Bot 4' },
    ]);
    await seedGame('h2h-2', 2000, 1, [
      { seat: 0, userId: 'h-me', name: 'Me' },
      { seat: 1, userId: null, isBot: 1, name: 'Bot 2' },
      { seat: 2, userId: 'h-gin', name: 'Ginette' },
      { seat: 3, userId: null, isBot: 1, name: 'Bot 4' },
    ]);
    await seedGame('h2h-3', 3000, 1, [
      { seat: 0, userId: 'h-gin', name: 'Ginette' },
      { seat: 1, userId: 'h-me', name: 'Me' },
      { seat: 2, userId: null, isBot: 1, name: 'Bot 3' },
      { seat: 3, userId: null, isBot: 1, name: 'Bot 4' },
    ]);
    // A game she wasn't in must not appear anywhere in the answer.
    await seedGame('h2h-4', 4000, 0, [
      { seat: 0, userId: 'h-me', name: 'Me' },
      { seat: 1, userId: null, isBot: 1, name: 'Bot 2' },
      { seat: 2, userId: null, isBot: 1, name: 'Bot 3' },
      { seat: 3, userId: null, isBot: 1, name: 'Bot 4' },
    ]);

    const data = await read('h-me', publicId('h-gin'));
    expect(data.name).toBe('Ginette');
    expect(data.together).toEqual({ games: 2, wins: 1 });
    expect(data.against).toEqual({ games: 1, wins: 1 });
    // Newest first, and only the shared ones.
    expect(data.games.map((g) => g.id)).toEqual(['h2h-3', 'h2h-2', 'h2h-1']);
    expect(data.games.map((g) => g.side)).toEqual(['vs', 'with', 'with']);
    expect(data.games[0]?.yourSeat).toBe(1);
    // Each row carries the full roster in the history shape — the client
    // renders these with the same component as the games list.
    expect(data.games[0]?.players).toHaveLength(4);
  });

  it('answers a pid you have never sat with, rather than erroring', async () => {
    await seedGame('h2h-solo', 1000, 0, [
      { seat: 0, userId: 'h-lonely', name: 'Lonely' },
      { seat: 1, userId: null, isBot: 1, name: 'Bot 2' },
      { seat: 2, userId: null, isBot: 1, name: 'Bot 3' },
      { seat: 3, userId: null, isBot: 1, name: 'Bot 4' },
    ]);
    const data = await read('h-lonely', publicId('a-stranger'));
    expect(data.name).toBeNull();
    expect(data.together).toEqual({ games: 0, wins: 0 });
    expect(data.against).toEqual({ games: 0, wins: 0 });
    expect(data.games).toEqual([]);
  });

  it('never leaks a uid, and disambiguates an unnamed opponent like every other surface', async () => {
    // 'Player' is the untouched default — publicId's displayName rule appends
    // the last 4 hex of their pid, here as everywhere else.
    await seedGame('h2h-anon', 1000, 0, [
      { seat: 0, userId: 'h-named', name: 'Named' },
      { seat: 1, userId: 'h-guest', name: 'Player' },
      { seat: 2, userId: null, isBot: 1, name: 'Bot 3' },
      { seat: 3, userId: null, isBot: 1, name: 'Bot 4' },
    ]);
    const res = await SELF.fetch(
      `https://example.com/api/head2head?u=h-named&vs=${publicId('h-guest')}`,
    );
    const body = await res.text();
    expect(body).not.toContain('h-guest');
    expect(JSON.parse(body).name).toBe(`Player ${publicId('h-guest').slice(-4)}`);
  });
});
