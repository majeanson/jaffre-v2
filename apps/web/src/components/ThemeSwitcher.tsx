import { useState } from 'react';
import { Select, useLang, type Lang } from '@jaffre/ui';
import { owned } from '../cosmetics.js';
import { applyTheme, currentTheme, THEMES, type ThemeId } from '../theme.js';

const T: Record<Lang, { skin: string }> = {
  en: { skin: 'Skin' },
  fr: { skin: 'Habillage' },
};

/** Quick theme picker — themes are pure token swaps, safe to change mid-game.
 * Only OWNED themes appear here (free + dev-all with no stats); locked ones are
 * earned + equipped in the Collection gallery. Uses the shared arcade Select. */
export function ThemeSwitcher() {
  const t = T[useLang()];
  const [theme, setTheme] = useState<ThemeId>(currentTheme());
  const ownedThemes = owned(THEMES, null);
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
        options={THEMES.filter((th) => ownedThemes.has(th.id)).map((th) => ({
          value: th.id,
          label: th.label,
        }))}
      />
    </label>
  );
}
