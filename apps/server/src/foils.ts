/**
 * Foil chases — the rare drop.
 *
 * A foil is the SAME card skin with an animated sheen: no new art, which is the
 * entire point. Owning `noir` and owning `foil:noir` are separate things, and
 * the second only ever drops from finishing a game with the first equipped.
 *
 * Two properties this file exists to guarantee:
 *
 *  1. SERVER-DECIDED. The roll happens where the game record is written, not
 *     in the client. A client-attested drop would be a client-granted cosmetic,
 *     which is why `EVENT_AWARD_IDS` deliberately allowlists only the tutorial.
 *
 *  2. NOT RE-ROLLABLE. The outcome is a pure hash of (gameId, userId), so a
 *     player cannot retry the same finished game for a better result, and the
 *     same game replayed through this code always decides the same way. It also
 *     makes the whole thing unit-testable without stubbing randomness.
 *
 * Grants are stored as ordinary `user_awards` rows, reusing the entitlement
 * table that already exists rather than inventing a parallel one.
 */

/** Prefix marking an award row as a foil grant rather than a real award. */
export const FOIL_PREFIX = 'foil:';

/** One drop in this many finished games, per player. Deliberately stingy: the
 * value is the per-game "did it drop?" beat, not the size of the collection. */
export const FOIL_ODDS = 20;

/** The award-row id for a skin's foil. */
export function foilAwardId(skinId: string): string {
  return `${FOIL_PREFIX}${skinId}`;
}

/** The skin a foil award refers to, or null if the id isn't a foil. */
export function foilSkinOf(awardId: string): string | null {
  return awardId.startsWith(FOIL_PREFIX) ? awardId.slice(FOIL_PREFIX.length) : null;
}

/** Skin ids are lowercase slugs — same shape the profile column accepts. */
const SKIN_ID_RE = /^[a-z0-9-]{1,24}$/;

/** FNV-1a over the drop key. Deterministic across engines, and spreads well
 * enough for a 1-in-N gate. */
function hash(key: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

/**
 * Decide whether this player's finished game drops a foil, and for which skin.
 *
 * Returns the award id to grant, or null. Null covers every "nothing to do"
 * case — no skin equipped, a skin id we don't recognise, already owned, or
 * simply an unlucky roll — so the caller has exactly one branch.
 *
 * `ownedFoils` prevents a duplicate drop being the outcome: with only a handful
 * of skins equipped over a career, re-rolling one you already have would make
 * the feature feel broken long before it felt rare.
 */
export function rollFoil(
  gameId: string,
  userId: string,
  equippedSkin: string | null,
  ownedFoils: ReadonlySet<string>,
): string | null {
  if (equippedSkin === null || !SKIN_ID_RE.test(equippedSkin)) return null;
  const awardId = foilAwardId(equippedSkin);
  if (ownedFoils.has(awardId)) return null;
  // Keyed on the game AND the player: two people at the same table roll
  // independently, and neither can re-roll their own result.
  return hash(`${gameId}:${userId}`) % FOIL_ODDS === 0 ? awardId : null;
}
