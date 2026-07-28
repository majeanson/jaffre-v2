import type { Lang } from '@jaffre/ui';
import { fetchStats } from './net/history.js';
import { levelFromStats } from './progression.js';
import { EMPTY_SEEN, detectMoments, type ProgressMoment, type ProgressSeen } from './progress.js';
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
import { DEFAULT_FELT, FELTS, applyFelt, currentFelt } from './felt.js';
import { DEFAULT_SWEEP, SWEEPS, applySweep, currentSweep } from './sweeps.js';
import { applyFoil, ownedFoilSkins } from './foils.js';

const SEEN_KEY = 'jaffre-cosmetics-seen';
const PROGRESS_KEY = 'jaffre-progress-seen';

/** The level/award/cosmetic snapshot from the last reconcile. A missing or
 * unreadable record reads as EMPTY_SEEN, which detectMoments treats as a first
 * run — silent, rather than replaying a whole career as news. */
function readProgressSeen(): ProgressSeen | null {
  const raw = localStorage.getItem(PROGRESS_KEY);
  if (raw === null) return null;
  try {
    const p = JSON.parse(raw) as Partial<ProgressSeen>;
    return {
      level: typeof p.level === 'number' ? p.level : 0,
      awards: Array.isArray(p.awards) ? p.awards : [],
      cosmetics: Array.isArray(p.cosmetics) ? p.cosmetics : [],
    };
  } catch {
    // Unreadable is the same as absent: seed silently rather than risk
    // replaying a whole career against a zeroed baseline.
    return null;
  }
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
export async function reconcileCosmetics(lang: Lang): Promise<ProgressMoment[]> {
  let awardIds: readonly string[] = [];
  let level = 0;
  let ownedCards: Set<string>;
  let ownedThemes: Set<string>;
  let ownedBonhommes: Set<string>;
  let ownedFelts: Set<string>;
  let ownedSweeps: Set<string>;
  try {
    const [stats, awards] = await Promise.all([fetchStats(), fetchAwards()]);
    awardIds = awards.map((a) => a.id);
    level = levelFromStats(stats);
    const rewards = grantedRewardIds(awardIds);
    // Foils: a modifier on the equipped skin, not a choice. Applied here
    // because this is where the award grants are already in hand — see
    // foils.ts for why there is no picker.
    applyFoil(currentCardSkin(), ownedFoilSkins(awardIds));
    ownedCards = owned(CARD_SKINS, stats, false, rewards);
    ownedThemes = owned(THEMES, stats, false, rewards);
    ownedBonhommes = owned(BONHOMME_SKINS, stats, false, rewards);
    ownedFelts = owned(FELTS, stats, false, rewards);
    ownedSweeps = owned(SWEEPS, stats, false, rewards);
  } catch {
    return [];
  }

  if (!DEV_UNLOCK_ALL) {
    if (!ownedCards.has(currentCardSkin())) applyCardSkin(DEFAULT_CARD_SKIN);
    if (!ownedThemes.has(currentTheme())) applyTheme(DEFAULT_THEME);
    if (!ownedFelts.has(currentFelt())) applyFelt(DEFAULT_FELT);
    if (!ownedSweeps.has(currentSweep())) applySweep(DEFAULT_SWEEP);
    // Bonhommes: only a NON-default stored choice can over-grant (an equipped
    // 'og' without the tutorial award). The default ('painted') stays even
    // when technically unowned — unpainted it renders exactly like no choice,
    // and degrading it to 'pixel' would stomp OG-deck portraits at the table.
    const bonhomme = currentBonhommeSkin();
    if (bonhomme !== DEFAULT_BONHOMME_SKIN && !ownedBonhommes.has(bonhomme)) {
      applyBonhommeSkin(DEFAULT_BONHOMME_SKIN);
    }
  }

  const ownedNow = [...ownedCards, ...ownedThemes, ...ownedFelts, ...ownedSweeps];
  const seenRaw = localStorage.getItem(SEEN_KEY);
  const firstRun = seenRaw === null;
  let seen: readonly string[];
  try {
    seen = firstRun ? [] : (JSON.parse(seenRaw) as string[]);
  } catch {
    seen = [];
  }
  const seenSet = new Set(seen);
  // A NEW AXIS is not an unlock. The first load after an axis ships, an
  // existing player's seen set contains none of its ids — announcing every
  // entry they already own would greet the upgrade with a wall of toasts.
  // Seed such an axis silently, exactly like the first-ever run seeds the
  // starters, and let real unlocks announce themselves from the next load on.
  //
  // Scoped to "this axis is entirely absent from the seen set", so adding ONE
  // felt or sweep to an established catalog later still toasts normally. Any
  // future axis joins this list and inherits the behaviour.
  const newAxisCatalogs = [FELTS, SWEEPS];
  const silenced = new Set<string>();
  for (const catalog of newAxisCatalogs) {
    const ids = catalog.map((c) => c.id);
    const unseenAxis = !ids.some((id) => seenSet.has(id));
    if (unseenAxis) for (const id of ids) silenced.add(id);
  }
  const freshCosmetics = ownedNow.filter((id) => !seenSet.has(id) && !silenced.has(id));
  // Persist whenever the stored set is stale — including the seed-only case,
  // where nothing is announced but the seen set must still absorb the new axis
  // so the NEXT genuine unlock in it is recognised as fresh.
  const stale = ownedNow.some((id) => !seenSet.has(id));
  if (stale) localStorage.setItem(SEEN_KEY, JSON.stringify(ownedNow));

  // Levels and awards ride the same "what changed since last time" pass, so a
  // single visit produces ONE ordered set of news rather than three systems
  // each shouting independently.
  const progressSeen = readProgressSeen();
  const moments = detectMoments(
    { level, awards: awardIds, cosmetics: freshCosmetics },
    progressSeen ?? EMPTY_SEEN,
    lang,
    // No stored snapshot = nothing to compare against, so nothing to announce.
    firstRun || progressSeen === null,
  );
  localStorage.setItem(
    PROGRESS_KEY,
    JSON.stringify({ level, awards: awardIds, cosmetics: ownedNow } satisfies ProgressSeen),
  );
  return moments;
}
