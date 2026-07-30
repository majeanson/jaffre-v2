import type { Lang } from '@jaffre/ui';

/**
 * J5 — numbers speak the locale. Every percentage in the app used to be
 * `${Math.round(x * 100)}%` regardless of language — correct for en, but
 * fr-QC puts a no-break space before the sign (`Intl`'s own 'percent' style
 * handles this; hand-rolling it would mean re-deriving CLDR's spacing rule
 * by eye and getting it subtly wrong). `n` is a plain 0–100 number, matching
 * every existing call site's `Math.round(x * 100)` shape — `Intl` divides by
 * 100 again under 'percent' style, so this divides it back out first.
 */
const FORMATTERS: Record<Lang, Intl.NumberFormat> = {
  en: new Intl.NumberFormat('en-CA', { style: 'percent', maximumFractionDigits: 0 }),
  fr: new Intl.NumberFormat('fr-CA', { style: 'percent', maximumFractionDigits: 0 }),
};

export function fmtPercent(lang: Lang, n: number): string {
  return FORMATTERS[lang].format(n / 100);
}
