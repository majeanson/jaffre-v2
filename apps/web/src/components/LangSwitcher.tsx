import { Select, useLang, type Lang } from '@jaffre/ui';
import { applyLang, LANGS } from '../lang.js';

const LABEL: Record<Lang, string> = { en: 'Language', fr: 'Langue' };

/** Language picker — the one inline chrome dropdown; applyLang re-renders the
 * app root. (Skins/themes moved to the Collection gallery — see SkinLink.) */
export function LangSwitcher() {
  const lang = useLang();
  return (
    <label className="flex items-center gap-1.5 font-arcade-ui text-xs text-(--color-ap-muted)">
      <span className="max-sm:sr-only">{LABEL[lang]}</span>
      <Select
        label={LABEL[lang]}
        value={lang}
        onChange={(value) => applyLang(value as Lang)}
        options={LANGS.map((l) => ({ value: l.id, label: l.label }))}
      />
    </label>
  );
}
