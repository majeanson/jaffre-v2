import { fetchStats } from './net/history.js';
import { fetchAwards } from './net/awards.js';
import { grantedRewardIds } from './awards.js';
import {
  BONHOMME_SKINS,
  CARD_SKINS,
  DEFAULT_BONHOMME_SKIN,
  DEFAULT_CARD_SKIN,
  DEV_UNLOCK_ALL,
  applyBonhommeSkin,
  applyCardSkin,
  currentBonhommeSkin,
  currentCardSkin,
  owned,
} from './cosmetics.js';
import { DEFAULT_THEME, THEMES, applyTheme, currentTheme } from './theme.js';

const SEEN_KEY = 'jaffre-cosmetics-seen';

function labelOf(id: string): string {
  return CARD_SKINS.find((c) => c.id === id)?.label ?? THEMES.find((c) => c.id === id)?.label ?? id;
}

/**
 * Reconcile the player's cosmetics against their real `/api/stats`, once per app
 * load. Two jobs, both keyed off REAL ownership (the dev unlock-all flag is
 * ignored here, so this behaves the same whether or not previews are open):
 *
 *  1. Degrade a stored-but-not-owned skin/theme back to the default — only
 *     enforced while `DEV_UNLOCK_ALL` is off (while it's on, anything is
 *     equippable, so we leave the choice alone).
 *  2. Detect freshly play-unlocked cosmetics versus a `seen` set in
 *     localStorage, and return their labels so the app can toast "Unlocked: …".
 *     The first run seeds the seen set silently (no toast for the starter set).
 *
 * Best-effort: returns `[]` on any failure (offline, no identity, etc.).
 */
export async function reconcileCosmetics(): Promise<string[]> {
  let ownedCards: Set<string>;
  let ownedThemes: Set<string>;
  let ownedBonhommes: Set<string>;
  try {
    const [stats, awards] = await Promise.all([fetchStats(), fetchAwards()]);
    const rewards = grantedRewardIds(awards.map((a) => a.id));
    ownedCards = owned(CARD_SKINS, stats, false, rewards);
    ownedThemes = owned(THEMES, stats, false, rewards);
    ownedBonhommes = owned(BONHOMME_SKINS, stats, false, rewards);
  } catch {
    return [];
  }

  if (!DEV_UNLOCK_ALL) {
    if (!ownedCards.has(currentCardSkin())) applyCardSkin(DEFAULT_CARD_SKIN);
    if (!ownedThemes.has(currentTheme())) applyTheme(DEFAULT_THEME);
    // Bonhommes: only a NON-default stored choice can over-grant (an equipped
    // 'og' without the tutorial award). The default ('painted') stays even
    // when technically unowned — unpainted it renders exactly like no choice,
    // and degrading it to 'pixel' would stomp OG-deck portraits at the table.
    const bonhomme = currentBonhommeSkin();
    if (bonhomme !== DEFAULT_BONHOMME_SKIN && !ownedBonhommes.has(bonhomme)) {
      applyBonhommeSkin(DEFAULT_BONHOMME_SKIN);
    }
  }

  const ownedNow = [...ownedCards, ...ownedThemes];
  const seenRaw = localStorage.getItem(SEEN_KEY);
  if (seenRaw === null) {
    localStorage.setItem(SEEN_KEY, JSON.stringify(ownedNow));
    return [];
  }
  let seen: readonly string[];
  try {
    seen = JSON.parse(seenRaw) as string[];
  } catch {
    seen = [];
  }
  const seenSet = new Set(seen);
  const fresh = ownedNow.filter((id) => !seenSet.has(id));
  if (fresh.length > 0) localStorage.setItem(SEEN_KEY, JSON.stringify(ownedNow));
  return fresh.map(labelOf);
}
