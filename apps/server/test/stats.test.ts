import { SELF, env } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import type { RoundSummary } from '@jaffre/engine';
import { publicId } from '../src/publicId.js';

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
      mastery: {
        red: { attempted: 0, made: 0 },
        brown: { attempted: 0, made: 0 },
        green: { attempted: 0, made: 0 },
        blue: { attempted: 0, made: 0 },
      },
      bestPartner: null,
      nemesis: null,
      regulars: [],
      streak: { current: 0, best: 0 },
      spectated: 0,
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
      bestPartner: { pid: string; name: string; games: number; wins: number } | null;
      nemesis: { pid: string; name: string; games: number; losses: number } | null;
      regulars: { pid: string; name: string; withGames: number; vsGames: number }[];
      streak: { current: number; best: number };
    };
    expect(data.games).toBe(3);
    expect(data.wins).toBe(2);
    expect(data.winRate).toBeCloseTo(2 / 3);
    // Margins: +50 (g1) − 60 (g2) + 70 (g3, Alice on team 1) = +60.
    expect(data.netPoints).toBe(60);
    expect(data.bids).toEqual({ attempted: 2, made: 1 });
    expect(data.sansAtout).toEqual({ attempted: 1, made: 0 });
    expect(data.bestPartner).toEqual({
      pid: publicId('carol'),
      name: 'Carol',
      games: 2,
      wins: 1,
    });
    // Bob is the only opponent faced twice (g1 win, g2 loss) → beats you once.
    expect(data.nemesis).toEqual({ pid: publicId('bob'), name: 'Bob', games: 2, losses: 1 });
    // Regulars: 3+ shared games, partnered or opposed. Carol (2 with) and Bob
    // (2 vs) are habits-in-progress, not regulars — nobody qualifies yet, and
    // the threshold has to be able to say no or the list is just "everyone".
    expect(data.regulars).toEqual([]);
    // Ascending order: win, loss, win — the trailing streak is 1, best is 1.
    expect(data.streak).toEqual({ current: 1, best: 1 });
  });

  /**
   * Regulars are the head-to-head view's directory: the whole point is that
   * "with" and "against" games COUNT TOGETHER, because the person you keep
   * running into at a public table is one person however the teams fell.
   */
  it('lists regulars by total shared games, merging partnered and opposed', async () => {
    const roster = (mateSeat: number, foeSeat: number, thirdSeat: number) => [
      { seat: 0, userId: 'reg-me', isBot: 0 as const, name: 'Me' },
      { seat: mateSeat, userId: 'reg-mate', isBot: 0 as const, name: 'Mate' },
      { seat: foeSeat, userId: 'reg-foe', isBot: 0 as const, name: 'Foe' },
      { seat: thirdSeat, userId: null, isBot: 1 as const, name: 'Bot' },
    ];
    // Mate partners twice then sits across once → 3 shared. Foe is across all
    // three times → 3 shared. A one-off (Passing) never reaches the threshold.
    await seedGame({
      id: 'reg-g1',
      roomCode: 'x1',
      finishedAt: 10_000,
      winnerTeam: 0,
      roundSummaries: null,
      players: roster(2, 1, 3),
    });
    await seedGame({
      id: 'reg-g2',
      roomCode: 'x2',
      finishedAt: 20_000,
      winnerTeam: 1,
      roundSummaries: null,
      players: roster(2, 3, 1),
    });
    await seedGame({
      id: 'reg-g3',
      roomCode: 'x3',
      finishedAt: 30_000,
      winnerTeam: 0,
      roundSummaries: null,
      players: [
        { seat: 0, userId: 'reg-me', isBot: 0, name: 'Me' },
        { seat: 1, userId: 'reg-mate', isBot: 0, name: 'Mate' },
        { seat: 2, userId: 'reg-passing', isBot: 0, name: 'Passing' },
        { seat: 3, userId: 'reg-foe', isBot: 0, name: 'Foe' },
      ],
    });

    const res = await SELF.fetch('https://example.com/api/stats?u=reg-me');
    const data = (await res.json()) as {
      regulars: { pid: string; name: string; withGames: number; vsGames: number }[];
    };
    expect(data.regulars).toEqual([
      { pid: publicId('reg-mate'), name: 'Mate', withGames: 2, vsGames: 1 },
      { pid: publicId('reg-foe'), name: 'Foe', withGames: 0, vsGames: 3 },
    ]);
  });

  it('splits declared contracts into per-trump mastery lanes', async () => {
    // One game, four of Zoe's own contracts across three trumps, plus a
    // sans-atout (no trump) and an OPPONENT's green contract that must not
    // land in her lanes.
    await seedGame({
      id: 'mastery-g1',
      roomCode: 'm1',
      finishedAt: 4000,
      winnerTeam: 0,
      scores: [90, 10],
      roundSummaries: [
        summary({
          contract: { seat: 0, value: 8, sansAtout: false, forced: false },
          contractMade: true,
          trump: 'red',
        }),
        summary({
          contract: { seat: 0, value: 9, sansAtout: false, forced: false },
          contractMade: false,
          trump: 'red',
        }),
        summary({
          contract: { seat: 0, value: 7, sansAtout: false, forced: true },
          contractMade: true,
          trump: 'blue',
        }),
        // Sans-atout has no trump: it belongs to the existing sansAtout
        // counter, NOT to a suit lane.
        summary({
          contract: { seat: 0, value: 10, sansAtout: true, forced: false },
          contractMade: true,
          trump: null,
        }),
        // Seat 1 is an opponent — their green contract is not Zoe's mastery.
        summary({
          contract: { seat: 1, value: 8, sansAtout: false, forced: false },
          contractMade: true,
          trump: 'green',
        }),
      ],
      players: [
        { seat: 0, userId: 'zoe', isBot: 0, name: 'Zoe' },
        { seat: 1, userId: 'yan', isBot: 0, name: 'Yan' },
        { seat: 2, userId: null, isBot: 1, name: 'Bot 3' },
        { seat: 3, userId: null, isBot: 1, name: 'Bot 4' },
      ],
    });

    const res = await SELF.fetch('https://example.com/api/stats?u=zoe');
    expect(res.status).toBe(200);
    const data = (await res.json()) as {
      bids: { attempted: number; made: number };
      sansAtout: { attempted: number; made: number };
      mastery: Record<string, { attempted: number; made: number }>;
    };

    expect(data.mastery).toEqual({
      red: { attempted: 2, made: 1 },
      brown: { attempted: 0, made: 0 },
      green: { attempted: 0, made: 0 }, // the opponent's, not hers
      blue: { attempted: 1, made: 1 },
    });
    // The sans-atout contract stays out of every suit lane.
    expect(data.sansAtout).toEqual({ attempted: 1, made: 1 });
    // All four of her contracts still count toward the overall bid record.
    expect(data.bids).toEqual({ attempted: 4, made: 3 });
  });

  it('ignores an unrecognised trump from a legacy row instead of inventing a lane', async () => {
    await seedGame({
      id: 'mastery-g2',
      roomCode: 'm2',
      finishedAt: 5000,
      winnerTeam: 0,
      scores: [90, 10],
      roundSummaries: [
        // A row written by some older/other build: contract present, trump a
        // value the current engine doesn't know.
        summary({
          contract: { seat: 0, value: 8, sansAtout: false, forced: false },
          contractMade: true,
          trump: 'purple' as never,
        }),
        summary({
          contract: { seat: 0, value: 8, sansAtout: false, forced: false },
          contractMade: true,
          trump: 'green',
        }),
      ],
      players: [
        { seat: 0, userId: 'legacy-user', isBot: 0, name: 'Old' },
        { seat: 1, userId: null, isBot: 1, name: 'Bot 2' },
        { seat: 2, userId: null, isBot: 1, name: 'Bot 3' },
        { seat: 3, userId: null, isBot: 1, name: 'Bot 4' },
      ],
    });

    const res = await SELF.fetch('https://example.com/api/stats?u=legacy-user');
    const data = (await res.json()) as {
      bids: { attempted: number; made: number };
      mastery: Record<string, { attempted: number; made: number }>;
    };

    // Exactly the four known suits — no 'purple' key.
    expect(Object.keys(data.mastery).sort()).toEqual(['blue', 'brown', 'green', 'red']);
    expect(data.mastery.green).toEqual({ attempted: 1, made: 1 });
    // The unknown-trump contract is still a contract for the overall record.
    expect(data.bids).toEqual({ attempted: 2, made: 2 });
  });

  /**
   * D1 refuses more than 100 bound parameters in one query, and the roster
   * lookup binds one per game. `computeStats` reads EVERY finished game a
   * player has, so this used to break the moment somebody finished their
   * 101st — permanently, and it took /api/awards down with it, since that
   * evaluates the same aggregate. 120 games puts us well past the ceiling.
   */
  it('survives a player with more than 100 finished games', async () => {
    const uid = 'century-player';
    const total = 120;
    for (let i = 0; i < total; i++) {
      await seedGame({
        id: `century-${String(i)}`,
        roomCode: 'century',
        finishedAt: 1_000_000 + i,
        // Alternate the winning team so wins are a number we can predict.
        winnerTeam: i % 2 === 0 ? 0 : 1,
        scores: [5, 3],
        roundSummaries: null,
        players: [
          { seat: 0, userId: uid, isBot: 0, name: 'Century' },
          { seat: 1, userId: null, isBot: 1, name: 'Bot 2' },
          { seat: 2, userId: null, isBot: 1, name: 'Bot 3' },
          { seat: 3, userId: null, isBot: 1, name: 'Bot 4' },
        ],
      });
    }

    const res = await SELF.fetch(`https://example.com/api/stats?u=${uid}`);
    expect(res.status).toBe(200);
    const data = (await res.json()) as { games: number; wins: number };
    expect(data.games).toBe(total);
    // Seat 0 is team 0, and team 0 took every even-indexed game.
    expect(data.wins).toBe(total / 2);

    // The awards endpoint shares computeStats — it must not 500 either.
    const awards = await SELF.fetch(`https://example.com/api/awards?u=${uid}`);
    expect(awards.status).toBe(200);
  });
});
