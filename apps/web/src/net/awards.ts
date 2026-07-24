import { authedFetch, cached } from './history.js';
import { AWARDS } from '../awards.js';
import { currentLang } from '../lang.js';
import { useGameStore } from '../state/gameStore.js';

/**
 * Awards REST: the earned-awards read and the event-award grant. Identity
 * mirrors the stats/history fetches (Bearer token, else ?u=<uid>) via the
 * shared authedFetch. Best-effort — returns [] when no identity exists yet.
 *
 * GET /api/awards auto-grants any freshly-earned stat awards server-side (see
 * apps/server/src/index.ts handleAwards) but its response is just the full
 * earned set — { awards: [{id, grantedAt}] } — with no marker distinguishing
 * "just granted this call" from "already had it". So only the explicit
 * grantAward() path below can know a grant just happened, and only it fires
 * the toast; a stat award earned mid-game surfaces silently until the next
 * visit to the Awards screen.
 */

export interface EarnedAward {
  readonly id: string;
  readonly grantedAt: number;
}

async function fetchAwardsUncached(): Promise<readonly EarnedAward[]> {
  const res = await authedFetch('/api/awards');
  if (res === null) return []; // no identity established yet → nothing earned
  if (!res.ok) throw new Error(`awards ${String(res.status)}`);
  const data = (await res.json()) as { awards: readonly EarnedAward[] };
  return data.awards;
}

// Same dedupe + ~30s TTL idiom as net/history.ts — GET /api/awards is one of
// the calls Home fires alongside /api/stats on every meta-screen visit.
const awardsCache = cached(fetchAwardsUncached);

export function fetchAwards(): Promise<readonly EarnedAward[]> {
  return awardsCache.run();
}

/** Grant a client-attested event award (e.g. tutorial-complete). Returns
 * whether the server confirmed the write (2xx) so callers can decide whether to
 * latch a one-shot. False when there's no identity yet (authedFetch → null) or
 * the request failed — the caller should retry later. The server write itself
 * is idempotent, so a retry never double-grants. */
export async function grantAward(awardId: string): Promise<boolean> {
  try {
    const res = await authedFetch('/api/awards/grant', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ awardId }),
    });
    const ok = res !== null && res.ok;
    if (ok) {
      announceGrant(awardId);
      awardsCache.bust(); // a fresh grant just landed — don't serve the stale earned set
    }
    return ok;
  } catch {
    return false;
  }
}

/** Pop the app-wide toast (see NoticeToast.tsx) for a just-confirmed grant,
 * in the viewer's current language. Silently does nothing for an unknown id
 * — display copy living out of lockstep with the server allowlist shouldn't
 * crash the grant flow. */
function announceGrant(awardId: string): void {
  const award = AWARDS.find((a) => a.id === awardId);
  if (award === undefined) return;
  const lang = currentLang();
  const prefix = lang === 'fr' ? 'Récompense obtenue' : 'Award earned';
  useGameStore.getState().setNotice(`${prefix} — ${award.name(lang)}`, 'award');
}
