import type { TrackReward } from './progression.js';
import { CARD_SKINS } from './cosmetics.js';
import { THEMES } from './theme.js';

/**
 * A track reward's display label ("Juicy", "Noir"), resolved against whichever
 * catalog it belongs to.
 *
 * Its own module because it is the one thing that needs BOTH catalogs at once:
 * `theme.ts` already imports `cosmetics.ts`, and `cosmetics.ts` imports
 * `progression.ts`, so neither of those three can reach the other two without
 * closing a cycle. Kept out of the Journey screen so the Corner tile can name
 * the same prize without dragging that whole lazy chunk in with it.
 */
export function trackRewardLabel(reward: TrackReward): string {
  const catalog = reward.kind === 'skin' ? CARD_SKINS : THEMES;
  return catalog.find((c) => c.id === reward.cosmeticId)?.label ?? reward.cosmeticId;
}
