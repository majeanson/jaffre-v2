import { SELF, env } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import { EVENT_AWARD_IDS, earnedStatAwardIds, type AwardEvalStats } from '../src/awards.js';

/**
 * Awards has two halves: the pure earn predicates (unit-tested against a
 * hand-built stats object) and the /api/awards endpoints (self-healing stat
 * grant on read + allowlisted event grant), tested end-to-end via seeded games.
 */

const ZERO_STATS: AwardEvalStats = {
  games: 0,
  wins: 0,
  winRate: 0,
  netPoints: 0,
  bids: { attempted: 0, made: 0 },
  sansAtout: { attempted: 0, made: 0 },
  streak: { current: 0, best: 0 },
  nemesis: null,
};

describe('earnedStatAwardIds', () => {
  it('earns nothing for a zeroed record', () => {
    expect(earnedStatAwardIds(ZERO_STATS)).toEqual([]);
  });

  it('earns first-game after a single finished game', () => {
    expect(earnedStatAwardIds({ ...ZERO_STATS, games: 1 })).toContain('first-game');
  });

  it('earns first-win and ten-wins at the right thresholds', () => {
    expect(earnedStatAwardIds({ ...ZERO_STATS, wins: 1 })).toContain('first-win');
    expect(earnedStatAwardIds({ ...ZERO_STATS, wins: 1 })).not.toContain('ten-wins');
    expect(earnedStatAwardIds({ ...ZERO_STATS, wins: 10 })).toContain('ten-wins');
  });

  it('earns milestone awards from the matching stat fields', () => {
    expect(earnedStatAwardIds({ ...ZERO_STATS, streak: { current: 0, best: 5 } })).toContain(
      'win-streak-5',
    );
    expect(earnedStatAwardIds({ ...ZERO_STATS, netPoints: 100 })).toContain('century');
    expect(earnedStatAwardIds({ ...ZERO_STATS, sansAtout: { attempted: 5, made: 3 } })).toContain(
      'sans-atout-master',
    );
    expect(earnedStatAwardIds({ ...ZERO_STATS, games: 50 })).toContain('veteran');
    expect(
      earnedStatAwardIds({ ...ZERO_STATS, nemesis: { name: 'X', games: 2, losses: 2 } }),
    ).toContain('nemesis-born');
  });
});

async function seedWin(userId: string): Promise<void> {
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO games (id, room_code, seed, started_at, finished_at, winner_team, score_0, score_1, action_log, round_summaries)
       VALUES (?1, 'aw', 1, 1000, 1000, 0, 90, 40, '[]', NULL)`,
    ).bind(`award-g-${userId}`),
    env.DB.prepare(
      'INSERT INTO game_players (game_id, seat, user_id, is_bot, name) VALUES (?1, 0, ?2, 0, ?3)',
    ).bind(`award-g-${userId}`, userId, userId),
  ]);
}

describe('GET /api/awards', () => {
  it('returns an empty set for a user with no games', async () => {
    const res = await SELF.fetch('https://example.com/api/awards?u=aw-nobody');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ awards: [] });
  });

  it('400s a userless request', async () => {
    const res = await SELF.fetch('https://example.com/api/awards');
    expect(res.status).toBe(400);
  });

  it('auto-grants a stat award once a game is won and is idempotent', async () => {
    await seedWin('aw-alice');
    const first = (await (
      await SELF.fetch('https://example.com/api/awards?u=aw-alice')
    ).json()) as {
      awards: { id: string }[];
    };
    expect(first.awards.map((a) => a.id)).toContain('first-win');

    // A second read must not duplicate the grant.
    const second = (await (
      await SELF.fetch('https://example.com/api/awards?u=aw-alice')
    ).json()) as { awards: { id: string }[] };
    expect(second.awards.filter((a) => a.id === 'first-win')).toHaveLength(1);
  });
});

describe('POST /api/awards/grant', () => {
  it('grants an allowlisted event award, idempotently', async () => {
    expect(EVENT_AWARD_IDS.has('tutorial-complete')).toBe(true);
    for (let i = 0; i < 2; i++) {
      const res = await SELF.fetch('https://example.com/api/awards/grant?u=aw-zoe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ awardId: 'tutorial-complete' }),
      });
      expect(res.status).toBe(200);
    }
    const got = (await (await SELF.fetch('https://example.com/api/awards?u=aw-zoe')).json()) as {
      awards: { id: string }[];
    };
    expect(got.awards.filter((a) => a.id === 'tutorial-complete')).toHaveLength(1);
  });

  it('rejects an award not on the event allowlist', async () => {
    const res = await SELF.fetch('https://example.com/api/awards/grant?u=aw-zoe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ awardId: 'first-win' }),
    });
    expect(res.status).toBe(400);
  });

  it('refuses a spectating award through the grant endpoint', async () => {
    // Spectating awards are derived from a server-written counter. If the POST
    // allowlist ever let one through, watching would become self-attested.
    for (const id of ['watcher', 'commentator', 'the-rail']) {
      expect(EVENT_AWARD_IDS.has(id), id).toBe(false);
      const res = await SELF.fetch('https://example.com/api/awards/grant?u=aw-zoe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ awardId: id }),
      });
      expect(res.status, id).toBe(400);
    }
  });
});

describe('spectating awards', () => {
  it('are earned from the watch count, at each step', () => {
    const base: AwardEvalStats = {
      games: 0,
      wins: 0,
      winRate: 0,
      netPoints: 0,
      bids: { attempted: 0, made: 0 },
      sansAtout: { attempted: 0, made: 0 },
      streak: { current: 0, best: 0 },
      nemesis: null,
    };
    expect(earnedStatAwardIds({ ...base, spectated: 0 })).not.toContain('watcher');
    expect(earnedStatAwardIds({ ...base, spectated: 1 })).toContain('watcher');
    expect(earnedStatAwardIds({ ...base, spectated: 9 })).not.toContain('commentator');
    expect(earnedStatAwardIds({ ...base, spectated: 10 })).toContain('commentator');
    expect(earnedStatAwardIds({ ...base, spectated: 50 })).toContain('the-rail');
  });

  it('treat a server without the counter as zero, not as earned', () => {
    // The field is optional so an older payload can't accidentally hand out
    // every spectating award at once.
    const noField: AwardEvalStats = {
      games: 5,
      wins: 2,
      winRate: 0.4,
      netPoints: 0,
      bids: { attempted: 0, made: 0 },
      sansAtout: { attempted: 0, made: 0 },
      streak: { current: 0, best: 0 },
      nemesis: null,
    };
    const earned = earnedStatAwardIds(noField);
    expect(earned).not.toContain('watcher');
    expect(earned).not.toContain('commentator');
    expect(earned).not.toContain('the-rail');
  });
});
