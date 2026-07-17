import type { Cosmetic } from './cosmetics.js';

/** Skin system: a theme is a [data-theme] token block in packages/ui tokens.css.
 * Themes are cosmetics too — free or unlocked from stats (Phase 2 adds locked
 * ones). `dark` is the default (no `data-theme` attribute). */
export const THEMES: readonly Cosmetic[] = [
  { id: 'dark', label: 'Classic dark', free: true },
  { id: 'light', label: 'Classic light', free: true },
  { id: 'juicy', label: 'Juicy', free: true },
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
