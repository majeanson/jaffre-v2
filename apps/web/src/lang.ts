import { useSyncExternalStore } from 'react';
import type { Lang } from '@jaffre/ui';

/** Language preference, same shape as the skin system in theme.ts. */
export const LANGS = [
  { id: 'fr', label: 'Français' },
  { id: 'en', label: 'English' },
] as const satisfies readonly { id: Lang; label: string }[];

const KEY = 'jaffre-lang';

const listeners = new Set<() => void>();

export function currentLang(): Lang {
  const stored = localStorage.getItem(KEY);
  if (stored === 'fr' || stored === 'en') return stored;
  return navigator.language.toLowerCase().startsWith('fr') ? 'fr' : 'en';
}

export function applyLang(lang: Lang): void {
  localStorage.setItem(KEY, lang);
  document.documentElement.lang = lang === 'fr' ? 'fr-CA' : 'en';
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
