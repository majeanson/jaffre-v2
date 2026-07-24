import type { Lang } from '@jaffre/ui';
import type { Stats } from './net/history.js';
import { levelFromStats, levelRequirement } from './progression.js';

/**
 * Cosmetics progression — one model shared by both axes (themes + card skins).
 * A cosmetic is free or unlocks from the player's `/api/stats` (no new server
 * state; the games table is the single source). The chosen ids persist in the
 * profile so they follow the account; a `[data-theme]` / `[data-card-skin]`
 * attribute on <html> applies the token layer.
 *
 * Unlocks come in two flavours, mirroring progression.ts:
 *  - TRACK — "Reach level N" (XP is derived from the same stats). Cosmetics
 *    that used to be raw "play N games" gates live here now; each keeps its old
 *    stat gate as an OR-fallback so nobody who had it ever loses it.
 *  - CHALLENGE — skill/style gates (streaks, win rate, sans-atout, nemesis),
 *    unchanged, most of them paired with a matching award.
 */

/** Dev switch: unlocks every cosmetic so all skins can be previewed/tested in
 * prod. Flip to false (or gate behind ?dev) to make unlocks play-earned. */
export const DEV_UNLOCK_ALL = false;

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

/** A track cosmetic: owned at level `n` — or via `legacy`, the pre-track stat
 * gate it shipped with, kept as an OR so an already-earned skin never re-locks
 * for a player whose stats gave less XP than the new level asks. */
export function atLevel(
  n: number,
  legacy?: (s: Stats) => boolean,
): Pick<Cosmetic, 'free' | 'unlock' | 'requirement'> {
  return {
    free: false,
    unlock: (s) => levelFromStats(s) >= n || (legacy?.(s) ?? false),
    requirement: (s, lang) => levelRequirement(n, s, lang),
  };
}

/** The set of owned cosmetic ids for these stats. `devAll` forces everything
 * owned (defaults to the DEV_UNLOCK_ALL flag); the gallery passes `false` to
 * preview the real locked state even while the flag is on. `grantedRewards` are
 * cosmetic ids unlocked by earned awards (see awards.ts) — owned regardless of
 * stats. */
export function owned(
  catalog: readonly Cosmetic[],
  stats: Stats | null,
  devAll: boolean = DEV_UNLOCK_ALL,
  grantedRewards: ReadonlySet<string> = new Set(),
): Set<string> {
  return new Set(
    catalog
      .filter(
        (c) =>
          devAll ||
          c.free ||
          grantedRewards.has(c.id) ||
          (stats !== null && (c.unlock?.(stats) ?? false)),
      )
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
// Catalog order IS the ladder the gallery shows and is a SINGLE effort-sorted
// list, easiest→hardest: the free starters first, then every unlockable
// (level-track AND challenge) merged and sorted by effective difficulty — a
// challenge slots in wherever its skill/grind roughly matches a level (e.g.
// "win 3 in a row" ≈ level 4-5, "win 10 games" ≈ level 9, "net +100" ≈ level
// 11, "25 bids made" ≈ level 12, "nemesis" ≈ level 13, "20 games @ 60%" ≈
// level 14, "3 sans-atout" ≈ level 16) instead of being bucketed after the
// whole track.
export const CARD_SKINS: readonly Cosmetic[] = [
  // ── Starters (free) ──
  { id: 'arcade', label: 'Arcade', free: true },
  // The old 2022 deck as a progression: Classic OG (free) puts the real OG
  // figure art on the two 0-cards; OG Deck (level track) is the FULL deck.
  { id: 'classic-og', label: 'Classic OG', free: true },
  // ── One ladder from here: level track + challenges, interleaved by
  //    effective difficulty (see LEVEL_TRACK in progression.ts for the track
  //    entries) ──
  { id: 'noir', label: 'Noir', ...atLevel(3) },
  {
    // ≈ level 4-5
    id: 'pixel-parlor',
    label: 'Pixel Parlor',
    free: false,
    unlock: (s) => s.streak.best >= 3,
    requirement: (s, lang) => ({
      text: t(lang, 'Win 3 in a row', 'Gagnez 3 fois de suite'),
      have: s.streak.best,
      need: 3,
    }),
  },
  { id: 'newsprint', label: 'Newsprint', ...atLevel(5) },
  { id: 'blueprint', label: 'Blueprint', ...atLevel(7) },
  { id: 'og-deck', label: 'OG Deck', ...atLevel(8, (s) => s.games >= 15) },
  {
    // ≈ level 9
    id: 'woodcut',
    label: 'Woodcut',
    free: false,
    unlock: (s) => s.wins >= 10,
    requirement: (s, lang) => ({
      text: t(lang, 'Win 10 games', 'Gagnez 10 parties'),
      have: s.wins,
      need: 10,
    }),
  },
  {
    id: 'lamplight-foil',
    label: 'Lamplight Foil',
    ...atLevel(10, (s) => s.games >= 25 || s.streak.best >= 5),
  },
  {
    // ≈ level 11
    id: 'gilded',
    label: 'Gilded',
    free: false,
    unlock: (s) => s.netPoints >= 100,
    requirement: (s, lang) => ({
      text: t(lang, 'Reach +100 net points', 'Atteignez +100 points nets'),
      have: Math.max(0, s.netPoints),
      need: 100,
    }),
  },
  { id: 'stained-glass', label: 'Stained Glass', ...atLevel(12, (s) => s.games >= 30) },
  {
    // ≈ level 12
    id: 'prismatic',
    label: 'Prismatic',
    free: false,
    unlock: (s) => s.bids.made >= 25,
    requirement: (s, lang) => ({
      text: t(lang, 'Make 25 bids', 'Réussissez 25 mises'),
      have: s.bids.made,
      need: 25,
    }),
  },
  { id: 'vaporwave', label: 'Vaporwave', ...atLevel(13, (s) => s.games >= 40) },
  {
    // ≈ level 13 — the rival's deck, only earned by losing to the same
    // player twice.
    id: 'bloodmoon',
    label: 'Blood Moon',
    free: false,
    unlock: (s) => s.nemesis !== null,
    requirement: (s, lang) => ({
      text: t(lang, 'Earn a nemesis', 'Faites-vous une némésis'),
      have: s.nemesis === null ? 0 : 1,
      need: 1,
    }),
  },
  {
    // ≈ level 14
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
  { id: 'circuit', label: 'Circuit', ...atLevel(15) },
  {
    // ≈ level 16
    id: 'sans-atout',
    label: 'Sans Atout',
    free: false,
    unlock: (s) => s.sansAtout.made >= 3,
    requirement: (s, lang) => ({
      text: t(lang, 'Make 3 sans-atout bids', 'Réussissez 3 mises sans atout'),
      have: s.sansAtout.made,
      need: 3,
    }),
  },
  { id: 'starfield', label: 'Starfield', ...atLevel(17) },
  { id: 'royal', label: 'Royal', ...atLevel(20) },
];

// ── Bonhomme skins ──────────────────────────────────────────────────────────
// A THIRD, independent cosmetic axis: which figure art appears on the two
// scoring 0-cards (see packages/ui/cardSkin.tsx's `bonhommes` context field
// and PlayingCard's centre-mark precedence). All three are FREE — this is a
// display preference, not something to grind for — but they're still plain
// `Cosmetic` entries so the gallery's tile/toast machinery (buildTiles,
// requirement-free `owned()`) works unmodified. Order = the ladder shown:
// pixel (always-on sprite) → painted (today's default) → og (unlock the full
// portrait look for free).
export const BONHOMME_SKINS: readonly Cosmetic[] = [
  { id: 'pixel', label: 'Pixel', free: true },
  { id: 'painted', label: 'Painted', free: true },
  { id: 'og', label: 'Classic OG', free: true },
];

/** French labels for the bonhomme catalog — kept alongside (not inside)
 * `Cosmetic.label`, since that field is a plain string shared with the other
 * (English-only-by-design) catalogs; the Collection screen looks these up. */
const BONHOMME_LABELS_FR: Record<string, string> = {
  pixel: 'Pixel',
  painted: 'Peint',
  og: 'Classique OG',
};

export function bonhommeLabel(id: string, lang: Lang): string {
  if (lang === 'fr') return BONHOMME_LABELS_FR[id] ?? id;
  return BONHOMME_SKINS.find((c) => c.id === id)?.label ?? id;
}

export const DEFAULT_BONHOMME_SKIN = 'painted';
const BONHOMME_SKIN_KEY = 'jaffre-bonhomme-skin';

/** Fired after the bonhomme skin changes so React consumers (the provider in
 * App) re-render the cards in place — mirrors CARD_SKIN_EVENT. */
export const BONHOMME_SKIN_EVENT = 'jaffre-bonhommeskin';

export function currentBonhommeSkin(): 'pixel' | 'painted' | 'og' {
  const stored = localStorage.getItem(BONHOMME_SKIN_KEY);
  return stored === 'pixel' || stored === 'painted' || stored === 'og'
    ? stored
    : DEFAULT_BONHOMME_SKIN;
}

/** Apply a bonhomme skin: persist locally and notify React consumers. Unlike
 * card skins/themes this has no `[data-*]` token block to toggle on <html> —
 * it's a pure `CardSkinValue.bonhommes` prop PlayingCard reads via
 * `useCardSkin()`, so App's provider re-reads it on this event instead. */
export function applyBonhommeSkin(id: 'pixel' | 'painted' | 'og'): void {
  localStorage.setItem(BONHOMME_SKIN_KEY, id);
  window.dispatchEvent(new Event(BONHOMME_SKIN_EVENT));
}

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
