import { SELF, env } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import type { RoundSummary } from '@jaffre/engine';

/**
 * /api/history (paging + memorable-game flags) and /api/replay (the extra
 * D1 columns Replay.tsx's header needs) — seeded straight into D1, same
 * pattern as stats.test.ts/head2head.test.ts.
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
  readonly winnerTeam: number | null;
  readonly scores?: readonly [number, number];
  readonly roundSummaries?: readonly RoundSummary[] | null;
  readonly players: readonly {
    readonly seat: number;
    readonly userId: string | null;
    readonly isBot?: 0 | 1;
    readonly name: string;
  }[];
}

async function seedGame(g: SeedGame): Promise<void> {
  const [score0, score1] = g.scores ?? [0, 0];
  const roundSummaries = g.roundSummaries ?? null;
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO games (id, room_code, seed, started_at, finished_at, winner_team, score_0, score_1, action_log, round_summaries)
       VALUES (?1, ?2, 1, ?3, ?3, ?4, ?6, ?7, '[]', ?5)`,
    ).bind(
      g.id,
      g.roomCode,
      g.finishedAt,
      g.winnerTeam,
      roundSummaries !== null ? JSON.stringify(roundSummaries) : null,
      score0,
      score1,
    ),
    ...g.players.map((p) =>
      env.DB.prepare(
        'INSERT INTO game_players (game_id, seat, user_id, is_bot, name) VALUES (?1, ?2, ?3, ?4, ?5)',
      ).bind(g.id, p.seat, p.userId, p.isBot ?? 0, p.name),
    ),
  ]);
}

interface HistoryPayload {
  games: {
    id: string;
    finishedAt: number;
    hailMary: boolean;
    sweep: boolean;
    comeback: boolean;
  }[];
}

async function readHistory(uid: string, before?: number): Promise<HistoryPayload> {
  const path =
    before === undefined
      ? `https://example.com/api/history?u=${uid}`
      : `https://example.com/api/history?u=${uid}&before=${String(before)}`;
  const res = await SELF.fetch(path);
  expect(res.status).toBe(200);
  return (await res.json()) as HistoryPayload;
}

describe('GET /api/history', () => {
  it('pages backward on ?before, keeping 20 per page', async () => {
    // 25 finished games, newest (finishedAt 25000) first.
    for (let i = 1; i <= 25; i++) {
      await seedGame({
        id: `page-${String(i)}`,
        roomCode: 'r',
        finishedAt: i * 1000,
        winnerTeam: 0,
        players: [{ seat: 0, userId: 'pager', name: 'Pager' }],
      });
    }
    const first = await readHistory('pager');
    expect(first.games).toHaveLength(20);
    expect(first.games[0]?.id).toBe('page-25'); // newest first
    expect(first.games[19]?.id).toBe('page-6');

    const oldest = first.games[19]?.finishedAt as number;
    const second = await readHistory('pager', oldest);
    expect(second.games).toHaveLength(5);
    expect(second.games[0]?.id).toBe('page-5');
    expect(second.games[4]?.id).toBe('page-1');
    // No overlap between the two pages.
    const firstIds = new Set(first.games.map((g) => g.id));
    for (const g of second.games) expect(firstIds.has(g.id)).toBe(false);
  });

  it('flags a made 12 sans-atout round as hailMary, prioritized over the rest', async () => {
    await seedGame({
      id: 'flag-hailmary',
      roomCode: 'r',
      finishedAt: 1000,
      winnerTeam: 0,
      roundSummaries: [
        summary({
          contract: { seat: 0, value: 12, sansAtout: true, forced: false },
          contractMade: true,
          scores: [12, 0],
        }),
      ],
      players: [{ seat: 0, userId: 'hm', name: 'HM' }],
    });
    const data = await readHistory('hm');
    const g = data.games.find((x) => x.id === 'flag-hailmary');
    expect(g).toMatchObject({ hailMary: true });
  });

  it('flags a round where one team took all 8 tricks as sweep', async () => {
    await seedGame({
      id: 'flag-sweep',
      roomCode: 'r',
      finishedAt: 1000,
      winnerTeam: 0,
      roundSummaries: [
        summary({
          contract: { seat: 0, value: 8, sansAtout: false, forced: false },
          contractMade: true,
          trump: 'red',
          trickCounts: [5, 0, 3, 0],
          scores: [10, 0],
        }),
      ],
      players: [{ seat: 0, userId: 'sw', name: 'SW' }],
    });
    const data = await readHistory('sw');
    const g = data.games.find((x) => x.id === 'flag-sweep');
    expect(g).toMatchObject({ sweep: true, hailMary: false });
  });

  it('flags a game the winner trailed badly in as comeback, but not the final round alone', async () => {
    await seedGame({
      id: 'flag-comeback',
      roomCode: 'r',
      finishedAt: 1000,
      winnerTeam: 0,
      roundSummaries: [
        // After round 1: team 0 is down 0-15 — a real deficit.
        summary({
          contract: { seat: 1, value: 10, sansAtout: false, forced: false },
          contractMade: true,
          scores: [0, 15],
        }),
        // Final round: team 0 pulls ahead and wins.
        summary({
          contract: { seat: 0, value: 12, sansAtout: false, forced: false },
          contractMade: true,
          scores: [41, 15],
        }),
      ],
      players: [{ seat: 0, userId: 'cb', name: 'CB' }],
    });
    const data = await readHistory('cb');
    const g = data.games.find((x) => x.id === 'flag-comeback');
    expect(g).toMatchObject({ comeback: true });
  });

  it('does not flag a close game with no big deficit and no sweep/hail-mary', async () => {
    await seedGame({
      id: 'flag-none',
      roomCode: 'r',
      finishedAt: 1000,
      winnerTeam: 0,
      roundSummaries: [
        summary({
          contract: { seat: 0, value: 8, sansAtout: false, forced: false },
          contractMade: true,
          trickCounts: [3, 2, 2, 1],
          scores: [8, 2],
        }),
      ],
      players: [{ seat: 0, userId: 'none', name: 'None' }],
    });
    const data = await readHistory('none');
    const g = data.games.find((x) => x.id === 'flag-none');
    expect(g).toEqual(expect.objectContaining({ hailMary: false, sweep: false, comeback: false }));
  });
});

describe('GET /api/replay/:id', () => {
  it('carries the same roomCode/finishedAt/scores/winnerTeam as the history row', async () => {
    await seedGame({
      id: 'replay-header',
      roomCode: 'salon',
      finishedAt: 5000,
      winnerTeam: 1,
      scores: [33, 41],
      players: [
        { seat: 0, userId: 'p0', name: 'P0' },
        { seat: 1, userId: 'p1', name: 'P1' },
      ],
    });
    const res = await SELF.fetch('https://example.com/api/replay/replay-header');
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      roomCode: string;
      finishedAt: number;
      winnerTeam: number;
      scores: [number, number];
    };
    expect(body.roomCode).toBe('salon');
    expect(body.finishedAt).toBe(5000);
    expect(body.winnerTeam).toBe(1);
    expect(body.scores).toEqual([33, 41]);
  });

  it('404s an unknown game id', async () => {
    const res = await SELF.fetch('https://example.com/api/replay/no-such-game');
    expect(res.status).toBe(404);
  });
});
