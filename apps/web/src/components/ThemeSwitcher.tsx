import { useState } from 'react';
import { Select, useLang, type Lang } from '@jaffre/ui';
import { applyTheme, currentTheme, THEMES, type ThemeId } from '../theme.js';

const T: Record<Lang, { skin: string }> = {
  en: { skin: 'Skin' },
  fr: { skin: 'Habillage' },
};

/** Skin picker — themes are pure token swaps, safe to change mid-game. Uses the
 *  shared arcade Select so every dropdown in the app reads the same. */
export function ThemeSwitcher() {
  const t = T[useLang()];
  const [theme, setTheme] = useState<ThemeId>(currentTheme());
  return (
    <label className="flex items-center gap-1.5 font-arcade-ui text-xs text-(--color-ap-muted)">
      <span className="max-sm:sr-only">{t.skin}</span>
      <Select
        label={t.skin}
        value={theme}
        onChange={(value) => {
          const next = value as ThemeId;
          applyTheme(next);
          setTheme(next);
        }}
        options={THEMES.map((t) => ({ value: t.id, label: t.label }))}
      />
    </label>
  );
}
