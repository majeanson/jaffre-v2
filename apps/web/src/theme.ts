import type { Lang } from '@jaffre/ui';
import type { Cosmetic } from './cosmetics.js';

/** Skin system: a theme is a [data-theme] token block in packages/ui tokens.css.
 * Themes are cosmetics too — free or unlocked from stats. `dark` is the default
 * (no `data-theme` attribute). */
export const THEMES: readonly Cosmetic[] = [
  { id: 'dark', label: 'Classic dark', free: true },
  { id: 'light', label: 'Classic light', free: true },
  { id: 'juicy', label: 'Juicy', free: true },
  { id: 'sepia', label: 'Sepia', free: true },
  {
    id: 'midnight',
    label: 'Midnight',
    free: false,
    unlock: (s) => s.games >= 10,
    requirement: (s, lang: Lang) => ({
      text: lang === 'fr' ? 'Jouez 10 parties' : 'Play 10 games',
      have: s.games,
      need: 10,
    }),
  },
  // ── Wave 2 — mood themes: casino, nature, arcade, phosphor, seasons. ─────
  { id: 'crimson', label: 'Crimson Lounge', free: true },
  { id: 'boreal', label: 'Boreal', free: true },
  { id: 'sakura', label: 'Sakura', free: true },
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
    id: 'abyss',
    label: 'Abyss',
    free: false,
    unlock: (s) => s.games >= 20,
    requirement: (s, lang: Lang) => ({
      text: lang === 'fr' ? 'Jouez 20 parties' : 'Play 20 games',
      have: s.games,
      need: 20,
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
    id: 'synthwave',
    label: 'Synthwave',
    free: false,
    unlock: (s) => s.games >= 30,
    requirement: (s, lang: Lang) => ({
      text: lang === 'fr' ? 'Jouez 30 parties' : 'Play 30 games',
      have: s.games,
      need: 30,
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
