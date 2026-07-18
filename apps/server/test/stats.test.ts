import { SELF, env } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import type { RoundSummary } from '@jaffre/engine';

/**
 * /api/stats aggregates games directly from D1 — seeded here without going
 * through a live GameRoom (room.test.ts already exercises the write path via
 * persistHistory; this covers the read/aggregation side against a small,
 * hand-built fixture with a known answer).
 */

function summary(
  over: Partial<RoundSummary> & Pick<RoundSummary, 'contract' | 'contractMade'>,
): RoundSummary {
  return {
    roundIndex: 0,
    trump: null,
    trickPoints: [0, 0],
    deltas: [0, 0],
    scores: [0, 0],
    ...over,
  };
}

interface SeedGame {
  readonly id: string;
  readonly roomCode: string;
  readonly finishedAt: number;
  readonly winnerTeam: number;
  readonly scores?: readonly [number, number];
  readonly roundSummaries: readonly RoundSummary[] | null;
  readonly players: readonly {
    readonly seat: number;
    readonly userId: string | null;
    readonly isBot: 0 | 1;
    readonly name: string;
  }[];
}

async function seedGame(g: SeedGame): Promise<void> {
  const [score0, score1] = g.scores ?? [0, 0];
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO games (id, room_code, seed, started_at, finished_at, winner_team, score_0, score_1, action_log, round_summaries)
       VALUES (?1, ?2, 1, ?3, ?3, ?4, ?6, ?7, '[]', ?5)`,
    ).bind(
      g.id,
      g.roomCode,
      g.finishedAt,
      g.winnerTeam,
      g.roundSummaries !== null ? JSON.stringify(g.roundSummaries) : null,
      score0,
      score1,
    ),
    ...g.players.map((p) =>
      env.DB.prepare(
        'INSERT INTO game_players (game_id, seat, user_id, is_bot, name) VALUES (?1, ?2, ?3, ?4, ?5)',
      ).bind(g.id, p.seat, p.userId, p.isBot, p.name),
    ),
  ]);
}

describe('GET /api/stats', () => {
  it('returns the zeroed shape for a user with no finished games', async () => {
    const res = await SELF.fetch('https://example.com/api/stats?u=nobody-at-all');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      games: 0,
      wins: 0,
      winRate: 0,
      netPoints: 0,
      bids: { attempted: 0, made: 0 },
      sansAtout: { attempted: 0, made: 0 },
      bestPartner: null,
      nemesis: null,
      streak: { current: 0, best: 0 },
    });
  });

  it('400s a userless request', async () => {
    const res = await SELF.fetch('https://example.com/api/stats');
    expect(res.status).toBe(400);
  });

  it('computes games/wins/bids/sans-atout/partner/streak from seeded rows', async () => {
    // Alice, seat 0, team 0, wins with Carol (seat 2) — a made contract.
    await seedGame({
      id: 'stats-g1',
      roomCode: 'r1',
      finishedAt: 1000,
      winnerTeam: 0,
      scores: [90, 40], // team 0 (Alice) margin +50
      roundSummaries: [
        summary({
          contract: { seat: 0, value: 8, sansAtout: false, forced: false },
          contractMade: true,
        }),
      ],
      players: [
        { seat: 0, userId: 'alice', isBot: 0, name: 'Alice' },
        { seat: 1, userId: 'bob', isBot: 0, name: 'Bob' },
        { seat: 2, userId: 'carol', isBot: 0, name: 'Carol' },
        { seat: 3, userId: 'dave', isBot: 0, name: 'Dave' },
      ],
    });
    // Alice, seat 0, team 0, LOSES with Carol again (breaks the streak).
    await seedGame({
      id: 'stats-g2',
      roomCode: 'r2',
      finishedAt: 2000,
      winnerTeam: 1,
      scores: [30, 90], // team 0 (Alice) margin −60
      roundSummaries: null, // no round summaries recorded — must not crash bid stats
      players: [
        { seat: 0, userId: 'alice', isBot: 0, name: 'Alice' },
        { seat: 1, userId: 'bob', isBot: 0, name: 'Bob' },
        { seat: 2, userId: 'carol', isBot: 0, name: 'Carol' },
        { seat: 3, userId: null, isBot: 1, name: 'Bot 4' }, // Dave sat out — only Bob repeats as opponent
      ],
    });
    // Alice, seat 1, team 1, WINS with a bot teammate — a failed sans-atout bid.
    await seedGame({
      id: 'stats-g3',
      roomCode: 'r3',
      finishedAt: 3000,
      winnerTeam: 1,
      scores: [20, 90], // team 1 (Alice) margin +70
      roundSummaries: [
        summary({
          contract: { seat: 1, value: 9, sansAtout: true, forced: false },
          contractMade: false,
        }),
      ],
      players: [
        { seat: 0, userId: 'erin', isBot: 0, name: 'Erin' },
        { seat: 1, userId: 'alice', isBot: 0, name: 'Alice' },
        { seat: 2, userId: 'frank', isBot: 0, name: 'Frank' },
        { seat: 3, userId: null, isBot: 1, name: 'Bot 4' },
      ],
    });

    const res = await SELF.fetch('https://example.com/api/stats?u=alice');
    expect(res.status).toBe(200);
    const data = (await res.json()) as {
      games: number;
      wins: number;
      winRate: number;
      netPoints: number;
      bids: { attempted: number; made: number };
      sansAtout: { attempted: number; made: number };
      bestPartner: { name: string; games: number; wins: number } | null;
      nemesis: { name: string; games: number; losses: number } | null;
      streak: { current: number; best: number };
    };
    expect(data.games).toBe(3);
    expect(data.wins).toBe(2);
    expect(data.winRate).toBeCloseTo(2 / 3);
    // Margins: +50 (g1) − 60 (g2) + 70 (g3, Alice on team 1) = +60.
    expect(data.netPoints).toBe(60);
    expect(data.bids).toEqual({ attempted: 2, made: 1 });
    expect(data.sansAtout).toEqual({ attempted: 1, made: 0 });
    expect(data.bestPartner).toEqual({ name: 'Carol', games: 2, wins: 1 });
    // Bob is the only opponent faced twice (g1 win, g2 loss) → beats you once.
    expect(data.nemesis).toEqual({ name: 'Bob', games: 2, losses: 1 });
    // Ascending order: win, loss, win — the trailing streak is 1, best is 1.
    expect(data.streak).toEqual({ current: 1, best: 1 });
  });
});
