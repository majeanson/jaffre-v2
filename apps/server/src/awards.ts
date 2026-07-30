/**
 * Award catalog — the server-authoritative half. Kept pure (no DB, no env) so
 * the earn predicates are unit-testable exactly like history.ts / rating.ts.
 *
 * Three flavours of award:
 *  - `stat`   — earned from the player's aggregate stats. Auto-granted on read
 *               (GET /api/awards) so they are self-healing and can't be forged.
 *  - `event`  — earned from a client-attested moment (finishing the tutorial).
 *               Granted via POST /api/awards/grant, gated by EVENT_AWARD_IDS.
 *  - `lazy`   — earned from a SERVER-computed fact with no client attestation
 *               at all (the monthly ladder's champion). Granted opportunistically
 *               wherever that fact is already being read (routes/leaderboard.ts,
 *               on a monthly board request) rather than on a schedule, the same
 *               "no cron, self-heals on the next relevant read" shape stat
 *               awards use — it just isn't driven by /api/awards.
 *
 * The display copy (name/desc/icon) and the cosmetic-reward mapping live on the
 * CLIENT (apps/web/src/awards.ts); this module only owns ids + how they're
 * earned, to avoid duplicating i18n copy across the wire.
 */

/** The subset of the /api/stats payload the earn predicates read. Structural,
 * so it stays compatible with the server's computed stats without an import. */
export interface AwardEvalStats {
  readonly games: number;
  readonly wins: number;
  readonly winRate: number;
  readonly netPoints: number;
  readonly bids: { readonly attempted: number; readonly made: number };
  readonly sansAtout: { readonly attempted: number; readonly made: number };
  readonly streak: { readonly current: number; readonly best: number };
  readonly nemesis: unknown | null;
  /**
   * Games watched through to the end as a spectator. Its own counter rather
   * than an XP source: the XP constants are frozen by design, and adding a
   * source would silently re-level everyone for the least skill-bearing thing
   * in the game. Optional so a caller that hasn't read it evaluates as zero
   * instead of throwing.
   */
  readonly spectated?: number;
}

interface StatAward {
  readonly id: string;
  readonly earned: (s: AwardEvalStats) => boolean;
}

/** Stat-based awards, auto-granted from the player's real aggregate. */
export const STAT_AWARDS: readonly StatAward[] = [
  { id: 'first-game', earned: (s) => s.games >= 1 },
  { id: 'first-win', earned: (s) => s.wins >= 1 },
  { id: 'ten-wins', earned: (s) => s.wins >= 10 },
  { id: 'win-streak-5', earned: (s) => s.streak.best >= 5 },
  { id: 'century', earned: (s) => s.netPoints >= 100 },
  { id: 'sans-atout-master', earned: (s) => s.sansAtout.made >= 3 },
  { id: 'veteran', earned: (s) => s.games >= 50 },
  { id: 'nemesis-born', earned: (s) => s.nemesis !== null },
  // Spectating. Three steps rather than one so the first is reachable the
  // first time someone sits through a friend's finish.
  { id: 'watcher', earned: (s) => (s.spectated ?? 0) >= 1 },
  { id: 'commentator', earned: (s) => (s.spectated ?? 0) >= 10 },
  { id: 'the-rail', earned: (s) => (s.spectated ?? 0) >= 50 },
];

/** Event awards the client may request via POST — the grant allowlist. */
export const EVENT_AWARD_IDS: ReadonlySet<string> = new Set(['tutorial-complete']);

/** Ids of every stat award the given stats have earned. */
export function earnedStatAwardIds(stats: AwardEvalStats): readonly string[] {
  return STAT_AWARDS.filter((a) => a.earned(stats)).map((a) => a.id);
}

/**
 * Monthly champion — the "keyed row" trick foils use (see foils.ts), applied
 * to an award instead of a cosmetic: one row per calendar month a player
 * finished on top of the monthly ladder, so the same person winning two
 * different months is two grants, not a re-roll of one.
 *
 * A SECOND, canonical (unkeyed) `MONTHLY_CHAMPION_AWARD_ID` row is granted
 * alongside the keyed one (see routes/leaderboard.ts) purely so the existing
 * catalog machinery — the Awards showcase, `grantedRewardIds`, the grant
 * toast — can recognise it with the exact-id matching every OTHER catalog
 * award already uses, without teaching any of those call sites a new
 * "starts with" rule. The keyed row is what makes the grant idempotent PER
 * MONTH; the canonical row is what makes it a shelf trophy.
 */
export const MONTHLY_CHAMPION_PREFIX = 'monthly-champion:';

/** The catalog id — this is what apps/web/src/awards.ts lists and what
 * grantedRewardIds()/the Awards screen match on. */
export const MONTHLY_CHAMPION_AWARD_ID = 'monthly-champion';

/** The award-row id for one month's crown. `monthKey` is 'YYYY-MM'. */
export function monthlyChampionMonthAwardId(monthKey: string): string {
  return `${MONTHLY_CHAMPION_PREFIX}${monthKey}`;
}
