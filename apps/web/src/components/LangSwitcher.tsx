import { useLang, type Lang } from '@jaffre/ui';
import { applyLang, LANGS } from '../lang.js';
import { ICON_BTN_NEUTRAL } from './IconButton.js';

const LABEL: Record<Lang, string> = { en: 'Language', fr: 'Langue' };

/**
 * EN/FR toggle — the same affordance as the in-game options drawer's language
 * button: one tap flips to the other language. The button face shows the
 * language you'd switch TO ("FR" on an English screen), Silkscreen-set so it
 * reads as a control, with the full name in the accessible label.
 */
export function LangSwitcher() {
  const lang = useLang();
  const other = LANGS.find((l) => l.id !== lang) ?? LANGS[0];
  if (other === undefined) return null;
  return (
    <button
      type="button"
      onClick={() => applyLang(other.id)}
      aria-label={`${LABEL[lang]} · ${other.label}`}
      title={`${LABEL[lang]} · ${other.label}`}
      className={`${ICON_BTN_NEUTRAL} font-arcade-display text-[0.65em] uppercase`}
    >
      {other.id.toUpperCase()}
    </button>
  );
}
