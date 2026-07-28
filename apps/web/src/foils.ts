/**
 * Foil chases — the client half.
 *
 * A foil is not a fifth catalog entry: it is the skin you already own, with a
 * sheen. So there is no picker and no toggle — if you own the foil for the
 * skin you have equipped, your cards are foiled. Owning it IS the reward, and
 * the alternative (a settings switch for a rare drop) would be one more thing
 * to find and understand for no gain.
 *
 * Ownership arrives from `/api/awards` as `foil:<skinId>` rows, granted
 * server-side when a game finishes (apps/server/src/foils.ts). The client
 * never decides a drop; it only reads what it was granted.
 */

/** Prefix marking an award id as a foil grant. Mirrors the server's constant —
 * the two must stay in lockstep, like the award catalog ids themselves. */
export const FOIL_PREFIX = 'foil:';

/** The set of skin ids the player owns a foil for, from earned award ids. */
export function ownedFoilSkins(earnedAwardIds: Iterable<string>): Set<string> {
  const skins = new Set<string>();
  for (const id of earnedAwardIds) {
    if (id.startsWith(FOIL_PREFIX)) {
      const skin = id.slice(FOIL_PREFIX.length);
      if (skin !== '') skins.add(skin);
    }
  }
  return skins;
}

/**
 * Apply the foil layer for the currently equipped skin.
 *
 * Sets `data-foil` on <html> to the skin id when the player owns that skin's
 * foil, and removes it otherwise — the same "the default declares nothing"
 * rule the other axes use, so a player with no foils has no attribute and the
 * cards render exactly as before.
 */
export function applyFoil(skinId: string, ownedFoils: ReadonlySet<string>): void {
  if (typeof document === 'undefined') return;
  known = ownedFoils;
  if (ownedFoils.has(skinId)) document.documentElement.dataset['foil'] = skinId;
  else delete document.documentElement.dataset['foil'];
}

/**
 * The last known grant set, so a skin swap can re-evaluate the foil without
 * another round-trip. Empty until the first reconcile — which is correct:
 * before we know what was granted, the honest answer is "no foil".
 */
let known: ReadonlySet<string> = new Set();

/** Re-apply for a newly equipped skin, using the grants already fetched. */
export function refreshFoil(skinId: string): void {
  applyFoil(skinId, known);
}
