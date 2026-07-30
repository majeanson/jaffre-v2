import type { Cosmetic } from './cosmetics.js';
import type { TrackReward } from './progression.js';
import { CARD_SKINS } from './cosmetics.js';
import { THEMES } from './theme.js';
import { FELTS } from './felt.js';
import { SWEEPS } from './sweeps.js';

/**
 * A track reward's display label ("Juicy", "Noir"), resolved against whichever
 * catalog it belongs to.
 *
 * Its own module because it is the one thing that needs every catalog at once:
 * `theme.ts` already imports `cosmetics.ts`, and `cosmetics.ts` imports
 * `progression.ts`, so neither of those three can reach the others without
 * closing a cycle (felt.ts/sweeps.ts sit on the same side of that cycle as
 * theme.ts, so they're safe to add here too). Kept out of the Journey screen
 * so the Corner tile can name the same prize without dragging that whole lazy
 * chunk in with it.
 */
const CATALOG_BY_KIND: Readonly<Record<TrackReward['kind'], readonly Cosmetic[]>> = {
  skin: CARD_SKINS,
  theme: THEMES,
  felt: FELTS,
  sweep: SWEEPS,
};

export function trackRewardLabel(reward: TrackReward): string {
  return (
    CATALOG_BY_KIND[reward.kind].find((c) => c.id === reward.cosmeticId)?.label ?? reward.cosmeticId
  );
}
