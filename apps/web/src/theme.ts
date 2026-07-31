import type { Lang } from '@jaffre/ui';
import { atLevel, type Cosmetic } from './cosmetics.js';

/** Skin system: a theme is a [data-theme] token block in packages/ui tokens.css.
 * Themes are cosmetics too — free, on the level track (see progression.ts), or
 * challenge-gated from stats. `dark` is the default (no `data-theme` attribute).
 * Catalog order IS the ladder the gallery shows and is a SINGLE effort-sorted
 * list, easiest→hardest: the free starters first, then every unlockable
 * (level-track AND challenge) merged and sorted by effective difficulty — a
 * challenge slots in wherever its skill/grind roughly matches a level
 * (judged the same way as cosmetics.ts's CARD_SKINS ladder: attempting one
 * sans-atout bid ≈ level 1, "win N games"/"make N bids"/"net +N" scaled
 * against the nearest track level of comparable grind). */
export const THEMES: readonly Cosmetic[] = [
  // ── Starters (free) ──
  { id: 'dark', label: 'Classic dark', free: true },
  { id: 'light', label: 'Classic light', free: true },
  { id: 'crimson', label: 'Crimson Lounge', free: true },
  { id: 'boreal', label: 'Boreal', free: true },
  { id: 'sakura', label: 'Sakura', free: true },
  // ── One ladder from here: level track + challenges, interleaved by
  //    effective difficulty (see LEVEL_TRACK in progression.ts for the track
  //    entries) ──
  {
    // ≈ level 1 — a single attempted bid, the lightest gate in the game.
    id: 'arcane',
    label: 'Arcane',
    free: false,
    unlock: (s) => s.sansAtout.attempted >= 1,
    requirement: (s, lang: Lang) => ({
      text: lang === 'fr' ? 'Tente une mise sans atout' : 'Attempt a sans-atout bid',
      have: s.sansAtout.attempted,
      need: 1,
    }),
  },
  { id: 'juicy', label: 'Juicy', ...atLevel(2) },
  { id: 'sepia', label: 'Sepia', ...atLevel(4) },
  {
    // ≈ level 5
    id: 'glacier',
    label: 'Glacier',
    free: false,
    unlock: (s) => s.wins >= 5,
    requirement: (s, lang: Lang) => ({
      text: lang === 'fr' ? 'Gagne 5 parties' : 'Win 5 games',
      have: s.wins,
      need: 5,
    }),
  },
  {
    // ≈ level 5-6
    id: 'ember',
    label: 'Ember',
    free: false,
    unlock: (s) => s.streak.best >= 4,
    requirement: (s, lang: Lang) => ({
      text: lang === 'fr' ? 'Gagne 4 fois de suite' : 'Win 4 in a row',
      have: s.streak.best,
      need: 4,
    }),
  },
  {
    // ≈ level 6 — half of Gilded's +100 net-points gate (level 11).
    id: 'goldleaf',
    label: 'Gold Leaf',
    free: false,
    unlock: (s) => s.netPoints >= 50,
    requirement: (s, lang: Lang) => ({
      text: lang === 'fr' ? 'Atteins +50 points nets' : 'Reach +50 net points',
      have: Math.max(0, s.netPoints),
      need: 50,
    }),
  },
  { id: 'midnight', label: 'Midnight', ...atLevel(6, (s) => s.games >= 10) },
  {
    // ≈ level 7 — 15/25ths of Prismatic's 25-bids gate (level 12).
    id: 'terminal',
    label: 'Terminal',
    free: false,
    unlock: (s) => s.bids.made >= 15,
    requirement: (s, lang: Lang) => ({
      text: lang === 'fr' ? 'Réussis 15 mises' : 'Make 15 bids',
      have: s.bids.made,
      need: 15,
    }),
  },
  { id: 'abyss', label: 'Abyss', ...atLevel(9, (s) => s.games >= 20) },
  { id: 'synthwave', label: 'Synthwave', ...atLevel(11, (s) => s.games >= 30) },
];

/** Ids are open now (the catalog grows) — validated against THEMES at runtime. */
export type ThemeId = string;

export const DEFAULT_THEME = 'dark';
const KEY = 'jaffre-theme';

export function currentTheme(): ThemeId {
  const stored = localStorage.getItem(KEY);
  return THEMES.some((t) => t.id === stored) ? (stored as ThemeId) : DEFAULT_THEME;
}

/** Point the system chrome at whatever the page canvas just became. Every
 * theme block sets its own --color-ap-ground, so read it back rather than
 * keeping a second copy of 19 colours here — a new theme is then one token
 * block, same as today. Android's status bar and Safari's tab bar follow it;
 * on installed iOS it also stops the light themes launching behind a dark
 * frame. Bails if tokens aren't parsed yet — the meta's static default in
 * index.html is the dark ground, which is the boot theme anyway. */
function syncThemeColor(): void {
  const meta = document.querySelector('meta[name="theme-color"]');
  if (!meta) return;
  const ground = getComputedStyle(document.documentElement)
    .getPropertyValue('--color-ap-ground')
    .trim();
  if (ground) meta.setAttribute('content', ground);
}

export function applyTheme(theme: ThemeId): void {
  localStorage.setItem(KEY, theme);
  if (theme === DEFAULT_THEME) delete document.documentElement.dataset['theme'];
  else document.documentElement.dataset['theme'] = theme;
  syncThemeColor();
}

export function initTheme(): void {
  applyTheme(currentTheme());
}
