/**
 * Award catalog — the server-authoritative half. Kept pure (no DB, no env) so
 * the earn predicates are unit-testable exactly like history.ts / rating.ts.
 *
 * Two flavours of award:
 *  - `stat`  — earned from the player's aggregate stats. Auto-granted on read
 *              (GET /api/awards) so they are self-healing and can't be forged.
 *  - `event` — earned from a client-attested moment (finishing the tutorial).
 *              Granted via POST /api/awards/grant, gated by EVENT_AWARD_IDS.
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
}

interface StatAward {
  readonly id: string;
  readonly earned: (s: AwardEvalStats) => boolean;
}

/** Stat-based awards, auto-granted from the player's real aggregate. */
export const STAT_AWARDS: readonly StatAward[] = [
  { id: 'first-win', earned: (s) => s.wins >= 1 },
  { id: 'ten-wins', earned: (s) => s.wins >= 10 },
  { id: 'win-streak-5', earned: (s) => s.streak.best >= 5 },
  { id: 'century', earned: (s) => s.netPoints >= 100 },
  { id: 'sans-atout-master', earned: (s) => s.sansAtout.made >= 3 },
  { id: 'veteran', earned: (s) => s.games >= 50 },
  { id: 'nemesis-born', earned: (s) => s.nemesis !== null },
];

/** Event awards the client may request via POST — the grant allowlist. */
export const EVENT_AWARD_IDS: ReadonlySet<string> = new Set(['tutorial-complete']);

/** Ids of every stat award the given stats have earned. */
export function earnedStatAwardIds(stats: AwardEvalStats): readonly string[] {
  return STAT_AWARDS.filter((a) => a.earned(stats)).map((a) => a.id);
}
