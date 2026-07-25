import { useSyncExternalStore } from 'react';
import type { Lang } from '@jaffre/ui';

/** Language preference, same shape as the skin system in theme.ts. */
export const LANGS = [
  { id: 'fr', label: 'Français' },
  { id: 'en', label: 'English' },
] as const satisfies readonly { id: Lang; label: string }[];

const KEY = 'jaffre-lang';

const listeners = new Set<() => void>();

/** Scene-viewer-only ephemeral override — see overrideLang. */
let override: Lang | null = null;

export function currentLang(): Lang {
  if (override !== null) return override;
  const stored = localStorage.getItem(KEY);
  if (stored === 'fr' || stored === 'en') return stored;
  return navigator.language.toLowerCase().startsWith('fr') ? 'fr' : 'en';
}

export function applyLang(lang: Lang): void {
  localStorage.setItem(KEY, lang);
  document.documentElement.lang = lang === 'fr' ? 'fr-CA' : 'en';
  for (const notify of listeners) notify();
}

/** Force a language WITHOUT touching the stored preference (null clears).
 * For the scene viewer's fr scenes only: persisting via applyLang leaked —
 * leaving a fr scene by full navigation (page.goto in the shot sweep, or a
 * hard refresh) skips React cleanup, and the whole app came back French. An
 * in-memory override is discarded by any reload, which is exactly right. */
export function overrideLang(lang: Lang | null): void {
  override = lang;
  document.documentElement.lang = currentLang() === 'fr' ? 'fr-CA' : 'en';
  for (const notify of listeners) notify();
}

export function initLang(): void {
  document.documentElement.lang = currentLang() === 'fr' ? 'fr-CA' : 'en';
}

function subscribe(notify: () => void): () => void {
  listeners.add(notify);
  return () => listeners.delete(notify);
}

/** The current language as reactive state — the App root feeds LangProvider. */
export function useCurrentLang(): Lang {
  return useSyncExternalStore(subscribe, currentLang);
}
