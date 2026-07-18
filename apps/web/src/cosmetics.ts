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

/** Tiny inline picker for the two requirement strings (the catalog is the only
 * place these live, so a full Record table would be overkill). */
const t = (lang: Lang, en: string, fr: string): string => (lang === 'fr' ? fr : en);

export interface Cosmetic {
  readonly id: string;
  readonly label: string;
  /** Free = always owned. Otherwise `unlock` decides from the player's stats. */
  readonly free: boolean;
  readonly unlock?: (s: Stats) => boolean;
  /** Progress toward the unlock, for the gallery's locked tiles. */
  readonly requirement?: (s: Stats, lang: Lang) => { text: string; have: number; need: number };
}

/** The set of owned cosmetic ids for these stats. `devAll` forces everything
 * owned (defaults to the DEV_UNLOCK_ALL flag); the gallery passes `false` to
 * preview the real locked state even while the flag is on. */
export function owned(
  catalog: readonly Cosmetic[],
  stats: Stats | null,
  devAll: boolean = DEV_UNLOCK_ALL,
): Set<string> {
  return new Set(
    catalog
      .filter((c) => devAll || c.free || (stats !== null && (c.unlock?.(stats) ?? false)))
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
// through until the player picks a real skin. The others are `[data-card-skin]`
// token blocks in tokens.css, some paired with a CARD_SKIN_RENDERERS entry.
export const CARD_SKINS: readonly Cosmetic[] = [
  { id: 'arcade', label: 'Arcade', free: true },
  // The old 2022 deck as a progression: Classic OG (free) puts the real OG
  // figure art on the two 0-cards; OG Deck unlocks the FULL painted deck.
  { id: 'classic-og', label: 'Classic OG', free: true },
  {
    id: 'og-deck',
    label: 'OG Deck',
    free: false,
    unlock: (s) => s.games >= 15,
    requirement: (s, lang) => ({
      text: t(lang, 'Play 15 games', 'Jouez 15 parties'),
      have: s.games,
      need: 15,
    }),
  },
  { id: 'noir', label: 'Noir', free: true },
  {
    id: 'lamplight-foil',
    label: 'Lamplight Foil',
    free: false,
    unlock: (s) => s.games >= 25 || s.streak.best >= 5,
    requirement: (s, lang) => {
      const byGames = {
        text: t(lang, 'Play 25 games', 'Jouez 25 parties'),
        have: s.games,
        need: 25,
      };
      const byStreak = {
        text: t(lang, 'Win 5 in a row', 'Gagnez 5 fois de suite'),
        have: s.streak.best,
        need: 5,
      };
      // Show whichever path the player is closest to completing.
      return byGames.have / byGames.need >= byStreak.have / byStreak.need ? byGames : byStreak;
    },
  },
  {
    id: 'neon',
    label: 'Neon',
    free: false,
    unlock: (s) => s.games >= 20 && s.winRate >= 0.6,
    requirement: (s, lang) =>
      s.games < 20
        ? { text: t(lang, 'Play 20 games', 'Jouez 20 parties'), have: s.games, need: 20 }
        : {
            text: t(lang, 'Reach a 60% win rate', 'Atteignez 60 % de victoires'),
            have: Math.round(s.winRate * 100),
            need: 60,
          },
  },
];

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
