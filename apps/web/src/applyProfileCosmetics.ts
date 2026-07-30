import type { Profile } from './net/auth.js';
import { applyBonhommeSkin, applyCardSkin } from './cosmetics.js';
import { applyTheme } from './theme.js';
import { applyFelt } from './felt.js';
import { applySweep } from './sweeps.js';

/**
 * Make an adopted identity's saved look the device's look, right now — the
 * LoginSheet's "keeps your card skins on any device" promise, which nothing
 * ever actually cashed: `Profile.cardSkin/theme/felt/sweep/bonhommeSkin` sat
 * on the wire and in localStorage, read by nothing.
 *
 * Called ONLY at the identity-adoption points in net/auth.ts (login,
 * code-verify success, recovery) — never on ordinary boot, where the
 * device's own local choice must keep winning (that's what lets two people
 * share a browser, or a player try a look before ever logging in). Adopting
 * a DIFFERENT identity is the one moment its look should take over.
 *
 * Each field applies independently and only when non-null — a profile that
 * never equipped a felt, say, leaves the device's current felt alone rather
 * than stomping it with some blanket default. Ownership isn't checked here:
 * the reconcileCosmetics() pass (cosmeticsBoot.ts) that already runs after
 * boot degrades any equip this device can't actually prove ownership of,
 * same as it always has.
 *
 * Deliberately its OWN module, not a cosmeticsBoot.ts export: net/auth.ts
 * imports this, and cosmeticsBoot.ts pulls in fetchStats/fetchAwards, which
 * reach net/socket.ts's module graph (the music store touches localStorage
 * at import time). Auth importing cosmeticsBoot.ts would drag that whole
 * graph into every module that merely reads a profile — this file stays a
 * leaf: only the four cosmetic modules' applyX() calls, nothing net-shaped.
 */
export function applyProfileCosmetics(profile: Profile): void {
  if (profile.cardSkin !== null) applyCardSkin(profile.cardSkin);
  if (profile.theme !== null) applyTheme(profile.theme);
  if (profile.felt !== null) applyFelt(profile.felt);
  if (profile.sweep !== null) applySweep(profile.sweep);
  // Unlike the other four axes, bonhommeSkin is a closed literal union, not
  // an open catalog id — an unrecognised stored value is simply left alone,
  // same as currentBonhommeSkin() falling back rather than throwing.
  if (
    profile.bonhommeSkin === 'pixel' ||
    profile.bonhommeSkin === 'painted' ||
    profile.bonhommeSkin === 'og'
  ) {
    applyBonhommeSkin(profile.bonhommeSkin);
  }
}
