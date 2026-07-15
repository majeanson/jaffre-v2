import { useState } from 'react';
import { applyTheme, currentTheme, THEMES, type ThemeId } from '../theme.js';

/** Skin picker — themes are pure token swaps, safe to change mid-game. */
export function ThemeSwitcher() {
  const [theme, setTheme] = useState<ThemeId>(currentTheme());
  return (
    <label className="flex items-center gap-1.5 text-xs text-(--color-ivory)/60">
      <span className="max-sm:sr-only">Skin</span>
      <select
        aria-label="Skin"
        value={theme}
        onChange={(e) => {
          const next = e.target.value as ThemeId;
          applyTheme(next);
          setTheme(next);
        }}
        className="cursor-pointer rounded-lg border border-white/15 bg-(--color-felt-800) px-2 py-1.5 text-xs text-(--color-ivory)"
      >
        {THEMES.map((t) => (
          <option key={t.id} value={t.id}>
            {t.label}
          </option>
        ))}
      </select>
    </label>
  );
}
