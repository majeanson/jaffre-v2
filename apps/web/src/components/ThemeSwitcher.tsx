import { useState } from 'react';
import { Select } from '@jaffre/ui';
import { applyTheme, currentTheme, THEMES, type ThemeId } from '../theme.js';

/** Skin picker — themes are pure token swaps, safe to change mid-game. Uses the
 *  shared arcade Select so every dropdown in the app reads the same. */
export function ThemeSwitcher() {
  const [theme, setTheme] = useState<ThemeId>(currentTheme());
  return (
    <label className="flex items-center gap-1.5 font-arcade-ui text-xs text-(--color-ap-muted)">
      <span className="max-sm:sr-only">Skin</span>
      <Select
        label="Skin"
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
