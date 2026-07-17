import { createContext, useContext, type ReactNode } from 'react';
import type { SuitId } from './types.js';

/**
 * Minimal two-language layer shared by the whole app. Components keep their
 * strings in small per-file `Record<Lang, …>` tables and pick with useLang();
 * the app decides the language and provides it once at the root.
 */
export type Lang = 'en' | 'fr';

const LangContext = createContext<Lang>('en');

export function LangProvider({ lang, children }: { lang: Lang; children: ReactNode }) {
  return <LangContext.Provider value={lang}>{children}</LangContext.Provider>;
}

export function useLang(): Lang {
  return useContext(LangContext);
}

export const SUIT_NAMES: Record<Lang, Record<SuitId, string>> = {
  en: { red: 'Red', brown: 'Brown', green: 'Green', blue: 'Blue' },
  fr: { red: 'Rouge', brown: 'Brun', green: 'Vert', blue: 'Bleu' },
};

export function suitName(suit: SuitId, lang: Lang): string {
  return SUIT_NAMES[lang][suit];
}
