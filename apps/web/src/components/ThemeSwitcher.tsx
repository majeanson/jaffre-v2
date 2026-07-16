import { useState } from 'react';
import { applyTheme, currentTheme, THEMES, type ThemeId } from '../theme.js';

/** Skin picker — themes are pure token swaps, safe to change mid-game. */
export function ThemeSwitcher() {
  const [theme, setTheme] = useState<ThemeId>(currentTheme());
  return (
    <label className="flex items-center gap-1.5 text-xs text-(--color-ivory)/70">
      <span className="max-sm:sr-only">Skin</span>
      {/* appearance-none so the select honors our background-color: the native
          widget paints a system bg that axe samples (mis-flagging the ivory
          text over the felt gradient). A custom caret replaces the native one. */}
      <span className="relative inline-flex items-center">
        <select
          aria-label="Skin"
          value={theme}
          onChange={(e) => {
            const next = e.target.value as ThemeId;
            applyTheme(next);
            setTheme(next);
          }}
          className="cursor-pointer appearance-none rounded-lg border border-white/15 bg-(--color-felt-800) py-1.5 pr-6 pl-2 text-xs text-(--color-ivory)"
        >
          {THEMES.map((t) => (
            <option key={t.id} value={t.id}>
              {t.label}
            </option>
          ))}
        </select>
        <span
          aria-hidden
          className="pointer-events-none absolute right-2 text-[8px] text-(--color-ivory)/60"
        >
          ▼
        </span>
      </span>
    </label>
  );
}
