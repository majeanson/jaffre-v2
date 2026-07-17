import type { Lang } from '@jaffre/ui';
import type { Stats } from './net/history.js';

/**
 * Cosmetics progression — one model shared by both axes (themes + card skins).
 * A cosmetic is free or unlocks from the player's `/api/stats` (no new server
 * state; the games table is the single source). The chosen ids persist in the
 * profile so they follow the account; a `[data-theme]` / `[data-card-skin]`
 * attribute on <html> applies the token layer.
 */

/** Dev switch: unlocks every cosmetic so all skins can be previewed/tested in
 * prod. Flip to false (or gate behind ?dev) to make unlocks play-earned. */
export const DEV_UNLOCK_ALL = true;

export interface Cosmetic {
  readonly id: string;
  readonly label: string;
  /** Free = always owned. Otherwise `unlock` decides from the player's stats. */
  readonly free: boolean;
  readonly unlock?: (s: Stats) => boolean;
  /** Progress toward the unlock, for the gallery's locked tiles. */
  readonly requirement?: (s: Stats, lang: Lang) => { text: string; have: number; need: number };
}

/** The set of owned cosmetic ids for these stats (the dev flag forces all). */
export function owned(catalog: readonly Cosmetic[], stats: Stats | null): Set<string> {
  return new Set(
    catalog
      .filter((c) => DEV_UNLOCK_ALL || c.free || (stats !== null && (c.unlock?.(stats) ?? false)))
      .map((c) => c.id),
  );
}

/** Fall back to `fallback` when a stored id isn't owned/known (e.g. not yet
 * unlocked on this device, or removed from the catalog). */
export function resolve(id: string | null, ownedIds: Set<string>, fallback: string): string {
  return id !== null && ownedIds.has(id) ? id : fallback;
}

// ── Card skins ──────────────────────────────────────────────────────────────
// The default `arcade` skin declares NO token block and NO renderer (the "no
// data-card-skin attribute" state), so the active theme's own card tokens show
// through until the player picks a real skin. Phase 2 adds the rest.
export const CARD_SKINS: readonly Cosmetic[] = [{ id: 'arcade', label: 'Arcade', free: true }];

export const DEFAULT_CARD_SKIN = 'arcade';
const CARD_SKIN_KEY = 'jaffre-card-skin';

/** Fired after the card skin changes so React consumers (the provider in App)
 * re-render the cards in place. */
export const CARD_SKIN_EVENT = 'jaffre-cardskin';

export function currentCardSkin(): string {
  return localStorage.getItem(CARD_SKIN_KEY) ?? DEFAULT_CARD_SKIN;
}

/** Apply a card skin: persist locally, toggle the <html> attribute (the default
 * = no attribute, exactly like the `dark` theme), and notify React consumers. */
export function applyCardSkin(id: string): void {
  localStorage.setItem(CARD_SKIN_KEY, id);
  if (id === DEFAULT_CARD_SKIN) delete document.documentElement.dataset['cardSkin'];
  else document.documentElement.dataset['cardSkin'] = id;
  window.dispatchEvent(new Event(CARD_SKIN_EVENT));
}

export function initCardSkin(): void {
  applyCardSkin(currentCardSkin());
}
