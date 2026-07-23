import type { Lang } from '@jaffre/ui';
import { atLevel, type Cosmetic } from './cosmetics.js';

/** Skin system: a theme is a [data-theme] token block in packages/ui tokens.css.
 * Themes are cosmetics too — free, on the level track (see progression.ts), or
 * challenge-gated from stats. `dark` is the default (no `data-theme` attribute).
 * Catalog order is the ladder the gallery shows: starters → track → challenges. */
export const THEMES: readonly Cosmetic[] = [
  // ── Starters ──
  { id: 'dark', label: 'Classic dark', free: true },
  { id: 'light', label: 'Classic light', free: true },
  { id: 'crimson', label: 'Crimson Lounge', free: true },
  { id: 'boreal', label: 'Boreal', free: true },
  { id: 'sakura', label: 'Sakura', free: true },
  // ── Level track (see LEVEL_TRACK in progression.ts) ──
  { id: 'juicy', label: 'Juicy', ...atLevel(2) },
  { id: 'sepia', label: 'Sepia', ...atLevel(4) },
  { id: 'midnight', label: 'Midnight', ...atLevel(6, (s) => s.games >= 10) },
  { id: 'abyss', label: 'Abyss', ...atLevel(9, (s) => s.games >= 20) },
  { id: 'synthwave', label: 'Synthwave', ...atLevel(11, (s) => s.games >= 30) },
  // ── Challenges ──
  {
    id: 'arcane',
    label: 'Arcane',
    free: false,
    unlock: (s) => s.sansAtout.attempted >= 1,
    requirement: (s, lang: Lang) => ({
      text: lang === 'fr' ? 'Tentez une mise sans atout' : 'Attempt a sans-atout bid',
      have: s.sansAtout.attempted,
      need: 1,
    }),
  },
  {
    id: 'ember',
    label: 'Ember',
    free: false,
    unlock: (s) => s.streak.best >= 4,
    requirement: (s, lang: Lang) => ({
      text: lang === 'fr' ? 'Gagnez 4 fois de suite' : 'Win 4 in a row',
      have: s.streak.best,
      need: 4,
    }),
  },
  {
    id: 'glacier',
    label: 'Glacier',
    free: false,
    unlock: (s) => s.wins >= 5,
    requirement: (s, lang: Lang) => ({
      text: lang === 'fr' ? 'Gagnez 5 parties' : 'Win 5 games',
      have: s.wins,
      need: 5,
    }),
  },
  {
    id: 'terminal',
    label: 'Terminal',
    free: false,
    unlock: (s) => s.bids.made >= 15,
    requirement: (s, lang: Lang) => ({
      text: lang === 'fr' ? 'Réussissez 15 mises' : 'Make 15 bids',
      have: s.bids.made,
      need: 15,
    }),
  },
  {
    id: 'goldleaf',
    label: 'Gold Leaf',
    free: false,
    unlock: (s) => s.netPoints >= 50,
    requirement: (s, lang: Lang) => ({
      text: lang === 'fr' ? 'Atteignez +50 points nets' : 'Reach +50 net points',
      have: Math.max(0, s.netPoints),
      need: 50,
    }),
  },
];

/** Ids are open now (the catalog grows) — validated against THEMES at runtime. */
export type ThemeId = string;

export const DEFAULT_THEME = 'dark';
const KEY = 'jaffre-theme';

export function currentTheme(): ThemeId {
  const stored = localStorage.getItem(KEY);
  return THEMES.some((t) => t.id === stored) ? (stored as ThemeId) : DEFAULT_THEME;
}

export function applyTheme(theme: ThemeId): void {
  localStorage.setItem(KEY, theme);
  if (theme === DEFAULT_THEME) delete document.documentElement.dataset['theme'];
  else document.documentElement.dataset['theme'] = theme;
}

export function initTheme(): void {
  applyTheme(currentTheme());
}
