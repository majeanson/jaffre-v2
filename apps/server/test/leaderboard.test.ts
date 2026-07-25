import { SELF, env } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import { publicId } from '../src/publicId.js';

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

  it("includes the caller's own rank when identified and ranked", async () => {
    await seedUser('lb-me', 'Me', 1200, 15);
    const res = await SELF.fetch('https://example.com/api/leaderboard?u=lb-me');
    const data = (await res.json()) as { you: { id: string; rank: number } | null };
    expect(data.you?.id).toBe(publicId('lb-me'));
    expect(typeof data.you?.rank).toBe('number');
  });
});
