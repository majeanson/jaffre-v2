/** Skin system: a theme is a [data-theme] token block in packages/ui tokens.css. */
export const THEMES = [
  { id: 'dark', label: 'Classic dark' },
  { id: 'light', label: 'Classic light' },
  { id: 'juicy', label: 'Juicy' },
] as const;

export type ThemeId = (typeof THEMES)[number]['id'];

const KEY = 'jaffre-theme';

export function currentTheme(): ThemeId {
  const stored = localStorage.getItem(KEY);
  return THEMES.some((t) => t.id === stored) ? (stored as ThemeId) : 'dark';
}

export function applyTheme(theme: ThemeId): void {
  localStorage.setItem(KEY, theme);
  if (theme === 'dark') delete document.documentElement.dataset['theme'];
  else document.documentElement.dataset['theme'] = theme;
}

export function initTheme(): void {
  applyTheme(currentTheme());
}
