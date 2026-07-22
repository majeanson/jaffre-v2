import { authedFetch } from './history.js';

/**
 * Awards REST: the earned-awards read and the event-award grant. Identity
 * mirrors the stats/history fetches (Bearer token, else ?u=<uid>) via the
 * shared authedFetch. Best-effort — returns [] when no identity exists yet.
 */

export interface EarnedAward {
  readonly id: string;
  readonly grantedAt: number;
}

export async function fetchAwards(): Promise<readonly EarnedAward[]> {
  const res = await authedFetch('/api/awards');
  if (res === null) return []; // no identity established yet → nothing earned
  if (!res.ok) throw new Error(`awards ${String(res.status)}`);
  const data = (await res.json()) as { awards: readonly EarnedAward[] };
  return data.awards;
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
    return res !== null && res.ok;
  } catch {
    return false;
  }
}
